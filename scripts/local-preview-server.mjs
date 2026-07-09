import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.LOCAL_PREVIEW_HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.LOCAL_PREVIEW_PORT || 8788);
const users = new Map([
  ['a691466166', { id: 1, username: 'a691466166', password: process.env.LOCAL_PREVIEW_ADMIN_PASS || '778839', role: 'admin' }]
]);
const sessions = new Map();

function send(res, status, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
  res.writeHead(status, { 'Content-Length': buffer.length, ...headers });
  res.end(buffer);
}
function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index > -1) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return out;
}
function tokenFor(user) {
  const token = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessions.set(token, { id: user.id, username: user.username, role: user.role });
  return token;
}
function currentUser(req) {
  const token = req.headers['x-gpt-image-session'] || parseCookies(req).session;
  return sessions.get(String(token || '')) || null;
}
function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
}
function safeFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(root, cleanPath);
  if (!target.startsWith(root)) return null;
  return target;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const username = String(body.username || '').trim();
    const user = users.get(username);
    if (!user || String(body.password || '') !== user.password) return json(res, 401, { error: 'Login failed' });
    const token = tokenFor(user);
    return json(res, 200, { success: true, token, username: user.username, role: user.role }, { 'Set-Cookie': `session=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=86400` });
  }
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    if (process.env.DISABLE_PUBLIC_REGISTRATION === 'true' || process.env.ALLOW_PUBLIC_REGISTRATION === 'false') return json(res, 403, { error: 'Registration is disabled' });
    const body = JSON.parse(await readBody(req) || '{}');
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();
    if (username.length < 2) return json(res, 400, { error: 'Username must be at least 2 characters' });
    if (password.length < 4) return json(res, 400, { error: 'Password must be at least 4 characters' });
    if (users.has(username)) return json(res, 409, { error: 'Username already exists' });
    const user = { id: users.size + 1, username, password, role: 'user' };
    users.set(username, user);
    const token = tokenFor(user);
    return json(res, 201, { success: true, token, username, role: user.role }, { 'Set-Cookie': `session=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=86400` });
  }
  if (url.pathname === '/api/auth/me') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, { success: true, user });
  }
  if (url.pathname === '/api/auth/logout') {
    return json(res, 200, { success: true }, { 'Set-Cookie': 'session=; Path=/; Max-Age=0' });
  }
  if (url.pathname === '/api/prompts') {
    const mod = await import(pathToFileUrl(path.join(root, 'functions/api/prompts/index.js')));
    const ctx = {
      request: new Request(`http://${host}:${port}${url.pathname}${url.search}`),
      env: {
        ASSETS: {
          fetch(input) {
            const raw = input instanceof URL ? input.href : (typeof input === 'string' ? input : input.url);
            const assetUrl = new URL(raw);
            const file = safeFile(assetUrl.pathname);
            if (!file || !fs.existsSync(file)) return Promise.resolve(new Response('not found', { status: 404 }));
            return Promise.resolve(new Response(fs.readFileSync(file), { status: 200, headers: { 'Content-Type': contentType(file) } }));
          }
        }
      }
    };
    const apiRes = await mod.onRequest(ctx);
    return send(res, apiRes.status, Buffer.from(await apiRes.arrayBuffer()), Object.fromEntries(apiRes.headers.entries()));
  }
  if (url.pathname === '/api/settings/save') return json(res, 200, { success: true });
  if (url.pathname === '/api/models') return json(res, 200, { models: [] });
  if (url.pathname === '/api/ping') return json(res, 200, { ok: true, localPreview: true });
  return json(res, 404, { error: 'Not found' });
}
function pathToFileUrl(file) {
  return new URL(`file:///${file.replace(/\\/g, '/')}`).href;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    let file = safeFile(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (url.pathname === '/login') file = path.join(root, 'login.html');
      else if (url.pathname === '/prompts') file = path.join(root, 'prompts.html');
      else return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    send(res, 200, fs.readFileSync(file), { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
  } catch (error) {
    json(res, 500, { error: error?.message || 'local preview error' });
  }
});

server.listen(port, host, () => {
  console.log(`[local-preview-server] listening on http://${host}:${port}/`);
});

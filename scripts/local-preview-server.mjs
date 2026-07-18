import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  RequestBodyTooLargeError,
  readRequestBody,
  relayFetchResponse,
  requestBodyLimitBytes,
  sendStaticFile,
  staticAssetResponse
} from './local-preview-performance.mjs';
import {
  hashPassword,
  validateNewPassword,
  verifyPassword
} from '../functions/_lib/password.js';
import {
  checkLoginLimit,
  clearLoginFailures,
  consumeRegistrationAttempt,
  rateLimitHeaders,
  recordLoginFailure
} from '../functions/_lib/rate-limit.js';
import { maskSecrets, preserveSecretPlaceholders } from '../functions/_lib/settings-secrets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.LOCAL_PREVIEW_HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.LOCAL_PREVIEW_PORT || 8788);
const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const LOCAL_JWT_SECRET = process.env.JWT_SECRET || 'gpt-image2-local-preview-jwt-20260705';
const LOCAL_PUBLIC_REGISTRATION = String(process.env.ALLOW_PUBLIC_REGISTRATION ?? 'true').toLowerCase() === 'true';
const MAX_REQUEST_BODY_BYTES = requestBodyLimitBytes();
const d1Dir = path.join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const d1File = fs.readdirSync(d1Dir).find((name) => /^(?!metadata).*\.sqlite$/i.test(name));
if (!d1File) throw new Error(`No local D1 sqlite file found in ${d1Dir}`);
const db = new DatabaseSync(path.join(d1Dir, d1File));
const sessions = new Map();
const pageRoutes = new Map([
  ['/', 'index.html'],
  ['/login', 'login.html'],
  ['/admin', 'admin.html'],
  ['/prompts', 'prompts.html']
]);

function send(res, status, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
  res.writeHead(status, { 'Content-Length': buffer.length, ...headers });
  res.end(buffer);
}
function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}
function readBodyBuffer(req) {
  return readRequestBody(req, MAX_REQUEST_BODY_BYTES);
}
async function readBody(req) {
  return (await readBodyBuffer(req)).toString('utf8');
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
  sessions.set(token, {
    id: user.id,
    sessionVersion: Number(user.session_version || 1)
  });
  return token;
}
function currentUser(req) {
  const token = req.headers['x-gpt-image-session'] || parseCookies(req).session;
  const session = sessions.get(String(token || '')) || null;
  if (!session) return null;
  const user = loadUserById(session.id);
  if (!user || Number(user.session_version || 1) !== session.sessionVersion) {
    sessions.delete(String(token || ''));
    return null;
  }
  return user;
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
  let cleanPath = '';
  try {
    cleanPath = decodeURIComponent(String(urlPath || '').split('?')[0]).replace(/^\/+/, '') || 'index.html';
  } catch {
    return null;
  }
  const target = path.resolve(root, cleanPath);
  const relative = path.relative(root, target);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null;
  return target;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(Buffer.from(str, 'base64'));
}
async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}
async function signJwt(payload) {
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await importHmacKey(LOCAL_JWT_SECRET, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}
function loadUserByUsername(username) {
  if (!username) return null;
  return db.prepare('SELECT id, username, role, password_hash, session_version, last_login, last_ip, created_at, updated_at FROM users WHERE username = ?').get(String(username).trim()) || null;
}
function loadUserById(id) {
  return db.prepare('SELECT id, username, role, password_hash, session_version, last_login, last_ip, created_at, updated_at FROM users WHERE id = ?').get(Number(id)) || null;
}
function listUsers() {
  return db.prepare('SELECT id, username, role, session_version, last_login, last_ip, created_at, updated_at FROM users ORDER BY id ASC').all();
}
function loadSettingsForUser(userId) {
  const rows = db.prepare('SELECT key, value FROM user_settings WHERE user_id = ? ORDER BY key ASC').all(Number(userId));
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}
function writeSetting(userId, key, value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").run(Number(userId), String(key), serialized);
}
function clearSettingsForUser(userId) {
  db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(Number(userId));
}
function isProxyPlaceholder(value) {
  const text = String(value || '').trim();
  return text === 'cloudflare-proxy' || text === 'placeholder' || /^\*+MASKED\*+$/i.test(text) || /^\*+REDACTED\*+$/i.test(text);
}
function profileKey(profile) {
  return String(profile?.id || profile?.name || '').trim();
}
function preserveProfileSecrets(incomingProfiles, existingProfiles) {
  if (!Array.isArray(incomingProfiles)) return incomingProfiles;
  const oldMap = new Map((Array.isArray(existingProfiles) ? existingProfiles : []).map((profile) => [profileKey(profile), profile]));
  return incomingProfiles.map((profile) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return profile;
    const next = { ...profile };
    const old = oldMap.get(profileKey(profile));
    if (isProxyPlaceholder(next.apiKey)) next.apiKey = old && !isProxyPlaceholder(old.apiKey) ? (old.apiKey || '') : '';
    if (isProxyPlaceholder(next.nativeApiKey)) next.nativeApiKey = old && !isProxyPlaceholder(old.nativeApiKey) ? (old.nativeApiKey || '') : '';
    if (isProxyPlaceholder(next.googleNativeApiKey)) next.googleNativeApiKey = old && !isProxyPlaceholder(old.googleNativeApiKey) ? (old.googleNativeApiKey || '') : '';
    return next;
  });
}
function normalizeIncomingSettings(body) {
  const source = body && body.settings !== undefined ? body.settings : body;
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source)) return source.filter((item) => item && item.key).map((item) => ({ key: String(item.key), value: item.value }));
  return Object.keys(source).map((key) => ({ key, value: source[key] }));
}
function normalizeImageQuality(value, fallback = 'high') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized;
  if (normalized === 'hd') return 'high';
  if (normalized === 'standard') return 'medium';
  return ['auto', 'low', 'medium', 'high'].includes(fallback) ? fallback : 'high';
}
function sanitizeIncomingSetting(item, existingSettings) {
  if (!item || !item.key) return item;
  return {
    ...item,
    value: preserveSecretPlaceholders(item.value, existingSettings[item.key], item.key)
  };
}
function activeLocalProfile(settings) {
  const profiles = Array.isArray(settings?.profiles) && settings.profiles.length ? settings.profiles : [{
    id: 'default-openai',
    name: 'OpenAI',
    provider: 'openai',
    baseUrl: settings?.baseUrl || '',
    apiKey: settings?.apiKey || '',
    model: settings?.model || 'gpt-image-2',
    timeout: settings?.timeout || 600,
    apiMode: settings?.apiMode || 'images',
    apiProxy: settings?.apiProxy !== false,
    responseFormatB64Json: !!settings?.responseFormatB64Json,
    streamImages: !!settings?.streamImages,
    streamPartialImages: settings?.streamPartialImages ?? 1
  }];
  const activeId = settings?.activeImageProfileId || settings?.activeProfileId || profiles[0]?.id || 'default-openai';
  return profiles.find((profile) => profile && (profile.id === activeId || profile.name === activeId)) || profiles[0];
}
function localRuntimeConfig(user) {
  const settings = loadSettingsForUser(user.id);
  const active = activeLocalProfile(settings);
  const useProxy = !!active?.apiKey || active?.apiProxy !== false;
  const config = {
    userId: user.id,
    username: user.username,
    defaultApiUrl: active?.baseUrl || settings.baseUrl || '',
    defaultModel: active?.model || settings.model || 'gpt-image-2',
    apiKey: active?.apiKey ? 'cloudflare-proxy' : '',
    apiMode: active?.apiMode || settings.apiMode || 'images',
    timeout: active?.timeout ?? settings.timeout ?? 600,
    apiProxy: useProxy,
    codexCli: !!(active?.codexCli ?? settings.codexCli),
    responseFormatB64Json: !!(active?.responseFormatB64Json ?? settings.responseFormatB64Json),
    streamImages: !!(active?.streamImages ?? settings.streamImages),
    streamPartialImages: active?.streamPartialImages ?? settings.streamPartialImages ?? 1,
    size: settings.size || '',
    quality: normalizeImageQuality(settings.quality),
    output_format: settings.output_format || 'png',
    output_compression: settings.output_compression ?? null,
    moderation: settings.moderation || 'auto',
    n: Number(settings.n) || 1,
    transparent_output: !!settings.transparent_output,
    transparentOutput: !!settings.transparent_output,
    clearInputAfterSubmit: !!settings.clearInputAfterSubmit,
    persistInput: settings.persistInput !== false,
    persistInputOnRestart: settings.persistInputOnRestart ?? settings.persistInput ?? true,
    taskNotification: !!settings.taskNotification,
    taskCompletionNotification: !!(settings.taskCompletionNotification ?? settings.taskNotification),
    scrollAfterSubmit: !!settings.scrollAfterSubmit,
    alwaysShowRetry: settings.alwaysShowRetry !== false,
    alwaysShowRetryButton: settings.alwaysShowRetryButton ?? settings.alwaysShowRetry ?? true,
    reuseProfile: settings.reuseProfile !== false,
    reuseTaskApiProfileTemporarily: settings.reuseTaskApiProfileTemporarily ?? settings.reuseProfile ?? true,
    allowPromptRewrite: settings.allowPromptRewrite !== false,
    mathFormatting: settings.mathFormatting !== false,
    agentMathFormattingPrompt: settings.agentMathFormattingPrompt ?? settings.mathFormatting ?? true,
    refEditAction: settings.refEditAction || settings.referenceImageEditAction || 'ask',
    referenceImageEditAction: settings.referenceImageEditAction || settings.refEditAction || 'ask',
    enterSubmit: !!settings.enterSubmit,
    zipDownloadRoutes: Array.isArray(settings.zipDownloadRoutes) ? settings.zipDownloadRoutes : ['task-selection', 'favorite-collection-selection'],
    agentWebSearch: !!settings.agentWebSearch,
    agentReasoningEffort: settings.agentReasoningEffort || 'medium',
    agentMaxRounds: Number(settings.agentMaxRounds) || 15,
    agentMaxToolRounds: Number(settings.agentMaxToolRounds) || Number(settings.agentMaxRounds) || 15,
    agentScrollAfterSubmit: settings.agentScrollAfterSubmit !== false,
    agentScrollToBottomAfterSubmit: settings.agentScrollToBottomAfterSubmit ?? settings.agentScrollAfterSubmit ?? true,
    agentApiConfigMode: settings.agentApiConfigMode || 'off',
    agentTextProfileId: settings.agentTextProfileId || null,
    agentImageProfileId: settings.agentImageProfileId || null,
    themeMode: settings.themeMode || 'dark',
    customProviders: Array.isArray(settings.customProviders) ? settings.customProviders : [],
    profiles: Array.isArray(settings.profiles) && settings.profiles.length ? settings.profiles : [active],
    activeProfileId: settings.activeProfileId || active?.id || 'default-openai',
    activeImageProfileId: settings.activeImageProfileId || settings.activeProfileId || active?.id || 'default-openai'
  };
  return maskSecrets(config, '', 'cloudflare-proxy');
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || '').split(',')[0].trim() || 'unknown';
}
function userRecord(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || 'user',
    created_at: user.created_at || nowStamp(),
    updated_at: user.updated_at || user.created_at || nowStamp(),
    last_login: user.last_login || null,
    last_ip: user.last_ip || ''
  };
}
function nextUserId() {
  const row = db.prepare('SELECT COALESCE(MAX(id), 0) AS maxId FROM users').get();
  return Number(row?.maxId || 0) + 1;
}
function parseJsonBody(bodyText) {
  try {
    return JSON.parse(bodyText || '{}');
  } catch {
    return {};
  }
}
function decodeUsername(body) {
  if (body && body.usernameB64) {
    try {
      return Buffer.from(String(body.usernameB64), 'base64').toString('utf8').trim();
    } catch {}
  }
  return String(body?.username || '').trim();
}
function createAssetsBinding(baseUrl) {
  return {
    async fetch(input) {
      const raw = input instanceof URL ? input.href : (typeof input === 'string' ? input : input.url);
      const assetUrl = new URL(raw, baseUrl);
      const file = safeFile(assetUrl.pathname);
      if (!file || !fs.existsSync(file)) return new Response('not found', { status: 404 });
      try {
        return await staticAssetResponse(file, contentType(file));
      } catch {
        return new Response('not found', { status: 404 });
      }
    }
  };
}
function createD1Binding() {
  return {
    prepare(sql) {
      return {
        _sql: sql,
        _params: [],
        bind(...params) {
          this._params = params;
          return this;
        },
        async first() {
          return db.prepare(this._sql).get(...this._params) || null;
        },
        async all() {
          return { results: db.prepare(this._sql).all(...this._params) || [] };
        },
        async run() {
          const result = db.prepare(this._sql).run(...this._params);
          return {
            success: true,
            meta: {
              changes: Number(result.changes || 0),
              last_row_id: Number(result.lastInsertRowid || 0)
            }
          };
        }
      };
    }
  };
}
async function createFunctionRequest(req, url) {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  });
  const user = currentUser(req);
  if (user) {
    const jwt = await signJwt({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionVersion: Number(user.session_version || 1),
      exp: Math.floor(Date.now() / 1000) + 86400
    });
    headers.set('X-GPT-Image-Session', jwt);
    headers.set('Cookie', `session=${encodeURIComponent(jwt)}`);
  }
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await readBodyBuffer(req);
    init.duplex = 'half';
  }
  return new Request(url.toString(), init);
}
async function dispatchFunction(req, res, url, moduleRelativePath) {
  const mod = await import(pathToFileUrl(path.join(root, moduleRelativePath)));
  const exportName = `onRequest${req.method[0]}${req.method.slice(1).toLowerCase()}`;
  const handler = mod.onRequest || mod[exportName];
  if (typeof handler !== 'function') return json(res, 405, { error: 'Method not allowed' });
  const request = await createFunctionRequest(req, url);
  const ctx = {
    request,
    env: {
      JWT_SECRET: LOCAL_JWT_SECRET,
      ALLOW_INSECURE_JWT_FALLBACK: 'true',
      ALLOW_PUBLIC_REGISTRATION: LOCAL_PUBLIC_REGISTRATION ? 'true' : 'false',
      gpt_image2_db: createD1Binding(),
      ASSETS: createAssetsBinding(url.toString())
    },
    waitUntil() {}
  };
  const apiRes = await handler(ctx);
  return relayFetchResponse(req, res, apiRes);
}

async function handleApi(req, res, url) {
  if (url.pathname.startsWith('/api-proxy/')) {
    return dispatchFunction(req, res, url, 'functions/api-proxy/[[path]].js');
  }
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = parseJsonBody(await readBody(req));
    const username = decodeUsername(body);
    const rateIdentifiers = [`ip:${clientIp(req)}`, `account:${username.toLowerCase()}`];
    const currentLimits = await Promise.all(rateIdentifiers.map((identifier) => checkLoginLimit(createD1Binding(), identifier)));
    const blockedLimit = currentLimits.find((limit) => limit.limited);
    if (blockedLimit) return json(res, 429, { error: 'Too many login attempts. Try again later.' }, rateLimitHeaders(blockedLimit));
    const user = loadUserByUsername(username);
    const password = String(body.password || '').trim();
    const verification = user ? await verifyPassword(password, user.password_hash) : { valid: false, needsRehash: false };
    if (!verification.valid) {
      const failures = await Promise.all(rateIdentifiers.map((identifier) => recordLoginFailure(createD1Binding(), identifier)));
      const limited = failures.find((failure) => failure.limited);
      if (limited) return json(res, 429, { error: 'Too many login attempts. Try again later.' }, rateLimitHeaders(limited));
      return json(res, 401, { error: 'Login failed' });
    }
    if (verification.needsRehash) {
      db.prepare("UPDATE users SET password_hash = ?, last_login = datetime('now'), last_ip = ?, updated_at = datetime('now') WHERE id = ?")
        .run(await hashPassword(password), clientIp(req), user.id);
    } else {
      db.prepare("UPDATE users SET last_login = datetime('now'), last_ip = ?, updated_at = datetime('now') WHERE id = ?")
        .run(clientIp(req), user.id);
    }
    await clearLoginFailures(createD1Binding(), `account:${username.toLowerCase()}`);
    const token = tokenFor(user);
    return json(res, 200, { success: true, username: user.username, role: user.role }, { 'Set-Cookie': `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400` });
  }
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    if (!LOCAL_PUBLIC_REGISTRATION) return json(res, 403, { error: 'Registration is disabled' });
    const registrationLimit = await consumeRegistrationAttempt(createD1Binding(), clientIp(req));
    if (registrationLimit.limited) return json(res, 429, { error: 'Too many registration attempts. Try again later.' }, rateLimitHeaders(registrationLimit));
    const body = parseJsonBody(await readBody(req));
    const username = decodeUsername(body);
    const password = String(body.password || '').trim();
    if (username.length < 2) return json(res, 400, { error: 'Username must be at least 2 characters' });
    const passwordError = validateNewPassword(password);
    if (passwordError) return json(res, 400, { error: passwordError });
    if (loadUserByUsername(username)) return json(res, 409, { error: 'Username already exists' });
    const id = nextUserId();
    db.prepare('INSERT INTO users (id, username, password_hash, role, last_login, last_ip, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), ?, datetime(\'now\'), datetime(\'now\'))').run(id, username, await hashPassword(password), 'user', clientIp(req));
    const created = loadUserById(id);
    const token = tokenFor(created);
    return json(res, 201, { success: true, username: created.username, role: created.role }, { 'Set-Cookie': `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400` });
  }
  if (url.pathname === '/api/auth/me') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, userRecord(user));
  }
  if (url.pathname === '/api/auth/logout') {
    const user = currentUser(req);
    if (user) {
      db.prepare("UPDATE users SET session_version = COALESCE(session_version, 1) + 1, updated_at = datetime('now') WHERE id = ?").run(user.id);
    }
    return json(res, 200, { success: true }, { 'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const list = user.role === 'admin'
      ? listUsers().map(userRecord)
      : [userRecord(user)];
    return json(res, 200, { users: list, currentUser: userRecord(user) });
  }
  if (url.pathname === '/api/admin/users' && req.method === 'POST') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'admin') return json(res, 403, { error: 'Forbidden' });
    const body = parseJsonBody(await readBody(req));
    const username = decodeUsername(body);
    const password = String(body.password || '').trim();
    const role = body.role === 'admin' ? 'admin' : 'user';
    if (username.length < 2) return json(res, 400, { error: 'Username must be at least 2 characters' });
    const passwordError = validateNewPassword(password);
    if (passwordError) return json(res, 400, { error: passwordError });
    if (loadUserByUsername(username)) return json(res, 409, { error: 'Username already exists' });
    db.prepare('INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))').run(nextUserId(), username, await hashPassword(password), role);
    return json(res, 201, { success: true });
  }
  const userIdMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userIdMatch && req.method === 'PUT') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    const targetId = Number(userIdMatch[1]);
    const target = loadUserById(targetId);
    if (!target) return json(res, 404, { error: 'User not found' });
    if (user.role !== 'admin' && user.id !== targetId) return json(res, 403, { error: 'Forbidden' });
    const body = parseJsonBody(await readBody(req));
    const username = body.username !== undefined || body.usernameB64 !== undefined ? decodeUsername(body) : target.username;
    const password = String(body.password || '').trim();
    if (username.length < 2) return json(res, 400, { error: 'Username must be at least 2 characters' });
    const duplicate = loadUserByUsername(username);
    if (duplicate && duplicate.id !== targetId) return json(res, 409, { error: 'Username already exists' });
    const updates = [];
    const params = [];
    if (body.username !== undefined || body.usernameB64 !== undefined) {
      updates.push('username = ?');
      params.push(username);
    }
    if (password) {
      const passwordError = validateNewPassword(password);
      if (passwordError) return json(res, 400, { error: passwordError });
      if (user.role !== 'admin') {
        const currentPassword = String(body.currentPassword || '').trim();
        if (!currentPassword) return json(res, 400, { error: 'Current password is required' });
        const verification = await verifyPassword(currentPassword, target.password_hash);
        if (!verification.valid) return json(res, 403, { error: 'Current password is incorrect' });
      }
      updates.push('password_hash = ?');
      params.push(await hashPassword(password));
      updates.push('session_version = session_version + 1');
    }
    if (user.role === 'admin' && body.role !== undefined) {
      updates.push('role = ?');
      params.push(body.role === 'admin' ? 'admin' : 'user');
      if (!updates.includes('session_version = session_version + 1')) {
        updates.push('session_version = session_version + 1');
      }
    }
    if (!updates.length) return json(res, 400, { error: 'No changes provided' });
    updates.push("updated_at = datetime('now')");
    params.push(targetId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    if (targetId === user.id && updates.includes('session_version = session_version + 1')) {
      const refreshed = loadUserById(targetId);
      const token = tokenFor(refreshed);
      return json(
        res,
        200,
        { success: true },
        { 'Set-Cookie': `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400` }
      );
    }
    return json(res, 200, { success: true });
  }
  if (userIdMatch && req.method === 'DELETE') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (user.role !== 'admin') return json(res, 403, { error: 'Forbidden' });
    const targetId = Number(userIdMatch[1]);
    if (targetId === user.id) return json(res, 400, { error: 'Cannot delete the current user' });
    const target = loadUserById(targetId);
    if (!target) return json(res, 404, { error: 'User not found' });
    clearSettingsForUser(targetId);
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    return json(res, 200, { success: true });
  }
  if (url.pathname === '/api/prompts') {
    return dispatchFunction(req, res, url, 'functions/api/prompts/index.js');
  }
  if (url.pathname === '/api/settings/save') {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });
    if (req.method === 'GET') return json(res, 200, { success: true, settings: maskSecrets(loadSettingsForUser(user.id)) });
    if (req.method === 'POST') {
      const body = parseJsonBody(await readBody(req));
      const existing = loadSettingsForUser(user.id);
      const items = normalizeIncomingSettings(body).map((item) => sanitizeIncomingSetting(item, existing));
      if (!items.length) return json(res, 400, { error: 'No settings provided' });
      for (const item of items) {
        if (!item.key || item.value === undefined) continue;
        writeSetting(user.id, item.key, item.value);
      }
      return json(res, 200, { success: true });
    }
    if (req.method === 'DELETE') {
      clearSettingsForUser(user.id);
      return json(res, 200, { success: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (url.pathname === '/api/models') return dispatchFunction(req, res, url, 'functions/api/models/index.js');
  if (url.pathname === '/api/settings/backup') return dispatchFunction(req, res, url, 'functions/api/settings/backup.js');
  if (url.pathname === '/api/pro-workbench/analyze') return dispatchFunction(req, res, url, 'functions/api/pro-workbench/analyze.js');
  if (url.pathname === '/api/pro-workbench/render') return dispatchFunction(req, res, url, 'functions/api/pro-workbench/render.js');
  if (url.pathname === '/api/ping') return json(res, 200, { ok: true, localPreview: true });
  return json(res, 404, { error: 'Not found' });
}
function pathToFileUrl(file) {
  return new URL(`file:///${file.replace(/\\/g, '/')}`).href;
}

const server = http.createServer(async (req, res) => {
  try {
    const declaredLength = Number(req.headers['content-length']);
    if (req.method !== 'GET' && req.method !== 'HEAD' && Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
      req.resume();
      return json(res, 413, {
        error: 'Request body too large',
        maxBytes: MAX_REQUEST_BODY_BYTES
      });
    }
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api-proxy/')) return await handleApi(req, res, url);
    if (url.pathname === '/.well-known/img-runtime-config.json') {
      const user = currentUser(req);
      if (!user) return json(res, 401, { error: 'Unauthorized' });
      return json(res, 200, localRuntimeConfig(user));
    }
    let file = safeFile(pageRoutes.get(url.pathname) ? `/${pageRoutes.get(url.pathname)}` : url.pathname);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const routeFile = pageRoutes.get(url.pathname);
      if (routeFile) file = path.join(root, routeFile);
      else return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    await sendStaticFile(req, res, file, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      if (!res.headersSent) {
        return json(res, 413, {
          error: 'Request body too large',
          maxBytes: error.limitBytes
        });
      }
      return;
    }
    if (res.headersSent || res.destroyed) return;
    json(res, 500, { error: error?.message || 'local preview error' });
  }
});

server.listen(port, host, () => {
  console.log(`[local-preview-server] listening on http://${host}:${port}/ (request body limit: ${MAX_REQUEST_BODY_BYTES} bytes)`);
});

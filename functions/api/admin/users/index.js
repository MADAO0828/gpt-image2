const JWT_FALLBACK = 'gpt-image2-jwt-secret-key-2026-secure';
const PASSWORD_SALT = 'gpt-image2-auth-salt-2026';

function secret(env) { return env && env.JWT_SECRET ? env.JWT_SECRET : JWT_FALLBACK; }
function b64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function getCookie(header, name) { const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
async function importHmacKey(value, usages) { return crypto.subtle.importKey('raw', new TextEncoder().encode(value), { name: 'HMAC', hash: 'SHA-256' }, false, usages); }
async function signToken(payload, env) { const enc = new TextEncoder(); const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))); const body = b64url(enc.encode(JSON.stringify(payload))); const key = await importHmacKey(secret(env), ['sign']); const sig = await crypto.subtle.sign('HMAC', key, enc.encode(head + '.' + body)); return head + '.' + body + '.' + b64url(sig); }
async function verifyToken(token, env) { const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('invalid token'); const key = await importHmacKey(secret(env), ['verify']); const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])); if (!ok) throw new Error('bad signature'); const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired'); return payload; }
function getRequestToken(request) {
  const cookieToken = getCookie(request.headers.get('Cookie') || '', 'session');
  if (cookieToken) return cookieToken;
  const headerToken = String(request.headers.get('X-GPT-Image-Session') || '').trim();
  return headerToken || null;
}
async function currentUser(request, env) { const token = getRequestToken(request); if (!token) return null; try { const payload = await verifyToken(token, env); return await env.gpt_image2_db.prepare('SELECT id, username, role, last_login, last_ip, created_at FROM users WHERE id = ?').bind(payload.userId).first(); } catch (e) { return null; } }
async function passwordHash(password) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password + ':' + PASSWORD_SALT)); return b64url(hash); }
function json(data, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0', ...extraHeaders } }); }
function clientIp(request) { return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || ''; }
function decodeUsername(body) {
  if (body && body.usernameB64) {
    try {
      const raw = atob(String(body.usernameB64).replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes).trim();
    } catch (e) {}
  }
  return String(body && body.username || '').trim();
}

export async function onRequestGet(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    if (user.role === 'admin') {
      const { results } = await ctx.env.gpt_image2_db.prepare('SELECT id, username, role, last_login, last_ip, created_at, updated_at FROM users ORDER BY id ASC').all();
      return json({ users: results || [], currentUser: user });
    }
    const self = await ctx.env.gpt_image2_db.prepare('SELECT id, username, role, last_login, last_ip, created_at, updated_at FROM users WHERE id = ?').bind(user.id).first();
    return json({ users: self ? [self] : [], currentUser: user });
  } catch (e) {
    return json({ error: e.message || 'Failed to load users' }, 500);
  }
}

export async function onRequestPost(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
  try {
    const body = await ctx.request.json();
    const username = decodeUsername(body);
    const password = String(body.password || '').trim();
    const role = body.role === 'admin' ? 'admin' : 'user';
    if (username.length < 2) return json({ error: 'Username must be at least 2 characters' }, 400);
    if (password.length < 4) return json({ error: 'Password must be at least 4 characters' }, 400);
    const exists = await ctx.env.gpt_image2_db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (exists) return json({ error: 'Username already exists' }, 409);
    await ctx.env.gpt_image2_db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').bind(username, await passwordHash(password), role).run();
    return json({ success: true }, 201);
  } catch (e) {
    return json({ error: 'Create failed: ' + (e.message || '') }, 400);
  }
}

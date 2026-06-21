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

export async function onRequestPost(ctx) {
  try {
    const body = await ctx.request.json();
    const username = decodeUsername(body);
    const password = String(body.password || '').trim();
    if (!username || !password) return json({ error: 'Username and password are required' }, 400);
    const hash = await passwordHash(password);
    const user = await ctx.env.gpt_image2_db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').bind(username).first();
    if (!user || user.password_hash !== hash) return json({ error: 'Invalid username or password' }, 401);
    const ip = clientIp(ctx.request);
    ctx.waitUntil(ctx.env.gpt_image2_db.prepare("UPDATE users SET last_login = datetime('now'), last_ip = ?, updated_at = datetime('now') WHERE id = ?").bind(ip, user.id).run());
    const token = await signToken({ userId: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 86400 }, ctx.env);
    return json({ success: true, userId: user.id, username: user.username, role: user.role, token }, 200, { 'Set-Cookie': 'session=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400' });
  } catch (e) {
    return json({ error: 'Login failed' }, 400);
  }
}

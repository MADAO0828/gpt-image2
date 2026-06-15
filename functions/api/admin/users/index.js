const SK = 'gpt-image2-jwt-secret-key-2026-secure';
const SL = 'gpt-image2-auth-salt-2026';

function bd(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function gc(h, n) {
  const m = h.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function gk() {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(SK), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
}
async function vt(t) {
  const [h, p, s] = t.split('.');
  if (!h || !p || !s) throw new Error('i');
  const k = await gk();
  if (!await crypto.subtle.verify('HMAC', k, bd(s), new TextEncoder().encode(h + '.' + p))) throw new Error('b');
  return JSON.parse(new TextDecoder().decode(bd(p)));
}
async function vs(r, env) {
  const t = gc(r.headers.get('Cookie') || '', 'session');
  if (!t) return null;
  try {
    const p = await vt(t);
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return await env.gpt_image2_db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(p.userId).first();
  } catch (e) { return null; }
}
function be(b) {
  return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hp(p) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p + ':' + SL));
  return be(h);
}

async function checkAdmin(ctx) {
  const u = await vs(ctx.request, ctx.env);
  if (!u || u.role !== 'admin') {
    return new Response(JSON.stringify({ error: '权限不足' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  ctx.data = { user: u };
  return null;
}

export async function onRequestGet(ctx) {
  const err = await checkAdmin(ctx);
  if (err) return err;
  const { results } = await ctx.env.gpt_image2_db.prepare('SELECT id, username, role, last_login, last_ip, created_at, updated_at FROM users ORDER BY id ASC').all();
  return new Response(JSON.stringify({ users: results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost(ctx) {
  const err = await checkAdmin(ctx);
  if (err) return err;
  try {
    const text = await ctx.request.text();
    const { username, password, role } = JSON.parse(text);
    if (!username || !username.trim()) return new Response(JSON.stringify({ error: '用户名不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    if (!password || !password.trim()) return new Response(JSON.stringify({ error: '密码不能为空' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    if (!role || !['admin', 'user'].includes(role)) return new Response(JSON.stringify({ error: '角色无效' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const ex = await ctx.env.gpt_image2_db.prepare('SELECT id FROM users WHERE username = ?').bind(username.trim()).first();
    if (ex) return new Response(JSON.stringify({ error: '用户名已存在' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    await ctx.env.gpt_image2_db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').bind(username.trim(), await hp(password.trim()), role).run();
    return new Response(JSON.stringify({ success: true, message: '用户创建成功' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}

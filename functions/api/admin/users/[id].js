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

export async function onRequestPut(ctx) {
  const err = await checkAdmin(ctx);
  if (err) return err;
  const uid = parseInt(ctx.params.id);
  if (!uid || uid < 1) return new Response(JSON.stringify({ error: '无效的用户ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  try {
    const text = await ctx.request.text();
    const { username, password, role } = JSON.parse(text);
    const ex = await ctx.env.gpt_image2_db.prepare('SELECT id FROM users WHERE id = ?').bind(uid).first();
    if (!ex) return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const up = [], pr = [];
    if (username !== undefined && username.trim()) {
      const d = await ctx.env.gpt_image2_db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username.trim(), uid).first();
      if (d) return new Response(JSON.stringify({ error: '用户名已存在' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      up.push('username = ?'); pr.push(username.trim());
    }
    if (password !== undefined && password.trim()) {
      up.push('password_hash = ?'); pr.push(await hp(password.trim()));
    }
    if (role !== undefined && ['admin', 'user'].includes(role)) {
      up.push('role = ?'); pr.push(role);
    }
    if (up.length === 0) return new Response(JSON.stringify({ error: '没有需要更新的字段' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    up.push("updated_at = datetime('now')"); pr.push(uid);
    await ctx.env.gpt_image2_db.prepare('UPDATE users SET ' + up.join(', ') + ' WHERE id = ?').bind(...pr).run();
    return new Response(JSON.stringify({ success: true, message: '用户更新成功' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: '请求格式错误' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestDelete(ctx) {
  const err = await checkAdmin(ctx);
  if (err) return err;
  const uid = parseInt(ctx.params.id);
  if (!uid || uid < 1) return new Response(JSON.stringify({ error: '无效的用户ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (uid === ctx.data.user.id) return new Response(JSON.stringify({ error: '不能删除自己的账号' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const ex = await ctx.env.gpt_image2_db.prepare('SELECT id FROM users WHERE id = ?').bind(uid).first();
  if (!ex) return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  await ctx.env.gpt_image2_db.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
  return new Response(JSON.stringify({ success: true, message: '用户已删除' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

import { currentUser, decodeUsername, json } from '../../../_lib/auth.js';
import { hashPassword, validateNewPassword } from '../../../_lib/password.js';

export async function onRequestGet(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    if (user.role === 'admin') {
      const { results } = await ctx.env.gpt_image2_db
        .prepare('SELECT id, username, role, last_login, last_ip, created_at, updated_at FROM users ORDER BY id ASC')
        .all();
      return json({ users: results || [], currentUser: user });
    }
    const self = await ctx.env.gpt_image2_db
      .prepare('SELECT id, username, role, last_login, last_ip, created_at, updated_at FROM users WHERE id = ?')
      .bind(user.id)
      .first();
    return json({ users: self ? [self] : [], currentUser: user });
  } catch (error) {
    return json({ error: error.message || 'Failed to load users' }, 500);
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
    const passwordError = validateNewPassword(password);
    if (passwordError) return json({ error: passwordError }, 400);
    const exists = await ctx.env.gpt_image2_db
      .prepare('SELECT id FROM users WHERE username = ?')
      .bind(username)
      .first();
    if (exists) return json({ error: 'Username already exists' }, 409);
    await ctx.env.gpt_image2_db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .bind(username, await hashPassword(password), role)
      .run();
    return json({ success: true }, 201);
  } catch (error) {
    return json({ error: 'Create failed: ' + (error.message || '') }, 400);
  }
}

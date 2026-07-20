import { currentUser, decodeUsername, json, readJsonBody, signToken } from '../../../_lib/auth.js';
import { hashPassword, validateNewPassword, verifyPassword } from '../../../_lib/password.js';

function parseId(ctx) {
  return Number.parseInt(ctx.params.id, 10);
}

export async function onRequestPut(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const targetId = parseId(ctx);
  if (!targetId || targetId < 1) return json({ error: 'Invalid user id' }, 400);
  const isAdmin = user.role === 'admin';
  if (!isAdmin && targetId !== user.id) return json({ error: 'Forbidden' }, 403);
  try {
    const exists = await ctx.env.gpt_image2_db
      .prepare('SELECT id, role FROM users WHERE id = ?')
      .bind(targetId)
      .first();
    if (!exists) return json({ error: 'User not found' }, 404);
    const body = await readJsonBody(ctx.request, 16 * 1024);
    const updates = [];
    const params = [];
    let invalidateSessions = false;

    if (body.username !== undefined || body.usernameB64 !== undefined) {
      const username = decodeUsername(body);
      if (username.length < 2) return json({ error: 'Username must be at least 2 characters' }, 400);
      if (username.length > 128) return json({ error: 'Username is too long' }, 400);
      const duplicate = await ctx.env.gpt_image2_db
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .bind(username, targetId)
        .first();
      if (duplicate) return json({ error: 'Username already exists' }, 409);
      updates.push('username = ?');
      params.push(username);
    }
    if (body.password !== undefined && String(body.password || '').trim()) {
      const password = String(body.password || '').trim();
      if (password.length > 256) return json({ error: 'Password is too long' }, 400);
      const passwordError = validateNewPassword(password);
      if (passwordError) return json({ error: passwordError }, 400);
      if (!isAdmin) {
        const currentPassword = String(body.currentPassword || '').trim();
        if (currentPassword.length > 256) return json({ error: 'Current password is too long' }, 400);
        if (!currentPassword) return json({ error: 'Current password is required' }, 400);
        const credentials = await ctx.env.gpt_image2_db
          .prepare('SELECT password_hash FROM users WHERE id = ?')
          .bind(targetId)
          .first();
        const verification = credentials
          ? await verifyPassword(currentPassword, credentials.password_hash)
          : { valid: false };
        if (!verification.valid) return json({ error: 'Current password is incorrect' }, 403);
      }
      updates.push('password_hash = ?');
      params.push(await hashPassword(password));
      invalidateSessions = true;
    }
    if (isAdmin && body.role !== undefined) {
      updates.push('role = ?');
      params.push(body.role === 'admin' ? 'admin' : 'user');
      invalidateSessions = true;
    }
    if (!updates.length) return json({ error: 'No changes provided' }, 400);

    if (invalidateSessions) updates.push('session_version = session_version + 1');
    updates.push("updated_at = datetime('now')");
    params.push(targetId);
    await ctx.env.gpt_image2_db
      .prepare('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?')
      .bind(...params)
      .run();
    if (!invalidateSessions || targetId !== user.id) return json({ success: true });

    const token = await signToken({
      userId: user.id,
      username: body.username === undefined && body.usernameB64 === undefined
        ? user.username
        : decodeUsername(body),
      role: isAdmin && body.role !== undefined ? (body.role === 'admin' ? 'admin' : 'user') : user.role,
      sessionVersion: Number(user.session_version) + 1,
      exp: Math.floor(Date.now() / 1000) + 86400
    }, ctx.env, ctx.request);
    return json(
      { success: true },
      200,
      { 'Set-Cookie': 'session=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400' }
    );
  } catch (error) {
    return json({ error: error.message || 'Update failed' }, error?.status === 413 ? 413 : 400);
  }
}

export async function onRequestDelete(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
  const targetId = parseId(ctx);
  if (!targetId || targetId < 1) return json({ error: 'Invalid user id' }, 400);
  if (targetId === user.id) return json({ error: 'Cannot delete the current user' }, 400);
  const exists = await ctx.env.gpt_image2_db
    .prepare('SELECT id FROM users WHERE id = ?')
    .bind(targetId)
    .first();
  if (!exists) return json({ error: 'User not found' }, 404);
  await ctx.env.gpt_image2_db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(targetId).run();
  await ctx.env.gpt_image2_db.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
  return json({ success: true });
}

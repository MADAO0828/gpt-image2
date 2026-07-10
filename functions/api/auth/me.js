import { currentUser, decodeUsername, json, signToken } from '../../_lib/auth.js';
import { hashPassword, validateNewPassword, verifyPassword } from '../../_lib/password.js';

export async function onRequestGet(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json(user);
}

export async function onRequestPatch(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await ctx.request.json();
    const username = body.username === undefined && body.usernameB64 === undefined
      ? undefined
      : decodeUsername(body);
    const password = body.password === undefined ? undefined : String(body.password || '').trim();
    const updates = [];
    const params = [];
    let sessionVersionChanged = false;

    if (username !== undefined) {
      if (username.length < 2) return json({ error: 'Username must be at least 2 characters' }, 400);
      const exists = await ctx.env.gpt_image2_db
        .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .bind(username, user.id)
        .first();
      if (exists) return json({ error: 'Username already exists' }, 409);
      updates.push('username = ?');
      params.push(username);
    }
    if (password !== undefined && password) {
      const passwordError = validateNewPassword(password);
      if (passwordError) return json({ error: passwordError }, 400);
      const currentPassword = String(body.currentPassword || '').trim();
      if (!currentPassword) return json({ error: 'Current password is required' }, 400);
      const credentials = await ctx.env.gpt_image2_db
        .prepare('SELECT password_hash FROM users WHERE id = ?')
        .bind(user.id)
        .first();
      const currentVerification = credentials
        ? await verifyPassword(currentPassword, credentials.password_hash)
        : { valid: false };
      if (!currentVerification.valid) return json({ error: 'Current password is incorrect' }, 403);
      updates.push('password_hash = ?');
      params.push(await hashPassword(password));
      updates.push('session_version = session_version + 1');
      sessionVersionChanged = true;
    }
    if (!updates.length) return json({ error: 'No changes provided' }, 400);

    updates.push("updated_at = datetime('now')");
    params.push(user.id);
    await ctx.env.gpt_image2_db
      .prepare('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?')
      .bind(...params)
      .run();
    if (!sessionVersionChanged) return json({ success: true });

    const nextSessionVersion = Number(user.session_version) + 1;
    const token = await signToken({
      userId: user.id,
      username: username === undefined ? user.username : username,
      role: user.role,
      sessionVersion: nextSessionVersion,
      exp: Math.floor(Date.now() / 1000) + 86400
    }, ctx.env, ctx.request);
    return json(
      { success: true },
      200,
      { 'Set-Cookie': 'session=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400' }
    );
  } catch (error) {
    return json({ error: 'Update failed' }, 400);
  }
}

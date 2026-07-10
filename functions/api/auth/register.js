import { clientIp, decodeUsername, json, signToken } from '../../_lib/auth.js';
import { hashPassword, validateNewPassword } from '../../_lib/password.js';
import { consumeRegistrationAttempt, rateLimitHeaders } from '../../_lib/rate-limit.js';

function publicRegistrationEnabled(env) {
  return String(env?.ALLOW_PUBLIC_REGISTRATION || '').toLowerCase() === 'true';
}

export async function onRequestPost(ctx) {
  try {
    if (!publicRegistrationEnabled(ctx.env)) {
      return json({ error: 'Registration is disabled' }, 403);
    }
    const registrationLimit = await consumeRegistrationAttempt(
      ctx.env.gpt_image2_db,
      clientIp(ctx.request)
    );
    if (registrationLimit.limited) {
      return json(
        { error: 'Too many registration attempts. Try again later.' },
        429,
        rateLimitHeaders(registrationLimit)
      );
    }
    const body = await ctx.request.json();
    const username = decodeUsername(body);
    const password = String(body.password || '').trim();
    if (!username || username.length < 2) return json({ error: 'Username must be at least 2 characters' }, 400);
    const passwordError = validateNewPassword(password);
    if (passwordError) return json({ error: passwordError }, 400);

    const exists = await ctx.env.gpt_image2_db
      .prepare('SELECT id FROM users WHERE username = ?')
      .bind(username)
      .first();
    if (exists) return json({ error: 'Username already exists' }, 409);

    await ctx.env.gpt_image2_db
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .bind(username, await hashPassword(password), 'user')
      .run();
    const user = await ctx.env.gpt_image2_db
      .prepare('SELECT id, username, role, session_version FROM users WHERE username = ?')
      .bind(username)
      .first();
    const ip = clientIp(ctx.request);
    ctx.waitUntil(ctx.env.gpt_image2_db
      .prepare("UPDATE users SET last_login = datetime('now'), last_ip = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(ip, user.id)
      .run());
    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionVersion: Number(user.session_version),
      exp: Math.floor(Date.now() / 1000) + 86400
    }, ctx.env, ctx.request);
    return json(
      { success: true, userId: user.id, username: user.username, role: user.role },
      201,
      { 'Set-Cookie': 'session=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400' }
    );
  } catch (error) {
    return json({ error: 'Registration unavailable until security migrations are applied' }, 503);
  }
}

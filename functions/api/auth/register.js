import { clientIp, decodeUsername, json, signToken } from '../../_lib/auth.js';
import { hashPassword, validateNewPassword } from '../../_lib/password.js';
import { consumeRegistrationAttempt, rateLimitHeaders } from '../../_lib/rate-limit.js';

function publicRegistrationEnabled(env) {
  return String(env?.ALLOW_PUBLIC_REGISTRATION || '').toLowerCase() === 'true';
}

const MAX_REGISTER_BODY_BYTES = 8 * 1024;
const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;

async function readRegistrationBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_REGISTER_BODY_BYTES) throw Object.assign(new Error('Registration request body is too large'), { status: 400 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REGISTER_BODY_BYTES) throw Object.assign(new Error('Registration request body is too large'), { status: 400 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Invalid registration JSON'), { status: 400 }); }
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
    const body = await readRegistrationBody(ctx.request);
    const username = decodeUsername(body);
    const password = String(body.password || '').trim();
    if (!username || username.length < 2) return json({ error: 'Username must be at least 2 characters' }, 400);
    if (username.length > MAX_USERNAME_LENGTH) return json({ error: 'Username is too long' }, 400);
    if (password.length > MAX_PASSWORD_LENGTH) return json({ error: 'Password is too long' }, 400);
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
    if (error?.status === 400) return json({ error: error.message }, 400);
    return json({ error: 'Registration unavailable until security migrations are applied' }, 503);
  }
}

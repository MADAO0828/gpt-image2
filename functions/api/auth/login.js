import { clientIp, decodeUsername, json, signToken } from '../../_lib/auth.js';
import { hashPassword, verifyPassword } from '../../_lib/password.js';
import {
  checkLoginLimit,
  clearLoginFailures,
  rateLimitHeaders,
  recordLoginFailure
} from '../../_lib/rate-limit.js';

export async function onRequestPost(ctx) {
  try {
    const body = await ctx.request.json();
    const username = decodeUsername(body);
    const password = String(body.password || '').trim();
    const ip = clientIp(ctx.request);
    const rateIdentifiers = [`ip:${ip}`, `account:${username.toLowerCase()}`];
    const currentLimits = await Promise.all(rateIdentifiers.map(identifier => checkLoginLimit(ctx.env.gpt_image2_db, identifier)));
    const blockedLimit = currentLimits.find(limit => limit.limited);
    if (blockedLimit) {
      return json({ error: 'Too many login attempts. Try again later.' }, 429, rateLimitHeaders(blockedLimit));
    }
    if (!username || !password) {
      const failures = await Promise.all(rateIdentifiers.map(identifier => recordLoginFailure(ctx.env.gpt_image2_db, identifier)));
      const limited = failures.find(failure => failure.limited);
      if (limited) {
        return json({ error: 'Too many login attempts. Try again later.' }, 429, rateLimitHeaders(limited));
      }
      return json({ error: 'Username and password are required' }, 400);
    }

    const user = await ctx.env.gpt_image2_db
      .prepare('SELECT id, username, password_hash, role, session_version FROM users WHERE username = ?')
      .bind(username)
      .first();
    const verification = user
      ? await verifyPassword(password, user.password_hash)
      : { valid: false, needsRehash: false };
    if (!verification.valid) {
      const failures = await Promise.all(rateIdentifiers.map(identifier => recordLoginFailure(ctx.env.gpt_image2_db, identifier)));
      const limited = failures.find(failure => failure.limited);
      if (limited) {
        return json({ error: 'Too many login attempts. Try again later.' }, 429, rateLimitHeaders(limited));
      }
      return json({ error: 'Invalid username or password' }, 401);
    }

    if (verification.needsRehash) {
      const migratedHash = await hashPassword(password);
      await ctx.env.gpt_image2_db
        .prepare("UPDATE users SET password_hash = ?, last_login = datetime('now'), last_ip = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(migratedHash, ip, user.id)
        .run();
    } else {
      ctx.waitUntil(ctx.env.gpt_image2_db
        .prepare("UPDATE users SET last_login = datetime('now'), last_ip = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(ip, user.id)
        .run());
    }
    await clearLoginFailures(ctx.env.gpt_image2_db, `account:${username.toLowerCase()}`);

    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionVersion: Number(user.session_version),
      exp: Math.floor(Date.now() / 1000) + 86400
    }, ctx.env, ctx.request);
    return json(
      { success: true, userId: user.id, username: user.username, role: user.role },
      200,
      { 'Set-Cookie': 'session=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400' }
    );
  } catch (error) {
    return json({ error: 'Login unavailable until security migrations are applied' }, 503);
  }
}

const LOGIN_POLICY = Object.freeze({
  action: 'login',
  limit: 5,
  windowSeconds: 15 * 60,
  blockSeconds: 15 * 60
});

const REGISTER_POLICY = Object.freeze({
  action: 'register',
  limit: 5,
  windowSeconds: 60 * 60,
  blockSeconds: 60 * 60
});

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function rateKey(action, identifier) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(action + ':' + String(identifier || 'unknown'))
  );
  return action + ':' + b64url(digest);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function retryAfter(row, now) {
  return Math.max(1, Number(row?.blocked_until || 0) - now);
}

async function loadRow(db, key) {
  return db.prepare(
    'SELECT rate_key, action, attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE rate_key = ?'
  ).bind(key).first();
}

async function recordAttempt(db, policy, identifier, blockWhenReached) {
  const key = await rateKey(policy.action, identifier);
  const now = nowSeconds();
  const thresholdOperator = blockWhenReached ? '>=' : '>';
  await db.prepare(`
    INSERT INTO auth_rate_limits (rate_key, action, attempts, window_started_at, blocked_until, updated_at)
    VALUES (?, ?, 1, ?, 0, datetime('now'))
    ON CONFLICT(rate_key) DO UPDATE SET
      action = excluded.action,
      attempts = CASE
        WHEN auth_rate_limits.blocked_until > ? THEN auth_rate_limits.attempts
        WHEN ? - auth_rate_limits.window_started_at >= ${policy.windowSeconds} THEN 1
        ELSE auth_rate_limits.attempts + 1
      END,
      window_started_at = CASE
        WHEN auth_rate_limits.blocked_until <= ? AND ? - auth_rate_limits.window_started_at >= ${policy.windowSeconds} THEN ?
        ELSE auth_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN auth_rate_limits.blocked_until > ? THEN auth_rate_limits.blocked_until
        WHEN ? - auth_rate_limits.window_started_at >= ${policy.windowSeconds} THEN 0
        WHEN auth_rate_limits.attempts + 1 ${thresholdOperator} ${policy.limit} THEN ? + ${policy.blockSeconds}
        ELSE 0
      END,
      updated_at = datetime('now')
  `).bind(key, policy.action, now, now, now, now, now, now, now, now, now).run();
  await db.prepare(
    "DELETE FROM auth_rate_limits WHERE updated_at < datetime('now', '-2 days') AND blocked_until <= ?"
  ).bind(now).run();
  const row = await loadRow(db, key);
  return {
    key,
    now,
    row,
    limited: Number(row?.blocked_until || 0) > now,
    retryAfter: Number(row?.blocked_until || 0) > now ? retryAfter(row, now) : 0
  };
}

async function stateFor(db, policy, identifier) {
  const key = await rateKey(policy.action, identifier);
  const now = nowSeconds();
  const row = await loadRow(db, key);
  if (row && Number(row.blocked_until || 0) > now) {
    return { key, now, row, limited: true, retryAfter: retryAfter(row, now) };
  }
  if (!row || now - Number(row.window_started_at || 0) >= policy.windowSeconds) {
    return {
      key,
      now,
      row: {
        rate_key: key,
        action: policy.action,
        attempts: 0,
        window_started_at: now,
        blocked_until: 0
      },
      limited: false,
      retryAfter: 0
    };
  }
  return { key, now, row, limited: false, retryAfter: 0 };
}

export async function checkLoginLimit(db, identifier) {
  return stateFor(db, LOGIN_POLICY, identifier);
}

export async function recordLoginFailure(db, identifier) {
  const state = await stateFor(db, LOGIN_POLICY, identifier);
  if (state.limited) return state;
  return recordAttempt(db, LOGIN_POLICY, identifier, true);
}

export async function clearLoginFailures(db, identifier) {
  const key = await rateKey(LOGIN_POLICY.action, identifier);
  await db.prepare('DELETE FROM auth_rate_limits WHERE rate_key = ?').bind(key).run();
}

export async function consumeRegistrationAttempt(db, identifier) {
  const state = await stateFor(db, REGISTER_POLICY, identifier);
  if (state.limited) return state;
  return recordAttempt(db, REGISTER_POLICY, identifier, false);
}

export function rateLimitHeaders(state) {
  return {
    'Retry-After': String(Math.max(1, Number(state?.retryAfter || 1))),
    'X-RateLimit-Reset': String(nowSeconds() + Math.max(1, Number(state?.retryAfter || 1)))
  };
}

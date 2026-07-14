import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function importWorkerModule(relativePath, exportNames = []) {
  const dir = await mkdtemp(join(tmpdir(), 'gpt-image2-test-'));
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const sourceFile = join(projectRoot, relativePath);
  const targetFile = join(dir, relativePath);
  await mkdir(dirname(targetFile), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  await cp(sourceFile, targetFile);
  await cp(join(projectRoot, 'functions', '_lib'), join(dir, 'functions', '_lib'), { recursive: true });
  try { return await import(pathToFileURL(targetFile).href + '?test=' + Date.now()); }
  finally { setTimeout(() => rm(dir, { recursive: true, force: true }), 1000); }
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signToken(payload, secret = 'gpt-image2-jwt-secret-key-2026-secure') {
  if (payload?.userId && !Object.prototype.hasOwnProperty.call(payload, 'sessionVersion')) {
    payload = { ...payload, sessionVersion: 1 };
  }
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64url(new Uint8Array(sig));
}

function makeDb({ users = [], settings = {}, rateLimits = {} } = {}) {
  users.forEach(user => {
    if (user.session_version === undefined) user.session_version = 1;
  });
  const writes = [];
  const rateRows = new Map(Object.entries(rateLimits));
  const db = {
    writes,
    rateRows,
    prepare(sql) {
      const bound = [];
      return {
        bind(...args) { bound.push(...args); return this; },
        async first() {
          if (/FROM auth_rate_limits WHERE rate_key = \?/i.test(sql)) {
            const row = rateRows.get(bound[0]);
            return row ? { ...row } : null;
          }
          if (/FROM users WHERE id = \?/i.test(sql)) return users.find(u => u.id === bound[0]) || null;
          if (/FROM users WHERE username = \?/i.test(sql)) return users.find(u => u.username === bound[0]) || null;
          return null;
        },
        async all() {
          if (/FROM user_settings WHERE user_id = \?/i.test(sql)) {
            const rows = settings[bound[0]] || [];
            return { results: rows.map(r => ({ ...r })) };
          }
          if (/FROM users/i.test(sql)) return { results: users.map(u => ({ ...u })) };
          return { results: [] };
        },
        async run() {
          writes.push({ sql, bound: [...bound] });
          if (/INSERT INTO auth_rate_limits/i.test(sql)) {
            if (/auth_rate_limits\.attempts \+ 1/i.test(sql)) {
              const now = Number(bound[2]);
              const existing = rateRows.get(bound[0]);
              const isLogin = bound[1] === 'login';
              const windowSeconds = isLogin ? 15 * 60 : 60 * 60;
              const blockSeconds = isLogin ? 15 * 60 : 60 * 60;
              const limit = 5;
              let attempts = 1;
              let windowStartedAt = now;
              let blockedUntil = 0;
              if (existing && Number(existing.blocked_until || 0) > now) {
                attempts = existing.attempts;
                windowStartedAt = existing.window_started_at;
                blockedUntil = existing.blocked_until;
              } else if (existing && now - Number(existing.window_started_at || 0) < windowSeconds) {
                attempts = Number(existing.attempts || 0) + 1;
                windowStartedAt = existing.window_started_at;
                const thresholdReached = isLogin ? attempts >= limit : attempts > limit;
                blockedUntil = thresholdReached ? now + blockSeconds : 0;
              }
              rateRows.set(bound[0], {
                rate_key: bound[0],
                action: bound[1],
                attempts,
                window_started_at: windowStartedAt,
                blocked_until: blockedUntil
              });
            } else {
              rateRows.set(bound[0], {
                rate_key: bound[0],
                action: bound[1],
                attempts: bound[2],
                window_started_at: bound[3],
                blocked_until: bound[4]
              });
            }
          }
          if (/DELETE FROM auth_rate_limits WHERE rate_key = \?/i.test(sql)) {
            rateRows.delete(bound[0]);
          }
          if (/UPDATE users SET password_hash = \?/i.test(sql)) {
            const user = users.find(item => item.id === bound[bound.length - 1]);
            if (user) user.password_hash = bound[0];
          }
          if (/session_version = session_version \+ 1/i.test(sql)) {
            const user = users.find(item => item.id === bound[bound.length - 1]);
            if (user) user.session_version += 1;
          }
          return { success: true };
        }
      };
    }
  };
  return db;
}

async function authedRequest(userId, body) {
  const token = await signToken({ userId, exp: Math.floor(Date.now() / 1000) + 60 });
  return new Request('https://localhost/api/settings/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
    body: JSON.stringify(body)
  });
}

function settingsRows(values) {
  return Object.entries(values).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updated_at: 'x'
  }));
}

async function proAnalyzeRequest(userId, extraHeaders = {}) {
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const form = new FormData();
  form.append('mode', 'ai');
  form.append('prompt', 'analyze this space');
  form.append('base[]', new Blob(['image-bytes'], { type: 'image/png' }), 'base.png');
  return new Request('https://prod.example/api/pro-workbench/analyze', {
    method: 'POST',
    headers: {
      'X-GPT-Image-Session': token,
      ...extraHeaders
    },
    body: form
  });
}

test('backup export masks current user API secrets and includes no plaintext key', async () => {
  const mod = await importWorkerModule('functions/api/settings/backup.js', ['onRequestGet']);
  const db = makeDb({
    users: [{ id: 7, username: 'alice', role: 'user', session_version: 1 }],
    settings: { 7: [
      { key: 'apiKey', value: JSON.stringify('sk-real-secret'), updated_at: '2026-06-23 01:00:00' },
      { key: 'profiles', value: JSON.stringify([{ id: 'p1', apiKey: 'sk-profile-secret', nativeApiKey: 'gemini-profile-secret', baseUrl: 'https://api.example/v1' }]), updated_at: '2026-06-23 01:00:00' }
    ] }
  });
  const token = await signToken({ userId: 7, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 });
  const res = await mod.onRequestGet({ request: new Request('https://local/api/settings/backup', { headers: { 'X-GPT-Image-Session': token } }), env: { gpt_image2_db: db, JWT_SECRET: 'gpt-image2-jwt-secret-key-2026-secure', ALLOW_SESSION_HEADER_AUTH: 'true' } });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /\*\*\*MASKED\*\*\*/);
  assert.doesNotMatch(text, /sk-real-secret|sk-profile-secret|gemini-profile-secret/);
});

test('admin backup export can include user summary but no password hashes or API keys', async () => {
  const mod = await importWorkerModule('functions/api/settings/backup.js', ['onRequestGet']);
  const db = makeDb({ users: [
    { id: 1, username: 'root', role: 'admin', password_hash: 'hash', last_login: 'x', session_version: 1 },
    { id: 2, username: 'bob', role: 'user', password_hash: 'hash2' }
  ], settings: { 1: [{ key: 'apiKey', value: JSON.stringify('sk-admin'), updated_at: 'x' }] } });
  const token = await signToken({ userId: 1, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 });
  const res = await mod.onRequestGet({ request: new Request('https://local/api/settings/backup?scope=users', { headers: { 'X-GPT-Image-Session': token } }), env: { gpt_image2_db: db, JWT_SECRET: 'gpt-image2-jwt-secret-key-2026-secure', ALLOW_SESSION_HEADER_AUTH: 'true' } });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /"users"/);
  assert.doesNotMatch(text, /password_hash|hash2|sk-admin/);
});

test('backup import rejects masked API keys instead of storing placeholders as secrets', async () => {
  const mod = await importWorkerModule('functions/api/settings/backup.js', ['onRequestPost']);
  const db = makeDb({ users: [{ id: 7, username: 'alice', role: 'user', session_version: 1 }], settings: { 7: [] } });
  const token = await signToken({ userId: 7, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 });
  const res = await mod.onRequestPost({ request: new Request('https://local/api/settings/backup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token }, body: JSON.stringify({ settings: { apiKey: '***MASKED***', model: 'gpt-image-2' } }) }), env: { gpt_image2_db: db, JWT_SECRET: 'gpt-image2-jwt-secret-key-2026-secure', ALLOW_SESSION_HEADER_AUTH: 'true' } });
  assert.equal(res.status, 200);
  assert.equal(db.writes.some(w => w.bound.includes('apiKey')), false);
});

test('settings save preserves existing secrets when placeholder strings are posted', async () => {
  const mod = await importWorkerModule('functions/api/settings/save.js', ['onRequestPost']);
  const db = makeDb({
    users: [{ id: 3, username: 'user', role: 'user' }],
    settings: { 3: [
      { key: 'apiKey', value: JSON.stringify('sk-existing'), updated_at: 'x' },
      { key: 'profiles', value: JSON.stringify([{ id: 'main', apiKey: 'sk-profile-existing', nativeApiKey: 'gemini-existing', googleNativeApiKey: 'google-native-existing' }]), updated_at: 'x' }
    ] }
  });
  const res = await mod.onRequestPost({ request: await authedRequest(3, { settings: { apiKey: 'placeholder', profiles: [{ id: 'main', apiKey: '***MASKED***', nativeApiKey: '***MASKED***', googleNativeApiKey: 'cloudflare-proxy' }] } }), env: { gpt_image2_db: db, JWT_SECRET: 'gpt-image2-jwt-secret-key-2026-secure' } });
  assert.equal(res.status, 200);
  const apiWrite = db.writes.find(w => w.bound[1] === 'apiKey');
  const profilesWrite = db.writes.find(w => w.bound[1] === 'profiles');
  assert.equal(apiWrite.bound[2], 'sk-existing');
  assert.equal(JSON.parse(profilesWrite.bound[2])[0].apiKey, 'sk-profile-existing');
  assert.equal(JSON.parse(profilesWrite.bound[2])[0].nativeApiKey, 'gemini-existing');
  assert.equal(JSON.parse(profilesWrite.bound[2])[0].googleNativeApiKey, 'google-native-existing');
});

test('public registration can be disabled explicitly', async () => {
  const mod = await importWorkerModule('functions/api/auth/register.js', ['onRequestPost']);
  const res = await mod.onRequestPost({
    request: new Request('https://prod.example/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'new-user', password: 'pass1234' })
    }),
    env: { gpt_image2_db: makeDb(), DISABLE_PUBLIC_REGISTRATION: 'true' }
  });
  assert.equal(res.status, 403);
});

test('public registration is fail-closed unless ALLOW_PUBLIC_REGISTRATION is true', async () => {
  const mod = await importWorkerModule('functions/api/auth/register.js', ['onRequestPost']);
  const request = new Request('https://prod.example/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'new-user', password: 'long-enough-password' })
  });
  const res = await mod.onRequestPost({ request, env: { gpt_image2_db: makeDb() } });
  assert.equal(res.status, 403);
});

test('new password hashing uses random per-user PBKDF2 salts', async () => {
  const mod = await importWorkerModule('functions/_lib/password.js');
  const first = await mod.hashPassword('correct horse battery staple');
  const second = await mod.hashPassword('correct horse battery staple');
  assert.match(first, /^pbkdf2-sha256\$100000\$[^$]+\$[^$]+$/);
  assert.match(second, /^pbkdf2-sha256\$100000\$[^$]+\$[^$]+$/);
  assert.notEqual(first, second);
  assert.equal((await mod.verifyPassword('correct horse battery staple', first)).valid, true);
  assert.equal((await mod.verifyPassword('wrong password', first)).valid, false);
});

test('legacy password login succeeds and migrates the stored hash to PBKDF2', async () => {
  const mod = await importWorkerModule('functions/api/auth/login.js', ['onRequestPost']);
  const legacyHash = b64url(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('legacy-password:gpt-image2-auth-salt-2026')
  ));
  const users = [{ id: 9, username: 'legacy-user', role: 'user', password_hash: legacyHash }];
  const db = makeDb({ users });
  const res = await mod.onRequestPost({
    request: new Request('https://prod.example/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'legacy-user', password: 'legacy-password' })
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' },
    waitUntil() {}
  });
  assert.equal(res.status, 200);
  const loginBody = await res.json();
  assert.equal(Object.prototype.hasOwnProperty.call(loginBody, 'token'), false);
  assert.match(res.headers.get('Set-Cookie') || '', /HttpOnly/i);
  assert.match(users[0].password_hash, /^pbkdf2-sha256\$100000\$/);
});

test('production authentication accepts session cookies and rejects header tokens by default', async () => {
  const mod = await importWorkerModule('functions/api/auth/me.js', ['onRequestGet']);
  const db = makeDb({ users: [{ id: 12, username: 'cookie-user', role: 'user', session_version: 3 }] });
  const token = await signToken({
    userId: 12,
    sessionVersion: 3,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');

  const headerOnly = await mod.onRequestGet({
    request: new Request('https://prod.example/api/auth/me', {
      headers: { 'X-GPT-Image-Session': token }
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(headerOnly.status, 401);

  const explicitlyAllowed = await mod.onRequestGet({
    request: new Request('https://prod.example/api/auth/me', {
      headers: { 'X-GPT-Image-Session': token }
    }),
    env: {
      gpt_image2_db: db,
      JWT_SECRET: 'test-jwt-secret',
      ALLOW_SESSION_HEADER_AUTH: 'true'
    }
  });
  assert.equal(explicitlyAllowed.status, 200);

  const cookie = await mod.onRequestGet({
    request: new Request('https://prod.example/api/auth/me', {
      headers: { Cookie: 'session=' + encodeURIComponent(token) }
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(cookie.status, 200);
});

test('JWT authentication rejects missing or stale session versions without fallback', async () => {
  const mod = await importWorkerModule('functions/api/auth/me.js', ['onRequestGet']);
  const db = makeDb({ users: [{ id: 13, username: 'versioned-user', role: 'user', session_version: 4 }] });
  const missingVersion = await signToken({
    userId: 13,
    sessionVersion: undefined,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const staleVersion = await signToken({
    userId: 13,
    sessionVersion: 3,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  for (const token of [missingVersion, staleVersion]) {
    const res = await mod.onRequestGet({
      request: new Request('https://prod.example/api/auth/me', {
        headers: { Cookie: 'session=' + encodeURIComponent(token) }
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
    });
    assert.equal(res.status, 401);
  }
});

test('self-service password changes require currentPassword and rotate session_version', async () => {
  const password = await importWorkerModule('functions/_lib/password.js');
  const mod = await importWorkerModule('functions/api/auth/me.js', ['onRequestPatch']);
  const users = [{
    id: 14,
    username: 'self-user',
    role: 'user',
    session_version: 2,
    password_hash: await password.hashPassword('current-password-123')
  }];
  const db = makeDb({ users });
  const token = await signToken({
    userId: 14,
    sessionVersion: 2,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const requestFor = body => new Request('https://prod.example/api/auth/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'session=' + encodeURIComponent(token)
    },
    body: JSON.stringify(body)
  });

  const missing = await mod.onRequestPatch({
    request: requestFor({ password: 'new-password-12345' }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(missing.status, 400);

  const wrong = await mod.onRequestPatch({
    request: requestFor({ password: 'new-password-12345', currentPassword: 'wrong-password-123' }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(wrong.status, 403);

  const changed = await mod.onRequestPatch({
    request: requestFor({ password: 'new-password-12345', currentPassword: 'current-password-123' }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(changed.status, 200);
  assert.equal(users[0].session_version, 3);
  assert.match(changed.headers.get('Set-Cookie') || '', /session=/);
  assert.equal((await password.verifyPassword('new-password-12345', users[0].password_hash)).valid, true);
});

test('administrator password resets and role changes invalidate target sessions independently', async () => {
  const password = await importWorkerModule('functions/_lib/password.js');
  const mod = await importWorkerModule('functions/api/admin/users/[id].js', ['onRequestPut']);
  const users = [
    { id: 1, username: 'admin', role: 'admin', session_version: 1, password_hash: await password.hashPassword('admin-password-123') },
    { id: 2, username: 'target', role: 'user', session_version: 7, password_hash: await password.hashPassword('target-password-123') }
  ];
  const db = makeDb({ users });
  const adminToken = await signToken({
    userId: 1,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const res = await mod.onRequestPut({
    params: { id: '2' },
    request: new Request('https://prod.example/api/admin/users/2', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=' + encodeURIComponent(adminToken)
      },
      body: JSON.stringify({ password: 'reset-password-123', role: 'admin' })
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(res.status, 200);
  assert.equal(users[1].session_version, 8);
  assert.equal(db.writes.some(write => /session_version = session_version \+ 1/i.test(write.sql)), true);
});

test('login failures are rate limited by IP and username, return Retry-After, and clear on success', async () => {
  const password = await importWorkerModule('functions/_lib/password.js');
  const mod = await importWorkerModule('functions/api/auth/login.js', ['onRequestPost']);
  const users = [{
    id: 15,
    username: 'rate-user',
    role: 'user',
    session_version: 1,
    password_hash: await password.hashPassword('correct-password-123')
  }];
  const db = makeDb({ users });
  const requestFor = passwordValue => new Request('https://prod.example/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.10'
    },
    body: JSON.stringify({ username: 'rate-user', password: passwordValue })
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await mod.onRequestPost({
      request: requestFor('wrong-password-123'),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' },
      waitUntil() {}
    });
    assert.equal(res.status, 401);
  }
  const limited = await mod.onRequestPost({
    request: requestFor('wrong-password-123'),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' },
    waitUntil() {}
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);

  const successDb = makeDb({ users: [{ ...users[0] }] });
  const failed = await mod.onRequestPost({
    request: requestFor('wrong-password-123'),
    env: { gpt_image2_db: successDb, JWT_SECRET: 'test-jwt-secret' },
    waitUntil() {}
  });
  assert.equal(failed.status, 401);
  assert.equal(successDb.rateRows.size, 2);
  const success = await mod.onRequestPost({
    request: requestFor('correct-password-123'),
    env: { gpt_image2_db: successDb, JWT_SECRET: 'test-jwt-secret' },
    waitUntil() {}
  });
  assert.equal(success.status, 200);
  assert.equal(successDb.rateRows.size, 1);
  assert.ok([...successDb.rateRows.values()].every(row => row.action === 'login'), 'successful login should preserve the independent per-IP bucket');
});

test('login fails closed when the auth rate-limit migration is missing', async () => {
  const mod = await importWorkerModule('functions/api/auth/login.js', ['onRequestPost']);
  const db = {
    prepare(sql) {
      if (/auth_rate_limits/i.test(sql)) throw new Error('no such table: auth_rate_limits');
      return {
        bind() { return this; },
        async first() { return null; },
        async run() { return { success: true }; }
      };
    }
  };
  const res = await mod.onRequestPost({
    request: new Request('https://prod.example/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.12' },
      body: JSON.stringify({ username: 'user', password: 'password' })
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' },
    waitUntil() {}
  });
  assert.equal(res.status, 503);
});

test('public registration is rate limited by IP without additional bindings', async () => {
  const mod = await importWorkerModule('functions/api/auth/register.js', ['onRequestPost']);
  const db = makeDb();
  const requestFor = () => new Request('https://prod.example/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.11'
    },
    body: JSON.stringify({ username: 'x', password: 'short' })
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await mod.onRequestPost({
      request: requestFor(),
      env: { gpt_image2_db: db, ALLOW_PUBLIC_REGISTRATION: 'true', JWT_SECRET: 'test-jwt-secret' }
    });
    assert.equal(res.status, 400);
  }
  const limited = await mod.onRequestPost({
    request: requestFor(),
    env: { gpt_image2_db: db, ALLOW_PUBLIC_REGISTRATION: 'true', JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('Retry-After')) > 0);
});

test('registration and password changes accept 6 characters and reject shorter passwords', async () => {
  const passwordPolicy = await importWorkerModule('functions/_lib/password.js');
  assert.equal(passwordPolicy.validateNewPassword('123456'), '');
  assert.match(passwordPolicy.validateNewPassword('12345'), /6/);

  const register = await importWorkerModule('functions/api/auth/register.js', ['onRequestPost']);
  const registerRes = await register.onRequestPost({
    request: new Request('https://prod.example/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'short-pass', password: '12345' })
    }),
    env: { gpt_image2_db: makeDb(), ALLOW_PUBLIC_REGISTRATION: 'true' }
  });
  assert.equal(registerRes.status, 400);
  assert.match(await registerRes.text(), /6/);

  const me = await importWorkerModule('functions/api/auth/me.js', ['onRequestPatch']);
  const db = makeDb({ users: [{ id: 4, username: 'alice', role: 'user' }] });
  const token = await signToken({ userId: 4, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const patchRes = await me.onRequestPatch({
    request: new Request('https://prod.example/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
      body: JSON.stringify({ password: '12345' })
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
  });
  assert.equal(patchRes.status, 400);
});

test('settings GET recursively masks nested secrets', async () => {
  const mod = await importWorkerModule('functions/api/settings/save.js', ['onRequestGet']);
  const db = makeDb({
    users: [{ id: 3, username: 'user', role: 'user' }],
    settings: { 3: [
      {
        key: 'customProviders',
        value: JSON.stringify([{ auth: { apiKey: 'nested-secret', refreshToken: 'refresh-secret' } }]),
        updated_at: 'x'
      }
    ] }
  });
  const token = await signToken({ userId: 3, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const res = await mod.onRequestGet({
    request: new Request('https://prod.example/api/settings/save', {
      headers: { 'X-GPT-Image-Session': token }
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
  });
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.match(text, /\*\*\*MASKED\*\*\*/);
  assert.doesNotMatch(text, /nested-secret|refresh-secret/);
});

test('settings save recursively preserves nested secret placeholders', async () => {
  const mod = await importWorkerModule('functions/api/settings/save.js', ['onRequestPost']);
  const db = makeDb({
    users: [{ id: 3, username: 'user', role: 'user' }],
    settings: { 3: [
      {
        key: 'customProviders',
        value: JSON.stringify([{ id: 'nested', auth: { apiKey: 'keep-me', clientSecret: 'also-keep' } }]),
        updated_at: 'x'
      }
    ] }
  });
  const res = await mod.onRequestPost({
    request: await authedRequest(3, {
      settings: {
        customProviders: [{ id: 'nested', auth: { apiKey: '***MASKED***', clientSecret: 'cloudflare-proxy' } }]
      }
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'gpt-image2-jwt-secret-key-2026-secure' }
  });
  assert.equal(res.status, 200);
  const write = db.writes.find(item => item.bound[1] === 'customProviders');
  const saved = JSON.parse(write.bound[2]);
  assert.equal(saved[0].auth.apiKey, 'keep-me');
  assert.equal(saved[0].auth.clientSecret, 'also-keep');
});

test('models API rejects non-HTTPS, localhost, and IP literal upstreams without fetching', async () => {
  const mod = await importWorkerModule('functions/api/models/index.js', ['onRequestPost']);
  const db = makeDb({ users: [{ id: 2, username: 'user', role: 'user' }] });
  const token = await signToken({ userId: 2, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount += 1; return new Response('{}'); };
  try {
    for (const baseUrl of ['http://api.example.com/v1', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1']) {
      const res = await mod.onRequestPost({
        request: new Request('https://prod.example/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
          body: JSON.stringify({ baseUrl, apiKey: 'secret' })
        }),
        env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
      });
      assert.notEqual(res.status, 200);
    }
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('models API uses manual redirect handling and blocks provider redirects', async () => {
  const mod = await importWorkerModule('functions/api/models/index.js', ['onRequestPost']);
  const db = makeDb({ users: [{ id: 2, username: 'user', role: 'user' }] });
  const token = await signToken({ userId: 2, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const originalFetch = globalThis.fetch;
  let redirectMode = '';
  globalThis.fetch = async (url, init) => {
    redirectMode = init.redirect;
    return new Response('', { status: 302, headers: { Location: 'https://other.example/v1/models' } });
  };
  try {
    const res = await mod.onRequestPost({
      request: new Request('https://prod.example/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
        body: JSON.stringify({ baseUrl: 'https://api.example.com/v1', apiKey: 'secret' })
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(redirectMode, 'manual');
    assert.equal(res.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime config recursively masks nested provider secrets', async () => {
  const mod = await importWorkerModule('functions/.well-known/img-runtime-config.json.js', ['onRequest']);
  const db = makeDb({
    users: [{ id: 5, username: 'runtime-user', role: 'user' }],
    settings: { 5: [
      { key: 'baseUrl', value: JSON.stringify('https://api.example.com/v1'), updated_at: 'x' },
      { key: 'apiKey', value: JSON.stringify('top-level-secret'), updated_at: 'x' },
      { key: 'apiProxy', value: JSON.stringify(false), updated_at: 'x' },
      { key: 'activeImageProfileId', value: JSON.stringify('image-profile'), updated_at: 'x' },
      {
        key: 'customProviders',
        value: JSON.stringify([{ id: 'custom', credentials: { clientSecret: 'nested-client-secret' } }]),
        updated_at: 'x'
      }
    ] }
  });
  const token = await signToken({ userId: 5, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const res = await mod.onRequest({
    request: new Request('https://prod.example/.well-known/img-runtime-config.json', {
      headers: { 'X-GPT-Image-Session': token }
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
  });
  const text = await res.text();
  const config = JSON.parse(text);
  assert.equal(res.status, 200);
  assert.equal(config.apiProxy, true);
  assert.equal(config.activeImageProfileId, 'image-profile');
  assert.match(text, /cloudflare-proxy/);
  assert.doesNotMatch(text, /top-level-secret|nested-client-secret/);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('API proxy rejects unsafe upstream URLs and blocks redirects with manual mode', async () => {
  const mod = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const users = [{ id: 6, username: 'proxy-user', role: 'user' }];
  const token = await signToken({ userId: 6, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const requestFor = () => new Request('https://prod.example/api-proxy/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
    body: JSON.stringify({ prompt: 'test' })
  });
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  let redirectMode = '';
  try {
    const unsafeDb = makeDb({
      users,
      settings: { 6: [
        { key: 'baseUrl', value: JSON.stringify('https://169.254.169.254/v1'), updated_at: 'x' },
        { key: 'apiKey', value: JSON.stringify('secret'), updated_at: 'x' }
      ] }
    });
    globalThis.fetch = async () => { fetchCount += 1; return new Response('{}'); };
    const unsafeRes = await mod.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: unsafeDb, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(unsafeRes.status, 400);
    assert.equal(fetchCount, 0);

    const safeDb = makeDb({
      users,
      settings: { 6: [
        { key: 'baseUrl', value: JSON.stringify('https://api.example.com/v1'), updated_at: 'x' },
        { key: 'apiKey', value: JSON.stringify('secret'), updated_at: 'x' }
      ] }
    });
    globalThis.fetch = async (url, init) => {
      redirectMode = init.redirect;
      return new Response('', { status: 307, headers: { Location: 'https://other.example/v1/images/generations' } });
    };
    const redirectRes = await mod.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: safeDb, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(redirectMode, 'manual');
    assert.equal(redirectRes.status, 502);
    assert.notEqual(redirectRes.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(await redirectRes.text(), /UPSTREAM_REDIRECT_BLOCKED/);

    globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=attacker-controlled; Path=/; HttpOnly'
      }
    });
    const cookieRes = await mod.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: safeDb, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(cookieRes.status, 200);
    assert.equal(cookieRes.headers.get('Set-Cookie'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API proxy CORS permits only the request origin and rejects cross-origin callers', async () => {
  const mod = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const db = makeDb({ users: [{ id: 16, username: 'cors-user', role: 'user' }] });
  const token = await signToken({
    userId: 16,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');

  const crossOrigin = await mod.onRequest({
    request: new Request('https://prod.example/api-proxy/images/generations', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' }
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.headers.get('Access-Control-Allow-Origin'), null);

  const sameOrigin = await mod.onRequest({
    request: new Request('https://prod.example/api-proxy/images/generations', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://prod.example',
        Cookie: 'session=' + encodeURIComponent(token)
      }
    }),
    env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret' }
  });
  assert.equal(sameOrigin.status, 200);
  assert.equal(sameOrigin.headers.get('Access-Control-Allow-Origin'), 'https://prod.example');
  assert.equal(sameOrigin.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.notEqual(sameOrigin.headers.get('Access-Control-Allow-Headers'), '*');
});

test('API proxy timeout remains active while an image response body is streaming', async () => {
  const proxy = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 17;
  const token = await signToken({
    userId,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'stream-timeout-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'image-stream',
          name: 'Image stream',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'stream-key',
          model: 'gpt-image-2',
          apiMode: 'images',
          timeout: 1,
          streamImages: true
        }],
        activeProfileId: 'image-stream',
        activeImageProfileId: 'image-stream'
      })
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"image_edit.partial_image"}\n\n'));
        init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      }
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    const response = await proxy.onRequest({
      request: new Request('https://prod.example/api-proxy/images/edits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GPT-Image-Session': token,
          'X-GPT-Image-Timeout-Seconds': '1'
        },
        body: JSON.stringify({ prompt: 'test', stream: true })
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    const outcome = await Promise.race([
      response.text().then((text) => ({ state: 'closed', text }), (error) => ({ state: error?.name === 'AbortError' || /abort/i.test(String(error)) ? 'aborted' : 'error', text: String(error) })),
      new Promise((resolve) => setTimeout(() => resolve('still-open'), 1400))
    ]);
    assert.equal(outcome.state, 'closed');
    assert.match(outcome.text, /PROXY_TIMEOUT/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streaming image proxy sends an early handshake and serializes upstream transport failures', async () => {
  const proxy = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 19;
  const token = await signToken({
    userId,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'stream-handshake-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'image-handshake',
          name: 'Image handshake',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'handshake-key',
          model: 'gpt-image-2',
          apiMode: 'images',
          timeout: 5,
          streamImages: true
        }],
        activeProfileId: 'image-handshake',
        activeImageProfileId: 'image-handshake'
      })
    }
  });
  const requestFor = () => new Request('https://prod.example/api-proxy/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPT-Image-Session': token,
      'X-GPT-Image-Profile-Id': 'image-handshake',
      'X-GPT-Image-Stream': 'true'
    },
    body: JSON.stringify({ prompt: 'test', stream: true })
  });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const startedAt = Date.now();
    const response = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.ok(Date.now() - startedAt < 100, 'streaming proxy should return before slow upstream headers');
    assert.match(response.headers.get('Content-Type') || '', /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /nexgen-image-proxy-ready/);
    assert.match(text, /image_edit\.completed/);

    globalThis.fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new TypeError('fetch failed');
    };
    const failedResponse = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    const failedText = await failedResponse.text();
    assert.match(failedText, /image_edit\.failed/);
    assert.match(failedText, /fetch failed|API 代理请求失败/);

    globalThis.fetch = async () => new Response(
      'data: {"type":"image_edit.completed","b64_json":"aW1hZ2U="}\n\n',
      { headers: { 'Content-Type': 'application/json' } }
    );
    const mislabeledResponse = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    const mislabeledText = await mislabeledResponse.text();
    assert.match(mislabeledText, /image_edit\.completed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API proxy normalizes legacy image quality in JSON and multipart requests', async () => {
  const proxy = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 18;
  const token = await signToken({
    userId,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'quality-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'image-quality',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'quality-key',
          model: 'gpt-image-2',
          apiMode: 'images'
        }],
        activeImageProfileId: 'image-quality'
      })
    }
  });
  const seenQualities = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    if (typeof init.body === 'string') seenQualities.push(JSON.parse(init.body).quality);
    else if (init.body instanceof FormData) seenQualities.push(init.body.get('quality'));
    return new Response(JSON.stringify({ data: [] }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const headers = { 'X-GPT-Image-Session': token, 'X-GPT-Image-Profile-Id': 'image-quality' };
    const jsonResponse = await proxy.onRequest({
      request: new Request('https://prod.example/api-proxy/images/generations', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test', quality: 'hd' })
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    await jsonResponse.text();
    const form = new FormData();
    form.append('prompt', 'test');
    form.append('quality', 'standard');
    form.append('image', new Blob(['image'], { type: 'image/png' }), 'image.png');
    const multipartResponse = await proxy.onRequest({
      request: new Request('https://prod.example/api-proxy/images/edits', {
        method: 'POST',
        headers,
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    await multipartResponse.text();
    assert.deepEqual(seenQualities, ['high', 'medium']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('professional workbench endpoints reject unsafe upstream URLs before fetch', async () => {
  const analyze = await importWorkerModule('functions/api/pro-workbench/analyze.js', ['onRequestPost']);
  const render = await importWorkerModule('functions/api/pro-workbench/render.js', ['onRequestPost']);
  const users = [{ id: 8, username: 'workbench-user', role: 'user' }];
  const db = makeDb({
    users,
    settings: { 8: [
      {
        key: 'profiles',
        value: JSON.stringify([
          { id: 'text', apiMode: 'responses', baseUrl: 'https://127.0.0.1/v1', apiKey: 'secret', model: 'gpt-test' },
          { id: 'image', apiMode: 'images', baseUrl: 'https://127.0.0.1/v1', apiKey: 'secret', model: 'gpt-image-test' }
        ]),
        updated_at: 'x'
      },
      { key: 'agentTextProfileId', value: JSON.stringify('text'), updated_at: 'x' },
      { key: 'activeImageProfileId', value: JSON.stringify('image'), updated_at: 'x' }
    ] }
  });
  const token = await signToken({ userId: 8, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response('{}');
  };
  try {
    const analyzeRes = await analyze.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
        body: JSON.stringify({ prompt: 'test' })
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(analyzeRes.status, 400);

    const form = new FormData();
    form.append('prompt', 'test');
    const renderRes = await render.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/render', {
        method: 'POST',
        headers: { 'X-GPT-Image-Session': token },
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(renderRes.status, 400);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('professional analysis profile selection obeys off, native, hybrid, and explicit responses rules', async () => {
  const analyze = await importWorkerModule('functions/api/pro-workbench/analyze.js', ['onRequestPost']);
  const userId = 18;
  const users = [{ id: userId, username: 'analyze-user', role: 'user', session_version: 1 }];
  const profiles = [
    { id: 'image', apiMode: 'images', baseUrl: 'https://image.example/v1', apiKey: 'image-key', model: 'image-model' },
    { id: 'agent-text', apiMode: 'responses', baseUrl: 'https://agent.example/v1', apiKey: 'agent-key', model: 'agent-model' },
    { id: 'active-text', apiMode: 'responses', baseUrl: 'https://active.example/v1', apiKey: 'active-key', model: 'active-model' },
    { id: 'explicit-text', apiMode: 'responses', baseUrl: 'https://explicit.example/v1', apiKey: 'explicit-key', model: 'explicit-model' }
  ];
  const cases = [
    { mode: 'off', active: 'active-text', agentText: 'agent-text', explicit: '', expectedHost: 'active.example', expectedModel: 'active-model' },
    { mode: 'native', active: 'active-text', agentText: 'agent-text', explicit: '', expectedHost: 'active.example', expectedModel: 'active-model' },
    { mode: 'hybrid', active: 'active-text', agentText: 'agent-text', explicit: 'explicit-text', expectedHost: 'agent.example', expectedModel: 'agent-model' },
    { mode: 'off', active: 'active-text', agentText: 'agent-text', explicit: 'explicit-text', expectedHost: 'explicit.example', expectedModel: 'explicit-model' },
    { mode: 'native', active: 'active-text', agentText: 'agent-text', explicit: 'image', expectedHost: 'active.example', expectedModel: 'active-model' },
    { mode: 'off', active: 'image', agentText: 'active-text', explicit: '', expectedHost: 'agent.example', expectedModel: 'agent-model' },
    { mode: 'hybrid', active: 'active-text', agentText: 'missing-text', explicit: '', expectedHost: '', expectedModel: '' }
  ];
  const originalFetch = globalThis.fetch;

  try {
    for (const scenario of cases) {
      let captured = null;
      globalThis.fetch = async (url, init) => {
        captured = { url: String(url), init };
        return new Response(JSON.stringify({
          output_text: JSON.stringify({ review: 'ok', dimensions: [] })
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
      const db = makeDb({
        users,
        settings: {
          [userId]: settingsRows({
            profiles,
            agentApiConfigMode: scenario.mode,
            agentTextProfileId: scenario.agentText,
            activeProfileId: scenario.active
          })
        }
      });
      const headers = scenario.explicit ? { 'X-GPT-Image-Profile-Id': scenario.explicit } : {};
      const response = await analyze.onRequestPost({
        request: await proAnalyzeRequest(userId, headers),
        env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
      });
      assert.equal(response.status, 200, `${scenario.mode}/${scenario.explicit || 'default'} should succeed`);
      if (!scenario.expectedHost) {
        assert.equal(captured, null, 'hybrid must not fall back when agentTextProfileId is invalid');
        assert.match(await response.text(), /API 配置不完整/);
        continue;
      }
      assert.ok(captured, `${scenario.mode}/${scenario.explicit || 'default'} should call upstream`);
      assert.equal(new URL(captured.url).hostname, scenario.expectedHost);
      assert.equal(JSON.parse(captured.init.body).model, scenario.expectedModel);
      assert.equal(captured.init.redirect, 'manual');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('professional analysis honors header and profile timeouts with an explicit 504', async () => {
  const analyze = await importWorkerModule('functions/api/pro-workbench/analyze.js', ['onRequestPost']);
  const userId = 19;
  const users = [{ id: userId, username: 'timeout-user', role: 'user', session_version: 1 }];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('aborted', 'AbortError'));
    if (init.signal.aborted) abort();
    else init.signal.addEventListener('abort', abort, { once: true });
  });

  try {
    for (const scenario of [
      { profileTimeout: 30, headerTimeout: '1' },
      { profileTimeout: 1, headerTimeout: '' }
    ]) {
      const db = makeDb({
        users,
        settings: {
          [userId]: settingsRows({
            profiles: [{
              id: 'text',
              apiMode: 'responses',
              baseUrl: 'https://timeout.example/v1',
              apiKey: 'timeout-key',
              model: 'timeout-model',
              timeout: scenario.profileTimeout
            }],
            agentApiConfigMode: 'off',
            activeProfileId: 'text'
          })
        }
      });
      const headers = scenario.headerTimeout
        ? { 'X-GPT-Image-Timeout-Seconds': scenario.headerTimeout }
        : {};
      const response = await analyze.onRequestPost({
        request: await proAnalyzeRequest(userId, headers),
        env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
      });
      const payload = await response.json();
      assert.equal(response.status, 504);
      assert.equal(payload.code, 'PRO_WORKBENCH_ANALYZE_TIMEOUT');
      assert.equal(payload.timeoutSeconds, 1);
      assert.match(payload.error, /专业分析.*超时/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('database bootstrap and deploy gate contain no fixed credential or dirty production path', async () => {
  const initSql = await readFile(new URL('../init_db.sql', import.meta.url), 'utf8');
  const migrationSql = await readFile(new URL('../migrations/20260710_remove_known_bootstrap_account.sql', import.meta.url), 'utf8');
  const sessionMigrationSql = await readFile(new URL('../migrations/20260710_session_version_and_auth_rate_limits.sql', import.meta.url), 'utf8');
  const deployScript = await readFile(new URL('./deploy-quality.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(initSql, /BtGs_bI3gUtzS6kpjjJyPE4e6GVrFhqjpCT-zoH3qb0|INSERT\s+OR\s+IGNORE\s+INTO\s+users/i);
  assert.match(migrationSql, /UPDATE\s+users/i);
  assert.doesNotMatch(migrationSql, /DELETE\s+FROM\s+users/i);
  assert.match(migrationSql, /WHERE\s+password_hash\s*=/i);
  assert.match(migrationSql, /session_version\s*=\s*COALESCE\(session_version,\s*1\)\s*\+\s*1/i);
  assert.match(initSql, /session_version\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1/i);
  assert.match(initSql, /CREATE TABLE IF NOT EXISTS auth_rate_limits/i);
  assert.match(sessionMigrationSql, /ALTER TABLE users[\s\S]*ADD COLUMN session_version/i);
  assert.match(sessionMigrationSql, /CREATE TABLE auth_rate_limits/i);
  assert.match(deployScript, /AllowDirtyDeploy is preview-only/);
  assert.match(deployScript, /Production is blocked because dynamic preview auth did not pass/);
  assert.match(deployScript, /Invoke-ProductionDatabasePreflight/);
  assert.match(deployScript, /seed_hash_count/);
  assert.match(deployScript, /admin_count/);
  assert.match(deployScript, /valid_pbkdf2_admin_count/);
  assert.match(deployScript, /valid_pbkdf2_admin_count -ne \[int\]\$row\.admin_count/);
  assert.match(deployScript, /password_hash LIKE 'pbkdf2-sha256\$\%'/);
  assert.match(deployScript, /NOT GLOB '\*\[\^0-9\]\*'/);
  assert.match(deployScript, /NOT GLOB '\*\[\^A-Za-z0-9_-\]\*'/);
  assert.match(deployScript, /\)\s*=\s*22/);
  assert.match(deployScript, /\)\s*=\s*43/);
  assert.match(deployScript, /Invoke-LoggedCommand -FilePath 'git' -Arguments @\('diff', '--check'\)/);
  assert.match(deployScript, /scripts\/local-preview-performance\.test\.mjs/);
  assert.doesNotMatch(deployScript, /if \(\$BaseUrl\) \{ \$productionUrl = \$BaseUrl \}/);
  assert.match(deployScript, /'migrations'/);
  assert.match(deployScript, /'\*\.sql'/);
  assert.match(deployScript, /Sensitive development or migration files leaked into deploy stage/);
  assert.match(deployScript, /Invoke-StaticDeployChecks -Url \$productionUrl -Label 'production'/);
  assert.ok(
    deployScript.indexOf("Invoke-StaticDeployChecks -Url $previewUrl -Label 'preview'") < deployScript.indexOf('Test-PreviewSupportsAuth -Url $previewUrl'),
    'preview static leak checks must run before dynamic auth and any production decision'
  );
});

test('image endpoints fail closed when configured image profiles are missing or non-image', async () => {
  const proxy = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const render = await importWorkerModule('functions/api/pro-workbench/render.js', ['onRequestPost']);
  const userId = 26;
  const users = [{ id: userId, username: 'invalid-image-profile', role: 'user', session_version: 1 }];
  const db = makeDb({
    users,
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'text-only',
          apiMode: 'responses',
          baseUrl: 'https://text.example/v1',
          apiKey: 'text-key',
          model: 'text-model'
        }],
        activeProfileId: 'text-only',
        activeImageProfileId: 'text-only'
      })
    }
  });
  const token = await signToken({
    userId,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response('{}');
  };
  try {
    const proxyResponse = await proxy.onRequest({
      request: new Request('https://prod.example/api-proxy/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GPT-Image-Session': token
        },
        body: JSON.stringify({ prompt: 'test' })
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(proxyResponse.status, 400);
    assert.match(await proxyResponse.text(), /INVALID_PROFILE_CONFIGURATION/);

    const form = new FormData();
    form.append('profileId', 'text-only');
    form.append('prompt', 'test');
    form.append('base[]', new Blob(['image'], { type: 'image/png' }), 'base.png');
    const renderResponse = await render.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/render', {
        method: 'POST',
        headers: { 'X-GPT-Image-Session': token },
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(renderResponse.status, 400);
    assert.match(await renderResponse.text(), /INVALID_PROFILE_CONFIGURATION/);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('real SQLite auth rate limiting reaches the block threshold without a bind mismatch', async () => {
  const {
    checkLoginLimit,
    consumeRegistrationAttempt,
    recordLoginFailure
  } = await import('../functions/_lib/rate-limit.js');
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        first() {
          return statement.get(...values);
        },
        run() {
          return statement.run(...values);
        }
      };
    }
  };
  try {
    sqlite.exec(`
      CREATE TABLE auth_rate_limits (
        rate_key TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        window_started_at INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    let loginState;
    for (let index = 0; index < 5; index += 1) {
      loginState = await recordLoginFailure(db, 'real-sqlite-login');
    }
    assert.equal(loginState.limited, true);
    assert.equal((await checkLoginLimit(db, 'real-sqlite-login')).limited, true);

    let registerState;
    for (let index = 0; index < 6; index += 1) {
      registerState = await consumeRegistrationAttempt(db, 'real-sqlite-register');
    }
    assert.equal(registerState.limited, true);
  } finally {
    sqlite.close();
  }
});

test('session_version and auth rate-limit migration executes against the legacy schema', async () => {
  const migrationSql = await readFile(
    new URL('../migrations/20260710_session_version_and_auth_rate_limits.sql', import.meta.url),
    'utf8'
  );
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
      );
      INSERT INTO users (username, password_hash, role) VALUES ('legacy', 'hash', 'admin');
    `);
    db.exec(migrationSql);
    const columns = db.prepare('PRAGMA table_info(users)').all();
    assert.equal(columns.some(column => column.name === 'session_version' && column.dflt_value === '1'), true);
    assert.equal(db.prepare('SELECT session_version FROM users WHERE username = ?').get('legacy').session_version, 1);
    db.prepare(
      'INSERT INTO auth_rate_limits (rate_key, action, attempts, window_started_at, blocked_until) VALUES (?, ?, ?, ?, ?)'
    ).run('key', 'login', 1, 100, 0);
    assert.equal(db.prepare('SELECT attempts FROM auth_rate_limits WHERE rate_key = ?').get('key').attempts, 1);
  } finally {
    db.close();
  }
});

test('local fallback forwards versioned JWTs and invalidates stale in-memory sessions', async () => {
  const source = await readFile(new URL('./local-preview-server.mjs', import.meta.url), 'utf8');
  assert.match(source, /sessionVersion:\s*Number\(user\.session_version\s*\|\|\s*1\)/);
  assert.match(source, /Number\(user\.session_version\s*\|\|\s*1\)\s*!==\s*session\.sessionVersion/);
  assert.match(source, /SELECT id, username, role, password_hash, session_version,/);
  assert.match(source, /session_version = session_version \+ 1/);
});

test('admin users API rejects fallback JWT in production without explicit opt-in', async () => {
  const mod = await importWorkerModule('functions/api/admin/users/index.js', ['onRequestGet']);
  const db = makeDb({ users: [{ id: 1, username: 'root', role: 'admin' }] });
  const token = await signToken({ userId: 1, role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 });
  const res = await mod.onRequestGet({
    request: new Request('https://prod.example/api/admin/users', {
      headers: { 'X-GPT-Image-Session': token }
    }),
    env: { gpt_image2_db: db, ALLOW_SESSION_HEADER_AUTH: 'true', ALLOW_INSECURE_JWT_FALLBACK: 'true' }
  });
  assert.equal(res.status, 401);
});


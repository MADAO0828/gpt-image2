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
  const res = await mod.onRequestPost({ request: await authedRequest(3, { settings: { apiKey: 'placeholder', profiles: [{ id: 'main', apiKey: '***MASKED***', nativeApiKey: '***MASKED***', googleNativeApiKey: 'cloudflare-proxy' }] } }), env: { gpt_image2_db: db, JWT_SECRET: 'gpt-image2-jwt-secret-key-2026-secure', ALLOW_SESSION_HEADER_AUTH: 'true' } });
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
    env: { gpt_image2_db: db, JWT_SECRET: 'gpt-image2-jwt-secret-key-2026-secure', ALLOW_SESSION_HEADER_AUTH: 'true' }
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

test('upstream DNS validation honors an already-aborted client signal', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['assertPublicUpstreamUrl', 'assertUpstreamHostAllowed', 'pinUpstreamFetchInit']);
  const originalFetch = globalThis.fetch;
  let dnsRequests = 0;
  globalThis.fetch = async () => {
    dnsRequests += 1;
    return new Response(JSON.stringify({ Answer: [{ type: 1, data: '8.8.8.8' }] }), { headers: { 'Content-Type': 'application/dns-json' } });
  };
  const controller = new AbortController();
  controller.abort();
  try {
    await assert.rejects(
      () => mod.assertPublicUpstreamUrl('https://dns-validation.invalid/v1', controller.signal),
      error => error?.code === 'UPSTREAM_DNS_TIMEOUT'
    );
    assert.equal(dnsRequests, 0);
    const init = mod.pinUpstreamFetchInit({ headers: { Accept: 'application/json' } }, ['8.8.8.8']);
    assert.equal(init.cf, undefined);
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(mod.assertUpstreamHostAllowed('https://api.example.com/v1', 'api.example.com').hostname, 'api.example.com');
    assert.equal(mod.assertUpstreamHostAllowed('https://img.api.example.com/v1', '*.api.example.com').hostname, 'img.api.example.com');
    assert.throws(() => mod.assertUpstreamHostAllowed('https://other.example/v1', 'api.example.com'), error => error?.code === 'UPSTREAM_HOST_NOT_ALLOWED');
    assert.throws(() => mod.assertUpstreamHostAllowed('https://api.example.com/v1', ''), error => error?.code === 'UPSTREAM_HOST_ALLOWLIST_MISSING' && /当前运行环境/.test(error.message));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dynamic upstream mode ignores stale allowlist configuration but retains URL and DNS validation', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['fetchPinnedUpstream']);
  const originalFetch = globalThis.fetch;
  let upstreamRequests = 0;
  globalThis.fetch = async url => {
    const text = String(url);
    if (text.includes('cloudflare-dns.com/dns-query') || text.includes('dns.google/resolve')) {
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: '8.8.8.8' }] }), { headers: { 'Content-Type': 'application/dns-json' } });
    }
    upstreamRequests += 1;
    assert.equal(new URL(text).hostname, 'api.dynamic-provider.invalid');
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await mod.fetchPinnedUpstream('https://api.dynamic-provider.invalid/v1/models', {}, {
      allowedHosts: 'stale-provider.example',
      requireAllowlist: false
    });
    assert.equal(result.response.status, 200);
    assert.equal(upstreamRequests, 1);
    await assert.rejects(
      () => mod.fetchPinnedUpstream('https://127.0.0.1/v1/models', {}, { requireAllowlist: false }),
      error => /internal|private|local|ip literal/i.test(String(error?.message || ''))
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('configured API profiles use the platform DNS fallback only when public DNS is unavailable', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['fetchPinnedUpstream']);
  const originalFetch = globalThis.fetch;
  let upstreamRequests = 0;
  globalThis.fetch = async url => {
    const text = String(url);
    if (text.includes('cloudflare-dns.com/dns-query') || text.includes('dns.google/resolve')) {
      throw new Error('public resolver unavailable');
    }
    upstreamRequests += 1;
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const fallback = await mod.fetchPinnedUpstream('https://api.dynamic-provider.invalid/v1/models', {}, {
      allowPlatformDnsFallback: true
    });
    assert.equal(fallback.dnsFallback, true);
    assert.equal(fallback.resolverId, 'platform-fallback');
    assert.equal(upstreamRequests, 1);
    await assert.rejects(
      () => mod.fetchPinnedUpstream('https://api.dynamic-provider.invalid/v1/models'),
      error => error?.code === 'UPSTREAM_DNS_FAILED'
    );
    await assert.rejects(
      () => mod.fetchPinnedUpstream('https://127.0.0.1/v1/models', {}, { allowPlatformDnsFallback: true }),
      error => /ip literal/i.test(String(error?.message || ''))
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream DNS validation uses the local resolver hook without bypassing public-address checks', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['resolvePublicAddresses']);
  const originalFetch = globalThis.fetch;
  const originalLookup = globalThis.__GPT_IMAGE2_PUBLIC_DNS_LOOKUP__;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('public DNS-over-HTTPS should not be called in local mode');
  };
  globalThis.__GPT_IMAGE2_PUBLIC_DNS_LOOKUP__ = async () => ['8.8.8.8'];
  try {
    const resolved = await mod.resolvePublicAddresses('local-dns-hook.invalid');
    assert.equal(resolved.resolverId, 'cloudflare');
    assert.deepEqual(resolved.addresses, ['8.8.8.8']);
    assert.equal(fetchCalls, 0);
    globalThis.__GPT_IMAGE2_PUBLIC_DNS_LOOKUP__ = async () => ['127.0.0.1'];
    await assert.rejects(
      () => mod.resolvePublicAddresses('local-dns-private.invalid'),
      error => error?.code === 'UPSTREAM_DNS_REJECTED'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLookup === undefined) delete globalThis.__GPT_IMAGE2_PUBLIC_DNS_LOOKUP__;
    else globalThis.__GPT_IMAGE2_PUBLIC_DNS_LOOKUP__ = originalLookup;
  }
});

test('upstream DNS validation falls back to Google when Cloudflare is unavailable', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['resolvePublicAddresses']);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async url => {
    const text = String(url);
    requests.push(text);
    if (text.includes('cloudflare-dns.com/dns-query')) return new Response('', { status: 503 });
    if (text.includes('dns.google/resolve') && text.includes('type=A')) {
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: '8.8.8.8' }] }), { headers: { 'Content-Type': 'application/dns-json' } });
    }
    return new Response(JSON.stringify({ Answer: [] }), { headers: { 'Content-Type': 'application/dns-json' } });
  };
  try {
    const resolved = await mod.resolvePublicAddresses('dns-fallback.invalid');
    assert.equal(resolved.resolverId, 'google');
    assert.deepEqual(resolved.addresses, ['8.8.8.8']);
    assert.equal(requests.filter(url => url.includes('cloudflare-dns.com/dns-query')).length, 2);
    assert.equal(requests.filter(url => url.includes('dns.google/resolve')).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream DNS validation keeps an A result when the AAAA lookup fails', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['resolvePublicAddresses']);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const text = String(url);
    if (text.includes('cloudflare-dns.com/dns-query') && text.includes('type=A')) {
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: '8.8.8.8' }] }), { headers: { 'Content-Type': 'application/dns-json' } });
    }
    if (text.includes('cloudflare-dns.com/dns-query') && text.includes('type=AAAA')) {
      return new Response('', { status: 503 });
    }
    return new Response(JSON.stringify({ Answer: [] }), { headers: { 'Content-Type': 'application/dns-json' } });
  };
  try {
    const resolved = await mod.resolvePublicAddresses('dns-partial.invalid');
    assert.equal(resolved.resolverId, 'cloudflare');
    assert.deepEqual(resolved.addresses, ['8.8.8.8']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream DNS validation fails closed when all public resolvers fail', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['resolvePublicAddresses']);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('resolver unavailable'); };
  try {
    await assert.rejects(
      () => mod.resolvePublicAddresses('dns-unavailable.invalid'),
      error => error?.code === 'UPSTREAM_DNS_FAILED'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream DNS validation rejects empty public answers', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['resolvePublicAddresses']);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ Answer: [] }), { headers: { 'Content-Type': 'application/dns-json' } });
  try {
    await assert.rejects(
      () => mod.resolvePublicAddresses('dns-empty.invalid'),
      error => error?.code === 'UPSTREAM_DNS_REJECTED'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream DNS validation rejects address changes during the pinned request', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['fetchWithPinnedAddress']);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /cloudflare-dns\.com\/dns-query/);
    if (String(url).includes('type=A')) return new Response(JSON.stringify({ Answer: [{ type: 1, data: '1.1.1.1' }] }), { headers: { 'Content-Type': 'application/dns-json' } });
    return new Response(JSON.stringify({ Answer: [] }), { headers: { 'Content-Type': 'application/dns-json' } });
  };
  try {
    await assert.rejects(
      () => mod.fetchWithPinnedAddress('https://dns-rebound.invalid/v1', ['8.8.8.8'], {}, { preferredResolverId: 'cloudflare' }),
      error => error?.code === 'UPSTREAM_DNS_REBOUND'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('upstream DNS validation propagates a client cancellation during lookup', async () => {
  const mod = await importWorkerModule('functions/_lib/upstream-url.js', ['resolvePublicAddresses']);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => await new Promise((resolve, reject) => {
    if (init?.signal?.aborted) {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const controller = new AbortController();
  try {
    const pending = mod.resolvePublicAddresses('dns-cancelled.invalid', controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error?.code === 'UPSTREAM_DNS_TIMEOUT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('models API classifies an upstream 524 as a timeout', async () => {
  const mod = await importWorkerModule('functions/api/models/index.js', ['onRequestPost']);
  const db = makeDb({ users: [{ id: 2, username: 'user', role: 'user' }] });
  const token = await signToken({ userId: 2, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('524: A timeout occurred', { status: 524, headers: { 'Content-Type': 'text/html' } });
  try {
    const response = await mod.onRequestPost({
      request: new Request('https://prod.example/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
        body: JSON.stringify({ baseUrl: 'https://api.example.com/v1', apiKey: 'secret' })
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).code, 'UPSTREAM_CLOUDFLARE_TIMEOUT');
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

test('remote image proxy rejects hostnames that resolve to private addresses', async () => {
  const mod = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 7;
  const token = await signToken({ userId, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({ users: [{ id: userId, username: 'remote-image-user', role: 'user' }] });
  const originalFetch = globalThis.fetch;
  let dnsRequests = 0;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /cloudflare-dns\.com\/dns-query/);
    dnsRequests += 1;
    return new Response(JSON.stringify({ Answer: [{ type: 1, data: '127.0.0.1' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/dns-json' }
    });
  };
  try {
    const response = await mod.onRequest({
      request: new Request('https://prod.example/api-proxy/image-download?url=https%3A%2F%2Fimages.example%2Fprivate.png', {
        headers: { 'X-GPT-Image-Session': token }
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /REMOTE_IMAGE_HOST_REJECTED/);
    assert.equal(dnsRequests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote image proxy enforces the upstream allowlist for the initial URL', async () => {
  const mod = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 8;
  const token = await signToken({ userId, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({ users: [{ id: userId, username: 'remote-image-allowlist-user', role: 'user' }] });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('allowlist rejection should happen before DNS or upstream fetch');
  };
  try {
    const response = await mod.onRequest({
      request: new Request('https://prod.example/api-proxy/image-download?url=https%3A%2F%2Fimages.example%2Fprivate.png', {
        headers: { 'X-GPT-Image-Session': token }
      }),
      env: {
        gpt_image2_db: db,
        JWT_SECRET: 'test-jwt-secret',
        ALLOW_SESSION_HEADER_AUTH: 'true',
        UPSTREAM_ALLOWLIST_REQUIRED: 'true',
        UPSTREAM_ALLOWED_HOSTS: 'trusted.example'
      }
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /REMOTE_IMAGE_HOST_NOT_ALLOWED/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote image proxy applies the specific allowlist to every redirect target', async () => {
  const mod = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 9;
  const token = await signToken({ userId, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({ users: [{ id: userId, username: 'remote-image-redirect-allowlist-user', role: 'user' }] });
  const originalFetch = globalThis.fetch;
  let remoteRequests = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('cloudflare-dns.com/dns-query') || String(url).includes('dns.google/resolve')) {
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: '8.8.8.8' }] }), {
        headers: { 'Content-Type': 'application/dns-json' }
      });
    }
    remoteRequests += 1;
    return new Response('', { status: 302, headers: { Location: 'https://evil.example/next.png' } });
  };
  try {
    const response = await mod.onRequest({
      request: new Request('https://prod.example/api-proxy/image-download?url=https%3A%2F%2Fimages.example%2Fstart.png', {
        headers: { 'X-GPT-Image-Session': token }
      }),
      env: {
        gpt_image2_db: db,
        JWT_SECRET: 'test-jwt-secret',
        ALLOW_SESSION_HEADER_AUTH: 'true',
        UPSTREAM_ALLOWLIST_REQUIRED: 'true',
        UPSTREAM_ALLOWED_HOSTS: 'fallback.example',
        REMOTE_IMAGE_ALLOWED_HOSTS: 'images.example'
      }
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /REMOTE_IMAGE_HOST_NOT_ALLOWED/);
    assert.equal(remoteRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remote image proxy converts redirect exhaustion to a safe upstream error', async () => {
  const mod = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 7;
  const token = await signToken({ userId, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({ users: [{ id: userId, username: 'remote-redirect-user', role: 'user' }] });
  const originalFetch = globalThis.fetch;
  let remoteRequests = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('cloudflare-dns.com/dns-query') || String(url).includes('dns.google/resolve')) {
      return new Response(JSON.stringify({ Answer: [{ type: 1, data: '8.8.8.8' }] }), { headers: { 'Content-Type': 'application/dns-json' } });
    }
    remoteRequests += 1;
    return new Response('', { status: 302, headers: { Location: 'https://images.example/next.png' } });
  };
  try {
    const response = await mod.onRequest({
      request: new Request('https://prod.example/api-proxy/image-download?url=https%3A%2F%2Fimages.example%2Fstart.png', {
        headers: { 'X-GPT-Image-Session': token }
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(response.status, 502);
    assert.equal(remoteRequests, 3);
    assert.match(await response.text(), /REMOTE_IMAGE_REDIRECT_BLOCKED/);
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
  let upstreamAborted = false;
  globalThis.fetch = async (_url, init) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"image_edit.partial_image"}\n\n'));
        init.signal.addEventListener('abort', () => {
          upstreamAborted = true;
          controller.error(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
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
    assert.notEqual(outcome, 'still-open');
    assert.equal(upstreamAborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streaming image proxy preserves upstream response bytes and status semantics', async () => {
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
    assert.ok(Date.now() - startedAt >= 100, 'raw passthrough waits for upstream response headers');
    assert.match(response.headers.get('Content-Type') || '', /application\/json/);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { data: [{ b64_json: 'aW1hZ2U=' }] });

    globalThis.fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new TypeError('fetch failed');
    };
    const failedResponse = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(failedResponse.status, 502);
    const failedText = await failedResponse.text();
    assert.match(failedText, /PROXY_FETCH_FAILED/);
    assert.match(failedText, /fetch failed|API 代理请求失败/);

    const rawSse = 'data: {"object":"image.generation.result","data":[{"b64_json":"aW1hZ2U="}]}\n\n';
    globalThis.fetch = async () => new Response(
      rawSse,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const mislabeledResponse = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.match(mislabeledResponse.headers.get('Content-Type') || '', /text\/event-stream/);
    const mislabeledText = await mislabeledResponse.text();
    assert.equal(mislabeledText, rawSse);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Responses proxy preserves SSE bytes and does not misclassify JSON responses', async () => {
  const proxy = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 21;
  const token = await signToken({
    userId,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'responses-stream-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'responses-stream',
          name: 'Responses stream',
          provider: 'openai',
          baseUrl: 'https://responses.example/v1',
          apiKey: 'responses-key',
          model: 'gpt-5.4',
          apiMode: 'responses',
          timeout: 5
        }],
        activeProfileId: 'responses-stream',
        agentApiConfigMode: 'native'
      })
    }
  });
  const requestFor = () => new Request('https://prod.example/api-proxy/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPT-Image-Session': token
    },
    body: JSON.stringify({ model: 'gpt-5.4', input: 'hello', stream: true })
  });
  const originalFetch = globalThis.fetch;
  const rawSse = [
    'event: response.output_text.delta\n',
    'data: {"type":"response.output_text.delta","delta":"hello"}\n\n',
    'data: {"type":"response.completed","response":{"status":"completed"}}\n\n'
  ].join('');
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(rawSse.slice(0, 23)));
        controller.enqueue(encoder.encode(rawSse.slice(23)));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const streamResponse = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get('Content-Type') || '', /text\/event-stream/);
    assert.equal(streamResponse.headers.get('X-GPT-Image-Proxy-Streamed'), '1');
    assert.equal(await streamResponse.text(), rawSse);

    const mislabeledSse = '\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n';
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(mislabeledSse.slice(0, 2)));
        controller.enqueue(encoder.encode(mislabeledSse.slice(2)));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'application/json' } });
    const mislabeledResponse = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.match(mislabeledResponse.headers.get('Content-Type') || '', /text\/event-stream/);
    assert.equal(mislabeledResponse.headers.get('X-GPT-Image-Proxy-Probed'), '1');
    assert.equal(await mislabeledResponse.text(), mislabeledSse);

    const jsonBody = { id: 'resp_1', output: [] };
    globalThis.fetch = async () => new Response(JSON.stringify(jsonBody), {
      headers: { 'Content-Type': 'application/json' }
    });
    const jsonResponse = await proxy.onRequest({
      request: requestFor(),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.match(jsonResponse.headers.get('Content-Type') || '', /application\/json/);
    assert.equal(jsonResponse.headers.get('X-GPT-Image-Proxy-Probed'), '1');
    assert.deepEqual(await jsonResponse.json(), jsonBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('图片代理兼容上游二进制图片响应并保留真实格式', async () => {
  const proxy = await importWorkerModule('functions/api-proxy/[[path]].js', ['onRequest']);
  const userId = 20;
  const token = await signToken({
    userId,
    sessionVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 60
  }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'binary-image-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'binary-image',
          name: 'Binary image',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'binary-key',
          model: 'gpt-image-2',
          apiMode: 'images',
          timeout: 5,
          streamImages: true
        }],
        activeProfileId: 'binary-image',
        activeImageProfileId: 'binary-image'
      })
    }
  });
  const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00]);
  const originalFetch = globalThis.fetch;
  const requestFor = (headers = {}, body = JSON.stringify({ prompt: 'test' })) => new Request('https://prod.example/api-proxy/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPT-Image-Session': token,
      'X-GPT-Image-Profile-Id': 'binary-image',
      ...headers
    },
    body
  });
  try {
    globalThis.fetch = async () => new Response(pngBytes, { headers: { 'Content-Type': 'application/octet-stream' } });
    const streamResponse = await proxy.onRequest({
      request: requestFor({ 'X-GPT-Image-Stream': 'true' }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(streamResponse.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(new Uint8Array(await streamResponse.arrayBuffer()), pngBytes);

    globalThis.fetch = async () => new Response(jpegBytes, { headers: { 'Content-Type': 'image/jpeg' } });
    const directResponse = await proxy.onRequest({
      request: requestFor({ 'X-GPT-Image-Stream': 'false' }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(directResponse.headers.get('Content-Type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await directResponse.arrayBuffer()), jpegBytes);

    globalThis.fetch = async () => new Response(jpegBytes, { headers: { 'Content-Type': 'image/png' } });
    const mislabeledImageResponse = await proxy.onRequest({
      request: requestFor({ 'X-GPT-Image-Stream': 'false' }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(mislabeledImageResponse.headers.get('Content-Type'), 'image/jpeg');
    assert.deepEqual(new Uint8Array(await mislabeledImageResponse.arrayBuffer()), jpegBytes);

    globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { headers: { 'Content-Type': 'image/png' } });
    const mislabeledJsonResponse = await proxy.onRequest({
      request: requestFor({ 'X-GPT-Image-Stream': 'false' }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.match(mislabeledJsonResponse.headers.get('Content-Type') || '', /application\/json/);
    assert.deepEqual(await mislabeledJsonResponse.json(), { data: [] });

    globalThis.fetch = async () => new Response(pngBytes, { headers: { 'Content-Type': 'application/json' } });
    const jsonLabeledBinaryResponse = await proxy.onRequest({
      request: requestFor({ 'X-GPT-Image-Stream': 'false' }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(jsonLabeledBinaryResponse.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(new Uint8Array(await jsonLabeledBinaryResponse.arrayBuffer()), pngBytes);

    globalThis.fetch = async () => new Response(pngBytes, { headers: { 'Content-Type': 'text/event-stream' } });
    const streamLabeledBinaryResponse = await proxy.onRequest({
      request: requestFor({ 'X-GPT-Image-Stream': 'true' }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(streamLabeledBinaryResponse.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(new Uint8Array(await streamLabeledBinaryResponse.arrayBuffer()), pngBytes);

    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(pngBytes.subarray(0, 2));
        controller.enqueue(pngBytes.subarray(2));
        controller.close();
      }
    }), { headers: { 'Content-Type': 'application/octet-stream' } });
    const splitBinaryResponse = await proxy.onRequest({
      request: requestFor({ 'X-GPT-Image-Stream': 'true' }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(splitBinaryResponse.headers.get('X-GPT-Image-Proxy-Probed'), null, 'an incomplete first binary chunk must not suppress frontend probing');
    assert.deepEqual(new Uint8Array(await splitBinaryResponse.arrayBuffer()), pngBytes);
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
  const seenImageCounts = [];
  const seenMultipart = [];
  const seenDuplex = [];
  const seenAcceptEncoding = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    seenAcceptEncoding.push(init.headers?.get?.('Accept-Encoding') || init.headers?.['Accept-Encoding'] || null);
    if (typeof init.body === 'string') seenQualities.push(JSON.parse(init.body).quality);
    else if (init.body?.getReader) {
      seenDuplex.push(init.duplex);
      const forwarded = await new Request('https://images.example/v1/images/edits', {
        method: 'POST',
        headers: init.headers,
        body: init.body,
        duplex: 'half'
      }).formData();
      seenQualities.push(forwarded.get('quality'));
      const images = [...forwarded.getAll('image[]'), ...forwarded.getAll('image')];
      seenImageCounts.push(images.length);
      seenMultipart.push({
        images: images.map((file) => ({ name: file.name, type: file.type, size: file.size })),
        masks: forwarded.getAll('mask').map((file) => ({ name: file.name, type: file.type, size: file.size }))
      });
    }
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
    form.append('model', 'gpt-image-2');
    form.append('prompt', 'test');
    form.append('quality', 'standard');
    form.append('image[]', new Blob(['image-1'], { type: 'image/png' }), 'first.png');
    form.append('image[]', new Blob(['image-2'], { type: 'image/jpeg' }), 'second.jpg');
    form.append('mask', new Blob(['mask'], { type: 'image/png' }), 'mask.png');
    const multipartResponse = await proxy.onRequest({
      request: new Request('https://prod.example/api-proxy/images/edits', {
        method: 'POST',
        headers,
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    await multipartResponse.text();
    assert.deepEqual(seenQualities, ['high', 'standard']);
    assert.deepEqual(seenImageCounts, [2]);
    assert.deepEqual(seenDuplex, ['half']);
    assert.ok(seenAcceptEncoding.every((value) => !value), 'proxy must not forward Accept-Encoding when it removes Content-Encoding');
    assert.deepEqual(seenMultipart, [{
      images: [
        { name: 'first.png', type: 'image/png', size: 7 },
        { name: 'second.jpg', type: 'image/jpeg', size: 7 }
      ],
      masks: [{ name: 'mask.png', type: 'image/png', size: 4 }]
    }]);

    const mismatchedForm = new FormData();
    mismatchedForm.append('model', 'different-image-model');
    mismatchedForm.append('prompt', 'test');
    mismatchedForm.append('image[]', new Blob(['image'], { type: 'image/png' }), 'image.png');
    const mismatchResponse = await proxy.onRequest({
      request: new Request('https://prod.example/api-proxy/images/edits', {
        method: 'POST',
        headers,
        body: mismatchedForm
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(mismatchResponse.status, 400);
    assert.equal((await mismatchResponse.json()).code, 'IMAGE_PROFILE_MODEL_MISMATCH');
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

test('professional analyze and render block provider redirects consistently', async () => {
  const analyze = await importWorkerModule('functions/api/pro-workbench/analyze.js', ['onRequestPost']);
  const render = await importWorkerModule('functions/api/pro-workbench/render.js', ['onRequestPost']);
  const userId = 8;
  const token = await signToken({ userId, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'workbench-redirect-user', role: 'user' }],
    settings: {
      [userId]: settingsRows({
        profiles: [
          { id: 'text', apiMode: 'responses', baseUrl: 'https://text.example/v1', apiKey: 'text-key', model: 'gpt-text' },
          { id: 'image', apiMode: 'images', baseUrl: 'https://image.example/v1', apiKey: 'image-key', model: 'gpt-image-2' }
        ],
        agentTextProfileId: 'text',
        activeImageProfileId: 'image'
      })
    }
  });
  const originalFetch = globalThis.fetch;
  const redirectModes = [];
  globalThis.fetch = async (_url, init) => {
    redirectModes.push(init.redirect);
    return new Response('', { status: 302, headers: { Location: 'https://other.example/v1/next' } });
  };
  try {
    const analyzeResponse = await analyze.onRequestPost({
      request: await proAnalyzeRequest(userId),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(analyzeResponse.status, 502);
    assert.equal((await analyzeResponse.json()).code, 'UPSTREAM_REDIRECT_BLOCKED');

    const form = new FormData();
    form.append('prompt', 'render redirect test');
    const renderResponse = await render.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/render', {
        method: 'POST',
        headers: { 'X-GPT-Image-Session': token },
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(renderResponse.status, 502);
    assert.equal((await renderResponse.json()).code, 'UPSTREAM_REDIRECT_BLOCKED');
    assert.deepEqual(redirectModes, ['manual', 'manual']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('professional render accepts mislabeled image SSE and stops at the wrapped terminal result', async () => {
  const render = await importWorkerModule('functions/api/pro-workbench/render.js', ['onRequestPost']);
  const userId = 32;
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'workbench-stream-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'image-stream',
          apiMode: 'images',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'stream-key',
          model: 'gpt-image-2',
          streamImages: true,
          responseFormatB64Json: true
        }],
        activeImageProfileId: 'image-stream'
      })
    }
  });
  const encoder = new TextEncoder();
  const events = [
    `data: ${JSON.stringify({
      type: 'image.generation.chunk',
      data: [{ b64_json: 'cHJldmlldy1pbWFnZS1kYXRh' }]
    })}\n\n`,
    `data: ${JSON.stringify({
      type: 'image.generation.chunk',
      data: [{ b64_json: 'ZmluYWwtaW1hZ2UtZGF0YQ==', output_format: 'jpeg' }]
    })}\n\n`.replace('data: ', 'event: image.generation.result\ndata: ')
  ];
  let index = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index++]));
        return;
      }
      return new Promise(() => {});
    },
    cancel() {}
  }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const form = new FormData();
    form.append('prompt', 'stream render');
    form.append('stream', 'true');
    form.append('response_format', 'true');
    const response = await Promise.race([
      render.onRequestPost({
        request: new Request('https://prod.example/api/pro-workbench/render', {
          method: 'POST',
          headers: { 'X-GPT-Image-Session': token },
          body: form
        }),
        env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('professional render waited past terminal SSE event')), 1000))
    ]);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data[0].b64_json, 'ZmluYWwtaW1hZ2UtZGF0YQ==');
    assert.equal(body.data[0].output_format, 'jpeg');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('professional render preserves multipart masks and reports streaming timeout', async () => {
  const render = await importWorkerModule('functions/api/pro-workbench/render.js', ['onRequestPost']);
  const userId = 35;
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'workbench-mask-timeout-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'image-stream',
          apiMode: 'images',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'stream-key',
          model: 'gpt-image-2',
          streamImages: true,
          responseFormatB64Json: true
        }],
        activeImageProfileId: 'image-stream'
      })
    }
  });
  let forwarded = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    forwarded = await new Request('https://images.example/v1/images/edits', {
      method: 'POST',
      headers: init.headers,
      body: init.body,
      duplex: 'half'
    }).formData();
    return new Response(JSON.stringify({ data: [{ b64_json: 'ZmluYWwtaW1hZ2U=' }] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const form = new FormData();
    form.append('prompt', 'masked render');
    form.append('base[]', new Blob(['image'], { type: 'image/png' }), 'base.png');
    form.append('mask', new Blob(['mask'], { type: 'image/png' }), 'mask.png');
    const response = await render.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/render', {
        method: 'POST',
        headers: { 'X-GPT-Image-Session': token },
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(response.status, 200);
    assert.equal(forwarded.getAll('image[]').length, 1);
    assert.equal(forwarded.get('mask')?.name, 'mask.png');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const timeoutFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')), { once: true });
    },
    pull() { return new Promise(() => {}); }
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  try {
    const form = new FormData();
    form.append('prompt', 'idle render');
    form.append('stream', 'true');
    const response = await render.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/render', {
        method: 'POST',
        headers: { 'X-GPT-Image-Session': token, 'X-GPT-Image-Timeout-Seconds': '1' },
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    const body = await response.json();
    assert.equal(response.status, 504);
    assert.equal(body.code, 'PRO_WORKBENCH_STREAM_IDLE_TIMEOUT');
    assert.equal(body.stage, 'stream-idle-timeout');
  } finally {
    globalThis.fetch = timeoutFetch;
  }
});

test('professional render preserves partial candidates when the stream ends without a final image', async () => {
  const render = await importWorkerModule('functions/api/pro-workbench/render.js', ['onRequestPost']);
  const userId = 33;
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'workbench-partial-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'image-stream',
          apiMode: 'images',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'stream-key',
          model: 'gpt-image-2',
          streamImages: true,
          responseFormatB64Json: true
        }],
        activeImageProfileId: 'image-stream'
      })
    }
  });
  const encoder = new TextEncoder();
  const events = [
    `data: ${JSON.stringify({
      type: 'image.generation.partial_image',
      b64_json: 'cHJldmlldy1wYXJ0aWFsLWltYWdl',
      output_index: 0
    })}\n\n`,
    'data: [DONE]\n\n'
  ];
  let index = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index++]));
        return;
      }
      controller.close();
    }
  }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const form = new FormData();
    form.append('prompt', 'partial render');
    form.append('stream', 'true');
    const response = await render.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/render', {
        method: 'POST',
        headers: { 'X-GPT-Image-Session': token },
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.code, 'IMAGE_STREAM_PARTIAL_ONLY');
    assert.equal(body.stage, 'stream-complete');
    assert.equal(body.partialCandidates[0].b64_json, 'cHJldmlldy1wYXJ0aWFsLWltYWdl');
    assert.equal(body.partialCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('professional render retains the latest partial for every output slot', async () => {
  const render = await importWorkerModule('functions/api/pro-workbench/render.js', ['onRequestPost']);
  const userId = 34;
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, 'test-jwt-secret');
  const db = makeDb({
    users: [{ id: userId, username: 'workbench-multi-partial-user', role: 'user', session_version: 1 }],
    settings: {
      [userId]: settingsRows({
        profiles: [{
          id: 'image-stream',
          apiMode: 'images',
          provider: 'openai',
          baseUrl: 'https://images.example/v1',
          apiKey: 'stream-key',
          model: 'gpt-image-2',
          streamImages: true,
          responseFormatB64Json: true
        }],
        activeImageProfileId: 'image-stream'
      })
    }
  });
  const encoder = new TextEncoder();
  const events = [
    `data: ${JSON.stringify({
      type: 'image.generation.partial_image',
      data: [{ output_index: 0, b64_json: 'b3V0cHV0LTAtZmlyc3Q=' }]
    })}\n\n`,
    `data: ${JSON.stringify({
      type: 'image.generation.partial_image',
      data: [{ output_index: 1, b64_json: 'b3V0cHV0LTE=' }]
    })}\n\n`,
    `data: ${JSON.stringify({
      type: 'image.generation.partial_image',
      data: [{ output_index: 0, b64_json: 'b3V0cHV0LTAtbGF0ZXN0' }]
    })}\n\n`,
    'data: [DONE]\n\n'
  ];
  let index = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index++]));
        return;
      }
      controller.close();
    }
  }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const form = new FormData();
    form.append('prompt', 'multi partial render');
    form.append('stream', 'true');
    const response = await render.onRequestPost({
      request: new Request('https://prod.example/api/pro-workbench/render', {
        method: 'POST',
        headers: { 'X-GPT-Image-Session': token },
        body: form
      }),
      env: { gpt_image2_db: db, JWT_SECRET: 'test-jwt-secret', ALLOW_SESSION_HEADER_AUTH: 'true' }
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.code, 'IMAGE_STREAM_PARTIAL_ONLY');
    assert.deepEqual(body.partialCandidates.map((item) => item.output_index), [0, 1]);
    assert.equal(body.partialCandidates[0].b64_json, 'b3V0cHV0LTAtbGF0ZXN0');
    assert.equal(body.partialCandidates[1].b64_json, 'b3V0cHV0LTE=');
    assert.equal(body.partialCount, 3);
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
    env: { gpt_image2_db: db, JWT_SECRET: 'production-jwt-secret' }
  });
  assert.equal(res.status, 401);
});


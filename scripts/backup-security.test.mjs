import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function importWorkerModule(relativePath, exportNames = []) {
  const source = await readFile(new URL('../' + relativePath, import.meta.url), 'utf8');
  const transformed = source.replaceAll('export async function ', 'async function ');
  const dir = await mkdtemp(join(tmpdir(), 'gpt-image2-test-'));
  const file = join(dir, 'module.mjs');
  await writeFile(file, transformed + '\nexport { ' + exportNames.join(', ') + ' };\n', 'utf8');
  try { return await import('file:///' + file.replace(/\\/g, '/')); }
  finally { setTimeout(() => rm(dir, { recursive: true, force: true }), 1000); }
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signToken(payload, secret = 'gpt-image2-jwt-secret-key-2026-secure') {
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64url(new Uint8Array(sig));
}

function makeDb({ users = [], settings = {} } = {}) {
  const writes = [];
  const db = {
    writes,
    prepare(sql) {
      const bound = [];
      return {
        bind(...args) { bound.push(...args); return this; },
        async first() {
          if (/FROM users WHERE id = \?/i.test(sql)) return users.find(u => u.id === bound[0]) || null;
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
        async run() { writes.push({ sql, bound: [...bound] }); return { success: true }; }
      };
    }
  };
  return db;
}

async function authedRequest(userId, body) {
  const token = await signToken({ userId, exp: Math.floor(Date.now() / 1000) + 60 });
  return new Request('https://local/api/settings/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
    body: JSON.stringify(body)
  });
}

test('backup export masks current user API secrets and includes no plaintext key', async () => {
  const mod = await importWorkerModule('functions/api/settings/backup.js', ['onRequestGet']);
  const db = makeDb({
    users: [{ id: 7, username: 'alice', role: 'user' }],
    settings: { 7: [
      { key: 'apiKey', value: JSON.stringify('sk-real-secret'), updated_at: '2026-06-23 01:00:00' },
      { key: 'profiles', value: JSON.stringify([{ id: 'p1', apiKey: 'sk-profile-secret', baseUrl: 'https://api.example/v1' }]), updated_at: '2026-06-23 01:00:00' }
    ] }
  });
  const token = await signToken({ userId: 7, exp: Math.floor(Date.now() / 1000) + 60 });
  const res = await mod.onRequestGet({ request: new Request('https://local/api/settings/backup', { headers: { 'X-GPT-Image-Session': token } }), env: { gpt_image2_db: db } });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /\*\*\*MASKED\*\*\*/);
  assert.doesNotMatch(text, /sk-real-secret|sk-profile-secret/);
});

test('admin backup export can include user summary but no password hashes or API keys', async () => {
  const mod = await importWorkerModule('functions/api/settings/backup.js', ['onRequestGet']);
  const db = makeDb({ users: [
    { id: 1, username: 'root', role: 'admin', password_hash: 'hash', last_login: 'x' },
    { id: 2, username: 'bob', role: 'user', password_hash: 'hash2' }
  ], settings: { 1: [{ key: 'apiKey', value: JSON.stringify('sk-admin'), updated_at: 'x' }] } });
  const token = await signToken({ userId: 1, exp: Math.floor(Date.now() / 1000) + 60 });
  const res = await mod.onRequestGet({ request: new Request('https://local/api/settings/backup?scope=users', { headers: { 'X-GPT-Image-Session': token } }), env: { gpt_image2_db: db } });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /"users"/);
  assert.doesNotMatch(text, /password_hash|hash2|sk-admin/);
});

test('backup import rejects masked API keys instead of storing placeholders as secrets', async () => {
  const mod = await importWorkerModule('functions/api/settings/backup.js', ['onRequestPost']);
  const db = makeDb({ users: [{ id: 7, username: 'alice', role: 'user' }], settings: { 7: [] } });
  const token = await signToken({ userId: 7, exp: Math.floor(Date.now() / 1000) + 60 });
  const res = await mod.onRequestPost({ request: new Request('https://local/api/settings/backup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token }, body: JSON.stringify({ settings: { apiKey: '***MASKED***', model: 'gpt-image-2' } }) }), env: { gpt_image2_db: db } });
  assert.equal(res.status, 200);
  assert.equal(db.writes.some(w => w.bound.includes('apiKey')), false);
});

test('settings save preserves existing secrets when placeholder strings are posted', async () => {
  const mod = await importWorkerModule('functions/api/settings/save.js', ['onRequestPost']);
  const db = makeDb({
    users: [{ id: 3, username: 'user', role: 'user' }],
    settings: { 3: [
      { key: 'apiKey', value: JSON.stringify('sk-existing'), updated_at: 'x' },
      { key: 'profiles', value: JSON.stringify([{ id: 'main', apiKey: 'sk-profile-existing' }]), updated_at: 'x' }
    ] }
  });
  const res = await mod.onRequestPost({ request: await authedRequest(3, { settings: { apiKey: 'placeholder', profiles: [{ id: 'main', apiKey: '***MASKED***' }] } }), env: { gpt_image2_db: db } });
  assert.equal(res.status, 200);
  const apiWrite = db.writes.find(w => w.bound[1] === 'apiKey');
  const profilesWrite = db.writes.find(w => w.bound[1] === 'profiles');
  assert.equal(apiWrite.bound[2], 'sk-existing');
  assert.equal(JSON.parse(profilesWrite.bound[2])[0].apiKey, 'sk-profile-existing');
});


import assert from 'node:assert/strict';
import test from 'node:test';
import { signToken } from '../functions/_lib/auth.js';

function makeDb(userId, settings) {
  const rows = Object.entries(settings).map(([key, value]) => ({ key, value: JSON.stringify(value) }));
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (/SELECT id, username, role, session_version/i.test(sql)) {
                return { id: values[0], username: 'models-test', role: 'user', session_version: 1 };
              }
              return null;
            },
            async all() {
              if (/SELECT key, value FROM user_settings/i.test(sql)) return { results: rows };
              return { results: [] };
            }
          };
        }
      };
    }
  };
}

async function loadEndpoint() {
  return import('../functions/api/models/index.js?profile-regression=' + Date.now());
}

function dnsResponse() {
  return new Response(JSON.stringify({ Answer: [{ type: 1, data: '93.184.216.34' }] }), {
    headers: { 'Content-Type': 'application/dns-json' }
  });
}

test('models endpoint selects the exact Responses profile and does not fall back to Images', async () => {
  const endpoint = await loadEndpoint();
  const userId = 901;
  const settings = {
    profiles: [
      { id: 'images', name: '图片配置', apiMode: 'images', baseUrl: 'https://images.example/v1', apiKey: 'image-key' },
      { id: 'responses', name: '文本配置', apiMode: 'responses', baseUrl: 'https://responses.example/v1', apiKey: 'response-key' }
    ],
    activeProfileId: 'images',
    activeImageProfileId: 'images',
    agentTextProfileId: 'responses'
  };
  const db = makeDb(userId, settings);
  const env = { gpt_image2_db: db, JWT_SECRET: 'models-profile-test-secret', ALLOW_SESSION_HEADER_AUTH: 'true' };
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, env);
  const calls = [];
  env.LOCAL_UPSTREAM_FETCH = async (url) => {
    const target = String(url);
    if (target.includes('dns-query')) return dnsResponse();
    calls.push(target);
    return new Response(JSON.stringify({ data: [{ id: 'gpt-5.6-luna' }] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const response = await endpoint.onRequestPost({
    request: new Request('https://local.test/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
      body: JSON.stringify({ profileId: 'responses', apiMode: 'responses' })
    }),
    env
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).models, [{ id: 'gpt-5.6-luna', ownedBy: '' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://responses.example/v1/models');
});

test('models endpoint rejects an Images profile explicitly requested for Responses API', async () => {
  const endpoint = await loadEndpoint();
  const userId = 902;
  const settings = {
    profiles: [{ id: 'images', name: '图片配置', apiMode: 'images', baseUrl: 'https://images.example/v1', apiKey: 'image-key' }],
    activeProfileId: 'images',
    activeImageProfileId: 'images'
  };
  const db = makeDb(userId, settings);
  const env = { gpt_image2_db: db, JWT_SECRET: 'models-profile-test-secret', ALLOW_SESSION_HEADER_AUTH: 'true' };
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, env);
  const response = await endpoint.onRequestPost({
    request: new Request('https://local.test/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
      body: JSON.stringify({ profileId: 'images', apiMode: 'responses' })
    }),
    env
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'PROFILE_API_MODE_MISMATCH');
});

test('models endpoint preserves duplicate profile ids when the selection key uses a unique name', async () => {
  const endpoint = await loadEndpoint();
  const userId = 903;
  const settings = {
    profiles: [
      { id: 'shared', name: '四倍超分', apiMode: 'images', baseUrl: 'https://upscale.example/v1', apiKey: 'upscale-key' },
      { id: 'shared', name: '原生图片', apiMode: 'images', baseUrl: 'https://native.example/v1', apiKey: 'native-key' }
    ],
    activeProfileId: 'shared',
    activeImageProfileId: 'name:原生图片'
  };
  const db = makeDb(userId, settings);
  const env = { gpt_image2_db: db, JWT_SECRET: 'models-profile-test-secret', ALLOW_SESSION_HEADER_AUTH: 'true' };
  const token = await signToken({ userId, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, env);
  const calls = [];
  env.LOCAL_UPSTREAM_FETCH = async (url) => {
    const target = String(url);
    if (target.includes('dns-query')) return dnsResponse();
    calls.push(target);
    return new Response(JSON.stringify({ data: [{ id: 'gpt-image-2' }] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const response = await endpoint.onRequestPost({
    request: new Request('https://local.test/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Session': token },
      body: JSON.stringify({ profileId: 'name:原生图片', apiMode: 'images' })
    }),
    env
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0], 'https://native.example/v1/models');
});

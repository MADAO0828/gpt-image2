import assert from 'node:assert/strict';
import test from 'node:test';
import { signToken } from '../functions/_lib/auth.js';

const USER_ID = 9601;
const JWT_SECRET = 'pro-workbench-provider-regression-secret';

function makeDb(settings) {
  const rows = Object.entries(settings).map(([key, value]) => ({ key, value: JSON.stringify(value) }));
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (/SELECT id, username, role, session_version/i.test(sql)) {
                return { id: values[0], username: 'workbench-test', role: 'user', session_version: 1 };
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

function dnsResponse() {
  return new Response(JSON.stringify({ Answer: [{ type: 1, data: '93.184.216.34' }] }), {
    headers: { 'Content-Type': 'application/dns-json' }
  });
}

function profileSet() {
  return [
    { id: 'openai-workbench', name: 'OpenAI Workbench', provider: 'openai', apiMode: 'images', baseUrl: 'https://openai.example/v1', apiKey: 'openai-key', model: 'gpt-image-2' },
    { id: 'google-workbench', name: 'Google Workbench', provider: 'google', apiMode: 'images', baseUrl: 'https://google.example/v1', apiKey: 'google-key', model: 'gemini-3.1-flash-image' },
    { id: 'xai-workbench', name: 'xAI Workbench', provider: 'xai', apiMode: 'images', baseUrl: 'https://xai.example/v1', apiKey: 'xai-key', model: 'grok-imagine-image'
    }
  ];
}

function makeForm({ profileId, files = [], mask = null, params = {} } = {}) {
  const form = new FormData();
  form.set('profileId', profileId);
  form.set('mode', 'ai');
  form.set('prompt', '保持结构并调整材质');
  form.set('params', JSON.stringify(params));
  form.set('analysis', JSON.stringify({}));
  files.forEach((file, index) => form.append('base[]', file, file.name || `base-${index + 1}.png`));
  if (mask) form.append('mask', mask, mask.name || 'mask.png');
  return form;
}

function makeFile(text, name = 'base.png') {
  const blob = new Blob([text], { type: 'image/png' });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

async function endpointContext(profileId, calls) {
  const settings = {
    profiles: profileSet(),
    activeProfileId: profileId,
    activeImageProfileId: profileId,
    moderation: 'low',
    output_format: 'png'
  };
  const env = {
    gpt_image2_db: makeDb(settings),
    JWT_SECRET,
    ALLOW_SESSION_HEADER_AUTH: 'true',
    LOCAL_UPSTREAM_FETCH: async (url, options) => {
      const target = String(url);
      if (target.includes('dns-query')) return dnsResponse();
      calls.push({ url: target, options });
      return new Response(JSON.stringify({ data: [{ url: 'https://result.example/image.png' }] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
  const token = await signToken({ userId: USER_ID, sessionVersion: 1, exp: Math.floor(Date.now() / 1000) + 60 }, env);
  return { env, token };
}

async function callRender(endpoint, profileId, form, calls) {
  const { env, token } = await endpointContext(profileId, calls);
  return endpoint.onRequestPost({
    request: new Request('https://local.test/api/pro-workbench/render', {
      method: 'POST',
      headers: { 'X-GPT-Image-Session': token },
      body: form
    }),
    env
  });
}

test('pro workbench keeps moderation and mask only on OpenAI multipart edits', async () => {
  const endpoint = await import('../functions/api/pro-workbench/render.js?provider-regression=' + Date.now());
  const calls = [];
  const response = await callRender(
    endpoint,
    'openai-workbench',
    makeForm({
      profileId: 'openai-workbench',
      files: [makeFile('openai-base.png')],
      mask: makeFile('openai-mask.png', 'mask.png'),
      params: { moderation: 'low' }
    }),
    calls
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const body = calls[0].options.body;
  assert.equal(body.get('moderation'), 'low');
  assert.ok(body.get('mask') instanceof Blob);
  const returned = await response.json();
  assert.equal(returned.returnedParams.moderation, 'low');
});

for (const provider of [
  { id: 'google-workbench', name: 'Google', model: 'gemini-3.1-flash-image' },
  { id: 'xai-workbench', name: 'xAI', model: 'grok-imagine-image' }
]) {
  test(`${provider.name} workbench requests omit moderation without a mask`, async () => {
    const endpoint = await import('../functions/api/pro-workbench/render.js?provider-json-regression=' + provider.id + '-' + Date.now());
    const calls = [];
    const response = await callRender(endpoint, provider.id, makeForm({ profileId: provider.id }), calls);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    const body = JSON.parse(String(calls[0].options.body));
    assert.equal(body.moderation, undefined);
    const returned = await response.json();
    assert.equal(Object.prototype.hasOwnProperty.call(returned.returnedParams, 'moderation'), false);
  });

  test(`${provider.name} multipart edits omit moderation without a mask`, async () => {
    const endpoint = await import('../functions/api/pro-workbench/render.js?provider-form-regression=' + provider.id + '-' + Date.now());
    const calls = [];
    const response = await callRender(endpoint, provider.id, makeForm({
      profileId: provider.id,
      files: [makeFile(`${provider.id}-base.png`)]
    }), calls);
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.body.get('moderation'), null);
    assert.equal((await response.json()).returnedParams.moderation, undefined);
  });

  test(`${provider.name} workbench rejects masks before any upstream call`, async () => {
    const endpoint = await import('../functions/api/pro-workbench/render.js?provider-mask-regression=' + provider.id + '-' + Date.now());
    const calls = [];
    const response = await callRender(endpoint, provider.id, makeForm({
      profileId: provider.id,
      files: [makeFile(`${provider.id}-base.png`)],
      mask: makeFile(`${provider.id}-mask.png`, 'mask.png')
    }), calls);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'PRO_WORKBENCH_MASK_PROVIDER_UNSUPPORTED');
    assert.equal(calls.length, 0);
  });
}

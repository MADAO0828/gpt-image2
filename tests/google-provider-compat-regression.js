const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const proxySource = fs.readFileSync(path.join(root, 'functions', 'api-proxy', '[[path]].js'), 'utf8');
const context = {
  AbortController,
  ArrayBuffer,
  Blob,
  File,
  FormData,
  Headers,
  ReadableStream,
  Request,
  Response,
  TextDecoder,
  TextEncoder,
  URL,
  URLSearchParams,
  Uint8Array,
  setTimeout,
  clearTimeout
};
context.globalThis = context;
vm.runInNewContext(
  `${proxySource.replace(/^import[^\n]*\r?\n/gm, '').replace(/^export\s+/gm, '')}\nthis.__sanitizeGoogleImageBody = sanitizeGoogleImageBody;\nthis.__proxyBody = proxyBody;\nthis.__proxyMultipartBody = proxyMultipartBody;`,
  context
);

const googleModels = [
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview'
];

function parseJsonBody(body) {
  const output = { ...body };
  context.__sanitizeGoogleImageBody(output);
  return output;
}

for (const model of googleModels) {
  for (const [resolution, aspectRatio] of [['1K', '4:3'], ['2K', '3:4'], ['4K', '21:9']]) {
    const body = parseJsonBody({
      model,
      prompt: 'compatibility test',
      resolution: resolution.toLowerCase(),
      image_size: resolution,
      size: resolution,
      aspect_ratio: aspectRatio,
      target_size: '4096x3072',
      targetSize: '4096x3072',
      extra_body: {
        generationConfig: {
          response_modalities: ['IMAGE'],
          imageConfig: { image_size: '16K', aspect_ratio: '16:9' }
        },
        generation_config: { image_config: { image_size: '16K', aspect_ratio: '16:9' } }
      }
    });
    assert.strictEqual(body.resolution, resolution, `${model} should preserve ${resolution} resolution`);
    assert.strictEqual(body.image_size, resolution, `${model} should preserve flat image_size`);
    assert.strictEqual(body.size, resolution, `${model} should preserve flat size`);
    assert.strictEqual(body.aspect_ratio, aspectRatio, `${model} should preserve ${aspectRatio} aspect ratio`);
    assert(!Object.prototype.hasOwnProperty.call(body, 'target_size'), `${model} must not emit target_size`);
    assert(!Object.prototype.hasOwnProperty.call(body, 'targetSize'), `${model} must not emit targetSize`);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(body.extra_body.generationConfig.imageConfig)), {
      imageSize: resolution,
      aspectRatio
    }, `${model} should use one authoritative camelCase imageConfig`);
    assert(!Object.prototype.hasOwnProperty.call(body.extra_body, 'generation_config'), `${model} must not emit generation_config`);
    assert(!Object.prototype.hasOwnProperty.call(body.extra_body.generationConfig, 'image_config'), `${model} must not emit nested image_config`);
    assert(!Object.prototype.hasOwnProperty.call(body.extra_body.generationConfig.imageConfig, 'image_size'), `${model} must not emit nested image_size`);
    assert(!Object.prototype.hasOwnProperty.call(body.extra_body.generationConfig.imageConfig, 'aspect_ratio'), `${model} must not emit nested aspect_ratio`);
  }
}

async function testJsonProxyPath() {
  const request = new Request('https://example.test/api-proxy/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-3-pro-image-preview',
      prompt: 'json proxy',
      resolution: '4K',
      aspect_ratio: '3:4',
      target_size: '3584x4608',
      extra_body: JSON.stringify({ generation_config: { image_config: { image_size: '2K', aspect_ratio: '16:9' } } })
    })
  });
  const headers = new Headers(request.headers);
  const body = await context.__proxyBody(request, headers, 'images/generations', {
    provider: 'google',
    model: 'gemini-3-pro-image-preview',
    streamImages: false
  });
  const parsed = JSON.parse(body);
  assert.strictEqual(parsed.resolution, '4K');
  assert.strictEqual(parsed.aspect_ratio, '3:4');
  assert(!Object.prototype.hasOwnProperty.call(parsed, 'target_size'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed.extra_body.generationConfig.imageConfig)), { imageSize: '4K', aspectRatio: '3:4' });
  assert(!Object.prototype.hasOwnProperty.call(parsed.extra_body, 'generation_config'));
}

async function testMultipartPath() {
  const form = new FormData();
  form.append('model', 'gemini-3.1-flash-image-preview');
  form.append('prompt', 'multipart proxy');
  form.append('resolution', '4K');
  form.append('aspect_ratio', '4:3');
  form.append('target_size', '4800x3584');
  form.append('extra_body', JSON.stringify({ generation_config: { image_config: { image_size: '1K', aspect_ratio: '16:9' } } }));
  form.append('image[]', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'first-reference.jpg', { type: 'image/jpeg' }));
  form.append('image[]', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'second-reference.png', { type: 'image/png' }));
  const request = new Request('https://example.test/api-proxy/images/edits', { method: 'POST', body: form });
  const headers = new Headers(request.headers);
  const output = await context.__proxyMultipartBody(request, headers, 'images/edits', {
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview'
  });
  const entries = Array.from(output.entries());
  const imageEntries = entries.filter(([key]) => key === 'image[]').map(([, value]) => value);
  assert.strictEqual(imageEntries.length, 2);
  assert.deepStrictEqual(imageEntries.map((file) => file.name), ['first-reference.jpg', 'second-reference.png']);
  assert.deepStrictEqual(imageEntries.map((file) => file.type), ['image/jpeg', 'image/png']);
  assert(!entries.some(([key]) => /^target(?:_|)size$/i.test(key)), 'multipart output must not contain target size aliases');
  const fields = Object.fromEntries(entries.filter(([key, value]) => key !== 'image[]' && typeof value === 'string'));
  assert.strictEqual(fields.resolution, '4K');
  assert.strictEqual(fields.image_size, '4K');
  assert.strictEqual(fields.size, '4K');
  assert.strictEqual(fields.aspect_ratio, '4:3');
  const extra = JSON.parse(fields.extra_body);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(extra.generationConfig.imageConfig)), { imageSize: '4K', aspectRatio: '4:3' });
  assert(!Object.prototype.hasOwnProperty.call(extra, 'generation_config'));
  assert(!Object.prototype.hasOwnProperty.call(extra.generationConfig, 'image_config'));
}

Promise.resolve()
  .then(testJsonProxyPath)
  .then(testMultipartPath)
  .then(() => console.log('[google-provider-compat-regression] Google image mapping and multipart preservation passed'))
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });

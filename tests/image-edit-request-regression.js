const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'assets', 'image-stream-runtime.js');
const homepagePath = path.join(root, 'assets', 'homepage-v3.js');
const localPreviewPath = path.join(root, 'scripts', 'local-preview-server.mjs');

const runtime = require(runtimePath);
const homepageSource = fs.readFileSync(homepagePath, 'utf8');
const proxySource = fs.readFileSync(path.join(root, 'functions', 'api-proxy', '[[path]].js'), 'utf8');
const localPreviewSource = fs.readFileSync(localPreviewPath, 'utf8');

assert.strictEqual(runtime.defaultEditImageField('openai'), 'image[]');
assert.strictEqual(runtime.defaultEditImageField('google'), 'image[]');

assert.strictEqual(runtime.shouldRetryEditImageField({
  status: 400,
  message: 'Unknown field image[]',
  streamEventCount: 0,
  partialCount: 0
}), true);
assert.strictEqual(runtime.shouldRetryEditImageField({
  status: 400,
  message: 'Unknown field image[]',
  streamEventCount: 1,
  partialCount: 0
}), false);
assert.strictEqual(runtime.shouldRetryEditImageField({
  status: 502,
  message: 'gateway timeout',
  streamEventCount: 0,
  partialCount: 0
}), false);
assert.strictEqual(runtime.shouldRetryEditImageField({
  status: 400,
  message: 'Unknown parameter: partial_images',
  streamEventCount: 0,
  partialCount: 0,
  fieldNames: ['stream', 'partial_images', 'response_format']
}), true);
assert.strictEqual(runtime.shouldRetryEditImageField({
  status: 400,
  message: 'Invalid prompt content',
  streamEventCount: 0,
  partialCount: 0,
  fieldNames: ['stream', 'partial_images', 'response_format']
}), false);

assert(
  /defaultEditImageField\(provider\)/.test(homepageSource),
  'reference image requests must select their multipart field through the shared compatibility helper'
);
assert(
  /IMAGE_STREAM_RUNTIME\?\.shouldRetryEditImageField\?\./.test(homepageSource)
    && /upstream-response-headers/.test(homepageSource),
  'reference image retries must reuse the shared field validator and require a pre-acceptance proxy stage'
);
assert(
  /async function inspectMultipartModel/.test(proxySource) && /const \[probeBody, replayBody\] = body\.tee\(\)/.test(proxySource),
  'OpenAI multipart model validation should tee a bounded probe instead of cloning the full request'
);
assert(
  /LOCAL_ORIGINAL_REQUEST_BODY: originalBody/.test(localPreviewSource)
    && /localOriginalMultipartBody\(ctx\.env, ctx\.request\)/.test(proxySource),
  'the local preview must hand the original multipart bytes to the proxy only through its local request context'
);
assert(
  !/const input = await request\.clone\(\)\.formData\(\);\s*const requestedModel/.test(proxySource),
  'OpenAI multipart validation must not eagerly parse a full cloned request body'
);
assert.strictEqual(
  (proxySource.match(/sniffImageBody\(responseBody/g) || []).length,
  1,
  'the proxy response path should perform at most one first-chunk probe'
);
assert(
  /streamBodyWithTimeout\(responseBody, controller, clearProxyTimeout, IMAGE_RESPONSE_LIMIT(?:, resetProxyTimeout)?\)/.test(proxySource),
  'raw image responses must retain the bounded proxy stream wrapper'
);
assert(
  /X-GPT-Image-Proxy-Probed/.test(proxySource) && /proxyProbed && responseMode === 'undetermined'/.test(homepageSource),
  'the frontend must trust the proxy probe marker and avoid a second first-chunk probe'
);
assert(
  /function isPotentialSsePrefix\(value\)/.test(proxySource)
    && /stopAfterFirstChunk && !isPotentialSsePrefix\(prefix\)/.test(proxySource),
  'the proxy must continue probing incomplete SSE field prefixes across chunks'
);
const proxyProbeContext = {
  TextDecoder,
  Uint8Array,
  ArrayBuffer,
  ReadableStream,
  Headers,
  Request,
  Response,
  URL,
  URLSearchParams,
  FormData,
  TextEncoder,
  setTimeout,
  clearTimeout
};
proxyProbeContext.globalThis = proxyProbeContext;
vm.runInNewContext(
  `${proxySource.replace(/^import[^\n]*\r?\n/gm, '').replace(/^export\s+/gm, '')}\nthis.__isPotentialSsePrefix = isPotentialSsePrefix;`,
  proxyProbeContext
);
assert.strictEqual(proxyProbeContext.__isPotentialSsePrefix('d'), true, 'a split data field must remain probeable');
assert.strictEqual(proxyProbeContext.__isPotentialSsePrefix('ev'), true, 'a split event field must remain probeable');
assert.strictEqual(proxyProbeContext.__isPotentialSsePrefix('ordinary text'), false, 'ordinary text must not keep the probe open indefinitely');

console.log('[image-edit-request-regression] multipart compatibility rules passed');

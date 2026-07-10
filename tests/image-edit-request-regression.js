const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'assets', 'image-stream-runtime.js');
const homepagePath = path.join(root, 'assets', 'homepage-v3.js');

const runtime = require(runtimePath);
const homepageSource = fs.readFileSync(homepagePath, 'utf8');

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

assert(
  /defaultEditImageField\(provider\)/.test(homepageSource),
  'reference image requests must select their multipart field through the shared compatibility helper'
);
assert(
  /shouldRetryEditImageField/.test(homepageSource),
  'reference image requests must guard compatibility retries'
);

console.log('[image-edit-request-regression] multipart compatibility rules passed');

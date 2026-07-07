const fs = require('fs');
const path = require('path');

const home = fs.readFileSync(path.join(__dirname, '..', 'assets', 'homepage-v3.js'), 'utf8');
const proxy = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api-proxy', '[[path]].js'), 'utf8');
let failed = false;

function assertContains(name, needle) {
  if (!home.includes(needle)) {
    console.error(`FAIL ${name}: missing ${needle}`);
    failed = true;
  } else {
    console.log(`OK   ${name}`);
  }
}

function assertPattern(name, pattern) {
  if (!pattern.test(home)) {
    console.error(`FAIL ${name}: missing pattern ${pattern}`);
    failed = true;
  } else {
    console.log(`OK   ${name}`);
  }
}
function assertProxyContains(name, needle) {
  if (!proxy.includes(needle)) {
    console.error(`FAIL ${name}: missing ${needle}`);
    failed = true;
  } else {
    console.log(`OK   ${name}`);
  }
}

// JSON and multipart image requests must share the same visible composer params.
assertContains('JSON sends image output params', 'appendImageOutputParams(body, requestParams)');
assertContains('multipart sends image output params', 'appendImageOutputParams(fd, requestParams)');
assertContains('OpenAI edits use image field', "const imageFieldName = provider === 'google' ? 'image[]' : 'image'");
assertContains('JSON sends provider payload', 'Object.assign(body, providerPayload(provider, requestParams))');
assertContains('multipart sends provider payload', 'appendProviderParams(fd, provider, requestParams)');
assertPattern('output params include quality', /quality:\s*firstDefined\(/);
assertContains('output params include format', 'output_format: format');
assertContains('non-png sends compression', "out.output_compression = Number(firstDefined");
assertContains('png sends transparent background', 'out.transparent_background = transparent');
assertContains('png sends official background field', "out.background = transparent ? 'transparent' : 'auto'");
assertContains('generation n respects Google split', "n: provider === 'google' ? 1");
assertContains('edit n respects Google split', "fd.append('n', String(provider === 'google' ? 1");

// Per-entry advanced profile fields must affect the active request path.
assertContains('advanced b64 is read', 'responseFormatB64Json');
assertContains('JSON b64 guarded by provider', "advanced.responseFormatB64Json && provider !== 'google' && provider !== 'xai'");
assertContains('multipart b64 guarded by provider', "form.append('response_format', 'b64_json')");
assertContains('JSON stream flags injected', 'body.stream = true');
assertContains('multipart stream flags injected', "form.append('stream', 'true')");
assertContains('partial images injected', 'partial_images');
assertContains('advanced timeout header injected', 'X-GPT-Image-Timeout-Seconds');

// Google/Nano must use the official 4K size table and the SkyAPI-compatible imageConfig shape.
assertContains('Google 4K 3:2 maps to official Gemini dimensions', "'3:2': '5056x3392'");
assertContains('Google request uses string response_format', "response_format: 'url'");
assertContains('Google request sends image tier as size', 'size: imageSize');
assertContains('Google request includes Gemini imageConfig', 'imageConfig: {');
assertContains('Google request includes Gemini imageConfig aspect ratio', 'aspectRatio,');
assertContains('Google request includes target_size', 'target_size: officialSize');
assertProxyContains('proxy streams successful image JSON', 'X-GPT-Image-Proxy-Streamed');

if (failed) process.exit(1);

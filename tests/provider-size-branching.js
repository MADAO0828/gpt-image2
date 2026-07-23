const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'assets', 'homepage-v3.js'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'functions', 'api-proxy', '[[path]].js'), 'utf8');
const proRender = fs.readFileSync(path.join(root, 'functions', 'api', 'pro-workbench', 'render.js'), 'utf8');
const failures = [];

function ok(cond, message) {
  if (!cond) failures.push(message);
}
function includes(needle, message) {
  ok(home.includes(needle), message);
}
function proxyIncludes(needle, message) {
  ok(proxy.includes(needle), message);
}
function renderIncludes(needle, message) {
  ok(proRender.includes(needle), message);
}
function matches(pattern, message) {
  ok(pattern.test(home), message);
}

ok(indexHtml.includes('/assets/homepage-v3.js'), 'index.html should load the standalone homepage v3 module');
ok(!/assets\/index-[^"']+\.js/.test(indexHtml), 'index.html must not load the legacy React homepage bundle');
ok(!indexHtml.includes('id="root"'), 'index.html must not expose the legacy React root');

includes("body = ['1K', '2K', '4K']", 'OpenAI resolution flow should expose only 1K/2K/4K');
includes('function openAiSizePayload(params = {})', 'OpenAI payload should map resolution + ratio into a concrete size helper');
matches(/return \{ size: openAiSizePayload\(requestParams\) \}/, 'OpenAI payload should use task snapshot resolution + ratio helper');
includes('const pixels = {', 'OpenAI size mapping should calculate dimensions from resolution pixel budgets');
includes('Math.floor(width / 16) * 16', 'OpenAI size mapping should align widths to multiples of 16');
includes('promptWithCanvasConstraint(prompt, provider, requestParams)', 'OpenAI requests should reinforce selected canvas ratio in the prompt');

includes("baseResolutions: ['1K', '2K', '4K']", 'Google 3.1 path should expose 1K/2K/4K base resolutions');
includes("ratios25: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']", 'Google 2.5 ratio table should be present');
includes("ratios31: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']", 'Google 3.1 ratio table should be present');
matches(/function googleVersion\(profile = activeProfile\(\)\)[\s\S]*3\.1[\s\S]*2\.5/, 'Google model version helper should distinguish 3.1 from 2.5');
matches(/if \(provider === 'google'\) \{[\s\S]*resolution: imageSize,[\s\S]*aspect_ratio: aspectRatio,[\s\S]*image_size: imageSize[\s\S]*\}/, 'Google payload should send task snapshot fields with flat image_size for OpenAI-compatible providers');
includes('const NANO_BANANA_CAPABILITIES', 'Google payload should use the Nano Banana capability table');
includes('gemini-3-pro-image-preview', 'Google payload should recognize Nano Banana Pro preview model');
includes('gemini-3.1-flash-image-preview', 'Google payload should recognize Nano Banana 2 preview model');
includes('const OPENAI_RESOLUTION_TABLE', 'OpenAI concrete resolution table should be available for detail mismatch display');
includes('const XAI_RESOLUTION_TABLE', 'Xai/Grok concrete resolution table should be available for detail mismatch display');
includes('function expectedProviderResolution(params = {})', 'Provider-specific expected resolution helper should exist');
includes('function isTierResolutionMatch(requested = {}, actualValue = \'\', images = [])', 'Tier resolution matching helper should exist');
includes("response_format: 'url'", 'Google payload should use a gateway-compatible string response_format');
matches(/extra_body:\s*\{[\s\S]*generationConfig:[\s\S]*imageConfig:\s*\{[\s\S]*imageSize(?:,|:)[\s\S]*aspectRatio(?:,|:)/s, 'Google payload should send Gemini imageConfig controls');
ok(!home.includes('target_size: officialSize || undefined'), 'Google payload must not send target pixel estimation');
ok(!home.includes('generation_config:'), 'Google payload must not send duplicate snake-case generation config');
ok(!home.includes('image_size: normalizedImageSize'), 'Google payload must not send duplicate snake-case imageConfig fields');

// The professional workbench must use the same Google mapping as the main composer.
renderIncludes('const GOOGLE_NANO_IMAGE_CAPABILITIES', 'Professional workbench should recognize Nano Banana model capabilities');
renderIncludes('gemini-3-pro-image-preview', 'Professional workbench should recognize Nano Banana Pro preview model');
renderIncludes('gemini-3.1-flash-image-preview', 'Professional workbench should recognize Nano Banana 2 preview model');
renderIncludes("responseModalities: ['IMAGE', 'TEXT']", 'Professional workbench should use camelCase Gemini response modalities');
renderIncludes('imageConfig: {', 'Professional workbench should send Gemini imageConfig');
ok(!proRender.includes('target_size:'), 'Professional workbench must not send target pixel estimation');
ok(!proRender.includes('generation_config:'), 'Professional workbench must not send duplicate snake-case generation config');
ok(!proRender.includes('image_size: normalizedImageSize'), 'Professional workbench must not send duplicate snake-case imageConfig fields');

// Exercise the workflow mapper directly so toolbar strings cannot silently become pixel sizes.
const renderContext = {
  Object,
  Array,
  String,
  Number,
  Math,
  Set,
  Map,
  Uint8Array,
  ArrayBuffer,
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  Request,
  Response,
  Headers,
  FormData,
  Blob,
  ReadableStream,
  AbortController,
  setTimeout,
  clearTimeout
};
renderContext.globalThis = renderContext;
const renderModule = proRender
  .replace(/^import[^\n]*\r?\n/gm, '')
  .replace(/^export\s+/gm, '');
vm.runInNewContext(`${renderModule}\nthis.__providerPayload = providerPayload;`, renderContext);
const workflowGooglePayload = renderContext.__providerPayload('google', { resolution: '4K', aspectRatio: '3:4' }, 'gemini-3-pro-image-preview');
ok(workflowGooglePayload.resolution === '4K', 'Professional workbench should preserve Google resolution tier');
ok(workflowGooglePayload.image_size === '4K', 'Professional workbench should preserve flat Google image_size');
ok(workflowGooglePayload.size === '4K', 'Professional workbench should preserve Google size tier');
ok(workflowGooglePayload.aspect_ratio === '3:4', 'Professional workbench should preserve Google aspect ratio');
ok(!Object.prototype.hasOwnProperty.call(workflowGooglePayload, 'target_size'), 'Professional workbench payload should omit target_size');
ok(!Object.prototype.hasOwnProperty.call(workflowGooglePayload.extra_body, 'generation_config'), 'Professional workbench payload should omit generation_config');
ok(JSON.stringify(workflowGooglePayload.extra_body.generationConfig.imageConfig) === JSON.stringify({ imageSize: '4K', aspectRatio: '3:4' }), 'Professional workbench payload should use one authoritative camelCase imageConfig');
for (const model of ['gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview']) {
  for (const aspectRatio of ['4:3', '3:4']) {
    const payload = renderContext.__providerPayload('google', { resolution: '2K', aspectRatio }, model);
    ok(payload.resolution === '2K' && payload.image_size === '2K' && payload.size === '2K', `${model} should preserve 2K toolbar tier`);
    ok(payload.aspect_ratio === aspectRatio, `${model} should preserve ${aspectRatio} toolbar ratio`);
    ok(payload.extra_body?.generationConfig?.imageConfig?.imageSize === '2K', `${model} should pass imageSize directly to Gemini imageConfig`);
    ok(payload.extra_body?.generationConfig?.imageConfig?.aspectRatio === aspectRatio, `${model} should pass aspectRatio directly to Gemini imageConfig`);
  }
}
proxyIncludes('function sanitizeGoogleImageBody(body)', 'API proxy should defensively sanitize cached/legacy Google image request bodies');
proxyIncludes('if (body.googleExactSizeUnsupported || body.legacy_google_size) delete body.response_format', 'API proxy should only remove object response_format for explicit legacy fallback');
proxyIncludes('body.image_size = imageSize', 'API proxy should preserve Google image_size as a flat field');
proxyIncludes('googleCompatExtraBody', 'Google reference image requests should keep SkyAPI-compatible imageConfig controls');
proxyIncludes("out.append('response_format', String(firstValue('response_format') || 'url'))", 'Google reference image requests should use gateway-compatible response_format');
proxyIncludes("out.append('extra_body', JSON.stringify(googleCompatExtraBody", 'Google reference image requests should forward imageConfig in multipart extra_body');
ok(!/proxyGoogleImageEditViaNative/.test(proxy), 'Google reference image requests must not be intercepted by native Gemini proxy');
ok(!new RegExp('google-' + 'native-generate-content').test(proxy), 'Google reference image requests must not use the Gemini generateContent compatibility marker');
ok(!/generativelanguage\.googleapis\.com/.test(proxy), 'Google reference image requests should not require an official Gemini API endpoint');
ok(!/type:\s*'input_image'/.test(proxy), 'Google reference image payload must not use OpenAI Responses input_image parts');
ok(!/image_url:\s*imageUrl/.test(proxy), 'Google reference image payload must not send data URLs as image_url');

includes("resolutions: ['1k', '2k']", 'Xai/Grok resolution levels should be present');
includes("ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20']", 'Xai/Grok aspect ratios should be present');
matches(/if \(provider === 'xai'\) return \{[\s\S]*resolution: requestParams\.resolution \|\| requestParams\.size \|\| state\.settings\.xaiResolution,[\s\S]*aspect_ratio: requestParams\.aspectRatio \|\| requestParams\.aspect_ratio \|\| state\.settings\.xaiAspectRatio[\s\S]*\}/, 'Xai payload should send task snapshot resolution + aspect_ratio only');

includes('referenceLimit(profile = activeProfile())', 'Reference limits should branch by provider');
includes("return googleVersion(profile) === '3.1' ? 14 : 10", 'Google reference limit should depend on 3.1 vs 2.5');
includes('return PROVIDER[key]?.refLimit || 4', 'OpenAI/Xai reference limits should fall back to provider limits');
includes('executeWorkflowInvoke', 'Workflow batch execution entry should exist');
includes('const runProfile = imageProfile()', 'Workflow runs should snapshot the current Composer image profile');
includes('profileSnapshot', 'Workflow runs should preserve the Composer image profile snapshot for reproducible history');
includes('const profile = run.profileSnapshot || imageProfile()', 'Workflow image tasks should use the saved Composer profile snapshot');
includes('function workflowImageParams(workflow, profile, countPerRow)', 'Workflow image tasks should use a dedicated params helper');
includes('const params = workflowImageParams(workflow, profile, run.budget.countPerRow)', 'Workflow image tasks should compute provider params from the saved Composer profile and workflow config');
includes('negative_prompt: negativePrompt', 'Workflow image params should forward workflow negative prompts to image requests');
includes('await generateImageTask(taskSeed)', 'Workflow execution should reuse the normal image generation task path');
includes('providerPayload(provider, requestParams)', 'Workflow generation path should keep provider-specific payload branching through task snapshot params');
includes('function buildWorkflowAgentRequestPayload(input, options = {})', 'Workflow planning/rewrite should use a dedicated Responses payload builder');
includes('async function postAgentResponsesRequest(payload, textProfile, externalSignal = null)', 'Workflow planning/rewrite should use the shared Agent Responses request helper with timeout and cancellation handling');
includes('agentRequestTimeoutSeconds(textProfile)', 'Workflow Responses requests should use configured Agent timeouts');
includes('referenceLimit()', 'Workflow/reference UI should continue to rely on provider reference limits');

if (failures.length) {
  console.error('Provider size branching checks failed:');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('[provider-size-branching] homepage v3 provider size checks passed');

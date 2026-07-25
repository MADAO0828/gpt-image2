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

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source markers should exist: ${startMarker}`);
  return source.slice(start, end);
}

// Exercise the actual mention mapper so a single @图2 request is remapped to
// the first image slot after the selected reference list is narrowed.
const mentionSource = sourceBetween(
  homepageSource,
  'function referenceMentionLabel',
  'function appendReferenceEditInstructions'
);
const mentionContext = {
  Array,
  Map,
  Number,
  Object,
  Set,
  String,
  uid: () => 'test-mention'
};
mentionContext.globalThis = mentionContext;
vm.runInNewContext(
  `${mentionSource}\nthis.__mentionFns = { selectedReferencesForImageGeneration, remapReferenceMentionTokens, resolveComposerPromptForRequest };`,
  mentionContext
);
const mentionFns = mentionContext.__mentionFns;
const referenceFixtures = [
  { id: 'ref-1', blobId: 'original-1', originalBlobId: 'original-1' },
  { id: 'ref-2', blobId: 'original-2', originalBlobId: 'original-2' }
];
const secondReferenceToken = {
  id: 'mention-2',
  refId: 'ref-2',
  start: 0,
  end: 3,
  text: '@图2',
  selected: true,
  removed: false
};
const secondOnly = mentionFns.selectedReferencesForImageGeneration(
  referenceFixtures,
  [secondReferenceToken],
  { prompt: '@图2' }
);
assert.deepStrictEqual(secondOnly.map((ref) => ref.id), ['ref-2'], '@图2-only should select only the second reference');
const remappedSecond = mentionFns.remapReferenceMentionTokens([secondReferenceToken], secondOnly)[0];
assert.strictEqual(remappedSecond.index, 0, 'a standalone @图2 should become request image index 0');
assert.strictEqual(remappedSecond.label, '@图1', 'a narrowed @图2 request should expose the first request-slot label');
assert.strictEqual(
  mentionFns.resolveComposerPromptForRequest('@图2', secondOnly, [secondReferenceToken]),
  '[image 1]',
  'a standalone @图2 should resolve to [image 1] for the single-image request'
);

const sendGenerationSource = sourceBetween(
  homepageSource,
  'async function sendGenerationRequest',
  'function providerPayload'
);
assert(
  /const blobId = provider === 'openai'[\s\S]*index === 0 \? originalBlobId : compositeBlobId/.test(sendGenerationSource),
  'OpenAI must send the first marked reference original and later marked references as composites'
);
assert(
  /: \(marked \? compositeBlobId : \(ref\?\.blobId \|\| originalBlobId\)\)/.test(sendGenerationSource),
  'Google/xAI must send the marked composite image rather than an independent mask'
);
assert(
  /fd\.append\(imageFieldName, blob, filename\)/.test(sendGenerationSource)
    && /if \(prepared\.mask && openAiImagesProfile\(profile\)\) fd\.append\('mask', prepared\.mask, 'mask\.png'\)/.test(sendGenerationSource),
  'OpenAI edits must use image[] for references and append one transparent mask field'
);
assert(
  /const hasColorAnnotation = provider !== 'openai'/.test(homepageSource)
    && /const colorLine = '请将参考图中的彩色标注区域作为需要修改的区域，仅编辑这些区域。'/.test(homepageSource)
    && /if \(hasColorAnnotation && !next\.includes\(colorLine\)\)/.test(homepageSource),
  'Google/xAI annotated composites must carry an explicit marked-region prompt instruction'
);

// Closed shapes fill the target canvas (the UI can render a visual outline),
// while line/arrow/text remain annotation-only and never become OpenAI mask input.
const shapeSource = sourceBetween(homepageSource, 'function drawMaskShape', 'function drawAnnotationShape');
assert(/tool === 'rect'[\s\S]*context\.fillRect/.test(shapeSource), 'rectangles must cover their interior in the target mask');
assert(/tool === 'ellipse'[\s\S]*context\.fill\(\)/.test(shapeSource), 'ellipses must cover their interior in the target mask');
assert(/tool === 'polygon'[\s\S]*context\.fill\(\)/.test(shapeSource), 'polygons must cover their interior in the target mask');
const drawingSource = sourceBetween(homepageSource, 'function installCanvasDrawing', 'function maskSnapshot');
assert(
  /\(tool === 'line' \|\| tool === 'arrow'\)[\s\S]{0,240}annotationCtx[\s\S]{0,240}drawAnnotationShape\(annotationCtx/.test(drawingSource)
    && /if \(tool === 'text'\)[\s\S]*pendingText/.test(drawingSource),
  'line/arrow/text tools must stay on the annotation canvas instead of becoming independent OpenAI targets'
);
const maskPixelSource = sourceBetween(homepageSource, 'function openAiMaskPixelsFromOverlay', 'function overlayPixelsFromOpenAiMask');
const maskPixelContext = { Uint8ClampedArray };
maskPixelContext.globalThis = maskPixelContext;
vm.runInNewContext(`${maskPixelSource}\nthis.__openAiMaskPixelsFromOverlay = openAiMaskPixelsFromOverlay;`, maskPixelContext);
const overlayPixels = new Uint8ClampedArray([
  239, 68, 68, 220, 0, 0, 0, 0,
  0, 0, 0, 0, 239, 68, 68, 220
]);
const openAiMaskPixels = maskPixelContext.__openAiMaskPixelsFromOverlay(overlayPixels, 2, 2);
assert.strictEqual(openAiMaskPixels[3], 0, 'selected overlay pixels must become transparent target-mask pixels');
assert.strictEqual(openAiMaskPixels[7], 255, 'unselected overlay pixels must remain opaque target-mask pixels');

assert(
  /normalizedOriginal\.info\.width !== normalizedLayer\.info\.width/.test(homepageSource)
    && /IMAGE_EDIT_MASK_DIMENSIONS_MISMATCH/.test(homepageSource),
  'mask preflight must require dimensions matching the source image and report a dedicated error'
);
assert(
  /(?:OPENAI_MASK_[A-Z_]*LIMIT|IMAGE_EDIT_MASK_TOO_LARGE)[\s\S]{0,500}(?:prepared\.mask|requestMask|maskBlob)/.test(homepageSource)
    || /(?:prepared\.mask|requestMask|maskBlob)[\s\S]{0,500}(?:OPENAI_MASK_[A-Z_]*LIMIT|IMAGE_EDIT_MASK_TOO_LARGE)/.test(homepageSource),
  'OpenAI masks must have a dedicated early size preflight rather than only the generic image limit'
);
assert(
  /const PROXY_REQUEST_BODY_LIMIT = 64 \* 1024 \* 1024/.test(proxySource)
    && /function requestBodyWithLimit\(request, maxBytes = PROXY_REQUEST_BODY_LIMIT\)/.test(proxySource)
    && /PROXY_REQUEST_BODY_TOO_LARGE/.test(proxySource)
    && /const boundedRequest = localOriginalBody \? ctx\.request : requestBodyWithLimit\(ctx\.request\)/.test(proxySource),
  'the proxy must diagnose requests above 64MB before forwarding or parsing them'
);
assert(
  /maskFormat !== OPENAI_MASK_FORMAT/.test(homepageSource)
    && /openAiMaskBlobFromLegacyOverlayBlob/.test(homepageSource)
    && /legacyCompositeId|legacyOriginalBlobId/.test(homepageSource),
  'legacy overlay masks and legacy reference snapshots must remain readable through the compatibility path'
);

console.log('[image-edit-request-regression] provider mask request and multipart compatibility rules passed');

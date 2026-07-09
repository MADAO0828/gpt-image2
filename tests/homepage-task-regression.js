const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets', 'homepage-v3.js'), 'utf8');
const failures = [];
const fakeIndexedDbStore = new Map([
  ['ref-blob', new Blob(['reference'], { type: 'image/png' })]
]);

function ok(condition, message) {
  if (!condition) failures.push(message);
}

const sandbox = {
  console,
  TextDecoder,
  TextEncoder,
  window: {},
  document: { documentElement: { dataset: {}, setAttribute: () => {} }, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {} },
  indexedDB: {
    open: () => {
      const req = {};
      req.result = {
        createObjectStore: () => {},
        transaction: () => {
          const tx = { oncomplete: null, onerror: null };
          tx.objectStore = () => ({
            put: (blob, id) => {
              fakeIndexedDbStore.set(id, blob);
              setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            },
            get: (id) => {
              const getReq = {};
              setTimeout(() => {
                getReq.result = fakeIndexedDbStore.get(id) || null;
                if (getReq.onsuccess) getReq.onsuccess();
              }, 0);
              return getReq;
            },
            delete: (id) => {
              fakeIndexedDbStore.delete(id);
              setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            }
          });
          return tx;
        }
      };
      setTimeout(() => {
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    }
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  setInterval: () => 0,
  setTimeout,
  clearTimeout,
  atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
  btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
  Blob,
  URL,
  FormData: class {
    constructor() { this.fields = []; }
    append(key, value, filename) { this.fields.push([key, value, filename]); }
    get(key) {
      const found = this.fields.find((item) => item[0] === key);
      return found ? found[1] : null;
    }
    getAll(key) { return this.fields.filter((item) => item[0] === key).map((item) => item[1]); }
  },
  fetch: async () => ({ blob: async () => new Blob(['x'], { type: 'image/png' }) }),
  Image: class {
    set src(_) {
      setTimeout(() => {
        this.naturalWidth = 1024;
        this.naturalHeight = 1024;
        if (this.onload) this.onload();
      }, 0);
    }
  },
  CSS: { escape: (value) => String(value) }
};

vm.createContext(sandbox);
vm.runInContext(source.replace(/\ninit\(\);\s*\n/, '\n'), sandbox, { filename: 'homepage-v3.js' });

const hooks = sandbox.window.__homepageV3TestHooks || {};
ok(typeof hooks.normalizeRestoredTask === 'function', 'normalizeRestoredTask hook missing');
ok(typeof hooks.collectImageCandidates === 'function', 'collectImageCandidates hook missing');
ok(typeof hooks.collectGenerationResult === 'function', 'collectGenerationResult hook missing');
ok(typeof hooks.persistResponseImages === 'function', 'persistResponseImages hook missing');
ok(typeof hooks.imageInfoFromBlob === 'function', 'imageInfoFromBlob hook missing');
ok(typeof hooks.resolveTaskProfile === 'function', 'resolveTaskProfile hook missing');
ok(typeof hooks.retryTask === 'function', 'retryTask hook missing');
ok(typeof hooks.extractReturnedParams === 'function', 'extractReturnedParams hook missing');
ok(typeof hooks.renderDetailModal === 'function', 'renderDetailModal hook missing');
ok(typeof hooks.renderViewer === 'function', 'renderViewer hook missing');
ok(typeof hooks.captureGalleryScrollState === 'function', 'captureGalleryScrollState hook missing');
ok(typeof hooks.restoreGalleryScrollState === 'function', 'restoreGalleryScrollState hook missing');
ok(typeof hooks.sanitizeReferenceSnapshots === 'function', 'sanitizeReferenceSnapshots hook missing');
ok(typeof hooks.cloneReferenceSnapshots === 'function', 'cloneReferenceSnapshots hook missing');
ok(typeof hooks.taskCountInfo === 'function', 'taskCountInfo hook missing');
ok(typeof hooks.renderReferenceBadge === 'function', 'renderReferenceBadge hook missing');
ok(typeof hooks.renderTaskReferenceStrip === 'function', 'renderTaskReferenceStrip hook missing');
ok(typeof hooks.captureAgentScrollAnchor === 'function', 'captureAgentScrollAnchor hook missing');
ok(typeof hooks.restoreAgentScrollAnchor === 'function', 'restoreAgentScrollAnchor hook missing');
ok(typeof hooks.freezeAgentScrollForRender === 'function', 'freezeAgentScrollForRender hook missing');
ok(typeof hooks.releaseAgentScrollFreezeAfterRender === 'function', 'releaseAgentScrollFreezeAfterRender hook missing');
ok(typeof hooks.renderSafeMarkdown === 'function', 'renderSafeMarkdown hook missing');
ok(typeof hooks.extractAgentPromptOptions === 'function', 'extractAgentPromptOptions hook missing');
ok(typeof hooks.recommendedAgentPromptOption === 'function', 'recommendedAgentPromptOption hook missing');
ok(typeof hooks.parseAgentOptionSelection === 'function', 'parseAgentOptionSelection hook missing');
ok(typeof hooks.renderAgentMessage === 'function', 'renderAgentMessage hook missing');
ok(typeof hooks.expectedProviderResolution === 'function', 'expectedProviderResolution hook missing');
ok(typeof hooks.isTierResolutionMatch === 'function', 'isTierResolutionMatch hook missing');
ok(typeof hooks.taskReferenceDisplayBlobId === 'function', 'taskReferenceDisplayBlobId hook missing');
ok(typeof hooks.taskReferenceOriginalBlobId === 'function', 'taskReferenceOriginalBlobId hook missing');
ok(typeof hooks.cardParamSummary === 'function', 'cardParamSummary hook missing');
ok(typeof hooks.renderImageContextMenu === 'function', 'renderImageContextMenu hook missing');
ok(typeof hooks.galleryVirtualWindow === 'function', 'galleryVirtualWindow hook missing');
ok(typeof hooks.maskCanvasHasPaint === 'function', 'maskCanvasHasPaint hook missing');
ok(typeof hooks.setTestTasks === 'function', 'setTestTasks hook missing');
ok(typeof hooks.shouldCloseModalFromClick === 'function', 'shouldCloseModalFromClick hook missing');
ok(typeof hooks.normalizeComparableValue === 'function', 'normalizeComparableValue hook missing');
ok(typeof hooks.providerPayload === 'function', 'providerPayload hook missing');
ok(typeof hooks.promptWithCanvasConstraint === 'function', 'promptWithCanvasConstraint hook missing');
ok(typeof hooks.buildTransparentKeyPrompt === 'function', 'buildTransparentKeyPrompt hook missing');
ok(typeof hooks.getTransparentRequestParams === 'function', 'getTransparentRequestParams hook missing');
ok(typeof hooks.detectKeyColorFromPixels === 'function', 'detectKeyColorFromPixels hook missing');
ok(typeof hooks.removeKeyedBackgroundFromPixels === 'function', 'removeKeyedBackgroundFromPixels hook missing');
ok(typeof hooks.openAiSizePayload === 'function', 'openAiSizePayload hook missing');
ok(typeof hooks.googleOfficialImageSize === 'function', 'googleOfficialImageSize hook missing');
ok(typeof hooks.summarizeResponse === 'function', 'summarizeResponse hook missing');
ok(typeof hooks.consumeResponseTextStream === 'function', 'consumeResponseTextStream hook missing');
ok(typeof hooks.resolveResponsePayload === 'function', 'resolveResponsePayload hook missing');
ok(typeof hooks.agentTextProfile === 'function', 'agentTextProfile hook missing');
ok(typeof hooks.agentWebSearchSupported === 'function', 'agentWebSearchSupported hook missing');
ok(typeof hooks.agentRequestTimeoutSeconds === 'function', 'agentRequestTimeoutSeconds hook missing');
ok(typeof hooks.activeAgentHasPending === 'function', 'activeAgentHasPending hook missing');
ok(typeof hooks.buildAgentRequestPayload === 'function', 'buildAgentRequestPayload hook missing');
ok(typeof hooks.agentFailureDetail === 'function', 'agentFailureDetail hook missing');
ok(typeof hooks.migrateAgentThreads === 'function', 'migrateAgentThreads hook missing');
ok(typeof hooks.branchAgentThreadFromMessage === 'function', 'branchAgentThreadFromMessage hook missing');
ok(typeof hooks.clearAgentThreadMessages === 'function', 'clearAgentThreadMessages hook missing');
ok(typeof hooks.renderAgentStage === 'function', 'renderAgentStage hook missing');
ok(typeof hooks.renderAgentComposer === 'function', 'renderAgentComposer hook missing');
ok(typeof hooks.renderWorkflowWorkspace === 'function', 'renderWorkflowWorkspace hook missing');
ok(typeof hooks.renderSidebar === 'function', 'renderSidebar hook missing');
ok(typeof hooks.renderPopover === 'function', 'renderPopover hook missing');
ok(typeof hooks.agentImageParams === 'function', 'agentImageParams hook missing');
ok(typeof hooks.agentImageSettings === 'function', 'agentImageSettings hook missing');
ok(typeof hooks.createAgentThread === 'function', 'createAgentThread hook missing');
ok(typeof hooks.deleteAgentThread === 'function', 'deleteAgentThread hook missing');
ok(typeof hooks.handlePaste === 'function', 'handlePaste hook missing');
ok(typeof hooks.loadRuntime === 'function', 'loadRuntime hook missing');
ok(typeof hooks.setTestState === 'function', 'setTestState hook missing');
ok(typeof hooks.getTestState === 'function', 'getTestState hook missing');
ok(typeof hooks.writeStore === 'function', 'writeStore hook missing');

const restored = hooks.normalizeRestoredTask({
  id: 'task-success-stale-error',
  status: 'running',
  error: '页面刷新导致请求中断，可重试。',
  errorDetail: 'old interrupted detail',
  images: [{ blobId: 'blob-1', width: 1024, height: 1024 }],
  returnedParams: { resolution: '1024x1024' },
  finishedAt: Date.now()
});
ok(restored.status === 'success', 'task with persisted images must restore as success');
ok(restored.error === '' && restored.errorDetail === '', 'successful restored task must clear stale errors');

const restoredFromStaleError = hooks.normalizeRestoredTask({
  id: 'task-success-marked-error',
  status: 'error',
  error: '页面刷新导致请求中断，可重试。',
  images: [{ blobId: 'blob-google-1', width: 2160, height: 3840 }],
  rawResponse: { count: 1 },
  returnedParams: { resolution: '2160x3840', aspectRatio: '9:16' },
  finishedAt: Date.now()
});
ok(restoredFromStaleError.status === 'success', 'task with stale refresh-interrupted error and persisted images must restore as success');
ok(restoredFromStaleError.error === '', 'stale refresh-interrupted error should be cleared when success evidence exists');

  const restoredCompleteNano = hooks.normalizeRestoredTask({
  id: 'task-nano-two-success-refresh',
  status: 'error',
  providerFamily: 'google',
  error: '页面刷新导致请求中断，可重试。',
  images: [
    { blobId: 'blob-nano-1', width: 2528, height: 1696, type: 'image/png' },
    { blobId: 'blob-nano-2', width: 2528, height: 1696, type: 'image/png' }
  ],
  expectedCount: 2,
  actualCount: 2,
  requestedParams: { count: 2 },
  returnedParams: { count: 2, resolution: '2528x1696', aspectRatio: '3:2' },
  finishedAt: Date.now()
});
ok(restoredCompleteNano.status === 'success', 'Nano task with two persisted images must restore as success even from stale refresh error');
ok(restoredCompleteNano.error === '', 'Nano fully restored task should clear stale refresh error');

const restoredRunningNanoComplete = hooks.normalizeRestoredTask({
  id: 'task-nano-running-two-success-refresh',
  status: 'running',
  providerFamily: 'google',
  images: [
    { blobId: 'blob-nano-running-1', width: 2528, height: 1696, type: 'image/png' },
    { blobId: 'blob-nano-running-2', width: 2528, height: 1696, type: 'image/png' }
  ],
  expectedCount: 2,
  actualCount: 2,
  requestedParams: { count: 2 }
});
ok(restoredRunningNanoComplete.status === 'success', 'running Nano task with all expected images persisted must restore as success after refresh');

const restoredGrok = hooks.normalizeRestoredTask({
  id: 'task-grok-success-refresh',
  status: 'running',
  providerFamily: 'xai',
  model: 'grok-imagine-image-quality',
  error: '页面刷新导致请求中断，可重试。',
  images: [{ blobId: 'blob-grok-1', width: 720, height: 1280, type: 'image/png' }],
  returnedParams: { resolution: '720x1280', aspectRatio: '9:16', count: 1 },
  finishedAt: Date.now()
});
ok(restoredGrok.status === 'success', 'Grok/Xai successful task with persisted image must not restore as interrupted after refresh');

const restoredPartialRunning = hooks.normalizeRestoredTask({
  id: 'task-google-partial-running',
  status: 'running',
  providerFamily: 'google',
  error: '',
  images: [{ blobId: 'blob-google-partial-1', width: 1024, height: 1024 }],
  expectedCount: 2,
  requestedParams: { count: 2 }
});
ok(restoredPartialRunning.status === 'partial_success', 'running task with persisted partial images should restore as partial_success after refresh');
ok(restoredPartialRunning.images.length === 1, 'partial restore should keep persisted images');

const interrupted = hooks.normalizeRestoredTask({
  id: 'task-live',
  status: 'running',
  images: [],
  error: ''
});
ok(interrupted.status === 'interrupted', 'running task without completion evidence should restore as interrupted');

const candidates = hooks.collectImageCandidates({
  data: [{ b64_json: 'aaa' }, { b64_json: 'bbb' }],
  result: { images: [{ url: 'https://example.com/a.png' }, { image_url: 'https://example.com/b.png' }] },
  output: [{ content: [{ data_url: 'data:image/png;base64,ccc' }] }]
});
ok(candidates.length >= 5, 'recursive image candidate collector should find all nested image results');

const largeImagePayload = 'a'.repeat(12000);
const summarized = hooks.summarizeResponse({
  data: [{ b64_json: largeImagePayload }],
  result: {
    images: [
      { image_base64: largeImagePayload, url: 'https://example.com/image.png' },
      { data_url: `data:image/png;base64,${largeImagePayload}` }
    ]
  },
  output: [{ content: [{ base64: largeImagePayload, text: 'ok' }] }]
});
const summarizedText = JSON.stringify(summarized);
ok(!summarizedText.includes(largeImagePayload), 'response summary must strip nested base64/data-url payloads before localStorage persistence');
ok(summarizedText.includes('[image-data]'), 'response summary should keep image placeholders for diagnostics');

const params = hooks.extractReturnedParams({
  result: {
    images: [{ url: 'https://example.com/a.webp' }, { url: 'https://example.com/b.webp' }],
    output_format: 'webp',
    output_compression: 72,
    aspect_ratio: '16:9',
    quality: 'high',
    moderation_level: 'low'
  }
}, {
  format: 'png',
  compression: 90,
  aspectRatio: '1:1',
  quality: 'medium',
  moderation: 'auto',
  count: 4
}, [
  { width: 1600, height: 900, type: 'image/webp' },
  { width: 1600, height: 900, type: 'image/webp' }
]);
ok(params.resolution === '1600x900', 'returned resolution should fall back to persisted image dimensions');
ok(params.aspectRatio === '16:9', 'returned aspect ratio alias should be extracted');
ok(params.quality === 'high', 'returned quality alias should be extracted');
ok(params.format === 'webp', 'returned output format alias should be extracted');
ok(Number(params.compression) === 72, 'returned compression alias should be extracted');
ok(params.moderation === 'low', 'returned moderation alias should be extracted');
ok(params.count === 2, 'returned count should prefer actual persisted image count');

const nestedReturned = hooks.extractReturnedParams({
  response_format: {
    aspect_ratio: '16:9',
    output_format: 'webp',
    output_compression: 64,
    transparent_background: true
  },
  parameters: {
    quality: 'low',
    moderation_level: 'strict',
    image_count: 3
  }
}, {
  aspectRatio: '9:16',
  quality: 'high',
  format: 'png',
  compression: 90,
  transparent: false,
  moderation: 'auto',
  count: 5
}, [
  { width: 1600, height: 900, type: 'image/webp' },
  { width: 1600, height: 900, type: 'image/webp' }
]);
ok(nestedReturned.aspectRatio === '16:9', 'nested returned aspect ratio should be extracted');
ok(nestedReturned.quality === 'low', 'nested returned quality should be extracted');
ok(nestedReturned.format === 'webp', 'nested returned format should be extracted');
ok(Number(nestedReturned.compression) === 64, 'nested returned compression should be extracted');
ok(nestedReturned.transparent === true, 'nested returned transparent flag should be extracted');
ok(nestedReturned.moderation === 'strict', 'nested returned moderation should be extracted');
ok(nestedReturned.count === 2, 'returned count should still prefer actual persisted images over response count');

if (typeof hooks.renderDetailModal === 'function') {
  hooks.setTestTasks([{
    id: 'detail-diff-task',
    status: 'success',
    prompt: 'detail diff prompt',
    requestedParams: {
      source: 'OpenAI · requested',
      resolution: '1K',
      aspectRatio: '9:16',
      quality: 'high',
      format: 'png',
      transparent: false,
      moderation: 'auto',
      count: 5
    },
    returnedParams: {
      response_format: {
        dimensions: '1600x900',
        aspect_ratio: '16:9',
        output_format: 'png',
        transparent_background: true
      },
      parameters: {
        quality: 'low',
        moderation_level: 'strict',
        image_count: 2
      }
    },
    images: [
      { blobId: 'detail-1', width: 1600, height: 900, type: 'image/png' },
      { blobId: 'detail-2', width: 1600, height: 900, type: 'image/png' }
    ],
    createdAt: Date.now(),
    startedAt: Date.now() - 1000,
    finishedAt: Date.now()
  }]);
  const detailHtml = hooks.renderDetailModal('detail-diff-task');
  const actualCount = (detailHtml.match(/actual-value/g) || []).length;
  ok(actualCount >= 6, 'detail modal should highlight returned differences for ratio, quality, format/transparent, moderation, and count');
  ok(!detailHtml.includes('返回不符'), 'detail modal should not render textual mismatch labels; yellow actual values are enough');
  ok(detailHtml.includes('16:9'), 'detail modal should show nested actual aspect ratio');
  ok(detailHtml.includes('low'), 'detail modal should show nested actual quality');
  ok(detailHtml.includes('strict'), 'detail modal should show nested actual moderation');
  ok(detailHtml.includes('2'), 'detail modal should show actual returned image count');
  const viewerHtml = typeof hooks.renderViewer === 'function' ? hooks.renderViewer({ taskId: 'detail-diff-task', index: 0 }) : '';
  ok(viewerHtml.includes('viewer-nav') && viewerHtml.includes('data-action="viewer-next"'), 'multi-image viewer should render next navigation');
  ok(viewerHtml.includes('1 / 2'), 'multi-image viewer should show the current image index');

  hooks.setTestTasks([{
    id: 'detail-google-4k-match',
    status: 'success',
    prompt: 'matched 4k',
    requestedParams: {
      provider: 'google',
      profileName: 'Nano Banana Pro',
      resolution: '4K',
      aspectRatio: '3:2',
      quality: 'high',
      format: 'png',
      transparent: true,
      count: 1
    },
    returnedParams: { resolution: '5056x3392', aspectRatio: '3:2', quality: 'high', format: 'png', transparent: true, count: 1 },
    images: [{ blobId: 'detail-4k', width: 5056, height: 3392, type: 'image/png' }],
    createdAt: Date.now(),
    finishedAt: Date.now()
  }]);
  const matchedDetailHtml = hooks.renderDetailModal('detail-google-4k-match');
  ok(matchedDetailHtml.includes('5056x3392'), 'detail modal should display concrete matched 4K dimensions');
  ok(matchedDetailHtml.includes('actual-value matched'), 'matched tier dimensions should use a neutral actual value chip');
  ok(!/param-card has-mismatch[\s\S]*5056x3392/.test(matchedDetailHtml), 'matched 4K dimensions should not render as yellow mismatch');
  ok(hooks.expectedProviderResolution({ provider: 'google', resolution: '4K', aspectRatio: '3:2' }) === '5056x3392', 'Google provider resolution table should expose 4K 3:2');
  ok(hooks.isTierResolutionMatch({ provider: 'google', resolution: '4K', aspectRatio: '3:2' }, '5056x3392', []), 'known provider tier resolution should match actual dimensions');
  ok(!hooks.isTierResolutionMatch({ provider: 'google', resolution: '4K', aspectRatio: '3:2' }, '2528x1696', []), 'downgraded 2K dimensions should not match a requested 4K tier');
}

const referenceBadgeHtml = hooks.renderReferenceBadge({
  id: 'task-ref-ui',
  referenceSnapshots: [{ id: 'ref-1', blobId: 'masked-ref', originalBlobId: 'original-ref', compositedBlobId: 'composited-ref' }]
}, 'detail');
ok(referenceBadgeHtml.includes('open-task-reference-viewer'), 'task reference badge should open the original reference viewer');
ok(!referenceBadgeHtml.includes('add-task-reference-to-composer'), 'task reference badge should no longer add references to the composer');
ok(hooks.taskReferenceDisplayBlobId({ blobId: 'masked-ref', originalBlobId: 'original-ref', compositedBlobId: 'composited-ref' }) === 'composited-ref', 'task reference thumbnail should display the composited/masked blob');
ok(hooks.taskReferenceOriginalBlobId({ blobId: 'masked-ref', originalBlobId: 'original-ref', compositedBlobId: 'composited-ref' }) === 'original-ref', 'task reference viewer should prefer the original blob');
ok(hooks.renderImageContextMenu({ x: 24, y: 32 }).includes('复制') && hooks.renderImageContextMenu({ x: 24, y: 32 }).includes('下载') && hooks.renderImageContextMenu({ x: 24, y: 32 }).includes('编辑'), 'custom image context menu should contain only copy/download/edit actions');

if (typeof hooks.shouldCloseModalFromClick === 'function') {
  const innerNode = { closest: (selector) => selector === '[data-stop]' ? {} : null };
  const layerNode = { closest: () => null };
  ok(hooks.shouldCloseModalFromClick({ dataset: { action: 'close-modal-bg' } }, innerNode) === false, 'clicking inside detail modal should not close it');
  ok(hooks.shouldCloseModalFromClick({ dataset: { action: 'close-modal-bg' } }, layerNode) === true, 'clicking the modal backdrop should close it');
}

ok(hooks.normalizeComparableValue('image/jpg', 'format') === 'jpeg', 'format comparison should normalize image/jpg to jpeg');
ok(hooks.normalizeComparableValue('是', 'bool') === 'yes', 'boolean comparison should normalize Chinese yes');

if (typeof hooks.providerPayload === 'function') {
  const googlePayload = hooks.providerPayload('google', {
    resolution: '4K',
    aspectRatio: '3:2'
  });
  ok(googlePayload.resolution === '4K', 'Google payload should use task snapshot resolution');
  ok(googlePayload.aspect_ratio === '3:2', 'Google payload should use task snapshot aspect ratio');
  ok(googlePayload.response_format === 'url', 'Google payload should use gateway-compatible string response_format');
  ok(googlePayload.image_size === '4K', 'Google payload should include flat image_size for Gemini-compatible providers');
  ok(googlePayload.size === '4K', 'Google payload should send the Gemini image tier as size');
  ok(googlePayload.extra_body?.generationConfig?.imageConfig?.aspectRatio === '3:2', 'Google payload should include Gemini imageConfig aspectRatio');
  ok(googlePayload.extra_body?.generationConfig?.imageConfig?.imageSize === '4K', 'Google payload should include Gemini imageConfig imageSize');
  ok(googlePayload.target_size === '5056x3392', 'Google 4K + 3:2 should map to official Gemini 3.1 4K dimensions');

  const xaiPayload = hooks.providerPayload('xai', {
    resolution: '2k',
    aspectRatio: '9:20'
  });
  ok(xaiPayload.resolution === '2k', 'Xai payload should use task snapshot resolution');
  ok(xaiPayload.aspect_ratio === '9:20', 'Xai payload should use task snapshot aspect ratio');
  ok(xaiPayload.response_format === undefined, 'Xai payload should not send response_format');

  const openAiPayload = hooks.providerPayload('openai', {
    resolution: '4K',
    aspectRatio: '9:16'
  });
  ok(openAiPayload.size === '2160x3840', 'OpenAI payload should convert 4K portrait ratio to the official 4K portrait canvas');
}

if (typeof hooks.googleOfficialImageSize === 'function') {
  ok(hooks.googleOfficialImageSize('4K', '3:2') === '5056x3392', 'Google official 4K + 3:2 should be 5056x3392');
  ok(hooks.googleOfficialImageSize('2K', '3:2') === '2528x1696', 'Google official 2K + 3:2 should match observed downgraded size');
}

if (typeof hooks.openAiSizePayload === 'function') {
  const expectedOpenAiSizes = {
    '1K': {
      '1:1': '1024x1024',
      '5:4': '1136x912',
      '9:16': '768x1360',
      '16:9': '1360x768',
      '4:3': '1168x880',
      '3:2': '1248x832',
      '4:5': '912x1136',
      '3:4': '880x1168',
      '2:3': '832x1248',
      '21:9': '1552x656'
    },
    '2K': {
      '1:1': '2048x2048',
      '5:4': '2288x1824',
      '9:16': '1536x2720',
      '16:9': '2720x1536',
      '4:3': '2352x1760',
      '3:2': '2496x1664',
      '4:5': '1824x2288',
      '3:4': '1760x2352',
      '2:3': '1664x2496',
      '21:9': '3120x1328'
    },
    '4K': {
      '1:1': '2880x2880',
      '5:4': '3216x2560',
      '9:16': '2160x3840',
      '16:9': '3840x2160',
      '4:3': '3312x2480',
      '3:2': '3520x2336',
      '4:5': '2560x3216',
      '3:4': '2480x3312',
      '2:3': '2336x3520',
      '21:9': '3824x1632'
    }
  };
  for (const [resolution, ratios] of Object.entries(expectedOpenAiSizes)) {
    for (const [aspectRatio, expectedSize] of Object.entries(ratios)) {
      ok(
        hooks.openAiSizePayload({ resolution, aspectRatio }) === expectedSize,
        `OpenAI ${resolution} + ${aspectRatio} should map to ${expectedSize}`
      );
      const [width, height] = expectedSize.split('x').map(Number);
      const [rw, rh] = aspectRatio.split(':').map(Number);
      ok(width % 16 === 0 && height % 16 === 0, `OpenAI ${resolution} + ${aspectRatio} should use dimensions divisible by 16`);
      ok(width * height <= (resolution === '4K' ? 3840 * 2160 : resolution === '2K' ? 2048 * 2048 : 1024 * 1024), `OpenAI ${resolution} + ${aspectRatio} should stay within the resolution pixel budget`);
      ok((rw >= rh && width >= height) || (rw < rh && width < height), `OpenAI ${resolution} + ${aspectRatio} should preserve orientation`);
    }
  }
}

(async () => {
  const runtimeOriginalFetch = sandbox.fetch;
  hooks.setTestState({
    preferences: {
      clearInputAfterSubmit: false,
      persistInputOnRestart: false,
      alwaysShowRetryButton: true,
      reuseTaskApiProfileTemporarily: false,
      allowPromptRewrite: true,
      enterSubmit: false
    },
    settings: {
      quality: 'low',
      output_format: 'jpeg',
      output_compression: 80,
      n: 1,
      transparent_output: false,
      moderation: 'auto'
    },
    activeProfileId: 'old-profile',
    activeImageProfileId: 'old-profile'
  });
  sandbox.fetch = async (url) => {
    if (String(url).includes('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', username: 'tester' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (String(url).includes('/.well-known/img-runtime-config.json')) return new Response(JSON.stringify({
      themeMode: 'dark',
      clearInputAfterSubmit: true,
      persistInputOnRestart: true,
      alwaysShowRetryButton: false,
      reuseTaskApiProfileTemporarily: true,
      allowPromptRewrite: false,
      enterSubmit: true,
      referenceImageEditAction: 'add-mask',
      zipDownloadRoutes: ['task-detail-all'],
      quality: 'high',
      output_format: 'png',
      output_compression: null,
      n: 3,
      transparent_output: true,
      moderation: 'low',
      profiles: [{ id: 'runtime-image', name: 'Runtime Image', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' }],
      activeProfileId: 'runtime-image'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return runtimeOriginalFetch(url);
  };
  await hooks.loadRuntime();
  sandbox.fetch = runtimeOriginalFetch;
  const runtimeState = hooks.getTestState();
  ok(runtimeState.preferences.clearInputAfterSubmit === true, 'runtime habit clearInputAfterSubmit should override local stale preference');
  ok(runtimeState.preferences.persistInputOnRestart === true, 'runtime habit persistInputOnRestart should override local stale preference');
  ok(runtimeState.preferences.alwaysShowRetryButton === false, 'runtime habit alwaysShowRetryButton=false should be preserved');
  ok(runtimeState.preferences.reuseTaskApiProfileTemporarily === true, 'runtime habit reuseTaskApiProfileTemporarily should apply');
  ok(runtimeState.preferences.allowPromptRewrite === false, 'runtime habit allowPromptRewrite=false should be preserved');
  ok(runtimeState.preferences.enterSubmit === true, 'runtime habit enterSubmit should apply');
  ok(runtimeState.preferences.referenceImageEditAction === 'add-mask', 'runtime reference edit action should apply');
  ok(runtimeState.preferences.zipDownloadRoutes.length === 1 && runtimeState.preferences.zipDownloadRoutes[0] === 'task-detail-all', 'runtime zip routes should apply');
  ok(runtimeState.settings.output_format === 'png' && runtimeState.settings.transparent_output === true && runtimeState.settings.n === 3, 'runtime toolbar generation settings should override stale local defaults');
  ok(runtimeState.activeProfileId === 'runtime-image' && runtimeState.activeImageProfileId === 'runtime-image', 'runtime active profile should override stale local profile');
  hooks.setTestState({
    settings: {
      quality: 'high',
      output_format: 'png',
      output_compression: 90,
      n: 1,
      transparent_output: false,
      moderation: 'auto'
    },
    preferences: {
      allowPromptRewrite: true,
      alwaysShowRetryButton: true
    }
  });

  const fakeGalleryScroll = {
    scrollTop: 640,
    scrollLeft: 12,
    scrollHeight: 1600,
    scrollWidth: 1000,
    clientHeight: 500,
    clientWidth: 300
  };
  const fakeGalleryRoot = {
    querySelector: (selector) => selector === '.gallery-scroll' ? fakeGalleryScroll : null
  };
  const galleryScrollSnapshot = hooks.captureGalleryScrollState(fakeGalleryRoot);
  ok(galleryScrollSnapshot.scrollTop === 640 && galleryScrollSnapshot.scrollLeft === 12, 'gallery scroll capture should record the inner scroll container position');
  fakeGalleryScroll.scrollTop = 0;
  fakeGalleryScroll.scrollHeight = 900;
  fakeGalleryScroll.clientHeight = 400;
  hooks.restoreGalleryScrollState(galleryScrollSnapshot, fakeGalleryRoot);
  await new Promise((resolve) => setTimeout(resolve, 5));
  ok(fakeGalleryScroll.scrollTop === 500, 'gallery scroll restore should clamp to the new maximum scroll position instead of jumping to top');
  ok(fakeGalleryScroll.scrollLeft === 12, 'gallery scroll restore should preserve horizontal offset');

  const completeMulti = hooks.taskCountInfo({ status: 'success', images: [{}, {}], expectedCount: 2, actualCount: 2 });
  ok(completeMulti.label === '完成 2/2', 'successful multi-image cards should display completed count');
  const partialMulti = hooks.taskCountInfo({ status: 'partial_success', images: [{}], expectedCount: 2, actualCount: 1 });
  ok(partialMulti.label === '未完成 1/2', 'partial multi-image cards should display unfinished count');
  const refBadgeHtml = hooks.renderReferenceBadge({
    id: 'task-ref-card',
    referenceSnapshots: [
      { id: 'r1', blobId: 'ref-blob', originalBlobId: 'ref-blob', name: 'ref.png' },
      { id: 'r2', blobId: 'ref-blob', originalBlobId: 'ref-blob', name: 'ref2.png' }
    ]
  });
  ok(refBadgeHtml.includes('task-reference-badge') && refBadgeHtml.includes('+1'), 'gallery cards should render a first reference thumbnail with extra count');
  const refStripHtml = hooks.renderTaskReferenceStrip({
    id: 'task-ref-detail',
    referenceSnapshots: [
      { id: 'r1', blobId: 'ref-blob', originalBlobId: 'ref-blob', name: 'ref.png' },
      { id: 'r2', blobId: 'ref-blob', originalBlobId: 'ref-blob', name: 'ref2.png' }
    ]
  });
  ok(refStripHtml.includes('detail-reference-strip') && (refStripHtml.match(/open-task-reference-viewer/g) || []).length === 2, 'detail modal should render all task reference thumbnails for original-image viewing');
  hooks.setTestState({ galleryVirtual: { scrollTop: 5000, viewportHeight: 700 } });
  const virtualWindow = hooks.galleryVirtualWindow(300);
  ok(virtualWindow.shouldVirtualize === true, 'large gallery should use virtualized rendering');
  ok(virtualWindow.endIndex - virtualWindow.startIndex < 90, 'virtual gallery should render only a bounded window of cards');
  const agentLogForAnchor = {
    scrollTop: 400,
    clientHeight: 600,
    getBoundingClientRect: () => ({ top: 100, bottom: 700 }),
    querySelectorAll: () => [
      { dataset: { agentMessageId: 'm1' }, getBoundingClientRect: () => ({ top: -200, bottom: 80 }) },
      { dataset: { agentMessageId: 'm2' }, getBoundingClientRect: () => ({ top: 140, bottom: 420 }) }
    ],
    querySelector: () => null
  };
  const agentAnchor = hooks.captureAgentScrollAnchor(agentLogForAnchor);
  ok(agentAnchor?.id === 'm2' && agentAnchor.offsetTop === 40, 'Agent scroll anchor should capture the first visible message relative to the log viewport');
  const restoredAgentLog = {
    scrollTop: 400,
    clientHeight: 600,
    getBoundingClientRect: () => ({ top: 100, bottom: 700 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ top: 260, bottom: 540 }) })
  };
  ok(hooks.restoreAgentScrollAnchor(restoredAgentLog, agentAnchor) === true, 'Agent scroll anchor restore should find the previous visible message');
  ok(restoredAgentLog.scrollTop === 520, 'Agent scroll anchor restore should keep the clicked/visible message at the same viewport offset after render');
  const paintedCanvas = { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }) };
  const emptyCanvas = { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }) }) };
  ok(hooks.maskCanvasHasPaint(paintedCanvas) === true, 'mask canvas paint detector should detect painted alpha');
  ok(hooks.maskCanvasHasPaint(emptyCanvas) === false, 'mask canvas paint detector should treat fully transparent mask as empty');
  const clonedRefs = await hooks.cloneReferenceSnapshots([{ id: 'r1', blobId: 'ref-blob', originalBlobId: 'ref-blob', name: 'ref.png', width: 10, height: 10 }]);
  ok(clonedRefs.length === 1 && clonedRefs[0].blobId !== 'ref-blob' && clonedRefs[0].originalBlobId === clonedRefs[0].blobId, 'task reference snapshots should clone blobs instead of sharing live composer references');

  let capturedRequest = null;
  sandbox.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return { ok: true, text: async () => JSON.stringify({ data: [] }) };
  };

  await hooks.sendGenerationRequest('google portrait', {
    resolution: '4K',
    aspectRatio: '9:16',
    quality: 'high',
    format: 'png',
    negativePrompt: '不要文字，不要水印',
    count: 2,
    moderation: 'auto'
  }, {
    profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image-preview' },
    references: []
  });
  const googleBody = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(googleBody.resolution === '4K', 'Google generation request body should include selected 4K resolution');
  ok(googleBody.aspect_ratio === '9:16', 'Google generation request body should include selected 9:16 aspect ratio');
  ok(googleBody.response_format === 'url', 'Google generation request body should use gateway-compatible string response_format');
  ok(googleBody.image_size === '4K', 'Google generation request body should include flat image_size');
  ok(googleBody.size === '4K', 'Google generation request body should send the Gemini image tier as size');
  ok(googleBody.extra_body?.generationConfig?.imageConfig?.aspectRatio === '9:16', 'Google generation request body should include Gemini imageConfig aspectRatio');
  ok(googleBody.extra_body?.generationConfig?.imageConfig?.imageSize === '4K', 'Google generation request body should include Gemini imageConfig imageSize');
  ok(googleBody.target_size === '3072x5504', 'Google 4K + 9:16 request body should include official target pixel size');
  ok(googleBody.prompt === 'google portrait', 'Google request prompt should remain exactly the user prompt');
  ok(googleBody.quality === 'high', 'Google generation request body should include selected quality');
  ok(googleBody.output_format === 'png', 'Google generation request body should include selected output format');
  ok(googleBody.negative_prompt === '不要文字，不要水印' && googleBody.negativePrompt === '不要文字，不要水印', 'JSON generation request should include extracted negative prompt aliases');
  ok(googleBody.transparent_background === false, 'Google png request body should explicitly include selected transparent background false value');
  ok(googleBody.background === 'auto', 'Google opaque png request body should include background=auto for gateway compatibility');
  ok(googleBody.moderation === 'auto', 'Google generation request body should include selected moderation');
  ok(Number(googleBody.n) === 1, 'Google generation request body should force n=1 so Gemini-compatible providers can be split and aggregated');

  await hooks.sendGenerationRequest('google transparent png generation', {
    resolution: '1K',
    aspectRatio: '1:1',
    quality: 'high',
    format: 'png',
    transparent: true,
    count: 1
  }, {
    profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image-preview' },
    references: []
  });
  const googleTransparentBody = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(googleTransparentBody.background === 'transparent', 'Google transparent png generation should include background=transparent for compatible gateways');
  ok(googleTransparentBody.transparent_background === true, 'Google transparent png generation should preserve legacy transparent_background=true for compatible gateways');

  let google4kFetchCount = 0;
  const google4kBodies = [];
  sandbox.fetch = async (url, options) => {
    google4kFetchCount += 1;
    capturedRequest = { url, options };
    google4kBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ data: [{ url: 'https://example.test/google-4k.png' }] })
    };
  };
  await hooks.sendGenerationRequest('google exact 4k payload', {
    resolution: '4K',
    aspectRatio: '3:2',
    count: 1
  }, {
    profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image-preview' },
    references: []
  });
  ok(google4kFetchCount === 1, 'Google 4K request should not first send a gateway-rejected response_format object');
  ok(google4kBodies[0].response_format === 'url', 'Google 4K request should use a string response_format accepted by OpenAI-compatible gateways');
  ok(google4kBodies[0].image_size === '4K' && google4kBodies[0].aspect_ratio === '3:2', 'Google 4K request should preserve selected image_size and aspect_ratio');
  ok(google4kBodies[0].size === '4K', 'Google 4K request should send size as the Gemini tier, not pixel dimensions');
  ok(google4kBodies[0].extra_body?.generationConfig?.imageConfig?.aspectRatio === '3:2', 'Google 4K request should preserve Gemini imageConfig aspectRatio');
  ok(google4kBodies[0].extra_body?.generationConfig?.imageConfig?.imageSize === '4K', 'Google 4K request should preserve Gemini imageConfig imageSize');
  ok(google4kBodies[0].target_size === '5056x3392', 'Google 4K request should preserve official target pixel size');

  sandbox.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return { ok: true, text: async () => JSON.stringify({ data: [] }) };
  };

  await hooks.sendGenerationRequest('google reference portrait', {
    resolution: '2K',
    aspectRatio: '2:3',
    quality: 'medium',
    format: 'webp',
    compression: 72,
    transparent: true,
    moderation: 'low',
    count: 2
  }, {
    profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image' },
    references: [{ blobId: 'ref-blob', name: 'reference.png' }]
  });
  const googleForm = capturedRequest?.options?.body;
  ok(googleForm && typeof googleForm.get === 'function', 'Google reference request should use FormData');
  ok(googleForm.getAll('image[]').length === 1 && googleForm.getAll('image').length === 0, 'Google reference FormData should keep SkyAPI-compatible image[] field');
  ok(googleForm.get('resolution') === '2K', 'Google reference FormData should include selected resolution');
  ok(googleForm.get('image_size') === '2K', 'Google reference FormData should include flat image_size');
  ok(googleForm.get('size') === '2K', 'Google reference FormData should send the Gemini image tier as size');
  ok(googleForm.get('aspect_ratio') === '2:3', 'Google reference FormData should include selected aspect ratio');
  ok(googleForm.get('response_format') === 'url', 'Google reference FormData should use gateway-compatible response_format');
  const googleFormExtra = JSON.parse(String(googleForm.get('extra_body') || '{}'));
  ok(googleFormExtra?.generationConfig?.imageConfig?.aspectRatio === '2:3', 'Google reference FormData should include Gemini imageConfig aspectRatio');
  ok(googleFormExtra?.generationConfig?.imageConfig?.imageSize === '2K', 'Google reference FormData should include Gemini imageConfig imageSize');
  ok(googleForm.get('quality') === 'medium', 'Google reference FormData should include selected quality');
  ok(googleForm.get('output_format') === 'webp', 'Google reference FormData should include selected output format');
  ok(String(googleForm.get('output_compression')) === '72', 'Google reference FormData should include selected compression for non-png output');
  ok(googleForm.get('moderation') === 'low', 'Google reference FormData should include selected moderation');
  ok(String(googleForm.get('n')) === '1', 'Google reference FormData should force n=1');

  await hooks.sendGenerationRequest('google reference transparent png', {
    resolution: '2K',
    aspectRatio: '2:3',
    quality: 'medium',
    format: 'png',
    compression: 72,
    transparent: true,
    moderation: 'low',
    count: 1
  }, {
    profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image' },
    references: [{ blobId: 'ref-blob', name: 'reference.png' }]
  });
  const googlePngForm = capturedRequest?.options?.body;
  ok(String(googlePngForm.get('transparent_background')) === 'true', 'Google png reference FormData should include selected transparent background value');
  ok(googlePngForm.get('output_compression') === null, 'Google png reference FormData should not include compression');
  ok(hooks.imageOutputParams({ format: 'png', transparent: true }).background === 'transparent', 'transparent png output params should include official OpenAI background=transparent');
  ok(hooks.imageOutputParams({ format: 'png', transparent: false }).background === 'auto', 'opaque png output params should include background=auto');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'openai', model: 'gpt-image-2' }) === true, 'gpt-image-2 OpenAI-compatible profiles should allow transparent background gateway requests');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'openai', model: 'gpt-image-1' }) === true, 'supported OpenAI image models should allow transparent background requests');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'google', model: 'gemini-3.1-flash-image-preview' }) === false, 'Google/Nano profiles should not claim OpenAI transparent-background support');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'xai', model: 'grok-imagine-image-pro' }) === false, 'Xai/Grok profiles should not claim OpenAI transparent-background support');

  const greenPixels = new Uint8ClampedArray([
    0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
    0, 255, 0, 255, 220, 40, 40, 255, 0, 255, 0, 255,
    0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255
  ]);
  ok(hooks.detectKeyColorFromPixels(greenPixels, 3, 3) === '#00FF00', 'transparent post-processing should detect green key color');
  hooks.removeKeyedBackgroundFromPixels(greenPixels, 3, 3, '#00FF00');
  ok(greenPixels[3] === 0 && greenPixels[19] === 255, 'green key background should become transparent while subject remains opaque');

  const magentaPixels = new Uint8ClampedArray([
    255, 0, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255,
    255, 0, 255, 255, 20, 220, 20, 255, 255, 0, 255, 255,
    255, 0, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255
  ]);
  ok(hooks.detectKeyColorFromPixels(magentaPixels, 3, 3) === '#FF00FF', 'transparent post-processing should detect magenta key color');
  hooks.removeKeyedBackgroundFromPixels(magentaPixels, 3, 3, '#FF00FF');
  ok(magentaPixels[3] === 0 && magentaPixels[19] === 255, 'magenta key background should become transparent while green subject remains opaque');

  await hooks.sendGenerationRequest('openai transparent png generation', {
    resolution: '1K',
    aspectRatio: '1:1',
    quality: 'high',
    format: 'png',
    transparent: true,
    moderation: 'auto',
    count: 1
  }, {
    profile: { id: 'openai-image', name: 'gpt-image2', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' },
    references: []
  });
  const openAiTransparentBody = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(openAiTransparentBody.background === 'transparent', 'OpenAI/gpt-image2 transparent png request should include background=transparent');
  ok(openAiTransparentBody.transparent_background === true, 'OpenAI/gpt-image2 transparent png request should preserve legacy transparent_background=true for SkyAPI compatibility');
  ok(openAiTransparentBody.prompt.includes('openai transparent png generation') && openAiTransparentBody.prompt.includes('#00FF00'), 'transparent mode should use an internal chroma-key effective prompt');
  ok(hooks.promptWithCanvasConstraint('主体贴纸', 'openai', { format: 'png', transparent: true }).includes('#00FF00'), 'transparent helper should build an internal chroma-key prompt');
  ok(hooks.promptWithCanvasConstraint('主体贴纸', 'openai', { format: 'png', transparent: false }) === '主体贴纸', 'opaque prompt helper should preserve the user prompt exactly');
  const transparentParams = hooks.getTransparentRequestParams({ output_format: 'jpeg', output_compression: 80, transparent: true });
  ok(transparentParams.output_format === 'png' && transparentParams.output_compression === null && transparentParams.transparent_background === true, 'transparent params should force PNG without compression');

  await hooks.sendGenerationRequest('openai reference edit', {
    resolution: '2K',
    aspectRatio: '1:1',
    quality: 'high',
    format: 'png',
    transparent: false,
    negative_prompt: '不要边框，不要裁切',
    moderation: 'auto',
    count: 1
  }, {
    profile: { id: 'openai-image', name: 'gpt-image2', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' },
    references: [{ blobId: 'ref-blob', name: 'reference.png' }]
  });
  const openAiEditForm = capturedRequest?.options?.body;
  ok(openAiEditForm && typeof openAiEditForm.getAll === 'function', 'OpenAI reference request should use FormData');
  ok(openAiEditForm.getAll('image').length === 1, 'OpenAI/gpt-image2 edits must send reference files as image');
  ok(openAiEditForm.getAll('image[]').length === 0, 'OpenAI/gpt-image2 edits must not send image[]');
  ok(openAiEditForm.get('negative_prompt') === '不要边框，不要裁切' && openAiEditForm.get('negativePrompt') === '不要边框，不要裁切', 'FormData edit request should include extracted negative prompt aliases');
  ok(openAiEditForm.get('response_format') === null || openAiEditForm.get('response_format') === 'b64_json', 'OpenAI/gpt-image2 edits should only include supported response_format values');

  await hooks.sendGenerationRequest('xai portrait', {
    resolution: '2k',
    aspectRatio: '9:20',
    quality: 'high',
    format: 'webp',
    compression: 80,
    count: 1
  }, {
    profile: { id: 'xai-image', name: 'Grok Image', provider: 'xai', model: 'grok-2-image' },
    references: []
  });
  const xaiBody = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(xaiBody.resolution === '2k', 'Xai generation request body should include selected resolution');
  ok(xaiBody.aspect_ratio === '9:20', 'Xai generation request body should include selected aspect ratio');
  ok(Number(xaiBody.output_compression) === 80, 'Xai generation request body should include selected compression');
  ok(xaiBody.response_format === undefined, 'Xai generation request body should not include response_format');

  await hooks.sendGenerationRequest('grok transparent png payload', {
    resolution: '1k',
    aspectRatio: '1:1',
    quality: 'high',
    format: 'png',
    transparent: true,
    count: 1
  }, {
    profile: { id: 'xai-image', name: 'Grok Image', provider: 'xai', model: 'grok-imagine-image-pro' },
    references: []
  });
  const grokTransparentBody = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(grokTransparentBody.background === 'transparent', 'Grok transparent png request should include official background=transparent field for compatible gateways');
  ok(grokTransparentBody.transparent_background === true, 'Grok transparent png request should preserve legacy transparent_background field for compatible gateways');

  await hooks.sendGenerationRequest('openai poster', {
    resolution: '4K',
    aspectRatio: '9:16',
    quality: 'high',
    format: 'png',
    count: 1
  }, {
    profile: { id: 'openai-image', name: 'OpenAI Image', provider: 'openai', model: 'gpt-image-2' },
    references: []
  });
  const openAiBody = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(openAiBody.size === '2160x3840', 'OpenAI generation request body should include selected resolution + ratio as official 4K portrait size');
  ok(openAiBody.prompt === 'openai poster', 'OpenAI generation request prompt should remain exactly the user prompt');

  const inferredParams = hooks.extractReturnedParams({}, {
    aspectRatio: '9:16',
    count: 1
  }, [
    { width: 2816, height: 1536, type: 'image/png' }
  ]);
  ok(inferredParams.aspectRatio === '16:9', 'returned aspect ratio should be inferred from image dimensions when upstream omits it');

  const grokMismatchParams = hooks.extractReturnedParams({
    resolution: '1024x1024',
    aspect_ratio: '1:1',
    quality: 'standard'
  }, {
    resolution: '2k',
    aspectRatio: '9:16',
    quality: 'high',
    format: 'png',
    transparent: false,
    moderation: 'auto',
    count: 1
  }, [
    { width: 1024, height: 1024, type: 'image/png' }
  ]);
  ok(grokMismatchParams.resolution === '1024x1024', 'Grok returned params should keep actual returned resolution');
  ok(grokMismatchParams.aspectRatio === '1:1', 'Grok returned params should keep actual returned aspect ratio');

  hooks.setTestTasks([{
    id: 'grok-detail-mismatch',
    status: 'success',
    prompt: 'grok portrait',
    providerFamily: 'xai',
    model: 'grok-imagine-image-quality',
    requestedParams: {
      source: 'Xai · Grok',
      resolution: '2k',
      aspectRatio: '9:16',
      quality: 'high',
      format: 'png',
      transparent: false,
      moderation: 'auto',
      count: 1
    },
    returnedParams: grokMismatchParams,
    images: [{ blobId: 'blob-grok-mismatch', width: 1024, height: 1024, type: 'image/png' }],
    createdAt: Date.now(),
    finishedAt: Date.now()
  }]);
  const grokDetailHtml = hooks.renderDetailModal('grok-detail-mismatch');
  ok(grokDetailHtml.includes('1024x1024') && grokDetailHtml.includes('1:1'), 'Grok detail modal should show actual returned resolution and aspect ratio when mismatched');
  ok((grokDetailHtml.match(/actual-value/g) || []).length >= 3, 'Grok detail modal should highlight mismatched resolution, ratio, and quality');
  ok(!grokDetailHtml.includes('返回不符'), 'Grok mismatch detail should use yellow actual values without extra mismatch copy');

  let requestCount = 0;
  sandbox.sendGenerationRequest = async (prompt, params) => ({
    data: [{ b64_json: Buffer.from(`image-${++requestCount}`).toString('base64') }],
    revised_prompt: prompt,
    count: Number(params.count) || 1
  });
  sandbox.persistResponseImages = async () => ([{ blobId: `blob-${requestCount}`, width: 1024, height: 1024, type: 'image/png' }]);
  const multi = await hooks.collectGenerationResult('three images', { count: 3 }, {
    profile: { id: 'openai-image', name: 'OpenAI Image', provider: 'openai', model: 'gpt-image-2' }
  });
  ok(multi.images.length === 1, 'non-Google generation collector should not auto top up missing images after one request');
  ok(multi.failedCount === 2, 'non-Google generation collector should report missing images as failed instead of retrying');
  ok(requestCount === 1, 'non-Google generation collector should only make one request');

  requestCount = 0;
  sandbox.sendGenerationRequest = async () => {
    requestCount += 1;
    if (requestCount === 2) throw new Error('mock split failure');
    return { data: [{ b64_json: Buffer.from(`google-image-${requestCount}`).toString('base64') }] };
  };
  sandbox.persistResponseImages = async () => ([{ blobId: `google-blob-${requestCount}`, width: 1024, height: 1024, type: 'image/png' }]);
  const persistedBatches = [];
  const googlePartial = await hooks.collectGenerationResult('google split images', { count: 3 }, {
    profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image' },
    onPersistedImages: (batch, snapshot) => persistedBatches.push({ batch, snapshot })
  });
  ok(googlePartial.images.length === 2, 'Google split collector should preserve successful images after a failed split request');
  ok(googlePartial.failedCount === 1, 'Google split collector should report failed split count');
  ok(googlePartial.partialErrors.length === 1, 'Google split collector should record the split failure reason');
  ok(requestCount === 3, 'Google split collector should continue to the remaining requested images without retrying the failed one');
  ok(persistedBatches.length === 2, 'Google split collector should notify after each persisted successful split image');
  ok(persistedBatches[0]?.snapshot?.images?.length === 1, 'Google split persisted callback should expose the first saved image before the whole task finishes');

  const commonPrefix = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9s=';
  const imageA = commonPrefix + Buffer.from('first-image-tail').toString('base64');
  const imageB = commonPrefix + Buffer.from('second-image-tail').toString('base64');
  const persistedImages = typeof hooks.persistResponseImages === 'function' ? await hooks.persistResponseImages({ data: [{ b64_json: imageA }, { b64_json: imageB }] }) : [];
  ok(persistedImages.length === 2, 'persistResponseImages should keep two base64 images with the same encoded prefix');

  let activeFetches = 0;
  let maxActiveFetches = 0;
  const originalFetch = sandbox.fetch;
  sandbox.fetch = async () => {
    activeFetches += 1;
    maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
    await new Promise((resolve) => setTimeout(resolve, 15));
    activeFetches -= 1;
    return { blob: async () => new Blob(['remote-image'], { type: 'image/png' }) };
  };
  const remotePersisted = await hooks.persistResponseImages({ data: [{ url: 'https://example.com/a.png' }, { url: 'https://example.com/b.png' }] });
  sandbox.fetch = originalFetch;
  ok(remotePersisted.length === 2, 'persistResponseImages should persist both remote URL images');
  ok(maxActiveFetches > 1, 'persistResponseImages should download multiple remote images concurrently');

  const inlineUrlImages = await hooks.persistResponseImages({
    data: [
      { url: `data:image/png;base64,${Buffer.from('nano-inline-a').toString('base64')}` },
      { image_url: `data:image/png;base64,${Buffer.from('nano-inline-b').toString('base64')}` }
    ]
  });
  ok(inlineUrlImages.length === 2, 'data URL images returned through url/image_url fields should both be persisted');
  ok(inlineUrlImages.every((image) => image.blobId && !String(image.remoteUrl || image.url || '').startsWith('data:')), 'persisted inline data URL images should not keep data URLs in task state');

  const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const fakeJpegInfo = await hooks.imageInfoFromBlob(new Blob([fakeJpegBytes], { type: 'image/png' }));
  ok(fakeJpegInfo.type === 'image/jpeg', 'imageInfoFromBlob should detect JPEG bytes even when the declared MIME type says PNG');
  ok(fakeJpegInfo.hasAlpha === undefined, 'JPEG byte payload should not be treated as transparent PNG');

  const localStorageWrites = [];
  sandbox.localStorage.setItem = (key, value) => localStorageWrites.push([key, value]);
  hooks.setTestTasks([{
    id: 'task-inline-url-store',
    status: 'success',
    images: [{ blobId: 'blob-inline-store', remoteUrl: `data:image/png;base64,${Buffer.from('should-not-store').toString('base64')}` }]
  }]);
  hooks.writeStore();
  const taskStoreWrite = localStorageWrites.find(([, value]) => String(value || '').includes('task-inline-url-store'));
  ok(taskStoreWrite && !String(taskStoreWrite[1]).includes('data:image'), 'writeStore should strip data URLs from persisted task image remoteUrl/url fields');

  const emergencyWrites = [];
  let emergencyStoreAttempts = 0;
  sandbox.localStorage.setItem = (key, value) => {
    if (String(value || '').includes('task-emergency-store')) {
      emergencyStoreAttempts++;
      if (emergencyStoreAttempts <= 2) throw new Error('quota exceeded');
    }
    emergencyWrites.push([key, value]);
  };
  hooks.setTestTasks([{
    id: 'task-emergency-store',
    status: 'success',
    prompt: 'nano two images',
    profileId: 'nano-profile',
    requestedParams: { count: 2, resolution: '4K', aspectRatio: '3:2' },
    returnedParams: { resolution: '5056x3392', aspectRatio: '3:2', count: 2 },
    expectedCount: 2,
    actualCount: 2,
    failedCount: 0,
    images: [
      { blobId: 'nano-1', width: 5056, height: 3392, type: 'image/png' },
      { blobId: 'nano-2', width: 5056, height: 3392, type: 'image/png' }
    ],
    rawResponse: { data: [{ b64_json: Buffer.alloc(4096, 1).toString('base64') }] }
  }]);
  hooks.writeStore();
  const emergencyStoreWrite = emergencyWrites.find(([, value]) => String(value || '').includes('task-emergency-store'));
  const emergencyPayload = emergencyStoreWrite ? JSON.parse(emergencyStoreWrite[1]) : null;
  const emergencyTask = emergencyPayload?.tasks?.find((task) => task.id === 'task-emergency-store');
  ok(emergencyStoreAttempts === 3, 'writeStore should try normal, compact, then emergency storage when quota writes fail');
  ok(emergencyTask?.status === 'success' && emergencyTask.images?.length === 2, 'emergency writeStore fallback must preserve successful multi-image task evidence');
  ok(emergencyTask?.expectedCount === 2 && emergencyTask?.actualCount === 2 && emergencyTask?.failedCount === 0, 'emergency writeStore fallback must preserve multi-image counts for refresh recovery');

  hooks.setTestState({
    profiles: [
      { id: 'current-openai', name: 'Current GPT Image', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' },
      { id: 'nano-profile', name: 'Nano Banana2', provider: 'google', apiMode: 'images', model: 'gemini-3.1-flash-image' }
    ],
    activeImageProfileId: 'current-openai',
    activeProfileId: 'current-openai'
  });
  const retryProfile = typeof hooks.resolveTaskProfile === 'function' ? hooks.resolveTaskProfile({
    profileId: 'nano-profile',
    requestedParams: { profileId: 'nano-profile' }
  }) : null;
  ok(retryProfile && retryProfile.model === 'gemini-3.1-flash-image', 'retry should resolve the original task image profile instead of the current composer profile');
  const missingRetryProfile = typeof hooks.resolveTaskProfile === 'function' ? hooks.resolveTaskProfile({ profileId: 'deleted-profile', requestedParams: { profileId: 'deleted-profile' } }) : undefined;
  ok(missingRetryProfile === null, 'retry should not silently fall back to the current composer profile when the original profile is missing');

  hooks.setTestState({
    profiles: [
      { id: 'fallback-text', name: 'Fallback Text', provider: 'openai', apiMode: 'responses', model: 'gpt-5.1' },
      { id: 'good-text', name: '5.4mini', provider: 'openai', apiMode: 'responses', model: 'gpt-5.4-mini' },
      { id: 'bad-image-as-text', name: 'Bad Image As Text', provider: 'openai', apiMode: 'responses', model: 'gpt-image-2' },
      { id: 'image-only', name: 'Image Only', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' },
      { id: 'xai-text', name: 'Xai Text', provider: 'xai', apiMode: 'responses', model: 'grok-4' }
    ],
    activeProfileId: 'fallback-text',
    agentConfig: { mode: 'hybrid', textProfileId: 'good-text', imageProfileId: 'image-only', webSearchEnabled: true },
    agent: {
      activeProjectId: 'project-1',
      projects: [{ id: 'project-1', name: '测试项目', prompt: '项目提示词', createdAt: 1, updatedAt: 1 }],
      inputDraft: '',
      webMode: 'on',
      reasoning: 'high',
      threadsByProject: {},
      messagesByThread: {},
      activeThreadIdByProject: {}
    }
  });
  const strictTextProfile = hooks.agentTextProfile();
  ok(strictTextProfile && strictTextProfile.id === 'good-text', 'hybrid Agent text profile should use the explicitly selected responses profile');

  hooks.setTestState({ agentConfig: { mode: 'hybrid', textProfileId: 'missing-text', imageProfileId: 'image-only', webSearchEnabled: true } });
  ok(hooks.agentTextProfile() === null, 'hybrid Agent text profile should not silently fall back when the selected responses profile is missing');
  hooks.setTestState({ agentConfig: { mode: 'hybrid', textProfileId: 'bad-image-as-text', imageProfileId: 'image-only', webSearchEnabled: true } });
  ok(hooks.agentTextProfile() === null, 'hybrid Agent text profile should reject image models saved as Responses profiles');
  ok(hooks.configuredAgentTextProfile()?.id === 'bad-image-as-text', 'configured Agent text profile should still expose the invalid selected profile for diagnostics');
  ok(/图片模型|gpt-image-2/.test(hooks.agentTextProfileInvalidReason()), 'invalid Agent text profile reason should explain that the selected model is an image model');

  hooks.setTestState({ agentConfig: { mode: 'hybrid', textProfileId: 'good-text', imageProfileId: 'image-only', webSearchEnabled: true } });
  ok(hooks.agentWebSearchSupported(strictTextProfile) === true, 'OpenAI responses Agent profile should support web search');
  ok(hooks.agentWebSearchSupported({ id: 'xai-text', provider: 'xai', apiMode: 'responses', model: 'grok-4' }) === true, 'Responses Agent profiles should be allowed to try web search through compatible gateways');
  ok(hooks.agentWebSearchSupported({ id: 'skyapi-text', provider: 'openai', apiMode: 'responses', model: 'gpt-5.4-mini', baseUrl: 'https://skyapi2026.com/v1' }) === true, 'OpenAI-compatible Responses relay profiles should be allowed to try web_search tools');

  const payload = hooks.buildAgentRequestPayload('你是基于什么模型的agent,当前北京时间是多少', {
    project: { id: 'project-1', name: '测试项目', prompt: '项目提示词' },
    history: [{ role: 'user', text: '上一条' }],
    textProfile: strictTextProfile
  });
  ok(Array.isArray(payload.tools) && payload.tools.length === 1 && payload.tools[0].type === 'web_search', 'supported Agent web search request should send official Responses web_search tools');
  ok(typeof payload.currentBeijingTime === 'string' && /北京时间/.test(payload.currentBeijingTime), 'Agent payload should inject current Beijing time context');
  ok(payload.currentModelSlug === 'gpt-5.4-mini', 'Agent payload should expose the actual model slug');
  ok(payload.webSearchEnabled === true, 'Agent payload should expose the runtime web search state');
  ok(!Object.prototype.hasOwnProperty.call(payload, 'reasoning'), 'normal Agent chat payload should not force Responses reasoning for compatible relays');
  ok(String(payload.instructions || '').includes('当前文本模型 slug') && String(payload.instructions || '').includes('项目专属提示词'), 'Agent payload should send CookSleep-style instructions context');
  ok(!String(payload.instructions || '').includes('必须输出 5 个方案'), 'Agent payload should not force five image prompt options');
  ok(String(payload.instructions || '').includes('默认只输出 1 个可直接使用的推荐 Prompt'), 'Agent payload should allow concise single-prompt image replies');
  ok(String(payload.instructions || '').includes('先追问，最多 3 个问题'), 'Agent payload should ask clarifying questions before prompting when requirements are incomplete');
  ok(String(payload.input || '').includes('当前北京时间') && String(payload.input || '').includes('当前文本模型 slug'), 'Agent payload input should mention Beijing time and actual model slug');
  const longAgentImageReply = '可以。先说明一点：我不能直接复刻角色。你可以直接用下面提示词生成： **中文提示词：** 一只原创的蓝色圆脸机器猫风格角色，手里抱着几枚金黄色圆形甜点，神情慌张，正在快速奔跑；后方一个原创的瘦弱男孩角色戴着圆框眼镜，穿简单休闲服，表情着急，正追赶前面的机器猫角色。整体构图有强烈的追逐动感，日系动画风，线条干净，色彩明亮，2D 插画，完整人物，全身，居中构图，透明背景，PNG，背景留空，无场景无地面无道具杂物。 **负面提示词：** 不要直接使用已有角色形象，不要版权角色，不要真实背景，不要街道。 如果你想，我还可以继续输出 Midjourney 版。';
  const extractedAgentPrompt = hooks.extractImagePromptFromAgentText(longAgentImageReply);
  ok(extractedAgentPrompt.includes('一只原创的蓝色圆脸机器猫风格角色'), 'Agent image prompt extraction should keep the labeled prompt body');
  ok(!extractedAgentPrompt.includes('可以。先说明') && !extractedAgentPrompt.includes('负面提示词') && !extractedAgentPrompt.includes('Midjourney'), 'Agent image prompt extraction should remove explanation, negative prompt, and follow-up options');
  const unlabeledAgentReply = '我不能直接为你生成哆啦A梦/大雄这种现有版权角色图片，但可以立刻给你一份 表情包夸张风 可直接出图的原创新提示词，效果会非常接近你要的“机器猫偷点心、男孩追赶、透明背景”的感觉，同时保留你强调的：后面追的是人，不是熊';
  const extractedUnlabeledPrompt = hooks.extractImagePromptFromAgentText(unlabeledAgentReply);
  ok(extractedUnlabeledPrompt.includes('机器猫偷点心') && extractedUnlabeledPrompt.includes('男孩追赶') && extractedUnlabeledPrompt.includes('透明背景'), 'Agent image prompt extraction should recover unlabeled concise visual prompt');
  ok(!/我不能直接|但可以|效果会非常接近|感觉/.test(extractedUnlabeledPrompt), 'unlabeled Agent prompt extraction should remove disclaimer/explanation text');
  const screenshotAgentReply = '我不能直接为你生成哆啦A梦/大雄这种现有版权角色图片，但可以立刻给你一份 表情包夸张风 可直接出图的原创新提示词，效果会非常接近你要的“机器猫偷点心、男孩追赶、透明背景”的感觉，同时保留你强调的：后面追的是人，不是熊';
  const screenshotPrompt = hooks.extractImagePromptFromAgentText(screenshotAgentReply);
  ok(screenshotPrompt === '机器猫偷点心、男孩追赶、透明背景，后面追赶者是人类男孩，不是熊，不是动物，PNG 透明背景', 'screenshot-style Agent reply should become a compact clean prompt');
  const markdownSectionAgentReply = '我不能直接为你生成**哆啦A梦/大雄**这种现有版权角色图片，但可以立刻给你一份**表情包夸张风”可直接出图**的原创提示词，效果会非常接近你要的“机器猫偷点心、男孩追赶、透明背景”的感觉，同时保留你强调的：**后面追的是人，不是熊**\n\n## 表情包夸张风 | 直接可用 Prompt ### 中文版\n一张 **透明背景** 的夸张搞笑表情包风 2D 插画，前面是一个 **原创蓝色圆脸机器猫风格角色**，白色肚皮，脖子上有铃铛感配饰，怀里抱着几块金黄色圆形夹心甜点，神情极度慌张，眼睛瞪大，张嘴，边跑边回头，动作夸张，像偷吃后被发现；后面是一个 **原创人类男孩** 正在疯狂追赶，**明确是人，不是熊，不是动物**，瘦高、短发，穿简单 T 恤、短裤、运动鞋，表情又气又急，张大嘴巴，伸手往前追，跑步姿势夸张滑稽。整体风格为 **搞笑表情包 + 日系动漫简化风**，线条清晰，表情非常丰富，动作有强烈速度感和喜剧感，人物完整全身，居中构图，**PNG 透明底**，无场景，无地面，无背景元素，无文字，无水印。\n\n### 负面提示词\n不要直接出现哆啦A梦、大雄等版权角色，不要完全照搬原作造型，不要熊，不要动物追赶者，不要真实背景，不要房间，不要街道，不要树木，不要桌椅，不要地面阴影，不要多余人物，不要文字，不要对白框，不要 logo，不要水印，不要边框，不要裁切，不要半身。\n\n--- ## 英文版\ntransparent background, funny meme-style 2D illustration, an original blue round-faced robot-cat style character with a white belly and bell-like collar accessory, clutching several golden round filled pastries, extremely panicked expression, wide eyes, open mouth, running fast while looking back, exaggerated action, comedic feeling; behind him, an original human boy is chasing wildly, **human boy, not a bear, not an animal**, slim build, short hair, simple T-shirt, shorts, sneakers, angry and frantic expression, mouth open, reaching forward while running, exaggerated goofy running pose, strong motion, cute anime meme style, clean lineart, bright colors, full body, centered composition, PNG, transparent background, no scenery, no floor, no text, no watermark';
  const markdownSectionPrompt = hooks.extractImagePromptFromAgentText(markdownSectionAgentReply);
  ok(markdownSectionPrompt.startsWith('一张 透明背景 的夸张搞笑表情包风 2D 插画'), 'Agent image prompt extraction should start at the markdown Chinese prompt section');
  ok(markdownSectionPrompt.includes('原创人类男孩') && markdownSectionPrompt.includes('PNG 透明底'), 'Agent image prompt extraction should preserve the positive prompt section content');
  ok(!/我不能直接|可直接出图|##|###|负面提示词|英文版|transparent background/.test(markdownSectionPrompt), 'Agent image prompt extraction should exclude disclaimers, markdown headings, negative prompts, and alternate language sections');
  const markdownSectionPrompts = hooks.extractAgentImagePrompts(markdownSectionAgentReply);
  ok(markdownSectionPrompts.prompt === markdownSectionPrompt, 'Agent image prompt bundle should include the same positive prompt');
  ok(markdownSectionPrompts.negativePrompt.includes('不要直接出现哆啦A梦') && markdownSectionPrompts.negativePrompt.includes('不要动物追赶者'), 'Agent image prompt bundle should extract the negative prompt section');
  ok(!/英文版|transparent background|##/.test(markdownSectionPrompts.negativePrompt), 'Agent negative prompt extraction should stop before alternate language sections');

  hooks.setTestState({
    agentConfig: { mode: 'hybrid', textProfileId: 'xai-text', imageProfileId: 'image-only', webSearchEnabled: true },
    agent: { webMode: 'on' }
  });
  const unsupportedPayload = hooks.buildAgentRequestPayload('测试联网', {
    project: { id: 'project-1', name: '测试项目', prompt: '项目提示词' },
    history: [],
    textProfile: { id: 'xai-text', provider: 'xai', apiMode: 'responses', model: 'grok-4' }
  });
  ok(Array.isArray(unsupportedPayload.tools) && unsupportedPayload.tools[0]?.type === 'web_search', 'Responses gateway Agent web search request should send official web_search tools');
  const workflowPayload = hooks.buildWorkflowAgentRequestPayload('生成电商主图工作流', {
    project: { id: 'project-1', name: '测试项目', prompt: '项目提示词' },
    textProfile: strictTextProfile,
    mode: 'planner'
  });
  ok(workflowPayload.model === 'gpt-5.4-mini', 'workflow Agent payload should use the configured text model');
  ok(!Object.prototype.hasOwnProperty.call(workflowPayload, 'reasoning'), 'workflow Agent payload should not force Responses reasoning for compatible relays');
  ok(String(workflowPayload.instructions || '').includes('workflow JSON') && String(workflowPayload.input || '').includes('生成电商主图工作流'), 'workflow planner payload should ask for workflow JSON without using the chat prompt');
  const workflowParams = hooks.workflowImageParams({
    config: { negativePrompt: '不要文字，不要水印', promptTemplate: '为 {{subject}} 生成图片' },
    nodes: [{ id: 'image', type: 'image', promptTemplate: '为 {{subject}} 生成图片' }]
  }, { id: 'openai-image', name: 'gpt-image2', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' }, 3);
  ok(workflowParams.count === 3, 'workflow image params should apply countPerRow');
  ok(workflowParams.negativePrompt === '不要文字，不要水印' && workflowParams.negative_prompt === '不要文字，不要水印', 'workflow image params should forward workflow negative prompt to image requests');
  const markdownHtml = hooks.renderSafeMarkdown('# 标题\n\n- 项目 A\n- 项目 B\n\n> 引用\n\n| 参数 | 值 |\n| --- | --- |\n| 模型 | gpt-image2 |\n\n```json\n{"a":1}\n```\n\n<script>xss(1)</script>');
  ok(markdownHtml.includes('<h2>标题</h2>') && markdownHtml.includes('<ul>') && markdownHtml.includes('<blockquote>') && markdownHtml.includes('<table>'), 'safe Markdown renderer should render headings, lists, blockquotes, and tables');
  ok(markdownHtml.includes('data-action="copy-agent-code"') && markdownHtml.includes('<code>'), 'safe Markdown renderer should render copyable code blocks');
  ok(!markdownHtml.includes('<script>') && markdownHtml.includes('&lt;script&gt;'), 'safe Markdown renderer should escape raw HTML');
  const fiveOptionReply = [
    '可以。我会用原创替代方案，不复刻现有版权角色。',
    '',
    '## 方案 1：稳妥透明表情包（推荐）',
    '**适合模型：** gpt-image2',
    '**推荐理由：** 最稳定，适合透明 PNG。',
    '**正向 Prompt：**',
    '原创蓝色机器猫风格角色偷点心逃跑，后面人类男孩追赶，PNG 透明背景，夸张表情，全身。',
    '**负面 Prompt：**',
    '不要版权角色，不要熊，不要动物追赶者，不要背景，不要文字，不要水印。',
    '',
    '## 方案 2：速度漫画感',
    '**适合模型：** Nano Banana Pro',
    '**推荐理由：** 动作更强。',
    '**正向 Prompt：**',
    '原创蓝色圆脸机器猫角色抱着甜点冲刺，速度线，人类男孩追赶，日系漫画感。',
    '**负面 Prompt：**',
    '不要真实街道，不要 logo，不要裁切。',
    '',
    '## 方案 3：极简贴纸',
    '**适合模型：** gpt-image2',
    '**推荐理由：** 最适合做贴纸。',
    '**正向 Prompt：**',
    '极简贴纸风原创蓝色机器猫角色和人类男孩追逐，透明底，粗描边。',
    '**负面 Prompt：**',
    '不要复杂背景，不要半身。',
    '',
    '## 方案 4：高级彩色插画',
    '**适合模型：** Grok',
    '**推荐理由：** 色彩更丰富。',
    '**正向 Prompt：**',
    '高饱和彩色插画，原创机器人猫角色偷点心，人类男孩追赶，欢乐夸张。',
    '**负面 Prompt：**',
    '不要阴影地面，不要多余人物。',
    '',
    '## 方案 5：国产模型稳妥版',
    '**适合模型：** 即梦 / 豆包 / 通义',
    '**推荐理由：** 中文理解更稳。',
    '**正向 Prompt：**',
    '中文最终版：透明背景，原创蓝色机器猫风格角色抱着甜点逃跑，后面人类男孩追赶。',
    '**负面 Prompt：**',
    '不要哆啦A梦，不要大雄，不要熊，不要动物。'
  ].join('\n');
  const promptOptions = hooks.extractAgentPromptOptions(fiveOptionReply);
  ok(promptOptions.length === 5, 'Agent prompt option parser should still extract five options when the model provides them');
  ok(promptOptions[0].recommended === true && hooks.recommendedAgentPromptOption(promptOptions).index === 1, 'Agent prompt option parser should mark the recommended option');
  ok(promptOptions[2].prompt.includes('极简贴纸') && promptOptions[2].negativePrompt.includes('不要复杂背景'), 'Agent prompt option parser should keep per-option positive and negative prompts');
  ok(hooks.parseAgentOptionSelection('/1') === 1 && hooks.parseAgentOptionSelection('用第3个') === 3 && hooks.parseAgentOptionSelection('5') === 5, 'Agent option selector should parse slash, Chinese ordinal, and bare number forms');
  const agentMessageHtml = hooks.renderAgentMessage({ id: 'msg-options', role: 'assistant', text: fiveOptionReply, createdAt: 0 });
  ok(agentMessageHtml.includes('agent-prose') && agentMessageHtml.includes('agent-prompt-option-card'), 'Agent message should render Markdown prose and prompt option cards');
  ok(agentMessageHtml.includes('data-option-index="1"') && agentMessageHtml.includes('生成推荐方案') && agentMessageHtml.includes('生成该方案'), 'Agent message should render main recommended generation and per-option generation buttons');
  ok(agentMessageHtml.includes('agent-option-shortcuts') && agentMessageHtml.includes('data-action="copy-agent-prompt"'), 'Agent message should render option shortcuts and prompt copy buttons');
  ok(!agentMessageHtml.includes('data-prompt='), 'Agent generation buttons should not embed the whole prompt in DOM attributes');
  const singleOptionReply = [
    '需求已经足够明确，我先给你一个可直接生成的版本。',
    '',
    '## 方案 1（推荐）：短视频广告分镜',
    '**适合模型：** gpt-image2',
    '**推荐理由：** 单一方向最贴合短视频广告。',
    '**正向 Prompt：**',
    '高完成度日系商业动画广告分镜，夏日街头，阳光强烈，年轻角色手持透明玻璃瓶饮料，清爽水珠，竖屏 9:16，三镜头拼接。',
    '**负面 Prompt：**',
    '不要品牌 logo，不要真实商标，不要低清，不要文字水印。'
  ].join('\n');
  const singleOptions = hooks.extractAgentPromptOptions(singleOptionReply);
  ok(singleOptions.length === 1 && singleOptions[0].negativePrompt.includes('不要品牌 logo'), 'Agent prompt option parser should support a single adaptive option with negative prompt');
  const singleMessageHtml = hooks.renderAgentMessage({ id: 'msg-single-option', role: 'assistant', text: singleOptionReply, createdAt: 0 });
  ok(singleMessageHtml.includes('生成图片') && singleMessageHtml.includes('生成该 Prompt'), 'single Agent prompt option should use concise generation labels');
  ok(!singleMessageHtml.includes('agent-option-shortcuts') && !singleMessageHtml.includes('生成推荐方案'), 'single Agent prompt option should not render multi-option shortcuts or recommended-plan copy');
  const clarificationReply = '我需要先确认 3 点：\n\n1. 你要竖屏短视频 9:16，还是横屏广告 16:9？\n2. 主要画面是人物、产品，还是纯场景？\n3. 你希望偏写实、动漫，还是手绘风？';
  const clarificationHtml = hooks.renderAgentMessage({ id: 'msg-clarify', role: 'assistant', text: clarificationReply, createdAt: 0 });
  ok(!clarificationHtml.includes('agent-prompt-option-card') && !clarificationHtml.includes('data-action="confirm-agent-image"'), 'clarifying Agent reply should not render prompt cards or image generation buttons');
  const frozenAnchor = hooks.freezeAgentScrollForRender({ id: 'msg-options', offsetTop: 96, scrollTop: 420 });
  const frozenState = hooks.getTestState();
  ok(frozenAnchor?.id === 'msg-options' && frozenState.agentScrollLock?.anchor?.id === 'msg-options' && frozenState.agentScrollState?.nearBottom === false, 'Agent option generation should be able to freeze the current scroll anchor before rendering task cards');
  hooks.releaseAgentScrollFreezeAfterRender();
  ok(hooks.getTestState().agentScrollLock?.keep === false, 'Agent scroll freeze should be released after the task-card render is scheduled');
  ok(hooks.shouldPreserveAgentScrollForTask({ id: 'task-agent', agentMessageId: 'msg-options' }) === true, 'Agent-linked task updates should preserve Agent scroll during task creation and completion renders');
  ok(hooks.shouldPreserveAgentScrollForTask({ id: 'task-gallery' }) === false, 'Gallery-only task updates should not force Agent scroll preservation');
  hooks.setTestState({ mode: 'agent', agentScrollLock: null, agentScrollState: { nearBottom: true, offsetFromBottom: 0 } });
  ok(hooks.shouldPreserveAgentScrollForTask({ id: 'task-current-mode' }) === true, 'Task updates while viewing Agent should preserve the current Agent scroll anchor');
  hooks.setTestTasks([
    { id: 'agent-task-1', status: 'success', prompt: '这是一段很长很长的生图提示词，不应该在 Agent 内嵌紧凑卡片中展示出来', images: [{ blobId: 'img-1' }], actualCount: 1, expectedCount: 1, apiElapsedMs: 61000 },
    { id: 'agent-task-2', status: 'running', prompt: '另一个很长提示词', images: [], actualCount: 0, expectedCount: 1, startedAt: Date.now() - 9000 }
  ]);
  const agentTaskMessageHtml = hooks.renderAgentMessage({ id: 'msg-tasks', role: 'assistant', text: '已开始生成', taskIds: ['agent-task-1', 'agent-task-2'], createdAt: 0 });
  ok(agentTaskMessageHtml.includes('agent-task-strip') && agentTaskMessageHtml.includes('agent-task-progress') && agentTaskMessageHtml.includes('data-action="open-detail"'), 'Agent embedded task cards should render as compact clickable progress cards');
  ok(!agentTaskMessageHtml.includes('不应该在 Agent 内嵌紧凑卡片中展示出来'), 'Agent embedded task cards should not show full image prompts');
  hooks.setTestState({
    agent: {
      attachments: [{ id: 'att-1', blobId: 'blob-1', name: 'brief.png', type: 'image/png', size: 2048, width: 1200, height: 800 }]
    }
  });
  const agentAttachmentComposerHtml = hooks.renderAgentComposer();
  ok(agentAttachmentComposerHtml.includes('data-action="agent-pick-attachment"') && agentAttachmentComposerHtml.includes('agent-attachment-tray') && agentAttachmentComposerHtml.includes('brief.png'), 'Agent composer should render upload attachment button and pending attachment tray');
  ok(agentAttachmentComposerHtml.includes('agent-image-attachment-thumb') && agentAttachmentComposerHtml.includes('data-agent-attachment-id="att-1"'), 'Agent image attachments should render as thumbnail previews instead of file-only chips');
  hooks.setTestState({ mode: 'agent', agent: { attachments: [] }, references: [] });
  await hooks.handlePaste({
    clipboardData: { files: [new Blob(['img'], { type: 'image/png' })] },
    preventDefault: () => {}
  });
  const pastedAgentState = hooks.getTestState();
  ok((pastedAgentState.agent.attachments || []).length === 1 && (pastedAgentState.references || []).length === 0, 'Pasted images in Agent mode should upload to Agent attachments, not gallery references');
  hooks.setTestState({ mode: 'agent', agent: { attachments: [] }, references: [] });
  const itemPasteFile = new Blob(['img-item'], { type: 'image/png' });
  await hooks.handlePaste({
    clipboardData: {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => itemPasteFile }]
    },
    preventDefault: () => {}
  });
  const itemPastedAgentState = hooks.getTestState();
  ok((itemPastedAgentState.agent.attachments || []).length === 1 && (itemPastedAgentState.references || []).length === 0, 'Pasted image clipboard items should upload to Agent attachments in Firefox/Chromium item-based paste flows');
  const plainAgentPayload = hooks.buildAgentRequestPayload('普通问题', {
    project: { name: '测试项目', prompt: '' },
    textProfile: { id: 'text', model: 'gpt-5.5', provider: 'openai', apiMode: 'responses' },
    history: []
  });
  ok(typeof plainAgentPayload.input === 'string', 'Agent payload without attachments should keep string input for compatibility');
  const multimodalAgentPayload = hooks.buildAgentRequestPayload('看这张图', {
    project: { name: '测试项目', prompt: '' },
    textProfile: { id: 'text', model: 'gpt-5.5', provider: 'openai', apiMode: 'responses' },
    history: [],
    attachmentSummary: '1. brief.png (image/png, 2KB, 1200x800)',
    attachmentText: '文本附件摘要',
    attachmentImageParts: [{ type: 'input_image', image_url: 'data:image/png;base64,abc' }]
  });
  ok(Array.isArray(multimodalAgentPayload.input) && multimodalAgentPayload.input[0].content.some((part) => part.type === 'input_image'), 'Agent payload with image attachments should use Responses multimodal content');

  const sseText = [
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"你好"}',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"，已收到。"}',
    'data: [DONE]'
  ].join('\n\n');
  const sseResponse = new Response(new TextEncoder().encode(sseText), { headers: { 'Content-Type': 'text/event-stream' } });
  const ssePayload = await hooks.consumeResponseTextStream(sseResponse);
  ok(ssePayload.output_text === '你好，已收到。', 'Agent should consume Responses SSE text deltas');

  const completedResponse = new Response(new TextEncoder().encode('data: {"type":"response.completed","response":{"output_text":"最终回答"}}\n\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  const completedPayload = await hooks.resolveResponsePayload({ __stream: true, response: completedResponse });
  ok(/最终回答/.test(completedPayload.output_text || ''), 'Agent should extract completed Responses SSE final text');

  const completedOutputResponse = new Response(new TextEncoder().encode('data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"数组最终回答"}]}]}}\n\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  const completedOutputPayload = await hooks.resolveResponsePayload({ __stream: true, response: completedOutputResponse });
  ok(/数组最终回答/.test(completedOutputPayload.output_text || ''), 'Agent should extract text from completed Responses output message snapshots');

  const streamFailureResponse = new Response(new TextEncoder().encode('data: {"type":"response.failed","error":{"message":"上游拒绝联网工具"}}\n\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  await hooks.consumeResponseTextStream(streamFailureResponse).then(
    () => ok(false, 'Agent failed stream should reject'),
    (err) => ok(/上游拒绝联网工具/.test(String(err?.message || err)), 'Agent failed stream should expose upstream error message')
  );

  const failureDetail = typeof hooks.agentFailureDetail === 'function' ? hooks.agentFailureDetail({
    normalized: { summary: 'timeout', detail: 'request aborted' },
    textProfile: strictTextProfile,
    startedAt: Date.now() - 1500,
    timeoutSeconds: 3,
    upstreamStatus: 504
  }) : '';
  ok(failureDetail.includes('gpt-5.4-mini') && failureDetail.includes('good-text'), 'Agent failure detail should include the selected text profile and model');
  ok(failureDetail.includes('请求耗时') && failureDetail.includes('504'), 'Agent failure detail should include request timing and upstream status');

  const migrated = hooks.migrateAgentThreads({
    activeProjectId: 'project-1',
    projects: [{ id: 'project-1', name: '测试项目', prompt: '项目提示词' }],
    conversations: {
      'project-1': [
        { id: 'm1', projectId: 'project-1', role: 'user', text: '你好', createdAt: 1 },
        { id: 'm2', projectId: 'project-1', role: 'assistant', text: '你好，我在', createdAt: 2 }
      ]
    }
  });
  const migratedThreadId = migrated.activeThreadIdByProject['project-1'];
  ok((migrated.threadsByProject['project-1'] || []).length === 1, 'legacy Agent conversations should migrate to one default thread per project');
  ok(Array.isArray(migrated.messagesByThread[migratedThreadId]) && migrated.messagesByThread[migratedThreadId].length === 2, 'migrated Agent default thread should preserve existing messages');

  const stalePending = hooks.migrateAgentThreads({
    activeProjectId: 'project-1',
    projects: [{ id: 'project-1', name: '测试项目', prompt: '项目提示词' }],
    threadsByProject: { 'project-1': [{ id: 'stale-thread', projectId: 'project-1', title: '旧对话', createdAt: 1, updatedAt: 1 }] },
    activeThreadIdByProject: { 'project-1': 'stale-thread' },
    messagesByThread: {
      'stale-thread': [
        { id: 'stale-pending', threadId: 'stale-thread', projectId: 'project-1', role: 'assistant', text: '正在思考...', pending: true, createdAt: Date.now() - 120000 }
      ]
    }
  });
  ok(stalePending.messagesByThread['stale-thread'][0].pending === false, 'stale pending Agent message should not remain thinking forever after restore');
  ok(stalePending.messagesByThread['stale-thread'][0].errorDetail, 'stale pending Agent message should keep an explanatory error detail');

  hooks.setTestState({
    agent: {
      activeProjectId: 'project-1',
      projects: [{ id: 'project-1', name: '测试项目', prompt: '项目提示词', createdAt: 1, updatedAt: 1 }],
      threadsByProject: { 'project-1': [{ id: 'thread-main', projectId: 'project-1', title: '主对话', createdAt: 1, updatedAt: 3 }] },
      messagesByThread: {
        'thread-main': [
          { id: 'u1', threadId: 'thread-main', projectId: 'project-1', role: 'user', text: '第一条', createdAt: 1 },
          { id: 'a1', threadId: 'thread-main', projectId: 'project-1', role: 'assistant', text: '第二条', createdAt: 2 },
          { id: 'u2', threadId: 'thread-main', projectId: 'project-1', role: 'user', text: '第三条', createdAt: 3 }
        ]
      },
      activeThreadIdByProject: { 'project-1': 'thread-main' }
    }
  });
  const branchedAgent = hooks.branchAgentThreadFromMessage('project-1', 'u2');
  const branchThreadId = branchedAgent.activeThreadIdByProject['project-1'];
  ok(branchThreadId && branchThreadId !== 'thread-main', 'branching from an Agent message should activate a new thread');
  ok((branchedAgent.messagesByThread[branchThreadId] || []).length === 3, 'branched Agent thread should copy message history up to the selected message');
  const clearedMessages = hooks.clearAgentThreadMessages(branchedAgent, branchThreadId);
  ok(Array.isArray(clearedMessages.messagesByThread[branchThreadId]) && clearedMessages.messagesByThread[branchThreadId].length === 0, 'clearing Agent thread should only remove messages from the active thread');
  ok((clearedMessages.messagesByThread['thread-main'] || []).length === 3, 'clearing Agent thread should not delete the original branch history');

  const agentStageHtml = hooks.renderAgentStage();
  const agentComposerHtml = hooks.renderAgentComposer();
  ok(!agentStageHtml.includes('默认预算'), 'Agent stage should no longer render workflow budget copy');
  ok(!agentComposerHtml.includes('agent-budget') && !agentComposerHtml.includes('预算'), 'Agent composer should no longer render a workflow budget control');

  hooks.setTestState({
    mode: 'agent',
    settings: {
      quality: 'high',
      output_format: 'png',
      output_compression: 90,
      n: 2,
      transparent_output: true,
      openaiSize: '4K',
      openaiAspectRatio: '3:2',
      googleBaseResolution: '2K',
      googleAspectRatio: '1:1',
      xaiResolution: '2k',
      xaiAspectRatio: '1:1'
    },
    activeImageProfileId: 'image-only',
    profiles: [
      { id: 'image-only', name: '画廊模型', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' },
      { id: 'image-alt', name: '备用模型', provider: 'google', apiMode: 'images', model: 'nano-banana-pro' },
      strictTextProfile
    ],
    agentConfig: { mode: 'hybrid', textProfileId: 'good-text', imageProfileId: 'image-only', webSearchEnabled: true },
    agent: {
      activeProjectId: 'project-compact',
      projects: [{ id: 'project-compact', name: '紧凑项目', prompt: '这是一条很长的项目提示词，需要在顶栏只显示一行并可以点击编辑。', createdAt: 1, updatedAt: 1 }],
      threadsByProject: {
        'project-compact': [
          { id: 'thread-main', projectId: 'project-compact', title: '主对话', createdAt: 1, updatedAt: 1 },
          { id: 'thread-alt', projectId: 'project-compact', title: '备选对话', createdAt: 2, updatedAt: 2 }
        ]
      },
      activeThreadIdByProject: { 'project-compact': 'thread-main' },
      messagesByThread: { 'thread-main': [], 'thread-alt': [] },
      imageSettings: null
    }
  });
  const compactAgentSidebar = hooks.renderSidebar();
  ok(!compactAgentSidebar.includes('agent-project-card') && !compactAgentSidebar.includes('Project'), 'Agent sidebar should not render the old Project block');
  hooks.setTestState({ mode: 'workflow' });
  const compactWorkflowSidebar = hooks.renderSidebar();
  ok(!compactWorkflowSidebar.includes('agent-project-card') && !compactWorkflowSidebar.includes('Project'), 'Workflow sidebar should not render the old Project block');
  const compactWorkflowHtml = hooks.renderWorkflowWorkspace({ id: 'project-compact', name: '紧凑项目', prompt: '工作流项目提示词' }, []);
  ok(compactWorkflowHtml.includes('data-action="open-agent-project-menu"'), 'Workflow workspace should expose the migrated project menu');
  hooks.setTestState({ mode: 'agent' });
  const compactStageHtml = hooks.renderAgentStage();
  ok(compactStageHtml.includes('data-action="open-agent-project-menu"'), 'Agent topbar should render the project menu trigger');
  ok(compactStageHtml.includes('agent-menu-bars') && !compactStageHtml.includes('项目菜单">⌄'), 'Agent project menu trigger should use a hamburger icon, not a chevron text button');
  ok(compactStageHtml.includes('data-action="open-agent-thread-menu"'), 'Agent topbar should render the custom conversation menu trigger');
  ok(compactStageHtml.includes('data-action="agent-project-edit-prompt"'), 'Agent project prompt line should be clickable for editing');
  ok(compactStageHtml.includes('agent-project-prompt-line'), 'Agent project prompt should use a one-line compact element');
  ok(!compactStageHtml.includes('agent-status-line') && !compactStageHtml.includes('联网开启') && !compactStageHtml.includes('联网关闭'), 'Agent topbar should not render web/text model status pills');
  ok(!compactStageHtml.includes('data-action="switch-agent-thread"') && !compactStageHtml.includes('<select'), 'Agent topbar should not use the native conversation select');
  ok(compactStageHtml.includes('data-action="clear-agent-thread"') && !compactStageHtml.includes('清空对话</button>'), 'Agent clear thread button should be icon-only');
  const projectMenuHtml = hooks.renderPopover({ type: 'agent-project-menu', rect: { left: 40, top: 40, bottom: 80 } });
  ok(projectMenuHtml.includes('agent-project-switch') && projectMenuHtml.includes('agent-project-new') && projectMenuHtml.includes('agent-project-rename') && projectMenuHtml.includes('agent-project-edit-prompt') && projectMenuHtml.includes('agent-project-delete'), 'Agent project menu should contain switch/new/rename/prompt/delete actions');
  ok(projectMenuHtml.includes('agent-project-menu-action'), 'Agent project menu footer actions should use compact menu action styling');
  const threadMenuHtml = hooks.renderPopover({ type: 'agent-thread-menu', rect: { left: 40, top: 40, bottom: 80 } });
  ok(threadMenuHtml.includes('agent-thread-select') && threadMenuHtml.includes('agent-thread-new') && threadMenuHtml.includes('agent-thread-delete'), 'Agent thread menu should contain select/new/delete actions');
  const compactComposerHtml = hooks.renderAgentComposer();
  ok(compactComposerHtml.includes('agent-unified-toolbar') && compactComposerHtml.includes('composer-param-zone') && compactComposerHtml.includes('composer-action-zone'), 'Agent composer should use one unified gallery-style toolbar row');
  ok(!compactComposerHtml.includes('agent-image-param-group'), 'Agent composer should not render the old second-row image param group');
  ok(compactComposerHtml.includes('data-action="open-agent-model-config"') && compactComposerHtml.includes('data-action="open-agent-resolution-modal"') && compactComposerHtml.includes('data-action="open-agent-size-modal"'), 'Agent image params should open gallery-style model/resolution/ratio controls');
  ok(compactComposerHtml.includes('data-action="open-agent-popover"') && compactComposerHtml.includes('data-action="open-agent-image-advanced"'), 'Agent image params should reuse gallery-style popovers and advanced gear');
  ok(compactComposerHtml.indexOf('文本模型') < compactComposerHtml.indexOf('生图模型') && compactComposerHtml.indexOf('生图模型') < compactComposerHtml.indexOf('data-action="agent-chat"'), 'Agent toolbar should keep text controls, image params, and send button in one row order');
  const initialAgentParams = hooks.agentImageParams();
  ok(initialAgentParams.profileName === '画廊模型' && initialAgentParams.resolution === '4K' && initialAgentParams.aspectRatio === '3:2' && initialAgentParams.transparent === true && initialAgentParams.count === 2, 'Agent image params should initialize from gallery settings on first use');
  hooks.setTestState({ settings: { openaiSize: '1K', openaiAspectRatio: '1:1', n: 1, transparent_output: false } });
  const independentAgentParams = hooks.agentImageParams();
  ok(independentAgentParams.resolution === '4K' && independentAgentParams.aspectRatio === '3:2' && independentAgentParams.transparent === true && independentAgentParams.count === 2, 'Agent image params should stay independent after gallery settings change');
  const afterNewThread = hooks.createAgentThread('project-compact', '新对话 09:30');
  ok((afterNewThread.threadsByProject['project-compact'] || []).some((thread) => thread.title === '新对话 09:30'), 'Agent thread creation helper should add and activate a new conversation');
  const singleThreadState = hooks.deleteAgentThread({
    activeProjectId: 'project-compact',
    projects: [{ id: 'project-compact', name: '紧凑项目', prompt: '' }],
    threadsByProject: { 'project-compact': [{ id: 'only-thread', projectId: 'project-compact', title: '唯一会话', createdAt: 1, updatedAt: 1 }] },
    activeThreadIdByProject: { 'project-compact': 'only-thread' },
    messagesByThread: { 'only-thread': [{ id: 'm1', text: '旧消息', role: 'user' }] }
  }, 'project-compact', 'only-thread');
  const replacementThreads = singleThreadState.threadsByProject['project-compact'] || [];
  ok(replacementThreads.length === 1 && replacementThreads[0].id !== 'only-thread' && Array.isArray(singleThreadState.messagesByThread[replacementThreads[0].id]), 'Deleting the final Agent conversation should create a new empty conversation');

  hooks.setTestState({
    agent: {
      activeProjectId: 'project-1',
      projects: [{ id: 'project-1', name: '测试项目', prompt: '' }],
      threadsByProject: { 'project-1': [{ id: 'pending-thread', projectId: 'project-1', title: '主对话', createdAt: 1, updatedAt: 1 }] },
      activeThreadIdByProject: { 'project-1': 'pending-thread' },
      messagesByThread: { 'pending-thread': [{ id: 'pending-msg', threadId: 'pending-thread', projectId: 'project-1', role: 'assistant', text: '正在思考...', pending: true, createdAt: Date.now() }] }
    }
  });
  ok(hooks.activeAgentHasPending() === true, 'Agent pending detector should identify active thinking messages');
  ok(hooks.renderAgentComposer().includes('正在思考') && hooks.renderAgentComposer().includes('disabled'), 'Agent composer should disable duplicate sends while a message is pending');
  ok(hooks.agentRequestTimeoutSeconds({ timeout: 3 }) === 3, 'Agent request timeout should follow the selected text profile timeout');

  if (failures.length) {
    console.error('Homepage task regression checks failed:');
    for (const failure of failures) console.error('- ' + failure);
    process.exit(1);
  }

  console.log('[homepage-task-regression] task restore, multi-image extraction, top-up requests, and returned params checks passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

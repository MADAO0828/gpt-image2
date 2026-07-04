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
  window: {},
  document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {} },
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
  sessionStorage: { getItem: () => null, removeItem: () => {} },
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
ok(typeof hooks.openAiSizePayload === 'function', 'openAiSizePayload hook missing');
ok(typeof hooks.googleOfficialImageSize === 'function', 'googleOfficialImageSize hook missing');
ok(typeof hooks.summarizeResponse === 'function', 'summarizeResponse hook missing');
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
  ok(googleBody.prompt.includes('3072x5504'), 'Google request prompt should reinforce official target pixel size');
  ok(googleBody.quality === 'high', 'Google generation request body should include selected quality');
  ok(googleBody.output_format === 'png', 'Google generation request body should include selected output format');
  ok(googleBody.transparent_background === false, 'Google png request body should explicitly include selected transparent background false value');
  ok(googleBody.moderation === 'auto', 'Google generation request body should include selected moderation');
  ok(Number(googleBody.n) === 1, 'Google generation request body should force n=1 so Gemini-compatible providers can be split and aggregated');

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

  await hooks.sendGenerationRequest('openai reference edit', {
    resolution: '2K',
    aspectRatio: '1:1',
    quality: 'high',
    format: 'png',
    transparent: false,
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
  ok(openAiBody.prompt.includes('9:16') && openAiBody.prompt.includes('竖版'), 'OpenAI generation request prompt should reinforce selected portrait aspect ratio');

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

  hooks.setTestState({ agentConfig: { mode: 'hybrid', textProfileId: 'good-text', imageProfileId: 'image-only', webSearchEnabled: true } });
  ok(hooks.agentWebSearchSupported(strictTextProfile) === true, 'OpenAI responses Agent profile should support web search');
  ok(hooks.agentWebSearchSupported({ id: 'xai-text', provider: 'xai', apiMode: 'responses', model: 'grok-4' }) === false, 'non-OpenAI Agent profile should not claim official Responses web search support');
  ok(hooks.agentWebSearchSupported({ id: 'skyapi-text', provider: 'openai', apiMode: 'responses', model: 'gpt-5.4-mini', baseUrl: 'https://skyapi2026.com/v1' }) === false, 'OpenAI-compatible relay profiles should not send official Responses web_search tools');

  const payload = hooks.buildAgentRequestPayload('你是基于什么模型的agent,当前北京时间是多少', {
    project: { id: 'project-1', name: '测试项目', prompt: '项目提示词' },
    history: [{ role: 'user', text: '上一条' }],
    textProfile: strictTextProfile
  });
  ok(Array.isArray(payload.tools) && payload.tools.length === 1 && payload.tools[0].type === 'web_search', 'supported Agent web search request should send official Responses web_search tools');
  ok(typeof payload.currentBeijingTime === 'string' && /北京时间/.test(payload.currentBeijingTime), 'Agent payload should inject current Beijing time context');
  ok(payload.currentModelSlug === 'gpt-5.4-mini', 'Agent payload should expose the actual model slug');
  ok(payload.webSearchEnabled === true, 'Agent payload should expose the runtime web search state');
  ok(String(payload.input || '').includes('当前北京时间') && String(payload.input || '').includes('当前文本模型 slug'), 'Agent payload input should mention Beijing time and actual model slug');

  hooks.setTestState({
    agentConfig: { mode: 'hybrid', textProfileId: 'xai-text', imageProfileId: 'image-only', webSearchEnabled: true },
    agent: { webMode: 'on' }
  });
  const unsupportedPayload = hooks.buildAgentRequestPayload('测试联网', {
    project: { id: 'project-1', name: '测试项目', prompt: '项目提示词' },
    history: [],
    textProfile: { id: 'xai-text', provider: 'xai', apiMode: 'responses', model: 'grok-4' }
  });
  ok(!unsupportedPayload.tools, 'unsupported Agent web search request should not send official web_search tools');

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

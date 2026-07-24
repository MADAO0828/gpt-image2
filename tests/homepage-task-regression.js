const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets', 'homepage-v3.js'), 'utf8');
const homeCss = fs.readFileSync(path.join(root, 'assets', 'homepage-v3.css'), 'utf8');
const macosCss = fs.readFileSync(path.join(root, 'assets', 'macos-design.css'), 'utf8');
const promptPage = fs.readFileSync(path.join(root, 'prompts.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const streamRuntimeSource = fs.readFileSync(path.join(root, 'assets', 'image-stream-runtime.js'), 'utf8');
const failures = [];
const fakeIndexedDbStore = new Map([
  ['ref-blob', new Blob(['reference'], { type: 'image/png' })]
]);
const fakeIndexedDbStores = new Map([
  ['blobs', fakeIndexedDbStore],
  ['agentThreads', new Map()]
]);
const createdObjectUrls = [];
const revokedObjectUrls = [];
const createdObjectUrlBlobs = new Map();
class TestURL extends URL {
  static createObjectURL(blob) {
    const url = URL.createObjectURL(blob);
    createdObjectUrls.push(url);
    createdObjectUrlBlobs.set(url, blob);
    return url;
  }
  static revokeObjectURL(url) {
    revokedObjectUrls.push(url);
    createdObjectUrlBlobs.delete(url);
    URL.revokeObjectURL(url);
  }
}
function imageResponse(body = 'image', type = 'image/png', ok = true) {
  return {
    ok,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? type : null },
    blob: async () => new Blob([body], { type })
  };
}

function ok(condition, message) {
  if (!condition) failures.push(message);
}

const sandbox = {
  console,
  TextDecoder,
  TextEncoder,
  AbortController,
  DOMException,
  window: {},
  navigator: {
    locks: {
      request: async (name, options, callback) => callback({ name, mode: options?.mode || 'exclusive' })
    }
  },
  document: {
    documentElement: { dataset: {}, setAttribute: () => {}, appendChild: (node) => node },
    body: { appendChild: (node) => node },
    createElement: () => ({ appendChild: () => {}, remove: () => {}, dataset: {}, style: {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  indexedDB: {
    open: () => {
      const req = {};
      req.result = {
        objectStoreNames: { contains: (name) => fakeIndexedDbStores.has(name) },
        createObjectStore: (name) => {
          if (!fakeIndexedDbStores.has(name)) fakeIndexedDbStores.set(name, new Map());
          return {};
        },
        transaction: (storeName) => {
          const tx = { oncomplete: null, onerror: null };
          let completed = false;
          const complete = () => {
            if (completed) return;
            completed = true;
            if (tx.oncomplete) tx.oncomplete();
          };
          if (storeName === 'tasks' && sandbox.failTaskStoreWrites) {
            setTimeout(() => {
              tx.error = new Error('IndexedDB quota exceeded');
              if (tx.onerror) tx.onerror();
            }, 0);
          }
          setTimeout(complete, 10);
          tx.objectStore = () => {
            const storeData = fakeIndexedDbStores.get(storeName) || new Map();
            fakeIndexedDbStores.set(storeName, storeData);
            return ({
            put: (blob, id) => {
              storeData.set(id, blob);
              setTimeout(complete, 0);
            },
            get: (id) => {
              const getReq = {};
              setTimeout(() => {
                getReq.result = storeData.get(id) || null;
                if (getReq.onsuccess) getReq.onsuccess();
              }, 0);
              return getReq;
            },
            getAll: () => {
              const getReq = {};
              setTimeout(() => {
                getReq.result = [...storeData.values()];
                if (getReq.onsuccess) getReq.onsuccess();
              }, 0);
              return getReq;
            },
            getAllKeys: () => {
              const getReq = {};
              setTimeout(() => {
                getReq.result = [...storeData.keys()];
                if (getReq.onsuccess) getReq.onsuccess();
              }, 0);
              return getReq;
            },
            delete: (id) => {
              storeData.delete(id);
              setTimeout(complete, 0);
            }
          });
          };
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
  failTaskStoreWrites: false,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout,
  clearTimeout,
  atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
  btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
  Blob,
  URL: TestURL,
  FormData: class {
    constructor() { this.fields = []; }
    append(key, value, filename) {
      // Native FormData exposes a File when a Blob is appended with a filename.
      let storedValue = value;
      if (filename !== undefined && value instanceof Blob) {
        storedValue = new Blob([value], { type: value.type });
        Object.defineProperty(storedValue, 'name', { value: String(filename), enumerable: true });
      }
      this.fields.push([key, storedValue, filename]);
    }
    get(key) {
      const found = this.fields.find((item) => item[0] === key);
      return found ? found[1] : null;
    }
    getAll(key) { return this.fields.filter((item) => item[0] === key).map((item) => item[1]); }
  },
  fetch: async () => imageResponse('x'),
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
vm.runInContext(streamRuntimeSource, sandbox, { filename: 'image-stream-runtime.js' });
vm.runInContext(source.replace(/\ninit\(\);\s*\n/, '\n'), sandbox, { filename: 'homepage-v3.js' });

const hooks = sandbox.window.__homepageV3TestHooks || {};
ok(typeof hooks.normalizeRestoredTask === 'function', 'normalizeRestoredTask hook missing');
ok(typeof hooks.collectImageCandidates === 'function', 'collectImageCandidates hook missing');
ok(typeof hooks.collectGenerationResult === 'function', 'collectGenerationResult hook missing');
ok(typeof hooks.postProcessTransparentImages === 'function', 'postProcessTransparentImages hook missing');
ok(typeof hooks.normalizeError === 'function', 'normalizeError hook missing');
ok(typeof hooks.taskErrorSummary === 'function', 'taskErrorSummary hook missing');
ok(typeof hooks.collectObjectsDeep === 'function', 'collectObjectsDeep hook missing');
ok(typeof hooks.compactAgentThreadMessages === 'function', 'compactAgentThreadMessages hook missing');
ok(typeof hooks.compactAgentMessagesByThreadForStorage === 'function', 'compactAgentMessagesByThreadForStorage hook missing');
ok(typeof hooks.persistAgentHistorySnapshots === 'function', 'persistAgentHistorySnapshots hook missing');
ok(typeof hooks.hydrateAgentHistoryFromDb === 'function', 'hydrateAgentHistoryFromDb hook missing');
ok(/agentHistoryPersistChain[\s\S]*\.then\(\(\) => performAgentHistoryPersist\(\)\)/.test(source), 'Agent archive writes should be serialized through one promise chain');
ok(typeof hooks.persistResponseImages === 'function', 'persistResponseImages hook missing');
ok(typeof hooks.imageInfoFromBlob === 'function', 'imageInfoFromBlob hook missing');
ok(typeof hooks.resolveTaskProfile === 'function', 'resolveTaskProfile hook missing');
ok(typeof hooks.imageProfile === 'function', 'imageProfile hook missing');
ok(typeof hooks.retryTask === 'function', 'retryTask hook missing');
ok(typeof hooks.extractReturnedParams === 'function', 'extractReturnedParams hook missing');
ok(typeof hooks.renderDetailModal === 'function', 'renderDetailModal hook missing');
ok(typeof hooks.renderViewer === 'function', 'renderViewer hook missing');
ok(typeof hooks.renderEntryAdvancedModal === 'function', 'renderEntryAdvancedModal hook missing');
ok(typeof hooks.normalizeResponseDelivery === 'function', 'normalizeResponseDelivery hook missing');
ok(typeof hooks.generateImageTask === 'function', 'generateImageTask hook missing');
ok(typeof hooks.appendAdvancedToFormData === 'function', 'appendAdvancedToFormData hook missing');
ok(typeof hooks.scheduleTaskRemovalPersistence === 'function', 'scheduleTaskRemovalPersistence hook missing');
ok(typeof hooks.resolveComposerPromptForRequest === 'function', 'resolveComposerPromptForRequest hook missing');
ok(typeof hooks.insertReferenceMention === 'function' && typeof hooks.remapReferenceMentionTokens === 'function', 'reference mention hooks missing');
for (const entry of ['gallery', 'agent', 'workflow', 'pro']) {
  let advancedHtml = '';
  try {
    advancedHtml = hooks.renderEntryAdvancedModal(entry);
  } catch (error) {
    advancedHtml = String(error?.message || error);
  }
  ok(advancedHtml.includes('data-modal-key="entry-advanced"') && advancedHtml.includes('entry-advanced-input'), `${entry} advanced settings modal should render without an exception`);
}
ok(source.includes("if (action === 'open-entry-advanced')")
  && source.includes("if (action === 'close-entry-advanced') { state.entryAdvancedModal = null; render(); return; }"), 'advanced settings modal open and close actions must remain wired');
ok(homeCss.includes(':root[data-theme="dark"] .entry-advanced-grid select option')
  && homeCss.includes('background: #202631;')
  && homeCss.includes('color: #f7fbff;'), 'dark advanced select options must define a readable native popup palette');
ok(typeof hooks.captureGalleryScrollState === 'function', 'captureGalleryScrollState hook missing');
ok(typeof hooks.restoreGalleryScrollState === 'function', 'restoreGalleryScrollState hook missing');
ok(typeof hooks.sanitizeReferenceSnapshots === 'function', 'sanitizeReferenceSnapshots hook missing');
ok(typeof hooks.cloneReferenceSnapshots === 'function', 'cloneReferenceSnapshots hook missing');
ok(typeof hooks.taskCountInfo === 'function', 'taskCountInfo hook missing');
ok(typeof hooks.renderReferenceBadge === 'function', 'renderReferenceBadge hook missing');
ok(typeof hooks.renderTaskReferenceStrip === 'function', 'renderTaskReferenceStrip hook missing');
ok(typeof hooks.editOutput === 'function', 'editOutput hook missing');
ok(typeof hooks.captureAgentScrollAnchor === 'function', 'captureAgentScrollAnchor hook missing');
ok(typeof hooks.restoreAgentScrollAnchor === 'function', 'restoreAgentScrollAnchor hook missing');
ok(typeof hooks.freezeAgentScrollForRender === 'function', 'freezeAgentScrollForRender hook missing');
ok(typeof hooks.releaseAgentScrollFreezeAfterRender === 'function', 'releaseAgentScrollFreezeAfterRender hook missing');
ok(typeof hooks.renderSafeMarkdown === 'function', 'renderSafeMarkdown hook missing');
ok(typeof hooks.extractAgentPromptOptions === 'function', 'extractAgentPromptOptions hook missing');
ok(typeof hooks.recommendedAgentPromptOption === 'function', 'recommendedAgentPromptOption hook missing');
ok(typeof hooks.parseAgentOptionSelection === 'function', 'parseAgentOptionSelection hook missing');
ok(typeof hooks.renderAgentMessage === 'function', 'renderAgentMessage hook missing');
ok(typeof hooks.renderAgentTaskCard === 'function', 'Agent task card renderer hook missing');
ok(typeof hooks.renderAgentAttachmentTray === 'function', 'Agent attachment tray renderer hook missing');
ok(typeof hooks.renderMaskEditor === 'function', 'mask editor renderer hook missing');
ok(typeof hooks.imageMaskSupportLabel === 'function', 'image mask support label hook missing');
ok(typeof hooks.agentAttachmentSummary === 'function', 'Agent attachment summary hook missing');
const openAiMaskSupportLabel = hooks.imageMaskSupportLabel({ provider: 'openai', apiMode: 'images', model: 'gpt-image-2' });
const googleMaskSupportLabel = hooks.imageMaskSupportLabel({ provider: 'google', apiMode: 'images', model: 'gemini-3.1-flash-image' });
const xaiMaskSupportLabel = hooks.imageMaskSupportLabel({ provider: 'xai', apiMode: 'images', model: 'grok-imagine-image' });
ok(openAiMaskSupportLabel.includes('像素遮罩') && !openAiMaskSupportLabel.includes('只发送原图'), 'OpenAI mask label should keep the pixel-mask contract');
ok([googleMaskSupportLabel, xaiMaskSupportLabel].every((label) => label.includes('黄色半透明标注合成图')
  && label.includes('提示词中说明标注区域')
  && label.includes('不发送独立 mask')),
  'Google/xAI mask labels should describe composited annotation, region prompt guidance, and no independent mask');
ok(typeof hooks.agentAttachmentBlobIds === 'function', 'Agent attachment Blob cleanup hook missing');
ok(typeof hooks.normalizeZipDownloadRoutes === 'function' && typeof hooks.routeAllowed === 'function', 'ZIP route normalization hooks missing');
const maskedAgentAttachment = {
  id: 'agent-mask-test',
  kind: 'image',
  type: 'image/png',
  name: 'masked.png',
  blobId: 'agent-base-blob',
  originalBlobId: 'agent-original-blob',
  compositedBlobId: 'agent-composited-blob',
  maskBlobId: 'agent-mask-blob'
};
const maskedAgentTrayHtml = hooks.renderAgentAttachmentTray([maskedAgentAttachment], true);
ok(maskedAgentTrayHtml.includes('has-mask')
  && maskedAgentTrayHtml.includes('已标注')
  && maskedAgentTrayHtml.includes('open-agent-attachment-mask-editor'), 'Agent image attachments with a saved mask should expose the mask editor and status badge');
const maskedAgentBlobIds = hooks.agentAttachmentBlobIds([maskedAgentAttachment]);
ok(['agent-base-blob', 'agent-original-blob', 'agent-composited-blob', 'agent-mask-blob'].every((id) => maskedAgentBlobIds.includes(id)), 'Agent attachment cleanup should retain base, original, composited, and mask Blob IDs');
const retryableAgentTaskHtml = hooks.renderAgentTaskCard({ id: 'agent-retry-test', status: 'error', error: 'request failed', images: [], expectedCount: 1, actualCount: 0, createdAt: Date.now() });
ok(retryableAgentTaskHtml.includes('data-action="retry-task"') && retryableAgentTaskHtml.includes('agent-task-retry'), 'embedded Agent task cards should expose retry for failed tasks');
const galleryComposerSource = source.slice(source.indexOf('function renderGalleryComposer()'), source.indexOf('function renderImageProfileSelect('));
const agentImageControlsSource = source.slice(source.indexOf('function renderAgentImageParamControls()'), source.indexOf('function renderAgentComposer()'));
ok(galleryComposerSource.includes('imageModerationSupported(profile)') && galleryComposerSource.includes('state.settings.moderation'), 'gallery moderation control should be gated by the active OpenAI Images profile and shared settings');
ok(agentImageControlsSource.includes('imageModerationSupported(profile)') && agentImageControlsSource.includes('state.settings.moderation'), 'Agent moderation control should use the same shared image settings');
const moderationActionSource = source.slice(source.indexOf('function setPopoverValue('), source.indexOf('function toggleTheme('));
ok(moderationActionSource.includes("state.settings.moderation = value === 'low' ? 'low' : 'auto';")
  && moderationActionSource.includes('settings.moderation = state.settings.moderation;'), 'gallery and Agent moderation actions should write one shared setting');
const proRenderTaskSource = source.slice(source.indexOf('async function renderProWorkbenchTask('), source.indexOf('async function hydrateProResult('));
const hydrateProResultSource = source.slice(source.indexOf('async function hydrateProResult('), source.indexOf('function renderPopover('));
ok(proRenderTaskSource.includes('imageModerationSupported(profile)')
  && !/transparent:\s*!\!state\.settings\.transparent_output,\s*moderation:/.test(proRenderTaskSource),
  'professional workbench task snapshots should only persist moderation for OpenAI Images profiles');
ok(hydrateProResultSource.includes('if (imageModerationSupported(activeProfile())) task.requestedParams.moderation')
  && !/transparent:\s*!\!state\.settings\.transparent_output,\s*moderation:/.test(hydrateProResultSource),
  'hydrated professional workbench result snapshots should gate moderation to the actual OpenAI request contract');
const generationSubmitSource = source.slice(source.indexOf('async function generateImageTask('), source.indexOf('function activeProject()'));
const clearInputOffset = generationSubmitSource.indexOf("if (!seedTask && state.preferences?.clearInputAfterSubmit)");
const clearInputBlock = clearInputOffset >= 0 ? generationSubmitSource.slice(clearInputOffset, generationSubmitSource.indexOf('try {', clearInputOffset)) : '';
ok(clearInputOffset >= 0
  && clearInputBlock.includes("state.composerPrompt = '';")
  && clearInputBlock.includes("promptInput.value = '';"), 'gallery submission should clear the visible and persisted prompt immediately after the task snapshot is saved');
const deleteProjectSource = source.slice(source.indexOf('async function performDeleteProject('), source.indexOf('async function saveAgentProjects('));
ok(deleteProjectSource.includes('deletingActiveProject ? agentAttachmentBlobIds(state.agent.attachments || []) : []')
  && deleteProjectSource.includes('state.agent.attachments = [];')
  && deleteProjectSource.includes('state.agentComposerMentionMenu = null;'), 'deleting the active Agent project should release and clear draft attachment state including mask Blob IDs');
const composeMaskSource = source.slice(source.indexOf('async function composeReferenceWithMask('), source.indexOf('async function saveMaskEditor('));
const saveMaskSource = source.slice(source.indexOf('async function saveMaskEditor('), source.indexOf('function applyPromptFromUrl('));
const prepareMaskSource = source.slice(source.indexOf('async function prepareEditReferenceFiles('), source.indexOf('function remoteImageLengthRange('));
ok(composeMaskSource.includes('return buildMaskSaveBundle(ref, draft);')
  && !composeMaskSource.includes('deleteUnreferencedBlobIds'), 'mask composition must run through the real bundle builder without deleting old Blobs mid-build');
ok(saveMaskSource.includes('composeReferenceWithMask(ref, draft)')
  && saveMaskSource.includes('const putTrackedBlob = async (blob)')
  && saveMaskSource.indexOf('await putBlob(blob)') < saveMaskSource.indexOf('createdBlobIds.push(id)'),
  'mask save must call composeReferenceWithMask and register each successful Blob immediately for rollback');
ok(saveMaskSource.includes('catch (error)')
  && saveMaskSource.includes('deleteUnreferencedBlobIds(createdBlobIds)'),
  'mask save must clean every already-created Blob when a later transaction step fails');
ok(prepareMaskSource.includes('first.ref.maskFormat !== OPENAI_MASK_FORMAT')
  && prepareMaskSource.includes('openAiMaskBlobFromLegacyOverlayBlob'),
  'legacy color overlay masks must be converted to OpenAI alpha semantics only at send time');
ok(source.includes('maskBaseCanvas') && source.includes('maskCanvas') && source.includes('maskAnnotationCanvas'),
  'mask editor must preserve separate base, mask, and annotation canvas layers');
ok(!/\b(alert|confirm|prompt)\s*\(/.test(source)
  && source.includes('pendingText')
  && source.includes('mask-text-input')
  && source.includes('confirm-mask-text')
  && source.includes('cancel-mask-text'),
  'mask text annotations must use the accessible in-editor textarea and must not call native dialogs');
const annotationOnlyAgentAttachment = { ...maskedAgentAttachment, maskBlobId: '', annotationBlobId: 'agent-annotation-blob' };
const annotationOnlyTrayHtml = hooks.renderAgentAttachmentTray([annotationOnlyAgentAttachment], true);
ok(annotationOnlyTrayHtml.includes('has-mask')
  && annotationOnlyTrayHtml.includes('已标注')
  && annotationOnlyTrayHtml.includes('open-agent-attachment-mask-editor'), 'Agent annotation-only image attachments should show marked status and keep the editor action');
const annotationOnlyBlobIds = hooks.agentAttachmentBlobIds([annotationOnlyAgentAttachment]);
ok(annotationOnlyBlobIds.includes('agent-annotation-blob'), 'Agent annotation-only cleanup should retain annotation Blob IDs');
const annotationOnlySummary = hooks.agentAttachmentSummary([annotationOnlyAgentAttachment]);
ok(annotationOnlySummary.includes('已保存标注') && !annotationOnlySummary.includes('已保存遮罩'), 'Agent annotation-only attachment summaries should show annotation status without calling it a mask');
const maskOnlySummary = hooks.agentAttachmentSummary([maskedAgentAttachment]);
ok(maskOnlySummary.includes('已保存遮罩') && !maskOnlySummary.includes('已保存标注'), 'Agent mask-only attachment summaries should retain the saved mask status');
const unmarkedSummary = hooks.agentAttachmentSummary([{ ...maskedAgentAttachment, maskBlobId: '', annotationBlobId: '' }]);
ok(!unmarkedSummary.includes('已保存遮罩') && !unmarkedSummary.includes('已保存标注'), 'Unmarked Agent attachment summaries should omit mask and annotation status');
ok(typeof hooks.expectedProviderResolution === 'function', 'expectedProviderResolution hook missing');
ok(typeof hooks.isTierResolutionMatch === 'function', 'isTierResolutionMatch hook missing');
ok(typeof hooks.taskReferenceDisplayBlobId === 'function', 'taskReferenceDisplayBlobId hook missing');
ok(typeof hooks.taskReferenceOriginalBlobId === 'function', 'taskReferenceOriginalBlobId hook missing');
ok(typeof hooks.readStore === 'function', 'readStore hook missing');
ok(typeof hooks.deleteUnreferencedBlobIds === 'function', 'shared Blob reference guard hook missing');
ok(typeof hooks.persistTaskStreamPartialCandidate === 'function', 'stream partial persistence hook missing');
ok(typeof hooks.retryTaskHistory === 'function' && typeof hooks.renderTaskRecoveryNotice === 'function', 'task history recovery hooks missing');
ok(typeof hooks.cardParamSummary === 'function', 'cardParamSummary hook missing');
ok(typeof hooks.renderImageContextMenu === 'function', 'renderImageContextMenu hook missing');
ok(typeof hooks.galleryVirtualWindow === 'function', 'galleryVirtualWindow hook missing');
ok(typeof hooks.measureGalleryMetrics === 'function', 'measureGalleryMetrics hook missing');
ok(typeof hooks.estimateGalleryCardHeight === 'function', 'estimateGalleryCardHeight hook missing');
ok(typeof hooks.galleryVirtualRangeChanged === 'function', 'galleryVirtualRangeChanged hook missing');
ok(typeof hooks.galleryVirtualWindowNeedsRefresh === 'function', 'galleryVirtualWindowNeedsRefresh hook missing');
ok(typeof hooks.promptRepoVirtualWindowNeedsRefresh === 'function', 'promptRepoVirtualWindowNeedsRefresh hook missing');
ok(typeof hooks.promptItemStableKey === 'function', 'promptItemStableKey hook missing');
ok(typeof hooks.promptRepoAnchorSelector === 'function', 'promptRepoAnchorSelector hook missing');
const duplicatePromptKeyA = hooks.promptItemStableKey({ id: 1, c: '分类 A', i: 'https://example.com/a.webp' }, 4);
const duplicatePromptKeyB = hooks.promptItemStableKey({ id: 1, c: '分类 B', i: 'https://example.com/b.webp' }, 4);
ok(duplicatePromptKeyA !== duplicatePromptKeyB, 'prompt virtual DOM keys must distinguish duplicate IDs from different categories or sources');
const duplicateAnchorSelectorA = hooks.promptRepoAnchorSelector({ anchorPromptKey: duplicatePromptKeyA, anchorIndex: '4', anchorId: '1' });
const duplicateAnchorSelectorB = hooks.promptRepoAnchorSelector({ anchorPromptKey: duplicatePromptKeyB, anchorIndex: '4', anchorId: '1' });
ok(duplicateAnchorSelectorA !== duplicateAnchorSelectorB
  && duplicateAnchorSelectorA.includes('data-prompt-key')
  && duplicateAnchorSelectorB.includes('data-prompt-key'), 'prompt viewport anchors must prefer stable prompt keys when duplicate IDs have different categories or sources');
ok(hooks.promptRepoAnchorSelector({ anchorIndex: '4', anchorId: '1' }).includes('data-index')
  && hooks.promptRepoAnchorSelector({ anchorId: '1' }).includes('data-id'), 'prompt viewport anchors should fall back from exact index to ID only when no stable key exists');
ok(source.includes('data-prompt-key') && source.includes('currentCards.get(key)'), 'prompt virtual DOM should reuse cards through stable prompt keys instead of raw IDs');
const standalonePromptGridCss = (promptPage.match(/\.grid\{[^}]*\}/) || [''])[0];
const standalonePromptCardCss = (promptPage.match(/\.card\{[^}]*\}/) || [''])[0];
ok(!standalonePromptGridCss.includes('content-visibility') && !standalonePromptCardCss.includes('content-visibility') && !standalonePromptCardCss.includes('animation:'), 'standalone prompt cards must not toggle content visibility or entry animations while scrolling');
ok(source.includes('function scheduleGalleryScrollRender()') && source.includes('function schedulePromptRepoScrollRender()'), 'scroll-specific virtual render schedulers should be present');
ok(source.includes('function cancelGalleryVirtualRender(options = {})') && source.includes('function cancelPromptRepoVirtualRender(options = {})'), 'virtual render cancellation guards should be present');
ok(source.includes('function requestRenderFrame(fn)') && source.includes('function cancelRenderFrame(frameId)'), 'scroll render frame helpers should be present');
ok(source.includes('galleryVirtualRenderFrame = requestRenderFrame(run)') && source.includes('promptRepoVirtualRenderFrame = requestRenderFrame(run)'), 'virtual renders should be queued on animation frames');
ok(source.includes('cancelRenderFrame(galleryVirtualRenderFrame)') && source.includes('cancelRenderFrame(promptRepoVirtualRenderFrame)'), 'pending virtual render frames should be cancelled');
ok(source.includes("setGalleryScrollActivity(true)") && source.includes("setPromptRepoScrollActivity(true)"), 'scroll handlers should enable the low-cost scrolling state');
ok(source.includes("clearTimeout(galleryScrollIdleTimer)") && source.includes("clearTimeout(promptRepoScrollIdleTimer)"), 'scroll idle timers should be cancellable during lifecycle cleanup');
ok(source.includes('galleryScrollLastAt = Date.now()')
  && source.includes('if (!galleryScrollIdleTimer) galleryScrollIdleTimer = setTimeout(finishGalleryScroll, SCROLL_END_FALLBACK_DELAY)')
  && source.includes('const remaining = SCROLL_END_FALLBACK_DELAY - (Date.now() - galleryScrollLastAt)'), 'gallery scrolling should use native scrollend with a coalesced fallback timer');
ok(source.includes('promptRepoScrollLastAt = Date.now()')
  && source.includes('if (!promptRepoScrollIdleTimer) promptRepoScrollIdleTimer = setTimeout(finishPromptRepoScroll, SCROLL_END_FALLBACK_DELAY)')
  && source.includes('const remaining = SCROLL_END_FALLBACK_DELAY - (Date.now() - promptRepoScrollLastAt)'), 'prompt repository scrolling should use native scrollend with a coalesced fallback timer');
ok(source.includes('const VIRTUAL_SCROLL_IDLE_DELAY = 220;'), 'scroll idle protection should tolerate discrete Chrome wheel intervals');
ok(source.includes('const SCROLL_END_FALLBACK_DELAY = 360;')
  && source.includes('function supportsNativeScrollEnd(node)')
  && source.includes("addEventListener('scrollend'")
  && source.includes("galleryScroll.addEventListener('scrollend', () => finishGalleryScroll(), { passive: true })")
  && source.includes("promptList.addEventListener('scrollend', () => finishPromptRepoScroll(), { passive: true })")
  && !source.includes("galleryScroll.addEventListener('scrollend', () => finishGalleryScroll(true)")
  && !source.includes("promptList.addEventListener('scrollend', () => finishPromptRepoScroll(true)"), 'native scrollend should share the bounded fallback instead of ending the low-cost mode per wheel tick');
ok(!source.includes('galleryScrollFrame') && !source.includes('promptRepoScrollFrame') && !source.includes('agentScrollFrame') && !source.includes('workflowScrollFrame'), 'scroll handlers should not schedule per-frame inspection work');
ok(source.includes('if (!refreshMode.needed) return refreshMode;')
  && source.includes('galleryVirtualHydratePending = true;')
  && source.includes('scheduleGalleryVirtualRender({ allowDuringScroll: true, immediate: refreshMode.immediate })')
  && source.includes('syncGalleryScrollPosition();\n  setGalleryScrollActivity(true);'), 'gallery scrolling should patch the virtual window on a coalesced animation frame when the visible range is crossed');
ok(source.includes('if ((galleryScrollActivity || isScrolling) && options.virtualScroll === true && options.allowDuringScroll !== true)')
  && source.includes('const forceHydrate = options.allowDuringScroll !== true')
  && source.includes('galleryVirtualHydratePending = true;\n    return false;'), 'gallery virtual patches should stay lightweight while the native scroll gesture is active');
const promptScrollInspection = source.slice(source.indexOf('function inspectPromptRepoScrollPosition()'), source.indexOf('function finishPromptRepoScroll()'));
ok(promptScrollInspection.includes('if (!promptRepoVirtualWindowNeedsRefresh()) return;')
  && promptScrollInspection.includes('promptRepoSyncPending = true;')
  && !promptScrollInspection.includes('schedulePromptRepoVirtualRender({ allowDuringScroll: true })'), 'prompt scrolling should defer virtual DOM patches until the native gesture is idle');
ok(source.includes("if (currentScroll.dataset.virtual !== '1') return { needed: false, immediate: false };") && source.includes("if (!currentList || currentList.dataset.virtual !== '1') return;"), 'non-virtual scrolling should skip virtual window work');
ok(source.includes('setGalleryScrollActivity(true);')
  && source.includes('scheduleGalleryScrollRender();')
  && source.includes('setPromptRepoScrollActivity(true);'), 'all gallery scrolling should use the low-cost visual state and shared idle cleanup');
ok(source.includes('function patchGalleryVirtualDom(') && source.includes('function patchPromptRepoVirtualDom('), 'virtual scroll updates should reuse existing DOM nodes');
ok(source.includes('patchGalleryVirtualDom(scroll, visibleTasks, windowState)') && source.includes('patchPromptRepoVirtualDom(promptList, promptWindow, promptItems)'), 'virtual scroll paths should use incremental DOM patching');
ok(source.includes('grid.ownerDocument?.createDocumentFragment?.()')
  && source.includes('promptList.ownerDocument?.createDocumentFragment?.()')
  && source.includes('const needsReorder = desiredCards.length !== currentOrder.length'), 'virtual window patches should batch DOM reordering instead of inserting every card separately');
ok(source.includes('for (const card of desiredCards)') && source.includes('grid.insertBefore(card, cursor)') && !source.includes('grid.replaceChildren('), 'gallery virtual updates should incrementally reuse and reorder cards without replacing the whole grid');
ok(source.includes('for (const node of desiredNodes)') && source.includes('promptList.insertBefore(node, cursor)') && !source.includes('promptList.replaceChildren('), 'prompt virtual updates should incrementally reuse and reorder cards without replacing the whole list');
ok(source.includes('loading="lazy" decoding="async" fetchpriority="low"'), 'gallery and Agent task images should decode asynchronously at low fetch priority');
ok(source.includes('data-gallery-preview="1"') && source.includes('function buildGalleryPreviewBlob(') && source.includes('function hydrateGalleryPreviewImage('), 'gallery and Agent cards should use bounded preview image hydration instead of decoding full-size originals during scroll');
ok(source.includes('function imageNearScrollViewport(') && source.includes('observeGalleryImage(img);\n        continue;'), 'deferred image hydration should discard offscreen work after a fast scroll');
ok(source.includes("rootMargin: '160px 0px'"), 'gallery image hydration should keep a bounded preload margin during scrolling');
const galleryScrollCss = homeCss.match(/\.gallery-scroll\s*\{([\s\S]*?)\}/)?.[1] || '';
ok(galleryScrollCss.includes('contain: layout paint;') && !galleryScrollCss.includes('isolation: isolate;') && !galleryScrollCss.includes('will-change: scroll-position') && galleryScrollCss.includes('overflow-anchor: none'), '主滚动容器应隔离布局和绘制，同时保留浏览器原生滚动路径');
ok(homeCss.includes('.gallery-scroll,\n  .agent-log') && homeCss.includes('-webkit-overflow-scrolling: touch'), '触摸滚动只在粗指针设备启用，桌面端保持原生滚动路径');
ok(homeCss.includes('.gallery-grid.is-virtual .asset-card') && !homeCss.includes('content-visibility: auto') && !homeCss.includes('contain-intrinsic-size:'), 'virtual gallery cards should rely on the bounded DOM window without activating content-visibility during scroll');
const assetCardCss = homeCss.match(/(?:^|\r?\n)\.asset-card\s*\{([\s\S]*?)\r?\n\}/)?.[1] || '';
const promptCardCss = homeCss.match(/(?:^|\r?\n)\.prompt-card\s*\{([\s\S]*?)\r?\n\}/)?.[1] || '';
ok(!assetCardCss.includes('content-visibility') && !assetCardCss.includes('contain-intrinsic-size'), 'non-virtual gallery cards should keep the browser native paint path');
ok(!promptCardCss.includes('content-visibility') && !homeCss.includes('.prompt-list.is-virtual .prompt-card'), 'prompt cards should keep the browser native paint path without a second content-visibility layer');
ok(!homeCss.includes('.gallery-scroll.is-scrolling .gallery-grid.is-virtual .asset-card') && !homeCss.includes('content-visibility: auto'), 'active gallery scrolling should avoid a full-card content-visibility activation pass');
ok(homeCss.includes('.gallery-scroll.is-scrolling > .gallery-grid > .asset-card') && !homeCss.includes('.gallery-stage.is-scrolling') && !homeCss.includes('.gallery-scroll .asset-media {'), 'scrolling should use a bounded visual downgrade on the actual card layer without nested media content-visibility work');
ok(homeCss.includes('.gallery-scroll') && homeCss.includes('overscroll-behavior: contain') && homeCss.includes('scroll-behavior: auto'), 'primary scroll containers should keep native scrolling and explicit scroll chaining');
ok(homeCss.includes('@media (hover: hover), (pointer: fine)')
  && homeCss.includes('.gallery-scroll,\n  .agent-log,\n  .workflow-stage-scroll,\n  .workflow-manager-scroll,\n  .prompt-list {\n    contain: layout;'), 'desktop scroll containers should avoid paint containment that can force Chromium main-thread scrolling');
ok(source.includes("galleryDeferredHydrations.set(img, hydrateGalleryPreviewImage);")
  && source.includes("if (galleryScrollActivity || $('.gallery-scroll')?.classList?.contains('is-scrolling'))"), 'gallery preview conversion should defer while the native gallery scroll gesture is active');
ok(source.includes('async function flushDeferredGalleryHydrations(limit = 1)')
  && source.includes('await hydrate(img, img.dataset.blobId, img.dataset.remoteUrl)')
  && source.includes('galleryHydrationFlushScheduled'), 'gallery hydration should resume from scroll idle in one awaitable idle job at a time');
ok(homeCss.includes('.agent-log') && homeCss.includes('.workflow-manager-scroll') && homeCss.includes('.prompt-list') && homeCss.includes('contain: layout paint;') && !homeCss.includes('will-change: scroll-position'), 'all long-running scroll containers should isolate layout and paint without permanent will-change promotion');
ok(homeCss.includes('.prompt-list.is-scrolling > .prompt-card .prompt-skeleton-media::after') && homeCss.includes('animation-play-state: paused'), 'prompt skeleton shimmer should stop repainting while the prompt list is scrolling');
ok(homeCss.includes('.prompt-list.is-scrolling > .prompt-card')
  && homeCss.includes('.workflow-manager-scroll.is-scrolling > .workflow-card-grid > .workflow-card')
  && homeCss.includes('backdrop-filter: none;'), 'homepage scroll surfaces should disable expensive card filters while scrolling');
ok(!promptPage.includes('html.is-scrolling .card')
  && !promptPage.includes('html.is-scrolling .card-img img')
  && !macosCss.includes('html.is-scrolling .c .grid .card'), 'standalone prompt repository scrolling must not mutate card visuals');
ok(!promptPage.includes('content-visibility:auto;')
  && !promptPage.includes('content-visibility: visible;')
  && !promptPage.includes('contain-intrinsic-size:')
  && !promptPage.includes('animation:cardIn')
  && promptPage.includes('contain:layout paint style;'), 'standalone prompt repository should keep layout containment without scroll-time visibility or animation changes');
ok(!macosCss.includes('html.is-scrolling'), 'shared macOS CSS must not override prompt card visuals during scroll');
ok(promptPage.includes('scroller.addEventListener("scroll",markPromptScrolling,{passive:true})')
  && !promptPage.includes('document.documentElement.classList.add("is-scrolling")')
  && !promptPage.includes('finishPromptScrolling'), 'standalone prompt repository should retain passive scroll observation without a visual state rewrite');
ok(promptPage.includes('function prefetchNextPage()')
  && promptPage.includes('prefetchCacheKey(page,viewKey)')
  && promptPage.includes('fetchWithAbort(url,{cache:"force-cache"},"prefetch")'), 'standalone prompt repository should use an independent prefetch request slot and cache key');
ok(promptPage.includes('new IntersectionObserver(function(entries)')
  && promptPage.includes('root:grid')
  && promptPage.includes('rootMargin:isMobileViewport()?"700px 0px":"900px 0px"'), 'standalone prompt repository should prefetch from a sentinel in the actual scroll grid');
ok(promptPage.includes('function appendItems(rows,startIdx)')
  && promptPage.includes('applyPagePayload(data,page,cachePageKey(page),{append:true})')
  && promptPage.includes('else if(!append)renderEmptyState'), 'standalone prompt repository should append successful pages and preserve existing cards on later-page failures');
ok(promptPage.includes('var PROMPT_DOM_LIMIT = ITEMS_PER_PAGE * 2;')
  && promptPage.includes('function evictPromptWindow(count)')
  && promptPage.includes('Math.ceil(overflow/ITEMS_PER_PAGE)')
  && promptPage.includes('filteredData=filteredData.slice(evictedCount).concat(nextRows)')
  && promptPage.includes('grid.scrollTop+=delta')
  && !promptPage.includes('if(filteredData.length>=PROMPT_DOM_LIMIT){clearSentinelObserver();return;}'), 'standalone prompt repository should keep a sliding bounded window, preserve scroll position, and continue prefetching after eviction');
ok(promptPage.includes('function hasMorePromptPage(page){return !!totalItems&&Math.max(0,(Number(page)||0)-1)*ITEMS_PER_PAGE<totalItems}')
  && promptPage.includes('if(!hasMorePromptPage(page)){clearSentinelObserver();return;}')
  && promptPage.includes('hasNext=hasMorePromptPage(currentPage+1)')
  && !promptPage.includes('if(!totalItems||page*ITEMS_PER_PAGE>=totalItems){clearSentinelObserver();return;}'), 'standalone prompt repository should load final partial pages and stop only after the current page end reaches total');
const paginationHelperStart = promptPage.indexOf('function hasMorePromptPage(page){');
const paginationHelperEnd = promptPage.indexOf('function loadCategories', paginationHelperStart);
if (paginationHelperStart >= 0 && paginationHelperEnd > paginationHelperStart) {
  const paginationContext = { ITEMS_PER_PAGE: 48, totalItems: 0 };
  vm.runInNewContext(`var ITEMS_PER_PAGE=48; var totalItems=0; ${promptPage.slice(paginationHelperStart, paginationHelperEnd)}`, paginationContext);
  for (const testCase of [
    { total: 49, page: 2, expected: true }, { total: 49, page: 3, expected: false },
    { total: 96, page: 2, expected: true }, { total: 96, page: 3, expected: false },
    { total: 97, page: 3, expected: true }, { total: 97, page: 4, expected: false },
    { total: 100, page: 3, expected: true }, { total: 100, page: 4, expected: false },
    { total: 144, page: 3, expected: true }, { total: 144, page: 4, expected: false },
    { total: 145, page: 4, expected: true }, { total: 145, page: 5, expected: false },
  ]) {
    paginationContext.totalItems = testCase.total;
    ok(paginationContext.hasMorePromptPage(testCase.page) === testCase.expected, `prompt pagination boundary failed for total=${testCase.total}, page=${testCase.page}`);
  }
} else {
  ok(false, 'prompt pagination boundary helper could not be evaluated');
}
ok(typeof hooks.buildGalleryPreviewBlob === 'function' && typeof hooks.hydrateGalleryPreviewImage === 'function', 'gallery preview hydration hooks missing');
ok(source.includes('if (!state.galleryVirtual) state.galleryVirtual = {};') && source.includes('classList.contains(\'is-scrolling\') !== next'), 'scroll handlers should avoid allocating state objects and mutating classes on every event');
ok(source.includes('if (isScrolling || galleryScrollActivity)') && source.includes('galleryVirtualHydratePending = true') && source.includes('const forceHydrate = galleryVirtualHydratePending || options.forceHydrate === true'), 'reference image hydration should be deferred during active scrolling and restored after scrolling stops');
ok(source.includes('const isVirtualUpdate = options.virtualScroll === true') && source.includes('if (!isVirtualUpdate) {\n    restoreGalleryScrollState(galleryScrollState);'), 'virtual gallery updates should avoid synchronous scrollHeight reads and scrollTop writes');
ok(source.includes('function unobserveGalleryImage(img)')
  && source.includes('galleryImageObservers.get(root)?.unobserve?.(img)'), 'removed virtual gallery images should be unobserved through their scroll-root observer');
ok(source.includes('function assetCardSignature(task)') && source.includes('data-card-signature'), 'virtual gallery cards should have stable signatures for incremental updates');
ok(source.includes("if ((options.virtualScroll === true || options.layoutChanged === true) && !galleryVirtualRangeChanged(windowState))"), 'content updates should not be skipped when the virtual window range is unchanged');
ok(source.includes("(scroll.dataset.virtual === '1' && windowState.shouldVirtualize)"), 'virtual gallery mode should be recalculated when task count crosses the virtualization threshold');
ok(source.includes('setAgentScrollActivity(true)') && source.includes('captureAgentScrollState({ positionOnly: true })'), 'Agent scroll handlers should avoid synchronous layout measurement');
ok(source.includes("const log = $('.agent-log');")
  && source.includes("log.classList.contains('is-scrolling') !== next")
  && homeCss.includes('.agent-log.is-scrolling .agent-task-card'), 'Agent scrolling should expose a local low-cost state and disable card effects in both browsers');
ok(source.includes('function imageHydrationScrollActive(img = null)')
  && source.includes('|| agentScrollActivity')
  && source.includes("img?.closest?.('.gallery-scroll, .agent-log')"), 'gallery and Agent image hydration should share the same scroll guard');
ok(source.includes('if (galleryPreviewPromises.get(job.key) === job) galleryPreviewPromises.delete(job.key)')
  && source.includes('if (job?.cancelled)')
  && source.includes('const previousJob = galleryPreviewConsumers.get(consumer)'), 'cancelled gallery preview jobs should not be reused and stale jobs must not delete replacements');
ok(source.includes('document.addEventListener(\'error\', handleManagedImageLoadError, true)')
  && source.includes('img.dataset.imageMissingReason')
  && homeCss.includes('图片加载失败，请重试或重新生成')
  && homeCss.includes('.agent-task-preview:has(img[data-image-missing="1"])'), 'managed image load failures should produce an explicit missing-image state');
ok(source.includes('const galleryImageObservers = new Map()')
  && source.includes('galleryImageObservers.get(root)')
  && source.includes('function disconnectGalleryImageObservers()'), 'IntersectionObserver instances should be isolated by scroll root');
ok(source.includes('document.addEventListener(\'scroll\'')
  && source.includes('capture: true'), 'nested Agent scrolling should close the image context menu in capture phase');
ok(source.includes('role="menuitem"')
  && source.includes('function moveImageContextMenuFocus(key)')
  && source.includes('if (state.imageContextMenu) { closeImageContextMenu(); return; }\n    if (state.viewer)'), 'image menus should focus an item, support keyboard navigation, and close before the viewer on Escape');
ok(!indexHtml.includes('id="app" class="home-v3" aria-live="polite"')
  && source.includes('id="toastStack" aria-live="polite"'), 'the application root should not expose the whole dynamic tree as a live region');
ok(source.includes('function syncGalleryScrollPosition()')
  && source.includes('function syncPromptRepoScrollPosition()')
  && !source.includes('requestRenderFrame(() => {\n      galleryScrollFrame')
  && !source.includes('requestRenderFrame(() => {\n      promptRepoScrollFrame'), 'scroll position should be sampled once after the idle boundary');
ok(source.includes('galleryDeferredHydrations') && source.includes('flushDeferredGalleryHydrations'), 'gallery image hydration should be deferred while the user is actively scrolling');
ok(source.includes('const promptRepoScrollSnapshot = state.promptRepo?.open ? capturePromptRepoViewportSnapshot() : null') && source.includes('restorePromptRepoViewportSnapshot(promptRepoScrollSnapshot)'), 'global renders should preserve the prompt repository viewport');
ok(source.includes('function scheduleGalleryHydrationFlush()') && source.includes('requestIdleCallback(run, { timeout: 250 })')
  && source.includes('function deferredGalleryHydrationLimit()')
  && source.includes('return 4;')
  && source.includes('flushDeferredGalleryHydrations(deferredGalleryHydrationLimit())'), 'gallery preview hydration should yield to scrolling while Agent images resume in bounded idle batches');
ok(source.includes('galleryHydrationDeferUntil = Date.now();')
  && !source.includes('galleryHydrationDeferUntil = Date.now() + GALLERY_POST_SCROLL_HYDRATION_DELAY')
  && source.includes('const delay = Math.max(0, galleryHydrationDeferUntil - Date.now())'), 'gallery hydration should resume immediately after scrolling settles while retaining bounded idle scheduling');
ok(source.includes('function scrollInteractionActive()') && source.includes('const scrolling = scrollInteractionActive()') && source.includes('if (scrollInteractionActive())') && source.includes('scheduleStoreWrite(delay);'), 'deferred state writes and full renders should wait until scrolling settles');
ok(source.includes('deferredRenderPending') && source.includes('scheduleDeferredRender()'), 'full renders should be deferred while a scroll interaction is active');
ok(source.includes('function markUserInteractionRender()')
  && source.includes('markUserInteractionRender();')
  && source.includes('!userInteractionRenderAllowed'), 'direct user interactions should render immediately without reopening the background refresh path during scrolling');
ok(source.includes('if (!agentScrollIdleTimer) agentScrollIdleTimer = setTimeout(finishAgentScroll, SCROLL_END_FALLBACK_DELAY)') && !source.includes('cancelRenderFrame(agentScrollCaptureFrame);'), 'Agent scroll state capture should keep one idle timer and support native scrollend');
ok(source.includes('agentScrollIdleTimer = 0;\n  const remaining = SCROLL_END_FALLBACK_DELAY - (Date.now() - agentScrollLastAt);'), 'Agent scroll idle timer should reset before rescheduling after a continuous scroll');
const agentScrollSchedule = source.slice(source.indexOf('function scheduleAgentScrollStateCapture()'), source.indexOf('function setAgentScrollActivity('));
ok(agentScrollSchedule.includes('setAgentScrollActivity(true)')
  && !agentScrollSchedule.includes('requestRenderFrame(')
  && !agentScrollSchedule.includes('clearTimeout(agentScrollIdleTimer)'), 'Agent scrolling should enter low-cost mode immediately and use one idle timer');
const workflowScrollSchedule = source.slice(source.indexOf('function scheduleWorkflowScrollCapture()'), source.indexOf('function renderSidebar('));
ok(workflowScrollSchedule.includes('setWorkflowScrollActivity(true)')
  && !workflowScrollSchedule.includes('requestRenderFrame(')
  && workflowScrollSchedule.includes('if (!workflowScrollIdleTimer)'), 'workflow scrolling should use one idle timer');
ok(source.includes("const classMismatch = scroll?.classList?.contains('is-scrolling') !== next")
  && source.includes("scroll.classList.toggle('is-scrolling', next)"), 'workflow scrolling should expose its low-cost visual state on the scroll container');
ok(source.includes('function setScrollTopIfNeeded(') && source.includes('setScrollTopIfNeeded(nextList'), 'scroll restoration should avoid redundant DOM scrollTop writes during active scrolling');
ok(source.includes('function syncWorkspaceScrollActivity()')
  && source.includes('滚动状态只保留在实际滚动容器')
  && !source.includes("workspace.classList.toggle('is-scroll-active'")
  && !homeCss.includes('.workspace.is-scroll-active'), 'scroll state bookkeeping should not toggle expensive global styles');
ok(source.includes('function schedulePromptRepoEdgeCheck(promptList)') && source.includes('promptRepoEdgeCheckFrame'), 'prompt repository edge checks should be coalesced per animation frame');
ok(source.includes('galleryScrollRestoreToken += 1') && source.includes('agentScrollRestoreToken += 1'), 'user scrolling should invalidate pending scroll restoration frames');
ok(source.includes('function galleryVirtualWindowRefreshMode(') && source.includes('function promptRepoVirtualWindowRefreshMode('), 'virtual scrolling should distinguish a buffered edge from an already-empty viewport');
ok(source.includes('const fallbackColumns = width <= 760 ? 1 : 3;'), 'prompt virtualization fallback columns should match the CSS grid breakpoints');
ok(source.includes('function galleryFilteredTaskCount()') && source.includes('filteredTaskCount: tasks.length') && source.includes('const refreshMode = galleryVirtualWindowRefreshMode()'), 'gallery scroll checks should reuse the rendered task count instead of sorting tasks on every scroll event');
ok(source.includes('const GALLERY_PREVIEW_CONCURRENCY = 2') && source.includes('function acquireGalleryPreviewSlot') && source.includes('function releaseGalleryPreviewSlot'), 'gallery preview conversion must have a bounded concurrency queue');
ok(source.includes('const galleryPreviewConsumers = new WeakMap()') && source.includes('function releaseGalleryImageWork(card)') && source.includes('galleryDeferredHydrations.delete(img)'), 'removed gallery cards should cancel pending preview work before decoding');
ok(source.includes('function pruneGalleryPreviewConsumers(job)') && source.includes('job.cancelled') && source.includes('job.consumers'), 'shared gallery preview jobs should stop when no live card consumes them');
ok(source.includes('let promptRepoSyncPending = false') && source.includes('if (promptRepoScrollIsActive())') && source.includes('if (promptRepoSyncPending) nextRenderFrame'), 'prompt repository pagination should defer DOM replacement until scrolling settles');
ok(source.includes('function syncPromptRepoView(options = {})')
  && source.includes('if (options.listOnly === true)')
  && source.includes('syncPromptRepoListOnly({'), 'prompt repository page appends should use a list-only patch path instead of remounting the modal');
ok(source.includes('function schedulePromptRepoPrefetch(options = {})')
  && source.includes('page: nextPage')
  && source.includes('prefetch: true')
  && source.includes('schedulePromptRepoPrefetch({ page: 1, requestSeq'), 'homepage prompt repository should prefetch page 2 after a successful page 1 result');
ok(source.includes('function promptRepoRequestIsCurrent(requestSeq)')
  && source.includes('if (!promptRepoRequestIsCurrent(requestSeq)) return null;')
  && source.includes('state.promptRepo.requestSeq !== requestSeq'), 'prompt repository responses and prefetches must be guarded by the active request generation');
const promptPageLoadSource = source.slice(source.indexOf('async function loadPromptPage('), source.indexOf('async function fullPromptItem('));
ok(promptPageLoadSource.includes('const hadItems = state.promptRepo.items.length > 0;')
  && promptPageLoadSource.includes('if (!hadItems) {')
  && promptPageLoadSource.includes("toast('提示词仓库加载失败')"), 'prompt repository page failures should retain existing items and only show an empty-state replacement for an initial empty load');
ok(source.includes("anchorPromptKey: ''")
  && source.includes('function promptRepoAnchorSelector(snapshot = {})')
  && source.includes('data-prompt-key="${cssEscape(promptKey)}"')
  && source.includes('data-id="${cssEscape(id)}"')
  && source.includes('const delays = [0, 24, 80, 180, 420]'), 'prompt repository viewport restoration should use a stable prompt key and bounded idle retries');
ok(homeCss.includes('.prompt-list {') && homeCss.includes('overflow-anchor: auto;'), 'prompt repository list should retain native overflow anchoring');
ok(source.includes('renderGalleryListOnly({ virtualScroll: true, allowDuringScroll })')
  && source.includes('options.allowDuringScroll !== true'), 'large gallery jumps should patch the virtual window in the current scroll frame without hydrating images inside that frame');
ok(source.includes('function syncAgentTaskCardDom(task)') && source.includes('function scheduleAgentTaskCardSync(task)'), 'Agent streaming updates should have a local task-card DOM path');
ok(source.includes('function scheduleAgentTaskCardSyncFrame()') && source.includes('function scheduleGalleryTaskCardSyncFrame()'), 'task-card updates should have explicit idle flush points after scrolling');
ok(source.includes('scheduleGalleryHydrationFlush();\n  scheduleGalleryTaskCardSyncFrame();'), 'gallery task updates should defer image hydration until the scroll idle boundary');
ok(source.includes('let promptRepoScrollRestoreToken = 0;')
  && source.includes('promptRepoScrollRestoreToken += 1;')
  && source.includes('restoreToken !== promptRepoScrollRestoreToken'), 'prompt repository restores should be invalidated by newer user scrolling');
ok(source.includes("if (agentScrollActivity || $('.agent-log')?.classList?.contains('is-scrolling'))") && source.includes("if (galleryScrollActivity || $('.gallery-scroll')?.classList?.contains('is-scrolling'))"), 'task-card DOM updates should be deferred during active scrolling');
ok(source.includes("if (!scheduleAgentTaskCardSync(task) && state.mode !== 'agent' && !galleryScrollActivity) renderGalleryListOnly();"), 'Agent streaming updates must not fall back to gallery or full-page rendering during scrolling');
ok(source.includes('data-prompt-spacer="top"') && source.includes('data-prompt-spacer="bottom"'), 'prompt virtualization should reuse stable top and bottom spacer nodes');
ok(source.includes('if (delay > 0 || !galleryVirtualRenderTimer) return;') && source.includes('if (delay > 0 || !promptRepoVirtualRenderTimer) return;'), 'immediate virtual scroll requests should upgrade pending delayed renders');
ok(typeof hooks.promptRepoVirtualWindow === 'function', 'promptRepoVirtualWindow hook missing');
ok(typeof hooks.render === 'function', 'render hook missing');
ok(typeof hooks.captureFocusState === 'function', 'captureFocusState hook missing');
ok(typeof hooks.restoreFocusState === 'function', 'restoreFocusState hook missing');
ok(typeof hooks.topVisibleModal === 'function', 'topVisibleModal hook missing');
ok(typeof hooks.syncModalAccessibility === 'function', 'syncModalAccessibility hook missing');
ok(typeof hooks.consumeImageStream === 'function', 'consumeImageStream hook missing');
ok(typeof hooks.consumeImageHttpResponse === 'function', 'consumeImageHttpResponse hook missing');
ok(typeof hooks.taskStreamPreviewRecord === 'function', 'taskStreamPreviewRecord hook missing');
ok(typeof hooks.taskStreamMediaCount === 'function', 'taskStreamMediaCount hook missing');
ok(typeof hooks.renderTaskStreamPreviewImage === 'function', 'renderTaskStreamPreviewImage hook missing');
ok(typeof hooks.normalizeImageQuality === 'function', 'normalizeImageQuality hook missing');
ok(hooks.classifyImageResponse('application/json', 'da') === 'undetermined', 'split SSE data prefix should remain undetermined until more bytes arrive');
ok(hooks.classifyImageResponse('text/event-stream', '{"data":[]}') === 'json', 'JSON content must win over a conflicting event-stream header after body sniffing');
ok(typeof hooks.fetchRemoteImageBlob === 'function', 'fetchRemoteImageBlob hook missing');
ok(typeof hooks.remoteImageFetchFailureSummary === 'function', 'remoteImageFetchFailureSummary hook missing');
ok(typeof hooks.classifyRemoteImageUrl === 'function' && typeof hooks.normalizeRemoteImageUrl === 'function', 'remote image URL classification hooks missing');
ok(hooks.remoteImageFetchFailureSummary([{ code: 'UPSTREAM_DNS_FAILED' }]) === '远程图片域名解析失败', 'remote image DNS failures should have a distinct summary');
ok(hooks.remoteImageFetchFailureSummary([{ code: 'BROWSER_NETWORK_OR_CORS' }, { code: 'REMOTE_IMAGE_NOT_IMAGE' }]) === '远程图片响应不是可识别的图片', 'remote image diagnostics should prefer the proxy image response outcome over a direct CORS failure');
ok(hooks.remoteImageFetchFailureSummary([{ category: 'PRIVATE_HOST' }]) === '远程图片地址不允许访问内部网络', 'local remote image policy failures should retain a deterministic summary');
ok(typeof hooks.hydrateBlobImage === 'function', 'hydrateBlobImage hook missing');
ok(typeof hooks.rememberObjectUrl === 'function', 'rememberObjectUrl hook missing');
ok(typeof hooks.mergeGenerationPartialErrors === 'function', 'mergeGenerationPartialErrors hook missing');
ok(typeof hooks.runtimeRenderSignature === 'function', 'runtimeRenderSignature hook missing');
ok(typeof hooks.updateRunningTimers === 'function', 'updateRunningTimers hook missing');
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
ok(typeof hooks.parseTaskAdvancedBoolean === 'function', 'parseTaskAdvancedBoolean hook missing');
ok(typeof hooks.entryAdvanced === 'function', 'entryAdvanced hook missing');
ok(typeof hooks.effectiveAdvanced === 'function', 'effectiveAdvanced hook missing');
ok(typeof hooks.applyAdvancedToJsonBody === 'function', 'applyAdvancedToJsonBody hook missing');
ok(typeof hooks.sanitizeTaskAdvanced === 'function', 'sanitizeTaskAdvanced hook missing');
ok(typeof hooks.snapshotTaskAdvanced === 'function', 'snapshotTaskAdvanced hook missing');
ok(typeof hooks.taskAdvancedDiagnostics === 'function', 'taskAdvancedDiagnostics hook missing');
ok(typeof hooks.compactTaskForStorage === 'function', 'compactTaskForStorage hook missing');
ok(typeof hooks.googleOfficialImageSize === 'function', 'googleOfficialImageSize hook missing');
ok(typeof hooks.summarizeResponse === 'function', 'summarizeResponse hook missing');
ok(typeof hooks.consumeResponseTextStream === 'function', 'consumeResponseTextStream hook missing');
ok(/req\.onblocked[\s\S]*setTimeout[\s\S]*旧标签页阻塞/.test(source), 'IndexedDB upgrade should fail fast with an actionable old-tab message when blocked');
ok(typeof hooks.resolveResponsePayload === 'function', 'resolveResponsePayload hook missing');
ok(typeof hooks.assertSuccessfulResponseTerminal === 'function', 'assertSuccessfulResponseTerminal hook missing');
ok(typeof hooks.agentTextProfile === 'function', 'agentTextProfile hook missing');
ok(typeof hooks.agentWebSearchSupported === 'function', 'agentWebSearchSupported hook missing');
ok(typeof hooks.agentRequestTimeoutSeconds === 'function', 'agentRequestTimeoutSeconds hook missing');
ok(typeof hooks.activeAgentHasPending === 'function', 'activeAgentHasPending hook missing');
ok(typeof hooks.buildAgentRequestPayload === 'function', 'buildAgentRequestPayload hook missing');
ok(typeof hooks.agentFailureDetail === 'function', 'agentFailureDetail hook missing');
ok(typeof hooks.migrateAgentThreads === 'function', 'migrateAgentThreads hook missing');
ok(typeof hooks.branchAgentThreadFromMessage === 'function', 'branchAgentThreadFromMessage hook missing');
ok(typeof hooks.clearAgentThreadMessages === 'function', 'clearAgentThreadMessages hook missing');
ok(typeof hooks.clearComposerText === 'function', 'clearComposerText hook missing');
ok(typeof hooks.renderAgentStage === 'function', 'renderAgentStage hook missing');
ok(typeof hooks.renderAgentComposer === 'function', 'renderAgentComposer hook missing');
ok(typeof hooks.renderWorkflowWorkspace === 'function', 'renderWorkflowWorkspace hook missing');
ok(typeof hooks.renderSidebar === 'function', 'renderSidebar hook missing');
ok(typeof hooks.renderPopover === 'function', 'renderPopover hook missing');
ok(typeof hooks.agentImageParams === 'function', 'agentImageParams hook missing');
ok(typeof hooks.agentImageSettings === 'function', 'agentImageSettings hook missing');
ok(typeof hooks.initialAgentImageSettings === 'function', 'initialAgentImageSettings hook missing');
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

const restoredTransparentFailure = hooks.normalizeRestoredTask({
  id: 'task-transparent-postprocess-failed',
  status: 'partial_success',
  error: '透明背景后处理失败：1 张已保留上游原图',
  errorDetail: '1. 透明背景后处理失败，已保留原图',
  expectedCount: 1,
  actualCount: 1,
  transparentRequested: true,
  transparentOutput: false,
  transparentFailedCount: 1,
  transparentPostProcessError: '透明背景后处理失败',
  images: [{ blobId: 'opaque-original', width: 1024, height: 1024, transparent: false }],
  returnedParams: { transparent: false, background: 'opaque' },
  finishedAt: Date.now()
});
ok(restoredTransparentFailure.status === 'partial_success', 'transparent postprocess failure must remain partial_success after restore');
ok(restoredTransparentFailure.transparentFailedCount === 1 && restoredTransparentFailure.images[0].transparent === false, 'transparent failure restore must preserve actual opaque result metadata');
ok(/透明背景后处理失败/.test(restoredTransparentFailure.error) && restoredTransparentFailure.errorDetail, 'transparent failure restore must preserve its readable error');

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

const restoredStreamPartial = hooks.normalizeRestoredTask({
  id: 'task-stream-interrupted',
  status: 'running',
  streamState: 'receiving',
  images: [],
  streamPartialImages: [
    { blobId: 'stream-first', outputIndex: 0, kind: 'first', receivedAt: 1 },
    { blobId: 'stream-latest', outputIndex: 0, kind: 'latest', receivedAt: 2 }
  ],
  error: ''
});
ok(restoredStreamPartial.status === 'partial_success', 'restored task with persisted stream previews should become partial_success');
ok(restoredStreamPartial.streamState === 'interrupted', 'restored stream preview task should record interrupted stream state');
ok(/不是最终输出/.test(restoredStreamPartial.error), 'restored stream preview task must clearly label previews as non-final');
ok(hooks.taskStreamMediaCount(restoredStreamPartial) === 1, 'stream preview output slots should produce a media count');
ok(hooks.taskStreamPreviewRecord(restoredStreamPartial, 0)?.blobId === 'stream-latest', 'latest persisted preview should be selected for display');
const streamPreviewHtml = hooks.renderTaskStreamPreviewImage(restoredStreamPartial, 0);
ok(streamPreviewHtml.includes('data-blob-id="stream-latest"') && streamPreviewHtml.includes('流式预览'), 'persisted preview should render through blob hydration');
const restoredStreamDiagnostics = hooks.normalizeRestoredTask({
  id: 'task-stream-diagnostics',
  status: 'error',
  error: 'IMAGE_STREAM_UPSTREAM_FAILED',
  traceId: 'trace-restored-1',
  streamEventCount: 999999999,
  lastStreamEventType: 'x'.repeat(200),
  streamEvents: Array.from({ length: 40 }, (_, index) => ({
    type: index === 39 ? 'error' : 'image_generation.chunk',
    status: index === 39 ? 'failed' : '',
    id: 'https://secret.example/event/' + index,
    message: 'must not persist',
    prompt: 'must not persist',
    b64_json: 'must not persist',
    candidateCount: 999,
    dataCount: 999,
    keys: ['error', 'prompt', 'message', 'url', 'b64_json', 'safe_key'],
    hasError: index === 39
  }))
});
ok(restoredStreamDiagnostics.traceId === 'trace-restored-1', 'restored task should preserve a safe trace id');
ok(restoredStreamDiagnostics.streamEventCount === 1000000, 'restored stream event count should be bounded');
ok(restoredStreamDiagnostics.lastStreamEventType.length === 80, 'restored last stream event type should be bounded');
ok(restoredStreamDiagnostics.streamEvents.length === 24, 'restored stream events should keep only the bounded tail');
const restoredStreamDiagnosticsJson = JSON.stringify(restoredStreamDiagnostics);
ok(!/must not persist|https:\/\/secret\.example|b64_json|prompt|message|url/i.test(restoredStreamDiagnosticsJson), 'restored stream diagnostics must omit payload, Base64, prompt, message, and URL data');

const openAiAdvancedSnapshot = hooks.snapshotTaskAdvanced({
  responseFormatB64Json: true,
  streamImages: false,
  streamPartialImages: 2,
  timeout: 6000,
  apiKey: 'must not persist',
  prompt: 'must not persist'
}, { provider: 'openai', apiMode: 'images', model: 'gpt-image-2' });
ok(openAiAdvancedSnapshot?.responseFormatB64Json === true, 'advanced task snapshot should preserve enabled b64_json');
ok(openAiAdvancedSnapshot?.streamImages === false, 'advanced task snapshot should preserve disabled streaming');
ok(openAiAdvancedSnapshot?.streamPartialImages === 0, 'disabled streaming should record partial_images as not submitted');
ok(openAiAdvancedSnapshot?.timeout === 6000, 'advanced task snapshot should preserve a 6000 second timeout');
ok(!Object.prototype.hasOwnProperty.call(openAiAdvancedSnapshot || {}, 'apiKey')
  && !Object.prototype.hasOwnProperty.call(openAiAdvancedSnapshot || {}, 'prompt'), 'advanced task snapshot must omit secrets and prompt data');
const compactAdvancedTask = hooks.compactTaskForStorage({
  id: 'advanced-persisted-task',
  status: 'error',
  advanced: openAiAdvancedSnapshot,
  images: []
}, 'minimal');
ok(compactAdvancedTask.advanced?.responseFormatB64Json === true
  && compactAdvancedTask.advanced?.streamImages === false
  && compactAdvancedTask.advanced?.streamPartialImages === 0
  && compactAdvancedTask.advanced?.timeout === 6000, 'minimal task persistence should retain the effective advanced snapshot');
const sanitizedLegacyAdvanced = hooks.sanitizeTaskAdvanced({
  responseFormatB64Json: 'false',
  streamImages: 0,
  streamPartialImages: 99,
  timeout: 999999,
  apiKey: 'must not persist'
});
ok(hooks.parseTaskAdvancedBoolean('false') === false
  && hooks.parseTaskAdvancedBoolean('true') === true
  && hooks.parseTaskAdvancedBoolean(0) === false
  && hooks.parseTaskAdvancedBoolean(1) === true, 'advanced boolean parser should preserve explicit legacy boolean values');
const advancedProfile = {
  id: 'advanced-image',
  name: 'Advanced Image',
  provider: 'openai',
  apiMode: 'images',
  model: 'gpt-image-2',
  responseFormatB64Json: true,
  streamImages: true,
  streamPartialImages: 2,
  timeout: 120
};
const advancedStateBefore = hooks.getTestState();
hooks.setTestState({ profiles: [advancedProfile], activeProfileId: advancedProfile.id, activeImageProfileId: advancedProfile.id, mode: 'gallery' });
const legacyEntryAdvanced = hooks.entryAdvanced('gallery');
legacyEntryAdvanced.responseFormatB64Json = 'false';
legacyEntryAdvanced.streamImages = 'false';
legacyEntryAdvanced.streamPartialImages = '2';
legacyEntryAdvanced.timeout = '6000';
const legacyFalseAdvanced = hooks.effectiveAdvanced('gallery', advancedProfile);
ok(legacyFalseAdvanced.responseFormatB64Json === false
  && legacyFalseAdvanced.streamImages === false
  && legacyFalseAdvanced.streamPartialImages === 2
  && legacyFalseAdvanced.timeout === 6000, 'legacy string false advanced settings should resolve to disabled request options');
const legacyFalseBody = {};
hooks.applyAdvancedToJsonBody(legacyFalseBody, 'gallery', advancedProfile);
ok(legacyFalseBody.response_format === undefined
  && legacyFalseBody.stream === undefined
  && legacyFalseBody.partial_images === undefined, 'legacy string false advanced settings must not submit b64_json or stream fields');
const numericEntryAdvanced = hooks.entryAdvanced('gallery');
numericEntryAdvanced.responseFormatB64Json = 0;
numericEntryAdvanced.streamImages = 0;
const numericFalseAdvanced = hooks.effectiveAdvanced('gallery', advancedProfile);
ok(numericFalseAdvanced.responseFormatB64Json === false && numericFalseAdvanced.streamImages === false, 'legacy numeric 0 advanced settings should remain disabled');
const trueEntryAdvanced = hooks.entryAdvanced('gallery');
trueEntryAdvanced.responseFormatB64Json = 'true';
trueEntryAdvanced.streamImages = 1;
const legacyTrueAdvanced = hooks.effectiveAdvanced('gallery', advancedProfile);
const legacyTrueBody = {};
hooks.applyAdvancedToJsonBody(legacyTrueBody, 'gallery', advancedProfile);
ok(legacyTrueAdvanced.responseFormatB64Json === true
  && legacyTrueAdvanced.streamImages === true
  && legacyTrueBody.response_format === 'b64_json'
  && legacyTrueBody.stream === true
  && legacyTrueBody.partial_images === 2, 'legacy true/1 advanced settings should still submit enabled request fields');
const stableEntryAdvanced = hooks.entryAdvanced('gallery');
hooks.effectiveAdvanced('gallery', advancedProfile);
ok(hooks.entryAdvanced('gallery') === stableEntryAdvanced, 'entryAdvanced should preserve object identity across normalization reads');
stableEntryAdvanced.responseFormatB64Json = true;
stableEntryAdvanced.streamImages = 1;
const stableReferenceBody = {};
hooks.applyAdvancedToJsonBody(stableReferenceBody, 'gallery', advancedProfile);
ok(stableReferenceBody.response_format === 'b64_json'
  && stableReferenceBody.stream === true
  && stableReferenceBody.partial_images === 2, 'entryAdvanced references must remain live after a subsequent read before enabled fields are submitted');
const restoredEntryAdvanced = hooks.entryAdvanced('gallery');
restoredEntryAdvanced.responseFormatB64Json = null;
restoredEntryAdvanced.streamImages = null;
restoredEntryAdvanced.streamPartialImages = null;
restoredEntryAdvanced.timeout = null;
restoredEntryAdvanced.open = false;
hooks.setTestState({
  profiles: advancedStateBefore.profiles,
  activeProfileId: advancedStateBefore.activeProfileId,
  activeImageProfileId: advancedStateBefore.activeImageProfileId,
  mode: advancedStateBefore.mode
});
ok(sanitizedLegacyAdvanced?.responseFormatB64Json === false
  && sanitizedLegacyAdvanced?.streamImages === false
  && sanitizedLegacyAdvanced?.streamPartialImages === 3
  && sanitizedLegacyAdvanced?.timeout === 6000
  && !Object.prototype.hasOwnProperty.call(sanitizedLegacyAdvanced || {}, 'apiKey'), 'stored advanced metadata should be bounded and allowlisted');
const restoredWithoutAdvanced = hooks.normalizeRestoredTask({ id: 'legacy-without-advanced', status: 'error', images: [], error: 'old error' });
ok(!restoredWithoutAdvanced.advanced, 'legacy tasks without advanced metadata should remain display-compatible');

async function runHomepageV3Addendum() {
const deliveryProfile = { id: 'delivery-openai', name: 'Delivery OpenAI', provider: 'openai', apiMode: 'images', model: 'gpt-image-2', streamImages: true };
ok(hooks.normalizeResponseDelivery('provider-default') === 'provider_default'
  && hooks.normalizeResponseDelivery('base64') === 'b64_json'
  && hooks.normalizeResponseDelivery('URL') === 'url', 'response delivery values should normalize to the three supported modes');
const deliverySanitized = hooks.sanitizeTaskAdvanced({ responseDelivery: 'url', streamImages: true, prompt: 'must not persist', apiKey: 'must not persist' });
ok(deliverySanitized?.responseDelivery === 'url' && deliverySanitized?.responseFormatB64Json === false
  && !Object.prototype.hasOwnProperty.call(deliverySanitized || {}, 'prompt')
  && !Object.prototype.hasOwnProperty.call(deliverySanitized || {}, 'apiKey'), 'response delivery task metadata should be allowlisted without secrets');
const deliveryUrlBody = {};
hooks.applyAdvancedToJsonBody(deliveryUrlBody, 'gallery', deliveryProfile, { responseDelivery: 'url', streamImages: false });
ok(deliveryUrlBody.response_format === 'url' && deliveryUrlBody.stream === undefined, 'URL delivery should be explicit in JSON requests');
const deliveryB64Body = {};
hooks.applyAdvancedToJsonBody(deliveryB64Body, 'gallery', deliveryProfile, { responseDelivery: 'b64_json', streamImages: false });
ok(deliveryB64Body.response_format === 'b64_json', 'b64_json delivery should be explicit in JSON requests');
const deliveryForm = new sandbox.FormData();
hooks.appendAdvancedToFormData(deliveryForm, 'gallery', deliveryProfile, { responseDelivery: 'url', streamImages: false });
ok(deliveryForm.get('response_format') === 'url', 'URL delivery should be explicit in multipart requests');
const streamUrlAdvanced = hooks.sanitizeTaskAdvanced({ responseDelivery: 'url', streamImages: true });
ok(hooks.taskAdvancedDiagnostics(streamUrlAdvanced).some((item) => /流式.*URL.*不兼容/.test(item)), 'stream plus URL should expose a visible compatibility diagnostic without changing the selection');
const deliveryTask = hooks.compactTaskForStorage({ id: 'submitted-prompt-task', status: 'success', prompt: '用户提示', submittedPrompt: '[image 1] 用户提示', advanced: streamUrlAdvanced, images: [] }, 'minimal');
ok(deliveryTask.prompt === '用户提示' && deliveryTask.submittedPrompt === '[image 1] 用户提示', 'minimal task persistence should retain both user and submitted prompts');
const deliveryTasksBeforeDetail = hooks.getTestState().tasks;
hooks.setTestTasks([{ id: 'submitted-prompt-task', status: 'success', prompt: '用户提示', submittedPrompt: '[image 1] 用户提示', advanced: streamUrlAdvanced, images: [] }]);
const deliveryDetail = hooks.renderDetailModal('submitted-prompt-task');
hooks.setTestTasks(deliveryTasksBeforeDetail);
ok(deliveryDetail.includes('用户提示词') && deliveryDetail.includes('提交给 API 的提示词'), 'task detail should label user and submitted prompts separately');

const mentionRefs = [{ id: 'mention-a', name: 'first.png' }, { id: 'mention-b', name: 'second.png' }];
const insertedMention = hooks.insertReferenceMention('draw @', 5, 6, 'mention-a', mentionRefs, []);
ok(insertedMention.value === 'draw @图1' && insertedMention.tokens.length === 1
  && insertedMention.tokens[0].refId === 'mention-a', 'reference mention insertion should record a stable reference ID and visual label');
ok(hooks.resolveComposerPromptForRequest(insertedMention.value, mentionRefs, insertedMention.tokens) === 'draw [image 1]', 'menu-created reference mentions should become image placeholders in the API prompt');
ok(hooks.resolveComposerPromptForRequest('draw @图1', mentionRefs, []) === 'draw @图1', 'hand-typed @图N text must remain ordinary prompt text');
const reorderedMentions = hooks.remapReferenceMentionTokens(insertedMention.tokens, [mentionRefs[1], mentionRefs[0]]);
ok(reorderedMentions[0]?.index === 1 && hooks.resolveComposerPromptForRequest(insertedMention.value, [mentionRefs[1], mentionRefs[0]], insertedMention.tokens) === 'draw [image 2]', 'reference mentions should remap by stable ID after visual reorder');
const baseMention = hooks.insertReferenceMention('before @ after', 7, 8, 'mention-a', mentionRefs, []);
const shiftedMention = hooks.insertReferenceMention(`${baseMention.value} `, baseMention.value.length, baseMention.value.length, 'mention-b', mentionRefs, baseMention.tokens);
const removedMention = hooks.markReferenceMentionsRemoved(shiftedMention.value, shiftedMention.tokens, 'mention-a');
ok(removedMention.value.includes('@已移除图片') && !removedMention.value.includes('@图1'), 'removing a reference should preserve an explicit removed-image marker');
const editedMentions = hooks.updateComposerMentionTokensForInput(shiftedMention.value, shiftedMention.value.replace('@图1', '@图X'), shiftedMention.tokens);
ok(editedMentions.every((token) => token.refId !== 'mention-a'), 'editing through a protected mention should drop its stale token instead of replacing hand text');

fakeIndexedDbStore.set('fallback-original', new Blob(['original'], { type: 'image/png' }));
const fallbackReference = await hooks.getReferenceBlobWithFallback({ compositedBlobId: 'missing-composited', blobId: 'missing-display', originalBlobId: 'fallback-original' });
ok(fallbackReference.blobId === 'fallback-original' && fallbackReference.blob?.size > 0, 'reference hydration should fall back from composited to blob to original');
const missingReferenceImage = { dataset: {}, isConnected: true, closest: () => ({ classList: { add: () => {}, remove: () => {} } }) };
const missingReferenceTask = { id: 'missing-reference-task', referenceSnapshots: [{ id: 'missing-ref', compositedBlobId: 'none-a', blobId: 'none-b', originalBlobId: 'none-c' }] };
ok(await hooks.hydrateTaskReferenceImage(missingReferenceImage, missingReferenceTask, 0) === false
  && missingReferenceImage.alt === '参考图已丢失', 'missing reference hydration should expose a readable placeholder state');
fakeIndexedDbStore.set('strict-readable-ref', { size: 4, type: 'image/png' });
let strictUnreadableError = null;
try {
  await hooks.cloneReferenceSnapshots([{ id: 'strict-ref', blobId: 'strict-readable-ref' }], { strict: true });
} catch (error) {
  strictUnreadableError = error;
}
ok(strictUnreadableError?.code === 'IMAGE_EDIT_INPUT_SNAPSHOT_UNREADABLE', 'strict reference snapshots should reject non-readable Blob records');

const timeoutPhantomId = 'timeout-phantom-task';
const timeoutTaskStore = fakeIndexedDbStores.get('tasks') || new Map();
fakeIndexedDbStores.set('tasks', timeoutTaskStore);
const timeoutTaskRecord = timeoutTaskStore.get(timeoutPhantomId);
const timeoutTaskTombstoneKey = `__task-delete__:${timeoutPhantomId}`;
const timeoutDeletionStorageKey = 'gpt-image2.home.v3.task-deletions';
const timeoutDeletionStorage = new Map();
const timeoutTasksBeforeRemoval = hooks.getTestState().tasks;
const originalTimeoutGetItem = sandbox.localStorage.getItem;
const originalTimeoutSetItem = sandbox.localStorage.setItem;
const originalTimeoutRemoveItem = sandbox.localStorage.removeItem;
timeoutTaskStore.set(timeoutPhantomId, {
  id: timeoutPhantomId,
  status: 'running',
  createdAt: Date.now(),
  images: []
});
sandbox.localStorage.getItem = (key) => timeoutDeletionStorage.get(key) || null;
sandbox.localStorage.setItem = (key, value) => timeoutDeletionStorage.set(key, String(value));
sandbox.localStorage.removeItem = (key) => timeoutDeletionStorage.delete(key);
hooks.setTestTasks([]);
ok(hooks.scheduleTaskRemovalPersistence(timeoutPhantomId) === true, 'timed-out task removal should enqueue a persistence tombstone');
await hooks.flushTaskPersistence();
const timeoutDeletionTombstones = JSON.parse(timeoutDeletionStorage.get(timeoutDeletionStorageKey) || '{}');
ok(!timeoutTaskStore.has(timeoutPhantomId), 'timed-out task removal must delete the stale IndexedDB task record');
ok(timeoutTaskStore.get(timeoutTaskTombstoneKey)?.kind === 'task-delete', 'timed-out task removal must leave an IndexedDB tombstone for stale writes');
ok(Number(timeoutDeletionTombstones[timeoutPhantomId]) > 0, 'timed-out task removal must leave a local deletion tombstone');
timeoutDeletionStorage.clear();
const replacementTask = { id: timeoutPhantomId, status: 'running', images: [] };
timeoutTaskStore.set(timeoutPhantomId, replacementTask);
hooks.setTestTasks([replacementTask]);
ok(hooks.scheduleTaskRemovalPersistence(timeoutPhantomId, { id: timeoutPhantomId }) === false
  && timeoutTaskStore.has(timeoutPhantomId)
  && !timeoutDeletionStorage.has(timeoutDeletionStorageKey), 'an older generation must not tombstone a newer task with the same ID');
hooks.setTestTasks(timeoutTasksBeforeRemoval);
if (timeoutTaskRecord) timeoutTaskStore.set(timeoutPhantomId, timeoutTaskRecord);
else timeoutTaskStore.delete(timeoutPhantomId);
timeoutTaskStore.delete(timeoutTaskTombstoneKey);
sandbox.localStorage.getItem = originalTimeoutGetItem;
sandbox.localStorage.setItem = originalTimeoutSetItem;
sandbox.localStorage.removeItem = originalTimeoutRemoveItem;
}

const sameGalleryWindow = { startIndex: 6, endIndex: 30 };
ok(hooks.galleryVirtualRangeChanged(sameGalleryWindow, { renderedStartIndex: 6, renderedEndIndex: 30 }) === false, 'gallery virtual window should not rebuild when start/end are unchanged');
ok(hooks.galleryVirtualRangeChanged(sameGalleryWindow, { renderedStartIndex: 3, renderedEndIndex: 30 }) === true, 'gallery virtual window should rebuild when its range changes');

hooks.setTestState({ promptRepo: { scrollTop: 900, viewportHeight: 620, virtualLayout: null } });
const estimatedPromptWindow = hooks.promptRepoVirtualWindow(180);
ok(estimatedPromptWindow.shouldVirtualize === true && estimatedPromptWindow.endIndex - estimatedPromptWindow.startIndex <= 60, 'large prompt repositories should stay bounded with an estimated layout before measurement');
hooks.setTestState({ promptRepo: { virtualLayout: { columns: 3, rowPitch: 287, viewportWidth: 1280 } } });
const measuredPromptWindow = hooks.promptRepoVirtualWindow(180);
ok(measuredPromptWindow.shouldVirtualize === true, 'prompt repository should virtualize after a reliable layout measurement');
ok(measuredPromptWindow.topPad % 287 === 0 && measuredPromptWindow.bottomPad % 287 === 0, 'prompt virtual spacers should use the measured row pitch');

const mergedTransparentErrors = hooks.mergeGenerationPartialErrors(
  [{ summary: '上游单张失败', detail: 'provider failure' }],
  'alpha cleanup failed'
);
ok(mergedTransparentErrors.length === 2, 'transparent post-process failure should merge with existing partial errors');
ok(mergedTransparentErrors[1].stage === 'transparent-postprocess', 'transparent post-process failure should keep a dedicated stage');

const runtimeSignature = hooks.runtimeRenderSignature();
ok(runtimeSignature === hooks.runtimeRenderSignature(), 'unchanged runtime state should keep a stable render signature');
hooks.setTestState({ activeProfileId: 'runtime-signature-change' });
ok(runtimeSignature !== hooks.runtimeRenderSignature(), 'runtime render signature should change when visible configuration changes');

const lruMap = new Map();
const lruUrl1 = TestURL.createObjectURL(new Blob(['1']));
const lruUrl2 = TestURL.createObjectURL(new Blob(['2']));
const lruUrl3 = TestURL.createObjectURL(new Blob(['3']));
const revokedBeforeLru = revokedObjectUrls.length;
hooks.rememberObjectUrl(lruMap, 'one', lruUrl1, 2);
hooks.rememberObjectUrl(lruMap, 'two', lruUrl2, 2);
hooks.rememberObjectUrl(lruMap, 'three', lruUrl3, 2);
ok(lruMap.size === 2 && !lruMap.has('one'), 'object URL cache should evict the oldest entry at its limit');
ok(revokedObjectUrls.length === revokedBeforeLru + 1 && revokedObjectUrls.at(-1) === lruUrl1, 'object URL cache eviction should revoke the evicted URL');
for (const url of lruMap.values()) TestURL.revokeObjectURL(url);

const originalQuerySelector = sandbox.document.querySelector;
sandbox.document.hidden = true;
sandbox.document.querySelector = () => { throw new Error('hidden page timer scanned the DOM'); };
try {
  hooks.updateRunningTimers();
  ok(true, 'hidden page timer should skip task scanning');
} catch {
  ok(false, 'hidden page timer should skip task scanning');
}
sandbox.document.querySelector = originalQuerySelector;
sandbox.document.hidden = false;

ok(!source.includes('schedulePromptSearchWarmup(12000)'), 'homepage should not preload the 5.9MB prompt search index after 12 seconds without intent');
ok(source.includes("window.addEventListener('pagehide', (event) => {") && source.includes('if (!event.persisted) revokeAllObjectUrls();'), 'pagehide should release normal-page object URLs while rehydrating bfcache returns');
ok(source.includes('function resetTaskStreamPreviewSlotsForHydration(task)')
  && source.includes('await waitForTaskStreamPartialPersistence(task.id)')
  && source.includes('void restoreStreamPreviewsAfterBfcache().catch'), 'bfcache restore should replace revoked live stream previews with persisted partials and recover safely');
ok(source.includes('const changed = await loadRuntime({ preserveComposerSession: true });') && source.includes('if (changed) render();'), 'focus/pageshow runtime refresh should render only after an actual configuration change');
ok(source.includes('if (document.hidden) return;') && source.includes('clearInterval(runningTimerInterval)'), 'hidden pages should stop the running-task timer scan');
ok(source.includes('data-modal-key="workflow-editor"') && source.includes('aria-labelledby="workflowEditorTitle"'), 'workflow editor should expose labelled modal dialog semantics');
ok(source.includes('data-modal-key="workflow-invoke"') && source.includes('aria-labelledby="workflowInvokeTitle"'), 'workflow invoke should expose labelled modal dialog semantics');
ok(source.includes('data-modal-key="prompt-repo"') && source.includes('data-modal-key="prompt-detail"') && source.includes('data-modal-key="prompt-viewer"'), 'prompt repository modal stack should expose stable modal keys');
ok(source.includes("document.addEventListener('focusin'") && source.includes('function syncModalAccessibility()'), 'modal focus should be pulled back to the explicit top-level dialog');

const candidates = hooks.collectImageCandidates({
  data: [{ b64_json: 'aaa' }, { b64_json: 'bbb' }],
  result: { images: [{ url: 'https://example.com/a.png' }, { image_url: 'https://example.com/b.png' }] },
  output: [{ content: [{ data_url: 'data:image/png;base64,ccc' }] }]
});
ok(candidates.length >= 5, 'recursive image candidate collector should find all nested image results');
let deepImagePayload = { result: { data: { output: { images: [{ b64_json: 'ZGVlcC1pbWFnZS1kYXRh' }] } } } };
for (let index = 0; index < 6; index += 1) deepImagePayload = { envelope: deepImagePayload };
ok(
  hooks.collectImageCandidates(deepImagePayload).some((item) => item.b64_json === 'ZGVlcC1pbWFnZS1kYXRh'),
  'image candidate collector should inspect the same bounded depth as the stream runtime'
);
const stringImageCandidates = hooks.collectImageCandidates({
  images: [
    'data:image/png;base64,inline-string-image',
    'https://example.com/string-image.png'
  ],
  data: [{ base64: 'c3RyaW5nLWJhc2U2NC1pbWFnZQ==' }],
  result: { image: 'object-image-value' }
});
ok(
  stringImageCandidates.some((item) => item.data_url === 'data:image/png;base64,inline-string-image')
    && stringImageCandidates.some((item) => item.url === 'https://example.com/string-image.png')
    && stringImageCandidates.some((item) => item.b64_json === 'c3RyaW5nLWJhc2U2NC1pbWFnZQ==')
    && stringImageCandidates.some((item) => item.image === 'object-image-value'),
  'image candidate collector should support string images in containers and image/base64 compatibility fields'
);
const quotedRemote = hooks.classifyRemoteImageUrl('  "https://images.example/assets/result.png?sig=hidden"  ', { sourceField: 'image_url' });
ok(quotedRemote.ok && quotedRemote.url === 'https://images.example/assets/result.png?sig=hidden' && quotedRemote.sourceField === 'image_url', 'remote URL classification should trim and remove one matching outer quote without decoding the URL');
const relativeRemote = hooks.classifyRemoteImageUrl("'/assets/result.png'", { upstreamOrigin: 'https://images.example/v1' });
ok(relativeRemote.ok && relativeRemote.url === 'https://images.example/assets/result.png', 'relative image URLs should resolve only against a verified HTTPS upstream origin');
ok(hooks.normalizeRemoteImageUrl('images/result.png', { upstreamOrigin: 'https://images.example/v1' }) === 'https://images.example/images/result.png', 'path-relative image URLs should resolve when they are clearly image paths');
ok(hooks.classifyRemoteImageUrl('/assets/result.png').category === 'RELATIVE_ORIGIN_MISSING', 'relative image URLs without an upstream origin should be rejected locally');
ok(hooks.classifyRemoteImageUrl('http://images.example/result.png').category === 'NON_HTTPS', 'HTTP image URLs should be rejected locally');
ok(hooks.classifyRemoteImageUrl('not a URL').category === 'INVALID_URL', 'malformed image URLs should be rejected locally');
ok(hooks.classifyRemoteImageUrl('https://user:pass@images.example/result.png').category === 'CREDENTIALS', 'credential-bearing image URLs should be rejected locally');
ok(hooks.classifyRemoteImageUrl('https://127.0.0.1/result.png').category === 'PRIVATE_HOST', 'private image hosts should be rejected locally');
const unrelatedImageFields = hooks.collectImageCandidates({
  data: [{ b64_json: 'c3RyaW5nLWJhc2U2NC1pbWFnZQ==' }],
  metadata: { uri: 'https://unrelated.example/not-an-image.png', href: 'https://unrelated.example/not-an-image-2.png' },
  uri: 'https://unrelated.example/root-not-an-image.png'
});
ok(!unrelatedImageFields.some((item) => String(item.url || item.uri || item.href || '').includes('unrelated.example')), 'image candidate collector should ignore unrelated uri and href fields outside standard image containers');
for (const field of ['uri', 'src', 'href']) {
  const aliasUrl = `https://images.example/alias-${field}.png`;
  const aliasCandidates = hooks.collectImageCandidates({ data: [{ [field]: aliasUrl }] });
  ok(aliasCandidates.length === 1 && aliasCandidates[0].url === aliasUrl, `standard image data container should normalize ${field} to url`);
  const rootAliasCandidates = hooks.collectImageCandidates({ [field]: aliasUrl });
  const metadataAliasCandidates = hooks.collectImageCandidates({ metadata: { [field]: aliasUrl } });
  ok(rootAliasCandidates.length === 0 && metadataAliasCandidates.length === 0, `${field} aliases outside standard image containers should not be collected`);
}
for (const wrapper of ['result', 'response', 'payload']) {
  const wrapperUrl = `https://images.example/${wrapper}-single.png`;
  const wrapperCandidates = hooks.collectImageCandidates({ [wrapper]: { url: wrapperUrl } });
  ok(wrapperCandidates.length === 1 && wrapperCandidates[0].url === wrapperUrl, `${wrapper} wrapper should normalize a single generic URL`);
}
for (const duplicatePayload of [
  { result: { image: 'https://images.example/result-image.png' } },
  { data: [{ image: 'https://images.example/data-image.png' }] }
]) {
  ok(hooks.collectImageCandidates(duplicatePayload).length === 1, 'a single image object should not be collected twice through its direct field and child traversal');
}
const semanticCandidates = hooks.collectImageCandidates({
  data: {
    content: [
      { type: 'text', url: 'https://unrelated.example/text.png' },
      { type: 'text', object: 'image_part', url: 'https://unrelated.example/conflicting-image-marker.png' },
      { type: 'image_url', url: 'https://images.example/content-image.png' }
    ],
    items: [
      { kind: 'metadata', url: 'https://unrelated.example/metadata.png' },
      { mime_type: 'image/png', url: 'https://images.example/mime-image.png' }
    ],
    parts: [{ object: 'image_part', url: 'https://images.example/part-image.png' }]
  }
});
ok(!semanticCandidates.some((item) => String(item.url || '').includes('unrelated.example')), 'text and metadata containers should not expose generic URLs as images');
ok(
  semanticCandidates.some((item) => item.url === 'https://images.example/content-image.png')
    && semanticCandidates.some((item) => item.url === 'https://images.example/mime-image.png')
    && semanticCandidates.some((item) => item.url === 'https://images.example/part-image.png'),
  'typed image content should expose generic URLs when image semantics are explicit'
);
const deniedMarkerCandidates = hooks.collectImageCandidates({
  data: {
    content: [
      { type: 'non_image', url: 'https://unrelated.example/non-image.png' },
      { kind: 'not_image', url: 'https://unrelated.example/not-image.png' },
      { type: 'text_image_reference', url: 'https://unrelated.example/text-image-reference.png' },
      { type: 'image_url', url: 'https://images.example/allowed-image-url.png' }
    ]
  }
});
ok(!deniedMarkerCandidates.some((item) => String(item.url || '').includes('unrelated.example')), 'negative image markers should not expose generic URLs as images');
ok(deniedMarkerCandidates.some((item) => item.url === 'https://images.example/allowed-image-url.png'), 'positive image markers should continue to expose generic URLs');
for (const unsafeRelativeUrl of [
  '//evil.example/assets/result.png',
  String.raw`\\evil.example\assets\result.png`,
  String.raw`/\evil.example\assets\result.png`
]) {
  const unsafeClassification = hooks.classifyRemoteImageUrl(unsafeRelativeUrl, { upstreamOrigin: 'https://images.example/v1' });
  const unsafeNormalized = hooks.normalizeRemoteImageUrl(unsafeRelativeUrl, { upstreamOrigin: 'https://images.example/v1' });
  ok(unsafeClassification.category === 'INVALID_URL' && unsafeNormalized === '' && !String(unsafeNormalized).includes('evil.example'), `network-path image URL should be rejected before upstream-origin resolution: ${JSON.stringify(unsafeRelativeUrl)}`);
}
ok(
  hooks.collectImageCandidates({ type: 'image.generation.chunk', data: { progress_text: '正在生成，请稍候' } }).length === 0,
  'progress text in generic data containers must not be treated as an image candidate'
);

const cyclicErrorPayload = { error: {} };
cyclicErrorPayload.error.self = cyclicErrorPayload;
const normalizedCyclicError = hooks.normalizeError(cyclicErrorPayload, 'fallback');
ok(normalizedCyclicError.summary === 'fallback', 'cyclic error payload should normalize without overflowing the call stack');
ok(normalizedCyclicError.detail.includes('[circular]'), 'cyclic error detail should identify circular data safely');
let deepErrorPayload = {};
let deepErrorCursor = deepErrorPayload;
for (let index = 0; index < 12000; index += 1) {
  deepErrorCursor.next = {};
  deepErrorCursor = deepErrorCursor.next;
}
deepErrorCursor.message = 'deep error';
const normalizedDeepError = hooks.normalizeError(deepErrorPayload, 'fallback');
ok(normalizedDeepError.summary === 'fallback', 'deep error payload should be bounded instead of recursively overflowing');
const deepObject = hooks.collectObjectsDeep(deepErrorPayload, { maxDepth: 20, maxNodes: 128 });
ok(deepObject.length <= 128, 'deep object collection should respect its node budget');
const structured401Detail = JSON.stringify({
  error: { message: 'Invalid API key', type: 'upstream_rejected', code: 'UPSTREAM_PROVIDER_REJECTED' },
  upstreamStatus: 401,
  dnsMode: 'public-resolver',
  requestBody: { apiKey: 'sk-test-secret', imageBase64: 'data:image/png;base64,secret' }
});
const structured401Summary = hooks.taskErrorSummary({ status: 'error', error: 'public-resolver', errorDetail: structured401Detail });
ok(structured401Summary.includes('上游鉴权失败') && structured401Summary.includes('Invalid API key') && !structured401Summary.includes('public-resolver'), 'task card should prefer a safe structured upstream authentication summary over the DNS mode label');
ok(!structured401Summary.includes('sk-test-secret') && !structured401Summary.includes('data:image'), 'task card error summary must not expose credentials or image data from structured details');
const structured400Detail = JSON.stringify({
  error: { message: 'Invalid parameter: size', type: 'invalid_request_error', code: 'UPSTREAM_PROVIDER_REJECTED' },
  upstreamStatus: 400,
  dnsMode: 'public-resolver',
  requestBody: { apiKey: 'sk-test-secret', prompt: 'private prompt' }
});
const structured400Summary = hooks.taskErrorSummary({ status: 'error', error: 'public-resolver', errorDetail: structured400Detail });
ok(structured400Summary === 'Invalid parameter: size' && !structured400Summary.includes('上游鉴权失败') && !structured400Summary.includes('public-resolver'), '400 provider rejection should show a safe parameter error summary instead of an authentication summary');
ok(!structured400Summary.includes('sk-test-secret') && !structured400Summary.includes('private prompt'), '400 provider rejection summary must not expose credentials or prompt content from structured details');
const structured400AuthCodeDetail = JSON.stringify({
  error: { message: 'Request denied', type: 'invalid_request_error', code: 'INVALID_API_KEY' },
  upstreamStatus: 400,
  dnsMode: 'public-resolver'
});
const structured400AuthCodeSummary = hooks.taskErrorSummary({ status: 'error', error: 'public-resolver', errorDetail: structured400AuthCodeDetail });
ok(structured400AuthCodeSummary === '上游鉴权失败：Request denied', 'an explicit authentication error code should still produce an authentication summary even with a 400 status');
const platformFallbackDetail = JSON.stringify({ error: { message: 'API key sk-live-secret-value', code: 'UPSTREAM_PROVIDER_REJECTED' }, upstreamStatus: 401, dnsMode: 'platform-fallback' });
const platformFallbackSummary = hooks.taskErrorSummary({ status: 'error', error: 'platform-fallback', errorDetail: platformFallbackDetail });
ok(platformFallbackSummary === '上游鉴权失败', 'platform DNS fallback errors with sensitive provider text should use a generic authentication summary');
const legacyTaskSummary = hooks.taskErrorSummary({ status: 'error', error: '旧版生成失败', errorDetail: 'legacy detail' });
ok(legacyTaskSummary === '旧版生成失败', 'legacy task error summary should preserve the primary non-structured error');
const legacyDetailSummary = hooks.taskErrorSummary({ status: 'error', error: '', errorDetail: 'legacy detail' });
ok(legacyDetailSummary === 'legacy detail', 'legacy task error summary should fall back to plain error detail');
const cyclicSummaryPayload = { response: {} };
cyclicSummaryPayload.response.self = cyclicSummaryPayload;
const cyclicSummary = hooks.summarizeResponse(cyclicSummaryPayload);
ok(JSON.stringify(cyclicSummary).includes('[circular]'), 'response summary should render cyclic payloads safely');

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
ok(Number(params.compression) === 28 && Number(params.outputQuality) === 28, 'returned API compression should be converted to user-facing output quality');
ok(Number(params.outputCompression) === 72, 'returned raw API compression should remain available for diagnostics');
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
ok(Number(nestedReturned.compression) === 36 && Number(nestedReturned.outputCompression) === 64, 'nested API compression should expose both output quality and raw compression');
ok(nestedReturned.transparent === true, 'nested returned transparent flag should be extracted');
ok(nestedReturned.moderation === 'strict', 'nested returned moderation should be extracted');
ok(nestedReturned.count === 2, 'returned count should still prefer actual persisted images over response count');

if (typeof hooks.renderDetailModal === 'function') {
  const detailTaskSnapshot = {
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
    timing: {
      responseHeaderMs: 1200,
      streamReadMs: 2300,
      persistMs: 400,
      postProcessMs: 100,
      totalMs: 4000,
      upstreamHeaderMs: 900
    },
    responseMode: 'sse-sniffed',
    completionReason: 'completed-event',
    advanced: openAiAdvancedSnapshot,
    traceId: 'trace-detail-1',
    streamEvents: [{ type: 'image_generation.chunk', status: '', id: 'event-1', keys: ['type'], candidateCount: 0, dataCount: 0, hasError: false }],
    streamEventCount: 7,
    lastStreamEventType: 'error',
    createdAt: Date.now(),
    startedAt: Date.now() - 1000,
    finishedAt: Date.now()
  };
  hooks.setTestTasks([detailTaskSnapshot]);
  const detailHtml = hooks.renderDetailModal('detail-diff-task');
  const actualCount = (detailHtml.match(/actual-value/g) || []).length;
  ok(actualCount >= 6, 'detail modal should highlight returned differences for ratio, quality, format/transparent, moderation, and count');
  ok(!detailHtml.includes('返回不符'), 'detail modal should not render textual mismatch labels; yellow actual values are enough');
  ok(detailHtml.includes('16:9'), 'detail modal should show nested actual aspect ratio');
  ok(detailHtml.includes('low'), 'detail modal should show nested actual quality');
  ok(detailHtml.includes('strict'), 'detail modal should show nested actual moderation');
  ok(detailHtml.includes('2'), 'detail modal should show actual returned image count');
  ok(detailHtml.includes('请求质量'), 'detail modal should label model quality as requested quality');
  ok(detailHtml.includes('响应头') && detailHtml.includes('流读取') && detailHtml.includes('本地入库'), 'detail modal should show phase timing diagnostics');
  ok(detailHtml.includes('sse-sniffed') && detailHtml.includes('completed-event'), 'detail modal should show response mode and completion reason');
  ok(detailHtml.includes('b64_json 开') && detailHtml.includes('流式 关') && detailHtml.includes('partial_images 0') && detailHtml.includes('请求超时 6000s'), 'detail modal should show the effective advanced transport snapshot');
  ok(detailHtml.includes('Trace ID trace-detail-1') && detailHtml.includes('流事件 7') && detailHtml.includes('最后事件 error'), 'detail modal should show bounded trace and stream event diagnostics');
  hooks.setTestTasks([{
    id: 'google-detail-moderation-task',
    status: 'success',
    prompt: 'google detail',
    requestedParams: { provider: 'google', model: 'gemini-3.1-flash-image', format: 'png' },
    returnedParams: { safety: 'strict', safety_filter: 'strict' },
    images: []
  }]);
  const googleDetailHtml = hooks.renderDetailModal('google-detail-moderation-task');
  ok(!googleDetailHtml.includes('param-label">审核'), 'Google detail metadata must not render a moderation card from safety aliases');
  hooks.setTestTasks([{
    id: 'openai-detail-moderation-task',
    status: 'success',
    prompt: 'openai detail',
    requestedParams: { provider: 'openai', model: 'gpt-image-2', format: 'png' },
    returnedParams: { moderation: 'low' },
    images: []
  }]);
  const openAiDetailHtml = hooks.renderDetailModal('openai-detail-moderation-task');
  ok(openAiDetailHtml.includes('param-label">审核') && openAiDetailHtml.includes('low'), 'OpenAI detail metadata should render a moderation card when the response has an explicit moderation field');
  hooks.setTestTasks([detailTaskSnapshot]);
  const viewerHtml = typeof hooks.renderViewer === 'function' ? hooks.renderViewer({ taskId: 'detail-diff-task', index: 0 }) : '';
  ok(viewerHtml.includes('viewer-nav') && viewerHtml.includes('data-action="viewer-next"'), 'multi-image viewer should render next navigation');
  ok(viewerHtml.includes('1 / 2'), 'multi-image viewer should show the current image index');
  ok(viewerHtml.includes('viewer-stage') && !viewerHtml.includes('viewer-actions'),
    'image viewer should anchor navigation to the rendered image and leave actions to the context menu');
  ok(detailHtml.includes('detail-media-stage') && detailHtml.includes('detail-thumbs'),
    'multi-image detail modal should reserve a separate thumbnail rail below the image stage');
  ok(source.includes('data-action="prompt-image-viewer-image"') && source.includes("if (action === 'prompt-image-viewer-image') return;"),
    'prompt image viewer must not close when the displayed image itself is clicked');
  ok(source.includes("new ClipboardItem({ 'image/png': pngPromise })")
    && source.includes('const pngPromise = blobFromImageSource(source).then'),
  'context-menu copy should call the clipboard immediately with an asynchronous PNG payload');
  ok(source.includes('async function detectImageBlobType(blob)')
    && source.includes("return 'image/jpeg';")
    && source.includes('const detectedType = await detectImageBlobType(blob);'),
  'context-menu copy should detect mislabeled JPEG/WebP blobs before converting them to PNG');
  ok(source.includes('async function prepareImageContextMenuCopy(menu)')
    && source.includes("new ClipboardItem({ 'image/png': preparedBlob })")
    && source.includes("copyState: 'loading'"),
  'context-menu copy should prebuild a concrete PNG Blob for Firefox before the copy click');
  ok(source.includes("!/^blob:/i.test(String(value))") && source.includes('当前浏览器不支持直接复制图片，请使用下载功能'),
    'Firefox copy fallback must not expose a temporary blob URL as a usable image link');
  ok(source.includes('class="image-context-menu" role="menu"')
    && !source.includes('data-modal-key="image-context-menu"'),
  'image context menu should not make the underlying viewer inert');
  ok(source.includes('id="imageMenuMount"')
    && source.includes("state.imageContextMenu = { ...menu, copyRequestId: uid('copy'), copyState: 'loading' };")
    && source.includes('syncImageContextMenu();\n  prepareImageContextMenuCopy(state.imageContextMenu);')
    && !source.includes('state.imageContextMenu = menu;\n  render();'),
  'opening the image context menu should not re-render the page behind it');
  ok(source.includes('id="imageMenuMount" data-modal-inert-exempt')
    && source.includes("if (child.matches?.('[data-modal-inert-exempt]')) return;"),
  'image context menu mount should remain interactive while a detail or viewer modal is active');
  ok(source.includes("closeImageContextMenu();\n  if (keepsViewerClick) return;\n  event.preventDefault();\n}, true);")
    && !source.includes('closeImageContextMenu();\n  if (keepsViewerClick) return;\n  event.preventDefault();\n  event.stopImmediatePropagation();'),
  'closing a stale image menu must allow the original click handler to run without requiring a second click');

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

  hooks.setTestTasks([{
    id: 'detail-google-ratio-mismatch',
    status: 'success',
    prompt: 'requested four by three',
    requestedParams: {
      provider: 'google',
      profileName: 'Nano Banana Pro',
      resolution: '4K',
      aspectRatio: '4:3',
      quality: 'high',
      format: 'png',
      count: 1
    },
    returnedParams: { resolution: '1920x1080', aspectRatio: '16:9', quality: 'high', format: 'png', count: 1 },
    images: [{ blobId: 'detail-ratio-mismatch', width: 1920, height: 1080, type: 'image/png' }],
    createdAt: Date.now(),
    finishedAt: Date.now()
  }]);
  const ratioMismatchDetailHtml = hooks.renderDetailModal('detail-google-ratio-mismatch');
  ok(ratioMismatchDetailHtml.includes('4:3') && ratioMismatchDetailHtml.includes('16:9'), 'Google detail should show both requested and actual ratio when upstream returns a different aspect ratio');
  ok(ratioMismatchDetailHtml.includes('actual-value'), 'Google detail should visibly mark an upstream aspect-ratio mismatch from actual image dimensions');
}

const referenceBadgeHtml = hooks.renderReferenceBadge({
  id: 'task-ref-ui',
  referenceSnapshots: [{ id: 'ref-1', blobId: 'masked-ref', originalBlobId: 'original-ref', compositedBlobId: 'composited-ref' }]
}, 'detail');
ok(referenceBadgeHtml.includes('open-task-reference-viewer'), 'task reference badge should open the original reference viewer');
ok(!referenceBadgeHtml.includes('add-task-reference-to-composer'), 'task reference badge should no longer add references to the composer');
ok(hooks.taskReferenceDisplayBlobId({ blobId: 'masked-ref', originalBlobId: 'original-ref', compositedBlobId: 'composited-ref' }) === 'composited-ref', 'task reference thumbnail should display the composited/masked blob');
ok(hooks.taskReferenceOriginalBlobId({ blobId: 'masked-ref', originalBlobId: 'original-ref', compositedBlobId: 'composited-ref' }) === 'original-ref', 'task reference viewer should prefer the original blob');
const imageContextMenuHtml = hooks.renderImageContextMenu({ x: 24, y: 32 });
ok(imageContextMenuHtml.includes('复制') && imageContextMenuHtml.includes('下载') && imageContextMenuHtml.includes('编辑'), 'custom image context menu should contain only copy/download/edit actions');
const streamPreviewMenuHtml = hooks.renderImageContextMenu({ kind: 'stream-preview', x: 24, y: 32 });
ok(streamPreviewMenuHtml.includes('复制') && streamPreviewMenuHtml.includes('下载') && !streamPreviewMenuHtml.includes('data-action="edit-image-source"'), 'stream preview context menu should only expose copy/download actions');
ok(imageContextMenuHtml.includes('role="menu"') && !imageContextMenuHtml.includes('aria-modal="true"') && imageContextMenuHtml.includes('data-modal-autofocus'), 'custom image context menu must remain keyboard accessible without locking the viewer in the modal stack');

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
    model: 'gemini-3-pro-image-preview',
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
  ok(!Object.prototype.hasOwnProperty.call(googlePayload, 'target_size')
    && !Object.prototype.hasOwnProperty.call(googlePayload, 'targetSize'), 'Google payload must not send a target pixel size');
  ok(Object.keys(googlePayload.extra_body || {}).join(',') === 'generationConfig', 'Google payload extra_body must contain only generationConfig');
  ok(Object.keys(googlePayload.extra_body?.generationConfig || {}).sort().join(',') === 'imageConfig,responseModalities', 'Google generationConfig must not contain duplicate snake_case config');
  ok(Object.keys(googlePayload.extra_body?.generationConfig?.imageConfig || {}).sort().join(',') === 'aspectRatio,imageSize', 'Google imageConfig must contain only canonical aspectRatio and imageSize');

  for (const model of ['gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview']) {
    for (const [resolution, aspectRatio] of [['1K', '4:3'], ['2K', '3:4'], ['4K', '4:3']]) {
      const nanoPayload = hooks.providerPayload('google', { model, resolution, aspectRatio });
      ok(nanoPayload.resolution === resolution
        && nanoPayload.image_size === resolution
        && nanoPayload.size === resolution
        && nanoPayload.aspect_ratio === aspectRatio, `${model} must preserve Nano Banana ${resolution} ${aspectRatio} toolbar values`);
      ok(!Object.prototype.hasOwnProperty.call(nanoPayload, 'target_size')
        && !Object.prototype.hasOwnProperty.call(nanoPayload, 'targetSize'), `${model} must not receive target_size`);
      ok(nanoPayload.extra_body?.generationConfig?.imageConfig?.imageSize === resolution
        && nanoPayload.extra_body?.generationConfig?.imageConfig?.aspectRatio === aspectRatio
        && !Object.prototype.hasOwnProperty.call(nanoPayload.extra_body || {}, 'generation_config')
        && !Object.prototype.hasOwnProperty.call(nanoPayload.extra_body?.generationConfig?.imageConfig || {}, 'image_size')
        && !Object.prototype.hasOwnProperty.call(nanoPayload.extra_body?.generationConfig?.imageConfig || {}, 'aspect_ratio'), `${model} must use one canonical Gemini imageConfig`);
    }
  }

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
  ok(hooks.googleOfficialImageSize('4K', '3:2') === '5056x3392', 'Google diagnostic size table should remain available for returned-image comparison');
  ok(hooks.googleOfficialImageSize('2K', '3:2') === '2528x1696', 'Google diagnostic size table should remain available for legacy returned-image comparison');
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
      profiles: [
        { id: 'gpt-image2', name: 'gpt-image2-4k超分', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' },
        { id: 'gpt-image2', name: 'gpt-image2原生', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' }
      ],
      activeProfileId: 'name:gpt-image2原生',
      activeImageProfileId: 'name:gpt-image2原生'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return runtimeOriginalFetch(url);
  };
  await hooks.loadRuntime();
  sandbox.fetch = runtimeOriginalFetch;
  await runHomepageV3Addendum();
  const runtimeState = hooks.getTestState();
  ok(runtimeState.preferences.clearInputAfterSubmit === true, 'runtime habit clearInputAfterSubmit should override local stale preference');
  ok(runtimeState.preferences.persistInputOnRestart === true, 'runtime habit persistInputOnRestart should override local stale preference');
  ok(runtimeState.preferences.alwaysShowRetryButton === false, 'runtime habit alwaysShowRetryButton=false should be preserved');
  ok(runtimeState.preferences.reuseTaskApiProfileTemporarily === true, 'runtime habit reuseTaskApiProfileTemporarily should apply');
  ok(runtimeState.preferences.allowPromptRewrite === false, 'runtime habit allowPromptRewrite=false should be preserved');
  ok(runtimeState.preferences.enterSubmit === true, 'runtime habit enterSubmit should apply');
  ok(runtimeState.preferences.referenceImageEditAction === 'add-mask', 'runtime reference edit action should apply');
  ok(runtimeState.preferences.zipDownloadRoutes.length === 1 && runtimeState.preferences.zipDownloadRoutes[0] === 'task-selection', 'runtime zip routes should normalize to the one implemented task-selection entry');
  ok(runtimeState.settings.output_format === 'png' && runtimeState.settings.transparent_output === true && runtimeState.settings.n === 3, 'runtime toolbar generation settings should override stale local defaults');
  ok(runtimeState.activeProfileId === 'name:gpt-image2原生' && runtimeState.activeImageProfileId === 'name:gpt-image2原生', 'runtime duplicate image profile selection should retain the explicit native profile key');
  ok(hooks.imageProfile().name === 'gpt-image2原生', 'runtime duplicate image profile selection must resolve to the native profile rather than the first reused id');
  hooks.setTestState({
    profiles: [{ id: 'runtime-image', name: 'Runtime Image', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' }],
    activeProfileId: 'runtime-image',
    activeImageProfileId: 'runtime-image',
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
  hooks.setTestState({ galleryVirtual: { viewportWidth: 1740, scrollTop: 0, viewportHeight: 700 } });
  const moderateVirtualWindow = hooks.galleryVirtualWindow(18);
  ok(moderateVirtualWindow.shouldVirtualize === false && moderateVirtualWindow.endIndex === 18, 'small gallery histories should keep the simple non-virtual layout');
  const mediumVirtualWindow = hooks.galleryVirtualWindow(42);
  ok(mediumVirtualWindow.shouldVirtualize === false && mediumVirtualWindow.endIndex === 42, 'medium gallery histories should keep the native list path to avoid cross-browser virtual DOM churn');
  const compactVirtualWindow = hooks.galleryVirtualWindow(43);
  ok(compactVirtualWindow.shouldVirtualize === true && compactVirtualWindow.endIndex - compactVirtualWindow.startIndex < 43, 'large-enough gallery histories should use the bounded virtual window path');
  const bufferedVirtualWindow = hooks.galleryVirtualWindow(50);
  ok(bufferedVirtualWindow.shouldVirtualize === true && bufferedVirtualWindow.endIndex - bufferedVirtualWindow.startIndex < 50, 'virtual gallery histories should keep a bounded buffered window');
  const largeVirtualWindow = hooks.galleryVirtualWindow(120);
  ok(largeVirtualWindow.shouldVirtualize === true && largeVirtualWindow.endIndex - largeVirtualWindow.startIndex < 90, 'very large gallery histories should keep offscreen paint bounded by the virtual window');
  const originalViewportWidth = sandbox.window.innerWidth;
  sandbox.window.innerWidth = 1740;
  const wideGalleryMetrics = hooks.measureGalleryMetrics({ clientWidth: 1740 });
  ok(wideGalleryMetrics.columns === 4, 'wide gallery should use four columns at the desktop breakpoint');
  ok(wideGalleryMetrics.cardHeight > 306, 'wide virtual gallery cards should grow beyond the legacy 306px height');
  const wideGalleryCssStart = homeCss.indexOf('@media (min-width: 1440px)');
  const wideGalleryCssEnd = homeCss.indexOf('.asset-prompt', wideGalleryCssStart);
  const wideGalleryCss = wideGalleryCssStart >= 0 && wideGalleryCssEnd > wideGalleryCssStart
    ? homeCss.slice(wideGalleryCssStart, wideGalleryCssEnd)
    : '';
  ok(wideGalleryCss.includes('.gallery-grid:not(.is-virtual) .asset-media')
    && wideGalleryCss.includes('.gallery-grid.is-virtual .asset-media')
    && wideGalleryCss.includes('.gallery-grid.is-virtual .asset-body')
    && wideGalleryCss.includes('overflow: visible')
    && wideGalleryCss.includes('.gallery-grid.is-virtual .asset-actions')
    && wideGalleryCss.includes('flex-shrink: 0')
    && (wideGalleryCss.match(/aspect-ratio:\s*1\s*\/\s*1/g) || []).length >= 1,
  'wide four-column gallery cards should use square media in both native and virtual grids without clipping virtual card actions');
  ok(
    wideGalleryMetrics.cardHeight === hooks.estimateGalleryCardHeight(1740, 4, 8),
    'measured gallery metrics should use the shared card-height estimator'
  );
  hooks.setTestState({ galleryVirtual: { viewportWidth: 1740, scrollTop: 0, viewportHeight: 700 } });
  const measuredVirtualWindow = hooks.galleryVirtualWindow(300);
  ok(
    measuredVirtualWindow.cardHeight === wideGalleryMetrics.cardHeight,
    'virtual gallery spacers should use the measured card height'
  );
  sandbox.window.innerWidth = 1150;
  ok(hooks.galleryVirtualWindow(300).columns === 2, 'gallery virtualization must match the CSS two-column breakpoint through 1180px');
  sandbox.window.innerWidth = originalViewportWidth;
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
  const overlayPixels = new Uint8ClampedArray([
    250, 204, 21, 255,
    239, 68, 68, 0,
    34, 197, 94, 96,
    59, 130, 246, 0
  ]);
  const openAiMaskPixels = hooks.openAiMaskPixelsFromOverlay(overlayPixels, 2, 2);
  ok(openAiMaskPixels[3] === 0 && openAiMaskPixels[7] === 255 && openAiMaskPixels[11] === 0 && openAiMaskPixels[15] === 255,
    'OpenAI mask encoding should make painted overlay pixels transparent and unpainted pixels opaque');
  ok(openAiMaskPixels[0] === 255 && openAiMaskPixels[1] === 255 && openAiMaskPixels[2] === 255,
    'OpenAI mask encoding should use an opaque white RGB payload independent of brush color');
  const restoredOverlayPixels = hooks.overlayPixelsFromOpenAiMask(openAiMaskPixels, 2, 2);
  ok(restoredOverlayPixels[3] > 0 && restoredOverlayPixels[7] === 0 && restoredOverlayPixels[11] > 0 && restoredOverlayPixels[15] === 0,
    'OpenAI mask preview decoding should restore selected transparent regions to the colored overlay');
  const clonedRefs = await hooks.cloneReferenceSnapshots([{ id: 'r1', blobId: 'ref-blob', originalBlobId: 'ref-blob', name: 'ref.png', width: 10, height: 10 }]);
  ok(clonedRefs.length === 1 && clonedRefs[0].blobId !== 'ref-blob' && clonedRefs[0].originalBlobId === clonedRefs[0].blobId, 'task reference snapshots should clone blobs instead of sharing live composer references');

  const previousQuerySelector = sandbox.document.querySelector;
  const previousClearReferences = hooks.getTestState().references;
  const clearMaskId = 'clear-after-mask';
  const clearCompositeId = 'clear-after-composite';
  const clearOriginalId = 'clear-after-original';
  const clearPngBytes = Buffer.from('clear-png-bytes');
  fakeIndexedDbStore.set(clearMaskId, new Blob([clearPngBytes], { type: 'image/png' }));
  fakeIndexedDbStore.set(clearCompositeId, new Blob([clearPngBytes], { type: 'image/png' }));
  fakeIndexedDbStore.set(clearOriginalId, new Blob([clearPngBytes], { type: 'image/png' }));
  const clearCanvasContext = {
    clearRect: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })
  };
  const clearCanvas = {
    width: 1,
    height: 1,
    getContext: () => clearCanvasContext,
    toDataURL: () => 'data:image/png;base64,AA=='
  };
  sandbox.document.querySelector = (selector) => selector === '#maskCanvas' ? clearCanvas : previousQuerySelector(selector);
  hooks.setTestState({
    mode: 'gallery',
    references: [{ id: 'clear-after-ref', blobId: clearCompositeId, compositedBlobId: clearCompositeId, originalBlobId: clearOriginalId, maskBlobId: clearMaskId, maskFormat: hooks.OPENAI_MASK_FORMAT, name: 'clear.png' }]
  });
  hooks.openMaskEditor('clear-after-ref');
  const clearResult = await hooks.maskClear();
  const clearedReference = hooks.getTestState().references[0];
  ok(clearResult === true && clearedReference.blobId === clearCompositeId
    && clearedReference.compositedBlobId === clearCompositeId
    && clearedReference.maskBlobId === clearMaskId,
  'clearing the canvas should defer reference metadata and Blob cleanup until the transactional save');
  ok(fakeIndexedDbStore.has(clearMaskId) && fakeIndexedDbStore.has(clearCompositeId),
    'mask clear should retain old Blobs until a committed save can prove they are unreferenced');
  hooks.setTestState({ references: previousClearReferences });
  sandbox.document.querySelector = previousQuerySelector;

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
  ok(!Object.prototype.hasOwnProperty.call(googleBody, 'target_size')
    && !Object.prototype.hasOwnProperty.call(googleBody, 'targetSize'), 'Google 4K + 9:16 request body must not include a target pixel size');
  ok(Object.keys(googleBody.extra_body || {}).join(',') === 'generationConfig', 'Google JSON request extra_body must contain only generationConfig');
  ok(Object.keys(googleBody.extra_body?.generationConfig || {}).sort().join(',') === 'imageConfig,responseModalities', 'Google JSON request generationConfig must avoid duplicate snake_case config');
  ok(Object.keys(googleBody.extra_body?.generationConfig?.imageConfig || {}).sort().join(',') === 'aspectRatio,imageSize', 'Google JSON request imageConfig must contain only canonical keys');
  ok(googleBody.prompt === 'google portrait', 'Google request prompt should remain exactly the user prompt');
  ok(googleBody.quality === 'high', 'Google generation request body should include selected quality');
  ok(googleBody.output_format === 'png', 'Google generation request body should include selected output format');
  ok(googleBody.negative_prompt === '不要文字，不要水印' && googleBody.negativePrompt === undefined, 'JSON generation request should send one canonical negative prompt field');
  ok(googleBody.transparent_background === false, 'Google png request body should explicitly include selected transparent background false value');
  ok(googleBody.background === 'auto', 'Google opaque png request body should include background=auto for gateway compatibility');
  ok(googleBody.moderation === undefined, 'Google generation request body must not include the OpenAI moderation field');
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
  ok(!Object.prototype.hasOwnProperty.call(google4kBodies[0], 'target_size')
    && !Object.prototype.hasOwnProperty.call(google4kBodies[0], 'targetSize'), 'Google 4K request should not preserve a target pixel size');

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
  ok(Object.keys(googleFormExtra).join(',') === 'generationConfig', 'Google reference FormData extra_body must contain only generationConfig');
  ok(Object.keys(googleFormExtra?.generationConfig || {}).sort().join(',') === 'imageConfig,responseModalities', 'Google reference FormData generationConfig must avoid duplicate snake_case config');
  ok(Object.keys(googleFormExtra?.generationConfig?.imageConfig || {}).sort().join(',') === 'aspectRatio,imageSize', 'Google reference FormData imageConfig must contain only canonical keys');
  ok(googleForm.get('quality') === 'medium', 'Google reference FormData should include selected quality');
  ok(googleForm.get('output_format') === 'webp', 'Google reference FormData should include selected output format');
  ok(String(googleForm.get('output_compression')) === '28', 'Google reference FormData should convert selected output quality to API compression');
  ok(googleForm.get('moderation') === null, 'Google reference FormData must not include the OpenAI moderation field');
  ok(String(googleForm.get('n')) === '1', 'Google reference FormData should force n=1');

  fakeIndexedDbStore.set('google-mask-display', new Blob(['display-overlay'], { type: 'image/png' }));
  fakeIndexedDbStore.set('google-mask-original', new Blob(['google-original'], { type: 'image/png' }));
  fakeIndexedDbStore.set('google-mask-source', new Blob(['mask'], { type: 'image/png' }));
  fakeIndexedDbStore.set('google-mask-composited', new Blob(['google-composited-annotation'], { type: 'image/png' }));
  fakeIndexedDbStore.set('google-mask-annotation', new Blob(['annotation'], { type: 'image/png' }));
  await hooks.sendGenerationRequest('google masked reference', { format: 'png' }, {
    profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image' },
    references: [{ blobId: 'google-mask-display', originalBlobId: 'google-mask-original', compositedBlobId: 'google-mask-composited', maskBlobId: 'google-mask-source', annotationBlobId: 'google-mask-annotation', name: 'masked.png' }]
  });
  const googleMaskedForm = capturedRequest?.options?.body;
  ok(await googleMaskedForm.getAll('image[]')[0].text() === 'google-composited-annotation', 'Google masked references must upload the composited annotated image');
  ok(googleMaskSupportLabel.includes('黄色半透明标注合成图')
    && googleMaskedForm.get('mask') === null
    && String(googleMaskedForm.get('prompt') || '').includes('黄色标注区域'), 'Google mask label must match the composited image, no-mask field, and marked-region prompt behavior');

  fakeIndexedDbStore.set('xai-mask-display', new Blob(['display-overlay'], { type: 'image/png' }));
  fakeIndexedDbStore.set('xai-mask-original', new Blob(['xai-original'], { type: 'image/png' }));
  fakeIndexedDbStore.set('xai-mask-source', new Blob(['mask'], { type: 'image/png' }));
  fakeIndexedDbStore.set('xai-mask-composited', new Blob(['xai-composited-annotation'], { type: 'image/png' }));
  fakeIndexedDbStore.set('xai-mask-annotation', new Blob(['annotation'], { type: 'image/png' }));
  await hooks.sendGenerationRequest('xai masked reference', { format: 'png' }, {
    profile: { id: 'xai-image', name: 'Grok Imagine', provider: 'xai', model: 'grok-imagine-image' },
    references: [{ blobId: 'xai-mask-display', originalBlobId: 'xai-mask-original', compositedBlobId: 'xai-mask-composited', maskBlobId: 'xai-mask-source', annotationBlobId: 'xai-mask-annotation', name: 'masked.png' }]
  });
  const xaiMaskedForm = capturedRequest?.options?.body;
  ok(await xaiMaskedForm.getAll('image[]')[0].text() === 'xai-composited-annotation', 'xAI masked references must upload the composited annotated image');
  ok(xaiMaskSupportLabel.includes('黄色半透明标注合成图')
    && xaiMaskedForm.get('mask') === null
    && String(xaiMaskedForm.get('prompt') || '').includes('黄色标注区域'), 'xAI mask label must match the composited image, no-mask field, and marked-region prompt behavior');

  let missingMaskedCompositeError = null;
  try {
    await hooks.sendGenerationRequest('missing masked composite', { format: 'png' }, {
      profile: { id: 'google-image', name: 'Nano Banana2', provider: 'google', model: 'gemini-3.1-flash-image' },
      references: [{ blobId: 'google-mask-display', originalBlobId: 'google-mask-original', compositedBlobId: 'missing-google-composite', maskBlobId: 'google-mask-source', name: 'masked.png' }]
    });
  } catch (error) {
    missingMaskedCompositeError = error;
  }
  ok(missingMaskedCompositeError?.code === 'IMAGE_EDIT_MASK_COMPOSITE_MISSING', 'Google/xAI masked requests must fail locally with a stable code when the composited annotated image is missing');

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
  const defaultOpenAiOutput = hooks.imageOutputParams({ format: 'png', transparent: true }, { provider: 'openai', model: 'gpt-image-2' });
  ok(!Object.prototype.hasOwnProperty.call(defaultOpenAiOutput, 'background') && !Object.prototype.hasOwnProperty.call(defaultOpenAiOutput, 'transparent_background'), 'default OpenAI-compatible gpt-image-2 requests should omit native transparency fields');
  const nativeOpenAiOutput = hooks.imageOutputParams({ format: 'png', transparent: true }, { provider: 'openai', model: 'gpt-image-2', supportsNativeTransparency: true });
  ok(nativeOpenAiOutput.background === 'transparent' && nativeOpenAiOutput.transparent_background === true, 'OpenAI native transparency fields should require an explicit profile capability');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'openai', model: 'gpt-image-2' }) === false, 'gpt-image-2 OpenAI-compatible profiles should not assume native transparency support');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'openai', model: 'gpt-image-2', supportsNativeTransparency: true }) === true, 'explicit OpenAI native transparency capability should be honored');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'google', model: 'gemini-3.1-flash-image-preview' }) === false, 'Google/Nano profiles should not claim OpenAI transparent-background support');
  ok(hooks.openAiTransparentBackgroundSupported({ provider: 'xai', model: 'grok-imagine-image-pro' }) === false, 'Xai/Grok profiles should not claim OpenAI transparent-background support');
  ok(hooks.outputCompressionFromQuality(100) === 0 && hooks.outputCompressionFromQuality(70) === 30, 'output quality 100 must map to minimum API compression and 70 to compression 30');
  ok(hooks.outputQualityFromCompression(0) === 100 && hooks.outputQualityFromCompression(30) === 70, 'API compression must map back to the matching user-facing output quality');
  ok(hooks.outputQualityPercent(null, 90) === 90, 'empty persisted output quality should fall back to the default quality');
  ok(hooks.imageOutputParams({ format: 'webp', compression: 100 }, { provider: 'openai' }).output_compression === 0, 'WebP output quality 100 should send API compression 0');
  for (const quality of ['auto', 'low', 'medium', 'high']) {
    ok(hooks.imageOutputParams({ format: 'webp', quality }, { provider: 'openai' }).quality === quality, `OpenAI ${quality} quality should be preserved in image output params`);
  }
  ok(hooks.imageOutputParams({ format: 'webp', quality: 'hd' }, { provider: 'openai' }).quality === 'high', 'legacy hd must not be sent to the image API');
  ok(!Object.prototype.hasOwnProperty.call(
    hooks.imageOutputParams({ format: 'png', quality: 'high' }, { provider: 'openai', model: 'gpt-image-2', codexCli: true }),
    'quality'
  ), 'Codex CLI image requests should omit the unsupported quality field');

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

  const visibleTransparentPrompt = 'openai transparent png generation';
  await hooks.sendGenerationRequest(visibleTransparentPrompt, {
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
  ok(!Object.prototype.hasOwnProperty.call(openAiTransparentBody, 'background'), 'OpenAI/gpt-image2 should omit native background by default');
  ok(!Object.prototype.hasOwnProperty.call(openAiTransparentBody, 'transparent_background'), 'OpenAI/gpt-image2 should omit native transparent_background by default');
  ok(openAiTransparentBody.prompt.includes('openai transparent png generation') && openAiTransparentBody.prompt.includes('#00FF00'), 'transparent mode should use an internal chroma-key effective prompt');
  ok(visibleTransparentPrompt === 'openai transparent png generation', 'internal chroma-key prompt handling should not mutate the user-visible prompt value');
  ok(hooks.promptWithCanvasConstraint('主体贴纸', 'openai', { format: 'png', transparent: true }).includes('#00FF00'), 'transparent helper should build an internal chroma-key prompt');
  ok(hooks.promptWithCanvasConstraint('主体贴纸', 'openai', { format: 'png', transparent: false }) === '主体贴纸', 'opaque prompt helper should preserve the user prompt exactly');
  const transparentParams = hooks.getTransparentRequestParams({ output_format: 'jpeg', output_compression: 80, transparent: true });
  ok(transparentParams.output_format === 'png' && transparentParams.output_compression === null && transparentParams.transparent_background === true, 'transparent params should force PNG without compression');

  await hooks.sendGenerationRequest('openai native transparent generation', {
    resolution: '1K',
    aspectRatio: '1:1',
    quality: 'high',
    format: 'png',
    transparent: true,
    count: 1
  }, {
    profile: { id: 'openai-native', name: 'Native transparency gateway', provider: 'openai', apiMode: 'images', model: 'gpt-image-2', supportsNativeTransparency: true },
    references: []
  });
  const nativeTransparentBody = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(nativeTransparentBody.background === 'transparent' && nativeTransparentBody.transparent_background === true, 'explicit OpenAI native transparency capability should send gateway fields');

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
  ok(openAiEditForm.getAll('image[]').length === 1, 'OpenAI/gpt-image2 edits must send reference files as image[]');
  ok(openAiEditForm.getAll('image').length === 0, 'OpenAI/gpt-image2 edits should not use the legacy image field by default');
  ok(openAiEditForm.get('negative_prompt') === '不要边框，不要裁切' && openAiEditForm.get('negativePrompt') === null, 'FormData edit request should send one canonical negative prompt field');
  ok(openAiEditForm.get('response_format') === null || openAiEditForm.get('response_format') === 'b64_json', 'OpenAI/gpt-image2 edits should only include supported response_format values');
  ok(openAiEditForm.get('n') === null, 'OpenAI/gpt-image2 edits should omit the default n=1 field');
  const openAiEditFields = openAiEditForm.fields.map((item) => item[0]);
  ok(openAiEditFields.slice(0, 6).join(',') === 'model,prompt,size,output_format,moderation,quality', 'OpenAI/gpt-image2 multipart fields should follow the CookSleep-compatible order');
  const openAiCompressionIndex = openAiEditFields.indexOf('output_compression');
  ok(openAiCompressionIndex < 0 || openAiCompressionIndex === 6, 'OpenAI/gpt-image2 compression should follow quality and precede response options');

  fakeIndexedDbStore.set('ref-jpeg', new Blob(['jpeg-reference'], { type: 'image/jpeg' }));
  await hooks.sendGenerationRequest('OpenAI MIME-normalized reference edit', {
    resolution: '1K',
    aspectRatio: '1:1',
    quality: 'high',
    format: 'png',
    count: 1
  }, {
    profile: { id: 'openai-image', name: 'gpt-image2', provider: 'openai', apiMode: 'images', model: 'gpt-image-2' },
    references: [{ blobId: 'ref-jpeg', name: 'legacy-reference.png', type: 'image/jpeg' }]
  });
  const normalizedEditFile = capturedRequest?.options?.body?.get?.('image[]');
  ok(normalizedEditFile?.type === 'image/jpeg', 'reference upload should retain the Blob MIME type');
  ok(normalizedEditFile?.name === 'legacy-reference.jpg', 'reference upload filenames must match their actual JPEG MIME type');

  const streamingEditOptions = {
    profile: { id: 'openai-stream-edit', name: 'OpenAI streaming edit', provider: 'openai', apiMode: 'images', model: 'gpt-image-2', streamImages: true },
    references: [{ blobId: 'ref-blob', name: 'reference.png' }],
    advanced: { responseDelivery: 'b64_json', responseFormatB64Json: true, streamImages: true, streamPartialImages: 1 }
  };
  const responseWithJson = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 400 ? 'Bad Request' : 'OK',
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json' : null },
    text: async () => JSON.stringify(body)
  });
  const retryForms = [];
  sandbox.fetch = async (_url, options) => {
    retryForms.push(options.body);
    if (retryForms.length === 1) {
      return responseWithJson(400, {
        error: { message: 'Unknown parameter: partial_images', type: 'invalid_request_error', code: 'invalid_request_error', param: 'partial_images' },
        upstreamStatus: 400,
        stage: 'upstream-response-headers'
      });
    }
    return responseWithJson(200, { data: [{ b64_json: Buffer.from('retry-success').toString('base64') }] });
  };
  const retriedEditResponse = await hooks.sendGenerationRequest('retryable streaming edit', { count: 1 }, streamingEditOptions);
  ok(retryForms.length === 2 && retriedEditResponse.imageEditCompatibilityRetry === true, 'a pre-acceptance stream-field validation error should retry an edit exactly once');
  ok(retryForms[0].get('stream') === 'true' && retryForms[0].get('partial_images') === '1', 'the initial retryable edit should include the requested streaming fields');
  ok(retryForms[1].get('stream') === null && retryForms[1].get('partial_images') === null && retryForms[1].get('response_format') === 'b64_json', 'the compatibility retry should remove only streaming fields and retain b64_json delivery');

  let acceptedFailure = null;
  const acceptedRetryForms = [];
  sandbox.fetch = async (_url, options) => {
    acceptedRetryForms.push(options.body);
    return responseWithJson(400, {
      error: { message: 'Unknown parameter: partial_images', type: 'invalid_request_error', code: 'invalid_request_error', param: 'partial_images' },
      upstreamStatus: 400,
      stage: 'upstream-response-body'
    });
  };
  try {
    await hooks.sendGenerationRequest('accepted streaming edit', { count: 1 }, streamingEditOptions);
  } catch (error) {
    acceptedFailure = error;
  }
  ok(acceptedFailure && acceptedRetryForms.length === 1, 'an edit error outside the proxy response-header stage must never be retried automatically');
  sandbox.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return { ok: true, text: async () => JSON.stringify({ data: [] }) };
  };

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
  ok(Number(xaiBody.output_compression) === 20, 'Xai generation request body should convert selected output quality to API compression');
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

  await hooks.sendGenerationRequest('openai custom 4k 3:4', {
    resolution: '4K',
    aspectRatio: '3:4',
    quality: 'high',
    format: 'png',
    count: 1
  }, {
    profile: { id: 'openai-image', name: 'OpenAI Image', provider: 'openai', model: 'gpt-image-2' },
    references: []
  });
  const openAi4k34Body = JSON.parse(capturedRequest?.options?.body || '{}');
  ok(openAi4k34Body.size === '2480x3312', 'OpenAI 4K + 3:4 request body should preserve the current custom size 2480x3312');
  ok(openAi4k34Body.size === hooks.openAiSizePayload({ resolution: '4K', aspectRatio: '3:4' }), 'OpenAI 4K + 3:4 request should use the existing custom size conversion without a second normalizer');
  ok(openAi4k34Body.size !== '1024x1536' && openAi4k34Body.size !== '1536x2048', 'OpenAI 4K + 3:4 request must not be rewritten to a standard lower-tier size');

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

  requestCount = 0;
  const openAiStreamPreviewSlots = [];
  const openAiStreamRequestCounts = [];
  sandbox.sendGenerationRequest = async (prompt, params, options) => {
    const requestIndex = requestCount++;
    openAiStreamRequestCounts.push(Number(params.count));
    options?.onPartialImage?.({ outputIndex: 0, partialIndex: 1, eventType: 'image_generation.partial_image', b64_json: Buffer.from(`stream-slot-${requestIndex}`).toString('base64') });
    return { data: [{ b64_json: Buffer.from(`stream-final-${requestIndex}`).toString('base64') }], slot: requestIndex };
  };
  sandbox.persistResponseImages = async (response) => [{ blobId: `stream-final-${response.slot}`, width: 1024, height: 1024, type: 'image/png' }];
  const openAiStreamMulti = await hooks.collectGenerationResult('stream split images', { count: 3 }, {
    entry: 'gallery',
    profile: { id: 'openai-stream-image', name: 'OpenAI Stream', provider: 'openai', model: 'gpt-image-2', streamImages: true },
    onPartialImage: (candidate) => openAiStreamPreviewSlots.push(candidate.outputIndex)
  });
  ok(openAiStreamMulti.images.length === 3, 'streaming OpenAI multi-image requests should merge one result per split request');
  ok(openAiStreamRequestCounts.every((count) => count === 1) && openAiStreamRequestCounts.length === 3, 'streaming OpenAI multi-image requests should send concurrent n=1 requests');
  ok(openAiStreamPreviewSlots.sort((a, b) => a - b).join(',') === '0,1,2', 'streaming OpenAI multi-image previews should use independent output slots');

  const commonPrefix = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9s=';
  const imageA = commonPrefix + Buffer.from('first-image-tail').toString('base64');
  const imageB = commonPrefix + Buffer.from('second-image-tail').toString('base64');
  const persistedImages = typeof hooks.persistResponseImages === 'function' ? await hooks.persistResponseImages({ data: [{ b64_json: imageA }, { b64_json: imageB }] }) : [];
  ok(persistedImages.length === 2, 'persistResponseImages should keep two base64 images with the same encoded prefix');
  const duplicatedImages = await hooks.persistResponseImages({ data: [{ b64_json: imageA }, { b64_json: imageA }] });
  ok(duplicatedImages.length === 2, 'persistResponseImages should preserve duplicate image bytes when they represent separate output items');

  let activeFetches = 0;
  let maxActiveFetches = 0;
  const originalFetch = sandbox.fetch;
  sandbox.fetch = async () => {
    activeFetches += 1;
    maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
    await new Promise((resolve) => setTimeout(resolve, 15));
    activeFetches -= 1;
    return imageResponse(Buffer.from(commonPrefix, 'base64'));
  };
  const remotePersisted = await hooks.persistResponseImages({ data: [{ url: 'https://example.com/a.png' }, { url: 'https://example.com/b.png' }] });
  sandbox.fetch = originalFetch;
  ok(remotePersisted.length === 2, 'persistResponseImages should persist both remote URL images');
  ok(maxActiveFetches > 1, 'persistResponseImages should download multiple remote images concurrently');

  const proxyFallbackSources = [];
  sandbox.fetch = async (url) => {
    proxyFallbackSources.push(String(url));
    if (/^https:\/\//i.test(String(url))) throw new Error('direct request blocked by browser CORS');
    return imageResponse(Buffer.from(commonPrefix, 'base64'));
  };
  const proxyFallbackPersisted = await hooks.persistResponseImages({ data: [{ url: 'https://example.com/proxy-fallback.png' }] });
  ok(proxyFallbackPersisted.length === 1 && proxyFallbackSources.length === 2 && proxyFallbackSources[1].startsWith('/api-proxy/image-download?url='), 'a legal HTTPS URL should continue through the site proxy after a direct browser fetch failure');

  let relativeFetchUrl = '';
  sandbox.fetch = async (url) => {
    relativeFetchUrl = String(url);
    return imageResponse(Buffer.from(commonPrefix, 'base64'));
  };
  const relativePersisted = await hooks.persistResponseImages({ data: [{ url: "'/assets/relative.png'" }] }, { upstreamOrigin: 'https://images.example/v1' });
  ok(relativePersisted.length === 1 && relativeFetchUrl === 'https://images.example/assets/relative.png', 'persistResponseImages should resolve a quoted relative image URL against the supplied safe origin');

  let relativeNoOriginError;
  try {
    await hooks.persistResponseImages({ data: [{ url: '/assets/no-origin.png' }] });
  } catch (error) {
    relativeNoOriginError = error;
  }
  ok(relativeNoOriginError?.code === 'IMAGE_RESPONSE_REMOTE_FETCH_FAILED'
    && relativeNoOriginError?.remoteImageAttempts?.[0]?.category === 'RELATIVE_ORIGIN_MISSING'
    && !relativeNoOriginError.remoteImageAttempts[0].host,
  'relative image URLs without an upstream origin should fail before network access with bounded diagnostics');

  const diagnosticAttempts = [];
  sandbox.fetch = async () => { throw new Error('network failure with secret query'); };
  await hooks.fetchRemoteImageBlob('https://images.example/assets/result.png?signature=secret-query', {
    useProxy: false,
    diagnostics: diagnosticAttempts,
    sourceField: 'image_url'
  });
  const diagnosticKeys = new Set(['sourceField', 'category', 'protocol', 'hostPresent', 'lengthRange', 'status', 'contentType']);
  ok(diagnosticAttempts.length === 1
    && [...Object.keys(diagnosticAttempts[0])].every((key) => diagnosticKeys.has(key))
    && !JSON.stringify(diagnosticAttempts).includes('secret-query')
    && diagnosticAttempts[0].sourceField === 'image_url'
    && diagnosticAttempts[0].protocol === 'https:'
    && diagnosticAttempts[0].hostPresent === true,
  'remote image diagnostics should be bounded and must not retain a complete URL or query signature');

  const maliciousCodeAttempts = [];
  sandbox.fetch = async () => ({
    ok: false,
    status: 502,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json' : null },
    clone() { return this; },
    text: async () => JSON.stringify({ error: { code: 'https://evil.example/a.png?sig=secret' } })
  });
  await hooks.fetchRemoteImageBlob('https://images.example/assets/rejected.png', {
    useProxy: false,
    diagnostics: maliciousCodeAttempts,
    sourceField: 'image_url'
  });
  ok(maliciousCodeAttempts.length === 1
    && maliciousCodeAttempts[0].category === 'HTTP_502'
    && !JSON.stringify(maliciousCodeAttempts).includes('evil.example')
    && !JSON.stringify(maliciousCodeAttempts).includes('secret'),
  'untrusted upstream error codes should be reduced to safe diagnostic categories');

  sandbox.fetch = async () => imageResponse('not found', 'image/png', false);
  ok(await hooks.fetchRemoteImageBlob('https://example.com/not-found.png') === null, 'remote image persistence should reject non-ok responses');
  sandbox.fetch = async () => imageResponse('<html>not an image</html>', 'text/html', true);
  ok(await hooks.fetchRemoteImageBlob('https://example.com/not-image') === null, 'remote image persistence should reject non-image Content-Type');
  sandbox.fetch = async () => imageResponse('', 'image/png', true);
  ok(await hooks.fetchRemoteImageBlob('https://example.com/empty.png') === null, 'remote image persistence should reject empty blobs');
  const abortedRemoteImage = new AbortController();
  abortedRemoteImage.abort();
  let remoteAbortError;
  try {
    await hooks.fetchRemoteImageBlob('https://example.com/aborted.png', { signal: abortedRemoteImage.signal });
  } catch (error) {
    remoteAbortError = error;
  }
  ok(remoteAbortError?.code === 'IMAGE_RESPONSE_REMOTE_ABORTED' && remoteAbortError?.stage === 'image-fetch', 'remote image cancellation should expose a distinct diagnostic code');
  let remoteFetchError;
  try {
    await hooks.persistResponseImages({ data: [{ url: 'https://example.com/unavailable.png' }] });
  } catch (error) {
    remoteFetchError = error;
  }
  ok(remoteFetchError?.code === 'IMAGE_RESPONSE_REMOTE_FETCH_FAILED' && remoteFetchError?.stage === 'image-fetch',
    'remote image download failures should expose a distinct diagnostic code and stage');
  sandbox.fetch = originalFetch;

  const inlineUrlImages = await hooks.persistResponseImages({
    data: [
      { url: `data:image/png;base64,${commonPrefix}` },
      { image_url: `data:image/png;base64,${commonPrefix}` }
    ]
  });
  ok(inlineUrlImages.length === 2, 'data URL images returned through url/image_url fields should both be persisted');
  ok(inlineUrlImages.every((image) => image.blobId && !String(image.remoteUrl || image.url || '').startsWith('data:')), 'persisted inline data URL images should not keep data URLs in task state');
  const stringContainerImages = await hooks.persistResponseImages({
    images: [
      `data:image/png;base64,${commonPrefix}`,
      `data:image/png;base64,${commonPrefix}`
    ]
  });
  ok(stringContainerImages.length === 2, 'string image containers should be persisted as image results');
  let invalidBase64Error;
  try {
    await hooks.persistResponseImages({ data: [{ b64_json: Buffer.from('not-an-image').toString('base64') }] });
  } catch (error) {
    invalidBase64Error = error;
  }
  ok(invalidBase64Error?.code === 'IMAGE_RESPONSE_IMAGE_DATA_INVALID', 'invalid Base64 image data should be rejected by image magic validation');

  const onePixelPng = Buffer.from(commonPrefix, 'base64');
  fakeIndexedDbStore.set('mask-display', new Blob([onePixelPng], { type: 'image/png' }));
  fakeIndexedDbStore.set('mask-original', new Blob([onePixelPng], { type: 'image/png' }));
  fakeIndexedDbStore.set('mask-source', new Blob([onePixelPng], { type: 'image/png' }));
  capturedRequest = null;
  sandbox.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ data: [] })
    };
  };
  await hooks.sendGenerationRequest('masked edit', {
    format: 'png',
    count: 1
  }, {
    profile: { id: 'openai-mask-image', name: 'OpenAI Mask', provider: 'openai', model: 'gpt-image-2' },
    references: [{ blobId: 'mask-display', originalBlobId: 'mask-original', maskBlobId: 'mask-source', maskFormat: hooks.OPENAI_MASK_FORMAT, name: 'source.png' }]
  });
  const maskForm = capturedRequest?.options?.body;
  ok(maskForm?.getAll?.('image[]').length === 1 && maskForm?.get?.('mask') instanceof Blob, 'masked OpenAI edits should send the original main image and a separate mask field');
  ok(maskForm?.fields?.find((item) => item[0] === 'mask')?.[2] === 'mask.png', 'masked OpenAI edits should send the mask as mask.png');
  sandbox.fetch = originalFetch;

  const fakeJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const fakeJpegInfo = await hooks.imageInfoFromBlob(new Blob([fakeJpegBytes], { type: 'image/png' }));
  ok(fakeJpegInfo.type === 'image/jpeg', 'imageInfoFromBlob should detect JPEG bytes even when the declared MIME type says PNG');
  ok(fakeJpegInfo.hasAlpha === undefined, 'JPEG byte payload should not be treated as transparent PNG');
  const persistedJpeg = await hooks.persistResponseImages({
    data: [{
      b64_json: Buffer.from(fakeJpegBytes).toString('base64'),
      output_format: 'jpeg'
    }]
  });
  ok(persistedJpeg.length === 1 && fakeIndexedDbStore.get(persistedJpeg[0].blobId)?.type === 'image/jpeg',
    'JPEG response format should persist as an image/jpeg Blob instead of defaulting to PNG');

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
  hooks.setTestTasks([{
    id: 'advanced-task-store',
    status: 'error',
    advanced: openAiAdvancedSnapshot,
    images: []
  }]);
  hooks.writeStore();
  const advancedTaskStoreWrite = localStorageWrites.find(([, value]) => String(value || '').includes('advanced-task-store'));
  const advancedTaskStorePayload = advancedTaskStoreWrite ? JSON.parse(advancedTaskStoreWrite[1]) : null;
  const persistedAdvanced = advancedTaskStorePayload?.tasks?.find((task) => task.id === 'advanced-task-store')?.advanced;
  ok(persistedAdvanced?.responseFormatB64Json === true
    && persistedAdvanced?.streamImages === false
    && persistedAdvanced?.streamPartialImages === 0
    && persistedAdvanced?.timeout === 6000, 'writeStore should persist the effective advanced task snapshot');

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
  const emergencyStoreWrite = emergencyWrites.find(([, value]) => String(value || '').includes('taskStore'));
  const emergencyPayload = emergencyStoreWrite ? JSON.parse(emergencyStoreWrite[1]) : null;
  ok(emergencyStoreAttempts === 3, 'writeStore should fall back to a lightweight localStorage pointer after quota writes fail');
  ok(Array.isArray(emergencyPayload?.tasks) && emergencyPayload.tasks.length === 0 && emergencyPayload.taskStore?.count === 1
    && emergencyPayload.taskStore?.ids?.includes('task-emergency-store'), 'quota fallback should keep full task data out of localStorage while retaining recovery IDs');
  await hooks.flushTaskPersistence();
  const persistedEmergencyTask = fakeIndexedDbStores.get('tasks')?.get('task-emergency-store');
  ok(persistedEmergencyTask?.status === 'success' && persistedEmergencyTask.images?.length === 2, 'quota fallback must preserve successful multi-image task evidence in IndexedDB');
  ok(persistedEmergencyTask?.expectedCount === 2 && persistedEmergencyTask?.actualCount === 2 && persistedEmergencyTask?.failedCount === 0, 'quota fallback must preserve multi-image counts for refresh recovery');

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

  const duplicateProfileIdProfiles = [
    { id: 'shared-image', name: 'Shared Image', provider: 'openai', apiMode: 'images', model: 'gpt-image-2', timeout: 111 },
    { id: 'shared-image', name: 'gpt-image2-4k超分', provider: 'openai', apiMode: 'images', model: 'gpt-image-2', timeout: 6000 },
    { id: 'shared-image', name: 'gpt-image2原生', provider: 'openai', apiMode: 'images', model: 'gpt-image-2', timeout: 6000 }
  ];
  hooks.setTestState({
    profiles: duplicateProfileIdProfiles,
    activeImageProfileId: 'shared-image',
    activeProfileId: 'shared-image'
  });
  const duplicateIdMenu = hooks.renderPopover({ type: 'model-config', rect: { left: 20, top: 20, bottom: 60 } });
  ok((duplicateIdMenu.match(/class="active"/g) || []).length === 1, 'duplicate profile IDs must not mark multiple model menu items active');
  hooks.setTestState({ activeImageProfileId: 'name:Shared Image', activeProfileId: 'name:Shared Image' });
  const asciiDuplicateHeaders = hooks.appendAdvancedHeaders({}, 'gallery', hooks.imageProfile());
  ok(asciiDuplicateHeaders['X-GPT-Image-Profile-Id'] === 'name:Shared Image', 'ASCII duplicate profile selection keys must remain directly usable in the request header');
  ok(duplicateIdMenu.includes('data-value="name:gpt-image2-4k超分"'), 'duplicate profile IDs should use a prefixed unique profile name as the selectable request key');
  hooks.setTestState({ activeImageProfileId: 'name:gpt-image2-4k超分', activeProfileId: 'name:gpt-image2-4k超分' });
  ok(hooks.imageProfile()?.name === 'gpt-image2-4k超分', 'duplicate profile IDs should remain individually selectable by their unique names');
  const duplicateProfileHeaders = hooks.appendAdvancedHeaders({}, 'gallery', hooks.imageProfile());
  const encodedDuplicateProfile = duplicateProfileHeaders['X-GPT-Image-Profile-Id'];
  ok(encodedDuplicateProfile === hooks.encodeProfileHeaderValue('name:gpt-image2-4k超分'), 'duplicate profile selection must reach the API proxy with the encoded unambiguous key');
  ok(/^[\x20-\x7e]*$/.test(encodedDuplicateProfile), 'profile request headers must contain only transport-safe ASCII');
  let unicodeProfileRequestCreated = false;
  try {
    new Request('https://example.test/api-proxy/images/generations', { headers: duplicateProfileHeaders });
    unicodeProfileRequestCreated = true;
  } catch {}
  ok(unicodeProfileRequestCreated, 'unicode profile names must not make Request construction fail');
  ok(hooks.encodeProfileHeaderValue('plain-profile') === 'plain-profile', 'ASCII profile IDs must remain backward compatible');

  hooks.setTestState({ activeImageProfileId: 'name:gpt-image2原生', activeProfileId: 'name:gpt-image2原生' });
  const nativeDuplicateMenu = hooks.renderPopover({ type: 'model-config', rect: { left: 20, top: 20, bottom: 60 } });
  ok((nativeDuplicateMenu.match(/class="active"/g) || []).length === 1
    && nativeDuplicateMenu.includes('data-value="name:gpt-image2原生"'), 'model menu should keep the explicitly selected native duplicate active');
  const nativeTaskProfile = hooks.resolveTaskProfile({
    profileId: 'name:gpt-image2原生',
    requestedParams: { profileId: 'name:gpt-image2原生' }
  });
  ok(nativeTaskProfile?.name === 'gpt-image2原生', 'task profile resolution should preserve the explicitly selected native duplicate');
  const nativeAdvancedModal = hooks.renderEntryAdvancedModal('gallery');
  ok(nativeAdvancedModal.includes('gpt-image2原生') && nativeAdvancedModal.includes('value="6000"'), 'gallery advanced modal should use the selected native profile defaults instead of the first duplicate');
  const nativeAdvancedHeaders = hooks.appendAdvancedHeaders({}, 'gallery', hooks.imageProfile());
  ok(nativeAdvancedHeaders['X-GPT-Image-Profile-Id'] === hooks.encodeProfileHeaderValue('name:gpt-image2原生'), 'gallery request headers should use the same native profile selection key as the menu and modal');

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
  ok(payload.stream === false, 'Agent Responses payload should default to non-streaming when the profile has no streaming capability');
  ok(typeof payload.currentBeijingTime === 'string' && /北京时间/.test(payload.currentBeijingTime), 'Agent payload should inject current Beijing time context');
  ok(payload.currentModelSlug === 'gpt-5.4-mini', 'Agent payload should expose the actual model slug');
  ok(payload.webSearchEnabled === true, 'Agent payload should expose the runtime web search state');
  ok(!Object.prototype.hasOwnProperty.call(payload, 'reasoning'), 'normal Agent chat payload should not force Responses reasoning for compatible relays');
  ok(String(payload.instructions || '').includes('当前文本模型 slug') && String(payload.instructions || '').includes('项目专属提示词'), 'Agent payload should send CookSleep-style instructions context');
  ok(!String(payload.instructions || '').includes('必须输出 5 个方案'), 'Agent payload should not force five image prompt options');
  ok(String(payload.instructions || '').includes('默认只输出 1 个可直接使用的推荐 Prompt'), 'Agent payload should allow concise single-prompt image replies');
  ok(String(payload.instructions || '').includes('先追问，最多 3 个问题'), 'Agent payload should ask clarifying questions before prompting when requirements are incomplete');
  ok(String(payload.input || '').includes('当前北京时间') && String(payload.input || '').includes('当前文本模型 slug'), 'Agent payload input should mention Beijing time and actual model slug');
  const workflowAgentPayload = hooks.buildWorkflowAgentRequestPayload('规划工作流', {
    project: { id: 'project-1', name: '测试项目', prompt: '项目提示词' },
    textProfile: strictTextProfile,
    mode: 'planner'
  });
  ok(workflowAgentPayload.stream === false, 'Workflow Agent Responses payload should default to non-streaming when the profile has no streaming capability');
  const fetchBeforeAgentPost = sandbox.fetch;
  let postedAgentBody = null;
  let postedAgentHeaders = null;
  sandbox.fetch = async (_url, options = {}) => {
    postedAgentBody = JSON.parse(options.body || '{}');
    postedAgentHeaders = options.headers || null;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ status: 'completed', output_text: 'ok' })
    };
  };
  await hooks.postAgentResponsesRequest({ model: strictTextProfile.model, input: 'test', stream: false }, strictTextProfile);
  sandbox.fetch = fetchBeforeAgentPost;
  ok(postedAgentBody?.stream === false, 'Agent Responses network boundary should disable unsupported streaming even if a caller passes true');
  ok(postedAgentHeaders?.['X-GPT-Image-Profile-Id'] === hooks.encodeProfileHeaderValue('good-text'), 'Agent Responses requests should use the same ASCII-compatible profile header codec');
  postedAgentBody = null;
  const streamingTextProfile = { ...strictTextProfile, streamResponses: true };
  sandbox.fetch = async (_url, options = {}) => {
    postedAgentBody = JSON.parse(options.body || '{}');
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ status: 'completed', output_text: 'ok' })
    };
  };
  await hooks.postAgentResponsesRequest({ model: streamingTextProfile.model, input: 'test', stream: false }, streamingTextProfile);
  ok(postedAgentBody?.stream === true, 'Agent Responses network boundary should enable streaming when the profile declares support');
  sandbox.fetch = fetchBeforeAgentPost;

  const profileStateBeforeUnicodeResponses = hooks.getTestState();
  const duplicateResponseProfiles = [
    { id: 'shared-responses', name: 'Responses Text A', provider: 'openai', apiMode: 'responses', model: 'gpt-5.4-mini' },
    { id: 'shared-responses', name: '中文文本模型', provider: 'openai', apiMode: 'responses', model: 'gpt-5.4-mini' }
  ];
  hooks.setTestState({
    profiles: duplicateResponseProfiles,
    activeProfileId: 'shared-responses',
    activeImageProfileId: 'shared-responses',
    agentConfig: { mode: 'hybrid', textProfileId: 'name:中文文本模型', imageProfileId: 'shared-responses', webSearchEnabled: false }
  });
  const unicodeTextProfile = hooks.agentTextProfile();
  ok(unicodeTextProfile?.name === '中文文本模型', 'duplicate Responses profile IDs should resolve by the unique Unicode name');
  let unicodeAgentHeaders = null;
  sandbox.fetch = async (_url, options = {}) => {
    unicodeAgentHeaders = options.headers || null;
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ status: 'completed', output_text: 'ok' })
    };
  };
  await hooks.postAgentResponsesRequest({ model: unicodeTextProfile.model, input: 'test', stream: false }, unicodeTextProfile);
  sandbox.fetch = fetchBeforeAgentPost;
  const unicodeAgentHeader = unicodeAgentHeaders?.['X-GPT-Image-Profile-Id'];
  ok(unicodeAgentHeader === hooks.encodeProfileHeaderValue('name:中文文本模型') && /^[\x20-\x7e]*$/.test(unicodeAgentHeader), 'Agent Responses Unicode profile names should use an ASCII-safe encoded header');
  let unicodeAgentRequestConstructed = false;
  try {
    new Request('https://example.test/api-proxy/responses', { method: 'POST', headers: unicodeAgentHeaders });
    unicodeAgentRequestConstructed = true;
  } catch {}
  ok(unicodeAgentRequestConstructed, 'Agent Responses Unicode profile headers must remain valid Request header values');
  hooks.setTestState({
    profiles: profileStateBeforeUnicodeResponses.profiles,
    activeProfileId: profileStateBeforeUnicodeResponses.activeProfileId,
    activeImageProfileId: profileStateBeforeUnicodeResponses.activeImageProfileId,
    agentConfig: profileStateBeforeUnicodeResponses.agentConfig
  });
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
const markdownFieldOptionReply = [
  '**方案 1（推荐）**',
  '**正向提示词（Prompt）**：保留 Marvel、原创角色和作品名原词的电影海报，主体清晰，强对比构图。',
  '**负面提示词（Negative Prompt）**：不要水印，不要错别字，不要裁切。'
].join('\n');
const markdownFieldOptions = hooks.extractAgentPromptOptions(markdownFieldOptionReply);
ok(markdownFieldOptions.length === 1 && markdownFieldOptions[0].negativePrompt.includes('不要水印') && markdownFieldOptions[0].prompt.includes('Marvel'), 'Agent option parser should accept bold bilingual positive and negative labels without changing user terms');
const preservedTermsPayload = hooks.buildAgentRequestPayload('生成 Marvel 原创角色海报', {
  project: { id: 'project-1', name: '测试项目', prompt: '' },
  history: [],
  textProfile: strictTextProfile
});
ok(String(preservedTermsPayload.instructions).includes('保留用户输入中的品牌、角色、作品名、原创等原词') && !String(preservedTermsPayload.instructions).includes('涉及版权角色或受保护风格时'), 'Agent instructions should preserve user terms instead of requiring an original-content substitution');
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
  const validPastedPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9s=', 'base64');
  await hooks.handlePaste({
    clipboardData: { files: [new Blob([validPastedPng], { type: 'image/png' })] },
    preventDefault: () => {}
  });
  const pastedAgentState = hooks.getTestState();
  ok((pastedAgentState.agent.attachments || []).length === 1 && (pastedAgentState.references || []).length === 0, 'Pasted images in Agent mode should upload to Agent attachments, not gallery references');
  hooks.setTestState({ mode: 'agent', agent: { attachments: [] }, references: [] });
  const itemPasteFile = new Blob([validPastedPng], { type: 'image/png' });
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
  ok(plainAgentPayload.stream === false, 'plain Agent payload should default to non-streaming for an unverified profile');
  const multimodalAgentPayload = hooks.buildAgentRequestPayload('看这张图', {
    project: { name: '测试项目', prompt: '' },
    textProfile: { id: 'text', model: 'gpt-5.5', provider: 'openai', apiMode: 'responses' },
    history: [],
    attachmentSummary: '1. brief.png (image/png, 2KB, 1200x800)',
    attachmentText: '文本附件摘要',
    attachmentImageParts: [{ type: 'input_image', image_url: 'data:image/png;base64,abc' }]
  });
  ok(Array.isArray(multimodalAgentPayload.input) && multimodalAgentPayload.input[0].content.some((part) => part.type === 'input_image'), 'Agent payload with image attachments should use Responses multimodal content');
  ok(multimodalAgentPayload.stream === false, 'multimodal Agent payload should default to non-streaming for an unverified profile');

  const streamFrames = Array.from({ length: 30 }, (_, index) => Buffer.from(`frame-${index}`).toString('base64'));
  const imageStreamText = Array.from({ length: 30 }, (_, index) => {
    const separator = index % 2 ? '\n\n' : '\r\n\r\n';
    return `data: ${JSON.stringify({
      type: 'image_generation.partial_image',
      output_index: 0,
      partial_image_index: index,
      b64_json: streamFrames[index]
    })}${separator}`;
  }).join('') + 'data: [DONE]\r\n\r\n';
  const encodedImageStream = new TextEncoder().encode(imageStreamText);
  const imageStreamChunks = [];
  for (let offset = 0; offset < encodedImageStream.length; offset += 17) imageStreamChunks.push(encodedImageStream.slice(offset, offset + 17));
  const imageStreamResponse = {
    body: {
      getReader() {
        let index = 0;
        return {
          read: async () => index < imageStreamChunks.length
            ? { value: imageStreamChunks[index++], done: false }
            : { value: undefined, done: true }
        };
      }
    }
  };
  const partialStreamCandidates = [];
  const imageStreamPayload = await hooks.consumeImageStream(
    imageStreamResponse,
    (candidate) => partialStreamCandidates.push(candidate)
  );
  const imageStreamJson = JSON.stringify(imageStreamPayload);
  ok(!streamFrames.some((frame) => imageStreamJson.includes(frame)), 'consumeImageStream should not retain base64 image payloads');
  ok(imageStreamPayload.streamEvents.length === 24 && imageStreamPayload.streamEventCount === 30, 'consumeImageStream should retain only bounded event metadata plus the total event count');
  ok(imageStreamPayload.data.length === 1 && /^blob:/.test(imageStreamPayload.data[0].url), 'partial_images for one output should collapse to one final artwork');
  ok(partialStreamCandidates.length === 30 && partialStreamCandidates.at(-1).partialIndex === 29, 'stream preview callback should receive rich metadata for every preview while final data keeps only the newest frame');
  ok(await createdObjectUrlBlobs.get(imageStreamPayload.data[0].url)?.text() === 'frame-29', 'consumeImageStream should retain the latest frame for each output index');
  ok(partialStreamCandidates.every((candidate) => candidate.outputIndex === 0 && candidate.eventType === 'image_generation.partial_image'), 'stream preview callback should identify output slots and event type');
  const streamRevokedBeforePersist = revokedObjectUrls.length;
  const fetchBeforeStreamPersist = sandbox.fetch;
  sandbox.fetch = async () => imageResponse(Buffer.from(commonPrefix, 'base64'));
  const persistedStreamImages = await hooks.persistResponseImages(imageStreamPayload);
  sandbox.fetch = fetchBeforeStreamPersist;
  ok(persistedStreamImages.length === 1, 'streamed Blob URL should remain persistable as an image result');
  ok(revokedObjectUrls.length === streamRevokedBeforePersist + 1, 'persisting a streamed image should revoke its temporary Blob URL');

  let completedReaderCancelled = false;
  let completedReaderReadCount = 0;
  const completedImageB64 = Buffer.from('completed-edit-image').toString('base64');
  const completedImageEvent = new TextEncoder().encode(`data: ${JSON.stringify({
    type: 'image_edit.completed',
    output_index: 0,
    b64_json: completedImageB64
  })}\n\n`);
  const completedStreamPayload = await hooks.consumeImageStream({
    body: {
      getReader: () => ({
        read: async () => {
          completedReaderReadCount += 1;
          if (completedReaderReadCount === 1) return { value: completedImageEvent, done: false };
          await new Promise((resolve) => setTimeout(resolve, 25));
          throw new Error('reader should not be called after image_edit.completed');
        },
        cancel: async () => { completedReaderCancelled = true; }
      })
    }
  });
  ok(completedReaderCancelled, 'image_edit.completed should cancel a connection that remains open');
  ok(completedReaderReadCount === 1, 'image_edit.completed should return without waiting for another stream read');
  ok(completedStreamPayload.completionReason === 'completed-event', 'image_edit.completed should record completed-event');
  ok(completedStreamPayload.data.length === 1, 'image_edit.completed should expose its final image');

  let doneReaderCancelled = false;
  let doneReaderReadCount = 0;
  const doneStreamBytes = new TextEncoder().encode([
    `data: ${JSON.stringify({
      type: 'image_edit.partial_image',
      output_index: 0,
      b64_json: Buffer.from('last-partial-image').toString('base64')
    })}`,
    'data: [DONE]'
  ].join('\n\n') + '\n\n');
  const doneStreamPayload = await hooks.consumeImageStream({
    body: {
      getReader: () => ({
        read: async () => {
          doneReaderReadCount += 1;
          if (doneReaderReadCount === 1) return { value: doneStreamBytes, done: false };
          await new Promise((resolve) => setTimeout(resolve, 25));
          throw new Error('reader should not be called after [DONE]');
        },
        cancel: async () => { doneReaderCancelled = true; }
      })
    }
  });
  ok(doneReaderCancelled && doneReaderReadCount === 1, '[DONE] should finish an image stream without waiting for connection close');
  ok(doneStreamPayload.completionReason === 'last-partial-fallback', '[DONE] with only partial image should record fallback completion');

  const mislabeledSseResponse = new Response(completedImageEvent, {
    headers: { 'Content-Type': 'application/json' }
  });
  const mislabeledSsePayload = await hooks.consumeImageHttpResponse(mislabeledSseResponse, { streamRequested: true });
  ok(mislabeledSsePayload.responseMode === 'sse-sniffed', 'stream request should sniff SSE when Content-Type is incorrect');
  ok(mislabeledSsePayload.data.length === 1, 'mislabeled SSE should still return the completed image');
  const httpPartialCandidates = [];
  const httpStreamText = [
    `data: ${JSON.stringify({
      type: 'image_generation.partial_image',
      output_index: 0,
      partial_image_index: 0,
      b64_json: Buffer.from('http-preview').toString('base64')
    })}`,
    `data: ${JSON.stringify({
      type: 'image_generation.completed',
      output_index: 0,
      b64_json: Buffer.from('http-final').toString('base64')
    })}`
  ].join('\n\n') + '\n\n';
  const httpStreamPayload = await hooks.consumeImageHttpResponse(new Response(httpStreamText, {
    headers: { 'Content-Type': 'application/json' }
  }), {
    streamRequested: true,
    onPartialImage: (candidate) => httpPartialCandidates.push(candidate)
  });
  ok(httpPartialCandidates.length === 1 && httpPartialCandidates[0].partialIndex === 0, 'HTTP image stream should forward partial previews through the response parser');
  ok(httpStreamPayload.data.length === 1, 'HTTP image stream should still return the final image after preview callbacks');

  const regularJsonB64 = Buffer.from('regular-json-image').toString('base64');
  const regularJsonPayload = await hooks.consumeImageHttpResponse(new Response(JSON.stringify({
    data: [{ b64_json: regularJsonB64 }]
  }), {
    headers: { 'Content-Type': 'application/json', 'X-GPT-Image-Trace-Id': 'trace-json-1' }
  }));
  ok(regularJsonPayload.responseMode === 'json', 'normal image JSON should retain json response mode');
  ok(regularJsonPayload.data[0].b64_json === regularJsonB64, 'normal image JSON should retain b64_json');
  ok(regularJsonPayload.traceId === 'trace-json-1', 'successful image responses should retain the bounded proxy trace id');

  let tracedStreamError;
  await hooks.consumeImageHttpResponse(new Response(`data: ${JSON.stringify({ error: { message: 'upstream stream rejected' } })}\n\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'X-GPT-Image-Trace-Id': 'trace-error-1' }
  })).then(
    () => ok(false, 'untyped upstream SSE errors should reject'),
    (error) => { tracedStreamError = error; }
  );
  ok(tracedStreamError?.code === 'IMAGE_STREAM_UPSTREAM_FAILED', 'untyped upstream SSE errors should retain the stream failure code');
  ok(tracedStreamError?.traceId === 'trace-error-1', 'failed image responses should retain the bounded proxy trace id');
  ok(tracedStreamError?.lastStreamEventType === 'error' && tracedStreamError?.streamEvents?.[0]?.type === 'error', 'failed untyped SSE errors should expose the stable fallback event type');
  ok(!JSON.stringify(tracedStreamError?.streamEvents || []).includes('upstream stream rejected'), 'failed stream metadata must not retain the error message payload');

  let proxyProbeCalled = false;
  const proxyMarkedJsonPayload = await hooks.consumeImageHttpResponse({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase();
        if (key === 'content-type') return 'application/json';
        if (key === 'x-gpt-image-proxy-probed') return '1';
        return null;
      }
    },
    body: {
      tee: () => {
        proxyProbeCalled = true;
        throw new Error('proxy-marked responses must not be probed twice');
      }
    },
    text: async () => JSON.stringify({ data: [{ b64_json: regularJsonB64 }] })
  });
  ok(!proxyProbeCalled && proxyMarkedJsonPayload.responseMode === 'json', 'proxy probe marker should suppress the frontend first-chunk probe');

  const twoOutputStreamText = [
    { output_index: 0, partial_image_index: 0, b64_json: Buffer.from('output-0-partial').toString('base64') },
    { output_index: 1, partial_image_index: 0, b64_json: Buffer.from('output-1-partial').toString('base64') },
    { output_index: 0, partial_image_index: 1, b64_json: Buffer.from('output-0-final').toString('base64') },
    { output_index: 1, partial_image_index: 1, b64_json: Buffer.from('output-1-final').toString('base64') }
  ].map((event) => `data: ${JSON.stringify({ type: 'image_generation.partial_image', ...event })}`).concat('data: [DONE]').join('\n\n');
  const twoOutputPayload = await hooks.consumeImageStream(new Response(new TextEncoder().encode(twoOutputStreamText)));
  ok(twoOutputPayload.data.length === 2, 'image stream should retain one final artwork per output index');
  const twoOutputTexts = await Promise.all(twoOutputPayload.data.map((item) => createdObjectUrlBlobs.get(item.url)?.text()));
  ok(twoOutputTexts.join('|') === 'output-0-final|output-1-final', 'each output index should retain only its latest final frame');
  sandbox.fetch = async () => imageResponse(Buffer.from(commonPrefix, 'base64'));
  await hooks.persistResponseImages(twoOutputPayload);
  sandbox.fetch = fetchBeforeStreamPersist;

  for (const terminalType of ['failed', 'incomplete', 'cancelled']) {
    const terminalStreamText = [
      `data: ${JSON.stringify({
        type: 'image_generation.partial_image',
        output_index: 0,
        b64_json: Buffer.from(`partial-${terminalType}`).toString('base64')
      })}`,
      `data: ${JSON.stringify({
        type: `response.${terminalType}`,
        response: {
          status: terminalType,
          incomplete_details: terminalType === 'incomplete' ? { reason: 'max_output_tokens' } : undefined
        },
        error: terminalType === 'failed' ? { message: 'upstream image failed' } : undefined
      })}`
    ].join('\n\n');
    await hooks.consumeImageStream(new Response(new TextEncoder().encode(terminalStreamText))).then(
      () => ok(false, `image ${terminalType} stream should reject after a partial image`),
      (err) => {
        ok(
          new RegExp(terminalType === 'failed' ? 'upstream image failed|failed' : terminalType === 'incomplete' ? 'max_output_tokens|incomplete' : 'cancelled', 'i').test(String(err?.message || err)),
          `image ${terminalType} stream should expose its terminal failure`
        );
        ok(err?.partialCandidates?.length === 1, `image ${terminalType} stream should retain its partial candidate for recovery`);
      }
    );
  }

  let abnormalReaderCancelled = false;
  const abnormalStreamText = `data: ${JSON.stringify({
    type: 'image_generation.partial_image',
    output_index: 0,
    b64_json: Buffer.from('callback-error-partial').toString('base64')
  })}\n\n`;
  const abnormalBytes = new TextEncoder().encode(abnormalStreamText);
  let abnormalRead = false;
  await hooks.consumeImageStream({
    body: {
      getReader: () => ({
        read: async () => {
          if (abnormalRead) return { done: true };
          abnormalRead = true;
          return { value: abnormalBytes, done: false };
        },
        cancel: async () => { abnormalReaderCancelled = true; }
      })
    }
  }, () => {
    throw new Error('preview callback failed');
  }).then(
    () => ok(false, 'image stream callback failure should reject'),
    (err) => ok(/preview callback failed/.test(String(err?.message || err)), 'image stream callback failure should preserve the original error')
  );
  ok(abnormalReaderCancelled, 'image stream abnormal failure should cancel the upstream reader');

  async function expectOversizedImageStreamRejected(chunks, label) {
    let readIndex = 0;
    let cancelled = false;
    let rejectedError = null;
    await hooks.consumeImageStream({
      body: {
        getReader: () => ({
          read: async () => readIndex < chunks.length
            ? { value: chunks[readIndex++], done: false }
            : { value: undefined, done: true },
          cancel: async () => { cancelled = true; }
        })
      }
    }).then(
      () => ok(false, `${label} should reject before retaining an oversized SSE payload`),
      (err) => {
        rejectedError = err;
        ok(/安全上限|过大|too large/i.test(String(err?.message || err)), `${label} should report its stream safety limit`);
      }
    );
    ok(cancelled, `${label} should cancel the upstream reader`);
    ok(rejectedError?.partialCandidates?.length === 1, `${label} should retain bounded partial candidate metadata without leaking object URLs`);
  }

  const oversizedImagePartial = new TextEncoder().encode(`data: ${JSON.stringify({
    type: 'image_generation.partial_image',
    output_index: 0,
    b64_json: Buffer.from('oversized-image-partial').toString('base64')
  })}\n\n`);
  const fourMbImageEventHead = new TextEncoder().encode(`data: ${'x'.repeat(4 * 1024 * 1024 - 6)}`);
  const fourMbImageEventTail = new Uint8Array(4 * 1024 * 1024).fill(120);
  await expectOversizedImageStreamRejected(
    [oversizedImagePartial, fourMbImageEventHead, ...Array(24).fill(fourMbImageEventTail), new Uint8Array([120])],
    'image stream with an unterminated event over 96MB'
  );
  await expectOversizedImageStreamRejected(
    [oversizedImagePartial, new Uint8Array(96 * 1024 * 1024 + 1).fill(120)],
    'image stream with a single reader chunk over 96MB'
  );

  const missingTransparentResult = await hooks.postProcessTransparentImages([
    { blobId: 'missing-transparent-blob', width: 1024, height: 1024, type: 'image/png' }
  ]);
  ok(missingTransparentResult.processedCount === 0 && missingTransparentResult.failedCount === 1, 'transparent postprocess should report a missing source blob as a failed image');
  ok(missingTransparentResult.images[0].blobId === 'missing-transparent-blob' && missingTransparentResult.images[0].transparent === false, 'transparent postprocess failure should preserve the opaque original image');
  ok(!missingTransparentResult.images[0].transparentSource, 'transparent postprocess failure should not claim a transparent source');
  const originalLocalGetItem = sandbox.localStorage.getItem;
  const originalLocalSetItem = sandbox.localStorage.setItem;
  const originalSessionGetItem = sandbox.sessionStorage.getItem;
  sandbox.localStorage.getItem = (key) => key === 'gpt-image2.home.v3'
    ? JSON.stringify({ tasks: [{ id: 'session-state-preserved', status: 'success', images: [] }], settings: { quality: 'high' } })
    : null;
  sandbox.sessionStorage.getItem = (key) => key === 'gpt-image2.home.v3.composer-session' ? '{broken-session' : null;
  const isolatedStore = hooks.readStore();
  ok(isolatedStore.tasks.some((task) => task.id === 'session-state-preserved'), 'corrupt sessionStorage must not discard the valid localStorage store');
  sandbox.localStorage.getItem = originalLocalGetItem;
  sandbox.localStorage.setItem = originalLocalSetItem;
  sandbox.sessionStorage.getItem = originalSessionGetItem;

  const corruptPersistedBlobId = 'corrupt-persisted-store-blob';
  fakeIndexedDbStore.set(corruptPersistedBlobId, new Blob(['corrupt-store'], { type: 'image/png' }));
  sandbox.localStorage.getItem = (key) => key === 'gpt-image2.home.v3' ? '{broken-store' : null;
  hooks.setTestTasks([]);
  const corruptPersistedCleanup = await hooks.deleteUnreferencedBlobIds([corruptPersistedBlobId]);
  ok(corruptPersistedCleanup?.skipped === true && fakeIndexedDbStore.has(corruptPersistedBlobId), 'Blob cleanup must skip deletion when the persisted store cannot be parsed');
  sandbox.localStorage.getItem = originalLocalGetItem;

  const tasksBeforeStorageMerge = hooks.getTestState().tasks;
  const storageMergeWrites = new Map();
  sandbox.localStorage.getItem = (key) => storageMergeWrites.get(key) || null;
  sandbox.localStorage.setItem = (key, value) => storageMergeWrites.set(key, String(value));
  hooks.setTestTasks([{
    id: 'legacy-reference-task',
    createdAt: 200,
    status: 'success',
    images: [],
    referenceSnapshots: [],
    references: [{ id: 'legacy-ref', blobId: 'legacy-ref-blob', originalBlobId: 'legacy-ref-blob', type: 'image/png' }]
  }]);
  storageMergeWrites.set('gpt-image2.home.v3', JSON.stringify({ tasks: [] }));
  hooks.writeStore();
  const legacyTaskPayload = JSON.parse(storageMergeWrites.get('gpt-image2.home.v3') || '{}');
  ok(legacyTaskPayload.tasks?.find((task) => task.id === 'legacy-reference-task')?.referenceSnapshots?.length === 1, 'legacy task references must survive the next localStorage write');

  storageMergeWrites.set('gpt-image2.home.v3', JSON.stringify({ tasks: [{ id: 'cross-tab-task', createdAt: 300, status: 'success', images: [] }] }));
  hooks.setTestTasks([{ id: 'current-tab-task', createdAt: 400, status: 'success', images: [] }]);
  hooks.writeStore();
  const mergedTabPayload = JSON.parse(storageMergeWrites.get('gpt-image2.home.v3') || '{}');
  ok(mergedTabPayload.tasks?.some((task) => task.id === 'cross-tab-task') && mergedTabPayload.tasks?.some((task) => task.id === 'current-tab-task'), 'a stale tab write must preserve a task created by another tab');
  hooks.setTestTasks([{ id: 'current-tab-task', createdAt: 400, status: 'success', images: [] }]);
  hooks.writeStore({ deletedTaskIds: ['cross-tab-task'] });
  storageMergeWrites.set('gpt-image2.home.v3', JSON.stringify({ tasks: [{ id: 'cross-tab-task', createdAt: 300, status: 'success', images: [] }, { id: 'current-tab-task', createdAt: 400, status: 'success', images: [] }] }));
  hooks.writeStore();
  const tombstonePayload = JSON.parse(storageMergeWrites.get('gpt-image2.home.v3') || '{}');
  ok(!tombstonePayload.tasks?.some((task) => task.id === 'cross-tab-task'), 'a task deleted in one tab must not be resurrected by a stale later write');
  hooks.setTestTasks(tasksBeforeStorageMerge);
  sandbox.localStorage.getItem = originalLocalGetItem;
  sandbox.localStorage.setItem = originalLocalSetItem;

  const reservationStorage = new Map();
  sandbox.localStorage.getItem = (key) => reservationStorage.get(key) || null;
  sandbox.localStorage.setItem = (key, value) => reservationStorage.set(key, String(value));
  sandbox.localStorage.removeItem = (key) => reservationStorage.delete(key);
  sandbox.localStorage.key = (index) => [...reservationStorage.keys()][index] || null;
  Object.defineProperty(sandbox.localStorage, 'length', {
    configurable: true,
    get: () => reservationStorage.size
  });
  await hooks.putBlob(new Blob(['reserved'], { type: 'image/png' }), 'cleanup-race-reserved');
  const defaultCleanup = await hooks.cleanupOrphanBlobs();
  ok(defaultCleanup?.skipped === true && defaultCleanup.reason === 'explicit-confirmation-required', 'orphan cleanup must be opt-in and skip by default');
  ok(fakeIndexedDbStore.has('cleanup-race-reserved'), 'orphan cleanup must preserve a newly written blob until its state reference can be committed');
  fakeIndexedDbStore.delete('cleanup-race-reserved');
  const reservationPrefix = 'gpt-image2.home.v3.blob-reservations.';
  await hooks.putBlob(new Blob(['tab-a'], { type: 'image/png' }), 'reservation-tab-a');
  fakeIndexedDbStore.set('reservation-tab-b', new Blob(['tab-b'], { type: 'image/png' }));
  reservationStorage.set(`${reservationPrefix}reservation-tab-b`, String(Date.now() + 60_000));
  await hooks.putBlob(new Blob(['tab-c'], { type: 'image/png' }), 'reservation-tab-c');
  ok(
    ['reservation-tab-a', 'reservation-tab-b', 'reservation-tab-c']
      .every((id) => reservationStorage.has(`${reservationPrefix}${id}`)),
    'per-blob reservations from multiple tabs must coexist without an aggregate localStorage overwrite'
  );
  await hooks.cleanupOrphanBlobs();
  ok(
    ['reservation-tab-a', 'reservation-tab-b', 'reservation-tab-c'].every((id) => fakeIndexedDbStore.has(id)),
    'orphan cleanup must preserve every independently reserved cross-tab blob'
  );
  for (const id of ['reservation-tab-a', 'reservation-tab-b', 'reservation-tab-c']) {
    fakeIndexedDbStore.delete(id);
    reservationStorage.delete(`${reservationPrefix}${id}`);
  }

  const archivedAgentBlobId = 'archived-agent-attachment-blob';
  fakeIndexedDbStore.set(archivedAgentBlobId, new Blob(['archived-agent'], { type: 'image/png' }));
  fakeIndexedDbStores.get('agentThreads').set('archived-agent-thread', {
    threadId: 'archived-agent-thread',
    messages: [{ id: 'archived-agent-message', attachments: [{ blobId: archivedAgentBlobId }] }]
  });
  hooks.setTestTasks([]);
  await hooks.deleteUnreferencedBlobIds([archivedAgentBlobId]);
  ok(fakeIndexedDbStore.has(archivedAgentBlobId), 'Agent attachment referenced only by IndexedDB archive must survive Blob cleanup');
  fakeIndexedDbStores.get('agentThreads').delete('archived-agent-thread');
  await hooks.deleteUnreferencedBlobIds([archivedAgentBlobId]);
  ok(!fakeIndexedDbStore.has(archivedAgentBlobId), 'Agent archive Blob should be reclaimable after its archived message is removed');

  const workflowRunBlobId = 'running-workflow-reference-blob';
  fakeIndexedDbStore.set(workflowRunBlobId, new Blob(['workflow-run'], { type: 'image/png' }));
  const agentBeforeWorkflowRunBlob = hooks.getTestState().agent;
  hooks.setTestState({ agent: { workflowRuns: [{ id: 'running-workflow-run', status: 'running', references: [{ blobId: workflowRunBlobId }] }] } });
  await hooks.deleteUnreferencedBlobIds([workflowRunBlobId]);
  ok(fakeIndexedDbStore.has(workflowRunBlobId), 'running workflow reference must survive Blob cleanup after workflowInvoke is cleared');
  hooks.setTestState({ agent: { workflowRuns: [{ id: 'running-workflow-run', status: 'success', references: [{ blobId: workflowRunBlobId }] }] } });
  await hooks.deleteUnreferencedBlobIds([workflowRunBlobId]);
  ok(!fakeIndexedDbStore.has(workflowRunBlobId), 'completed workflow run references must not keep input Blobs forever');
  hooks.setTestState({ agent: agentBeforeWorkflowRunBlob });

  const tasksBeforeBlobGuard = hooks.getTestState().tasks;
  if (typeof hooks.setGalleryScrollActivity === 'function') {
    const deferredPartialTask = { id: 'deferred-partial-write', images: [], streamPartialImages: [] };
    hooks.setTestTasks([deferredPartialTask]);
    hooks.setGalleryScrollActivity(true);
    await hooks.persistTaskStreamPartialCandidate(deferredPartialTask, {
      outputIndex: 0,
      partialIndex: 1,
      eventType: 'image_generation.partial_image',
      b64_json: Buffer.from('deferred-partial').toString('base64')
    });
    const deferredBlobId = deferredPartialTask.streamPartialImages[0]?.blobId;
    ok(deferredBlobId && fakeIndexedDbStore.has(deferredBlobId), 'partial persistence during scrolling must retain the new Blob until the deferred store write');
    hooks.setGalleryScrollActivity(false);
    hooks.writeStore();
    const deferredStorePayload = JSON.parse(reservationStorage.get('gpt-image2.home.v3') || '{}');
    ok(deferredStorePayload.tasks?.some((task) => task.id === 'deferred-partial-write' && task.streamPartialImages?.some((item) => item.blobId === deferredBlobId)), 'deferred partial state must be included in the first idle store write');
    ok(!reservationStorage.has(`${reservationPrefix}${deferredBlobId}`), 'deferred partial Blob reservation must release after the idle store write commits');
  }
  hooks.setTestTasks(tasksBeforeBlobGuard);
  fakeIndexedDbStore.set('shared-task-blob', new Blob(['shared-task'], { type: 'image/png' }));
  hooks.setTestTasks([
    { id: 'shared-task-a', images: [{ blobId: 'shared-task-blob' }] },
    { id: 'shared-task-b', images: [{ blobId: 'shared-task-blob' }] }
  ]);
  await hooks.deleteUnreferencedBlobIds(['shared-task-blob']);
  ok(fakeIndexedDbStore.has('shared-task-blob'), 'shared Blob must survive while two tasks reference it');
  hooks.setTestTasks([{ id: 'shared-task-b', images: [{ blobId: 'shared-task-blob' }] }]);
  await hooks.deleteUnreferencedBlobIds(['shared-task-blob']);
  ok(fakeIndexedDbStore.has('shared-task-blob'), 'shared Blob must survive after deleting only one referencing task');
  hooks.setTestTasks([]);
  await hooks.deleteUnreferencedBlobIds(['shared-task-blob']);
  ok(!fakeIndexedDbStore.has('shared-task-blob'), 'unreferenced Blob should be deleted after the last task reference is gone');
  fakeIndexedDbStore.set('shared-task-blob', new Blob(['shared-task'], { type: 'image/png' }));
  hooks.setTestTasks([
    { id: 'shared-delete-a', images: [{ blobId: 'shared-task-blob' }] },
    { id: 'shared-delete-b', images: [{ blobId: 'shared-task-blob' }] }
  ]);
  await hooks.performDeleteTask('shared-delete-a');
  ok(fakeIndexedDbStore.has('shared-task-blob'), 'deleting one task must not delete a Blob still referenced by another task');
  await hooks.performDeleteTask('shared-delete-b');
  ok(!fakeIndexedDbStore.has('shared-task-blob'), 'deleting the final referencing task should release the shared Blob');
  hooks.setTestTasks(tasksBeforeBlobGuard);

  const savedBlobLocks = sandbox.navigator.locks;
  const noLockBlob = 'no-web-lock-blob';
  fakeIndexedDbStore.set(noLockBlob, new Blob(['no-lock'], { type: 'image/png' }));
  sandbox.navigator.locks = null;
  const noLockCleanup = await hooks.deleteUnreferencedBlobIds([noLockBlob]);
  ok(noLockCleanup?.skipped === true && fakeIndexedDbStore.has(noLockBlob), 'Blob cleanup must fail closed when Web Locks are unavailable');
  sandbox.navigator.locks = savedBlobLocks;
  await hooks.deleteUnreferencedBlobIds([noLockBlob]);
  ok(!fakeIndexedDbStore.has(noLockBlob), 'a skipped no-lock Blob cleanup must be reclaimable after the lock is restored');

  const reservationRaceBlob = 'reservation-race-blob';
  const reservationRaceKey = `${reservationPrefix}${reservationRaceBlob}`;
  fakeIndexedDbStore.set(reservationRaceBlob, new Blob(['reservation-race'], { type: 'image/png' }));
  reservationStorage.set(reservationRaceKey, JSON.stringify({ version: 1, owner: 'old-tab', expiresAt: Date.now() + 60_000 }));
  const reservationRaceCleanup = hooks.deleteUnreferencedBlobIds([reservationRaceBlob]);
  setTimeout(() => {
    reservationStorage.set(reservationRaceKey, JSON.stringify({ version: 1, owner: 'new-tab', expiresAt: Date.now() + 60_000 }));
  }, 0);
  const reservationRaceResult = await reservationRaceCleanup;
  ok(reservationRaceResult?.retry?.includes(reservationRaceBlob), 'a same-ID reservation created by another tab during cleanup must be retried');
  ok(fakeIndexedDbStore.has(reservationRaceBlob), 'a same-ID reservation created during cleanup must protect the Blob');
  reservationStorage.delete(reservationRaceKey);
  const oldReservationCleanup = await hooks.deleteUnreferencedBlobIds([reservationRaceBlob]);
  ok(oldReservationCleanup?.deleted === 1 && !fakeIndexedDbStore.has(reservationRaceBlob), 'an unchanged pre-existing reservation must not leak an unreferenced Blob');

  const taskStore = fakeIndexedDbStores.get('tasks');
  const revisionPartialBlob = 'revision-partial-blob';
  taskStore.set('revision-partial-task', {
    id: 'revision-partial-task',
    status: 'running',
    createdAt: 5000,
    startedAt: 5000,
    persistenceRevision: 10,
    images: [],
    streamPartialImages: []
  });
  hooks.setTestTasks([{
    id: 'revision-partial-task',
    status: 'running',
    createdAt: 5000,
    startedAt: 5000,
    persistenceRevision: 11,
    images: [],
    streamPartialImages: [{ blobId: revisionPartialBlob, outputIndex: 0, kind: 'latest' }]
  }]);
  hooks.writeStore();
  await hooks.flushTaskPersistence();
  const revisionRecord = taskStore.get('revision-partial-task');
  ok(revisionRecord?.persistenceRevision === 11 && revisionRecord.streamPartialImages?.some((item) => item.blobId === revisionPartialBlob), 'newer task persistence revision must win over an older IDB partial snapshot');

  const idbOnlyTaskBlob = 'idb-only-task-blob';
  fakeIndexedDbStore.set(idbOnlyTaskBlob, new Blob(['idb-task-reference'], { type: 'image/png' }));
  taskStore.set('idb-only-reference-task', {
    id: 'idb-only-reference-task',
    status: 'success',
    images: [{ blobId: idbOnlyTaskBlob }]
  });
  hooks.setTestTasks([]);
  reservationStorage.set('gpt-image2.home.v3', JSON.stringify({ tasks: [] }));
  const idbTaskReferenceCleanup = await hooks.deleteUnreferencedBlobIds([idbOnlyTaskBlob]);
  ok(idbTaskReferenceCleanup?.deleted === 0 && fakeIndexedDbStore.has(idbOnlyTaskBlob), 'Blob cleanup must protect references held only by the IndexedDB tasks store');
  taskStore.delete('idb-only-reference-task');
  await hooks.deleteUnreferencedBlobIds([idbOnlyTaskBlob]);
  ok(!fakeIndexedDbStore.has(idbOnlyTaskBlob), 'an IndexedDB task Blob becomes reclaimable after its task record is removed');

  const deleteRaceTaskId = 'delete-race-task';
  const deleteRaceBlob = 'delete-race-blob';
  fakeIndexedDbStore.set(deleteRaceBlob, new Blob(['delete-race'], { type: 'image/png' }));
  taskStore.set(deleteRaceTaskId, {
    id: deleteRaceTaskId,
    status: 'success',
    persistenceRevision: 20,
    images: [{ blobId: deleteRaceBlob }]
  });
  hooks.setTestTasks([{ id: deleteRaceTaskId, status: 'success', persistenceRevision: 21, images: [{ blobId: deleteRaceBlob }] }]);
  hooks.writeStore();
  hooks.setTestTasks([]);
  hooks.writeStore({ deletedTaskIds: [deleteRaceTaskId], forceTaskPersistence: true });
  hooks.writeStore();
  await hooks.flushTaskPersistence();
  ok(!taskStore.has(deleteRaceTaskId), 'a later ordinary write must not skip the task deletion tombstone in the IDB persistence queue');

  const crossTabDeleteTaskId = 'cross-tab-idb-delete';
  const crossTabDeleteBlob = 'cross-tab-idb-delete-blob';
  fakeIndexedDbStore.set(crossTabDeleteBlob, new Blob(['cross-tab-delete'], { type: 'image/png' }));
  taskStore.set(crossTabDeleteTaskId, {
    id: crossTabDeleteTaskId,
    status: 'success',
    persistenceRevision: 30,
    images: [{ blobId: crossTabDeleteBlob }]
  });
  hooks.setTestTasks([{ id: crossTabDeleteTaskId, status: 'success', persistenceRevision: 31, images: [{ blobId: crossTabDeleteBlob }] }]);
  hooks.writeStore({ deletedTaskIds: [crossTabDeleteTaskId], forceTaskPersistence: true });
  await hooks.flushTaskPersistence();
  hooks.setTestTasks([]);
  hooks.writeStore();
  await hooks.flushTaskPersistence();
  ok(!taskStore.has(crossTabDeleteTaskId), 'a later cross-tab ordinary write must propagate existing deletion tombstones to the IndexedDB task store');
  ok([...taskStore.values()].some((record) => record?.kind === 'task-delete' && record?.taskId === crossTabDeleteTaskId), 'task deletion must persist an IndexedDB tombstone for stale tabs');
  await hooks.deleteUnreferencedBlobIds([crossTabDeleteBlob]);
  ok(!fakeIndexedDbStore.has(crossTabDeleteBlob), 'a Blob referenced only by a cross-tab-deleted IDB task must become reclaimable');

  hooks.setTestTasks([{ id: crossTabDeleteTaskId, status: 'success', persistenceRevision: 99, images: [] }]);
  hooks.writeStore({ forceTaskPersistence: true });
  await hooks.flushTaskPersistence();
  ok(!taskStore.has(crossTabDeleteTaskId), 'an old queued task snapshot must not revive an IndexedDB-tombstoned task');

  const storageFailureDeleteId = 'storage-failure-delete';
  taskStore.set(storageFailureDeleteId, { id: storageFailureDeleteId, status: 'success', images: [] });
  hooks.setTestTasks([{ id: storageFailureDeleteId, status: 'success', images: [] }]);
  const originalStorageSetItemForDelete = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = () => { throw new Error('quota exceeded'); };
  hooks.writeStore({ deletedTaskIds: [storageFailureDeleteId], forceTaskPersistence: true });
  await hooks.flushTaskPersistence();
  sandbox.localStorage.setItem = originalStorageSetItemForDelete;
  ok(!taskStore.has(storageFailureDeleteId)
    && [...taskStore.values()].some((record) => record?.kind === 'task-delete' && record?.taskId === storageFailureDeleteId), 'deletion must remain durable when localStorage cannot be written');
  hooks.setTestTasks([{ id: storageFailureDeleteId, status: 'success', images: [] }]);
  hooks.setTestState({ taskStore: null, taskRecovery: { status: 'idle', retrying: false, error: '', detail: '' } });
  await hooks.hydrateTasksFromDb();
  ok(!hooks.getTestState().tasks.some((task) => task.id === storageFailureDeleteId), 'task hydration must apply IndexedDB deletion tombstones after localStorage failure');

  const bfcacheTask = {
    id: 'bfcache-stream-task',
    streamPreviewSlots: {
      0: { url: 'blob:revoked-stream-preview', temporary: true },
      1: { url: 'https://example.com/stream-preview.png', temporary: false }
    },
    streamPartialImages: [{ blobId: 'persisted-stream-preview', outputIndex: 0, kind: 'latest' }]
  };
  ok(hooks.resetTaskStreamPreviewSlotsForHydration(bfcacheTask) === true
    && !bfcacheTask.streamPreviewSlots['0']
    && bfcacheTask.streamPreviewSlots['1']?.url === 'https://example.com/stream-preview.png'
    && bfcacheTask.streamPartialImages[0].blobId === 'persisted-stream-preview', 'bfcache stream hydration should drop revoked live slots while retaining persisted partials and remote slots');

  const partialFailureTaskId = 'partial-write-failure';
  const partialFailureBaselineRevision = 40;
  taskStore.set(partialFailureTaskId, {
    id: partialFailureTaskId,
    status: 'running',
    createdAt: 100,
    persistenceRevision: partialFailureBaselineRevision,
    images: [],
    streamPartialImages: []
  });
  const partialFailureTask = {
    id: partialFailureTaskId,
    status: 'running',
    createdAt: 100,
    persistenceRevision: partialFailureBaselineRevision,
    images: [],
    streamPartialImages: []
  };
  hooks.setTestTasks([partialFailureTask]);
  const blobKeysBeforePartialFailure = new Set(fakeIndexedDbStore.keys());
  const originalStorageSetItem = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = () => { throw new Error('quota exceeded'); };
  await hooks.persistTaskStreamPartialCandidate(partialFailureTask, {
    outputIndex: 0,
    partialIndex: 1,
    eventType: 'image_generation.partial_image',
    b64_json: Buffer.from('partial-write-failure').toString('base64')
  });
  sandbox.localStorage.setItem = originalStorageSetItem;
  await hooks.flushTaskPersistence();
  const rollbackRecord = taskStore.get(partialFailureTaskId);
  ok(partialFailureTask.streamPartialImages.length === 0, 'failed partial state persistence must retain the previous partial references');
  ok(rollbackRecord?.persistenceRevision > partialFailureBaselineRevision && !rollbackRecord?.streamPartialImages?.length, 'failed partial rollback must persist a newer revision without retaining the failed Blob reference');
  ok([...fakeIndexedDbStore.keys()].every((id) => blobKeysBeforePartialFailure.has(id)), 'failed partial state persistence must remove the newly written unreferenced Blob');

  const idbFailureTask = { id: 'idb-write-failure-task', status: 'success', images: [] };
  hooks.setTestTasks([idbFailureTask]);
  sandbox.failTaskStoreWrites = true;
  hooks.writeStore({ forceTaskPersistence: true });
  const failedTaskFlush = await hooks.flushTaskPersistence();
  sandbox.failTaskStoreWrites = false;
  const idbFailureState = hooks.getTestState();
  ok(failedTaskFlush === false && idbFailureState.taskStore?.status === 'error' && idbFailureState.taskRecovery?.status === 'error', 'failed IndexedDB persistence must leave an explicit recovery marker');
  sandbox.failTaskStoreWrites = true;
  hooks.setTestTasks([{ id: 'pending-marker-task', status: 'success', note: 'old', images: [] }]);
  hooks.writeStore({ forceTaskPersistence: true });
  const pendingMarkerOldRevision = hooks.getTestState().tasks?.[0]?.persistenceRevision || 0;
  hooks.setTestTasks([{ id: 'pending-marker-task', status: 'success', note: 'latest', images: [] }]);
  hooks.writeStore({ forceTaskPersistence: true });
  const pendingMarkerLatestRevision = hooks.getTestState().tasks?.[0]?.persistenceRevision || 0;
  const pendingMarkerFlush = await hooks.flushTaskPersistence();
  sandbox.failTaskStoreWrites = false;
  const pendingMarkerState = hooks.getTestState();
  ok(pendingMarkerFlush === false
    && pendingMarkerState.taskStore?.status === 'error'
    && pendingMarkerState.taskStore?.ids?.length === 1
    && pendingMarkerState.taskStore?.ids?.[0] === 'pending-marker-task'
    && pendingMarkerState.taskStore?.snapshotRevision >= pendingMarkerLatestRevision
    && pendingMarkerLatestRevision > pendingMarkerOldRevision, 'an IndexedDB failure marker must use the newest pending task snapshot');
  hooks.setTestState({ taskStore: null, taskRecovery: { status: 'idle', retrying: false, error: '', detail: '' } });

  const savedTaskRecordsBeforeRecovery = new Map(taskStore);
  taskStore.clear();
  const inMemoryTask = { id: 'memory-task-survives-recovery-error', status: 'success', images: [] };
  hooks.setTestTasks([inMemoryTask]);
  hooks.setTestState({ taskStore: { version: 1, count: 2 }, taskRecovery: { status: 'idle', retrying: false, error: '', detail: '' } });
  const recoveryResult = await hooks.retryTaskHistory();
  const recoveryState = hooks.getTestState();
  const recoveryHtml = hooks.renderGalleryStage();
  ok(recoveryResult === false && recoveryState.taskRecovery?.status === 'error', 'incomplete IndexedDB task recovery must enter an explicit error state');
  ok(recoveryState.tasks?.some((task) => task.id === inMemoryTask.id), 'failed IndexedDB recovery must preserve valid in-memory tasks');
  ok(recoveryHtml.includes('role="alert"') && recoveryHtml.includes('data-action="retry-task-history"'), 'gallery must expose a visible task recovery retry action');
  taskStore.set('different-task-id', { id: 'different-task-id', status: 'success', images: [] });
  hooks.setTestState({ taskStore: { version: 1, count: 1, ids: ['missing-task-id'] }, taskRecovery: { status: 'idle', retrying: false, error: '', detail: '' } });
  const sameCountMissingIdRecovery = await hooks.retryTaskHistory();
  const sameCountMissingIdState = hooks.getTestState();
  ok(sameCountMissingIdRecovery === false && sameCountMissingIdState.taskRecovery?.status === 'error'
    && /缺少/.test(sameCountMissingIdState.taskRecovery?.detail || ''), 'task recovery must validate taskStore ids instead of trusting a matching record count');
  hooks.setTestState({ taskStore: { version: 1, count: 1, ids: [] }, taskRecovery: { status: 'idle', retrying: false, error: '', detail: '' } });
  const emptyIdsRecovery = await hooks.retryTaskHistory();
  const emptyIdsState = hooks.getTestState();
  ok(emptyIdsRecovery === false && emptyIdsState.taskRecovery?.status === 'error'
    && /没有有效任务 ID/.test(emptyIdsState.taskRecovery?.detail || ''), 'task recovery must reject an explicitly empty taskStore id index');
  taskStore.clear();
  for (const [id, record] of savedTaskRecordsBeforeRecovery) taskStore.set(id, record);
  hooks.setTestTasks(tasksBeforeBlobGuard);
  hooks.setTestState({ taskStore: null, taskRecovery: { status: 'idle', retrying: false, error: '', detail: '' } });

  const crossTabStoreKey = 'gpt-image2.home.v3';
  const crossTabStoreRaw = sandbox.localStorage.getItem(crossTabStoreKey);
  hooks.writeStore({ forceTaskPersistence: true });
  const crossTabBaseline = JSON.parse(sandbox.localStorage.getItem(crossTabStoreKey) || '{}');
  hooks.setTestPersistedStoreBaseline(crossTabBaseline);
  const crossTabRemote = JSON.parse(JSON.stringify(crossTabBaseline));
  crossTabRemote.settings = { ...(crossTabRemote.settings || {}), themeMode: 'light' };
  crossTabRemote.agent = { ...(crossTabRemote.agent || {}), inputDraft: 'remote-tab-agent-state' };
  crossTabRemote.references = [{ id: 'remote-tab-reference', blobId: 'remote-tab-reference-blob' }];
  sandbox.localStorage.setItem(crossTabStoreKey, JSON.stringify(crossTabRemote));
  hooks.writeStore({ forceTaskPersistence: true });
  const crossTabMerged = JSON.parse(sandbox.localStorage.getItem(crossTabStoreKey) || '{}');
  ok(crossTabMerged.settings?.themeMode === 'light'
    && crossTabMerged.agent?.inputDraft === 'remote-tab-agent-state'
    && crossTabMerged.references?.[0]?.id === 'remote-tab-reference', 'a stale tab write must preserve remote non-task domains that it did not modify');
  hooks.setTestPersistedStoreBaseline(crossTabBaseline);
  const localAgentState = hooks.getTestState().agent || {};
  hooks.setTestState({ agent: { ...localAgentState, inputDraft: 'local-tab-agent-state' } });
  const concurrentRemote = JSON.parse(JSON.stringify(crossTabBaseline));
  concurrentRemote.agent = {
    ...(concurrentRemote.agent || {}),
    workflows: [...(concurrentRemote.agent?.workflows || []), { id: 'remote-tab-workflow', name: '远端工作流' }]
  };
  sandbox.localStorage.setItem(crossTabStoreKey, JSON.stringify(concurrentRemote));
  hooks.writeStore({ forceTaskPersistence: true });
  const concurrentMerged = JSON.parse(sandbox.localStorage.getItem(crossTabStoreKey) || '{}');
  ok(concurrentMerged.agent?.inputDraft === 'local-tab-agent-state'
    && concurrentMerged.agent?.workflows?.some((item) => item.id === 'remote-tab-workflow'), 'concurrent changes in different Agent fields must be merged instead of replacing the whole Agent domain');
  hooks.setTestPersistedStoreBaseline(crossTabBaseline);
  hooks.setTestState({ agent: JSON.parse(JSON.stringify(crossTabBaseline.agent || {})) });
  const partialRemote = JSON.parse(JSON.stringify(crossTabBaseline));
  partialRemote.agent = { inputDraft: 'remote-partial-agent-state' };
  sandbox.localStorage.setItem(crossTabStoreKey, JSON.stringify(partialRemote));
  hooks.writeStore({ forceTaskPersistence: true });
  const partialMerged = JSON.parse(sandbox.localStorage.getItem(crossTabStoreKey) || '{}');
  ok(partialMerged.agent?.inputDraft === 'remote-partial-agent-state'
    && Object.prototype.hasOwnProperty.call(partialMerged.agent || {}, 'threadsByProject'), 'cross-tab merge must retain local fields when a remote snapshot omits them');
  hooks.setTestState({ agent: crossTabBaseline.agent || localAgentState });
  if (crossTabStoreRaw === null) sandbox.localStorage.removeItem(crossTabStoreKey);
  else sandbox.localStorage.setItem(crossTabStoreKey, crossTabStoreRaw);
  hooks.setTestPersistedStoreBaseline(crossTabStoreRaw ? JSON.parse(crossTabStoreRaw) : null);

  const composerMergeStorage = new Map();
  const composerMergeGetItem = sandbox.localStorage.getItem;
  const composerMergeSetItem = sandbox.localStorage.setItem;
  const composerMergeRemoveItem = sandbox.localStorage.removeItem;
  sandbox.localStorage.getItem = (key) => composerMergeStorage.get(key) || null;
  sandbox.localStorage.setItem = (key, value) => composerMergeStorage.set(key, String(value));
  sandbox.localStorage.removeItem = (key) => composerMergeStorage.delete(key);
  try {
    const composerDraftBaseline = {
      references: [
        { id: 'draft-ref-a', blobId: 'draft-blob-a' },
        { id: 'draft-ref-b', blobId: 'draft-blob-b' },
        { id: 'draft-ref-c', blobId: 'draft-blob-c' }
      ],
      composerMentionTokens: [{ id: 'draft-mention-b', refId: 'draft-ref-b', start: 5, end: 8, text: '@图2', selected: true, removed: false }],
      composerPrompt: '绘制 @图2',
      favorites: { baseline: true }
    };
    const staleRemoteDraft = JSON.parse(JSON.stringify(composerDraftBaseline));
    const mergeComposerDraft = (localDraft, remoteDraft = staleRemoteDraft) => {
      hooks.setTestPersistedStoreBaseline(composerDraftBaseline);
      composerMergeStorage.set(crossTabStoreKey, JSON.stringify(remoteDraft));
      hooks.mergeCrossTabStoreDomains(localDraft);
      return localDraft;
    };
    const oneReferenceRemoved = JSON.parse(JSON.stringify(composerDraftBaseline));
    oneReferenceRemoved.references = oneReferenceRemoved.references.filter((ref) => ref.id !== 'draft-ref-b');
    oneReferenceRemoved.composerPrompt = '绘制 @已移除图片';
    oneReferenceRemoved.composerMentionTokens[0].removed = true;
    mergeComposerDraft(oneReferenceRemoved);
    ok(oneReferenceRemoved.references.map((ref) => ref.id).join(',') === 'draft-ref-a,draft-ref-c', 'a locally removed reference must not be restored from a stale cross-tab draft');
    ok(oneReferenceRemoved.composerPrompt === '绘制 @已移除图片' && oneReferenceRemoved.composerMentionTokens[0]?.removed === true, 'reference deletion must keep its matching local prompt and mention state');

    const allReferencesRemoved = JSON.parse(JSON.stringify(composerDraftBaseline));
    allReferencesRemoved.references = [];
    allReferencesRemoved.composerPrompt = '纯文本生图';
    allReferencesRemoved.composerMentionTokens = [];
    mergeComposerDraft(allReferencesRemoved);
    ok(allReferencesRemoved.references.length === 0, 'deleting every local reference must not turn a text-only draft back into image editing');
    ok(allReferencesRemoved.composerPrompt === '纯文本生图' && allReferencesRemoved.composerMentionTokens.length === 0, 'a text-only draft must keep its local composer fields after stale cross-tab merge');

    const remoteComposerUpdate = JSON.parse(JSON.stringify(composerDraftBaseline));
    remoteComposerUpdate.references.push({ id: 'draft-ref-d', blobId: 'draft-blob-d' });
    remoteComposerUpdate.composerPrompt = '远端最新草稿';
    remoteComposerUpdate.composerMentionTokens = [{ id: 'draft-mention-d', refId: 'draft-ref-d', start: 0, end: 3, text: '@图4', selected: true, removed: false }];
    remoteComposerUpdate.favorites = { baseline: true, remote: true };
    const unchangedLocalDraft = JSON.parse(JSON.stringify(composerDraftBaseline));
    unchangedLocalDraft.favorites = { baseline: true, local: true };
    mergeComposerDraft(unchangedLocalDraft, remoteComposerUpdate);
    ok(unchangedLocalDraft.references.map((ref) => ref.id).join(',') === 'draft-ref-a,draft-ref-b,draft-ref-c,draft-ref-d'
      && unchangedLocalDraft.composerPrompt === '远端最新草稿', 'an unchanged local composer should still adopt a newer remote draft as one coherent group');
    ok(unchangedLocalDraft.favorites?.local === true && unchangedLocalDraft.favorites?.remote === true, 'composer draft conflict handling must not change normal favorites cross-tab merging');

    const writeStoreStateBefore = hooks.getTestState();
    const writeStoreTasksBefore = writeStoreStateBefore.tasks;
    const writeStoreTaskStoreBefore = new Map(taskStore);
    const writeStoreRemote = JSON.parse(JSON.stringify(staleRemoteDraft));
    writeStoreRemote.tasks = [{ id: 'composer-write-remote-task', createdAt: 901, status: 'success', images: [] }];
    hooks.setTestPersistedStoreBaseline(composerDraftBaseline);
    composerMergeStorage.set(crossTabStoreKey, JSON.stringify(writeStoreRemote));
    hooks.setTestState({
      references: composerDraftBaseline.references.filter((ref) => ref.id !== 'draft-ref-b'),
      composerPrompt: '绘制 @已移除图片',
      composerMentionTokens: [{ ...composerDraftBaseline.composerMentionTokens[0], removed: true }]
    });
    hooks.setTestTasks([{ id: 'composer-write-local-task', createdAt: 902, status: 'success', images: [] }]);
    try {
      hooks.writeStore({ forceTaskPersistence: true });
      const writeStorePayload = JSON.parse(composerMergeStorage.get(crossTabStoreKey) || '{}');
      ok(writeStorePayload.references?.map((ref) => ref.id).join(',') === 'draft-ref-a,draft-ref-c', 'writeStore must not restore a locally deleted reference from a stale remote snapshot');
      ok(writeStorePayload.composerPrompt === '绘制 @已移除图片' && writeStorePayload.composerMentionTokens?.[0]?.removed === true, 'writeStore must persist the matching local prompt and mention state with the deleted reference');
      ok(writeStorePayload.tasks?.some((task) => task.id === 'composer-write-local-task')
        && writeStorePayload.tasks?.some((task) => task.id === 'composer-write-remote-task'), 'writeStore composer conflict handling must not remove normal cross-tab task records');
      await hooks.flushTaskPersistence();
    } finally {
      taskStore.clear();
      for (const [id, record] of writeStoreTaskStoreBefore) taskStore.set(id, record);
      hooks.setTestTasks(writeStoreTasksBefore);
      hooks.setTestState({
        references: writeStoreStateBefore.references,
        composerMentionTokens: writeStoreStateBefore.composerMentionTokens,
        composerPrompt: writeStoreStateBefore.composerPrompt,
        taskStore: writeStoreStateBefore.taskStore,
        taskRecovery: writeStoreStateBefore.taskRecovery
      });
    }

    const composerRemovalStateBefore = hooks.getTestState();
    const removalReferences = [
      { id: 'remove-ref-a', blobId: 'remove-blob-a' },
      { id: 'remove-ref-b', blobId: 'remove-blob-b' },
      { id: 'remove-ref-c', blobId: 'remove-blob-c' }
    ];
    let removalPrompt = '生成 ';
    let removalMentionTokens = [];
    for (let index = 0; index < removalReferences.length; index += 1) {
      const ref = removalReferences[index];
      const start = removalPrompt.length;
      const inserted = hooks.insertReferenceMention(removalPrompt, start, start, ref.id, removalReferences, removalMentionTokens);
      removalPrompt = inserted.value + (index < removalReferences.length - 1 ? '、' : '');
      removalMentionTokens = inserted.tokens;
    }
    const removalDraftBaseline = {
      ...composerDraftBaseline,
      references: removalReferences,
      composerPrompt: removalPrompt,
      composerMentionTokens: removalMentionTokens
    };
    const removeReferenceEquivalent = async (refId) => {
      const current = hooks.getTestState();
      const mentionResult = hooks.markReferenceMentionsRemoved(current.composerPrompt, current.composerMentionTokens, refId);
      hooks.setTestState({
        references: current.references.filter((ref) => ref.id !== refId),
        composerPrompt: mentionResult.value,
        composerMentionTokens: mentionResult.tokens
      });
      hooks.writeStore({ forceTaskPersistence: true });
      await hooks.flushTaskPersistence();
      return JSON.parse(composerMergeStorage.get(crossTabStoreKey) || '{}');
    };
    try {
      hooks.setTestPersistedStoreBaseline(removalDraftBaseline);
      composerMergeStorage.set(crossTabStoreKey, JSON.stringify(removalDraftBaseline));
      hooks.setTestState({
        references: removalReferences,
        composerPrompt: removalPrompt,
        composerMentionTokens: removalMentionTokens
      });
      hooks.setGalleryScrollActivity(true);
      const afterFirstRemoval = await removeReferenceEquivalent('remove-ref-a');
      ok(afterFirstRemoval.references?.map((ref) => ref.id).join(',') === 'remove-ref-b,remove-ref-c', 'forced reference deletion persistence must commit immediately while gallery scrolling is active');
      await removeReferenceEquivalent('remove-ref-b');
      const afterThreeRemovalState = await removeReferenceEquivalent('remove-ref-c');
      ok(afterThreeRemovalState.references?.length === 0, 'deleting all three references must persist an empty reference list');
      const reloadedAllRemoved = hooks.readStore();
      ok(reloadedAllRemoved.references?.length === 0, 'readStore reload after deleting all references must not resurrect a stale reference');
      ok(reloadedAllRemoved.composerMentionTokens?.length === 3
        && reloadedAllRemoved.composerMentionTokens.every((token) => token.removed === true), 'reloaded deleted references must retain three removed mention tokens');

      hooks.setGalleryScrollActivity(false);
      hooks.setTestPersistedStoreBaseline(removalDraftBaseline);
      composerMergeStorage.set(crossTabStoreKey, JSON.stringify(removalDraftBaseline));
      hooks.setTestState({
        references: removalReferences,
        composerPrompt: removalPrompt,
        composerMentionTokens: removalMentionTokens
      });
      const firstReloadRemoval = await removeReferenceEquivalent('remove-ref-a');
      const malformedReload = JSON.parse(JSON.stringify(firstReloadRemoval));
      malformedReload.composerPrompt = malformedReload.composerPrompt.replace('@已移除图片', '@已移除图片除图片');
      composerMergeStorage.set(crossTabStoreKey, JSON.stringify(malformedReload));
      const reloadedAfterLegacyMarker = hooks.readStore();
      ok(!reloadedAfterLegacyMarker.composerPrompt.includes('@已移除图片除图片')
        && (reloadedAfterLegacyMarker.composerPrompt.match(/@已移除图片/g) || []).length === 1, 'readStore must normalize a legacy duplicated removed-image marker before the next reference deletion');
      hooks.setTestState({
        references: reloadedAfterLegacyMarker.references,
        composerPrompt: reloadedAfterLegacyMarker.composerPrompt,
        composerMentionTokens: reloadedAfterLegacyMarker.composerMentionTokens
      });
      const afterSecondReloadRemoval = await removeReferenceEquivalent('remove-ref-b');
      ok(!afterSecondReloadRemoval.composerPrompt.includes('@已移除图片除图片')
        && (afterSecondReloadRemoval.composerPrompt.match(/@已移除图片/g) || []).length === 2, 'continuing deletion after reload must keep removed-image markers canonical and non-duplicated');
      const reloadedBeforeFinalRemoval = hooks.readStore();
      hooks.setTestState({
        references: reloadedBeforeFinalRemoval.references,
        composerPrompt: reloadedBeforeFinalRemoval.composerPrompt,
        composerMentionTokens: reloadedBeforeFinalRemoval.composerMentionTokens
      });
      const afterFinalReloadRemoval = await removeReferenceEquivalent('remove-ref-c');
      const finalReload = hooks.readStore();
      ok(finalReload.references?.length === 0
        && !finalReload.composerPrompt.includes('@已移除图片除图片')
        && (finalReload.composerPrompt.match(/@已移除图片/g) || []).length === 3, 'continued post-reload deletion must leave exactly one canonical marker per removed reference');
      ok(finalReload.composerMentionTokens?.length === 3
        && finalReload.composerMentionTokens.every((token) => token.removed === true && token.text === '@已移除图片'), 'continued post-reload deletion must not leave stale or duplicate mention token metadata');
      void afterFinalReloadRemoval;
    } finally {
      hooks.setGalleryScrollActivity(false);
      hooks.setTestState({
        references: composerRemovalStateBefore.references,
        composerPrompt: composerRemovalStateBefore.composerPrompt,
        composerMentionTokens: composerRemovalStateBefore.composerMentionTokens
      });
    }
  } finally {
    sandbox.localStorage.getItem = composerMergeGetItem;
    sandbox.localStorage.setItem = composerMergeSetItem;
    sandbox.localStorage.removeItem = composerMergeRemoveItem;
    hooks.setTestPersistedStoreBaseline(crossTabStoreRaw ? JSON.parse(crossTabStoreRaw) : null);
  }

  if (typeof hooks.hydrateBlobImage === 'function') {
    fakeIndexedDbStore.set('hydrate-detached-blob', new Blob(['detached'], { type: 'image/png' }));
    const detachedImg = { isConnected: true, dataset: { blobId: 'hydrate-detached-blob' }, src: '' };
    const detachedHydration = hooks.hydrateBlobImage(detachedImg, 'hydrate-detached-blob');
    detachedImg.isConnected = false;
    await detachedHydration;
    ok(detachedImg.src === '', 'hydrateBlobImage must not assign a Blob URL after the target image is detached');

    fakeIndexedDbStore.set('hydrate-retargeted-blob', new Blob(['retargeted'], { type: 'image/png' }));
    const retargetedImg = { isConnected: true, dataset: { blobId: 'hydrate-retargeted-blob' }, src: '' };
    const retargetedHydration = hooks.hydrateBlobImage(retargetedImg, 'hydrate-retargeted-blob');
    retargetedImg.dataset.blobId = 'new-blob-target';
    await retargetedHydration;
    ok(retargetedImg.src === '', 'hydrateBlobImage must not assign a stale Blob URL after the image is retargeted');

    fakeIndexedDbStore.set('hydrate-shared-blob', new Blob(['shared'], { type: 'image/png' }));
    const firstSharedImg = { isConnected: true, dataset: { blobId: 'hydrate-shared-blob' }, src: '' };
    const secondSharedImg = { isConnected: true, dataset: { blobId: 'hydrate-shared-blob' }, src: '' };
    const sharedUrlStart = createdObjectUrls.length;
    await Promise.all([
      hooks.hydrateBlobImage(firstSharedImg, 'hydrate-shared-blob'),
      hooks.hydrateBlobImage(secondSharedImg, 'hydrate-shared-blob')
    ]);
    const sharedUrls = createdObjectUrls.slice(sharedUrlStart);
    ok(sharedUrls.length === 1, 'concurrent hydrateBlobImage calls must recheck the cache after await and create one object URL per blob');
    ok(firstSharedImg.src && firstSharedImg.src === secondSharedImg.src, 'concurrent hydrateBlobImage targets should share the same live cached object URL');
    ok(!revokedObjectUrls.includes(firstSharedImg.src), 'hydrateBlobImage must not leave an image pointing at an object URL revoked by a concurrent hydration');

    const missingImg = { isConnected: true, dataset: { blobId: 'missing-hydration-blob' }, src: '', alt: '' };
    await hooks.hydrateBlobImage(missingImg, 'missing-hydration-blob');
    ok(missingImg.dataset.imageMissing === '1' && /本地图片缓存已丢失/.test(missingImg.alt), 'missing historical Blob must render an explicit cache-missing fallback instead of a silent blank image');
  }

  const sseText = [
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"你好"}',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"，已收到。"}',
    'data: [DONE]'
  ].join('\n\n');
  const sseResponse = new Response(new TextEncoder().encode(sseText), { headers: { 'Content-Type': 'text/event-stream' } });
  const ssePayload = await hooks.consumeResponseTextStream(sseResponse);
  ok(ssePayload.output_text === '你好，已收到。', 'Agent should consume Responses SSE text deltas');
  const manyAgentEvents = Array.from({ length: 60 }, (_, index) => `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'x', sequence_number: index })}`).join('\n\n');
  const manyAgentPayload = await hooks.consumeResponseTextStream(new Response(new TextEncoder().encode(manyAgentEvents)));
  ok(manyAgentPayload.output_text.length === 60, 'Agent stream should preserve bounded response text');
  ok(manyAgentPayload.streamEvents.length === 24 && manyAgentPayload.streamEventCount === 60, 'Agent stream should retain only bounded event metadata plus total count');
  ok(!JSON.stringify(manyAgentPayload.streamEvents).includes('sequence_number'), 'Agent stream metadata should not retain complete delta payloads');
  const oversizedAgentMessages = Array.from({ length: 320 }, (_, index) => ({
    id: `history-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    text: `message-${index}-${'x'.repeat(4096)}`,
    createdAt: index
  }));
  const compactedAgentMessages = hooks.compactAgentThreadMessages(oversizedAgentMessages);
  ok(compactedAgentMessages.length < oversizedAgentMessages.length && compactedAgentMessages.length <= 240, 'Agent thread persistence should enforce message-count and character budgets');
  ok(compactedAgentMessages.at(-1)?.id === 'history-319', 'Agent thread compaction should preserve the newest messages');
  const compactedAgentThreads = hooks.compactAgentMessagesByThreadForStorage({
    old: oversizedAgentMessages.map((message) => ({ ...message, createdAt: message.createdAt })),
    recent: oversizedAgentMessages.map((message) => ({ ...message, id: `recent-${message.id}`, createdAt: message.createdAt + 1000 }))
  });
  ok(JSON.stringify(compactedAgentThreads).length < 1700 * 1024, 'Agent persisted history should stay within a bounded total storage budget');
  const strictSingleMessageBudget = hooks.compactAgentThreadMessages([{
    id: 'single-huge-message',
    role: 'assistant',
    text: 'x'.repeat(2 * 1024 * 1024),
    promptOptions: Array.from({ length: 5 }, (_, index) => ({ index: index + 1, prompt: 'p'.repeat(256 * 1024) }))
  }]);
  ok(JSON.stringify(strictSingleMessageBudget).length <= 512 * 1024, 'A single oversized Agent message must not bypass the localStorage thread budget');

  const archiveState = hooks.getTestState();
  const archiveProjectId = archiveState.agent.activeProjectId;
  const archiveThreadId = archiveState.agent.activeThreadIdByProject[archiveProjectId];
  const archiveMessages = Array.from({ length: 300 }, (_, index) => ({
    id: `archive-${index}`,
    threadId: archiveThreadId,
    projectId: archiveProjectId,
    role: index % 2 ? 'assistant' : 'user',
    text: `archived message ${index}`,
    createdAt: index + 1
  }));
  hooks.setTestState({ agent: { messagesByThread: { ...archiveState.agent.messagesByThread, [archiveThreadId]: archiveMessages } } });
  await hooks.persistAgentHistorySnapshots();
  const archivedStore = fakeIndexedDbStores.get('agentThreads');
  const remoteOnlyMessage = {
    id: 'archive-remote-only',
    threadId: archiveThreadId,
    projectId: archiveProjectId,
    role: 'assistant',
    text: 'remote tab message',
    createdAt: 1001
  };
  archivedStore.set(archiveThreadId, {
    ...archivedStore.get(archiveThreadId),
    messages: [...archiveMessages, remoteOnlyMessage],
    updatedAt: 1001,
    revision: 2
  });
  await hooks.persistAgentHistorySnapshots();
  ok(archivedStore.get(archiveThreadId).messages.some((message) => message.id === remoteOnlyMessage.id), 'unchanged local Agent state must not overwrite a newer cross-tab archive');
  hooks.setTestState({ agent: { messagesByThread: { ...archiveState.agent.messagesByThread, [archiveThreadId]: archiveMessages.slice(-5) } } });
  await hooks.hydrateAgentHistoryFromDb();
  ok(hooks.getTestState().agent.messagesByThread[archiveThreadId].length === 301, 'IndexedDB Agent archive should restore history beyond the bounded localStorage hot window without losing cross-tab messages');
  const remotelyCompletedMessages = archivedStore.get(archiveThreadId).messages.map((message) => (
    message.id === 'archive-0' ? { ...message, text: 'remote completed message', pending: false } : message
  ));
  archivedStore.set(archiveThreadId, {
    ...archivedStore.get(archiveThreadId),
    messages: remotelyCompletedMessages,
    updatedAt: 1050,
    revision: 3
  });
  const localConcurrentMessage = {
    id: 'archive-local-concurrent',
    threadId: archiveThreadId,
    projectId: archiveProjectId,
    role: 'user',
    text: 'local append while remote updates an existing message',
    createdAt: 1060
  };
  hooks.setTestState({
    agent: {
      messagesByThread: {
        ...hooks.getTestState().agent.messagesByThread,
        [archiveThreadId]: [...hooks.getTestState().agent.messagesByThread[archiveThreadId], localConcurrentMessage]
      }
    }
  });
  await hooks.persistAgentHistorySnapshots();
  ok(
    archivedStore.get(archiveThreadId).messages.find((message) => message.id === 'archive-0')?.text === 'remote completed message'
      && archivedStore.get(archiveThreadId).messages.some((message) => message.id === localConcurrentMessage.id),
    'a stale tab append must not overwrite a newer remote update to the same Agent message id'
  );
  archivedStore.set(archiveThreadId, {
    threadId: archiveThreadId,
    messages: [],
    updatedAt: 1100,
    revision: 5
  });
  const localAfterRemoteClear = {
    id: 'archive-local-after-clear',
    threadId: archiveThreadId,
    projectId: archiveProjectId,
    role: 'user',
    text: 'new message after another tab cleared the thread',
    createdAt: 1200
  };
  hooks.setTestState({
    agent: {
      messagesByThread: {
        ...hooks.getTestState().agent.messagesByThread,
        [archiveThreadId]: [...hooks.getTestState().agent.messagesByThread[archiveThreadId], localAfterRemoteClear]
      }
    }
  });
  await hooks.persistAgentHistorySnapshots();
  ok(
    archivedStore.get(archiveThreadId).messages.length === 1 && archivedStore.get(archiveThreadId).messages[0].id === localAfterRemoteClear.id,
    'a stale tab append must preserve the remote clear instead of resurrecting cleared Agent history'
  );

  const tombstoneProjectId = 'project-permanent-tombstone';
  const tombstoneThreadId = 'thread-permanent-tombstone';
  const tombstoneBaseMessage = {
    id: 'tombstone-base-message',
    threadId: tombstoneThreadId,
    projectId: tombstoneProjectId,
    role: 'assistant',
    text: 'original message',
    createdAt: 2_000
  };
  hooks.setTestState({
    agent: {
      activeProjectId: tombstoneProjectId,
      projects: [
        ...archiveState.agent.projects.filter((project) => project.id !== tombstoneProjectId),
        { id: tombstoneProjectId, name: '永久删除测试', prompt: '', createdAt: 1_000, updatedAt: 2_000 }
      ],
      threadsByProject: {
        ...archiveState.agent.threadsByProject,
        [tombstoneProjectId]: [{
          id: tombstoneThreadId,
          projectId: tombstoneProjectId,
          title: '将被远程删除',
          createdAt: 1_000,
          updatedAt: 2_000
        }]
      },
      activeThreadIdByProject: {
        ...archiveState.agent.activeThreadIdByProject,
        [tombstoneProjectId]: tombstoneThreadId
      },
      messagesByThread: {
        ...archiveState.agent.messagesByThread,
        [tombstoneThreadId]: [tombstoneBaseMessage]
      }
    }
  });
  await hooks.persistAgentHistorySnapshots();
  const tombstoneBaseline = archivedStore.get(tombstoneThreadId);
  archivedStore.set(tombstoneThreadId, {
    threadId: tombstoneThreadId,
    messages: [],
    deleted: true,
    updatedAt: 5_000,
    revision: Number(tombstoneBaseline?.revision || 0) + 10
  });
  const staleEditedMessage = {
    ...tombstoneBaseMessage,
    text: 'stale tab edited message',
    createdAt: 6_000
  };
  const staleAddedMessage = {
    id: 'tombstone-stale-addition',
    threadId: tombstoneThreadId,
    projectId: tombstoneProjectId,
    role: 'user',
    text: 'stale tab new message',
    createdAt: 7_000
  };
  hooks.setTestState({
    agent: {
      messagesByThread: {
        ...hooks.getTestState().agent.messagesByThread,
        [tombstoneThreadId]: [staleEditedMessage, staleAddedMessage]
      }
    }
  });
  await hooks.persistAgentHistorySnapshots();
  const permanentTombstone = archivedStore.get(tombstoneThreadId);
  const recoveredEntries = [...archivedStore.entries()].filter(([threadId, snapshot]) => (
    threadId !== tombstoneThreadId
      && snapshot?.deleted !== true
      && (snapshot?.messages || []).some((message) => message.id === staleAddedMessage.id)
  ));
  const [recoveredThreadId, recoveredSnapshot] = recoveredEntries[0] || [];
  ok(permanentTombstone?.deleted === true && !(permanentTombstone?.messages || []).length, 'a remote Agent thread tombstone must never be overwritten or revived under its old thread id');
  ok(recoveredEntries.length === 1 && recoveredThreadId !== tombstoneThreadId, 'stale-tab Agent changes after a tombstone must migrate to exactly one recovered thread id');
  ok(
    recoveredSnapshot?.messages?.some((message) => message.id === staleEditedMessage.id && message.text === staleEditedMessage.text)
      && recoveredSnapshot?.messages?.some((message) => message.id === staleAddedMessage.id),
    'the recovered Agent thread must preserve both stale-tab message edits and additions'
  );
  ok(
    (recoveredSnapshot?.messages || []).every((message) => message.threadId === recoveredThreadId),
    'messages migrated from a tombstoned Agent thread must be retargeted to the recovered thread id'
  );
  const recoveredState = hooks.getTestState().agent;
  ok(
    !Object.prototype.hasOwnProperty.call(recoveredState.messagesByThread || {}, tombstoneThreadId)
      && Array.isArray(recoveredState.messagesByThread?.[recoveredThreadId]),
    'runtime Agent state must drop the tombstoned id and activate the recovered thread history'
  );
  await hooks.persistAgentHistorySnapshots();
  ok(archivedStore.get(tombstoneThreadId)?.deleted === true, 'a later persist must not revive a permanently tombstoned Agent thread id');
  hooks.setTestState({ agent: archiveState.agent });

  let oversizedCompletedCancelled = false;
  const oversizedCompletedEvent = `data: ${JSON.stringify({
    type: 'response.completed',
    response: { status: 'completed', output_text: 'z'.repeat(4 * 1024 * 1024 + 1) }
  })}`;
  let oversizedCompletedRead = false;
  await hooks.consumeResponseTextStream({
    body: {
      getReader: () => ({
        read: async () => {
          if (oversizedCompletedRead) return { done: true };
          oversizedCompletedRead = true;
          return { value: new TextEncoder().encode(oversizedCompletedEvent), done: false };
        },
        cancel: async () => { oversizedCompletedCancelled = true; }
      })
    }
  }).then(
    () => ok(false, 'oversized completed Agent payload should reject'),
    (err) => ok(/4MB 安全上限/.test(String(err?.message || err)), 'oversized completed Agent payload should report the text safety limit')
  );
  ok(oversizedCompletedCancelled, 'oversized completed Agent payload should cancel the upstream reader');
  let oversizedRawEventCancelled = false;
  let oversizedRawEventRead = false;
  await hooks.consumeResponseTextStream({
    body: {
      getReader: () => ({
        read: async () => {
          if (oversizedRawEventRead) return { done: true };
          oversizedRawEventRead = true;
          return { value: new TextEncoder().encode(`data: ${'x'.repeat(8 * 1024 * 1024 + 1)}`), done: false };
        },
        cancel: async () => { oversizedRawEventCancelled = true; }
      })
    }
  }).then(
    () => ok(false, 'oversized unterminated Agent SSE event should reject'),
    (err) => ok(/8MB 安全上限/.test(String(err?.message || err)), 'oversized unterminated Agent SSE event should report the raw event safety limit')
  );
  ok(oversizedRawEventCancelled, 'oversized unterminated Agent SSE event should cancel the upstream reader');

  const completedResponse = new Response(new TextEncoder().encode('data: {"type":"response.completed","response":{"output_text":"最终回答"}}\n\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  const completedPayload = await hooks.resolveResponsePayload({ __stream: true, response: completedResponse });
  ok(/最终回答/.test(completedPayload.output_text || ''), 'Agent should extract completed Responses SSE final text');

  const progressingResponse = new Response(new TextEncoder().encode([
    'data: {"type":"response.in_progress","response":{"status":"in_progress","output_text":"中间快照"}}',
    'data: {"type":"response.completed","response":{"status":"completed","output_text":"最终完整回答"}}'
  ].join('\n\n')), { headers: { 'Content-Type': 'text/event-stream' } });
  const progressingPayload = await hooks.resolveResponsePayload({ __stream: true, response: progressingResponse });
  ok(progressingPayload.output_text === '最终完整回答', 'Agent stream should not treat an in-progress response snapshot as the final answer');

  const completedOutputResponse = new Response(new TextEncoder().encode('data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"数组最终回答"}]}]}}\n\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  const completedOutputPayload = await hooks.resolveResponsePayload({ __stream: true, response: completedOutputResponse });
  ok(/数组最终回答/.test(completedOutputPayload.output_text || ''), 'Agent should extract text from completed Responses output message snapshots');

  const streamFailureResponse = new Response(new TextEncoder().encode('data: {"type":"response.failed","error":{"message":"上游拒绝联网工具"}}\n\n'), { headers: { 'Content-Type': 'text/event-stream' } });
  await hooks.consumeResponseTextStream(streamFailureResponse).then(
    () => ok(false, 'Agent failed stream should reject'),
    (err) => ok(/上游拒绝联网工具/.test(String(err?.message || err)), 'Agent failed stream should expose upstream error message')
  );
  const incompleteStreamResponse = new Response(new TextEncoder().encode([
    'data: {"type":"response.output_text.delta","delta":"只有部分文本"}',
    'data: {"type":"response.incomplete","response":{"status":"incomplete","output_text":"只有部分文本","incomplete_details":{"reason":"max_output_tokens"}}}'
  ].join('\r\n\r\n')), { headers: { 'Content-Type': 'text/event-stream' } });
  await hooks.consumeResponseTextStream(incompleteStreamResponse).then(
    () => ok(false, 'Agent incomplete stream must reject instead of returning partial text'),
    (err) => ok(/max_output_tokens|incomplete/i.test(String(err?.message || err)), 'Agent incomplete stream should expose its terminal failure reason')
  );
  const cancelledStreamResponse = new Response(new TextEncoder().encode([
    'data: {"type":"response.output_text.delta","delta":"取消前文本"}',
    'data: {"type":"response.cancelled","response":{"status":"cancelled","output_text":"取消前文本"}}'
  ].join('\n\n')), { headers: { 'Content-Type': 'text/event-stream' } });
  await hooks.consumeResponseTextStream(cancelledStreamResponse).then(
    () => ok(false, 'Agent cancelled stream must reject instead of returning partial text'),
    (err) => ok(/cancelled/i.test(String(err?.message || err)), 'Agent cancelled stream should report cancelled terminal status')
  );
  await hooks.resolveResponsePayload({ status: 'incomplete', output_text: '非流式部分文本', incomplete_details: { reason: 'content_filter' } }).then(
    () => ok(false, 'non-streaming incomplete Responses payload must reject'),
    (err) => ok(/content_filter|incomplete/i.test(String(err?.message || err)), 'non-streaming incomplete response should expose its failure reason')
  );
  await hooks.resolveResponsePayload({ status: 'failed', output_text: '失败前文本', error: { message: 'relay failed' } }).then(
    () => ok(false, 'non-streaming failed Responses payload must reject'),
    (err) => ok(/relay failed/.test(String(err?.message || err)), 'non-streaming failed response should expose upstream error')
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
  const freshPending = hooks.migrateAgentThreads({
    activeProjectId: 'project-1',
    projects: [{ id: 'project-1', name: '测试项目', prompt: '项目提示词' }],
    threadsByProject: { 'project-1': [{ id: 'fresh-thread', projectId: 'project-1', title: '新对话', createdAt: 1, updatedAt: 1 }] },
    activeThreadIdByProject: { 'project-1': 'fresh-thread' },
    messagesByThread: {
      'fresh-thread': [
        { id: 'fresh-pending', threadId: 'fresh-thread', projectId: 'project-1', role: 'assistant', text: '正在思考...', pending: true, createdAt: Date.now() }
      ]
    }
  });
  const interruptedFreshMessage = freshPending.messagesByThread['fresh-thread'][0];
  ok(interruptedFreshMessage.pending === false && interruptedFreshMessage.status === 'interrupted' && interruptedFreshMessage.error === true, 'every restored Agent pending message should immediately become interrupted/error regardless of age');

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
    activeProfileId: 'image-alt',
    activeImageProfileId: 'image-alt',
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
  ok(initialAgentParams.profileName === '画廊模型' && initialAgentParams.resolution === '4K' && initialAgentParams.aspectRatio === '3:2' && initialAgentParams.transparent === true && initialAgentParams.count === 2, 'hybrid Agent image settings should initialize from agentImageProfileId before the active gallery profile');
  hooks.setAgentImageParam('output_format', 'webp');
  const agentQualityComposerHtml = hooks.renderAgentComposer();
  ok(agentQualityComposerHtml.includes('输出质量') && !agentQualityComposerHtml.includes('压缩/质量'), 'Agent non-PNG compression control should be labeled as user-facing output quality');
  const agentQualityPopoverHtml = hooks.renderPopover({ type: 'agent-compression', rect: { left: 20, top: 200, bottom: 240 } });
  ok(agentQualityPopoverHtml.includes('100 · 最高质量') && agentQualityPopoverHtml.includes('70 · 较小文件'), 'output quality popover should explain the direction of the quality scale');
  ok(hooks.normalizeImageQuality('hd') === 'high', 'legacy hd quality should migrate to high');
  ok(hooks.normalizeImageQuality('standard') === 'medium', 'legacy standard quality should migrate to medium');
  ok(hooks.normalizeImageQuality('LOW') === 'low', 'quality normalization should be case insensitive');
  ok(hooks.normalizeImageQuality('unsupported') === 'high', 'unknown image quality should fall back to high');
  hooks.setTestState({ settings: { openaiSize: '1K', openaiAspectRatio: '1:1', n: 1, transparent_output: false } });
  const independentAgentParams = hooks.agentImageParams();
  ok(independentAgentParams.resolution === '4K' && independentAgentParams.aspectRatio === '3:2' && independentAgentParams.transparent === true && independentAgentParams.count === 2, 'Agent image params should stay independent after gallery settings change');
  hooks.setTestState({ popover: { type: 'agent-resolution', rect: { left: 10, top: 10, bottom: 40 } } });
  hooks.setAgentImageParam('resolution', '2K');
  ok(hooks.getTestState().popover === null, 'Agent model, resolution, and ratio choices should close the active popover after selection');
  hooks.setTestState({ agentConfig: { mode: 'off', imageProfileId: null }, agent: { imageSettings: null } });
  const galleryFallbackAgentParams = hooks.agentImageParams();
  ok(galleryFallbackAgentParams.profileName === '备用模型', 'Agent image settings should clone the active gallery profile only when no hybrid image profile is configured');
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

  const composerButtonMarkup = (html, action) => {
    const match = html.match(new RegExp(`<button\\b[^>]*data-action="${action}"[^>]*>[\\s\\S]*?<\\/button>`));
    return match ? match[0] : '';
  };
  const composerButtonVisibleText = (button) => button
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  const taskBusinessContract = (tasks) => (Array.isArray(tasks) ? tasks : []).map((task) => ({
    id: task?.id,
    status: task?.status,
    prompt: task?.prompt,
    imageBlobIds: (Array.isArray(task?.images) ? task.images : []).map((image) => image?.blobId)
  }));
  const renderGalleryComposerForTest = () => vm.runInContext('renderGalleryComposer()', sandbox);
  const galleryReferenceFixture = {
    id: 'composer-gallery-reference',
    name: '构图参考.png',
    blobId: 'composer-gallery-reference-blob',
    originalBlobId: 'composer-gallery-reference-blob'
  };
  const composerTaskFixture = {
    id: 'composer-clear-task',
    status: 'success',
    prompt: '保留这条任务',
    images: [{ blobId: 'composer-task-blob', width: 1024, height: 1024, type: 'image/png' }]
  };
  hooks.setTestTasks([composerTaskFixture]);
  hooks.setTestState({
    mode: 'gallery',
    composerPrompt: '绘制 @图1',
    composerMentionTokens: [{ id: 'gallery-mention', refId: galleryReferenceFixture.id, start: 3, end: 6, text: '@图1' }],
    references: [galleryReferenceFixture]
  });
  const galleryComposerWithValue = renderGalleryComposerForTest();
  const galleryClearWithValue = composerButtonMarkup(galleryComposerWithValue, 'clear-composer-text');
  ok(galleryComposerWithValue.includes('<textarea id="promptInput"') && galleryComposerWithValue.includes('>绘制 @图1</textarea>'), 'gallery composer should render its current prompt value');
  ok(galleryClearWithValue.includes('class="composer-clear-text composer-clear-text--gallery"')
    && galleryClearWithValue.includes('data-composer-kind="gallery"')
    && galleryClearWithValue.includes('title="清空文本"')
    && galleryClearWithValue.includes('aria-label="清空文本"'), 'gallery valued composer should expose an accessible text-clear X');
  ok((galleryComposerWithValue.match(/data-action="clear-composer-text"/g) || []).length === 1, 'gallery composer should render exactly one text-clear action');
  const galleryStateBeforeClear = hooks.getTestState();
  ok(hooks.clearComposerText('gallery') === true, 'gallery text-clear action should report success');
  const galleryStateAfterClear = hooks.getTestState();
  ok(galleryStateAfterClear.composerPrompt === '' && galleryStateAfterClear.composerMentionTokens.length === 0, 'gallery text-clear should clear the prompt and bound mention tokens');
  ok(JSON.stringify(galleryStateAfterClear.references) === JSON.stringify(galleryStateBeforeClear.references), 'gallery text-clear should keep reference images');
  ok(JSON.stringify(taskBusinessContract(galleryStateAfterClear.tasks)) === JSON.stringify(taskBusinessContract(galleryStateBeforeClear.tasks)), 'gallery text-clear should keep task records');
  const galleryComposerEmpty = renderGalleryComposerForTest();
  const galleryClearEmpty = composerButtonMarkup(galleryComposerEmpty, 'clear-composer-text');
  ok(galleryClearEmpty.includes('class="composer-clear-text composer-clear-text--gallery"')
    && galleryClearEmpty.includes('title="清空文本"')
    && galleryClearEmpty.includes('aria-label="清空文本"'), 'gallery empty composer should keep the same accessible text-clear X markup');
  ok(homeCss.includes('textarea:placeholder-shown + .composer-clear-text'), 'empty composer text should hide the shared X through the placeholder state');

  const agentComposerFixture = {
    activeProjectId: 'composer-agent-project',
    projects: [{ id: 'composer-agent-project', name: '清空回归项目', prompt: '' }],
    threadsByProject: {
      'composer-agent-project': [{ id: 'composer-agent-thread', projectId: 'composer-agent-project', title: '保留会话', createdAt: 1, updatedAt: 2 }]
    },
    activeThreadIdByProject: { 'composer-agent-project': 'composer-agent-thread' },
    messagesByThread: {
      'composer-agent-thread': [{ id: 'composer-agent-message', threadId: 'composer-agent-thread', projectId: 'composer-agent-project', role: 'assistant', text: '保留消息', pending: true, createdAt: 1 }]
    },
    inputDraft: '分析 @图1',
    composerMentionTokens: [{ id: 'agent-mention', refId: 'agent-attachment', start: 3, end: 6, text: '@图1' }],
    attachments: [{ id: 'agent-attachment', kind: 'image', name: '附件.png', type: 'image/png', blobId: 'agent-attachment-blob', size: 2048, width: 1200, height: 800 }],
    webMode: 'on',
    reasoning: 'medium'
  };
  hooks.setTestState({ mode: 'agent', agent: agentComposerFixture, references: [galleryReferenceFixture] });
  const agentComposerWithValue = hooks.renderAgentComposer();
  const agentClearWithValue = composerButtonMarkup(agentComposerWithValue, 'clear-composer-text');
  const agentAttachButton = composerButtonMarkup(agentComposerWithValue, 'agent-pick-attachment');
  const agentSendButton = composerButtonMarkup(agentComposerWithValue, 'agent-chat');
  ok(agentComposerWithValue.includes('<textarea id="agentInput"') && agentComposerWithValue.includes('>分析 @图1</textarea>'), 'Agent composer should render its current draft value');
  ok(agentClearWithValue.includes('class="composer-clear-text composer-clear-text--agent"')
    && agentClearWithValue.includes('data-composer-kind="agent"')
    && agentClearWithValue.includes('title="清空文本"')
    && agentClearWithValue.includes('aria-label="清空文本"'), 'Agent valued composer should expose an accessible text-clear X');
  ok(agentAttachButton.includes('class="composer-action-icon composer-attach-button"')
    && agentAttachButton.includes('aria-label="上传附件"')
    && agentAttachButton.includes('composer-action-badge'), 'Agent attachment action should keep the shared paperclip class and count badge');
  ok(agentSendButton.includes('class="generate-button icon-generate composer-send-button"')
    && agentSendButton.includes('disabled')
    && agentSendButton.includes('aria-disabled="true"')
    && agentSendButton.includes('title="正在思考"'), 'pending Agent send action should keep the shared arrow class and disabled state');
  ok(composerButtonVisibleText(agentSendButton) === '', 'Agent send icon should not render a visible text label');
  const agentStateBeforeClear = hooks.getTestState();
  ok(hooks.clearComposerText('agent') === true, 'Agent text-clear action should report success');
  const agentStateAfterClear = hooks.getTestState();
  ok(agentStateAfterClear.agent.inputDraft === '' && agentStateAfterClear.agent.composerMentionTokens.length === 0, 'Agent text-clear should clear the draft and bound mention tokens');
  ok(JSON.stringify(agentStateAfterClear.agent.attachments) === JSON.stringify(agentStateBeforeClear.agent.attachments), 'Agent text-clear should keep attachments');
  ok(JSON.stringify(agentStateAfterClear.agent.threadsByProject) === JSON.stringify(agentStateBeforeClear.agent.threadsByProject), 'Agent text-clear should keep conversation threads');
  ok(JSON.stringify(agentStateAfterClear.agent.messagesByThread) === JSON.stringify(agentStateBeforeClear.agent.messagesByThread), 'Agent text-clear should keep conversation messages');
  ok(JSON.stringify(agentStateAfterClear.references) === JSON.stringify(agentStateBeforeClear.references)
    && JSON.stringify(taskBusinessContract(agentStateAfterClear.tasks)) === JSON.stringify(taskBusinessContract(agentStateBeforeClear.tasks)), 'Agent text-clear should keep shared references and task records');
  const agentComposerEmptyPending = hooks.renderAgentComposer();
  const agentClearEmpty = composerButtonMarkup(agentComposerEmptyPending, 'clear-composer-text');
  const agentSendEmptyPending = composerButtonMarkup(agentComposerEmptyPending, 'agent-chat');
  ok(agentClearEmpty.includes('class="composer-clear-text composer-clear-text--agent"')
    && agentClearEmpty.includes('title="清空文本"')
    && agentClearEmpty.includes('aria-label="清空文本"'), 'Agent empty composer should keep the same accessible text-clear X markup');
  ok(agentSendEmptyPending.includes('disabled') && agentSendEmptyPending.includes('aria-disabled="true"') && composerButtonVisibleText(agentSendEmptyPending) === '', 'empty pending Agent composer should keep its icon-only disabled send action');
  const clearThreadStageButton = composerButtonMarkup(hooks.renderAgentStage(), 'clear-agent-thread');
  ok(clearThreadStageButton.includes('class="agent-clear-icon-button"')
    && !clearThreadStageButton.includes('composer-clear-text')
    && !clearThreadStageButton.includes('data-composer-kind'), 'clear-agent-thread should remain a distinct conversation action from text clearing');
  const galleryAttachButton = composerButtonMarkup(galleryComposerWithValue, 'pick-reference');
  const gallerySendButton = composerButtonMarkup(galleryComposerWithValue, 'generate');
  ok(galleryAttachButton.includes('class="composer-action-icon composer-attach-button"')
    && galleryAttachButton.includes('aria-label="参考图 1/'), 'gallery attachment action should keep the shared paperclip class');
  ok(gallerySendButton.includes('class="generate-button icon-generate composer-send-button"')
    && composerButtonVisibleText(gallerySendButton) === '', 'gallery send action should keep the shared icon-only arrow contract');

  fakeIndexedDbStore.set('edit-source-blob', new Blob(['generated-image'], { type: 'image/png' }));
  hooks.setTestTasks([{
    id: 'edit-output-task',
    status: 'success',
    prompt: 'original task prompt',
    requestedParams: { quality: 'high', resolution: '4K', aspectRatio: '16:9' },
    images: [{ blobId: 'edit-source-blob', width: 1024, height: 1024, type: 'image/png' }]
  }]);
  hooks.setTestState({
    composerPrompt: 'keep current composer prompt',
    settings: { quality: 'low', openaiSize: '1K', openaiAspectRatio: '1:1' },
    references: []
  });
  const beforeEditOutput = hooks.getTestState();
  await hooks.editOutput('edit-output-task');
  const afterEditOutput = hooks.getTestState();
  ok(afterEditOutput.composerPrompt === beforeEditOutput.composerPrompt, 'edit output must not apply the task prompt');
  ok(afterEditOutput.settings.quality === beforeEditOutput.settings.quality
    && afterEditOutput.settings.openaiSize === beforeEditOutput.settings.openaiSize
    && afterEditOutput.settings.openaiAspectRatio === beforeEditOutput.settings.openaiAspectRatio,
  'edit output must not apply task generation parameters');
  ok(afterEditOutput.references.length === 1
    && afterEditOutput.references[0].originalBlobId
    && afterEditOutput.references[0].compositedBlobId,
  'edit output must add the generated image as a reference image');

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

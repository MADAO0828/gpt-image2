const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const indexShellHtml = indexHtml.replace(/<script id="promptFastBootstrap" type="application\/json">[\s\S]*?<\/script>/, '');
const homeJs = fs.readFileSync(path.join(root, 'assets', 'homepage-v3.js'), 'utf8');
const homeCss = fs.readFileSync(path.join(root, 'assets', 'homepage-v3.css'), 'utf8');
const promptsHtml = fs.readFileSync(path.join(root, 'prompts.html'), 'utf8');
const promptsData = JSON.parse(fs.readFileSync(path.join(root, 'prompts_data.json'), 'utf8'));
const promptSearchIndex = JSON.parse(fs.readFileSync(path.join(root, 'prompts_fast', 'search_index.json'), 'utf8'));
const failures = [];

function ok(cond, msg) {
  if (!cond) failures.push(msg);
}

ok(indexHtml.includes('id="app"'), 'homepage v3 mount node is missing');
ok(indexHtml.includes('/assets/homepage-v3.css?v=home-v3-'), 'homepage v3 CSS is missing a cache-busted URL');
ok(indexHtml.includes('/assets/homepage-v3.js?v=home-v3-'), 'homepage v3 JS is missing a cache-busted URL');
ok(indexShellHtml.includes('NexGen') && indexShellHtml.includes('Nexus Generation'), 'index boot shell must use NexGen / Nexus Generation branding');
ok(!indexShellHtml.includes('GPT Image2') && !indexShellHtml.includes('Mac Studio Workspace'), 'index boot shell must not show legacy GPT Image2 / Mac Studio branding');
ok(!indexShellHtml.includes('id="root"'), 'legacy React #root must not be present on /');
ok(!/assets\/index-[^"']+\.js/.test(indexShellHtml), 'legacy React homepage bundle must not be loaded on /');
ok(!/modulepreload[^>]+assets\/index-/.test(indexShellHtml), 'legacy modulepreload entries must not remain on /');
ok(homeJs.includes('crossedMobileBreakpoint') && homeJs.includes('(viewportWidth <= 760) !== (measuredViewportWidth <= 760)'), 'prompt virtualization must invalidate layout when crossing the 760px column breakpoint');
ok(homeJs.includes('focusedCardId') && homeJs.includes('restoredCard.focus({ preventScroll: true })'), 'prompt virtualization must restore focus when the focused card remains visible');
ok(homeJs.includes('data-modal-key="gallery-viewer"') && homeJs.includes('aria-label="关闭大图"'), 'gallery viewer must participate in modal focus management');
ok(homeJs.includes('data-modal-key="image-context-menu"') && homeJs.includes('data-action="viewer-copy-image"'), 'image context menu and viewer actions must remain in the interactive modal stack');
ok(homeJs.includes('data-modal-key="task-detail"') && homeJs.includes('data-modal-key="confirm-dialog"') && homeJs.includes('data-modal-key="entry-advanced"'), 'homepage dialogs must expose stable modal keys');
ok(promptsHtml.includes('id="imgViewer" role="dialog" aria-modal="true"') && promptsHtml.includes('id="ivclose"') && promptsHtml.includes('function closeImageViewer'), 'standalone prompt image viewer must expose dialog semantics and keyboard-close behavior');

for (const marker of [
  'class="workspace',
  'class="sidebar"',
  'class="gallery-stage"',
  'class="composer',
  'renderDetailModal',
  'renderMaskEditor',
  'openPromptRepo',
  'generateWorkflowFromAgent',
  'renderWorkflowEditor',
  'renderWorkflowInvokeModal',
  'renderWorkflowRowsTable',
  'executeWorkflowInvoke',
  'runWorkflowBatches',
  'workflowDraft',
  'workflowInvoke',
  'workflowRuns',
  'workflow-row-input',
  'execute-workflow',
  'providerPayload',
  'indexedDB'
]) {
  ok(homeJs.includes(marker), `homepage v3 JS is missing ${marker}`);
}

for (const selector of [
  '.workspace',
  '.sidebar',
  '.gallery-grid',
  '.detail-modal',
  '.viewer-actions',
  '.image-context-menu',
  '.mask-layer',
  '.composer',
  '.workflow-workspace',
  '.workflow-card-grid',
  '.workflow-editor',
  '.workflow-invoke-modal',
  '.workflow-table-wrap',
  '@media (max-width: 760px)'
]) {
  ok(homeCss.includes(selector), `homepage v3 CSS is missing ${selector}`);
}

ok(homeJs.includes("task.status === 'queued' || task.status === 'running'"), 'refresh recovery should only interrupt queued/running tasks');
ok(homeJs.includes("run.status === 'queued' || run.status === 'running'"), 'workflow refresh recovery should only interrupt queued/running runs');
ok(homeJs.includes("state.favorites[id] = !state.favorites[id]"), 'local-only favorite toggle is missing');
ok(homeJs.includes('window.open(url, \'_blank\', \'noopener\')'), 'active-task leave-page strategy should open a new tab');
ok(homeJs.includes('saveMaskEditor'), 'mask editor save path is missing');
ok(homeJs.includes('BRUSH_COLORS'), 'mask editor fixed brush colors are missing');
ok(homeJs.includes('workflow-metadata.json'), 'workflow metadata must be included in batch downloads');
ok(homeJs.includes('workflowSnapshot'), 'workflow runs must retain immutable workflow snapshots');
ok(homeJs.includes('normalizeRestoredTask'), 'task restore normalization must preserve completed tasks');
ok(homeJs.includes("task.status === 'success' || task.status === 'partial_success'") && homeJs.includes("error: partial ? task.error || '' : ''") && homeJs.includes("status: partial ? 'partial_success' : 'success'"), 'successful and partial-success tasks with completion evidence must restore without stale interruption errors');
ok(homeJs.includes('taskErrorSummary') && homeJs.includes('asset-failed'), 'failed gallery cards must show a clear centered error state');
ok(homeJs.includes('actual-value'), 'detail modal must render returned-vs-submitted parameter differences');
ok(homeJs.includes('partial_success') && homeJs.includes('partialErrors') && homeJs.includes('topUpTask'), 'multi-image partial success must preserve completed images and expose a top-up action');
ok(homeJs.includes('computeParamMismatches') && homeJs.includes('actual-value') && !homeJs.includes('返回不符'), 'returned resolution/ratio mismatches must be marked only with yellow actual values');
ok(homeJs.includes('NexGen') && homeJs.includes('Nexus Generation'), 'homepage brand must be NexGen / Nexus Generation');
ok(homeJs.includes('account-menu') && homeJs.includes('account-menu-button'), 'global repository/admin/theme/login entries must live in the account menu');
ok(!homeJs.includes('Profile</div>') && !homeJs.includes('Navigation</div>'), 'sidebar must not render legacy Profile / Navigation sections');
ok(!homeJs.includes('图片仅保存在当前浏览器本地'), 'left-bottom storage explanation text must be removed from the visible homepage');
ok(homeJs.includes('webMode') && homeJs.includes('reasoning'), 'Agent workflow requests must carry web/reasoning settings');
ok(Array.isArray(promptsData) && promptsData.length === 10311, 'local prompts_data.json must contain the latest 10311 prompts');
const promptCategories = Array.from(new Set(promptsData.map((row) => row && (row.category || row.c)).filter(Boolean)));
ok(promptCategories.length >= 20 && promptCategories.some((cat) => String(cat).includes('建筑室内空间设计')), 'prompt categories must be extracted from the full ThinkAI c/category fields, not an old whitelist');
const aiCommunitySearchItem = (promptSearchIndex.prompts || []).find((row) => row && row.id === 3128);
ok(aiCommunitySearchItem && aiCommunitySearchItem.partial && aiCommunitySearchItem.d, 'truncated prompt search entries must carry partial=true and a detail chunk path');
if (aiCommunitySearchItem && aiCommunitySearchItem.d) {
  const detailChunk = JSON.parse(fs.readFileSync(path.join(root, 'prompts_fast', aiCommunitySearchItem.d), 'utf8'));
  const full = (detailChunk.prompts || []).find((row) => row && row.id === 3128);
  ok(full && String(full.p || '').length > String(aiCommunitySearchItem.p || '').length * 10, 'prompt detail chunks must retain full text for truncated search cards');
}
ok(homeJs.includes('promptItemNeedsHydration') && homeJs.includes('loadPromptDetailChunk(item.d)') && homeJs.includes('if (promptItemNeedsHydration(item)) hydratePromptDetailItem(item)'), 'homepage prompt repo must hydrate truncated search/detail items before use');
const promptRepoHtml = fs.readFileSync(path.join(root, 'prompts.html'), 'utf8');
ok(promptRepoHtml.includes('hydratePromptItem') && promptRepoHtml.includes('loadPromptDetailChunk') && promptRepoHtml.includes('promptNeedsHydration'), '/prompts page must hydrate truncated prompt cards before detail/copy/use');
ok(homeJs.includes('prompt-categories') && homeJs.includes('prompt-category'), 'homepage prompt repo must expose category filtering');
ok(homeJs.includes('compositionstart') && homeJs.includes('compositionend'), 'homepage prompt repo search must protect Chinese IME composition');
ok(homeJs.includes('captureFocusState') && homeJs.includes('restoreFocusState') && homeJs.includes('promptRepoSearch'), 'prompt repo search must preserve focus across rerenders');
ok(homeJs.includes('captureGalleryScrollState') && homeJs.includes('restoreGalleryScrollState') && homeJs.includes('const galleryScrollState = captureGalleryScrollState()'), 'gallery rerenders must preserve the inner gallery scroll position');
ok(homeJs.includes('galleryVirtualWindow') && homeJs.includes('GALLERY_VIRTUAL_THRESHOLD') && homeCss.includes('.gallery-grid.is-virtual'), 'gallery must use virtualized card rendering for large histories');
ok(homeJs.includes('referenceSnapshots') && homeJs.includes('open-task-reference-viewer') && homeJs.includes('taskReferenceOriginalBlobId') && homeCss.includes('.task-reference-badge') && homeCss.includes('.detail-reference-strip'), 'image-to-image tasks must persist and render reference thumbnails that open the original image');
ok(homeJs.includes('maskBaseCanvas') && homeJs.includes('maskCanvasHasPaint') && homeJs.includes('composeReferenceWithMask') && homeCss.includes('.mask-cursor'), 'mask editor must use separate base/mask canvases with brush cursor and compositing');
ok(homeJs.includes('agent-chat') && homeJs.includes('sendAgentChat'), 'Agent projects must support normal conversation separate from workflow generation');
ok(homeJs.includes('agent-workflow') && homeJs.includes('generateWorkflowFromAgent'), 'Agent workflow generation must remain a separate action');
ok(homeJs.includes('state.mode === \'workflow\'') && homeJs.includes('renderWorkflowWorkspace(activeProject(), currentProjectWorkflowRuns())'), 'workflow must be a top-level homepage mode separate from Agent chat');
ok(!/workflow-run-list/.test(homeJs.slice(homeJs.indexOf('function renderAgentStage'), homeJs.indexOf('function workflowCategories'))), 'Agent chat stage must not render workflow run cards');
ok(homeJs.includes('agentApiConfigMode') && homeJs.includes('agentTextProfileId') && homeJs.includes('agentImageProfileId'), 'homepage must consume existing backend Agent hybrid config');
ok(homeJs.includes('threadsByProject') && homeJs.includes('messagesByThread') && homeJs.includes('activeThreadIdByProject'), 'Agent chat must use per-project thread storage for branching');
ok(homeJs.includes('currentBeijingTime') && homeJs.includes('Asia/Shanghai') && homeJs.includes('currentModelSlug'), 'Agent chat must inject Beijing time and actual model slug into the request context');
ok(homeJs.includes("type: 'web_search'") || homeJs.includes('type":"web_search"'), 'supported Agent requests must attach official Responses web_search tools');
ok(!homeJs.includes('renderAgentBudgetModal') && !homeJs.includes('agent-budget-number') && !homeJs.includes('默认预算'), 'Agent page must no longer render workflow budget UI');
ok(homeJs.includes('AbortController') && homeJs.includes('agentRequestTimeoutSeconds') && homeJs.includes('对话已中断，可重试'), 'Agent chat must timeout and recover stale pending messages instead of thinking forever');
ok(homeJs.includes('X-GPT-Image-Profile-Id'), 'homepage must send selected profile id to the API proxy');
ok(homeJs.includes('X-GPT-Image-Timeout-Seconds') && homeJs.includes('X-GPT-Image-Stream') && homeJs.includes('X-GPT-Image-Partial-Images'), 'homepage must forward entry advanced image settings to the proxy');
ok(homeJs.includes('ENTRY_ADVANCED_PREFIX') && homeJs.includes('nexgen-entry-advanced.'), 'homepage must persist per-entry advanced image overrides');
ok(homeJs.includes('referenceImageEditAction') && homeJs.includes('persistInputOnRestart') && homeJs.includes('clearInputAfterSubmit') && homeJs.includes('taskCompletionNotification') && homeJs.includes('alwaysShowRetryButton') && homeJs.includes('reuseTaskApiProfileTemporarily') && homeJs.includes('allowPromptRewrite') && homeJs.includes('enterSubmit') && homeJs.includes('zipDownloadRoutes'), 'homepage must consume all admin habit settings');
ok(homeJs.includes('addFilesAsWorkflowReferences') && homeJs.includes('pick-workflow-ref'), 'workflow run modal must support temporary reference image uploads');
ok(homeJs.includes('const runProfile = imageProfile()') && homeJs.includes('profileSnapshot') && homeJs.includes('const profile = run.profileSnapshot || imageProfile()'), 'workflow image generation must follow the current Composer image model snapshot');
ok(homeJs.includes('rewriteWorkflowPrompt') && homeJs.includes('Agent 改写失败，已使用原模板'), 'workflow prompt rewrite should try a real Agent call and fall back to the raw template');
ok(homeJs.includes('data-action="leave" data-url="/prompts"'), 'repository entry must navigate to /prompts');
ok(!homeJs.includes('data-action="open-prompt-repo"') || homeJs.includes('提示词仓库'), 'composer may keep prompt repo popup, but sidebar repository must navigate');
ok(homeJs.includes('dataset.themeMode') && homeJs.includes('systemTheme()'), 'system theme must resolve to an explicit data-theme value');
ok(homeJs.includes('prefers-color-scheme: dark') && homeJs.includes('watchSystemTheme'), 'system theme changes must be watched');
ok(homeCss.includes('border-right: 4px solid') && homeCss.includes('border-top: 4px solid'), 'composer expand arc must be mirrored to the top-right corner');
ok(!homeCss.includes('@media (prefers-color-scheme: dark) {\n  :root'), 'homepage v3 should not rely on implicit media-query theme variables');
ok(homeCss.includes('--sidebar-w: 220px'), 'sidebar width must be unified at 220px');
ok(!homeCss.includes('.profile-card'), 'obsolete sidebar profile-card CSS should not remain after moving model config to composer');
ok(!homeCss.includes('.storage-note'), 'obsolete storage-note CSS should not remain after removing left-bottom text');
ok(!homeCss.includes('.workspace:not(.is-agent) .nav-button > span:not(.nav-icon)'), 'sidebar labels should not be hidden by compact non-Agent rules');
ok(homeCss.includes('width: min(1060px, 94vw)') && homeCss.includes('height: min(720px, 88dvh)'), 'detail modal must use the v3.9 large two-column layout');
ok(homeCss.includes('aspect-ratio: 2 / 1'), 'gallery cards must be denser than square cards');
ok(homeCss.includes('.up-popover') && homeCss.includes('.model-menu') && homeCss.includes('.ratio-menu'), 'composer menus must use unified upward popovers');
ok(homeCss.includes('.model-menu button { min-height: 36px; }'), 'model up-menu should be compact and single-line by configuration name');
ok(homeCss.includes('.workflow-editor-modal'), 'workflow editing must render in a modal shell');
ok(homeJs.includes('composer-param-zone') && homeJs.includes('composer-action-zone') && homeCss.includes('.composer-param-zone') && homeCss.includes('.composer-action-zone'), 'gallery composer must use a dual-zone capsule toolbar');
ok(homeCss.includes('.entry-advanced-grid') && homeCss.includes('.profile-select-pill'), 'entry advanced controls and professional model selector must be styled');

const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
ok(adminHtml.includes('id="peTimeout"') && adminHtml.includes('id="peResponseB64"') && adminHtml.includes('id="peStreamPartial"'), 'admin multi-profile editor must expose per-profile timeout, b64_json, and intermediate image count fields');
ok(adminHtml.includes("timeout:parseInt(val('peTimeout'))") && adminHtml.includes("streamPartialImages:parseInt(val('peStreamPartial'))") && adminHtml.includes("responseFormatB64Json:bool('peResponseB64')"), 'admin multi-profile save must persist per-profile advanced fields instead of global controls');
ok(!/\b(alert|confirm|prompt)\s*\(/.test(homeJs), 'homepage must not use browser-native alert/confirm/prompt dialogs');
ok(!/\b(alert|confirm|prompt)\s*\(/.test(adminHtml), 'admin must not use browser-native alert/confirm/prompt dialogs');
ok(!/\b(alert|confirm|prompt)\s*\(/.test(promptsHtml), 'prompts page must not use browser-native alert/confirm/prompt dialogs');

const proxyJs = fs.readFileSync(path.join(root, 'functions', 'api-proxy', '[[path]].js'), 'utf8');
ok(proxyJs.includes('X-GPT-Image-Timeout-Seconds') && proxyJs.includes('X-GPT-Image-Stream') && proxyJs.includes('partial_images'), 'API proxy must honor timeout and stream advanced headers');
ok(proxyJs.includes('isStreamCompatibleImageProfile') && proxyJs.includes('delete body.stream'), 'API proxy must disable stream fields for incompatible providers');
ok(proxyJs.includes('googleCompatExtraBody') && proxyJs.includes("out.append('response_format', 'url')") && proxyJs.includes("out.append('extra_body', JSON.stringify(googleCompatExtraBody"), 'API proxy must pass Google reference image edits through the SkyAPI-compatible multipart path with imageConfig');
ok(!/proxyGoogleImageEditViaNative|:generateContent|inlineData|generativelanguage\.googleapis\.com/.test(proxyJs), 'API proxy must not route Google reference image edits through native Gemini generateContent');
ok(!/type:\s*'input_image'/.test(proxyJs) && !/image_url:\s*imageUrl/.test(proxyJs), 'API proxy must not build OpenAI Responses-style image_url payloads for Google reference images');
const middlewareJs = fs.readFileSync(path.join(root, 'functions', '_middleware.js'), 'utf8');
ok(!/\b(alert|confirm|prompt)\s*\(/.test(middlewareJs), 'wechat compatibility middleware must not use browser-native alert/confirm/prompt dialogs');

const proAnalyze = fs.readFileSync(path.join(root, 'functions', 'api', 'pro-workbench', 'analyze.js'), 'utf8');
const proRender = fs.readFileSync(path.join(root, 'functions', 'api', 'pro-workbench', 'render.js'), 'utf8');
ok(proAnalyze.includes('multipart/form-data') && proAnalyze.includes('formData()') && proAnalyze.includes('input_image') && proAnalyze.includes('base[]') && proAnalyze.includes('ref[]'), 'professional analyze API must accept multipart images and forward them as visual input');
ok(proAnalyze.includes('未完成视觉读图') && proAnalyze.includes('fallbackAnalysis'), 'professional analyze fallback must not pretend it read images');
ok(proRender.includes("form.get('profileId')") && proRender.includes('selectedProfile(settings, String(form.get'), 'professional render must honor the selected Composer image profile');
ok(proRender.includes("fetch(safeUpstreamEndpoint(baseUrl, upstreamPath)") && proRender.includes("upstreamPath = files.length ? 'images/edits' : 'images/generations'"), 'professional render must pass Google reference image tasks through the configured compatible gateway');
ok(proRender.includes("redirect: 'manual'") && proAnalyze.includes("safeUpstreamEndpoint(baseUrl, 'responses')"), 'professional workbench upstream requests must use safe endpoints and block automatic redirects');
ok(!/renderGoogleWithReferences|:generateContent|inlineData|generativelanguage\.googleapis\.com/.test(proRender), 'professional render must not route Google reference image tasks through native Gemini generateContent');

if (failures.length) {
  console.error('Stability checks failed:');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('Stability checks passed.');

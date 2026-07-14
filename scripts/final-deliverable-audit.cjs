const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if ([
        '.git',
        '.codegraph',
        '.agents',
        '.codex',
        '.wrangler',
        '.playwright-cli',
        'node_modules',
        'tests/node_modules',
        '.deploy',
        '.deploy2',
        '.deploy_stage',
        '.deploy_quality_stage'
      ].includes(rel)) continue;
      walk(rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

function assertContains(text, needle, message) {
  if (!text.includes(needle)) fail(message);
}

function assertNotContains(text, needle, message) {
  if (text.includes(needle)) fail(message);
}

function assertMatch(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

const requiredFiles = [
  'index.html',
  'login.html',
  'admin.html',
  'prompts.html',
  'manifest.webmanifest',
  'pwa-icon.svg',
  'sw.js',
  '_headers',
  '.assetsignore',
  'wrangler.jsonc',
  'init_db.sql',
  'README.md',
  'prompts_data.json',
  'assets/image-stream-runtime.js',
  'assets/homepage-v3.js',
  'assets/homepage-v3.css',
  'assets/macos-design.css',
  'assets/shell-ui.js',
  'assets/shell-ui.css',
  'functions/_middleware.js',
  'functions/api-proxy/[[path]].js',
  'functions/api/prompts/index.js',
  'functions/api/pro-workbench/analyze.js',
  'functions/api/pro-workbench/render.js',
  'functions/api/settings/save.js',
  'functions/api/settings/backup.js',
  'scripts/api-smoke.mjs',
  'tests/homepage-task-regression.js',
  'tests/provider-size-branching.js',
  'tests/e2e-quality.js'
];
for (const rel of requiredFiles) {
  if (!exists(rel)) fail(`Required deliverable file missing: ${rel}`);
}

const allowedAssets = new Set([
  'homepage-v3.css',
  'homepage-v3.js',
  'image-stream-runtime.js',
  'macos-design.css',
  'shell-ui.css',
  'shell-ui.js'
]);
const assetFiles = fs.readdirSync(path.join(root, 'assets'), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
for (const name of assetFiles) {
  if (!allowedAssets.has(name)) fail(`Unexpected obsolete asset still present: assets/${name}`);
}
for (const name of allowedAssets) {
  if (!assetFiles.includes(name)) fail(`Expected current asset missing: assets/${name}`);
}

const index = read('index.html');
assertContains(index, '/assets/homepage-v3.css?v=home-v3-20260714-image-response-compat-r98', 'Index must load cache-busted homepage v3 CSS r98.');
assertContains(index, '/assets/image-stream-runtime.js?v=home-v3-20260714-image-response-compat-r98', 'Index must load the cache-busted stream runtime r98.');
assertContains(index, '/assets/homepage-v3.js?v=home-v3-20260714-image-response-compat-r98', 'Index must load cache-busted homepage v3 JS r98.');
for (const old of ['homepage-v2', 'index-CZHhOunP', 'index-BR6pbS6i', 'fast-workbench-skeleton', 'home-v3-20260703', 'home-v3-20260704-cache-recovery-agent-viewer-r8', 'home-v3-20260704-cache-recovery-agent-viewer-r9', 'home-v3-20260704-cache-recovery-agent-viewer-r10', 'home-v3-20260704-cache-recovery-agent-viewer-r11', 'home-v3-20260704-cache-recovery-agent-viewer-r12', 'home-v3-20260704-cache-recovery-agent-viewer-r13', 'home-v3-20260704-cache-recovery-agent-viewer-r14', 'home-v3-20260704-cache-recovery-agent-viewer-r15', 'home-v3-20260704-cache-recovery-agent-viewer-r16', 'home-v3-20260704-cache-recovery-agent-viewer-r17', 'home-v3-20260704-cache-recovery-agent-viewer-r18', 'home-v3-20260704-cache-recovery-agent-viewer-r19', 'home-v3-20260704-cache-recovery-agent-viewer-r20', 'home-v3-20260704-cache-recovery-agent-viewer-r21', 'home-v3-20260704-cache-recovery-agent-viewer-r22', 'home-v3-20260704-cache-recovery-agent-viewer-r23', 'home-v3-20260704-cache-recovery-agent-viewer-r24']) {
  assertNotContains(index, old, `Index still references obsolete shell marker: ${old}`);
}

const headers = read('_headers');
assertMatch(headers, /\/\s+Cache-Control:\s*no-store/i, 'Root HTML route must be no-store.');
assertMatch(headers, /\/api\/\*\s+Cache-Control:\s*no-store/i, 'API routes must be no-store.');
assertMatch(headers, /\/assets\/\*\s+Cache-Control:\s*public,\s*max-age=604800,\s*immutable/i, 'Versioned assets should keep immutable cache policy.');
assertContains(headers, 'Content-Security-Policy-Report-Only:', 'Security headers should include a CSP report-only baseline.');

const assetsIgnore = read('.assetsignore');
for (const marker of ['.codegraph/', '.agents/', '.codex/', '.git/', '.git', '.wrangler/', 'node_modules/', 'tests/node_modules/', 'migrations/', '*.sql', 'wrangler.jsonc', '.deploy2/', '.deploy_stage/', '.deploy_quality_stage/', '*.log']) {
  assertContains(assetsIgnore, marker, `.assetsignore must exclude ${marker}`);
}

const gitignore = read('.gitignore');
for (const marker of ['.agents/', '.codex/', '.git', '.wrangler/', 'node_modules/', 'tests/node_modules/', '.deploy_stage/', '.deploy_quality_stage/', '*.log']) {
  assertContains(gitignore, marker, `.gitignore must exclude ${marker}`);
}

const deploy = read('scripts/deploy-quality.ps1');
for (const marker of ["'.codegraph'", "'.agents'", "'.codex'", "'.wrangler'", "'node_modules'", "'tests\\node_modules'"]) {
  assertContains(deploy, marker, `Deploy staging must exclude ${marker}`);
}
assertContains(deploy, "'.git'", 'Deploy staging must exclude worktree .git file as well as .git directories.');

const homepage = read('assets/homepage-v3.js');
const imageStreamRuntime = read('assets/image-stream-runtime.js');
for (const marker of [
  'function normalizeRestoredTask',
  'function compactTaskForStorage',
  'store write used emergency task-only compaction',
  'onPersistedImages',
  'function persistResponseImages',
  'function resolveTaskProfile',
  'function renderViewer',
  'function setViewerImage',
  'function captureGalleryScrollState',
  'function restoreGalleryScrollState',
  'function galleryVirtualWindow',
  'referenceSnapshots',
  'function composeReferenceWithMask',
  'function expectedProviderResolution',
  'function renderImageContextMenu',
  'open-task-reference-viewer',
  'function maskCanvasHasPaint',
  '5056x3392',
  'response_format',
  'googleCompatResponseFormatFallback',
  "type: 'web_search'",
  'function agentTextProfile',
  'function buildAgentRequestPayload',
  'function branchAgentThreadFromMessage',
  'function clearAgentThreadMessages',
  "state.mode === 'workflow'",
  'function renderProWorkbench',
  'renderEntryAdvancedModal',
  'function promptItemImageSource',
  'function promptThumbUrl',
  'promptPageCache',
  'referrerpolicy="no-referrer"',
  'partial_success'
]) {
  assertContains(homepage, marker, `Homepage v3 is missing required behavior marker: ${marker}`);
}
for (const marker of [
  'function consumeImageStream',
  'IMAGE_STREAM_TRANSPORT_INTERRUPTED',
  'IMAGE_STREAM_UPSTREAM_FAILED',
  "return 'image[]'",
  'function shouldRetryEditImageField'
]) {
  assertContains(imageStreamRuntime, marker, `Image stream runtime is missing required behavior marker: ${marker}`);
}

const proxy = read('functions/api-proxy/[[path]].js');
for (const marker of [
  'function selectedProfile',
  'X-GPT-Image-Profile-Id',
  'function sanitizeGoogleImageBody',
  'function googleOfficialImageSize',
  '5056x3392',
  'function googleCompatExtraBody',
  'X-GPT-Image-Proxy-Streamed',
  'function isStreamCompatibleImageProfile'
]) {
  assertContains(proxy, marker, `API proxy is missing required behavior marker: ${marker}`);
}

const proAnalyze = read('functions/api/pro-workbench/analyze.js');
const proRender = read('functions/api/pro-workbench/render.js');
assertContains(proAnalyze, 'request.formData()', 'Pro workbench analyze must accept multipart FormData image uploads.');
assertContains(proRender, 'profileId', 'Pro workbench render must forward selected image profile.');
assertContains(proRender, '5056x3392', 'Pro workbench render must use Google official 4K size table.');

const e2e = read('tests/e2e-quality.js');
for (const marker of [
  "page.on('dialog'",
  '.pro-mode-rail',
  '[data-action="pro-analyze"]',
  '[data-action="pro-render"]',
  '.confirm-modal',
  '[data-action="delete-workflow"]'
]) {
  assertContains(e2e, marker, `E2E quality gate is missing commercial UI coverage marker: ${marker}`);
}

const apiSmoke = read('scripts/api-smoke.mjs');
for (const marker of [
  'EXPECTED_ASSET_VERSION',
  '/.well-known/img-runtime-config.json',
  '/api/prompts?categories=1',
  'ThinkAI categories should be present',
  'Chinese prompt search should return results',
  'TEST_USER and TEST_PASS are required'
]) {
  assertContains(apiSmoke, marker, `API smoke gate is missing runtime verification marker: ${marker}`);
}

const textSourceFiles = walk('.')
  .filter((rel) => /\.(js|cjs|mjs|html|css|json|md|ps1|toml|jsonc|sql|webmanifest)$/i.test(rel))
  .filter((rel) => rel !== 'prompts_data.json')
  .filter((rel) => rel !== 'scripts/final-deliverable-audit.cjs')
  .filter((rel) => rel !== 'scripts/verify-quality-static.cjs');

const obsoletePatterns = [
  /homepage-v2/i,
  /index-CZHhOunP/i,
  /index-BR6pbS6i/i,
  /KaTeX_/i,
  /mermaid-GHX/i,
  /highlighted-body/i,
  /prompt-detail-modal2/i,
  /fast-workbench-skeleton/i,
  /home-v3-20260703/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r8/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r9/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r10/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r11/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r12/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r13/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r14/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r15/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r16/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r17/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r18/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r19/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r20/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r21/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r22/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r23/i,
  /home-v3-20260704-cache-recovery-agent-viewer-r24/i,
  /GOOGLE_4K_RESPONSE_FORMAT_UNSUPPORTED/i,
  /GOOGLE_NATIVE_IMAGE_FETCH_FAILED/i,
  /GOOGLE_NATIVE_REFERENCE_UNSUPPORTED/i,
  /google-native-generate-content/i,
  /Google 原生参考图/i
];
for (const rel of textSourceFiles) {
  const content = read(rel);
  for (const pattern of obsoletePatterns) {
    if (pattern.test(content)) fail(`Obsolete marker ${pattern} found in ${rel}`);
  }
  if (/\b(alert|confirm|prompt)\s*\(/.test(content)) fail(`Native browser dialog call found in ${rel}`);
}

const middleware = read('functions/_middleware.js');
assertContains(middleware, "path === '/user' || path === '/user.html'", 'Legacy /user route should redirect instead of serving deleted user.html.');
assertContains(middleware, 'Response.redirect(`${url.origin}/admin`, 302)', 'Legacy /user route should redirect to /admin.');

const promptData = JSON.parse(read('prompts_data.json'));
if (!Array.isArray(promptData)) fail('prompts_data.json must be an array.');
else {
  if (promptData.length !== 10311) fail(`Prompt total must be 10311, got ${promptData.length}`);
  const categories = new Set(promptData.map((item) => item.category || item.c).filter(Boolean));
  if (categories.size < 20) fail(`Prompt categories unexpectedly low: ${categories.size}`);
  if (![...categories].some((cat) => /thinkai/i.test(cat)) && !promptData.some((item) => /thinkai/i.test(String(item.source || item.source_key || '')))) fail('ThinkAI prompt categories are missing.');
}

if (exists('user.html')) fail('Deleted legacy user.html should not exist in the deliverable.');
if (exists('functions/api/prompt-image.js')) fail('Unused legacy LeaderAI prompt-image proxy should not exist in the deliverable.');
if (exists('wrangler-local.out.log') || exists('wrangler-local.err.log')) fail('Local preview logs must not be written to the project root; use .wrangler/local-preview instead.');

if (failures.length) {
  console.error('[final-deliverable-audit] FAILED');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('[final-deliverable-audit] deliverable structure, cache busting, old-reference cleanup, and core behavior anchors passed');


/*
 * NexGen end-to-end quality smoke tests.
 * Run with:
 *   $env:BASE_URL='https://gpt-image2-bg5.pages.dev'; $env:TEST_USER='<admin-user>'; $env:TEST_PASS='<hidden>'
 *   npx --yes --package playwright node tests/e2e-quality.js
 */
const { chromium, firefox, devices } = require('playwright');

const DEFAULT_BASE_URL = 'https://gpt-image2-bg5.pages.dev';
const BASE_URL = normalizeBaseUrl(process.env.BASE_URL || DEFAULT_BASE_URL);
const TEST_USER = process.env.TEST_USER || '';
const TEST_PASS = process.env.TEST_PASS || '';
if (!TEST_USER || !TEST_PASS) {
  console.error('[quality] ERROR TEST_USER and TEST_PASS are required and will not be stored in source.');
  process.exit(2);
}
const HEADLESS = !/^(0|false|no)$/i.test(process.env.HEADLESS || '1');
const SLOW_MO = Number(process.env.SLOW_MO || 0);
const TIMEOUT = Number(process.env.PW_TIMEOUT || 45000);

const results = [];

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function absolutePath(path) {
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function log(message) {
  console.log(`[quality] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    results.push({ name, ok: true, ms });
    log(`PASS ${name} (${ms}ms)`);
  } catch (error) {
    const ms = Date.now() - started;
    results.push({ name, ok: false, ms, error: error && error.message ? error.message : String(error) });
    log(`FAIL ${name} (${ms}ms)`);
    throw error;
  }
}

async function newContext(browser, options = {}) {
  return browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
    ...options,
  });
}

function attachPageDiagnostics(page) {
  const errors = [];
  let cloudflareRumErrorAt = 0;
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 401 probes during unauthenticated redirects are expected before login on protected pages.
    if (/\b401\b/.test(text) && /api\/auth\/me|img-runtime-config/.test(text)) return;
    // Cloudflare injects this optional RUM beacon on branch previews; its CORS failure is outside the app runtime.
    if (/cloudflareinsights\.com\/cdn-cgi\/rum/i.test(text)) {
      cloudflareRumErrorAt = Date.now();
      return;
    }
    if (/^Failed to load resource: net::ERR_FAILED$/i.test(text) && Date.now() - cloudflareRumErrorAt < 1000) return;
    errors.push(`console error: ${text}`);
  });
  page.on('dialog', async (dialog) => {
    errors.push(`native dialog opened: ${dialog.type()} ${dialog.message()}`);
    await dialog.dismiss().catch(() => {});
  });
  return errors;
}

async function waitForSettled(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
  try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch (_) {}
}

async function loginViaUi(page) {
  await page.goto(absolutePath('/login'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  await page.locator('#u').fill(TEST_USER);
  await page.locator('#p').fill(TEST_PASS);
  await Promise.all([
    page.waitForURL(/\/admin(?:[#?].*)?$/, { timeout: TIMEOUT }).catch(async () => {
      await page.waitForURL((url) => !/\/login(?:[#?].*)?$/.test(url.pathname + url.search + url.hash), { timeout: TIMEOUT });
    }),
    page.locator('#submitBtn').click(),
  ]);
  await waitForSettled(page);
  assert(!/\/login(?:[#?].*)?$/.test(page.url()), 'login should leave /login after valid credentials');
}

async function expectVisibleByText(page, candidates, options = {}) {
  for (const candidate of candidates) {
    const locator = page.getByText(candidate, { exact: options.exact || false }).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: options.timeout || 3500 });
      return locator;
    } catch (_) {}
  }
  fail(`none of expected texts became visible: ${candidates.join(', ')}`);
}

async function assertNoRuntimeRecovery(page) {
  const recoveryVisible = await page.locator('#runtime-recovery-panel').isVisible().catch(() => false);
  assert(!recoveryVisible, 'runtime recovery panel should not be visible');
  const homeVisible = await page.locator('.home-v3 .workspace').isVisible().catch(() => false);
  assert(homeVisible, 'homepage v3 workspace should be visible');
}

async function clickMode(page, labels) {
  for (const label of labels) {
    const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(900);
      return;
    }
  }
  // Fallback for minified/upstream UI where accessible names are inconsistent.
  const clicked = await page.evaluate((wanted) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((button) => wanted.some((text) => (button.textContent || '').trim().includes(text)));
    if (target) { target.click(); return true; }
    return false;
  }, labels);
  assert(clicked, `mode button not found: ${labels.join('/')}`);
  await page.waitForTimeout(900);
}

async function smokeLoginAndAdmin(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = attachPageDiagnostics(page);
  await loginViaUi(page);
  await page.goto(absolutePath('/admin'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  await expectVisibleByText(page, ['后台', 'API', 'Agent', '设置', TEST_USER], { timeout: 8000 });
  assert(await page.locator('input,select,textarea,button').first().isVisible(), 'admin page should expose controls');
  assert(errors.length === 0, `unexpected browser errors on admin: ${errors.join(' | ')}`);
  await context.close();
}

async function smokeGalleryAndAgent(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = attachPageDiagnostics(page);
  await loginViaUi(page);
  await page.goto(absolutePath('/'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  await assertNoRuntimeRecovery(page);
  const homeAudit = await page.evaluate(() => {
    const sidebarText = document.querySelector('.sidebar')?.textContent || '';
    const visibleText = document.body.innerText || '';
    const directGlobalEntries = Array.from(document.querySelectorAll('.sidebar > .sidebar-section button'))
      .map((button) => (button.textContent || '').trim())
      .filter(Boolean);
    return {
      title: document.title,
      sidebarText,
      visibleText,
      directGlobalEntries,
      hasAccountMenuButton: !!document.querySelector('.account-menu-button'),
      brand: document.querySelector('.brand-title')?.textContent || '',
      subtitle: document.querySelector('.brand-subtitle')?.textContent || '',
    };
  });
  assert(homeAudit.brand === 'NexGen' && homeAudit.subtitle === 'Nexus Generation', `homepage brand should be NexGen / Nexus Generation: ${JSON.stringify(homeAudit)}`);
  assert(!/GPT Image2|Mac Studio Workspace|Profile|Navigation|图片仅保存在当前浏览器本地/.test(homeAudit.visibleText), `homepage should not show legacy visible copy: ${JSON.stringify(homeAudit)}`);
  assert(homeAudit.hasAccountMenuButton, 'account menu button should exist');
  for (const hiddenGlobal of ['仓库', '后台', '主题', '登录']) {
    assert(!homeAudit.directGlobalEntries.includes(hiddenGlobal), `${hiddenGlobal} should be inside account menu, not direct sidebar navigation`);
  }

  await expectVisibleByText(page, ['画廊', 'Gallery'], { timeout: 15000 });
  await clickMode(page, ['画廊', 'Gallery']);
  await assertNoRuntimeRecovery(page);
  assert(await page.locator('textarea, [contenteditable="true"], input').first().isVisible().catch(() => false), 'gallery should expose a prompt/input surface');
  await page.locator('.account-menu-button').click();
  await page.waitForSelector('.account-menu [data-action="leave"][data-url="/prompts"]', { timeout: TIMEOUT });
  assert(await page.locator('.account-menu [data-action="leave"][data-url="/admin"]').isVisible(), 'admin entry should be inside account menu');
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('.control-model').click();
  await page.waitForSelector('.model-menu', { timeout: TIMEOUT });
  const modelMenuAudit = await page.evaluate(() => ({
    text: document.querySelector('.model-menu')?.innerText || '',
    buttonCount: document.querySelectorAll('.model-menu button').length,
    secondarySpans: document.querySelectorAll('.model-menu button span').length,
  }));
  assert(modelMenuAudit.buttonCount >= 1, `model menu should show configured image profiles: ${JSON.stringify(modelMenuAudit)}`);
  assert(modelMenuAudit.secondarySpans === 0, `model menu should only show configured names, not model subtitles: ${JSON.stringify(modelMenuAudit)}`);
  await page.keyboard.press('Escape').catch(() => {});

  await clickMode(page, ['专业', 'Pro']);
  await page.waitForSelector('.pro-mode-rail', { timeout: TIMEOUT });
  const proAudit = await page.evaluate(() => ({
    modes: Array.from(document.querySelectorAll('.pro-mode-card')).map((el) => (el.textContent || '').trim()),
    hasBaseUpload: !!document.querySelector('[data-action="pro-pick-file"][data-slot="base"]'),
    hasAnalyze: !!document.querySelector('[data-action="pro-analyze"]'),
    hasRender: !!document.querySelector('[data-action="pro-render"]'),
    hasProfileSelect: !!document.querySelector('select[data-action="entry-profile-select"][data-entry="pro"]'),
    text: document.querySelector('.pro-stage')?.innerText || '',
  }));
  assert(proAudit.modes.length >= 3 && proAudit.modes.some((text) => /AI/.test(text)) && proAudit.modes.some((text) => /风格|迁移|灵感/.test(text)) && proAudit.modes.some((text) => /手动/.test(text)), `Pro workbench should expose AI/style/manual modes: ${JSON.stringify(proAudit)}`);
  assert(proAudit.hasBaseUpload && proAudit.hasAnalyze && proAudit.hasRender && proAudit.hasProfileSelect, `Pro workbench should expose upload/analyze/render/profile controls: ${JSON.stringify(proAudit)}`);
  assert(!/积分|leaderai/i.test(proAudit.text), `Pro workbench should not expose copied source-site commercial copy: ${JSON.stringify(proAudit.text.slice(0, 300))}`);

  await clickMode(page, ['Agent']);
  await assertNoRuntimeRecovery(page);
  await expectVisibleByText(page, ['Agent'], { timeout: 10000 });
  const agentInputVisible = await page.locator('.agent-chat-inputbar [contenteditable="true"], [contenteditable="true"], textarea').first().isVisible().catch(() => false);
  assert(agentInputVisible, 'Agent should expose an input surface');
  const agentWorkflowCards = await page.locator('.agent-stage .workflow-card, .agent-stage .workflow-workspace, .agent-stage .workflow-run-card').count();
  assert(agentWorkflowCards === 0, `Agent conversation page should not mix workflow UI; found ${agentWorkflowCards} workflow nodes`);

  await clickMode(page, ['工作流', 'Workflow']);
  await page.waitForSelector('.workflow-workspace', { timeout: TIMEOUT });
  await page.locator('[data-action="new-workflow-draft"]').click();
  await page.waitForSelector('.workflow-editor', { timeout: TIMEOUT });
  assert(await page.locator('.workflow-editor-grid .workflow-form-section').count() >= 3, 'Agent workflow draft should render form editor sections');
  assert(await page.locator('.workflow-table-wrap input[data-action="workflow-row-input"]').count() >= 1, 'Agent workflow draft should expose variable table inputs');
  await page.locator('[data-action="save-workflow-draft"]').click();
  await page.waitForSelector('.workflow-card [data-action="invoke-workflow"]', { timeout: TIMEOUT });
  await page.locator('.workflow-card [data-action="invoke-workflow"]').first().click();
  await page.waitForSelector('.workflow-invoke-modal', { timeout: TIMEOUT });
  assert(await page.locator('.workflow-invoke-modal input[data-action="workflow-invoke-number"]').count() >= 4, 'Workflow invoke modal should expose count/concurrency/budget controls');
  assert(await page.locator('.workflow-invoke-modal [data-action="pick-workflow-ref"]').isVisible(), 'Workflow invoke modal should expose temporary reference image upload');
  assert(await page.locator('.workflow-invoke-modal [data-action="execute-workflow"]').isVisible(), 'Workflow invoke modal should require confirm execution');
  await page.locator('.workflow-invoke-modal [data-action="close-workflow-invoke"]').first().click();
  await page.locator('.workflow-card [data-action="delete-workflow"]').first().click();
  await page.waitForSelector('.confirm-modal', { timeout: TIMEOUT });
  const confirmAudit = await page.evaluate(() => ({
    text: document.querySelector('.confirm-modal')?.innerText || '',
    hasConfirm: !!document.querySelector('.confirm-modal [data-action="confirm-dialog"]'),
    hasCancel: !!document.querySelector('.confirm-modal [data-action="cancel-confirm"]'),
  }));
  assert(/删除/.test(confirmAudit.text) && confirmAudit.hasConfirm && confirmAudit.hasCancel, `Workflow delete should use in-page confirmation modal: ${JSON.stringify(confirmAudit)}`);
  await page.locator('.confirm-modal [data-action="confirm-dialog"]').click();
  await page.waitForTimeout(500);
  assert(errors.length === 0, `unexpected browser errors on Gallery/Agent: ${errors.join(' | ')}`);
  await context.close();
}

async function smokePrompts(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  const errors = attachPageDiagnostics(page);
  await loginViaUi(page);
  await page.goto(absolutePath('/prompts'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  await expectVisibleByText(page, ['提示词仓库'], { timeout: 10000 });
  assert(await page.locator('#s').isVisible(), '/prompts search input should be visible');
  await page.waitForSelector('#grid', { state: 'attached', timeout: TIMEOUT });
  await page.waitForTimeout(800);
  const initialCards = await page.locator('#grid .card').count();
  assert(initialCards <= 60, `/prompts should render at most one page of cards initially; got ${initialCards}`);
  const pagerText = await page.locator('#pi').textContent().catch(() => '');
  assert(/\d+-\d+\/\d+|0-0\/0/.test(pagerText || ''), `/prompts pager should show bounded page range; got ${pagerText}`);
  await page.locator('#s').fill('人像');
  await page.waitForTimeout(500);
  await page.waitForSelector('#grid', { state: 'attached', timeout: TIMEOUT });
  const searchedCards = await page.locator('#grid .card').count();
  assert(searchedCards <= 60, `/prompts search should keep DOM bounded; got ${searchedCards}`);
  assert(errors.length === 0, `unexpected browser errors on /prompts: ${errors.join(' | ')}`);
  await context.close();
}

async function smokeMobileLayout(browser) {
  const context = await newContext(browser, {
    ...devices['iPhone 13'],
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const errors = attachPageDiagnostics(page);
  await loginViaUi(page);

  await page.goto(absolutePath('/'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  await assertNoRuntimeRecovery(page);
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  assert(overflow <= 24, `mobile workbench should not horizontally overflow; overflow=${overflow}px`);
  const mobileControls = await page.locator('button, a, textarea, [contenteditable="true"]').count();
  assert(mobileControls >= 3, `mobile workbench should expose controls; got ${mobileControls}`);
  const workbenchMobile = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const nav = document.querySelector('.sidebar');
    const navRect = nav ? nav.getBoundingClientRect() : null;
    const account = document.querySelector('.sidebar .account-card');
    const accountRect = account ? account.getBoundingClientRect() : null;
    const navButtons = Array.from(document.querySelectorAll('.sidebar button, .sidebar select'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: (el.textContent || el.getAttribute('aria-label') || el.id || el.className || '').trim(), w: r.width, h: r.height, left: r.left, right: r.right };
      });
    const composer = Array.from(document.querySelectorAll('.composer'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 120 && r.height > 40)
      .sort((a, b) => b.height - a.height)[0] || null;
    const upstreamTitleVisible = Array.from(document.querySelectorAll('header h1, header [class*="font-bold"]'))
      .some((el) => {
        const text = (el.textContent || '').trim();
        if (!/Image Playground|GPT Image/i.test(text)) return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 8 && r.height > 8 && cs.visibility !== 'hidden' && cs.opacity !== '0';
      });
    return { vw, vh, navRect, accountRect, navButtons, composer: composer ? { x: composer.x, y: composer.y, w: composer.width, h: composer.height } : null, upstreamTitleVisible };
  });
  assert(workbenchMobile.navRect && workbenchMobile.navRect.left >= -1 && workbenchMobile.navRect.right <= workbenchMobile.vw + 1, `mobile workbench nav should fit viewport: ${JSON.stringify(workbenchMobile.navRect)}`);
  assert(!workbenchMobile.accountRect || workbenchMobile.accountRect.right <= workbenchMobile.vw + 1, `mobile account chip should not overflow: ${JSON.stringify(workbenchMobile.accountRect)}`);
  const tooSmallNav = workbenchMobile.navButtons.filter((b) => b.w < 34 || b.h < 34);
  assert(tooSmallNav.length === 0, `mobile workbench nav controls too small: ${JSON.stringify(tooSmallNav)}`);
  assert(!workbenchMobile.composer || workbenchMobile.composer.h <= Math.max(340, workbenchMobile.vh * 0.43), `mobile gallery composer too tall: ${JSON.stringify(workbenchMobile.composer)}`);
  assert(!workbenchMobile.upstreamTitleVisible, 'mobile workbench should not show upstream Image Playground title');
  await clickMode(page, ['Agent']);
  await assertNoRuntimeRecovery(page);
  await page.evaluate(() => {
    const promptLine = document.querySelector('.agent-project-prompt-line');
    if (promptLine) promptLine.textContent = '这是一个用于回归测试的超长 Agent 项目提示词，需要模拟用户输入大量提示词后顶栏左侧内容持续变长的状态。'.repeat(12);
  });
  const agentMobile = await page.evaluate(() => {
    const session = document.querySelector('.agent-project-card');
    const actions = document.querySelector('.agent-stage .agent-head');
    const actionBar = document.querySelector('.agent-stage .agent-head-actions');
    const threadButton = document.querySelector('.agent-stage .agent-thread-menu-trigger');
    const clearButton = document.querySelector('.agent-stage .agent-clear-icon-button');
    const workflowWorkspace = document.querySelector('.workflow-workspace');
    const workflowTable = document.querySelector('.workflow-table-wrap');
    const sr = session ? session.getBoundingClientRect() : null;
    const ar = actions ? actions.getBoundingClientRect() : null;
    const abr = actionBar ? actionBar.getBoundingClientRect() : null;
    const tbr = threadButton ? threadButton.getBoundingClientRect() : null;
    const cbr = clearButton ? clearButton.getBoundingClientRect() : null;
    const wr = workflowWorkspace ? workflowWorkspace.getBoundingClientRect() : null;
    const tr = workflowTable ? workflowTable.getBoundingClientRect() : null;
    const hitTargets = Array.from(document.querySelectorAll('.agent-stage button, .agent-composer button, .sidebar button'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: (el.textContent || el.getAttribute('aria-label') || el.id || '').trim(), w: r.width, h: r.height };
      });
    return {
      session: sr ? { left: sr.left, right: sr.right, top: sr.top, bottom: sr.bottom, w: sr.width, h: sr.height } : null,
      actions: ar ? { left: ar.left, right: ar.right, top: ar.top, bottom: ar.bottom, w: ar.width, h: ar.height } : null,
      actionBar: abr ? { left: abr.left, right: abr.right, top: abr.top, bottom: abr.bottom, w: abr.width, h: abr.height } : null,
      threadButton: tbr ? { left: tbr.left, right: tbr.right, top: tbr.top, bottom: tbr.bottom, w: tbr.width, h: tbr.height } : null,
      clearButton: cbr ? { left: cbr.left, right: cbr.right, top: cbr.top, bottom: cbr.bottom, w: cbr.width, h: cbr.height } : null,
      workflowWorkspace: wr ? { left: wr.left, right: wr.right, w: wr.width } : null,
      workflowTable: tr ? { left: tr.left, right: tr.right, w: tr.width } : null,
      vw: window.innerWidth,
      hitTargets,
    };
  });
  if (agentMobile.session && agentMobile.actions) {
    assert(agentMobile.session.right <= agentMobile.actions.left + 4 || agentMobile.session.bottom <= agentMobile.actions.top || agentMobile.session.top >= agentMobile.actions.bottom, `mobile agent session/actions should not overlap: ${JSON.stringify(agentMobile)}`);
  }
  assert(agentMobile.actionBar && agentMobile.threadButton && agentMobile.clearButton, `mobile agent header controls should exist with long prompt: ${JSON.stringify(agentMobile)}`);
  assert(agentMobile.actionBar.right <= agentMobile.vw + 1 && agentMobile.actionBar.left >= -1, `mobile agent header actions should remain in viewport with long prompt: ${JSON.stringify(agentMobile)}`);
  assert(agentMobile.threadButton.right <= agentMobile.vw + 1 && agentMobile.threadButton.w >= 88, `mobile agent thread button should remain visible with long prompt: ${JSON.stringify(agentMobile)}`);
  assert(agentMobile.clearButton.right <= agentMobile.vw + 1 && agentMobile.clearButton.w >= 32, `mobile agent clear button should remain visible with long prompt: ${JSON.stringify(agentMobile)}`);
  assert(!agentMobile.workflowWorkspace || agentMobile.workflowWorkspace.right <= agentMobile.vw + 2, `mobile workflow workspace should not overflow: ${JSON.stringify(agentMobile)}`);
  assert(!agentMobile.workflowTable || agentMobile.workflowTable.right <= agentMobile.vw + 24, `mobile workflow table container should not overflow: ${JSON.stringify(agentMobile)}`);
  const tooSmallAgent = agentMobile.hitTargets.filter((b) => b.w < 32 || b.h < 32);
  assert(tooSmallAgent.length === 0, `mobile agent controls too small: ${JSON.stringify(tooSmallAgent)}`);

  await page.goto(absolutePath('/prompts'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  const promptsOverflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  assert(promptsOverflow <= 24, `mobile prompts should not horizontally overflow; overflow=${promptsOverflow}px`);
  assert(await page.locator('#s').isVisible(), 'mobile prompts search input should be visible');
  const promptsMobile = await page.evaluate(() => {
    const header = document.querySelector('.prompts-unified.h');
    const cats = document.querySelector('#cats');
    const chips = Array.from(document.querySelectorAll('#cats .cat')).slice(0, 12).map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), w: r.width, h: r.height };
    });
    const hr = header ? header.getBoundingClientRect() : null;
    const cr = cats ? cats.getBoundingClientRect() : null;
    return {
      header: hr ? { h: hr.height, right: hr.right } : null,
      cats: cr ? { h: cr.height, right: cr.right, scrollWidth: cats.scrollWidth, clientWidth: cats.clientWidth } : null,
      chips,
    };
  });
  assert(!promptsMobile.header || promptsMobile.header.h <= 132, `mobile prompts header too tall: ${JSON.stringify(promptsMobile.header)}`);
  assert(!promptsMobile.cats || promptsMobile.cats.h <= 54, `mobile prompts categories should be a compact rail: ${JSON.stringify(promptsMobile.cats)}`);
  const tooSmallPromptChips = promptsMobile.chips.filter((c) => c.h < 32);
  assert(tooSmallPromptChips.length === 0, `mobile prompt category chips too small: ${JSON.stringify(tooSmallPromptChips)}`);

  await page.goto(absolutePath('/admin'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  const adminOverflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  assert(adminOverflow <= 32, `mobile admin should not horizontally overflow; overflow=${adminOverflow}px`);
  await expectVisibleByText(page, ['后台', 'API', 'Agent', '设置'], { timeout: 10000 });
  const adminMobile = await page.evaluate(() => {
    const tabs = document.querySelector('.tabs');
    const addUser = document.querySelector('#addUserBtn');
    const firstRows = Array.from(document.querySelectorAll('#userTable .tbl tbody tr')).slice(0, 3);
    const tabRect = tabs ? tabs.getBoundingClientRect() : null;
    const addRect = addUser ? addUser.getBoundingClientRect() : null;
    const addStyle = addUser ? getComputedStyle(addUser) : null;
    const addVisible = !!addUser && addRect.width > 1 && addRect.height > 1 && addStyle.display !== 'none' && addStyle.visibility !== 'hidden';
    return {
      tabs: tabs ? { h: tabRect.height, right: tabRect.right, scrollWidth: tabs.scrollWidth, clientWidth: tabs.clientWidth } : null,
      addUser: addUser ? { w: addRect.width, h: addRect.height, visible: addVisible } : null,
      rowDisplays: firstRows.map((row) => getComputedStyle(row).display),
      rows: firstRows.length,
    };
  });
  assert(!adminMobile.tabs || adminMobile.tabs.h <= 58, `mobile admin tabs too tall: ${JSON.stringify(adminMobile.tabs)}`);
  assert(!adminMobile.addUser || !adminMobile.addUser.visible || adminMobile.addUser.h >= 36, `mobile add-user button too small: ${JSON.stringify(adminMobile.addUser)}`);
  assert(adminMobile.rows === 0 || adminMobile.rowDisplays.every((d) => d === 'block'), `mobile admin user table should render as cards: ${JSON.stringify(adminMobile.rowDisplays)}`);

  assert(errors.length === 0, `unexpected browser errors on mobile layout: ${errors.join(' | ')}`);
  await context.close();
}

async function authenticateContext(context) {
  const res = await context.request.post(absolutePath('/api/auth/login'), {
    data: { username: TEST_USER, password: TEST_PASS },
    headers: { 'content-type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  assert(res.ok(), `api login should establish an HttpOnly session cookie; status=${res.status()} error=${data.error || ''}`);
}

async function assertModalAccessibility(page, modalKey, expectedAutofocus) {
  const selector = `[data-modal-key="${modalKey}"]`;
  await page.waitForSelector(selector, { state: 'visible', timeout: TIMEOUT });
  const audit = await page.evaluate(({ selector, modalKey }) => {
    const dialog = document.querySelector(selector);
    const labelledBy = dialog?.getAttribute('aria-labelledby') || '';
    const labelledNode = labelledBy ? document.getElementById(labelledBy) : null;
    return {
      role: dialog?.getAttribute('role') || '',
      ariaModal: dialog?.getAttribute('aria-modal') || '',
      labelledBy,
      labelText: labelledNode?.textContent?.trim() || dialog?.getAttribute('aria-label') || '',
      activeModalKey: document.activeElement?.closest?.('[data-modal-key]')?.dataset?.modalKey || '',
      workspaceInert: !!document.querySelector('#app > .workspace')?.inert,
      lowerDialogs: Array.from(document.querySelectorAll('[data-modal-key][role="dialog"]'))
        .filter((node) => node !== dialog)
        .map((node) => ({ key: node.dataset.modalKey, inert: !!node.inert, ariaHidden: node.getAttribute('aria-hidden') })),
    };
  }, { selector, modalKey });
  assert(audit.role === 'dialog' && audit.ariaModal === 'true', `${modalKey} should expose modal dialog semantics: ${JSON.stringify(audit)}`);
  assert(!!audit.labelText, `${modalKey} should have an accessible title: ${JSON.stringify(audit)}`);
  assert(audit.activeModalKey === modalKey, `${modalKey} should own initial focus: ${JSON.stringify(audit)}`);
  assert(audit.workspaceInert, `${modalKey} should make the workbench background inert: ${JSON.stringify(audit)}`);
  if (expectedAutofocus) {
    assert(await page.locator(expectedAutofocus).evaluate((node) => document.activeElement === node), `${modalKey} should focus ${expectedAutofocus}`);
  }

  const focusables = page.locator(`${selector} button:not([disabled]), ${selector} [href], ${selector} input:not([disabled]), ${selector} select:not([disabled]), ${selector} textarea:not([disabled]), ${selector} [tabindex]:not([tabindex="-1"])`);
  const count = await focusables.count();
  assert(count >= 1, `${modalKey} should expose at least one focusable control`);
  await focusables.nth(count - 1).focus();
  await page.keyboard.press('Tab');
  assert(await page.evaluate((selector) => document.querySelector(selector)?.contains(document.activeElement), selector), `${modalKey} Tab should remain in the top dialog`);
  await page.evaluate(() => {
    const outside = document.querySelector('#app > .workspace button, #app > .workspace input');
    if (outside) outside.focus();
    else {
      document.body.tabIndex = -1;
      document.body.focus();
    }
  });
  assert(await page.evaluate((selector) => document.querySelector(selector)?.contains(document.activeElement), selector), `${modalKey} should pull escaped focus back into the top dialog`);
  return audit;
}

async function smokeModalKeyboardMatrix(browserType, browserName) {
  const browser = await browserType.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  try {
    for (const width of [390, 768]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: true,
        ignoreHTTPSErrors: true,
      });
      await authenticateContext(context);
      const page = await context.newPage();
      const errors = attachPageDiagnostics(page);
      await page.goto(absolutePath('/'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await waitForSettled(page);
      await assertNoRuntimeRecovery(page);

      await clickMode(page, ['工作流', 'Workflow']);
      await page.waitForSelector('.workflow-workspace', { timeout: TIMEOUT });
      const editorOpener = page.locator('[data-action="new-workflow-draft"]').first();
      await editorOpener.focus();
      await page.keyboard.press('Enter');
      await assertModalAccessibility(page, 'workflow-editor', '[data-modal-key="workflow-editor"] [data-action="workflow-name-input"]');
      const editorStableAction = '[data-modal-key="workflow-editor"] [data-action="save-workflow-draft"]';
      await page.locator(editorStableAction).focus();
      await page.evaluate(() => window.__homepageV3TestHooks.render());
      assert(await page.locator(editorStableAction).evaluate((node) => document.activeElement === node), `${browserName} ${width}: workflow editor focus should survive a full render`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-modal-key="workflow-editor"]', { state: 'detached', timeout: TIMEOUT });
      assert(await editorOpener.evaluate((node) => document.activeElement === node), `${browserName} ${width}: workflow editor Escape should restore opener`);

      const invokeOpener = page.locator('[data-action="new-workflow-draft"]').first();
      await invokeOpener.focus();
      await page.evaluate(() => {
        const workflow = {
          id: 'a11y-workflow',
          projectId: 'default',
          name: '键盘调用验收',
          variables: { columns: ['主题'], rows: [{ 主题: '海报' }] },
          config: {},
        };
        window.__homepageV3TestHooks.setTestState({
          agent: { workflows: [workflow] },
          workflowInvoke: {
            workflowId: workflow.id,
            workflow,
            rows: workflow.variables.rows,
            columns: workflow.variables.columns,
            countPerRow: 1,
            concurrency: 2,
            maxSteps: 5,
            maxImages: 8,
            continueOnStepError: true,
            references: [],
          },
        });
        window.__homepageV3TestHooks.render();
      });
      await assertModalAccessibility(page, 'workflow-invoke', '[data-modal-key="workflow-invoke"] [data-action="workflow-invoke-number"][data-field="countPerRow"]');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-modal-key="workflow-invoke"]', { state: 'detached', timeout: TIMEOUT });
      assert(await invokeOpener.evaluate((node) => document.activeElement === node), `${browserName} ${width}: workflow invoke Escape should restore opener`);

      await clickMode(page, ['画廊', 'Gallery']);
      const promptOpener = page.locator('[data-action="open-prompt-repo"]:visible').first();
      await promptOpener.focus();
      await page.keyboard.press('Enter');
      await assertModalAccessibility(page, 'prompt-repo', '#promptRepoSearch');
      const imageCard = page.locator('[data-modal-key="prompt-repo"] .prompt-card:has(img)').first();
      await imageCard.waitFor({ state: 'visible', timeout: TIMEOUT });
      await imageCard.focus();
      await page.keyboard.press('Enter');
      const detailAudit = await assertModalAccessibility(page, 'prompt-detail', '[data-modal-key="prompt-detail"] [data-action="prompt-detail-close"]');
      assert(detailAudit.lowerDialogs.some((item) => item.key === 'prompt-repo' && item.inert && item.ariaHidden === 'true'), `${browserName} ${width}: prompt repo should be inert under prompt detail: ${JSON.stringify(detailAudit)}`);
      const detailStableAction = '[data-modal-key="prompt-detail"] [data-action="use-prompt"]';
      await page.locator(detailStableAction).focus();
      await page.evaluate(() => window.__homepageV3TestHooks.render());
      const detailFocusAudit = await page.evaluate((selector) => {
        const expected = document.querySelector(selector);
        const active = document.activeElement;
        return {
          matched: active === expected,
          expectedExists: !!expected,
          activeTag: active?.tagName || '',
          activeAction: active?.dataset?.action || '',
          activeModalKey: active?.closest?.('[data-modal-key]')?.dataset?.modalKey || '',
        };
      }, detailStableAction);
      assert(detailFocusAudit.matched, `${browserName} ${width}: nested detail focus should survive a full render: ${JSON.stringify(detailFocusAudit)}`);

      const imageViewerOpener = page.locator('[data-modal-key="prompt-detail"] [data-action="prompt-image-view"]');
      await page.locator('[data-modal-key="prompt-detail"] [data-action="prompt-detail-close"]').focus();
      await page.keyboard.press('Tab');
      assert(await imageViewerOpener.evaluate((node) => document.activeElement === node && node.tagName === 'BUTTON'), `${browserName} ${width}: prompt image should be the next keyboard-focusable control`);
      await page.keyboard.press('Enter');
      const viewerAudit = await assertModalAccessibility(page, 'prompt-viewer', '[data-modal-key="prompt-viewer"] [data-action="prompt-image-close"]');
      assert(viewerAudit.lowerDialogs.some((item) => item.key === 'prompt-detail' && item.inert && item.ariaHidden === 'true'), `${browserName} ${width}: prompt detail should be inert under image viewer: ${JSON.stringify(viewerAudit)}`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-modal-key="prompt-viewer"]', { state: 'detached', timeout: TIMEOUT });
      assert(await imageViewerOpener.evaluate((node) => document.activeElement === node), `${browserName} ${width}: closing viewer should restore the image opener`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-modal-key="prompt-detail"]', { state: 'detached', timeout: TIMEOUT });
      assert(await imageCard.evaluate((node) => document.activeElement === node), `${browserName} ${width}: closing prompt detail should restore its card opener`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-modal-key="prompt-repo"]', { state: 'detached', timeout: TIMEOUT });
      assert(await promptOpener.evaluate((node) => document.activeElement === node), `${browserName} ${width}: closing prompt repo should restore opener`);

      assert(errors.length === 0, `${browserName} ${width}: unexpected modal keyboard browser errors: ${errors.join(' | ')}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function smokeFirefoxAgentLayout() {
  const browser = await firefox.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  const context = await browser.newContext({
    viewport: { width: 1536, height: 820 },
    ignoreHTTPSErrors: true,
  });
  await authenticateContext(context);
  const page = await context.newPage();
  const errors = attachPageDiagnostics(page);
  try {
    await page.goto(absolutePath('/'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await waitForSettled(page);
    await assertNoRuntimeRecovery(page);
    await clickMode(page, ['Agent']);
    await page.waitForSelector('.agent-stage .agent-head', { timeout: TIMEOUT });
    await page.evaluate(() => {
      const log = document.querySelector('.agent-log');
      if (!log) return;
      const prompt = '赛博朋克女孩站在雨夜街头，暗黑未来风，破旧但高科技的城市街区，智能霓虹与故障路牌交错，女孩穿磨损机能皮衣与义体装甲，表面有雨水与划痕，神情冷冽觉醒，身后是朦胧的工业建筑，蒸汽管道与闪烁广告屏，整体低饱和冷色调，局部红蓝霓虹点缀，重氛围，压迫感，电影级末世科技美术风格，gritty cyberpunk, dystopian rainy street, dark cinematic lighting, futuristic decay';
      log.innerHTML = `<div class="agent-conversation"><article class="agent-message user"><div class="agent-message-head"><span>你</span><button class="agent-message-menu-button">•••</button></div><div class="agent-prose"><p>我想做一个壁纸，绿色的海洋和岸边的女孩</p></div><time>2026/7/8 07:27:46</time></article><article class="agent-message assistant"><div class="agent-message-head"><span>ASSISTANT</span><button class="agent-message-menu-button">•••</button></div><div class="agent-prose-wrap"><div class="agent-prose"><p>下面是 5 个可选方案。</p><div class="agent-prompt-options"><div class="agent-option-grid"><section class="agent-prompt-option-card recommended"><div class="agent-prompt-option-head"><span>方案 1 推荐</span><strong>暗黑未来街区觉醒</strong></div><div class="agent-prompt-option-meta"><span>适合模型：Flux / SDXL / Midjourney</span><span>理由：比较统筹赛博朋克更冷、更硬核，适合想要压抑、成熟、末世科技感的画面。</span></div><div class="agent-prompt-box"><div><strong>正向 PROMPT</strong><button>复制</button></div><p>${prompt}</p></div><div class="agent-prompt-box negative"><div><strong>负面 PROMPT</strong><button>复制</button></div><p>色彩过艳，卡通化，可爱风，多人，干净明亮，低细节，材质塑料感，结构混乱，过度曝光</p></div><button class="agent-option-generate">生成该方案</button></section></div><div class="agent-option-shortcuts"><button>1</button><button>2</button><button>3</button><button>4</button><button>5</button></div><div class="agent-task-strip"><button class="agent-task-card"><span class="agent-task-preview"></span><span class="agent-task-meta"><strong>完成</strong><span>1/1 · 00:57</span><span class="agent-task-progress"><i style="width:100%"></i></span></span></button></div></div></div></div><time>2026/7/8 07:06:09</time></article><article class="agent-message assistant pending"><div class="agent-message-head"><span>AGENT</span><button class="agent-message-menu-button">•••</button></div><div class="agent-prose"><p>正在思考...</p></div><time>2026/7/8 07:27:46</time></article></div>`;
    });
    const layout = await page.evaluate(() => {
      const box = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height };
      };
      const vw = window.innerWidth;
      return {
        vw,
        rootOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
        bodyOverflow: Math.max(0, document.body.scrollWidth - vw),
        stage: box('.agent-stage'),
        log: box('.agent-log'),
        conversation: box('.agent-conversation'),
        message: box('.agent-message'),
        userMessage: box('.agent-message.user'),
        promptOptions: box('.agent-prompt-options'),
        taskStrip: box('.agent-task-strip'),
        composer: box('.agent-composer'),
      };
    });
    assert(layout.rootOverflow <= 2 && layout.bodyOverflow <= 2, `Firefox Agent should not create page horizontal overflow: ${JSON.stringify(layout)}`);
    for (const key of ['stage', 'log', 'conversation', 'message', 'userMessage', 'promptOptions', 'taskStrip', 'composer']) {
      const rect = layout[key];
      assert(!rect || (rect.left >= -1 && rect.right <= layout.vw + 2), `Firefox Agent ${key} should stay inside viewport: ${JSON.stringify(layout)}`);
    }
    assert(!layout.userMessage || !layout.conversation || Math.abs(layout.conversation.right - layout.userMessage.right) <= 24, `Firefox user message should align near the right edge of the conversation: ${JSON.stringify(layout)}`);
    assert(errors.length === 0, `unexpected Firefox browser errors on Agent layout: ${errors.join(' | ')}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function smokeGalleryVirtualScroll(browserType, browserName) {
  const browser = await browserType.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  await authenticateContext(context);
  const page = await context.newPage();
  const errors = attachPageDiagnostics(page);
  try {
    await page.goto(absolutePath('/'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await waitForSettled(page);
    await page.evaluate(() => {
      const hooks = window.__homepageV3TestHooks;
      const source = hooks.getTestState().tasks[0] || { status: 'success', prompt: 'scroll test', images: [] };
      const tasks = Array.from({ length: 72 }, (_, index) => ({
        ...source,
        id: `virtual-gallery-${index}`,
        status: 'success',
        prompt: `连续滚动验收 ${index}`,
        images: [],
        actualCount: 0,
        expectedCount: 1
      }));
      hooks.setTestTasks(tasks);
      hooks.setTestState({
        mode: 'gallery',
        promptRepo: { open: false },
        galleryVirtual: { scrollTop: 0, viewportHeight: 0, viewportWidth: 0 }
      });
      hooks.render();
    });
    await page.waitForSelector('.gallery-scroll .asset-card', { timeout: TIMEOUT });
    const audit = await page.evaluate(async () => {
      const scroll = document.querySelector('.gallery-scroll');
      const initialScrollHeight = scroll.scrollHeight;
      const blankRatios = [];
      for (const ratio of [0, 0.2, 0.45, 0.7, 0.92, 1]) {
        const target = Math.round((scroll.scrollHeight - scroll.clientHeight) * ratio);
        scroll.scrollTop = target;
        scroll.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const listRect = scroll.getBoundingClientRect();
        const visible = [...scroll.querySelectorAll('.asset-card')].filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.bottom > listRect.top && rect.top < listRect.bottom;
        }).length;
        if (!visible) blankRatios.push(ratio);
      }
      await new Promise((resolve) => setTimeout(resolve, 260));
      return {
        initialScrollHeight,
        settledScrollHeight: scroll.scrollHeight,
        cardCount: scroll.querySelectorAll('.asset-card').length,
        virtual: scroll.dataset.virtual,
        blankRatios
      };
    });
    assert(audit.virtual === '1', `${browserName}: gallery should remain virtualized: ${JSON.stringify(audit)}`);
    assert(audit.blankRatios.length === 0, `${browserName}: gallery viewport must not become empty during continuous scroll: ${JSON.stringify(audit)}`);
    assert(Math.abs(audit.settledScrollHeight - audit.initialScrollHeight) <= 2, `${browserName}: gallery scroll height must remain stable after layout settles: ${JSON.stringify(audit)}`);
    assert(audit.cardCount <= 60, `${browserName}: gallery virtual DOM should stay bounded: ${JSON.stringify(audit)}`);
    await page.evaluate(() => {
      const hooks = window.__homepageV3TestHooks;
      const source = hooks.getTestState().tasks[0] || { status: 'success', prompt: 'medium scroll test', images: [] };
      const tasks = Array.from({ length: 25 }, (_, index) => ({
        ...source,
        id: `medium-gallery-${index}`,
        status: 'success',
        prompt: `中等数量滚动验收 ${index}`,
        images: [],
        referenceSnapshots: [],
        actualCount: 0,
        expectedCount: 1
      }));
      hooks.setTestTasks(tasks);
      hooks.setTestState({
        mode: 'gallery',
        promptRepo: { open: false },
        galleryVirtual: { scrollTop: 0, viewportHeight: 0, viewportWidth: 0 }
      });
      hooks.render();
      const scroll = document.querySelector('.gallery-scroll');
      if (scroll) scroll.scrollTop = 0;
    });
    await page.waitForSelector('.gallery-scroll .asset-card', { timeout: TIMEOUT });
    const mediumAudit = await page.evaluate(() => {
      const scroll = document.querySelector('.gallery-scroll');
      const cards = [...scroll.querySelectorAll('.asset-card')];
      const rect = scroll.getBoundingClientRect();
      return {
        virtual: scroll.dataset.virtual,
        cardCount: cards.length,
        visible: cards.filter((card) => {
          const item = card.getBoundingClientRect();
          return item.bottom > rect.top && item.top < rect.bottom;
        }).length,
        scrollHeight: scroll.scrollHeight
      };
    });
    assert(mediumAudit.virtual === '0', `${browserName}: 25-card gallery should keep the native list path: ${JSON.stringify(mediumAudit)}`);
    assert(mediumAudit.cardCount === 25, `${browserName}: 25-card gallery should not enter the virtual DOM patch path: ${JSON.stringify(mediumAudit)}`);
    assert(mediumAudit.visible > 0, `${browserName}: medium gallery viewport must not be empty: ${JSON.stringify(mediumAudit)}`);
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 260);
    const scrollingStyles = await page.evaluate(() => {
      const scroll = document.querySelector('.gallery-scroll');
      const card = scroll?.querySelector('.asset-card');
      if (!scroll || !card) return null;
      const style = getComputedStyle(card);
      return { active: scroll.classList.contains('is-scrolling'), shadow: style.boxShadow, transition: style.transition };
    });
    assert(scrollingStyles?.active === true, `${browserName}: medium gallery should expose native scroll activity: ${JSON.stringify(scrollingStyles)}`);
    assert(scrollingStyles.shadow === 'none' && scrollingStyles.transition === 'none', `${browserName}: medium gallery should disable expensive card effects while scrolling: ${JSON.stringify(scrollingStyles)}`);
    assert(errors.length === 0, `${browserName}: unexpected gallery virtualization browser errors: ${errors.join(' | ')}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function smokePromptVirtualization(browserType, browserName) {
  const browser = await browserType.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  await authenticateContext(context);
  const page = await context.newPage();
  const errors = attachPageDiagnostics(page);
  try {
    await page.goto(absolutePath('/'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await waitForSettled(page);
    await page.evaluate(() => {
      const items = Array.from({ length: 500 }, (_, index) => ({
        id: `virtual-prompt-${index}`,
        t: `虚拟提示词 ${index}`,
        p: `用于虚拟滚动验收的完整提示词 ${index}`,
        c: '验收分类',
        i: ''
      }));
      window.__homepageV3TestHooks.setTestState({
        mode: 'gallery',
        promptRepo: {
          open: true,
          items,
          categories: ['all', '验收分类'],
          category: 'all',
          total: items.length,
          page: 14,
          hasMore: false,
          loading: false,
          scrollTop: 0,
          viewportHeight: 620,
          virtualLayout: null
        }
      });
      window.__homepageV3TestHooks.render();
      window.__homepageV3TestHooks.render();
    });
    await page.waitForSelector('#promptList .prompt-card', { timeout: TIMEOUT });
    for (const ratio of [0, 0.2, 0.45, 0.7, 0.92, 1]) {
      const audit = await page.evaluate(async (nextRatio) => {
        const list = document.querySelector('#promptList');
        const target = Math.round((list.scrollHeight - list.clientHeight) * nextRatio);
        list.scrollTop = target;
        list.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const cards = [...list.querySelectorAll('.prompt-card:not(.prompt-skeleton)')];
        const listRect = list.getBoundingClientRect();
        const visible = cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.bottom > listRect.top && rect.top < listRect.bottom;
        }).length;
        return {
          target,
          scrollTop: list.scrollTop,
          cardCount: cards.length,
          visible,
          virtual: list.dataset.virtual
        };
      }, ratio);
      assert(audit.virtual === '1', `${browserName}: prompt repository should remain virtualized: ${JSON.stringify(audit)}`);
      assert(audit.visible > 0, `${browserName}: prompt repository viewport must never become an empty spacer: ${JSON.stringify(audit)}`);
      assert(audit.cardCount <= 60, `${browserName}: prompt repository virtual DOM should stay bounded: ${JSON.stringify(audit)}`);
      assert(Math.abs(audit.scrollTop - audit.target) <= 2, `${browserName}: prompt repository virtual rerender should preserve scroll position: ${JSON.stringify(audit)}`);
    }
    await page.evaluate(() => {
      const list = document.querySelector('#promptList');
      window.__promptResizeAudit = { maxCards: list.querySelectorAll('.prompt-card').length, longTasks: [] };
      const mutationObserver = new MutationObserver(() => {
        window.__promptResizeAudit.maxCards = Math.max(
          window.__promptResizeAudit.maxCards,
          list.querySelectorAll('.prompt-card').length
        );
      });
      mutationObserver.observe(list, { childList: true, subtree: true });
      window.__promptResizeAudit.disconnect = () => mutationObserver.disconnect();
      if (typeof PerformanceObserver === 'function') {
        try {
          const longTaskObserver = new PerformanceObserver((entries) => {
            window.__promptResizeAudit.longTasks.push(...entries.getEntries().map((entry) => entry.duration));
          });
          longTaskObserver.observe({ type: 'longtask' });
          const oldDisconnect = window.__promptResizeAudit.disconnect;
          window.__promptResizeAudit.disconnect = () => {
            oldDisconnect();
            longTaskObserver.disconnect();
          };
        } catch {}
      }
    });
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(120);
    }
    const resizeAudit = await page.evaluate(() => {
      window.__promptResizeAudit.disconnect?.();
      return {
        maxCards: window.__promptResizeAudit.maxCards,
        maxLongTask: Math.max(0, ...window.__promptResizeAudit.longTasks)
      };
    });
    assert(resizeAudit.maxCards <= 60, `${browserName}: prompt resize must never fall back to full DOM: ${JSON.stringify(resizeAudit)}`);
    assert(resizeAudit.maxLongTask < 100, `${browserName}: prompt resize should avoid severe main-thread stalls: ${JSON.stringify(resizeAudit)}`);
    assert(errors.length === 0, `${browserName}: unexpected prompt virtualization browser errors: ${errors.join(' | ')}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  log(`BASE_URL=${BASE_URL}`);
  log('TEST_USER=<provided>');
  log('TEST_PASS=<hidden>');

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  try {
    await step('login + /admin', () => smokeLoginAndAdmin(browser));
    await step('Gallery + Agent', () => smokeGalleryAndAgent(browser));
    await step('/prompts', () => smokePrompts(browser));
    await step('mobile base layout', () => smokeMobileLayout(browser));
  } finally {
    await browser.close();
  }
  await step('Firefox Agent layout', () => smokeFirefoxAgentLayout());
  await step('Chromium modal keyboard 390/768', () => smokeModalKeyboardMatrix(chromium, 'Chromium'));
  await step('Firefox modal keyboard 390/768', () => smokeModalKeyboardMatrix(firefox, 'Firefox'));
  await step('Chromium gallery virtualization scroll', () => smokeGalleryVirtualScroll(chromium, 'Chromium'));
  await step('Firefox gallery virtualization scroll', () => smokeGalleryVirtualScroll(firefox, 'Firefox'));
  await step('Chromium prompt virtualization 500 cards', () => smokePromptVirtualization(chromium, 'Chromium'));
  await step('Firefox prompt virtualization 500 cards', () => smokePromptVirtualization(firefox, 'Firefox'));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    process.exitCode = 1;
    console.error(JSON.stringify(results, null, 2));
  } else {
    log(`All ${results.length} quality smoke checks passed.`);
  }
})().catch((error) => {
  console.error(`[quality] ERROR ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});

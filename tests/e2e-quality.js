/*
 * NexGen end-to-end quality smoke tests.
 * Run with:
 *   $env:BASE_URL='https://gpt-image2-bg5.pages.dev'; $env:TEST_USER='a691466166'; $env:TEST_PASS='<hidden>'
 *   npx --yes --package playwright node tests/e2e-quality.js
 */
const { chromium, devices } = require('playwright');

const DEFAULT_BASE_URL = 'https://gpt-image2-bg5.pages.dev';
const BASE_URL = normalizeBaseUrl(process.env.BASE_URL || DEFAULT_BASE_URL);
const TEST_USER = process.env.TEST_USER || 'a691466166';
const TEST_PASS = process.env.TEST_PASS || '';
if (!TEST_PASS) {
  console.error('[quality] ERROR TEST_PASS is required and will not be stored in source.');
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
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 401 probes during unauthenticated redirects are expected before login on protected pages.
    if (/\b401\b/.test(text) && /api\/auth\/me|img-runtime-config/.test(text)) return;
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

(async () => {
  log(`BASE_URL=${BASE_URL}`);
  log(`TEST_USER=${TEST_USER}`);
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

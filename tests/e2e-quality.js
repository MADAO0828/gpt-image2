/*
 * GPT Image2 end-to-end quality smoke tests.
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
  const rootEmpty = await page.locator('#root').evaluate((el) => !el || !el.textContent.trim()).catch(() => false);
  assert(!rootEmpty, 'React root should not be empty');
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

  await expectVisibleByText(page, ['画廊', 'Gallery'], { timeout: 15000 });
  await clickMode(page, ['画廊', 'Gallery']);
  await assertNoRuntimeRecovery(page);
  assert(await page.locator('textarea, [contenteditable="true"], input').first().isVisible().catch(() => false), 'gallery should expose a prompt/input surface');

  await clickMode(page, ['Agent']);
  await assertNoRuntimeRecovery(page);
  await expectVisibleByText(page, ['Agent'], { timeout: 10000 });
  const agentInputVisible = await page.locator('.agent-chat-inputbar [contenteditable="true"], [contenteditable="true"], textarea').first().isVisible().catch(() => false);
  assert(agentInputVisible, 'Agent should expose an input surface');
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

  await page.goto(absolutePath('/prompts'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  const promptsOverflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  assert(promptsOverflow <= 24, `mobile prompts should not horizontally overflow; overflow=${promptsOverflow}px`);
  assert(await page.locator('#s').isVisible(), 'mobile prompts search input should be visible');

  await page.goto(absolutePath('/admin'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  const adminOverflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  assert(adminOverflow <= 32, `mobile admin should not horizontally overflow; overflow=${adminOverflow}px`);
  await expectVisibleByText(page, ['后台', 'API', 'Agent', '设置'], { timeout: 10000 });

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
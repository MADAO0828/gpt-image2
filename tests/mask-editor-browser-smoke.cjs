/*
 * Firefox-only reference-image mask editor smoke test.
 * Run with BASE_URL, TEST_USER, and TEST_PASS supplied by the caller:
 *   npx --yes --package playwright node tests/mask-editor-browser-smoke.cjs
 */
const { firefox } = require('playwright');

const rawBaseUrl = process.env.BASE_URL || '';
const TEST_USER = process.env.TEST_USER || '';
const TEST_PASS = process.env.TEST_PASS || '';

if (!rawBaseUrl || !TEST_USER || !TEST_PASS) {
  console.error('[mask-smoke] ERROR BASE_URL, TEST_USER, and TEST_PASS are required.');
  process.exit(2);
}

let BASE_URL;
let BASE_ORIGIN;
try {
  const parsed = new URL(rawBaseUrl);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('unsupported protocol');
  BASE_URL = parsed.toString().replace(/\/$/, '');
  BASE_ORIGIN = parsed.origin;
} catch (_) {
  console.error('[mask-smoke] ERROR BASE_URL must be an http(s) URL.');
  process.exit(2);
}

const HEADLESS = !/^(0|false|no)$/i.test(process.env.HEADLESS || '1');
const TIMEOUT = Number(process.env.PW_TIMEOUT || 45000);
const EDIT_INSTRUCTION = 'Keep the QA badge unchanged while editing the marked area.';
const REFERENCE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAgUlEQVR42u3YsRUAEBBEwetFYWpSp0gipQNibgLhBSb6b6OPuU6v1HZ8r98HAAAAAAAAkBjg9w/e7gEAAAAAAIDMAEoQAAAAAAAAsAcoQQAAAAAAAMAeoAQBAAAAAAAAe4ASBAAAAAAAAOwBShAAAAAAAACwByhBAAAAAAAA4DuADc4BGsIDGlONAAAAAElFTkSuQmCC',
  'base64'
);

function absolutePath(requestPath) {
  return `${BASE_URL}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertReferencePngBuffer(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(buffer.length >= signature.length + 12, 'reference PNG fixture is too short');
  assert(buffer.subarray(0, signature.length).equals(signature), 'reference PNG fixture has an invalid signature');

  let offset = signature.length;
  let sawIhdr = false;
  let sawIend = false;
  while (offset < buffer.length) {
    assert(offset + 12 <= buffer.length, 'reference PNG fixture has a truncated chunk header');
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    assert(end <= buffer.length, `reference PNG fixture has a truncated ${type} chunk`);

    if (type === 'IHDR') {
      assert(offset === signature.length && length === 13, 'reference PNG fixture has an invalid IHDR');
      const width = buffer.readUInt32BE(offset + 8);
      const height = buffer.readUInt32BE(offset + 12);
      assert(width >= 64 && height >= 64, `reference PNG fixture is too small: ${width}x${height}`);
      sawIhdr = true;
    }
    if (type === 'IEND') {
      assert(length === 0 && end === buffer.length, 'reference PNG fixture has an invalid IEND');
      sawIend = true;
    }
    offset = end;
  }
  assert(sawIhdr && sawIend, 'reference PNG fixture is missing IHDR or IEND');
}

assertReferencePngBuffer(REFERENCE_PNG_BUFFER);

function redact(value) {
  let text = String(value || '');
  for (const secret of [rawBaseUrl, BASE_URL, TEST_USER, TEST_PASS]) {
    if (secret) text = text.split(secret).join('<redacted>');
  }
  return text;
}

async function waitForSettled(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT });
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch (_) {
    // A local page may keep a background probe open; DOM readiness is enough here.
  }
}

function attachDiagnostics(page) {
  const errors = [];
  let unauthenticated = true;
  let rumErrorAt = 0;
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (unauthenticated && /\b401\b/.test(text) && /api\/auth\/me|img-runtime-config/.test(text)) return;
    if (/cloudflareinsights\.com\/cdn-cgi\/rum/i.test(text)) {
      rumErrorAt = Date.now();
      return;
    }
    if (/^Failed to load resource: net::ERR_FAILED$/i.test(text) && Date.now() - rumErrorAt < 1000) return;
    errors.push(`console error: ${text}`);
  });
  page.on('dialog', async (dialog) => {
    errors.push(`native dialog opened: ${dialog.type()}`);
    await dialog.dismiss().catch(() => {});
  });
  return {
    errors,
    markAuthenticated() {
      unauthenticated = false;
    }
  };
}

async function loginViaUi(page) {
  await page.goto(absolutePath('/login'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await waitForSettled(page);
  await page.locator('#u').fill(TEST_USER);
  await page.locator('#p').fill(TEST_PASS);
  await Promise.all([
    page.waitForURL((url) => !/\/login(?:[#?].*)?$/.test(url.pathname + url.search + url.hash), { timeout: TIMEOUT }),
    page.locator('#submitBtn').click(),
  ]);
  await waitForSettled(page);
  assert(!/\/login(?:[#?].*)?$/.test(page.url()), 'login should leave the login page');
}

async function openReferenceEditor(page, index) {
  const reference = page.locator('.ref-thumb').nth(index);
  await reference.waitFor({ state: 'visible', timeout: TIMEOUT });
  await reference.locator('img[data-action="open-mask-editor"]').click();
  const confirmDialog = page.locator('[data-modal-key="confirm-dialog"]');
  const editor = page.locator('[data-modal-key="mask-editor"]');
  const opened = await Promise.race([
    confirmDialog.waitFor({ state: 'visible', timeout: TIMEOUT }).then(() => 'confirm'),
    editor.waitFor({ state: 'visible', timeout: TIMEOUT }).then(() => 'editor'),
  ]);
  if (opened === 'confirm') {
    await confirmDialog.locator('[data-action="confirm-dialog"]').click();
    await editor.waitFor({ state: 'visible', timeout: TIMEOUT });
  }
  await page.waitForFunction(() => {
    const editor = document.querySelector('[data-modal-key="mask-editor"]');
    const shell = editor?.querySelector('.mask-canvas-shell');
    const canvas = editor?.querySelector('#maskCanvas');
    const editorReady = editor?.getAttribute('data-mask-ready') === '1'
      && editor?.getAttribute('data-mask-status') === 'ready';
    const shellReady = shell?.getAttribute('data-mask-ready') === '1'
      && shell?.getAttribute('data-mask-status') === 'ready';
    return editorReady && shellReady && !!canvas && canvas.width > 0 && canvas.height > 0;
  }, undefined, { timeout: TIMEOUT });
}

async function closeReferenceEditor(page) {
  await page.locator('[data-modal-key="mask-editor"] [data-action="cancel-mask-editor"]').click();
  await page.locator('[data-modal-key="mask-editor"]').waitFor({ state: 'detached', timeout: TIMEOUT });
}

async function uploadFixture(page, expectedCount) {
  const input = page.locator('#refFileInput');
  await input.waitFor({ state: 'attached', timeout: TIMEOUT });
  await input.setInputFiles({
    name: `qa-reference-${expectedCount}.png`,
    mimeType: 'image/png',
    buffer: REFERENCE_PNG_BUFFER,
  });
  await page.waitForFunction(
    (count) => document.querySelectorAll('.ref-thumb').length === count,
    expectedCount,
    { timeout: TIMEOUT }
  );
}

async function assertMarkedReferenceAfterReload(page) {
  const rails = page.locator('[data-modal-key="mask-editor"] .mask-refs');
  await rails.waitFor({ state: 'visible', timeout: TIMEOUT });
  assert(await page.locator('[data-modal-key="mask-editor"] .mask-ref').count() === 2, 'mask editor rail should contain both references');
  const editedReference = page.locator('[data-modal-key="mask-editor"] .mask-ref').nth(1);
  await editedReference.locator('.mask-ref-status').waitFor({ state: 'visible', timeout: TIMEOUT });
  const instruction = await page.locator('textarea[data-action="mask-edit-instruction"]').inputValue();
  assert(instruction === EDIT_INSTRUCTION, 'edited reference instruction should survive reload');
}

async function main() {
  const browser = await firefox.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  });
  let unexpectedExternalRequest = false;
  let unexpectedLocalPost = false;
  await context.route('**/*', async (route) => {
    const request = route.request();
    let url;
    try {
      url = new URL(request.url());
    } catch (_) {
      await route.continue();
      return;
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.origin !== BASE_ORIGIN) {
        if (!/cloudflareinsights\.com$/i.test(url.hostname)) unexpectedExternalRequest = true;
        await route.abort();
        return;
      }
      if (request.method() === 'POST' && url.pathname !== '/api/auth/login') {
        unexpectedLocalPost = true;
        await route.abort();
        return;
      }
    }
    await route.continue();
  });

  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page);
  try {
    await loginViaUi(page);
    diagnostics.markAuthenticated();
    await page.goto(absolutePath('/'), { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await waitForSettled(page);
    await page.locator('#refFileInput').waitFor({ state: 'attached', timeout: TIMEOUT });

    await uploadFixture(page, 1);
    await openReferenceEditor(page, 0);
    assert(await page.locator('[data-modal-key="mask-editor"] .mask-refs').count() === 0, 'single reference should not show the multi-reference rail');
    await closeReferenceEditor(page);

    await uploadFixture(page, 2);
    const promptInput = page.locator('#promptInput');
    const mentionMenu = page.locator('#composerMentionMenuMount .composer-mention-menu');
    const mentionOptionSelector = '#composerMentionMenuMount .composer-mention-menu [data-action="select-reference-mention"]';
    const readMentionLabels = async () => {
      const entries = await page.locator(mentionOptionSelector).evaluateAll((nodes) => nodes.map((node) => ({
        label: node.querySelector('span')?.textContent?.trim() || '',
        visible: node.getClientRects().length > 0,
      })));
      assert(entries.length === 2, `reference mention menu should contain two options, got ${entries.length}`);
      assert(entries.every((entry) => entry.visible), 'reference mention options should be visible');
      return entries.map((entry) => entry.label);
    };

    await promptInput.fill('@');
    await mentionMenu.waitFor({ state: 'visible', timeout: TIMEOUT });
    const initialMentionLabels = await readMentionLabels();
    assert(initialMentionLabels.join('|') === '@图1|@图2', `reference mention labels should be @图1/@图2, got ${initialMentionLabels.join('|')}`);
    await page.locator(mentionOptionSelector).nth(1).click();
    assert(await promptInput.inputValue() === '@图2', 'selecting the @图2 mention should update the main composer');

    await promptInput.pressSequentially(' @');
    await mentionMenu.waitFor({ state: 'visible', timeout: TIMEOUT });
    const secondMentionLabels = await readMentionLabels();
    assert(secondMentionLabels.join('|') === '@图1|@图2', `reference mention labels should remain @图1/@图2, got ${secondMentionLabels.join('|')}`);
    await page.locator(mentionOptionSelector).nth(0).click();
    assert(await promptInput.inputValue() === '@图2 @图1', 'selecting @图1 after @图2 should keep both visible mentions in the composer');

    await openReferenceEditor(page, 1);
    const editor = page.locator('[data-modal-key="mask-editor"]');
    assert(await editor.locator('.mask-refs').isVisible(), 'multi-reference rail should be visible with two references');
    assert(await editor.locator('.mask-ref').count() === 2, 'multi-reference rail should contain two references');
    const maskRailEntries = await editor.locator('.mask-ref-number').evaluateAll((nodes) => nodes.map((node) => ({
      label: node.textContent?.trim() || '',
      visible: node.getClientRects().length > 0,
    })));
    assert(maskRailEntries.length === 2 && maskRailEntries.every((entry) => entry.visible), 'mask editor rail should visibly show both reference numbers');
    const maskRailLabels = maskRailEntries.map((entry) => entry.label);
    assert(maskRailLabels.join('|') === '图1|图2', `mask editor rail labels should be 图1/图2, got ${maskRailLabels.join('|')}`);
    assert(initialMentionLabels.map((label) => label.slice(1)).join('|') === maskRailLabels.join('|'), 'mask rail numbering should correspond to composer mention numbering');
    assert(await editor.locator('.mask-topbar').count() === 0, 'mask editor should not render a top header');

    const brush = editor.locator('.mask-tool-row [data-action="mask-tool"][data-tool="brush"]');
    assert((await brush.getAttribute('class') || '').split(/\s+/).includes('active'), 'brush should be the default active tool');
    assert(await editor.locator('.mask-draw-options').isVisible(), 'default brush options should be visible');
    assert(await editor.locator('.mask-draw-colors .color-button').count() > 0, 'brush color options should be visible');
    assert(await editor.locator('.mask-size-slider').isVisible(), 'brush size control should be visible');

    const rowOverflow = await editor.locator('.mask-tool-row').evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      overflowX: getComputedStyle(node).overflowX,
    }));
    assert(rowOverflow.overflowX === 'auto' || rowOverflow.overflowX === 'scroll', 'tool row should allow horizontal overflow');
    assert(rowOverflow.scrollWidth > rowOverflow.clientWidth + 1, 'tool row should overflow horizontally at 390px');

    await editor.locator('.mask-tool-row [data-action="mask-tool"][data-tool="rect"]').click();
    await page.waitForFunction(() => document.querySelector('[data-modal-key="mask-editor"] [data-action="mask-tool"][data-tool="rect"]')?.classList.contains('active'), undefined, { timeout: TIMEOUT });
    assert(!(await page.locator('[data-modal-key="mask-editor"] .mask-draw-options').isVisible().catch(() => false)), 'rectangular tool should hide brush options');

    const canvas = page.locator('#maskCanvas');
    const box = await canvas.boundingBox();
    assert(box && box.width > 30 && box.height > 30, 'mask canvas should be large enough for a rectangle');
    const startX = box.x + box.width * 0.30;
    const startY = box.y + box.height * 0.30;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.48, { steps: 3 });
    await page.mouse.up();
    const painted = await canvas.evaluate((node) => {
      const context = node.getContext('2d');
      if (!context) return false;
      const pixels = context.getImageData(0, 0, node.width, node.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) return true;
      }
      return false;
    });
    assert(painted, 'rectangle drawing should paint the mask canvas');

    const instructionInput = page.locator('textarea[data-action="mask-edit-instruction"]');
    await instructionInput.fill(EDIT_INSTRUCTION);
    assert(await instructionInput.inputValue() === EDIT_INSTRUCTION, 'per-image edit instruction should be editable');
    await editor.locator('[data-action="save-mask-editor"]').click();
    await editor.waitFor({ state: 'detached', timeout: TIMEOUT });

    const savedState = await page.evaluate(() => {
      const refs = window.__homepageV3TestHooks?.getTestState?.().references || [];
      const ref = refs[1] || {};
      return { marked: !!(ref.maskBlobId || ref.annotationBlobId), instruction: ref.editInstruction || '' };
    });
    assert(savedState.marked, 'saved reference should have a mask or annotation blob');
    assert(savedState.instruction === EDIT_INSTRUCTION, 'saved reference instruction should be persisted');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await waitForSettled(page);
    await page.locator('.ref-thumb').nth(1).waitFor({ state: 'visible', timeout: TIMEOUT });
    await openReferenceEditor(page, 1);
    await assertMarkedReferenceAfterReload(page);

    assert(!unexpectedExternalRequest, 'unexpected external network request was blocked');
    assert(!unexpectedLocalPost, 'unexpected local POST request was blocked');
    assert(diagnostics.errors.length === 0, `unexpected browser errors: ${diagnostics.errors.join(' | ')}`);
    console.log('[mask-smoke] PASS Firefox reference mask editor smoke');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`[mask-smoke] FAIL ${redact(error && error.message ? error.message : error)}`);
  process.exitCode = 1;
});

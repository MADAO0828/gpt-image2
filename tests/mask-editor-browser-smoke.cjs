/*
 * Firefox-only reference-image mask editor smoke test.
 * Run with BASE_URL, TEST_USER, and TEST_PASS supplied by the caller:
 *   npx --yes --package playwright node tests/mask-editor-browser-smoke.cjs
 */
const { firefox } = require('playwright');
const zlib = require('zlib');

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
const MASK_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const REFERENCE_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAgUlEQVR42u3YsRUAEBBEwetFYWpSp0gipQNibgLhBSb6b6OPuU6v1HZ8r98HAAAAAAAAkBjg9w/e7gEAAAAAAIDMAEoQAAAAAAAAsAcoQQAAAAAAAMAeoAQBAAAAAAAAe4ASBAAAAAAAAOwBShAAAAAAAACwByhBAAAAAAAA4DuADc4BGsIDGlONAAAAAElFTkSuQmCC',
  'base64'
);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function makeSolidPng(width, height, rgba = [96, 165, 250, 255]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(width * 4);
  for (let x = 0; x < width; x += 1) {
    rgba.forEach((value, channel) => { row[x * 4 + channel] = value; });
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), row])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const NON_SQUARE_REFERENCE_PNG_BUFFER = makeSolidPng(96, 64);

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
  let dimensions = null;
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
      dimensions = { width, height };
      sawIhdr = true;
    }
    if (type === 'IEND') {
      assert(length === 0 && end === buffer.length, 'reference PNG fixture has an invalid IEND');
      sawIend = true;
    }
    offset = end;
  }
  assert(sawIhdr && sawIend, 'reference PNG fixture is missing IHDR or IEND');
  return dimensions;
}

assertReferencePngBuffer(REFERENCE_PNG_BUFFER);
const NON_SQUARE_REFERENCE_DIMENSIONS = assertReferencePngBuffer(NON_SQUARE_REFERENCE_PNG_BUFFER);
assert(NON_SQUARE_REFERENCE_DIMENSIONS.width !== NON_SQUARE_REFERENCE_DIMENSIONS.height, 'non-square reference fixture should exercise aspect-ratio handling');

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

async function closeReferenceEditor(page, diagnostics) {
  const pageErrorCountBeforeClose = diagnostics?.errors.filter((entry) => entry.startsWith('pageerror:')).length || 0;
  await page.locator('[data-modal-key="mask-editor"] [data-action="cancel-mask-editor"]').click();
  await page.locator('[data-modal-key="mask-editor"]').waitFor({ state: 'detached', timeout: TIMEOUT });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  }));
  if (diagnostics) {
    const pageErrorCountAfterClose = diagnostics.errors.filter((entry) => entry.startsWith('pageerror:')).length;
    assert(pageErrorCountAfterClose === pageErrorCountBeforeClose, `mask editor cancel should not emit a pageerror after its next layout frame: ${diagnostics.errors.join(' | ')}`);
  }
}

async function assertMaskEditorGeometry(page, viewport) {
  const audit = await page.evaluate(() => {
    const selectors = [
      '.mask-layer', '.mask-body', '.mask-refs', '.mask-canvas-wrap',
      '.mask-canvas-shell', '.mask-tool-row', '.mask-toolbar-compose',
      '.mask-draw-options', '.mask-crop-actions', '.mask-editor-prompt'
    ];
    const rects = Object.fromEntries(selectors.map((selector) => {
      const node = document.querySelector(selector);
      if (!node) return [selector, null];
      const rect = node.getBoundingClientRect();
      return [selector, {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        visible: node.getClientRects().length > 0,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth
      }];
    }));
    const canvas = document.querySelector('#maskCanvas');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      rects
    };
  });
  assert(Math.abs(audit.viewport.width - viewport.width) <= 1 && Math.abs(audit.viewport.height - viewport.height) <= 1, `mask viewport should be ${viewport.width}x${viewport.height}: ${JSON.stringify(audit)}`);
  assert(audit.horizontalOverflow <= 2, `mask editor should not create page horizontal overflow at ${viewport.width}x${viewport.height}: ${JSON.stringify(audit)}`);
  assert(audit.canvas && audit.canvas.width > 30 && audit.canvas.height > 30, `mask canvas should remain usable at ${viewport.width}x${viewport.height}: ${JSON.stringify(audit)}`);
  for (const [selector, rect] of Object.entries(audit.rects)) {
    if (!rect?.visible || rect.width <= 0 || rect.height <= 0) continue;
    assert(rect.left >= -2 && rect.right <= viewport.width + 2, `${selector} should stay within ${viewport.width}px viewport: ${JSON.stringify(audit)}`);
  }
  const toolRow = audit.rects['.mask-tool-row'];
  assert(toolRow && toolRow.clientWidth > 0, `mask toolbar should remain mounted at ${viewport.width}x${viewport.height}`);
  if (viewport.width <= 390) assert(toolRow.scrollWidth >= toolRow.clientWidth, 'narrow mask toolbar should expose a contained horizontal scroll surface');
  return audit;
}

async function uploadFixture(page, expectedCount, fixture = {}) {
  const buffer = fixture.buffer || REFERENCE_PNG_BUFFER;
  const name = fixture.name || `qa-reference-${expectedCount}.png`;
  const input = page.locator('#refFileInput');
  await input.waitFor({ state: 'attached', timeout: TIMEOUT });
  await input.setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
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

    await uploadFixture(page, 1, {
      name: 'qa-reference-non-square.png',
      buffer: NON_SQUARE_REFERENCE_PNG_BUFFER,
    });
    await openReferenceEditor(page, 0);
    const singleEditor = page.locator('[data-modal-key="mask-editor"]');
    assert(await singleEditor.locator('.mask-refs').count() === 0, 'single reference should not show the multi-reference rail');
    const singleCanvasSize = await page.locator('#maskCanvas').evaluate((node) => ({ width: node.width, height: node.height }));
    assert(singleCanvasSize.width !== singleCanvasSize.height, `non-square source should preserve a non-square editor canvas: ${JSON.stringify(singleCanvasSize)}`);
    await assertMaskEditorGeometry(page, MASK_VIEWPORTS[2]);
    await singleEditor.locator('[data-action="mask-tool"][data-tool="rect"]').click();
    const canceledCanvas = page.locator('#maskCanvas');
    const canceledBox = await canceledCanvas.boundingBox();
    assert(canceledBox, 'single-reference canvas should have a drawable box before cancel');
    await page.mouse.move(canceledBox.x + canceledBox.width * 0.26, canceledBox.y + canceledBox.height * 0.26);
    await page.mouse.down();
    await page.mouse.move(canceledBox.x + canceledBox.width * 0.48, canceledBox.y + canceledBox.height * 0.48, { steps: 2 });
    await page.mouse.up();
    await closeReferenceEditor(page, diagnostics);
    const canceledState = await page.evaluate(() => {
      const ref = window.__homepageV3TestHooks?.getTestState?.().references?.[0] || {};
      return { marked: !!(ref.maskBlobId || ref.annotationBlobId), instruction: ref.editInstruction || '' };
    });
    assert(!canceledState.marked && !canceledState.instruction, 'cancel should discard an unsaved single-reference edit');
    await openReferenceEditor(page, 0);
    assert(await page.locator('[data-modal-key="mask-editor"] .mask-ref-status').count() === 0, 'reopening after cancel should not show a persisted mark');
    await closeReferenceEditor(page, diagnostics);

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
    assert(await editor.locator('[data-mask-panel="brush"]').isVisible(), 'default brush options should be visible');
    assert(await editor.locator('[data-mask-panel="brush"] .mask-draw-colors .color-button').count() > 0, 'brush color options should be visible');
    assert(await editor.locator('[data-mask-panel="brush"] .mask-size-slider').isVisible(), 'brush size control should be visible');
    const interactionLayer = editor.locator('#maskBaseCanvas');
    assert(await interactionLayer.getAttribute('data-mask-layer') === 'interaction', 'mask base canvas should be the declared pointer interaction layer');
    const defaultCursor = await editor.locator('.mask-canvas-shell').evaluate((shell) => ({
      tool: shell.dataset.maskTool,
      cursor: getComputedStyle(shell.querySelector('#maskBaseCanvas')).cursor
    }));
    assert(defaultCursor.tool === 'brush' && defaultCursor.cursor === 'crosshair', `brush cursor should be attached to #maskBaseCanvas: ${JSON.stringify(defaultCursor)}`);

    const rowOverflow = await editor.locator('.mask-tool-row').evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
      overflowX: getComputedStyle(node).overflowX,
    }));
    assert(rowOverflow.overflowX === 'auto' || rowOverflow.overflowX === 'scroll', 'tool row should allow horizontal overflow');
    assert(rowOverflow.scrollWidth > rowOverflow.clientWidth + 1, 'tool row should overflow horizontally at 390px');

    for (const viewport of MASK_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(80);
      await assertMaskEditorGeometry(page, viewport);
    }
    await page.setViewportSize(MASK_VIEWPORTS[2]);
    await page.waitForTimeout(80);

    const panelTools = ['brush', 'rect', 'ellipse', 'line', 'arrow', 'polygon'];
    const expectedPanelCursor = { brush: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', line: 'crosshair', arrow: 'crosshair', polygon: 'crosshair' };
    for (const tool of panelTools) {
      await editor.locator(`.mask-tool-row [data-action="mask-tool"][data-tool="${tool}"]`).click();
      await page.waitForFunction((value) => document.querySelector(`[data-modal-key="mask-editor"] [data-action="mask-tool"][data-tool="${value}"]`)?.classList.contains('active'), tool, { timeout: TIMEOUT });
      const panel = editor.locator(`[data-mask-panel="${tool}"]`);
      assert(await panel.isVisible(), `${tool} should show its parameter panel`);
      assert(await panel.locator('[data-action="mask-color"]').count() > 0, `${tool} panel should expose color controls`);
      assert(await panel.locator('[data-action="mask-size"]').isVisible(), `${tool} panel should expose a usable thickness control`);
      const cursor = await editor.locator('.mask-canvas-shell').evaluate((shell) => ({
        tool: shell.dataset.maskTool,
        cursor: getComputedStyle(shell.querySelector('#maskBaseCanvas')).cursor
      }));
      assert(cursor.tool === tool && cursor.cursor === expectedPanelCursor[tool], `${tool} cursor should be visible on #maskBaseCanvas: ${JSON.stringify(cursor)}`);
    }
    await editor.locator('.mask-tool-row [data-action="mask-tool"][data-tool="rect"]').click();
    await page.waitForFunction(() => document.querySelector('[data-modal-key="mask-editor"] [data-action="mask-tool"][data-tool="rect"]')?.classList.contains('active'), undefined, { timeout: TIMEOUT });
    const rectPanel = editor.locator('[data-mask-panel="rect"]');
    assert(await rectPanel.isVisible(), 'rect tool should keep its parameter panel visible after reselecting it');
    await rectPanel.locator('[data-action="mask-color"]').nth(1).click();
    await rectPanel.locator('[data-action="mask-size"]').evaluate((node) => {
      node.value = '24';
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const rectPanelState = await page.evaluate(() => {
      const panel = document.querySelector('[data-modal-key="mask-editor"] [data-mask-panel="rect"]');
      return {
        color: panel?.querySelector('[data-action="mask-color"].active')?.dataset?.color || '',
        brushSize: Number(panel?.querySelector('[data-action="mask-size"]')?.value || 0)
      };
    });
    assert(rectPanelState.color !== '#ef4444' && rectPanelState.brushSize === 24, `rect controls should update editor state: ${JSON.stringify(rectPanelState)}`);

    for (const tool of ['move', 'text', 'fill', 'crop']) {
      await editor.locator(`.mask-tool-row [data-action="mask-tool"][data-tool="${tool}"]`).click();
      await page.waitForFunction((value) => document.querySelector(`[data-modal-key="mask-editor"] [data-action="mask-tool"][data-tool="${value}"]`)?.classList.contains('active'), tool, { timeout: TIMEOUT });
      assert(await editor.locator('.mask-tool-options:visible').count() === 0, `${tool} should not show a shape/brush parameter panel`);
    }

    await editor.locator('.mask-tool-row [data-action="mask-tool"][data-tool="polygon"]').click();
    await page.waitForFunction(() => document.querySelector('[data-modal-key="mask-editor"] [data-action="mask-tool"][data-tool="polygon"]')?.classList.contains('active'), undefined, { timeout: TIMEOUT });
    assert(await editor.locator('[data-mask-panel="polygon"]').isVisible(), 'polygon tool should show its own parameter panel');

    const canvas = page.locator('#maskCanvas');
    const box = await interactionLayer.boundingBox();
    assert(box && box.width > 30 && box.height > 30, 'mask canvas should be large enough for a polygon');
    const polygonPoints = [
      [box.x + box.width * 0.26, box.y + box.height * 0.28],
      [box.x + box.width * 0.74, box.y + box.height * 0.32],
      [box.x + box.width * 0.52, box.y + box.height * 0.74]
    ];
    await page.mouse.click(...polygonPoints[0]);
    await page.mouse.click(...polygonPoints[1]);
    await page.mouse.click(...polygonPoints[2]);
    await page.mouse.click(...polygonPoints[0]);
    const painted = await canvas.evaluate((node) => {
      const context = node.getContext('2d');
      if (!context) return false;
      const pixels = context.getImageData(0, 0, node.width, node.height).data;
      const center = ((Math.floor(node.height * 0.45) * node.width) + Math.floor(node.width * 0.50)) * 4 + 3;
      return pixels[center] > 0;
    });
    assert(painted, 'closed polygon drawing should paint its interior into the target mask canvas');

    const transformBeforeWheel = await page.locator('.mask-canvas-shell').evaluate((node) => node.style.transform);
    await page.mouse.move(box.x + box.width * 0.50, box.y + box.height * 0.45);
    await page.mouse.wheel(0, -260);
    await page.waitForTimeout(60);
    const transformAfterWheel = await page.locator('.mask-canvas-shell').evaluate((node) => node.style.transform);
    const scaleMatch = transformAfterWheel.match(/scale\(([-+]?(?:\d+\.?\d*|\.\d+))\)/);
    const wheelScale = scaleMatch ? Number(scaleMatch[1]) : NaN;
    assert(transformAfterWheel !== transformBeforeWheel && Number.isFinite(wheelScale) && Math.abs(wheelScale - 1) > 0.001, `wheel should zoom the mask canvas: ${transformBeforeWheel} -> ${transformAfterWheel}`);
    await editor.locator('[data-action="mask-center"]').click();
    await page.waitForTimeout(40);
    const centeredTransform = await page.locator('.mask-canvas-shell').evaluate((node) => node.style.transform);
    const centeredScaleMatch = centeredTransform.match(/scale\(([-+]?(?:\d+\.?\d*|\.\d+))\)/);
    const centeredScale = centeredScaleMatch ? Number(centeredScaleMatch[1]) : NaN;
    const centeredShellBox = await page.locator('.mask-canvas-shell').boundingBox();
    const centeredWrapContent = await page.evaluate(() => {
      const wrap = document.querySelector('.mask-canvas-wrap');
      if (!wrap) return null;
      const rect = wrap.getBoundingClientRect();
      const style = getComputedStyle(wrap);
      const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(style.paddingRight) || 0;
      const paddingTop = Number.parseFloat(style.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
      return {
        left: rect.left + paddingLeft,
        right: rect.right - paddingRight,
        top: rect.top + paddingTop,
        bottom: rect.bottom - paddingBottom
      };
    });
    assert(centeredShellBox && centeredWrapContent && Number.isFinite(centeredScale), `center should keep a measurable mask viewport: ${centeredTransform}`);
    const shellCenter = {
      x: centeredShellBox.x + centeredShellBox.width / 2,
      y: centeredShellBox.y + centeredShellBox.height / 2
    };
    const contentCenter = {
      x: (centeredWrapContent.left + centeredWrapContent.right) / 2,
      y: (centeredWrapContent.top + centeredWrapContent.bottom) / 2
    };
    const centerError = Math.max(Math.abs(shellCenter.x - contentCenter.x), Math.abs(shellCenter.y - contentCenter.y));
    assert(centerError <= 3 && Math.abs(centeredScale - wheelScale) <= 0.001, `center should center the mask shell without changing zoom: ${centeredTransform}; center error ${centerError.toFixed(2)}px; wheel scale ${wheelScale}; centered scale ${centeredScale}`);

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
    await assertMaskEditorGeometry(page, MASK_VIEWPORTS[2]);
    await closeReferenceEditor(page, diagnostics);

    await page.evaluate(() => {
      const hooks = window.__homepageV3TestHooks;
      const reference = hooks.getTestState?.().references?.[1];
      if (!reference) throw new Error('saved reference is unavailable for Agent thumbnail smoke');
      hooks.setTestState({
        mode: 'agent',
        agent: {
          attachments: [{
            id: 'agent-mask-thumb-1',
            kind: 'image',
            type: reference.type || 'image/png',
            name: reference.name || 'agent-reference.png',
            blobId: reference.blobId,
            originalBlobId: reference.originalBlobId || reference.blobId,
            compositedBlobId: reference.compositedBlobId || reference.blobId,
            maskBlobId: reference.maskBlobId || '',
            annotationBlobId: reference.annotationBlobId || '',
            editInstruction: reference.editInstruction || ''
          }]
        }
      });
      hooks.render();
    });
    const agentThumb = page.locator('.agent-image-attachment-thumb img[data-action="open-agent-attachment-mask-editor"]');
    await agentThumb.waitFor({ state: 'visible', timeout: TIMEOUT });
    const agentThumbRect = await agentThumb.boundingBox();
    assert(agentThumbRect && agentThumbRect.width > 20 && agentThumbRect.height > 20, 'Agent image attachment should render a usable thumbnail');
    assert(agentThumbRect.x >= -2 && agentThumbRect.x + agentThumbRect.width <= MASK_VIEWPORTS[2].width + 2, `Agent thumbnail should stay inside the mobile viewport: ${JSON.stringify(agentThumbRect)}`);
    await agentThumb.click();
    await page.locator('[data-modal-key="mask-editor"]').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.waitForFunction(() => document.querySelector('[data-modal-key="mask-editor"]')?.getAttribute('data-mask-status') === 'ready', undefined, { timeout: TIMEOUT });
    await assertMaskEditorGeometry(page, MASK_VIEWPORTS[2]);
    await closeReferenceEditor(page, diagnostics);

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

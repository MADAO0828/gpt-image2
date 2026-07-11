import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../tests/node_modules/playwright');

const BASE_URL = String(process.env.BASE_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '');
const TEST_USER = process.env.TEST_USER || '';
const TEST_PASS = process.env.TEST_PASS || '';
const EXPECTED_PROMPT_TOTAL = Number(process.env.EXPECTED_PROMPT_TOTAL || 10311);
const EXPECTED_ASSET_VERSION = process.env.EXPECTED_ASSET_VERSION || 'home-v3-20260711-viewer-layout-r91';

if (!TEST_USER || !TEST_PASS) {
  console.error('[api-smoke] TEST_USER and TEST_PASS are required and must be provided via environment variables.');
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const browser = await chromium.launch({ headless: !/^(0|false|no)$/i.test(process.env.HEADLESS || '1') });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('#u').fill(TEST_USER);
    await page.locator('#p').fill(TEST_PASS);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(?:[#?].*)?$/, { timeout: 45000 }).catch(async () => {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    });

    const result = await page.evaluate(async ({ expectedVersion }) => {
      const get = async (url) => {
        const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { ok: res.ok, status: res.status, data };
      };

      const html = await fetch('/', { credentials: 'same-origin', cache: 'no-store' }).then((res) => res.text());
      const runtime = await get('/.well-known/img-runtime-config.json');
      const categories = await get('/api/prompts?categories=1');
      const chinese = await get('/api/prompts?page=1&limit=10&q=' + encodeURIComponent('人像'));
      const me = await get('/api/auth/me');

      return {
        versionOk: html.includes(expectedVersion),
        runtimeOk: runtime.ok,
        meOk: me.ok,
        profileCount: Array.isArray(runtime.data?.profiles) ? runtime.data.profiles.length : 0,
        categoriesOk: categories.ok,
        total: categories.data?.total,
        categoryCount: Array.isArray(categories.data?.categories) ? categories.data.categories.length : 0,
        thinkAiCount: Array.isArray(categories.data?.categories) ? categories.data.categories.filter((cat) => /thinkai/i.test(cat)).length : 0,
        chineseOk: chinese.ok,
        chineseCount: Array.isArray(chinese.data?.prompts) ? chinese.data.prompts.length : 0
      };
    }, { expectedVersion: EXPECTED_ASSET_VERSION });

    assert(result.versionOk, `index.html should load ${EXPECTED_ASSET_VERSION}`);
    assert(result.meOk, '/api/auth/me should succeed after login');
    assert(result.runtimeOk, '/.well-known/img-runtime-config.json should succeed');
    assert(result.profileCount >= 1, `runtime config should expose at least one profile; got ${result.profileCount}`);
    assert(result.categoriesOk, '/api/prompts?categories=1 should succeed');
    assert(result.total === EXPECTED_PROMPT_TOTAL, `prompt total should be ${EXPECTED_PROMPT_TOTAL}; got ${result.total}`);
    assert(result.categoryCount >= 20, `prompt category count should be >=20; got ${result.categoryCount}`);
    assert(result.thinkAiCount >= 1, `ThinkAI categories should be present; got ${result.thinkAiCount}`);
    assert(result.chineseOk, 'Chinese prompt search should succeed');
    assert(result.chineseCount >= 1, `Chinese prompt search should return results; got ${result.chineseCount}`);

    console.log('[api-smoke] runtime API smoke passed');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[api-smoke] FAILED ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});


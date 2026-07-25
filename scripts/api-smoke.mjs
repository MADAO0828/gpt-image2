import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const BASE_URL = String(process.env.BASE_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '');
const TEST_USER = process.env.TEST_USER || '';
const TEST_PASS = process.env.TEST_PASS || '';
const EXPECTED_PROMPT_TOTAL = Number(process.env.EXPECTED_PROMPT_TOTAL || 10311);
const LOCAL_INDEX_PATH = fileURLToPath(new URL('../index.html', import.meta.url));
const HOME_V3_MARKER_SOURCE = 'home-v3-[A-Za-z0-9-]+';
const HOME_V3_MARKER = new RegExp(HOME_V3_MARKER_SOURCE, 'g');

export function extractHomeV3AssetVersion(indexHtml, sourceLabel = 'index.html') {
  const versions = [...String(indexHtml || '').matchAll(HOME_V3_MARKER)]
    .map(([version]) => version)
    .filter((version, index, all) => all.indexOf(version) === index);
  if (versions.length !== 1) {
    const found = versions.length ? versions.join(', ') : 'none';
    throw new Error(`${sourceLabel} must contain exactly one home-v3 asset version marker; found ${found}`);
  }
  return versions[0];
}

export function assertHomeV3AssetVersion(indexHtml, expectedVersion, sourceLabel = 'index.html') {
  const actualVersion = extractHomeV3AssetVersion(indexHtml, sourceLabel);
  if (actualVersion !== expectedVersion) {
    throw new Error(`${sourceLabel} should load ${expectedVersion}; found ${actualVersion}`);
  }
  return actualVersion;
}

export function readLocalAssetVersion(indexPath = LOCAL_INDEX_PATH) {
  return extractHomeV3AssetVersion(readFileSync(indexPath, 'utf8'), indexPath);
}

export function resolveExpectedAssetVersion({
  localVersion = readLocalAssetVersion(),
  envVersion = String(process.env.EXPECTED_ASSET_VERSION || '').trim()
} = {}) {
  if (envVersion && envVersion !== localVersion) {
    throw new Error(`EXPECTED_ASSET_VERSION ${envVersion} does not match local index.html asset version ${localVersion}`);
  }
  return localVersion;
}

export const EXPECTED_ASSET_VERSION = readLocalAssetVersion();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const expectedAssetVersion = resolveExpectedAssetVersion({ localVersion: EXPECTED_ASSET_VERSION });
  const { chromium } = require('../tests/node_modules/playwright');
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

    const { homeV3Markers, ...runtimeResult } = await page.evaluate(async ({ markerSource }) => {
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
        homeV3Markers: html.match(new RegExp(markerSource, 'g')) || [],
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
    }, { markerSource: HOME_V3_MARKER_SOURCE });

    let remoteAssetVersion = null;
    let versionError = null;
    try {
      remoteAssetVersion = assertHomeV3AssetVersion(homeV3Markers.join('\n'), expectedAssetVersion, 'remote index.html');
    } catch (error) {
      versionError = error && error.message ? error.message : String(error);
    }
    const result = {
      ...runtimeResult,
      versionOk: !versionError,
      remoteAssetVersion,
      versionError
    };

    assert(result.versionOk, `index.html should load ${expectedAssetVersion}${result.versionError ? `; ${result.versionError}` : ''}`);
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

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  if (!TEST_USER || !TEST_PASS) {
    console.error('[api-smoke] TEST_USER and TEST_PASS are required and must be provided via environment variables.');
    process.exit(2);
  }
  main().catch((error) => {
    console.error(`[api-smoke] FAILED ${error && error.message ? error.message : String(error)}`);
    process.exit(1);
  });
}


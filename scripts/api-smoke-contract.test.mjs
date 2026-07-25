import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertHomeV3AssetVersion,
  EXPECTED_ASSET_VERSION,
  extractHomeV3AssetVersion,
  readLocalAssetVersion,
  resolveExpectedAssetVersion
} from './api-smoke.mjs';

const smokeScript = fileURLToPath(new URL('./api-smoke.mjs', import.meta.url));
const projectRoot = path.resolve(path.dirname(smokeScript), '..');

function runSmokeWithEnv(overrides) {
  return spawnSync(process.execPath, [smokeScript], {
    cwd: projectRoot,
    env: overrides,
    encoding: 'utf8',
    timeout: 30_000
  });
}

test('binds the runtime expected version to the current local index contract', () => {
  assert.equal(EXPECTED_ASSET_VERSION, readLocalAssetVersion());
});

test('extracts the single unique home-v3 version from index HTML', () => {
  const indexHtml = [
    '<link rel="stylesheet" href="/assets/homepage-v3.css?v=home-v3-current-r1">',
    '<script src="/assets/image-stream-runtime.js?v=home-v3-current-r1"></script>',
    '<script type="module" src="/assets/homepage-v3.js?v=home-v3-current-r1"></script>'
  ].join('\n');

  assert.equal(extractHomeV3AssetVersion(indexHtml), 'home-v3-current-r1');
});

test('rejects an index without exactly one unique home-v3 version', () => {
  assert.throws(
    () => extractHomeV3AssetVersion('<script src="/assets/homepage-v3.js"></script>'),
    /exactly one home-v3 asset version marker; found none/
  );
  assert.throws(
    () => extractHomeV3AssetVersion('home-v3-current-r1 home-v3-current-r2'),
    /exactly one home-v3 asset version marker; found home-v3-current-r1, home-v3-current-r2/
  );
});

test('requires a unique remote version that matches the local expected version', () => {
  const expectedVersion = 'home-v3-current-r1';
  const currentHtml = `<script src="/assets/homepage-v3.js?v=${expectedVersion}"></script>`;
  assert.equal(assertHomeV3AssetVersion(currentHtml, expectedVersion, 'remote index.html'), expectedVersion);
  assert.throws(
    () => assertHomeV3AssetVersion('home-v3-stale-r0', expectedVersion, 'remote index.html'),
    /remote index\.html should load home-v3-current-r1; found home-v3-stale-r0/
  );
  assert.throws(
    () => assertHomeV3AssetVersion('home-v3-current-r1 home-v3-current-r2', expectedVersion, 'remote index.html'),
    /exactly one home-v3 asset version marker; found home-v3-current-r1, home-v3-current-r2/
  );
  assert.throws(
    () => assertHomeV3AssetVersion('<html></html>', expectedVersion, 'remote index.html'),
    /exactly one home-v3 asset version marker; found none/
  );
});

test('stale environment fails the main path before Playwright while missing credentials stays exit 2', () => {
  const staleEnvironment = {
    ...process.env,
    BASE_URL: 'http://127.0.0.1:1',
    EXPECTED_ASSET_VERSION: 'home-v3-stale-r0',
    TEST_USER: 'contract-user',
    TEST_PASS: 'contract-pass'
  };
  const staleRun = runSmokeWithEnv(staleEnvironment);
  const staleOutput = `${staleRun.stdout || ''}${staleRun.stderr || ''}`;
  assert.equal(staleRun.error, undefined);
  assert.equal(staleRun.status, 1);
  assert.match(staleOutput, /^\[api-smoke\] FAILED EXPECTED_ASSET_VERSION home-v3-stale-r0 does not match local index\.html asset version home-v3-.*$/m);
  assert.doesNotMatch(staleOutput, /ECONNREFUSED|playwright/i);

  const missingCredentialsEnvironment = { ...staleEnvironment };
  delete missingCredentialsEnvironment.TEST_USER;
  delete missingCredentialsEnvironment.TEST_PASS;
  const missingCredentialsRun = runSmokeWithEnv(missingCredentialsEnvironment);
  const missingCredentialsOutput = `${missingCredentialsRun.stdout || ''}${missingCredentialsRun.stderr || ''}`;
  assert.equal(missingCredentialsRun.error, undefined);
  assert.equal(missingCredentialsRun.status, 2);
  assert.match(missingCredentialsOutput, /TEST_USER and TEST_PASS are required and must be provided via environment variables/);
});

test('keeps an explicit expected version bound to the local index contract', () => {
  assert.equal(
    resolveExpectedAssetVersion({
      localVersion: 'home-v3-current-r1',
      envVersion: 'home-v3-current-r1'
    }),
    'home-v3-current-r1'
  );
  assert.throws(
    () => resolveExpectedAssetVersion({
      localVersion: 'home-v3-current-r1',
      envVersion: 'home-v3-stale-r0'
    }),
    /EXPECTED_ASSET_VERSION home-v3-stale-r0 does not match local index\.html asset version home-v3-current-r1/
  );
});

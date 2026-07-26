#!/usr/bin/env node
// Run the project's quality checks entirely against the LOCAL deployment.
//
// scripts/deploy-quality.ps1 is the release gate, but even with
// -SkipProductionDeploy it still deploys a Cloudflare Preview and refuses to run
// on a dirty working tree, so it cannot be used for ordinary local development.
// This script runs the same underlying checks with no Cloudflare involvement and
// no git-state requirement.
//
//   node scripts/local-quality-gate.mjs                # static + node tiers
//   node scripts/local-quality-gate.mjs --tier all     # + runtime + browser
//   node scripts/local-quality-gate.mjs --tier browser
//   node scripts/local-quality-gate.mjs --list
//
// Runtime and browser tiers need a running local preview (scripts/start-local-preview.ps1)
// and, for authenticated checks, TEST_USER / TEST_PASS.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '');

const argv = process.argv.slice(2);
const listOnly = argv.includes('--list');
const bail = argv.includes('--bail');
const tierArg = (() => {
  const index = argv.indexOf('--tier');
  return index >= 0 ? String(argv[index + 1] || '') : '';
})();

const TIER_ORDER = ['static', 'node', 'runtime', 'browser'];
const selectedTiers = tierArg === 'all'
  ? TIER_ORDER
  : tierArg
    ? tierArg.split(',').map((value) => value.trim()).filter(Boolean)
    : ['static', 'node'];

const unknownTier = selectedTiers.find((tier) => !TIER_ORDER.includes(tier));
if (unknownTier) {
  console.error(`Unknown tier "${unknownTier}". Valid tiers: ${TIER_ORDER.join(', ')}, all`);
  process.exit(2);
}

// `node --check` every first-party source file, so a syntax error anywhere is
// caught before the slower suites run.
function syntaxTargets() {
  const targets = [];
  const walk = (dir, filter) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full, filter);
      } else if (filter(entry.name)) {
        targets.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  };
  const isJs = (name) => /\.(js|mjs|cjs)$/.test(name);
  walk(path.join(root, 'assets'), isJs);
  walk(path.join(root, 'functions'), isJs);
  walk(path.join(root, 'scripts'), isJs);
  walk(path.join(root, 'tests'), isJs);
  return targets.sort();
}

const CHECKS = [
  ...syntaxTargets().map((file) => ({
    tier: 'static',
    name: `syntax ${file}`,
    command: ['node', '--check', file],
  })),
  { tier: 'node', name: 'stability-checks', command: ['node', 'scripts/stability-checks.js'] },
  { tier: 'node', name: 'verify-quality-static', command: ['node', 'scripts/verify-quality-static.cjs'] },
  { tier: 'node', name: 'verify-toolbar-params', command: ['node', 'scripts/verify-toolbar-params.js'] },
  { tier: 'node', name: 'verify-backup-ui', command: ['node', 'scripts/verify-backup-ui.cjs'] },
  { tier: 'node', name: 'final-deliverable-audit', command: ['node', 'scripts/final-deliverable-audit.cjs'] },
  { tier: 'node', name: 'backup-security', command: ['node', 'scripts/backup-security.test.mjs'] },
  { tier: 'node', name: 'api-smoke-contract', command: ['node', 'scripts/api-smoke-contract.test.mjs'] },
  { tier: 'node', name: 'local-upstream-fetch', command: ['node', 'scripts/local-upstream-fetch.test.mjs'] },
  { tier: 'node', name: 'local-preview-performance', command: ['node', 'scripts/local-preview-performance.test.mjs'] },
  { tier: 'node', name: 'homepage-task-regression', command: ['node', 'tests/homepage-task-regression.js'] },
  { tier: 'node', name: 'provider-size-branching', command: ['node', 'tests/provider-size-branching.js'] },
  { tier: 'node', name: 'api-models-profile-regression', command: ['node', 'tests/api-models-profile-regression.js'] },
  { tier: 'node', name: 'google-provider-compat-regression', command: ['node', 'tests/google-provider-compat-regression.js'] },
  { tier: 'node', name: 'image-edit-request-regression', command: ['node', 'tests/image-edit-request-regression.js'] },
  { tier: 'node', name: 'image-stream-regression', command: ['node', 'tests/image-stream-regression.js'] },
  { tier: 'node', name: 'pro-workbench-provider-regression', command: ['node', 'tests/pro-workbench-provider-regression.js'] },
  { tier: 'node', name: 'local-profile-secret-preservation', command: ['node', 'tests/local-profile-secret-preservation.test.mjs'] },
  { tier: 'runtime', name: 'api-smoke', command: ['node', 'scripts/api-smoke.mjs'], needsServer: true, needsCredentials: true },
  { tier: 'browser', name: 'mask-editor-browser-smoke', command: ['node', 'tests/mask-editor-browser-smoke.cjs'], needsServer: true, needsCredentials: true },
  { tier: 'browser', name: 'e2e-quality', command: ['node', 'tests/e2e-quality.js'], needsServer: true, needsCredentials: true },
];

const planned = CHECKS.filter((check) => selectedTiers.includes(check.tier));

if (listOnly) {
  for (const tier of TIER_ORDER) {
    const items = CHECKS.filter((check) => check.tier === tier);
    if (!items.length) continue;
    console.log(`${tier} (${items.length})`);
    for (const item of items) console.log(`  ${item.name}`);
  }
  process.exit(0);
}

async function serverReachable() {
  try {
    const response = await fetch(`${BASE_URL}/api/ping`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

function run(check) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(check.command[0], check.command.slice(1), {
      cwd: root,
      env: {
        ...process.env,
        BASE_URL,
        HEADLESS: process.env.HEADLESS || '1',
        // The local server is on the loopback interface; a corporate proxy in the
        // environment would otherwise intercept and fail every request.
        NO_PROXY: '*',
        no_proxy: '*',
      },
      shell: false,
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ ok: false, ms: Date.now() - started, output: String(error.message) }));
    child.on('close', (code) => resolve({ ok: code === 0, ms: Date.now() - started, output }));
  });
}

async function main() {
  const needsServer = planned.some((check) => check.needsServer);
  const hasCredentials = !!(process.env.TEST_USER && process.env.TEST_PASS);
  let up = false;
  if (needsServer) {
    up = await serverReachable();
    if (!up) {
      console.log(`! local preview not reachable at ${BASE_URL} — runtime/browser checks will be skipped.`);
      console.log('  start it with: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-preview.ps1 -NoBrowser');
    }
    if (up && !hasCredentials) {
      console.log('! TEST_USER / TEST_PASS not set — authenticated checks will be skipped.');
    }
  }

  console.log(`local quality gate  base=${BASE_URL}  tiers=${selectedTiers.join(',')}  checks=${planned.length}`);
  const results = [];
  for (const check of planned) {
    if (check.needsServer && !up) {
      results.push({ check, status: 'skipped', reason: 'server down' });
      continue;
    }
    if (check.needsCredentials && !hasCredentials) {
      results.push({ check, status: 'skipped', reason: 'no credentials' });
      continue;
    }
    const result = await run(check);
    results.push({ check, status: result.ok ? 'pass' : 'fail', ms: result.ms, output: result.output });
    if (!result.ok) {
      console.log(`FAIL ${check.name} (${result.ms}ms)`);
      console.log(String(result.output).trim().split('\n').slice(-15).map((line) => `     ${line}`).join('\n'));
      if (bail) break;
    } else if (check.tier !== 'static') {
      console.log(`pass ${check.name} (${result.ms}ms)`);
    }
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skipped');
  console.log('');
  console.log(`${passed} passed, ${failed.length} failed, ${skipped.length} skipped`);
  if (skipped.length) {
    // Never let a skip masquerade as a pass.
    const reasons = new Map();
    for (const item of skipped) reasons.set(item.reason, (reasons.get(item.reason) || 0) + 1);
    for (const [reason, count] of reasons) console.log(`  skipped ${count}: ${reason}`);
  }
  if (failed.length) {
    console.log(`  failed: ${failed.map((r) => r.check.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`local-quality-gate failed: ${error.message}`);
  process.exitCode = 1;
});

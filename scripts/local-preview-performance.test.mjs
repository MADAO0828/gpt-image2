import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  RequestBodyTooLargeError,
  readRequestBody,
  relayFetchResponse,
  staticAssetResponse
} from './local-preview-performance.mjs';
import { onRequest as promptsRequest } from '../functions/api/prompts/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('request bodies reject declared and streamed payloads above the configured limit', async () => {
  const declared = new PassThrough();
  declared.headers = { 'content-length': '11' };
  await assert.rejects(readRequestBody(declared, 10), RequestBodyTooLargeError);

  const streamed = new PassThrough();
  streamed.headers = {};
  const body = readRequestBody(streamed, 10);
  streamed.write(Buffer.alloc(6));
  streamed.write(Buffer.alloc(5));
  streamed.end();
  await assert.rejects(body, (error) => error instanceof RequestBodyTooLargeError && error.limitBytes === 10);
});

test('event streams reach the client chunk-by-chunk before the response completes', async () => {
  const delayMs = 120;
  const server = http.createServer((req, res) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'));
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('data: second\n\n'));
          controller.close();
        }, delayMs);
      }
    });
    void relayFetchResponse(req, res, new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' }
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const startedAt = Date.now();
    const arrivals = [];
    const text = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${server.address().port}/`, (res) => {
        const chunks = [];
        res.on('data', (chunk) => {
          arrivals.push(Date.now() - startedAt);
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }).on('error', reject);
    });
    assert.match(text, /data: first/);
    assert.match(text, /data: second/);
    assert.ok(arrivals.length >= 2, `expected separate chunks, got ${arrivals.length}`);
    assert.ok(arrivals[0] < delayMs, `first chunk arrived after ${arrivals[0]}ms`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('disconnecting an event-stream client cancels the upstream response body', async () => {
  let cancelled;
  const cancelledPromise = new Promise((resolve) => { cancelled = resolve; });
  const server = http.createServer((req, res) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: ready\n\n'));
      },
      cancel(reason) {
        cancelled(reason);
      }
    });
    void relayFetchResponse(req, res, new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' }
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${server.address().port}/`, (res) => {
        res.once('data', () => {
          res.destroy();
          resolve();
        });
        res.on('error', () => {});
      }).on('error', reject);
    });
    const reason = await Promise.race([
      cancelledPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('upstream stream was not cancelled')), 1000))
    ]);
    assert.match(String(reason), /client disconnected/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('static assets are exposed as streams with a stable content length', async () => {
  const file = path.join(root, 'prompts_pages', 'page-002.json');
  const stat = await fs.stat(file);
  const response = await staticAssetResponse(file, 'application/json; charset=utf-8');
  assert.equal(response.headers.get('content-length'), String(stat.size));
  assert.ok(response.body instanceof ReadableStream);
  await response.body.cancel();
});

test('unfiltered prompt pages 2-12 use the prebuilt page files without loading prompts_data.json', async () => {
  for (const page of [2, 12]) {
    const requested = [];
    const response = await promptsRequest({
      request: new Request(`http://local.test/api/prompts?page=${page}&limit=48`),
      env: {
        ASSETS: {
          async fetch(input) {
            const raw = input instanceof URL ? input.href : (typeof input === 'string' ? input : input.url);
            const pathname = new URL(raw).pathname;
            requested.push(pathname);
            if (pathname === '/prompts_data.json') throw new Error('full prompt repository must not be loaded');
            const file = path.join(root, pathname.replace(/^\/+/, ''));
            try {
              return new Response(await fs.readFile(file), { status: 200 });
            } catch {
              return new Response('not found', { status: 404 });
            }
          }
        }
      }
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.page, page);
    assert.equal(payload.limit, 48);
    assert.equal(payload.source, 'static-prebuilt-page');
    assert.deepEqual(requested, [`/prompts_pages/page-${String(page).padStart(3, '0')}.json`]);
  }
});

test('preview sources keep streaming and diagnostic fallback invariants', async () => {
  const serverSource = await fs.readFile(path.join(root, 'scripts', 'local-preview-server.mjs'), 'utf8');
  const startSource = await fs.readFile(path.join(root, 'scripts', 'start-local-preview.ps1'), 'utf8');
  assert.doesNotMatch(serverSource, /apiRes\.arrayBuffer\(\)/);
  assert.doesNotMatch(serverSource, /fs\.readFileSync\(file\)/);
  assert.match(startSource, /Falling back to the Node preview server/);
  assert.match(startSource, /Wrangler stderr/);
  assert.match(startSource, /\[string\]\$Engine = 'Node'/);
  assert.match(startSource, /System\.Threading\.Mutex/);
  assert.match(startSource, /Get-ProcessAncestry/);
  assert.match(startSource, /Stop-ProcessTree -ProcessId/);
  assert.match(startSource, /launcher-latest\.log/);
  assert.match(startSource, /status\.json/);
  assert.doesNotMatch(startSource, /throw 'Wrangler is not installed\.'/);

  const shell = spawnSync('pwsh.exe', [
    '-NoProfile',
    '-Command',
    `[scriptblock]::Create((Get-Content -Raw -LiteralPath '${path.join(root, 'scripts', 'start-local-preview.ps1').replaceAll("'", "''")}')) | Out-Null`
  ], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);
});

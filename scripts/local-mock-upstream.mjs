// Offline stand-in for a real image/LLM provider, used by the local preview
// server when LOCAL_MOCK_UPSTREAM is enabled.
//
// scripts/local-upstream-fetch.mjs performs real network calls, so exercising the
// generation pipeline locally previously meant paying a provider for every click.
// This module implements the same `fetch(input, init) => Response` contract and
// answers the OpenAI-compatible routes the app actually uses, so the full
// composer -> proxy -> stream -> gallery path can be driven for free.
//
// It is deliberately NOT a provider simulator: it returns deterministic, obviously
// synthetic images. It exists to test our plumbing, not their behaviour.

import zlib from 'node:zlib';

const MAX_DIMENSION = 512;
const MAX_IMAGES = 4;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

// A deterministic gradient with a diagonal band, so a human can tell at a glance
// that an image came from the mock and can see which variant index it is.
function renderPng(width, height, seed) {
  const w = Math.max(8, Math.min(MAX_DIMENSION, Math.round(width) || 256));
  const h = Math.max(8, Math.min(MAX_DIMENSION, Math.round(height) || 256));
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let offset = 0;
  for (let y = 0; y < h; y += 1) {
    raw[offset] = 0; // filter type 0 (None)
    offset += 1;
    for (let x = 0; x < w; x += 1) {
      const band = (x + y + seed * 24) % 96 < 12 ? 70 : 0;
      raw[offset] = Math.min(255, Math.round((x / w) * 220) + band);
      raw[offset + 1] = Math.min(255, Math.round((y / h) * 200) + band);
      raw[offset + 2] = Math.min(255, 90 + seed * 40 + band);
      offset += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function parseSize(size) {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(String(size || '').trim());
  if (!match) return { width: 256, height: 256 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Local-Mock-Upstream': '1', ...headers },
  });
}

function sseResponse(events) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        // Let the client observe genuinely incremental delivery rather than one
        // buffered flush, which is what makes streaming bugs visible locally.
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Local-Mock-Upstream': '1',
    },
  });
}

async function readBody(input, init) {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (raw === undefined || raw === null) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof FormData !== 'undefined' && raw instanceof FormData) {
    const out = {};
    for (const [key, value] of raw.entries()) if (typeof value === 'string') out[key] = value;
    return out;
  }
  if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
    try { return JSON.parse(Buffer.from(raw).toString('utf8')); } catch { return {}; }
  }
  return {};
}

function imagePayload(body) {
  const { width, height } = parseSize(body.size);
  const count = Math.max(1, Math.min(MAX_IMAGES, Number(body.n) || 1));
  return Array.from({ length: count }, (_unused, index) => ({
    b64_json: renderPng(width, height, index + 1).toString('base64'),
    revised_prompt: `[local mock] ${String(body.prompt || '').slice(0, 120)}`,
  }));
}

export function createMockUpstreamFetch({ log = () => {} } = {}) {
  return async function mockUpstreamFetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input)));
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = url.pathname.replace(/^.*\/v1(?=\/|$)/, '') || url.pathname;
    log(`mock upstream ${method} ${url.host}${url.pathname}`);

    if (/\/models\/?$/.test(path)) {
      return jsonResponse({
        object: 'list',
        data: ['gpt-image-2', 'gpt-image-1', 'dall-e-3', 'gemini-2.5-flash-image', 'gpt-4o-mini'].map((id) => ({
          id, object: 'model', owned_by: 'local-mock',
        })),
      });
    }

    if (/\/images\/(generations|edits)\/?$/.test(path)) {
      const body = await readBody(input, init);
      const images = imagePayload(body);
      if (body.stream) {
        const partials = Math.max(0, Math.min(3, Number(body.partial_images) || 0));
        const events = [];
        for (let index = 0; index < partials; index += 1) {
          events.push({
            type: 'image_generation.partial_image',
            partial_image_index: index,
            b64_json: renderPng(96, 96, index + 1).toString('base64'),
          });
        }
        events.push({ type: 'image_generation.completed', data: images });
        return sseResponse(events);
      }
      return jsonResponse({ created: 0, data: images });
    }

    if (/\/(responses|chat\/completions)\/?$/.test(path)) {
      const body = await readBody(input, init);
      const text = '[local mock] 这是本地模拟上游返回的文本，用于在不产生费用的情况下验证链路。';
      if (body.stream) {
        return sseResponse([
          { type: 'response.output_text.delta', delta: '[local mock] ' },
          { type: 'response.output_text.delta', delta: '这是本地模拟上游返回的文本。' },
          { type: 'response.completed', response: { id: 'mock-response', status: 'completed' } },
        ]);
      }
      if (/\/responses\/?$/.test(path)) {
        return jsonResponse({
          id: 'mock-response',
          object: 'response',
          status: 'completed',
          model: body.model || 'gpt-image-2',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
          output_text: text,
        });
      }
      return jsonResponse({
        id: 'mock-chat',
        object: 'chat.completion',
        model: body.model || 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      });
    }

    // Anything the app reaches that is not modelled here should fail loudly rather
    // than silently look like a provider outage.
    return jsonResponse({
      error: {
        message: `local mock upstream has no handler for ${method} ${url.pathname}`,
        type: 'local_mock_unhandled',
        code: 'LOCAL_MOCK_UNHANDLED',
      },
    }, 501);
  };
}

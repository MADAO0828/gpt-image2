import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Duplex, Readable, Writable } from 'node:stream';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { createLocalUpstreamFetch } from './local-upstream-fetch.mjs';

class FakeRequest extends Writable {
  constructor(scenario) {
    super({ highWaterMark: 1 });
    this.scenario = scenario;
    this.chunks = [];
    this.destroyedWith = null;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    const delay = Number(this.scenario.writeDelay || 0);
    if (delay > 0) setTimeout(callback, delay);
    else callback();
  }

  _final(callback) {
    this.scenario.onRequestBody?.(Buffer.concat(this.chunks));
    this.scenario.onRequestEnd?.(this);
    callback();
  }

  destroy(error) {
    this.destroyedWith = error || null;
    return super.destroy(error);
  }
}

class FakeResponse extends Readable {
  constructor({ statusCode = 200, statusMessage = 'OK', headers = {} } = {}) {
    super();
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.headers = headers;
  }

  _read() {}
}

class FakeHttp2Stream extends Duplex {
  constructor(scenario) {
    super({ autoDestroy: false });
    this.scenario = scenario;
    this.chunks = [];
  }

  _read() {}

  _write(chunk, encoding, callback) {
    const value = Buffer.from(chunk);
    this.chunks.push(value);
    this.scenario.onH2Body?.(value, this);
    callback();
  }

  _final(callback) {
    this.scenario.onH2End?.(this);
    callback();
  }
}

class FakeHttp2Session extends EventEmitter {
  constructor(scenario, alpn) {
    super();
    this.scenario = scenario;
    this.socket = { alpnProtocol: alpn };
    this.closed = false;
    this.destroyed = false;
    const delay = Number(scenario.h2ConnectDelay || 0);
    this.connectTimer = setTimeout(() => {
      this.emit('connect');
      this.scenario.onH2Connect?.(this);
    }, delay);
  }

  request(headers) {
    this.requestHeaders = headers;
    this.requestCount = (this.requestCount || 0) + 1;
    const stream = new FakeHttp2Stream(this.scenario);
    this.stream = stream;
    this.scenario.onH2Request?.(headers, stream);
    return stream;
  }

  close() {
    this.closed = true;
    clearTimeout(this.connectTimer);
  }

  destroy(error) {
    this.destroyed = true;
    clearTimeout(this.connectTimer);
    if (error) this.error = error;
  }
}

function makeNegotiatedFetch(scenario, { alpn = 'h2' } = {}) {
  let session;
  const fetch = createLocalUpstreamFetch({
    http2Connect(_url, options) {
      scenario.h2Options = options;
      session = new FakeHttp2Session(scenario, alpn);
      scenario.session = session;
      return session;
    },
    requestImpl(options, callback) {
      scenario.h1Count = (scenario.h1Count || 0) + 1;
      scenario.h1Options = options;
      const request = new FakeRequest(scenario);
      scenario.onH1Request?.(request, callback);
      return request;
    }
  });
  return { fetch, session: () => session };
}

function makeFetch(scenario) {
  return createLocalUpstreamFetch({
    requestImpl(options, callback) {
      const request = new FakeRequest(scenario);
      scenario.onRequestOptions?.(options);
      scenario.onRequest?.(request, callback);
      return request;
    }
  });
}

test('negotiates h2 first and preserves response streaming', async () => {
  const scenario = {
    onH2Request(headers, stream) {
      queueMicrotask(() => {
        this.h2ResponseHeaders = headers;
        stream.emit('response', { ':status': 200, 'content-type': 'application/json' });
        stream.push('{"ok":');
        stream.push('true}');
        stream.push(null);
      });
    }
  };
  const { fetch } = makeNegotiatedFetch(scenario);
  const response = await fetch('https://upstream.test/v1/images/generations?mode=test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'test' })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(scenario.h1Count || 0, 0);
  assert.equal(scenario.session.requestCount, 1);
  assert.equal(scenario.h2Options.ALPNProtocols.join(','), 'h2,http/1.1');
  assert.deepEqual(scenario.h2ResponseHeaders, {
    ':method': 'POST',
    ':path': '/v1/images/generations?mode=test',
    ':authority': 'upstream.test',
    'accept-encoding': 'gzip, deflate, br',
    'content-type': 'application/json'
  });
});

test('falls back to one h1 request when ALPN selects http/1.1', async () => {
  const scenario = {
    onH1Request(request, callback) {
      request.on('finish', () => {
        this.requestBody = Buffer.concat(request.chunks);
      });
      const response = new FakeResponse({ headers: { 'content-type': 'application/json' } });
      callback(response);
      response.push('{"fallback":true}');
      response.push(null);
    },
  };
  const { fetch } = makeNegotiatedFetch(scenario, { alpn: 'http/1.1' });
  const response = await fetch('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'fallback' })
  });
  assert.deepEqual(await response.json(), { fallback: true });
  assert.equal(scenario.h1Count, 1);
  assert.equal(scenario.session.requestCount || 0, 0);
  assert.equal(scenario.h1Options.ALPNProtocols.join(','), 'http/1.1');
  assert.deepEqual(JSON.parse(scenario.requestBody.toString('utf8')), { prompt: 'fallback' });
});

test('ignores a late error from the retired h2 session after ALPN fallback', async () => {
  const scenario = {
    onH2Connect(session) {
      setImmediate(() => session.emit('error', Object.assign(new Error('retired h2 session failed'), {
        code: 'ERR_HTTP2_ERROR'
      })));
    },
    onH1Request(request, callback) {
      this.h1Request = request;
      const response = new FakeResponse({ headers: { 'content-type': 'application/json' } });
      callback(response);
      response.push('{"fallback":true}');
      response.push(null);
    }
  };
  const { fetch } = makeNegotiatedFetch(scenario, { alpn: 'http/1.1' });
  const response = await fetch('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'late h2 error' })
  });
  assert.deepEqual(await response.json(), { fallback: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scenario.h1Count, 1);
  assert.equal(scenario.h1Request.destroyedWith, null);
});

test('keeps multipart bytes, order, and content length on h2', async () => {
  const body = Buffer.from([
    '--boundary\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-2\r\n',
    '--boundary\r\nContent-Disposition: form-data; name="image[]"; filename="one.png"\r\n',
    'Content-Type: image/png\r\n\r\nPNG\r\n--boundary--\r\n'
  ].join(''));
  const scenario = {
    onH2Request(headers, stream) {
      this.h2ResponseHeaders = headers;
      queueMicrotask(() => {
        stream.emit('response', { ':status': 200, 'content-type': 'application/json' });
        stream.push('{"ok":true}');
        stream.push(null);
      });
    },
    onH2Body(chunk) {
      this.h2Body = Buffer.concat([this.h2Body || Buffer.alloc(0), chunk]);
    }
  };
  const { fetch } = makeNegotiatedFetch(scenario);
  const response = await fetch('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=boundary',
      'Content-Length': String(body.byteLength)
    },
    body
  });
  await response.text();
  assert.deepEqual(scenario.h2Body, body);
  assert.equal(scenario.h2ResponseHeaders['content-length'], String(body.byteLength));
  assert.ok(scenario.h2Body.indexOf(Buffer.from('name="model"')) < scenario.h2Body.indexOf(Buffer.from('name="image[]"')));
  assert.equal(scenario.h1Count || 0, 0);
});

test('does not retry h1 after an h2 stream has started sending the body', async () => {
  const scenario = {
    onH2Request(_headers, stream) {
      queueMicrotask(() => {
        stream.emit('response', { ':status': 200, 'content-type': 'application/json' });
        stream.push('{"partial":');
      });
    },
    onH2Body(chunk, stream) {
      this.h2Body = Buffer.concat([this.h2Body || Buffer.alloc(0), chunk]);
      if (!this.failed) {
        this.failed = true;
        setImmediate(() => stream.destroy(Object.assign(new Error('h2 body failed'), { code: 'ERR_HTTP2_ERROR' })));
      }
    }
  };
  const { fetch } = makeNegotiatedFetch(scenario);
  const response = await fetch('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'one request only' })
  });
  await assert.rejects(response.text(), /h2 body failed/);
  assert.equal(scenario.h1Count || 0, 0);
  assert.ok(scenario.h2Body?.byteLength > 0);
});

test('aborts h2 ALPN negotiation without falling back or sending the body', async () => {
  const scenario = { h2ConnectDelay: 100 };
  const { fetch } = makeNegotiatedFetch(scenario);
  const controller = new AbortController();
  const pending = fetch('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'cancel before connect' }),
    signal: controller.signal
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === 'AbortError');
  assert.equal(scenario.h1Count || 0, 0);
  assert.equal(scenario.session.destroyed, true);
});

test('sends JSON bodies and returns a streamed response', async () => {
  const scenario = {
    onRequestBody(body) {
      this.requestBody = body;
    },
    onRequest(_request, callback) {
      const response = new FakeResponse({ headers: { 'content-type': 'application/json' } });
      callback(response);
      response.push('{"ok":');
      setTimeout(() => {
        response.push('true}');
        response.push(null);
      }, 10);
    }
  };
  const fetch = makeFetch(scenario);
  const response = await fetch('https://upstream.test/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'test' })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(JSON.parse(scenario.requestBody.toString('utf8')), { prompt: 'test' });
});

test('pipes raw multipart Web streams without buffering the whole body', async () => {
  const chunks = [
    Buffer.from('--boundary\r\nContent-Disposition: form-data; name="image[]"; filename="a.png"\r\n\r\n'),
    Buffer.from('PNG-DATA'),
    Buffer.from('\r\n--boundary--\r\n')
  ];
  let resolveBodyFinished;
  const bodyFinished = new Promise((resolve) => {
    resolveBodyFinished = resolve;
  });
  const scenario = {
    bodyFinished,
    onRequestBody(body) {
      this.requestBody = body;
      resolveBodyFinished();
    },
    onRequest(_request, callback) {
      const response = new FakeResponse({ statusMessage: 'Accepted' });
      callback(response);
      response.push('accepted');
      response.push(null);
    }
  };
  const fetch = makeFetch(scenario);
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  });
  const response = await fetch('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=boundary' },
    body
  });
  assert.equal(await response.text(), 'accepted');
  await scenario.bodyFinished;
  assert.deepEqual(scenario.requestBody, Buffer.concat(chunks));
});

test('preserves an explicit raw multipart content length', async () => {
  const body = Buffer.from('--boundary\r\nContent-Disposition: form-data; name="model"\r\n\r\ngpt-image-2\r\n--boundary--\r\n');
  const scenario = {
    onRequestOptions(options) {
      this.requestHeaders = options.headers;
    },
    onRequestBody(received) {
      this.requestBody = received;
    },
    onRequest(_request, callback) {
      const response = new FakeResponse();
      callback(response);
      response.push('ok');
      response.push(null);
    }
  };
  const response = await makeFetch(scenario)('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=boundary',
      'Content-Length': String(body.byteLength)
    },
    body
  });
  assert.equal(await response.text(), 'ok');
  assert.equal(scenario.requestHeaders['content-length'], String(body.byteLength));
  assert.deepEqual(scenario.requestBody, body);
});

test('accepts Blob and Node Readable request bodies', async () => {
  const received = [];
  const fetch = makeFetch({
    onRequestBody(body) {
      received.push(body.toString('utf8'));
    },
    onRequest(_request, callback) {
      const response = new FakeResponse();
      callback(response);
      response.push('ok');
      response.push(null);
    }
  });
  const blobResponse = await fetch('https://upstream.test/v1/upload', {
    method: 'POST',
    body: new Blob(['blob-body'])
  });
  await blobResponse.text();
  const streamResponse = await fetch('https://upstream.test/v1/upload', {
    method: 'POST',
    body: Readable.from([Buffer.from('stream-body')])
  });
  await streamResponse.text();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(received.sort(), ['blob-body', 'stream-body']);
});

test('serializes FormData as a streaming multipart body and preserves its boundary header', async () => {
  let resolveBodyFinished;
  const bodyFinished = new Promise((resolve) => {
    resolveBodyFinished = resolve;
  });
  const scenario = {
    bodyFinished,
    onRequestOptions(options) {
      this.requestHeaders = options.headers;
    },
    onRequestBody(body) {
      this.requestBody = body;
      resolveBodyFinished();
    },
    onRequest(_request, callback) {
      const response = new FakeResponse();
      callback(response);
      response.push('ok');
      response.push(null);
    }
  };
  const form = new FormData();
  form.append('prompt', 'portrait');
  form.append('image[]', new Blob(['PNG-DATA'], { type: 'image/png' }), 'reference.png');
  const response = await makeFetch(scenario)('https://upstream.test/v1/images/edits', {
    method: 'POST',
    body: form
  });
  await response.text();
  await scenario.bodyFinished;
  const contentType = scenario.requestHeaders['content-type'];
  assert.match(contentType, /^multipart\/form-data; boundary=.+$/);
  const boundary = contentType.slice(contentType.indexOf('boundary=') + 'boundary='.length);
  const text = scenario.requestBody.toString('utf8');
  assert.match(text, new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(text, /name="prompt"/);
  assert.match(text, /portrait/);
  assert.match(text, /filename="reference\.png"/);
  assert.match(text, /PNG-DATA/);

  const explicitScenario = {
    onRequestOptions(options) {
      this.requestHeaders = options.headers;
    },
    onRequest(_request, callback) {
      const response = new FakeResponse();
      callback(response);
      response.push(null);
    }
  };
  const explicitForm = new FormData();
  explicitForm.append('prompt', 'kept');
  await makeFetch(explicitScenario)('https://upstream.test/v1/images/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/custom' },
    body: explicitForm
  });
  assert.equal(explicitScenario.requestHeaders['content-type'], 'multipart/custom');
});

test('transparently decompresses gzip, deflate, and brotli response bodies as streams', async () => {
  const payload = Buffer.from(JSON.stringify({ ok: true, text: 'streamed response' }));
  const cases = [
    ['gzip', gzipSync(payload)],
    ['deflate', deflateSync(payload)],
    ['br', brotliCompressSync(payload)]
  ];
  for (const [encoding, compressed] of cases) {
    const scenario = {
      onRequestOptions(options) {
        this.requestHeaders = options.headers;
      },
      onRequest(_request, callback) {
        const response = new FakeResponse({
          headers: {
            'content-type': 'application/json',
            'content-encoding': encoding,
            'content-length': String(compressed.length)
          }
        });
        this.response = response;
        callback(response);
        response.push(compressed.subarray(0, Math.max(1, Math.floor(compressed.length / 2))));
        setTimeout(() => {
          response.push(compressed.subarray(Math.max(1, Math.floor(compressed.length / 2))));
          response.push(null);
        }, 5);
      }
    };
    const response = await makeFetch(scenario)('https://upstream.test/v1/models');
    assert.equal(response.headers.get('content-encoding'), null, encoding);
    assert.equal(response.headers.get('content-length'), null, encoding);
    assert.equal(response.transport.contentEncoding, encoding);
    assert.equal(response.transport.decodedContentEncoding, encoding);
    assert.equal(response.transport.decompressed, true);
    assert.deepEqual(await response.json(), { ok: true, text: 'streamed response' });
    assert.equal(response.transport.rawBytes, compressed.length, encoding);
    assert.equal(response.transport.deliveredBytes, payload.length, encoding);
    assert.deepEqual(response.transport.bytes, { raw: compressed.length, delivered: payload.length });
    assert.equal(scenario.requestHeaders['accept-encoding'], 'gzip, deflate, br');
  }
});

test('preserves unknown response Content-Encoding while forwarding its raw bytes', async () => {
  const compressed = Buffer.from('opaque-compressed-bytes');
  const scenario = {
    onRequest(_request, callback) {
      const response = new FakeResponse({
        headers: {
          'content-type': 'application/octet-stream',
          'content-encoding': 'x-opaque-codec',
          'content-length': String(compressed.length)
        }
      });
      callback(response);
      response.push(compressed);
      response.push(null);
    }
  };
  const response = await makeFetch(scenario)('https://upstream.test/v1/models');
  assert.equal(response.headers.get('content-encoding'), 'x-opaque-codec');
  assert.equal(response.headers.get('content-length'), String(compressed.length));
  assert.equal(response.transport.contentEncoding, 'unknown');
  assert.equal(response.transport.decompressed, false);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), compressed);
});

test('does not override an explicit Accept-Encoding request header', async () => {
  const scenario = {
    onRequestOptions(options) {
      this.requestHeaders = options.headers;
    },
    onRequest(_request, callback) {
      const response = new FakeResponse();
      callback(response);
      response.push('ok');
      response.push(null);
    }
  };
  const response = await makeFetch(scenario)('https://upstream.test/v1/models', {
    headers: { 'Accept-Encoding': 'identity' }
  });
  assert.equal(await response.text(), 'ok');
  assert.equal(scenario.requestHeaders['accept-encoding'], 'identity');
});

test('reports a sanitized decompression error while reading the response body', async () => {
  const scenario = {
    onRequest(_request, callback) {
      const response = new FakeResponse({
        headers: { 'content-encoding': 'gzip', 'x-test-secret': 'do-not-copy' }
      });
      callback(response);
      response.push(Buffer.from('not a gzip payload'));
      response.push(null);
    }
  };
  const response = await makeFetch(scenario)('https://upstream.test/v1/models');
  assert.equal(response.status, 200);
  await assert.rejects(response.text(), (error) => {
    assert.equal(error?.name, 'LocalUpstreamTransportError');
    assert.equal(error?.code, 'LOCAL_UPSTREAM_DECOMPRESSION_FAILED');
    assert.equal(error?.stage, 'response-body');
    assert.equal(error?.contentEncoding, 'gzip');
    assert.match(error?.message || '', /^Local upstream response decompression failed \(gzip\)$/);
    assert.doesNotMatch(error?.message || '', /not a gzip payload|upstream\.test|do-not-copy/);
    return true;
  });
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('x-test-secret'), 'do-not-copy');
});

test('cancels a slow compressed response without waiting for the remaining body', async () => {
  const controller = new AbortController();
  const compressed = gzipSync(Buffer.from('slow compressed response'));
  let delayedPush;
  const scenario = {
    onRequest(_request, callback) {
      const response = new FakeResponse({ headers: { 'content-encoding': 'gzip' } });
      this.response = response;
      callback(response);
      response.push(compressed.subarray(0, 1));
      delayedPush = setTimeout(() => {
        response.push(compressed.subarray(1));
        response.push(null);
      }, 100);
    }
  };
  const response = await makeFetch(scenario)('https://upstream.test/v1/models', { signal: controller.signal });
  const reader = response.body.getReader();
  const pending = reader.read();
  await new Promise((resolve) => setTimeout(resolve, 10));
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === 'AbortError');
  clearTimeout(delayedPush);
  assert.equal(scenario.response.destroyed, true);
});

test('does not impose a response-header timeout', async () => {
  const delayMs = 80;
  const scenario = {
    onRequest(_request, callback) {
      setTimeout(() => {
        const response = new FakeResponse();
        callback(response);
        response.push('ready');
        response.push(null);
      }, delayMs);
    }
  };
  const started = Date.now();
  const response = await makeFetch(scenario)('https://upstream.test/v1/models');
  assert.ok(Date.now() - started >= delayMs - 10);
  assert.equal(await response.text(), 'ready');
});

test('keeps slow response bodies streaming until completion', async () => {
  const scenario = {
    onRequest(_request, callback) {
      const response = new FakeResponse();
      callback(response);
      response.push('first');
      setTimeout(() => {
        response.push(' second');
        response.push(null);
      }, 60);
    }
  };
  const started = Date.now();
  const response = await makeFetch(scenario)('https://upstream.test/v1/models');
  assert.equal(await response.text(), 'first second');
  assert.ok(Date.now() - started >= 50);
});

test('aborts a request waiting for response headers', async () => {
  const controller = new AbortController();
  let request;
  const fetch = createLocalUpstreamFetch({
    requestImpl() {
      request = new FakeRequest({});
      return request;
    }
  });
  const pending = fetch('https://upstream.test/v1/models', { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, (error) => error?.name === 'AbortError');
  assert.ok(request.destroyedWith);
});

test('aborts a response body through the caller signal', async () => {
  const controller = new AbortController();
  const scenario = {
    onRequest(_request, callback) {
      const response = new FakeResponse();
      callback(response);
      response.push('first');
    }
  };
  const response = await makeFetch(scenario)('https://upstream.test/v1/models', { signal: controller.signal });
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'first');
  const pending = reader.read();
  controller.abort();
  await assert.rejects(pending);
});

test('returns redirects without following them', async () => {
  const scenario = {
    onRequest(_request, callback) {
      const response = new FakeResponse({ statusCode: 302, statusMessage: 'Found', headers: { location: 'https://other.test/final' } });
      callback(response);
      response.push(null);
    }
  };
  const response = await makeFetch(scenario)('https://upstream.test/v1/models', { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://other.test/final');
});

test('preserves network errors and enforces HTTPS-only URLs', async () => {
  const networkError = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' });
  const fetch = makeFetch({
    onRequest(request) {
      queueMicrotask(() => request.emit('error', networkError));
    }
  });
  await assert.rejects(fetch('https://upstream.test/v1/models'), (error) => error === networkError);
  await assert.rejects(fetch('http://upstream.test/v1/models'), /HTTPS/);
});

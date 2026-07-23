import http2 from 'node:http2';
import https from 'node:https';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

const SUPPORTED_CONTENT_ENCODINGS = new Set(['gzip', 'deflate', 'br']);
const IDENTITY_CONTENT_ENCODING = 'identity';

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function abortError(signal) {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  if (typeof DOMException === 'function') return new DOMException('The operation was aborted', 'AbortError');
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function toBuffer(value) {
  if (typeof value === 'string') return Buffer.from(value);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function isNodeReadable(value) {
  return !!value && typeof value.pipe === 'function' && typeof value.on === 'function';
}

function isWebReadable(value) {
  return !!value && typeof value.getReader === 'function';
}

function isFormData(value) {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

function toNodeReadable(body) {
  if (isNodeReadable(body)) return body;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return Readable.fromWeb(body.stream());
  if (isWebReadable(body)) return Readable.fromWeb(body);
  throw new TypeError('Unsupported local upstream request body');
}

function hasHeader(headers, name) {
  const lower = String(name).toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function requestUrl(input) {
  const raw = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : typeof input === 'string'
        ? input
        : input?.url;
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    throw new TypeError('Invalid URL');
  }
  if (url.protocol !== 'https:') throw new TypeError('Local upstream fetch requires an HTTPS URL');
  if (url.username || url.password) throw new TypeError('Local upstream fetch URLs must not contain credentials');
  return url;
}

function copyHeaders(source) {
  const headers = new Headers(source || undefined);
  const nodeHeaders = {};
  for (const [name, value] of headers) nodeHeaders[name] = value;
  return nodeHeaders;
}

function hasResponseBody(method, statusCode) {
  return method !== 'HEAD' && statusCode !== 204 && statusCode !== 304 && statusCode !== 101;
}

function responseHeaders(incoming, { stripEncoding = false } = {}) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers || {})) {
    const lower = name.toLowerCase();
    if (stripEncoding && (lower === 'content-encoding' || lower === 'content-length')) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, String(item));
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }
  return headers;
}

function responseContentEncodings(incoming) {
  const entry = Object.entries(incoming?.headers || {}).find(([name]) => name.toLowerCase() === 'content-encoding');
  const value = entry?.[1];
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  const tokens = raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return { raw, tokens };
}

function decompressionPlan(tokens) {
  const meaningful = tokens.filter((token) => token !== IDENTITY_CONTENT_ENCODING);
  if (!meaningful.length) return [];
  if (meaningful.some((token) => !SUPPORTED_CONTENT_ENCODINGS.has(token))) return null;
  return [...meaningful].reverse();
}

function decoderFor(encoding) {
  if (encoding === 'gzip') return createGunzip();
  if (encoding === 'deflate') return createInflate();
  if (encoding === 'br') return createBrotliDecompress();
  throw new TypeError('Unsupported local upstream response encoding');
}

function safeEncodingMetadata(tokens) {
  if (!tokens.length) return null;
  const meaningful = tokens.filter((token) => token !== IDENTITY_CONTENT_ENCODING);
  if (!meaningful.length) return IDENTITY_CONTENT_ENCODING;
  return meaningful.every((token) => SUPPORTED_CONTENT_ENCODINGS.has(token))
    ? meaningful.join(', ')
    : 'unknown';
}

function createTransportMetrics(contentEncoding, decodedEncodings) {
  const metrics = {
    rawBytes: 0,
    deliveredBytes: 0,
    contentEncoding: safeEncodingMetadata(contentEncoding),
    decodedContentEncoding: decodedEncodings.length ? decodedEncodings.join(', ') : null,
    decompressed: decodedEncodings.length > 0
  };
  Object.defineProperties(metrics, {
    raw: { enumerable: false, get: () => metrics.rawBytes },
    delivered: { enumerable: false, get: () => metrics.deliveredBytes },
    bytes: {
      enumerable: false,
      get: () => ({ raw: metrics.rawBytes, delivered: metrics.deliveredBytes })
    }
  });
  return metrics;
}

function byteCountingTransform(metrics, key) {
  return new Transform({
    transform(chunk, encoding, callback) {
      const size = typeof chunk?.byteLength === 'number'
        ? chunk.byteLength
        : Buffer.byteLength(String(chunk), encoding);
      metrics[key] += size;
      callback(null, chunk);
    }
  });
}

function decompressionError(encodings) {
  const label = encodings.join(', ') || 'content-encoding';
  const error = new Error(`Local upstream response decompression failed (${label})`);
  error.name = 'LocalUpstreamTransportError';
  error.code = 'LOCAL_UPSTREAM_DECOMPRESSION_FAILED';
  error.stage = 'response-body';
  error.contentEncoding = label;
  return error;
}

function attachTransportMetadata(response, metrics) {
  // Keep diagnostics on the local Response object so relay headers never expose them.
  Object.defineProperties(response, {
    transport: { configurable: false, enumerable: false, value: metrics },
    transportMetrics: { configurable: false, enumerable: false, value: metrics }
  });
  return response;
}

function streamedResponseBody(incoming, decodedEncodings, metrics) {
  const rawCounter = byteCountingTransform(metrics, 'rawBytes');
  const deliveryCounter = byteCountingTransform(metrics, 'deliveredBytes');
  const decoders = decodedEncodings.map(decoderFor);
  let terminalError = null;
  let inputEnded = false;

  const failOutput = (error) => {
    if (terminalError) return;
    terminalError = error;
    if (!deliveryCounter.destroyed) deliveryCounter.destroy(error);
  };
  const failDecode = () => {
    const error = decompressionError(decodedEncodings);
    if (terminalError) return;
    terminalError = error;
    try { incoming.unpipe(rawCounter); } catch {}
    if (!incoming.destroyed) incoming.destroy();
    if (!rawCounter.destroyed) rawCounter.destroy();
    for (const decoder of decoders) {
      if (!decoder.destroyed) decoder.destroy();
    }
    if (!deliveryCounter.destroyed) deliveryCounter.destroy(error);
  };
  const failInput = (error) => {
    failOutput(error);
    if (!rawCounter.destroyed) rawCounter.destroy();
    for (const decoder of decoders) {
      if (!decoder.destroyed) decoder.destroy();
    }
  };

  incoming.once('end', () => { inputEnded = true; });
  incoming.once('error', failInput);
  rawCounter.once('error', failOutput);
  for (const decoder of decoders) decoder.once('error', failDecode);

  let source = incoming.pipe(rawCounter);
  for (const decoder of decoders) source = source.pipe(decoder);
  source.pipe(deliveryCounter);

  deliveryCounter.once('close', () => {
    if (!inputEnded && !incoming.destroyed) incoming.destroy();
    if (terminalError) return;
    for (const decoder of decoders) {
      if (!decoder.destroyed) decoder.destroy();
    }
    if (!rawCounter.destroyed && !inputEnded) rawCounter.destroy();
  });
  return deliveryCounter;
}

const HTTP2_CONNECTION_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade'
]);
const HTTP2_NEGOTIATION_ERROR_CODES = new Set([
  'ERR_HTTP2_ERROR',
  'ERR_HTTP2_INVALID_SESSION'
]);

function http2RequestHeaders(url, method, headers) {
  const result = {
    ':method': method,
    ':path': `${url.pathname || '/'}${url.search || ''}`,
    ':authority': url.host
  };
  for (const [name, value] of Object.entries(headers || {})) {
    const lower = String(name || '').toLowerCase();
    if (!lower || lower.startsWith(':') || lower === 'host' || HTTP2_CONNECTION_HEADERS.has(lower)) continue;
    if (value === undefined || value === null) continue;
    result[lower] = Array.isArray(value) ? value.map((item) => String(item)) : String(value);
  }
  return result;
}

function http2ResponseHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (String(name).startsWith(':')) continue;
    result[name] = value;
  }
  return result;
}

function http2Options(url, options) {
  const requestOptions = { ...(options.requestOptions || {}) };
  for (const key of ['agent', 'headers', 'method', 'path', 'protocol', 'hostname', 'host', 'port']) delete requestOptions[key];
  return {
    ...requestOptions,
    servername: requestOptions.servername || url.hostname,
    ALPNProtocols: ['h2', 'http/1.1']
  };
}

function h1FallbackOptions(url, method, headers, options) {
  const requestOptions = { ...(options.requestOptions || {}) };
  // The fallback must remain an HTTP/1.1 request; https.request cannot speak h2.
  requestOptions.ALPNProtocols = ['http/1.1'];
  return makeRequestOptions(url, method, headers, { ...options, requestOptions });
}

function errorCode(error) {
  return String(error?.code || error?.cause?.code || '').trim();
}

function canFallbackToHttp1(session, error) {
  const negotiated = String(session?.socket?.alpnProtocol || '').toLowerCase();
  if (negotiated && negotiated !== 'h2') return true;
  return !negotiated && HTTP2_NEGOTIATION_ERROR_CODES.has(errorCode(error));
}

function closeHttp2Session(session, error) {
  if (!session || session.destroyed) return;
  try {
    if (error) session.destroy(error);
    else session.close();
  } catch {
    try { session.destroy?.(); } catch {}
  }
}

/**
 * Defer request-body piping until ALPN selects a protocol. A body queued in
 * this PassThrough has not reached the network, so an h1 fallback is safe.
 */
function negotiatedRequest(url, method, headers, options, callback, h2Connect, h1RequestImpl) {
  // The request body can finish before the upstream response arrives. Keep
  // this staging stream alive until the active request/response lifecycle is
  // complete; its destroy hook also tears down the active transport.
  const deferred = new PassThrough({ autoDestroy: false });
  let session = null;
  let active = null;
  let activeProtocol = '';
  let bodyStarted = false;
  let fallbackUsed = false;
  let closing = false;

  const originalDestroy = deferred.destroy.bind(deferred);
  const destroyEverything = (error) => {
    if (closing) return deferred;
    closing = true;
    try { active?.destroy?.(error); } catch {}
    if (session && !session.destroyed) closeHttp2Session(session, error);
    return originalDestroy(error);
  };
  deferred.destroy = destroyEverything;

  const markBodyOnPipe = () => {
    if (bodyStarted) return;
    deferred.once('data', () => { bodyStarted = true; });
  };
  const pipeToActive = (request) => {
    active = request;
    markBodyOnPipe();
    request.once?.('error', (error) => deferred.destroy(error));
    deferred.pipe(request);
  };
  const fallback = (reason) => {
    if (fallbackUsed || bodyStarted || deferred.destroyed) {
      if (reason && !deferred.destroyed) deferred.destroy(reason);
      return;
    }
    fallbackUsed = true;
    activeProtocol = 'http/1.1';
    closeHttp2Session(session);
    session = null;
    try {
      const request = h1RequestImpl(h1FallbackOptions(url, method, headers, options), callback);
      pipeToActive(request);
    } catch (error) {
      deferred.destroy(error);
    }
  };
  const fail = (error) => {
    if (!deferred.destroyed) deferred.destroy(error);
  };
  const startHttp2 = () => {
    if (deferred.destroyed) return;
    let h2Session;
    try {
      h2Session = h2Connect(`https://${url.host}`, http2Options(url, options));
      session = h2Session;
    } catch (error) {
      if (canFallbackToHttp1(session, error)) fallback(error);
      else fail(error);
      return;
    }
    h2Session.once?.('error', (error) => {
      // A session retired by ALPN fallback can still emit a queued error.
      // Only the currently active session is allowed to affect this request.
      if (session !== h2Session) return;
      if (!activeProtocol && canFallbackToHttp1(h2Session, error)) fallback(error);
      else fail(error);
    });
    h2Session.once?.('connect', () => {
      if (session !== h2Session) {
        closeHttp2Session(h2Session);
        return;
      }
      if (deferred.destroyed) {
        closeHttp2Session(h2Session);
        return;
      }
      const negotiated = String(h2Session.socket?.alpnProtocol || '').toLowerCase();
      if (negotiated !== 'h2') {
        fallback(new Error(`HTTP/2 ALPN negotiation selected ${negotiated || 'unknown'}`));
        return;
      }
      activeProtocol = 'h2';
      let request;
      try {
        request = h2Session.request(http2RequestHeaders(url, method, headers));
      } catch (error) {
        fail(error);
        return;
      }
      request.once('response', (responseHeaders) => {
        request.statusCode = Number(responseHeaders?.[':status'] || 0);
        request.statusMessage = '';
        request.headers = http2ResponseHeaders(responseHeaders);
        callback(request);
      });
      request.once('close', () => closeHttp2Session(h2Session));
      pipeToActive(request);
    });
  };

  // Start after the caller has attached its error/abort listeners.
  queueMicrotask(startHttp2);
  return deferred;
}

function makeRequestOptions(url, method, headers, options) {
  return {
    ...(options.requestOptions || {}),
    protocol: 'https:',
    hostname: url.hostname,
    port: url.port || 443,
    path: `${url.pathname || '/'}${url.search || ''}`,
    method,
    headers
  };
}

/**
 * Build the local-only transport used by the Node preview server.
 * The request option hook is intentionally private to local tests; callers
 * should use the returned function as a standard fetch implementation.
 */
export function createLocalUpstreamFetch(options = {}) {
  const h1RequestImpl = options.requestImpl || https.request;
  const h2Connect = options.http2Connect || http2.connect;
  const negotiateProtocols = options.enableHttp2 !== false && (!options.requestImpl || options.http2Connect);

  return function localUpstreamFetch(input, init = {}) {
    const source = input instanceof Request ? input : null;
    let url;
    try {
      url = requestUrl(input);
    } catch (error) {
      return Promise.reject(error);
    }
    let method;
    let headers;
    let body;
    let signal;
    try {
      method = String(init.method ?? source?.method ?? 'GET').toUpperCase();
      const headerSource = init.headers !== undefined ? init.headers : source?.headers;
      headers = copyHeaders(headerSource);
      if (!hasHeader(headers, 'accept-encoding')) headers['accept-encoding'] = 'gzip, deflate, br';
      body = hasOwn(init, 'body') && init.body !== undefined ? init.body : source?.body;
      signal = init.signal !== undefined ? init.signal : source?.signal;
    } catch (error) {
      return Promise.reject(error);
    }

    if (isFormData(body)) {
      try {
        const serialized = new Request(url, { method, body });
        body = serialized.body;
        const contentType = serialized.headers.get('content-type');
        if (contentType && !hasHeader(headers, 'content-type')) headers['content-type'] = contentType;
      } catch (error) {
        return Promise.reject(error);
      }
    }

    if ((method === 'GET' || method === 'HEAD') && body != null) {
      return Promise.reject(new TypeError('Request with GET/HEAD method cannot have body'));
    }
    if (signal?.aborted) return Promise.reject(abortError(signal));

    let bodyBuffer = null;
    let bodyStream = null;
    try {
      bodyBuffer = body == null ? null : toBuffer(body);
      if (body != null && bodyBuffer === null) bodyStream = toNodeReadable(body);
    } catch (error) {
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      let request;
      let incoming = null;
      let promiseSettled = false;
      let responseResolved = false;
      let signalDetached = false;

      const detachSignal = () => {
        if (signalDetached) return;
        signalDetached = true;
        signal?.removeEventListener?.('abort', abortFromSignal);
      };
      const destroyBody = (error) => {
        if (bodyStream && typeof bodyStream.destroy === 'function' && !bodyStream.destroyed) bodyStream.destroy(error);
      };
      const abortFromSignal = () => {
        const error = abortError(signal);
        destroyBody(error);
        if (!responseResolved) {
          if (!promiseSettled) {
            promiseSettled = true;
            detachSignal();
            reject(error);
          }
          request?.destroy(error);
          return;
        }
        incoming?.destroy(error);
      };
      const failRequest = (error) => {
        if (!responseResolved) {
          if (!promiseSettled) {
            promiseSettled = true;
            detachSignal();
            reject(error);
          }
          return;
        }
        if (incoming && !incoming.destroyed) incoming.destroy(error);
      };

      try {
        const requestOptions = makeRequestOptions(url, method, headers, options);
        const requestCallback = (response) => {
          incoming = response;
          if (signal?.aborted) {
            abortFromSignal();
            return;
          }

          const statusCode = Number(response.statusCode || 0);
          let bodyWeb = null;
          let bodyNode = null;
          const encoding = responseContentEncodings(response);
          const decodePlan = decompressionPlan(encoding.tokens);
          const bodyAllowed = hasResponseBody(method, statusCode);
          const activeDecodePlan = bodyAllowed ? (decodePlan || []) : [];
          const decodedMetadata = bodyAllowed && decodePlan
            ? encoding.tokens.filter((token) => token !== IDENTITY_CONTENT_ENCODING)
            : [];
          const transport = createTransportMetrics(encoding.tokens, decodedMetadata);
          try {
            if (bodyAllowed) {
              bodyNode = streamedResponseBody(response, activeDecodePlan, transport);
              bodyWeb = Readable.toWeb(bodyNode);
            } else response.resume();
            const result = attachTransportMetadata(new Response(bodyWeb, {
              status: statusCode,
              statusText: response.statusMessage || '',
              headers: responseHeaders(response, { stripEncoding: activeDecodePlan.length > 0 })
            }), transport);
            responseResolved = true;
            promiseSettled = true;
            resolve(result);
          } catch (error) {
            failRequest(error);
            if (!promiseSettled) {
              promiseSettled = true;
              detachSignal();
              reject(error);
            }
            return;
          }

          const releaseSignal = () => detachSignal();
          (bodyNode || response).once('end', releaseSignal);
          (bodyNode || response).once('close', releaseSignal);
        };
        request = negotiateProtocols
          ? negotiatedRequest(url, method, headers, options, requestCallback, h2Connect, h1RequestImpl)
          : h1RequestImpl(requestOptions, requestCallback);
      } catch (error) {
        failRequest(error);
        if (!promiseSettled) {
          promiseSettled = true;
          detachSignal();
          reject(error);
        }
        return;
      }

      request.once('error', failRequest);
      signal?.addEventListener?.('abort', abortFromSignal, { once: true });
      if (signal?.aborted) {
        abortFromSignal();
        return;
      }

      if (bodyBuffer !== null) {
        request.end(bodyBuffer);
      } else if (bodyStream) {
        void pipeline(bodyStream, request).catch(failRequest);
      } else {
        request.end();
      }
    });
  };
}

export const localUpstreamFetch = createLocalUpstreamFetch();
export default localUpstreamFetch;

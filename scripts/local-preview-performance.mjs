import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEFAULT_MAX_REQUEST_BODY_BYTES = 48 * 1024 * 1024;

export function requestBodyLimitBytes(env = process.env) {
  const configured = Number(env.LOCAL_PREVIEW_MAX_BODY_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_REQUEST_BODY_BYTES;
}

export class RequestBodyTooLargeError extends Error {
  constructor(limitBytes) {
    super(`Request body exceeds the local preview limit of ${limitBytes} bytes`);
    this.name = 'RequestBodyTooLargeError';
    this.statusCode = 413;
    this.limitBytes = limitBytes;
  }
}

export function readRequestBody(req, maxBytes = requestBodyLimitBytes()) {
  const declaredLength = Number(req.headers?.['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    req.resume();
    return Promise.reject(new RequestBodyTooLargeError(maxBytes));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        chunks.length = 0;
        fail(new RequestBodyTooLargeError(maxBytes));
        req.resume();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, totalBytes));
    };
    const onError = (error) => fail(error);
    const onAborted = () => fail(new Error('Request body upload was aborted'));

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}

function relayHeaders(headers) {
  const output = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding') continue;
    output[key] = value;
  }
  return output;
}

function waitForDrainOrClose(res) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off('drain', onDrain);
      res.off('close', onClose);
      res.off('error', onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    res.once('drain', onDrain);
    res.once('close', onClose);
    res.once('error', onError);
  });
}

export async function relayFetchResponse(req, res, response) {
  const headers = relayHeaders(response.headers);
  const isEventStream = String(response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream');
  if (isEventStream) {
    headers['Cache-Control'] = headers['Cache-Control'] || 'no-cache';
    headers['X-Accel-Buffering'] = 'no';
    res.socket?.setNoDelay(true);
  }

  if (response.statusText) res.writeHead(response.status, response.statusText, headers);
  else res.writeHead(response.status, headers);
  if (req.method === 'HEAD' || !response.body) {
    res.end();
    return;
  }
  if (isEventStream) res.flushHeaders();

  const reader = response.body.getReader();
  let clientDisconnected = false;
  const cancelUpstream = () => {
    if (res.writableEnded) return;
    clientDisconnected = true;
    void reader.cancel('local preview client disconnected').catch(() => {});
  };
  req.once('aborted', cancelUpstream);
  res.once('close', cancelUpstream);

  try {
    while (!clientDisconnected) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await waitForDrainOrClose(res);
    }
    if (!clientDisconnected && !res.writableEnded) res.end();
  } catch (error) {
    if (!clientDisconnected) throw error;
  } finally {
    req.off('aborted', cancelUpstream);
    res.off('close', cancelUpstream);
    if (!clientDisconnected) reader.releaseLock();
  }
}

export async function staticAssetResponse(file, contentType) {
  const stat = await fs.promises.stat(file);
  if (!stat.isFile()) return new Response('not found', { status: 404 });
  const body = Readable.toWeb(fs.createReadStream(file));
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size)
    }
  });
}

export async function sendStaticFile(req, res, file, headers = {}) {
  const stat = await fs.promises.stat(file);
  if (!stat.isFile()) throw new Error('Static asset is not a file');
  res.writeHead(200, { 'Content-Length': String(stat.size), ...headers });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  await pipeline(fs.createReadStream(file), res);
}

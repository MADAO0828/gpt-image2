import { currentUser, json } from '../../_lib/auth.js';
import { bindClientAbort, fetchPinnedUpstream, isUpstreamTimeoutStatus, normalizeSafeBaseUrl, normalizeUpstreamTimeoutSeconds, safeUpstreamEndpoint } from '../../_lib/upstream-url.js';
const MAX_WORKBENCH_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_WORKBENCH_FILE_BYTES = 20 * 1024 * 1024;
const MAX_WORKBENCH_TOTAL_FILE_BYTES = 48 * 1024 * 1024;
const MAX_WORKBENCH_FILE_COUNT = 14;
function requiresRequestDuplex(body) {
  if (!body || typeof body !== 'object') return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return false;
  return typeof body.getReader === 'function' || typeof body.pipe === 'function' || typeof body[Symbol.asyncIterator] === 'function';
}
async function requestWithBodyLimit(request, maxBytes) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw Object.assign(new Error('专业工作台请求体超过安全上限'), { code: 'PRO_WORKBENCH_REQUEST_TOO_LARGE', status: 413 });
  }
  const body = request?.body;
  if (!body?.tee || typeof ReadableStream === 'undefined') return request;
  const [probeBody, replayBody] = body.tee();
  const reader = probeBody.getReader();
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += Number(value?.byteLength || 0);
      if (total > maxBytes) {
        const error = Object.assign(new Error('专业工作台请求体超过安全上限'), { code: 'PRO_WORKBENCH_REQUEST_TOO_LARGE', status: 413 });
        await replayBody.cancel(error).catch(() => {});
        throw error;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const init = { body: replayBody };
  if (requiresRequestDuplex(replayBody)) init.duplex = 'half';
  return new Request(request, init);
}
function validateWorkbenchUpload(request, files = null) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > MAX_WORKBENCH_REQUEST_BYTES) {
    throw Object.assign(new Error('专业工作台请求体超过安全上限'), { code: 'PRO_WORKBENCH_REQUEST_TOO_LARGE', status: 413 });
  }
  if (!Array.isArray(files)) return;
  if (files.length > MAX_WORKBENCH_FILE_COUNT) {
    throw Object.assign(new Error('专业工作台上传图片数量超过安全上限'), { code: 'PRO_WORKBENCH_FILE_COUNT_TOO_LARGE', status: 413 });
  }
  let totalBytes = 0;
  for (const file of files) {
    const size = Number(file?.size);
    if (!Number.isFinite(size) || size < 0 || size > MAX_WORKBENCH_FILE_BYTES) {
      throw Object.assign(new Error('专业工作台单张图片超过 20MB 安全上限'), { code: 'PRO_WORKBENCH_FILE_TOO_LARGE', status: 413 });
    }
    totalBytes += size;
  }
  if (totalBytes > MAX_WORKBENCH_TOTAL_FILE_BYTES) {
    throw Object.assign(new Error('专业工作台图片总大小超过 48MB 安全上限'), { code: 'PRO_WORKBENCH_TOTAL_TOO_LARGE', status: 413 });
  }
}
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; } }); return settings; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function normalizeImageQuality(value, fallback = 'high') { const normalized = String(value || '').trim().toLowerCase(); if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized; if (normalized === 'hd') return 'high'; if (normalized === 'standard') return 'medium'; return ['auto', 'low', 'medium', 'high'].includes(fallback) ? fallback : 'high'; }
function normalizeBaseUrl(raw) { return normalizeSafeBaseUrl(raw, true); }
const IMAGE_RESPONSE_LIMIT = 128 * 1024 * 1024;
const IMAGE_STREAM_EVENT_BUFFER_LIMIT = 4 * 1024 * 1024;
const IMAGE_STREAM_RESPONSE_BUFFER_LIMIT = IMAGE_RESPONSE_LIMIT;
function normalizeImageMime(value) {
  const raw = String(value || '').trim().toLowerCase().split(';')[0];
  if (raw === 'png' || raw === 'image/png') return 'image/png';
  if (raw === 'jpg' || raw === 'jpeg' || raw === 'image/jpg' || raw === 'image/jpeg') return 'image/jpeg';
  if (raw === 'webp' || raw === 'image/webp') return 'image/webp';
  return /^image\/[a-z0-9.+-]+$/.test(raw) ? raw : '';
}
function looksLikeSsePrefix(value) {
  const prefix = String(value || '').replace(/^\uFEFF/, '').trimStart();
  return /^(?:data|event|id|retry)\s*:/i.test(prefix) || prefix.startsWith(':');
}
function looksLikeJsonPrefix(value) {
  const prefix = String(value || '').replace(/^\uFEFF/, '').trimStart();
  return prefix.startsWith('{') || prefix.startsWith('[');
}
function detectImageMimeFromBytes(bytes) {
  if (!bytes || bytes.length < 4) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return '';
}
function imageFormatFromMime(mime) {
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/webp') return 'webp';
  return mime === 'image/png' ? 'png' : '';
}
function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
function bytesToImageDataUrl(bytes, mime) {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}
function isLikelyRawImageBase64(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '');
  return raw.length >= 16 && raw.length % 4 === 0 && /^[A-Za-z0-9+/_=-]+$/.test(raw) && (raw.includes('=') || raw.length >= 32);
}
async function readResponseBytes(body, maxBytes = IMAGE_RESPONSE_LIMIT, onChunk = null) {
  const reader = body?.getReader?.();
  if (!reader) throw new Error('专业工作台图片响应无法读取');
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      total += chunk.byteLength;
      if (total > maxBytes) {
        const error = new Error('专业工作台图片响应超过安全上限');
        error.code = 'UPSTREAM_RESPONSE_TOO_LARGE';
        throw error;
      }
      if (chunk.byteLength) {
        if (typeof onChunk === 'function') onChunk(chunk);
        chunks.push(chunk);
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function readResponseText(body, onChunk = null) {
  const bytes = await readResponseBytes(body, IMAGE_RESPONSE_LIMIT, onChunk);
  return new TextDecoder().decode(bytes);
}
function selectedProfile(settings, explicitProfileId = '') { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const find = id => profiles.find(p => p && (p.id === id || p.name === id)) || null; let base = null; let preferredId = ''; if (explicitProfileId) { preferredId = explicitProfileId; base = find(explicitProfileId); if (!base || (base.apiMode || 'images') !== 'images') throw new Error('Selected render profile is missing or does not support Images API'); } else if (settings.activeImageProfileId) { preferredId = settings.activeImageProfileId; base = find(preferredId); if (!base || (base.apiMode || 'images') !== 'images') throw new Error('Active image profile is missing or does not support Images API'); } else { preferredId = settings.activeProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const active = find(preferredId); base = active && (active.apiMode || 'images') === 'images' ? active : profiles.find(p => p && (p.apiMode || 'images') === 'images') || null; } base = base || {}; return { id: base.id || preferredId, name: base.name || '云端配置', provider: base.provider || 'openai', baseUrl: firstString(base.baseUrl, settings.baseUrl), nativeBaseUrl: firstString(base.nativeBaseUrl, base.googleNativeBaseUrl, settings.nativeBaseUrl, settings.googleNativeBaseUrl), apiKey: firstString(base.apiKey, settings.apiKey), nativeApiKey: firstString(base.nativeApiKey, base.googleNativeApiKey, settings.nativeApiKey, settings.googleNativeApiKey), model: firstString(base.model, settings.model) || 'gpt-image-2', codexCli: asBool(base.codexCli, asBool(settings.codexCli, false)), timeout: asNum(base.timeout, asNum(settings.timeout, 600)), responseFormatB64Json: asBool(base.responseFormatB64Json, asBool(settings.responseFormatB64Json, false)), streamImages: asBool(base.streamImages, asBool(settings.streamImages, false)), streamPartialImages: asNum(base.streamPartialImages, asNum(settings.streamPartialImages, 1)) }; }
function providerKey(profile) { const raw = String(profile.provider || '').toLowerCase(); if (raw.includes('google') || /gemini|banana/i.test(profile.model || '')) return 'google'; if (raw.includes('xai') || raw.includes('grok') || /grok/i.test(profile.model || '')) return 'xai'; return 'openai'; }
function formBool(form, key, fallback) { const value = form.get(key); if (value === null || value === undefined || value === '') return fallback; return /^(1|true|yes|on|b64_json)$/i.test(String(value)); }
function formNum(form, key, fallback) { const n = Number(form.get(key)); return Number.isFinite(n) ? n : fallback; }
function supportsStream(profile) { return providerKey(profile) === 'openai'; }
function boundedPartialImages(value, fallback = 1) { const number = Number(value); const fallbackNumber = Number(fallback); const normalized = Number.isFinite(number) ? number : (Number.isFinite(fallbackNumber) ? fallbackNumber : 1); return Math.max(0, Math.min(3, Math.floor(normalized))); }
function parseStreamDataBlock(block) {
  const data = String(block || '')
    .split(/\r?\n/)
    .filter(line => /^\s*data\s*:/i.test(line))
    .map(line => line.replace(/^\s*data\s*:\s?/i, '').trim())
    .filter(line => line && !/^\[DONE\]$/i.test(line))
    .join('\n')
    .trim();
  return data;
}
function parseStreamEventName(block) {
  const line = String(block || '')
    .split(/\r?\n/)
    .find(item => /^\s*event\s*:/i.test(item));
  return line ? line.replace(/^\s*event\s*:/i, '').trim().slice(0, 160) : '';
}
function streamEventType(payload) {
  const type = String(payload?.type || payload?.event || '').toLowerCase();
  const object = String(payload?.object || '').toLowerCase();
  const upstreamType = String(payload?.upstream_event_type || payload?.upstreamEventType || '').toLowerCase();
  const terminal = /(?:image[._](?:generation|edit)\.(?:result|completed|failed|error|incomplete|cancelled|canceled)|response\.)/;
  if (terminal.test(object)) return object;
  if (terminal.test(upstreamType)) return upstreamType;
  return type || object || upstreamType;
}
function streamCandidateFromObject(payload, object) {
  if (!object || typeof object !== 'object') return null;
  const b64 = [object.b64_json, object.b64Json, object.base64, object.base64_image, object.base64Image, object.image_base64, object.imageBase64]
    .find(value => typeof value === 'string' && value.trim());
  const dataUrl = [object.data_url, object.dataUrl, object.image_data_url, object.imageDataUrl]
    .find(value => typeof value === 'string' && /^data:image\//i.test(value.trim()));
  const url = [object.url, object.image_url, object.imageUrl, object.uri, object.src, object.href, object.download_url, object.downloadUrl]
    .find(value => typeof value === 'string' && /^https?:\/\//i.test(value.trim()));
  const rawImage = typeof object.image === 'string' ? object.image.trim() : '';
  if (!b64 && !dataUrl && !url && rawImage) {
    if (/^data:image\//i.test(rawImage)) return { ...object, data_url: rawImage };
    if (/^https?:\/\//i.test(rawImage)) return { ...object, url: rawImage };
    if (isLikelyRawImageBase64(rawImage)) return { ...object, b64_json: rawImage };
  }
  if (!b64 && !dataUrl && !url) return null;
  return {
    ...object,
    ...(b64 ? { b64_json: b64 } : {}),
    ...(dataUrl ? { data_url: dataUrl } : {}),
    ...(url ? { url } : {})
  };
}
function collectStreamImageCandidates(payload) {
  const candidates = [];
  const seenObjects = new Set();
  const seenValues = new Set();
  const imageKeys = new Set([
    'b64_json', 'b64json', 'base64', 'base64_image', 'base64image',
    'image_base64', 'imagebase64', 'image_data', 'imagedata',
    'image_bytes', 'imagebytes', 'image', 'images', 'data_url', 'dataurl',
    'image_data_url', 'imagedataurl', 'url', 'image_url', 'imageurl',
    'uri', 'src', 'href', 'download_url', 'downloadurl', 'data'
  ]);
  const stack = [{ value: payload, key: '', depth: 0 }];
  let scanned = 0;
  while (stack.length && scanned < 20000) {
    const entry = stack.pop();
    const value = entry?.value;
    const key = String(entry?.key || '').replace(/[-\s]/g, '_').toLowerCase();
    const depth = Number(entry?.depth) || 0;
    if (value === null || value === undefined || depth > 12) continue;
    if (typeof value === 'string') {
      const text = value.trim();
      if (imageKeys.has(key) && (/^data:image\//i.test(text) || /^https?:\/\//i.test(text) || isLikelyRawImageBase64(text))) {
        const key = text;
        if (!seenValues.has(key)) {
          seenValues.add(key);
          candidates.push(/^data:image\//i.test(text) ? { data_url: text } : /^https?:\/\//i.test(text) ? { url: text } : { b64_json: text });
        }
      }
      continue;
    }
    if (typeof value !== 'object' || seenObjects.has(value)) continue;
    seenObjects.add(value);
    scanned += 1;
    const candidate = streamCandidateFromObject(payload, value);
    if (candidate) {
      const key = String(candidate.b64_json || candidate.data_url || candidate.url || '');
      if (!seenValues.has(key)) {
        seenValues.add(key);
        candidates.push(candidate);
      }
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push({ value: value[index], key, depth: depth + 1 });
    } else {
      const entries = Object.entries(value);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [childKey, child] = entries[index];
        if (candidate && imageKeys.has(String(childKey).replace(/[-\s]/g, '_').toLowerCase()) && typeof child !== 'object') continue;
        stack.push({ value: child, key: childKey, depth: depth + 1 });
      }
    }
  }
  return candidates;
}
function streamFailureMessage(payload) {
  const type = streamEventType(payload);
  const status = String(payload?.status || payload?.response?.status || '').toLowerCase();
  const explicit = payload?.error?.message || (typeof payload?.error === 'string' ? payload.error : '') || payload?.response?.error?.message;
  if (!explicit && !/(?:failed|error|incomplete|cancelled|canceled)$/.test(type) && !['failed', 'error', 'incomplete', 'cancelled', 'canceled'].includes(status)) return '';
  return String(explicit || payload?.response?.incomplete_details?.reason || payload?.incomplete_details?.reason || payload?.message || `专业工作台流式接口以 ${status || type.split('.').at(-1) || '失败'} 状态结束`);
}
function streamPayloadWithCandidates(payload, candidates) {
  if (candidates.length) return { ...payload, data: candidates };
  return payload;
}
async function readImageStreamResponse(response, options = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const error = new Error('专业工作台未收到可读取的流式响应');
    error.code = 'IMAGE_STREAM_NO_READER';
    error.stage = 'stream-parse';
    throw error;
  }
  const decoder = new TextDecoder();
  const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null;
  let buffer = '';
  let responseBytes = 0;
  let finalEvent = null;
  const partialByOutput = new Map();
  let doneSignal = false;
  const streamEvents = [];
  let partialCount = 0;
  let lastStreamEventType = '';
  const partialCandidates = () => [...partialByOutput.values()].sort((a, b) => a.outputIndex - b.outputIndex).map((item) => item.candidate);
  const streamContext = () => ({
    partialCandidates: partialCandidates(),
    streamEvents: [...streamEvents],
    streamEventCount: streamEvents.length,
    partialCount,
    lastStreamEventType
  });
  const streamError = (code, message, stage = 'stream-parse') => {
    const error = new Error(message);
    error.code = code;
    error.stage = stage;
    return error;
  };
  const consumeBlock = (block) => {
    if (String(block || '').length > IMAGE_STREAM_EVENT_BUFFER_LIMIT) {
      throw streamError('IMAGE_STREAM_EVENT_TOO_LARGE', '专业工作台单个流式事件超过安全上限');
    }
    const lines = String(block || '').split(/\r?\n/);
    const hasDoneSignal = lines.some(line => /^\s*data\s*:\s*\[DONE\]\s*$/i.test(line));
    const eventName = parseStreamEventName(block);
    const data = parseStreamDataBlock(block);
    if (data) {
      let payload;
      try { payload = JSON.parse(data); } catch { throw streamError('IMAGE_STREAM_PARSE_FAILED', '专业工作台收到无法解析的流式数据'); }
      if (eventName && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        payload = {
          ...payload,
          ...(payload.upstream_event_type || payload.upstreamEventType || payload.type || payload.event
            ? { upstream_event_type: payload.upstream_event_type || payload.upstreamEventType || eventName }
            : { type: eventName })
        };
      }
      const type = streamEventType(payload);
      const candidates = collectStreamImageCandidates(payload);
      lastStreamEventType = type;
      streamEvents.push({
        type: type.slice(0, 80),
        keys: Object.keys(payload || {}).filter(key => !/(?:b64|base64|image_data)/i.test(key)).slice(0, 12),
        candidateCount: candidates.length,
        hasError: Boolean(payload?.error || payload?.response?.error)
      });
      if (streamEvents.length > 24) streamEvents.shift();
      const isPartial = /(?:partial_image|chunk)$/.test(type) && candidates.length > 0;
      const isTerminal = /^(?:image[._](?:generation|edit))\.result$/i.test(type)
        || /(?:image[._](?:generation|edit)|response)\.(?:completed|done)$/.test(type)
        || ['completed', 'succeeded'].includes(String(payload?.status || payload?.response?.status || '').toLowerCase());
      if (isPartial) {
        candidates.forEach((candidate, index) => {
          const rawOutputIndex = candidate?.output_index ?? candidate?.outputIndex ?? payload?.output_index ?? payload?.outputIndex;
          const outputIndex = Number.isFinite(Number(rawOutputIndex)) ? Number(rawOutputIndex) : index;
          const normalizedCandidate = {
            ...candidate,
            output_index: outputIndex,
            outputIndex
          };
          partialByOutput.set(outputIndex, { outputIndex, candidate: normalizedCandidate });
        });
        partialCount += candidates.length;
      }
      const failure = streamFailureMessage(payload);
      if (failure) {
        const error = new Error(failure);
        error.code = 'IMAGE_STREAM_UPSTREAM_FAILED';
        error.stage = 'stream-event';
        error.completionReason = 'upstream-failed';
        Object.assign(error, streamContext());
        throw error;
      }
      if (isTerminal) {
        if (candidates.length) finalEvent = streamPayloadWithCandidates(payload, candidates);
        else if (partialByOutput.size) doneSignal = true;
        else doneSignal = true;
      }
    }
    if (hasDoneSignal && !finalEvent) doneSignal = true;
    return Boolean(finalEvent || doneSignal);
  };
  try {
    while (!finalEvent && !doneSignal) {
      let result;
      try {
        result = await reader.read();
      } catch (error) {
        const transportError = error?.code
          ? error
          : streamError('IMAGE_STREAM_TRANSPORT_INTERRUPTED', '专业工作台流式响应传输中断，请稍后重试', 'stream-transport');
        transportError.recoverable = true;
        throw transportError;
      }
      const { value, done } = result;
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      responseBytes += chunk.byteLength;
      if (responseBytes > IMAGE_STREAM_RESPONSE_BUFFER_LIMIT) {
        throw streamError('IMAGE_STREAM_RESPONSE_TOO_LARGE', '专业工作台流式响应超过安全上限');
      }
      if (chunk.byteLength) onChunk?.(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      let separator = buffer.search(/\r?\n\r?\n/);
      while (separator >= 0 && !finalEvent) {
        const match = buffer.match(/\r?\n\r?\n/);
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + (match?.[0]?.length || 2));
        if (consumeBlock(block)) break;
        separator = buffer.search(/\r?\n\r?\n/);
      }
      if (!finalEvent && buffer.length > IMAGE_STREAM_EVENT_BUFFER_LIMIT) {
        throw streamError('IMAGE_STREAM_EVENT_TOO_LARGE', '专业工作台单个流式事件超过安全上限');
      }
    }
  } catch (error) {
    const normalized = error?.code
      ? error
      : streamError('IMAGE_STREAM_TRANSPORT_INTERRUPTED', '专业工作台流式响应传输中断，请稍后重试', 'stream-transport');
    normalized.recoverable = normalized.recoverable || normalized.code === 'IMAGE_STREAM_TRANSPORT_INTERRUPTED';
    Object.assign(normalized, streamContext());
    await reader.cancel?.().catch?.(() => {});
    throw normalized;
  }
  if (finalEvent || doneSignal) await reader.cancel?.().catch?.(() => {});
  buffer += decoder.decode();
  if (!finalEvent && !doneSignal && buffer.trim()) {
    try {
      if (buffer.length > IMAGE_STREAM_EVENT_BUFFER_LIMIT) {
        throw streamError('IMAGE_STREAM_EVENT_TOO_LARGE', '专业工作台单个流式事件超过安全上限');
      }
      consumeBlock(buffer);
    } catch (error) {
      const normalized = error?.code
        ? error
        : streamError('IMAGE_STREAM_TRANSPORT_INTERRUPTED', '专业工作台流式响应传输中断，请稍后重试', 'stream-transport');
      normalized.recoverable = normalized.recoverable || normalized.code === 'IMAGE_STREAM_TRANSPORT_INTERRUPTED';
      Object.assign(normalized, streamContext());
      throw normalized;
    }
  }
  if (!finalEvent) {
    const error = new Error(partialByOutput.size ? '专业工作台流式接口只返回预览图，未收到最终图片' : '专业工作台流式接口未返回图片数据');
    error.code = partialByOutput.size ? 'IMAGE_STREAM_PARTIAL_ONLY' : 'IMAGE_STREAM_NO_IMAGE';
    error.stage = 'stream-complete';
    Object.assign(error, streamContext());
    throw error;
  }
  const payload = finalEvent;
  if (Array.isArray(payload.data)) return payload;
  if (payload.b64_json || payload.url || payload.image) return { ...payload, data: [payload] };
  throw streamError('IMAGE_STREAM_NO_IMAGE', '专业工作台流式接口未返回可识别的图片数据', 'stream-complete');
}
async function readImageResponsePayload(response, options = {}) {
  if (!response?.body) throw new Error('专业工作台未收到图片响应');
  const contentType = String(response.headers?.get?.('Content-Type') || '').toLowerCase();
  let probeBody;
  let replayBody;
  if (response.body.tee) {
    [probeBody, replayBody] = response.body.tee();
  } else if (response.clone) {
    probeBody = response.body;
    replayBody = response.clone().body;
  } else {
    throw new Error('专业工作台图片响应无法重复读取');
  }
  const probeReader = probeBody.getReader();
  const decoder = new TextDecoder();
  let prefix = '';
  const probeBytes = [];
  let probeByteCount = 0;
  const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null;
  try {
    while (prefix.length < 8192) {
      const { value, done } = await probeReader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      if (chunk.byteLength) onChunk?.(chunk);
      if (probeByteCount < 8192) {
        const clipped = chunk.subarray(0, 8192 - probeByteCount);
        probeBytes.push(clipped);
        probeByteCount += clipped.byteLength;
      }
      prefix += decoder.decode(chunk, { stream: true });
      const normalized = prefix.replace(/^\uFEFF/, '').trimStart();
      if (/^(?:data|event|id|retry)\s*:/i.test(normalized) || normalized.startsWith(':') || normalized.startsWith('{') || normalized.startsWith('[')) break;
    }
    prefix += decoder.decode();
  } finally {
    probeReader.cancel?.().catch?.(() => {});
  }
  const normalized = prefix.replace(/^\uFEFF/, '').trimStart();
  const probeBytesJoined = new Uint8Array(probeByteCount);
  let probeOffset = 0;
  for (const chunk of probeBytes) {
    probeBytesJoined.set(chunk, probeOffset);
    probeOffset += chunk.byteLength;
  }
  const detectedMime = detectImageMimeFromBytes(probeBytesJoined);
  const declaredMime = normalizeImageMime(contentType);
  const looksLikeSse = !detectedMime && (looksLikeSsePrefix(normalized) || (contentType.includes('text/event-stream') && !looksLikeJsonPrefix(normalized)));
  const looksLikeJson = looksLikeJsonPrefix(normalized);
  const looksLikeBinary = Boolean(detectedMime || (declaredMime && !looksLikeSse && !looksLikeJson));
  const replay = new Response(replayBody, { status: response.status, statusText: response.statusText, headers: response.headers });
  if (looksLikeBinary) {
    const bytes = await readResponseBytes(replay.body, IMAGE_RESPONSE_LIMIT, onChunk);
    const mime = detectImageMimeFromBytes(bytes) || declaredMime;
    if (!detectImageMimeFromBytes(bytes) || !mime || !bytes.length) throw new Error('专业工作台返回了无法识别的二进制图片');
    return { data: [{ data_url: bytesToImageDataUrl(bytes, mime), mime_type: mime, output_format: imageFormatFromMime(mime) }] };
  }
  if (looksLikeSse) return readImageStreamResponse(replay, { onChunk });
  const text = await readResponseText(replay.body, onChunk);
  try {
    return JSON.parse(text || '{}');
  } catch {
    if (looksLikeSsePrefix(normalized)) return readImageStreamResponse(new Response(new TextEncoder().encode(text), { status: response.status, headers: { 'Content-Type': 'text/event-stream' } }), { onChunk });
    throw new Error('专业工作台返回了无法解析的图片响应');
  }
}
function providerPayload(provider, params) {
  if (provider === 'google') {
    const imageSize = params.resolution || params.image_size || params.size || '2K';
    const aspectRatio = params.aspectRatio || params.aspect_ratio || '1:1';
    const targetSize = googleOfficialImageSize(imageSize, aspectRatio);
    const normalizedImageSize = String(imageSize || '').toUpperCase();
    return {
      resolution: imageSize,
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      size: imageSize,
      target_size: targetSize || undefined,
      extra_body: {
        generationConfig: {
          response_modalities: ['IMAGE', 'TEXT'],
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            imageSize: normalizedImageSize,
            aspectRatio,
            image_size: normalizedImageSize,
            aspect_ratio: aspectRatio
          }
        },
        generation_config: {
          response_modalities: ['IMAGE', 'TEXT'],
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            imageSize: normalizedImageSize,
            aspectRatio,
            image_size: normalizedImageSize,
            aspect_ratio: aspectRatio
          }
        }
      },
      response_format: 'url'
    };
  }
  if (provider === 'xai') return { resolution: params.resolution || '2k', aspect_ratio: params.aspect_ratio || params.aspectRatio || '1:1' };
  return { size: params.size || 'auto' };
}
const GOOGLE_OFFICIAL_IMAGE_SIZES = {
  '1K': { '1:1': '1024x1024', '3:2': '1264x848', '2:3': '848x1264', '16:9': '1376x768', '9:16': '768x1376', '4:3': '1200x896', '3:4': '896x1200', '4:5': '928x1152', '5:4': '1152x928', '21:9': '1584x672' },
  '2K': { '1:1': '2048x2048', '3:2': '2528x1696', '2:3': '1696x2528', '16:9': '2752x1536', '9:16': '1536x2752', '4:3': '2400x1792', '3:4': '1792x2400', '4:5': '1856x2304', '5:4': '2304x1856', '21:9': '3168x1344' },
  '4K': { '1:1': '4096x4096', '3:2': '5056x3392', '2:3': '3392x5056', '16:9': '5504x3072', '9:16': '3072x5504', '4:3': '4800x3584', '3:4': '3584x4608', '4:5': '3712x4608', '5:4': '4608x3712', '21:9': '6336x2688' }
};
function googleOfficialImageSize(resolution, aspectRatio) {
  const tier = String(resolution || '').trim().toUpperCase();
  const ratio = String(aspectRatio || '1:1').trim() || '1:1';
  return GOOGLE_OFFICIAL_IMAGE_SIZES[tier]?.[ratio] || '';
}
function modeLabel(mode) {
  return mode === 'styleTransfer' ? '灵感迁移' : mode === 'manual' ? '手动模式' : 'AI 模式';
}
function workbenchTimeoutDescriptor(phase) {
  if (phase === 'stream-idle') return {
    code: 'PRO_WORKBENCH_STREAM_IDLE_TIMEOUT',
    stage: 'stream-idle-timeout',
    message: '专业渲染流式响应等待下一段数据超时'
  };
  if (phase === 'total') return {
    code: 'PRO_WORKBENCH_TOTAL_TIMEOUT',
    stage: 'total-timeout',
    message: '专业渲染请求超过当前配置的总超时时间'
  };
  return {
    code: 'PRO_WORKBENCH_RESPONSE_HEADER_TIMEOUT',
    stage: 'response-header-timeout',
    message: '专业渲染等待 API 响应头超时'
  };
}
function safeUpstreamDetail(value, secret) { const text = String(value || ''); return (secret ? text.split(secret).join('[redacted]') : text).slice(0, 600); }

export async function onRequestPost(ctx) {
  const started = Date.now();
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    validateWorkbenchUpload(ctx.request);
  } catch (error) {
    return json({ error: error.message, code: error.code }, error.status || 413);
  }
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const boundedRequest = await requestWithBodyLimit(ctx.request, MAX_WORKBENCH_REQUEST_BYTES);
  const form = await boundedRequest.formData();
  let profile;
  try {
    profile = selectedProfile(settings, String(form.get('profileId') || ''));
  } catch (error) {
    return json({ error: error?.message || 'Invalid image profile configuration', code: 'INVALID_PROFILE_CONFIGURATION' }, 400);
  }
  let baseUrl = '';
  try {
    baseUrl = normalizeBaseUrl(profile.baseUrl);
  } catch (error) {
    return json({ error: error.message || 'API URL is invalid' }, 400);
  }
  const apiKey = String(profile.apiKey || '').trim();
  if (!baseUrl) return json({ error: 'API configuration is incomplete: missing API URL' }, 500);
  if (!apiKey) return json({ error: 'API configuration is incomplete: missing API Key' }, 500);
  const mode = String(form.get('mode') || 'ai');
  const prompt = String(form.get('prompt') || '').trim();
  const params = JSON.parse(String(form.get('params') || '{}'));
  const analysis = JSON.parse(String(form.get('analysis') || '{}'));
  if (!prompt) return json({ error: 'Prompt is required' }, 400);
  const files = [...form.getAll('base[]'), ...form.getAll('ref[]')].filter((item) => item && typeof item.arrayBuffer === 'function');
  const mask = form.get('mask');
  const maskFile = mask && typeof mask.arrayBuffer === 'function' ? mask : null;
  if (maskFile && !/^image\//i.test(String(maskFile.type || ''))) {
    return json({ error: '专业工作台遮罩必须是图片文件', code: 'PRO_WORKBENCH_MASK_TYPE_INVALID' }, 400);
  }
  if (maskFile && !files.length) {
    return json({ error: '专业工作台遮罩缺少对应参考图', code: 'PRO_WORKBENCH_MASK_IMAGE_MISSING' }, 400);
  }
  try {
    validateWorkbenchUpload(ctx.request, [...files, ...(maskFile ? [maskFile] : [])]);
  } catch (error) {
    return json({ error: error.message, code: error.code }, error.status || 413);
  }
  const provider = providerKey(profile);
  const upstreamPath = files.length ? 'images/edits' : 'images/generations';
  const renderPrompt = [
    `${modeLabel(mode)}专业渲染任务`,
    '强保原图建筑结构、透视关系、体块比例、开窗位置、主要构图和空间边界；只调整时间、天气、灯光、材质、配景、人物前景、画面表现和后期调色。',
    prompt,
    analysis.review ? `读图审片：${analysis.review}` : '',
    analysis.intent ? `意图理解：${analysis.intent}` : '',
    analysis.strategy ? `策略封装：${analysis.strategy}` : '',
    Array.isArray(analysis.dimensions) ? `迁移/控制维度：${analysis.dimensions.filter(d => d.enabled !== false).map(d => d.label || d.key || d).join('、')}` : '',
    analysis.negative ? `避免：${analysis.negative}` : ''
  ].filter(Boolean).join('\n');
  const negativePrompt = firstString(params.negativePrompt, params.negative_prompt, params.negative);
  const fd = new FormData();
  fd.append('model', profile.model || 'gpt-image-2');
  fd.append('prompt', renderPrompt);
  if (negativePrompt) fd.append('negative_prompt', negativePrompt);
  Object.entries(providerPayload(provider, params)).forEach(([k, v]) => fd.append(k, v && typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const outputFormat = String(params.output_format || params.format || settings.output_format || 'png').toLowerCase();
  if (!profile.codexCli) fd.append('quality', normalizeImageQuality(params.quality || settings.quality));
  fd.append('n', String(provider === 'google' ? 1 : asNum(params.count || params.n || settings.n, 1)));
  fd.append('output_format', outputFormat);
  fd.append('moderation', String(params.moderation || settings.moderation || 'auto'));
  const outputCompression = params.output_compression ?? params.compression ?? settings.output_compression;
  if (outputFormat === 'png') {
    const transparentValue = params.transparent_background ?? params.transparent ?? settings.transparent_output ?? false;
    fd.append('transparent_background', String(transparentValue));
    if (/^(1|true|yes|on)$/i.test(String(transparentValue))) fd.append('background', 'transparent');
  }
  else fd.append('output_compression', String(outputCompression ?? 90));
  const imageFieldName = 'image[]';
  files.forEach((file, index) => fd.append(imageFieldName, file, file.name || `pro-reference-${index + 1}.png`));
  if (maskFile) fd.append('mask', maskFile, maskFile.name || 'mask.png');
  if (formBool(form, 'response_format', profile.responseFormatB64Json) && provider !== 'google' && provider !== 'xai') fd.append('response_format', 'b64_json');
  if (formBool(form, 'stream', profile.streamImages) && supportsStream(profile)) {
    fd.append('stream', 'true');
    fd.append('partial_images', String(boundedPartialImages(formNum(form, 'partial_images', profile.streamPartialImages), 1)));
  }
  const requestBody = files.length ? fd : (() => {
    const count = asNum(params.count || params.n || settings.n, 1);
    const body = {
      model: profile.model || 'gpt-image-2',
      prompt: renderPrompt,
      ...providerPayload(provider, params),
      output_format: outputFormat,
      moderation: String(params.moderation || settings.moderation || 'auto')
    };
    if (!profile.codexCli) body.quality = normalizeImageQuality(params.quality || settings.quality);
    if (provider !== 'google' && count > 1) body.n = count;
    if (outputFormat === 'png') {
      const transparentValue = params.transparent_background ?? params.transparent ?? settings.transparent_output ?? false;
      body.transparent_background = transparentValue;
      if (/^(1|true|yes|on)$/i.test(String(transparentValue))) body.background = 'transparent';
    } else {
      body.output_compression = outputCompression ?? 90;
    }
    if (formBool(form, 'response_format', profile.responseFormatB64Json) && provider !== 'google' && provider !== 'xai') body.response_format = 'b64_json';
    if (formBool(form, 'stream', profile.streamImages) && supportsStream(profile)) {
      body.stream = true;
      body.partial_images = boundedPartialImages(formNum(form, 'partial_images', profile.streamPartialImages), 1);
    }
    return JSON.stringify(body);
  })();
  const requestHeaders = {
    Authorization: `Bearer ${apiKey}`,
    ...(files.length ? {} : { 'Content-Type': 'application/json' })
  };
  const controller = new AbortController();
  const timeoutOverride = Number(ctx.request.headers.get('X-GPT-Image-Timeout-Seconds'));
  const requestedTimeout = Number.isFinite(timeoutOverride) && timeoutOverride > 0 ? timeoutOverride : asNum(profile.timeout, 600);
  const timeoutSeconds = normalizeUpstreamTimeoutSeconds(requestedTimeout);
  const timeoutMs = timeoutSeconds * 1000;
  const streamIdleTimeoutMs = Math.max(250, Math.floor(timeoutMs / 2));
  const clientAbort = bindClientAbort(ctx.request, controller);
  let timeoutId = null;
  let totalTimeoutId = null;
  let timeoutPhase = 'response-header';
  let timeoutCleared = false;
  const armTimeout = (phase) => {
    if (timeoutCleared) return;
    timeoutPhase = phase;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), phase === 'stream-idle' ? streamIdleTimeoutMs : timeoutMs);
    timeoutId.unref?.();
  };
  const armTotalTimeout = () => {
    if (timeoutCleared) return;
    if (totalTimeoutId) clearTimeout(totalTimeoutId);
    totalTimeoutId = setTimeout(() => {
      timeoutPhase = 'total';
      controller.abort();
    }, timeoutMs);
    totalTimeoutId.unref?.();
  };
  const clearTimeoutState = () => {
    if (timeoutCleared) return;
    timeoutCleared = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (totalTimeoutId) clearTimeout(totalTimeoutId);
  };
  armTotalTimeout();
  const resetStreamIdle = () => armTimeout('stream-idle');
  armTimeout('response-header');
  let upstream = null;
  let responseHeaderMs = 0;
  let streamReadMs = 0;
  try {
    let data;
    const endpoint = safeUpstreamEndpoint(baseUrl, upstreamPath);
    const upstreamStartedAt = Date.now();
    const pinned = await fetchPinnedUpstream(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
      redirect: 'manual'
    }, {
      allowedHosts: ctx.env?.UPSTREAM_ALLOWED_HOSTS,
      requireAllowlist: String(ctx.env?.UPSTREAM_ALLOWLIST_REQUIRED || '').toLowerCase() === 'true'
    });
    upstream = pinned.response;
    responseHeaderMs = Date.now() - upstreamStartedAt;
    resetStreamIdle();
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel?.().catch?.(() => {});
      return json({ error: '专业渲染上游重定向已阻止', code: 'UPSTREAM_REDIRECT_BLOCKED', stage: 'upstream-redirect', timeoutSeconds }, 502);
    }
    if (!upstream.ok) {
      const text = upstream.body ? await readResponseText(upstream.body, resetStreamIdle) : await upstream.text();
      clearTimeoutState();
      if (isUpstreamTimeoutStatus(upstream.status, text)) {
        return json({ error: '专业渲染等待上游超时', code: 'UPSTREAM_CLOUDFLARE_TIMEOUT', stage: 'upstream-response', timeoutSeconds, detail: safeUpstreamDetail(text, apiKey) }, 504);
      }
      return json({ error: '上游渲染失败', code: 'PRO_WORKBENCH_UPSTREAM_ERROR', stage: 'upstream-response', status: upstream.status, detail: safeUpstreamDetail(text, apiKey) }, 502);
    }
    const streamStartedAt = Date.now();
    data = await readImageResponsePayload(upstream, { onChunk: resetStreamIdle });
    streamReadMs = Date.now() - streamStartedAt;
    clearTimeoutState();
    return json({
      ...data,
      returnedPrompt: data.revised_prompt || data.revisedPrompt || prompt,
      returnedParams: {
        source: `${profile.name} · ${profile.model}`,
        size: data.size || params.size || params.resolution || 'auto',
        aspectRatio: data.aspect_ratio || data.aspectRatio || params.aspectRatio || params.aspect_ratio || 'auto',
        quality: normalizeImageQuality(params.quality || settings.quality),
        format: outputFormat,
        compression: outputCompression ?? 90,
        transparent: !!(params.transparent_background ?? params.transparent ?? settings.transparent_output),
        moderation: params.moderation || settings.moderation || 'auto',
        count: Array.isArray(data.data) ? data.data.length : asNum(params.count || params.n || settings.n, 1)
      },
      workflowName: '专业工作台',
      workflowNodeId: mode,
      batchLabel: modeLabel(mode),
      proMode: mode,
      analysisSnapshot: analysis,
      selectedDimensions: analysis.dimensions || params.selectedDimensions || {},
      structureLock: true,
      timing: { responseHeaderMs, streamReadMs, totalMs: Date.now() - started },
      elapsedMs: Date.now() - started
    });
  } catch (e) {
    if (clientAbort.wasAborted()) {
      return json({ error: '专业渲染请求已取消', code: 'CLIENT_ABORTED', stage: 'client-abort' }, 499);
    }
    const timedOut = controller.signal.aborted || e?.name === 'AbortError' || e?.code === 'UPSTREAM_DNS_TIMEOUT';
    if (e?.code === 'UPSTREAM_DNS_REJECTED') return json({ error: e.message, code: e.code, stage: 'upstream-dns' }, 400);
    if (e?.code === 'UPSTREAM_HOST_ALLOWLIST_MISSING' || e?.code === 'UPSTREAM_HOST_ALLOWLIST_INVALID' || e?.code === 'UPSTREAM_HOST_NOT_ALLOWED') return json({ error: e.message, code: e.code, stage: 'upstream-host-policy' }, 400);
    if (e?.code === 'UPSTREAM_DNS_REBOUND' || e?.code === 'UPSTREAM_DNS_FAILED') return json({ error: e.message, code: e.code, stage: 'upstream-dns' }, 502);
    const status = timedOut ? 504 : 502;
    const timeoutDescriptor = workbenchTimeoutDescriptor(timeoutPhase);
    const modeText = files.length ? '参考图渲染' : '纯提示词渲染';
    const suggestion = provider === 'google' || provider === 'xai' ? '参考图请求已走当前中转站兼容接口；请检查该模型的图生图通道状态、图片大小/格式和服务商后台错误。' : '请检查 API 地址、模型名称和服务商状态后重试。';
    const errorCode = timedOut ? timeoutDescriptor.code : e?.code || 'PRO_WORKBENCH_RENDER_FAILED';
    const errorStage = timedOut ? timeoutDescriptor.stage : e?.stage || 'render-request';
    return json({
      error: timedOut
        ? timeoutDescriptor.message
        : `专业渲染代理失败：${safeUpstreamDetail(e?.message || String(e), apiKey)}。模型：${profile.name || profile.id || profile.model} / ${profile.model}；供应商：${provider}；模式：${modeText}。${suggestion}`,
      code: errorCode,
      stage: errorStage,
      timeoutSeconds,
      timing: { responseHeaderMs, streamReadMs, totalMs: Date.now() - started },
      partialCandidates: Array.isArray(e?.partialCandidates) ? e.partialCandidates : [],
      streamEvents: Array.isArray(e?.streamEvents) ? e.streamEvents : [],
      streamEventCount: Number(e?.streamEventCount || 0),
      partialCount: Number(e?.partialCount || 0),
      lastStreamEventType: e?.lastStreamEventType || ''
    }, status);
  } finally {
    clearTimeoutState();
    clientAbort.cleanup();
  }
}

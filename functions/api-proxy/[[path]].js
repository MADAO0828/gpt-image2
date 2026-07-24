import { currentUser, json } from '../_lib/auth.js';
import { decodeProfileHeaderValue, encodeProfileHeaderValue, parseProfileSelectionValue } from '../_lib/profile-header.js';
import { assertUpstreamHostAllowed, bindClientAbort, fetchPinnedUpstream, fetchWithPinnedAddress, isPrivateIpAddress as isSharedPrivateIpAddress, normalizeSafeBaseUrl, normalizeUpstreamTimeoutSeconds, resolvePublicAddresses, safeUpstreamEndpoint } from '../_lib/upstream-url.js';
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; } }); return settings; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function normalizeImageQuality(value, fallback = 'high') { const normalized = String(value || '').trim().toLowerCase(); if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized; if (normalized === 'hd') return 'high'; if (normalized === 'standard') return 'medium'; return ['auto', 'low', 'medium', 'high'].includes(fallback) ? fallback : 'high'; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function findProfileById(settings, profileId) {
  const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
  const selection = parseProfileSelectionValue(profileId);
  if (!selection.value) return null;
  if (selection.kind === 'id') return profiles.find(p => p && String(p.id ?? '') === selection.value) || null;
  if (selection.kind === 'name') return profiles.find(p => p && String(p.name ?? '') === selection.value) || null;
  return profiles.find(p => p && (String(p.id ?? '') === selection.value || String(p.name ?? '') === selection.value)) || null;
}
function normalizeAgentMode(value) { value = String(value || 'off'); if (value === 'same') return 'native'; if (value === 'custom') return 'hybrid'; return value === 'native' || value === 'hybrid' ? value : 'off'; }
function selectedProfile(settings, apiPath = '', explicitProfileId = '') { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const activeId = settings.activeProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const activeImageId = settings.activeImageProfileId || ''; const cleanPath = String(apiPath || '').replace(/^\/+/, ''); const mode = normalizeAgentMode(settings.agentApiConfigMode); const isResponsesPath = /^responses(?:$|\?|\/)/.test(cleanPath); const isImagesPath = /^images(?:$|\?|\/)/.test(cleanPath); const explicit = findProfileById(settings, explicitProfileId); let found = null; if (isResponsesPath) { if (explicitProfileId) { if (!explicit || explicit.apiMode !== 'responses') throw new Error('Selected Agent text profile is missing or does not support Responses API'); found = explicit; } else if (mode === 'hybrid') { const agentText = findProfileById(settings, settings.agentTextProfileId); if (!agentText || agentText.apiMode !== 'responses') throw new Error('Hybrid Agent text profile is missing or does not support Responses API'); found = agentText; } else { found = findProfileById(settings, activeId) || null; if (!found || found.apiMode !== 'responses') throw new Error('Active profile does not support Responses API'); } } else if (isImagesPath) { if (explicitProfileId) { if (!explicit || (explicit.apiMode || 'images') !== 'images') throw new Error('Selected image profile is missing or does not support Images API'); found = explicit; } else if (activeImageId) { found = findProfileById(settings, activeImageId); if (!found || (found.apiMode || 'images') !== 'images') throw new Error('Active image profile is missing or does not support Images API'); } else { const active = findProfileById(settings, activeId); found = active && (active.apiMode || 'images') === 'images' ? active : profiles.find(p => p && (p.apiMode || 'images') === 'images') || null; } } else { found = explicit || findProfileById(settings, activeId) || profiles[0] || null; } const base = found || {}; return {
  id: base.id || activeId || 'default-openai',
  name: base.name || '\u4e91\u7aef\u914d\u7f6e',
  provider: base.provider || 'openai',
  baseUrl: firstString(base.baseUrl, settings.baseUrl),
  apiKey: firstString(base.apiKey, settings.apiKey),
  model: firstString(base.model, settings.model) || 'gpt-image-2',
  timeout: asNum(base.timeout, asNum(settings.timeout, 600)),
  apiMode: base.apiMode || settings.apiMode || 'images',
  codexCli: asBool(base.codexCli, asBool(settings.codexCli, false)),
  apiProxy: asBool(base.apiProxy, asBool(settings.apiProxy, true)),
  responseFormatB64Json: asBool(base.responseFormatB64Json, asBool(settings.responseFormatB64Json, false)),
  streamImages: asBool(base.streamImages, asBool(settings.streamImages, false)),
  streamPartialImages: asNum(base.streamPartialImages, asNum(settings.streamPartialImages, 1)),
  streamResponses: asBool(base.streamResponses, asBool(settings.streamResponses, false)),
  responsesStream: asBool(base.responsesStream, asBool(settings.responsesStream, false)),
  agentReasoningEffort: settings.agentReasoningEffort || 'medium'
}; }
function clientProfile(profile) { const useProxy = profile.apiProxy !== false; return { ...profile, baseUrl: profile.baseUrl || '', apiKey: useProxy ? (profile.apiKey ? 'cloudflare-proxy' : '') : profile.apiKey, apiProxy: useProxy } }
function sanitizeProfiles(settings) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; if (!profiles.length) return []; return profiles.map((p, index) => clientProfile({
  id: p.id || ('profile-' + index),
  name: p.name || p.id || ('配置 ' + (index + 1)),
  provider: p.provider || 'openai',
  baseUrl: p.baseUrl || '',
  apiKey: p.apiKey || '',
  model: p.model || settings.model || 'gpt-image-2',
  timeout: asNum(p.timeout, asNum(settings.timeout, 600)),
  apiMode: p.apiMode || settings.apiMode || 'images',
  codexCli: asBool(p.codexCli, asBool(settings.codexCli, false)),
  apiProxy: asBool(p.apiProxy, asBool(settings.apiProxy, true)),
  responseFormatB64Json: asBool(p.responseFormatB64Json, asBool(settings.responseFormatB64Json, false)),
  streamImages: asBool(p.streamImages, asBool(settings.streamImages, false)),
  streamPartialImages: asNum(p.streamPartialImages, asNum(settings.streamPartialImages, 1)),
  streamResponses: asBool(p.streamResponses, asBool(settings.streamResponses, false)),
  responsesStream: asBool(p.responsesStream, asBool(settings.responsesStream, false))
})); }

function isSameOriginRequest(request) {
  const origin = String(request.headers.get('Origin') || '').trim();
  if (!origin) return true;
  try { return origin === new URL(request.url).origin; } catch (error) { return false; }
}
function corsHeaders(request, headers = {}) {
  const result = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-GPT-Image-Profile-Id, X-GPT-Image-Timeout-Seconds, X-GPT-Image-Entry, X-GPT-Image-Response-B64, X-GPT-Image-Stream, X-GPT-Image-Partial-Images',
    'Access-Control-Expose-Headers': 'Retry-After, X-GPT-Image-Upstream-Ms, X-GPT-Image-Proxy-Ms, X-GPT-Image-Trace-Id, X-GPT-Image-Proxy-Stage, X-GPT-Image-Proxy-Status, X-GPT-Image-Proxy-Content-Type, X-GPT-Image-Transport-Raw-Bytes, X-GPT-Image-Transport-Delivered-Bytes, X-GPT-Image-Transport-Encoding, X-GPT-Image-Transport-Decoded-Encoding, X-GPT-Image-Transport-Decompressed, X-GPT-Image-Profile-Id, X-GPT-Image-Profile-Name, X-GPT-Image-Proxy-Streamed, X-GPT-Image-Proxy-Probed',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    ...headers
  };
  const origin = String(request.headers.get('Origin') || '').trim();
  if (origin && isSameOriginRequest(request)) {
    result['Access-Control-Allow-Origin'] = origin;
    result['Access-Control-Allow-Credentials'] = 'true';
  }
  return result;
}
function isEventStream(headers) { return (headers.get('Content-Type') || '').toLowerCase().includes('text/event-stream'); }
function looksLikeCloudflareTimeout(text, status) {
  const numericStatus = Number(status);
  const lower = String(text || '').toLowerCase();
  if ([408, 504, 524].includes(numericStatus)) return true;
  const timeoutMarker = /\b(?:gateway\s+timeout|upstream\s+timeout|request\s+timeout|connection\s+timeout|connect(?:ion)?\s+timed?\s*out|request\s+timed?\s*out|timed?\s*out|timeout)\b/i.test(lower);
  return lower.includes('524: a timeout occurred')
    || lower.includes('error code 524')
    || (lower.includes('cloudflare') && lower.includes('timeout'))
    || (numericStatus >= 500 && numericStatus < 600 && timeoutMarker)
    || (numericStatus >= 502 && numericStatus < 600 && lower.trim().startsWith('<!doctype'));
}
function looksLikeHtml(text, contentType) { const lowerType = String(contentType || '').toLowerCase(); const trimmed = String(text || '').trim().toLowerCase(); return lowerType.includes('text/html') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<body'); }
function isMobileRequest(request) { return /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|XWEB|TBS/i.test(request.headers.get('User-Agent') || ''); }
function isImageApiPath(apiPath) { return /^images\//i.test(String(apiPath || '').replace(/^\/+/, '')); }
function isResponsesApiPath(apiPath) { return /^responses(?:$|\?|\/)/i.test(String(apiPath || '').replace(/^\/+/, '')); }
function isGoogleImageProfile(profile) {
  const raw = String(profile && profile.provider || '').toLowerCase();
  const model = String(profile && profile.model || '').toLowerCase();
  return raw.includes('google') || model.includes('gemini') || model.includes('banana');
}
function isStreamCompatibleImageProfile(profile) {
  if (!profile) return false;
  const raw = String(profile.provider || '').toLowerCase();
  const model = String(profile.model || '').toLowerCase();
  if (raw.includes('google') || raw.includes('xai') || model.includes('gemini') || model.includes('banana') || model.includes('grok')) return false;
  return (profile.apiMode || 'images') === 'images';
}
function headerBool(headers, name, fallback) {
  const value = headers.get(name);
  if (value === null || value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}
function headerNum(headers, name, fallback) {
  const value = Number(headers.get(name));
  return Number.isFinite(value) ? value : fallback;
}
function boundedPartialImages(value, fallback = 1) {
  const number = Number(value);
  const fallbackNumber = Number(fallback);
  const normalized = Number.isFinite(number) ? number : (Number.isFinite(fallbackNumber) ? fallbackNumber : 1);
  return Math.max(0, Math.min(3, Math.floor(normalized)));
}
const GOOGLE_IMAGE_RESOLUTIONS = new Set(['1K', '2K', '4K']);
const GOOGLE_IMAGE_ASPECT_RATIOS = new Set(['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
function normalizeGoogleImageResolution(value, fallback = '2K') {
  const normalized = String(value || '').trim().toUpperCase();
  return GOOGLE_IMAGE_RESOLUTIONS.has(normalized) ? normalized : fallback;
}
function normalizeGoogleImageAspectRatio(value, fallback = '1:1') {
  const normalized = String(value || '').trim();
  return GOOGLE_IMAGE_ASPECT_RATIOS.has(normalized) ? normalized : fallback;
}
function parseGoogleExtraBody(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}
function googleCompatExtraBody(value, imageSize, aspectRatio) {
  const source = parseGoogleExtraBody(value);
  const sourceGeneration = source.generationConfig && typeof source.generationConfig === 'object' && !Array.isArray(source.generationConfig)
    ? source.generationConfig
    : {};
  const generationConfig = { ...sourceGeneration };
  // Gateways disagree on snake_case aliases. Keep one camelCase imageConfig authoritative.
  delete generationConfig.imageConfig;
  delete generationConfig.image_config;
  delete generationConfig.response_modalities;
  if (!Array.isArray(generationConfig.responseModalities)) generationConfig.responseModalities = ['IMAGE', 'TEXT'];
  generationConfig.imageConfig = {
    imageSize: normalizeGoogleImageResolution(imageSize),
    aspectRatio: normalizeGoogleImageAspectRatio(aspectRatio)
  };
  const normalized = { ...source, generationConfig };
  delete normalized.generation_config;
  delete normalized.imageConfig;
  delete normalized.image_config;
  return normalized;
}
function removeGoogleLegacySizeFields(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (/^target(?:_|)size$/i.test(key)) delete value[key];
  }
}
function sanitizeGoogleImageBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const format = body.response_format;
  if (format && typeof format === 'object' && !Array.isArray(format)) {
    if (format.resolution !== undefined && body.resolution === undefined) body.resolution = format.resolution;
    if (format.image_size !== undefined && body.image_size === undefined) body.image_size = format.image_size;
    if (format.aspect_ratio !== undefined && body.aspect_ratio === undefined) body.aspect_ratio = format.aspect_ratio;
    if (format.aspectRatio !== undefined && body.aspect_ratio === undefined) body.aspect_ratio = format.aspectRatio;
    if (format.quality !== undefined && body.quality === undefined) body.quality = format.quality;
    if (format.output_format !== undefined && body.output_format === undefined) body.output_format = format.output_format;
    if (format.format !== undefined && body.output_format === undefined) body.output_format = format.format;
    if (format.output_compression !== undefined && body.output_compression === undefined) body.output_compression = format.output_compression;
    if (format.compression !== undefined && body.output_compression === undefined) body.output_compression = format.compression;
    if (format.transparent_background !== undefined && body.transparent_background === undefined) body.transparent_background = format.transparent_background;
    if (format.transparent !== undefined && body.transparent_background === undefined) body.transparent_background = format.transparent;
    if (format.background !== undefined && body.background === undefined) body.background = format.background;
    if (format.moderation !== undefined && body.moderation === undefined) body.moderation = format.moderation;
    if (body.googleExactSizeUnsupported || body.legacy_google_size) delete body.response_format;
  }
  const imageSize = normalizeGoogleImageResolution(body.image_size ?? body.resolution ?? body.size);
  const aspectRatio = normalizeGoogleImageAspectRatio(body.aspect_ratio ?? body.aspectRatio ?? body.ratio);
  body.resolution = imageSize;
  body.image_size = imageSize;
  body.size = imageSize;
  body.aspect_ratio = aspectRatio;
  delete body.aspectRatio;
  delete body.ratio;
  removeGoogleLegacySizeFields(body);
  body.extra_body = googleCompatExtraBody(body.extra_body, imageSize, aspectRatio);
  return body;
}
function providerKey(profile) {
  const raw = String(profile && profile.provider || '').toLowerCase();
  const model = String(profile && profile.model || '').toLowerCase();
  if (raw.includes('google') || model.includes('gemini') || model.includes('banana')) return 'google';
  if (raw.includes('xai') || raw.includes('grok') || model.includes('grok')) return 'xai';
  return 'openai';
}
function isMultipart(headers) {
  return String(headers.get('Content-Type') || '').toLowerCase().includes('multipart/form-data');
}
function safeContentType(value) {
  const normalized = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized) ? normalized : '';
}
function safeMultipartFieldName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64);
}
function safeMultipartFilename(value) {
  const basename = String(value || '').split(/[\\/]/).pop() || '';
  return basename.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 128);
}
function summarizeMultipartFormData(form) {
  if (!form || typeof form.entries !== 'function') return undefined;
  const fieldOrder = [];
  const files = [];
  let fieldCount = 0;
  let imageCount = 0;
  let imageArrayCount = 0;
  for (const [key, value] of form.entries()) {
    fieldCount += 1;
    if (fieldOrder.length < 64) fieldOrder.push(safeMultipartFieldName(key));
    if (key === 'image[]') imageArrayCount += 1;
    if (key === 'image[]' || key === 'image') imageCount += 1;
    if (value && typeof value === 'object' && typeof value.name === 'string') {
      if (files.length < 16) {
        const size = Number(value.size);
        files.push({
          field: safeMultipartFieldName(key),
          filename: safeMultipartFilename(value.name),
          contentType: safeContentType(value.type),
          ...(Number.isFinite(size) && size >= 0 ? { size: Math.min(Math.floor(size), PROXY_REQUEST_BODY_LIMIT) } : {})
        });
      }
    }
  }
  return { fieldOrder, fieldCount, imageCount, imageArrayCount, files };
}
const IMAGE_RESPONSE_LIMIT = 128 * 1024 * 1024;
const PROXY_REQUEST_BODY_LIMIT = 64 * 1024 * 1024;
const SUPPORTED_CONTENT_ENCODINGS = new Set(['gzip', 'deflate', 'br', 'identity']);
function unknownContentEncoding(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const tokens = raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return raw;
  return tokens.some((token) => !SUPPORTED_CONTENT_ENCODINGS.has(token)) ? raw : '';
}
function normalizeImageMime(value) {
  const raw = String(value || '').trim().toLowerCase().split(';')[0];
  if (raw === 'png' || raw === 'image/png') return 'image/png';
  if (raw === 'jpg' || raw === 'jpeg' || raw === 'image/jpg' || raw === 'image/jpeg') return 'image/jpeg';
  if (raw === 'webp' || raw === 'image/webp') return 'image/webp';
  if (raw === 'gif' || raw === 'image/gif') return 'image/gif';
  return /^image\/[a-z0-9.+-]+$/.test(raw) ? raw : '';
}
function detectImageMimeFromBytes(bytes) {
  if (!bytes || bytes.length < 4) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif';
  return '';
}
function joinByteChunks(chunks, total) {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function sniffImageBody(body, maxBytes = 8192, options = {}) {
  if (!body?.tee) return { body, mime: '' };
  const [probeBody, replayBody] = body.tee();
  const reader = probeBody.getReader();
  const chunks = [];
  let total = 0;
  let prefix = '';
  const decoder = new TextDecoder();
  const stopAfterFirstChunk = options.stopAfterFirstChunk === true;
  const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null;
  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      const clipped = chunk.subarray(0, Math.max(0, maxBytes - total));
      if (clipped.byteLength) {
        onChunk?.(clipped);
        chunks.push(clipped);
        total += clipped.byteLength;
        prefix += decoder.decode(clipped, { stream: true });
        const identifiedMime = detectImageMimeFromBytes(joinByteChunks(chunks, total));
        const identifiedSse = looksLikeSsePrefix(prefix);
        const identifiedJson = looksLikeJsonPrefix(prefix);
        if (identifiedMime || identifiedSse || identifiedJson) break;
        if (stopAfterFirstChunk && !isPotentialSsePrefix(prefix)) break;
      }
    }
    prefix += decoder.decode();
  } finally {
    reader.cancel?.().catch?.(() => {});
    reader.releaseLock?.();
  }
  return { body: replayBody, mime: detectImageMimeFromBytes(joinByteChunks(chunks, total)), prefix };
}
function localOriginalMultipartBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}
function localOriginalMultipartBody(env, request) {
  if (!isMultipart(request?.headers)) return null;
  const bytes = localOriginalMultipartBytes(env?.LOCAL_ORIGINAL_REQUEST_BODY);
  if (!bytes) return null;
  if (bytes.byteLength > PROXY_REQUEST_BODY_LIMIT) {
    const error = new Error('代理请求体超过安全上限');
    error.code = 'PROXY_REQUEST_BODY_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  return bytes;
}
async function inspectMultipartModel(request, originalBody = null) {
  if (originalBody) {
    const headers = new Headers();
    headers.set('Content-Type', request.headers.get('Content-Type') || '');
    const probeRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: originalBody
    });
    const input = await probeRequest.formData();
    return {
      body: originalBody,
      requestedModel: String(input.get('model') || '').trim(),
      multipart: summarizeMultipartFormData(input)
    };
  }
  const body = request.body;
  if (!body?.tee) {
    const input = await request.clone().formData();
    return {
      body,
      requestedModel: String(input.get('model') || '').trim(),
      multipart: summarizeMultipartFormData(input)
    };
  }
  const [probeBody, replayBody] = body.tee();
  const probeInit = { body: probeBody };
  if (requiresNodeDuplex(probeBody)) probeInit.duplex = 'half';
  const probeRequest = new Request(request, probeInit);
  const input = await probeRequest.formData();
  return {
    body: replayBody,
    requestedModel: String(input.get('model') || '').trim(),
    multipart: summarizeMultipartFormData(input)
  };
}
function isImageContentType(value) {
  return normalizeImageMime(value).startsWith('image/');
}
function looksLikeSsePrefix(value) {
  const prefix = String(value || '').replace(/^\uFEFF/, '');
  return /^\s*(?:data|event|id|retry)\s*:/i.test(prefix) || /^\s*:/i.test(prefix);
}
function isPotentialSsePrefix(value) {
  const raw = String(value || '').replace(/^\uFEFF/, '');
  const prefix = raw.trimStart();
  if (!prefix || looksLikeSsePrefix(raw)) return true;
  const firstLine = prefix.split(/\r?\n/, 1)[0];
  if (firstLine.includes(':')) return false;
  return /^(?:d|da|dat|data|e|ev|eve|even|event|i|id|r|re|ret|retr|retry)$/i.test(firstLine);
}
function looksLikeJsonPrefix(value) {
  const prefix = String(value || '').replace(/^\uFEFF/, '').trimStart();
  return prefix.startsWith('{') || prefix.startsWith('[');
}
function isPrivateRemoteHostname(value) {
  const host = String(value || '').trim().toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home') || host === 'host.docker.internal' || host.includes(':')) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const octets = host.split('.').map(Number);
  if (octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return true;
  const [a, b, c, d] = octets;
  return a === 0
    || a === 10
    || a === 100 && b >= 64 && b <= 127
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && (b === 0 || b === 2 || b === 168 || b === 88 && c === 99)
    || a === 198 && (b === 18 || b === 19 || b === 51)
    || a === 203 && b === 0 && c === 113
    || a >= 224
    || a === 255 && b === 255 && c === 255 && d === 255;
}
function isPrivateIpAddress(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ? isPrivateRemoteHostname(host)
    : isSharedPrivateIpAddress(host);
}
function normalizeRemoteIpAddress(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes(':')) return host;
  try {
    return new URL(`https://[${host}]/`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return host;
  }
}
async function assertPublicRemoteHostname(hostname, signal, options = {}) {
  const host = String(hostname || '').trim().toLowerCase();
  if (isPrivateRemoteHostname(host)) {
    const error = new Error('远程图片地址不允许访问内部网络');
    error.code = 'REMOTE_IMAGE_HOST_REJECTED';
    throw error;
  }
  try {
    return await resolvePublicAddresses(host, signal, { allowReservedTestHostname: false, fetchImpl: options.fetchImpl });
  } catch (error) {
    if (error?.code === 'UPSTREAM_DNS_REJECTED') {
      const mapped = new Error('远程图片地址解析未通过安全校验');
      mapped.code = 'REMOTE_IMAGE_HOST_REJECTED';
      throw mapped;
    }
    const wrapped = new Error(error?.code === 'UPSTREAM_DNS_TIMEOUT' ? '远程图片域名校验超时' : '远程图片域名校验失败');
    wrapped.name = error?.code === 'UPSTREAM_DNS_TIMEOUT' ? 'AbortError' : 'Error';
    wrapped.code = error?.code === 'UPSTREAM_DNS_TIMEOUT' ? 'REMOTE_IMAGE_DNS_TIMEOUT' : 'REMOTE_IMAGE_DNS_FAILED';
    throw wrapped;
  }
}
function sameDnsAnswers(first, second) {
  return Array.isArray(first)
    && Array.isArray(second)
    && first.length === second.length
    && first.every((address, index) => address === second[index]);
}
function safeRemoteImageUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error('远程图片地址无效');
  }
  if (parsed.protocol !== 'https:') throw new Error('远程图片地址必须使用 HTTPS');
  if (parsed.username || parsed.password || isPrivateRemoteHostname(parsed.hostname)) {
    throw new Error('远程图片地址不允许访问内部网络');
  }
  parsed.hash = '';
  return parsed;
}
function remoteImageAllowlistError(code) {
  return code === 'REMOTE_IMAGE_ALLOWLIST_MISSING'
    || code === 'REMOTE_IMAGE_ALLOWLIST_INVALID'
    || code === 'REMOTE_IMAGE_HOST_NOT_ALLOWED';
}
function assertRemoteImageHostAllowed(target, env) {
  const required = String(env?.UPSTREAM_ALLOWLIST_REQUIRED || '').toLowerCase() === 'true';
  const specificHosts = String(env?.REMOTE_IMAGE_ALLOWED_HOSTS || '').trim();
  if (!required && !specificHosts) return target;
  const allowedHosts = specificHosts || String(env?.UPSTREAM_ALLOWED_HOSTS || '').trim();
  try {
    return assertUpstreamHostAllowed(target, allowedHosts);
  } catch (error) {
    const mapped = new Error('远程图片地址未通过允许列表校验');
    mapped.code = error?.code === 'UPSTREAM_HOST_ALLOWLIST_MISSING'
      ? 'REMOTE_IMAGE_ALLOWLIST_MISSING'
      : error?.code === 'UPSTREAM_HOST_ALLOWLIST_INVALID'
        ? 'REMOTE_IMAGE_ALLOWLIST_INVALID'
        : 'REMOTE_IMAGE_HOST_NOT_ALLOWED';
    throw mapped;
  }
}
function createTraceId() {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (id) return String(id);
  } catch (error) {
    // Fall through to the non-cryptographic fallback when randomUUID is unavailable.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
function diagnosticHeaders(diagnostic = {}) {
  return {
    ...(diagnostic.stage ? { 'X-GPT-Image-Proxy-Stage': diagnostic.stage } : {}),
    ...(diagnostic.status !== undefined ? { 'X-GPT-Image-Proxy-Status': String(diagnostic.status) } : {}),
    ...(diagnostic.contentType ? { 'X-GPT-Image-Proxy-Content-Type': diagnostic.contentType } : {})
  };
}
function tracedJson(request, traceId, data, status = 200, headers = {}, diagnostic = {}) {
  const safeDiagnostic = status >= 400
    ? sanitizeDiagnosticExtra({
      traceId,
      stage: 'local-validation',
      status,
      contentType: request?.headers?.get?.('Content-Type'),
      ...diagnostic
    })
    : {};
  const payload = status >= 400 && data && typeof data === 'object' && !Array.isArray(data)
    ? { ...data, ...safeDiagnostic, traceId }
    : data;
  return json(payload, status, corsHeaders(request, {
    'X-GPT-Image-Trace-Id': traceId,
    ...headers,
    ...diagnosticHeaders(safeDiagnostic)
  }));
}
function localUpstreamFetch(env) {
  return typeof env?.LOCAL_UPSTREAM_FETCH === 'function' ? env.LOCAL_UPSTREAM_FETCH : undefined;
}
function remoteImagePolicyResponse(request, error, traceId) {
  if (!remoteImageAllowlistError(error?.code)) return null;
  return tracedJson(request, traceId, { error: '远程图片地址未通过允许列表校验', code: error.code }, 400);
}
async function cancelUpstreamResponseBody(response, reason = 'proxy response body released') {
  try {
    await response?.body?.cancel?.(reason);
  } catch {
    // A body may already be disturbed or closed. The original proxy outcome
    // must remain the response reported to the caller.
  }
}
async function proxyRemoteImage(request, value, env, traceId = createTraceId()) {
  const fetchImpl = localUpstreamFetch(env);
  if (!['GET', 'HEAD'].includes(request.method)) return tracedJson(request, traceId, { error: 'Image download only supports GET or HEAD' }, 405);
  let target;
  try {
    target = assertRemoteImageHostAllowed(safeRemoteImageUrl(value), env);
  } catch (error) {
    const policyResponse = remoteImagePolicyResponse(request, error, traceId);
    if (policyResponse) return policyResponse;
    return tracedJson(request, traceId, { error: '远程图片地址未通过安全校验', code: 'REMOTE_IMAGE_URL_REJECTED' }, 400);
  }
  const controller = new AbortController();
  const timeoutSeconds = normalizeUpstreamTimeoutSeconds(120);
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  let clientAborted = Boolean(request.signal?.aborted);
  const abortFromClient = () => {
    clientAborted = true;
    controller.abort();
  };
  request.signal?.addEventListener?.('abort', abortFromClient, { once: true });
  if (clientAborted) abortFromClient();
  const cleanup = () => {
    clearTimeout(timeoutId);
    request.signal?.removeEventListener?.('abort', abortFromClient);
  };
  try {
    let upstream;
    let dnsMode = '';
    let current = target;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const resolvedBeforeFetch = await assertPublicRemoteHostname(current.hostname, controller.signal, { fetchImpl });
      dnsMode = resolvedBeforeFetch.resolverId || '';
      upstream = await fetchWithPinnedAddress(current, resolvedBeforeFetch.addresses, {
        method: request.method,
        redirect: 'manual',
        signal: controller.signal
      }, {
        preferredResolverId: resolvedBeforeFetch.resolverId,
        allowPublicAddressRotation: true,
        fetchImpl
      });
      if (upstream.status < 300 || upstream.status >= 400) break;
      const location = upstream.headers.get('Location');
      if (!location) break;
      await cancelUpstreamResponseBody(upstream, 'remote image redirect body released');
      current = assertRemoteImageHostAllowed(safeRemoteImageUrl(new URL(location, current).href), env);
    }
    if (!upstream?.ok) {
      cleanup();
      if (upstream && upstream.status >= 300 && upstream.status < 400) {
        await cancelUpstreamResponseBody(upstream, 'remote image redirect blocked body released');
        return upstreamError(request, '远程图片重定向未通过安全校验', 'REMOTE_IMAGE_REDIRECT_BLOCKED', 'upstream_redirect', 502, upstream, { traceId, timeoutSeconds, dnsMode });
      }
      return upstreamError(request, '远程图片下载失败', 'REMOTE_IMAGE_FETCH_FAILED', 'image_fetch', upstream?.status || 502, upstream, { traceId, timeoutSeconds, dnsMode });
    }
    if (request.method === 'HEAD' || !upstream.body) {
      cleanup();
      return new Response(null, { status: upstream.status, headers: corsHeaders(request, { 'Content-Type': normalizeImageMime(upstream.headers.get('Content-Type')) || 'application/octet-stream', 'X-GPT-Image-Trace-Id': traceId }) });
    }
    const sniffed = await sniffImageBody(upstream.body);
    const mime = sniffed.mime || normalizeImageMime(upstream.headers.get('Content-Type'));
    if (!mime || !isImageContentType(mime)) {
      await cancelUpstreamResponseBody(sniffed.body, 'remote image non-image body released');
      cleanup();
      return tracedJson(request, traceId, { error: '远程响应不是可识别的图片', code: 'REMOTE_IMAGE_NOT_IMAGE' }, 502);
    }
    const passthroughEncoding = unknownContentEncoding(upstream.headers.get('Content-Encoding'));
    const headers = corsHeaders(request, {
      'Content-Type': mime,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'X-GPT-Image-Trace-Id': traceId,
      ...(passthroughEncoding ? { 'Content-Encoding': passthroughEncoding } : {})
    });
    return new Response(streamBodyWithTimeout(sniffed.body, controller, cleanup, IMAGE_RESPONSE_LIMIT), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  } catch (error) {
    cleanup();
    if (clientAborted) {
      return upstreamError(request, '远程图片下载已取消', 'REMOTE_IMAGE_CLIENT_ABORTED', 'client_abort', 499, null, { traceId, timeoutSeconds });
    }
    const transport = transportFailureDescriptor(error);
    if (transport) {
      return upstreamError(request, transport.message, transport.code, transport.type, transport.status, null, {
        traceId,
        timeoutSeconds,
        dnsMode,
        timeoutPhase: transport.stage,
        transportCauseCode: transport.causeCode,
        transportCauseName: transport.causeName
      });
    }
    if (error?.name === 'AbortError') {
      return upstreamError(request, '远程图片下载等待上游超时。上游接收状态未知，未自动重试。', 'REMOTE_IMAGE_TIMEOUT', 'image_timeout', 504, null, { traceId, timeoutSeconds, dnsMode, timeoutPhase: 'response-header' });
    }
    if (error?.code === 'REMOTE_IMAGE_HOST_REJECTED') {
      return tracedJson(request, traceId, { error: '远程图片地址被安全策略拒绝', code: error.code }, 400);
    }
    if (error?.code === 'REMOTE_IMAGE_DNS_TIMEOUT') {
      return upstreamError(request, '远程图片域名校验超时', error.code, 'image_dns_timeout', 504, null, { traceId, timeoutSeconds, dnsMode, timeoutPhase: 'dns' });
    }
    if (error?.code === 'REMOTE_IMAGE_DNS_FAILED') {
      return upstreamError(request, '远程图片域名校验失败', error.code, 'image_dns', 502, null, { traceId, timeoutSeconds, dnsMode, timeoutPhase: 'dns' });
    }
    const policyResponse = remoteImagePolicyResponse(request, error, traceId);
    if (policyResponse) return policyResponse;
    if (error?.code === 'REMOTE_IMAGE_DNS_CHANGED') {
      return tracedJson(request, traceId, { error: '远程图片域名解析在请求期间发生变化', code: error.code }, 409);
    }
    return upstreamError(request, '远程图片下载失败。上游接收状态未知，未自动重试。', 'REMOTE_IMAGE_FETCH_FAILED', 'image_fetch', 502, null, { traceId, timeoutSeconds, dnsMode });
  }
}
async function proxyMultipartBody(request, headers, apiPath, profile, options = {}) {
  if (!isImageApiPath(apiPath) || !isMultipart(headers)) return request.body;
  const provider = providerKey(profile);
  if (provider === 'openai') {
    const originalBody = options.localOriginalBody || null;
    const inspected = await inspectMultipartModel(request, originalBody);
    options.onMultipartSummary?.(inspected.multipart);
    const requestedModel = inspected.requestedModel;
    const configuredModel = String(profile.model || '').trim();
    if (!requestedModel) {
      const error = new Error('图片请求缺少 model 字段，无法与当前图片配置绑定。');
      error.code = 'IMAGE_PROFILE_MODEL_MISSING';
      error.status = 400;
      error.multipart = inspected.multipart;
      throw error;
    }
    if (configuredModel && requestedModel.toLowerCase() !== configuredModel.toLowerCase()) {
      const error = new Error(`图片请求模型与当前配置不一致：请求为 ${requestedModel}，当前配置为 ${configuredModel}。`);
      error.code = 'IMAGE_PROFILE_MODEL_MISMATCH';
      error.status = 400;
      error.requestedModel = requestedModel;
      error.configuredModel = configuredModel;
      error.multipart = inspected.multipart;
      throw error;
    }
    if (originalBody) headers.set('Content-Length', String(originalBody.byteLength));
    else headers.delete('Content-Length');
    headers.delete('Transfer-Encoding');
    if (headerBool(headers, 'X-GPT-Image-Stream', profile.streamImages)) headers.set('X-GPT-Image-Proxy-Stream-Intent', '1');
    return inspected.body;
  }
  const input = await request.formData();
  options.onMultipartSummary?.(summarizeMultipartFormData(input));
  const out = new FormData();
  const firstValue = (...keys) => {
    for (const key of keys) {
      const value = input.get(key);
      if (value !== null && value !== undefined && value !== '') return value;
    }
    return '';
  };
  const appendIfPresent = (key, value) => {
    if (value !== null && value !== undefined && value !== '') out.append(key, String(value));
  };
  const model = String(profile.model || firstValue('model') || 'gpt-image-2');
  out.append('model', model);
  if (provider !== 'google' && provider !== 'xai') {
    for (const [key, value] of input.entries()) {
      if (key === 'model') continue;
      if (value && value.name) out.append(key, value, value.name);
      else if (key === 'quality') out.append(key, normalizeImageQuality(value));
      else if (value !== null && value !== undefined) out.append(key, value);
    }
  } else {
    const canonicalFields = new Set([
      'model', 'prompt', 'negative_prompt', 'negativePrompt', 'n', 'count',
      'resolution', 'image_size', 'size', 'aspect_ratio', 'aspectRatio', 'ratio',
      'response_format', 'target_size', 'targetSize', 'extra_body',
      'quality', 'image_quality', 'output_format', 'format', 'moderation',
      'transparent_background', 'transparent', 'background',
      'output_compression', 'compression', 'image[]', 'image', 'mask'
    ]);
    appendIfPresent('prompt', firstValue('prompt'));
    appendIfPresent('negative_prompt', firstValue('negative_prompt', 'negativePrompt'));
    appendIfPresent('n', firstValue('n', 'count') || '1');
    if (provider === 'google') {
      const imageSize = normalizeGoogleImageResolution(firstValue('image_size', 'resolution', 'size'));
      const aspectRatio = normalizeGoogleImageAspectRatio(firstValue('aspect_ratio', 'aspectRatio', 'ratio'));
      out.append('resolution', String(imageSize));
      out.append('image_size', String(imageSize));
      out.append('size', String(imageSize));
      out.append('aspect_ratio', String(aspectRatio));
      out.append('response_format', String(firstValue('response_format') || 'url'));
      out.append('extra_body', JSON.stringify(googleCompatExtraBody(firstValue('extra_body'), imageSize, aspectRatio)));
    } else {
      appendIfPresent('resolution', firstValue('resolution', 'image_size', 'size') || '2k');
      appendIfPresent('aspect_ratio', firstValue('aspect_ratio', 'aspectRatio', 'ratio') || '1:1');
      appendIfPresent('extra_body', firstValue('extra_body'));
    }
    const requestedQuality = firstValue('quality', 'image_quality');
    appendIfPresent('quality', requestedQuality ? normalizeImageQuality(requestedQuality) : '');
    appendIfPresent('output_format', firstValue('output_format', 'format'));
    appendIfPresent('moderation', firstValue('moderation'));
    const format = String(firstValue('output_format', 'format') || '').toLowerCase();
    if (format === 'png') {
      const transparentValue = firstValue('transparent_background', 'transparent');
      appendIfPresent('transparent_background', transparentValue);
      const background = firstValue('background') || (/^(1|true|yes|on)$/i.test(String(transparentValue || '')) ? 'transparent' : '');
      appendIfPresent('background', background);
    }
    else appendIfPresent('output_compression', firstValue('output_compression', 'compression'));
    for (const [key, value] of input.entries()) {
      if (key === 'image[]' || key === 'image' || key === 'mask') {
        if (value && value.name) out.append(key, value, value.name);
        else out.append(key, value);
      } else if (!canonicalFields.has(key) && value !== null && value !== undefined && value !== '') {
        if (value && value.name) out.append(key, value, value.name);
        else out.append(key, String(value));
      }
    }
  }
  headers.delete('Content-Type');
  headers.delete('Content-Length');
  headers.set('X-GPT-Image-Multipart-Sanitized', provider);
  return out;
}
function normalizeReasoningEffort(value) {
  value = String(value || 'medium').toLowerCase();
  if (value === 'xhigh' || value === 'highest' || value === 'max') return 'high';
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}
async function proxyBody(request, headers, apiPath, profile, options = {}) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const contentType = String(headers.get('Content-Type') || '').toLowerCase();
  if (contentType.includes('multipart/form-data')) return proxyMultipartBody(request, headers, apiPath, profile, options);
  if (!contentType.includes('application/json')) return request.body;
  const raw = await request.text();
  try {
    const body = JSON.parse(raw || '{}');
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if ((isResponsesApiPath(apiPath) || isImageApiPath(apiPath)) && profile && profile.model) {
        const requestedModel = String(body.model || '').trim();
        const configuredModel = String(profile.model || '').trim();
        if (requestedModel && requestedModel.toLowerCase() !== configuredModel.toLowerCase()) {
          const error = new Error(`请求模型与当前配置不一致：请求为 ${requestedModel}，当前配置为 ${configuredModel}。`);
          error.code = 'IMAGE_PROFILE_MODEL_MISMATCH';
          error.status = 400;
          error.requestedModel = requestedModel;
          error.configuredModel = configuredModel;
          throw error;
        }
        if (!requestedModel) body.model = profile.model;
      }
      if (isResponsesApiPath(apiPath) && body.reasoning && typeof body.reasoning === 'object') {
        const effort = normalizeReasoningEffort(body.reasoning.effort || profile.agentReasoningEffort || profile.reasoningEffort || undefined);
        body.reasoning = { ...body.reasoning, effort };
      }
      if (isMobileRequest(request) && isImageApiPath(apiPath)) {
        if (body.stream !== undefined) body.stream = false;
        delete body.partial_images;
        delete body.stream_options;
        headers.set('X-GPT-Image-Mobile-Stream-Disabled', '1');
      }
      if (isImageApiPath(apiPath)) {
        if (body.quality !== undefined) body.quality = normalizeImageQuality(body.quality);
        const wantsB64 = headerBool(headers, 'X-GPT-Image-Response-B64', profile.responseFormatB64Json);
        const wantsStream = headerBool(headers, 'X-GPT-Image-Stream', profile.streamImages);
        const partialImages = boundedPartialImages(
          headerNum(headers, 'X-GPT-Image-Partial-Images', profile.streamPartialImages),
          1
        );
        if (wantsB64 && providerKey(profile) === 'openai') body.response_format = 'b64_json';
        if (wantsStream && isStreamCompatibleImageProfile(profile) && !isMobileRequest(request)) {
          body.stream = true;
          body.partial_images = partialImages;
        } else if (!isStreamCompatibleImageProfile(profile)) {
          delete body.stream;
          delete body.partial_images;
          delete body.stream_options;
        }
      }
      if ((isResponsesApiPath(apiPath) || isImageApiPath(apiPath)) && body.stream === true) {
        headers.set('X-GPT-Image-Proxy-Stream-Intent', '1');
      }
      if (isImageApiPath(apiPath) && isGoogleImageProfile(profile)) sanitizeGoogleImageBody(body);
      headers.delete('Content-Length');
      headers.set('Content-Type', 'application/json');
      return JSON.stringify(body);
    }
  } catch (e) {
    if (e?.code === 'IMAGE_PROFILE_MODEL_MISMATCH') throw e;
  }
  return raw;
}
const TRANSPORT_TIMEOUT_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
const TRANSPORT_CONNECTION_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_CONNECT',
  'UND_ERR_SOCKET', 'ERR_SOCKET_CONNECTION_TIMEOUT', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED'
]);
const TRANSPORT_CAUSE_CODES = new Set([...TRANSPORT_TIMEOUT_CODES, ...TRANSPORT_CONNECTION_CODES]);
const TRANSPORT_NAMES = new Set(['HeadersTimeoutError', 'BodyTimeoutError', 'ConnectTimeoutError', 'SocketError']);
function safeTransportValue(value, allowed) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return allowed.has(normalized) ? normalized : '';
}
function transportFailureDescriptor(error) {
  const candidates = [error, error?.cause];
  let causeCode = '';
  let causeName = '';
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const candidateCode = safeTransportValue(candidate.code, TRANSPORT_CAUSE_CODES);
    const candidateName = safeTransportValue(candidate.name, TRANSPORT_NAMES);
    if (!causeCode && candidateCode) causeCode = candidateCode;
    if (!causeName && candidateName) causeName = candidateName;
  }
  if (causeCode === 'UND_ERR_HEADERS_TIMEOUT' || causeName === 'HeadersTimeoutError') {
    return {
      code: 'UPSTREAM_HEADERS_TIMEOUT',
      type: 'upstream_headers_timeout',
      status: 504,
      stage: 'response-header',
      message: '本地代理等待上游响应头超时。上游接收状态未知，未自动重试。',
      causeCode,
      causeName
    };
  }
  if (causeCode === 'UND_ERR_BODY_TIMEOUT' || causeName === 'BodyTimeoutError') {
    return {
      code: 'UPSTREAM_BODY_TIMEOUT',
      type: 'upstream_body_timeout',
      status: 504,
      stage: 'response-body',
      message: '本地代理读取上游响应体超时。上游接收状态未知，未自动重试。',
      causeCode,
      causeName
    };
  }
  if (TRANSPORT_CONNECTION_CODES.has(causeCode) || causeName === 'ConnectTimeoutError' || causeName === 'SocketError') {
    return {
      code: 'UPSTREAM_CONNECTION_FAILED',
      type: 'upstream_connection_failed',
      status: 502,
      stage: 'connection',
      message: '本地代理无法建立到上游的连接。上游接收状态未知，未自动重试。',
      causeCode,
      causeName
    };
  }
  return null;
}
function sanitizeMultipartSummary(summary) {
  if (!summary || typeof summary !== 'object') return undefined;
  const fieldOrder = Array.isArray(summary.fieldOrder)
    ? summary.fieldOrder.slice(0, 64).map(safeMultipartFieldName)
    : [];
  const files = Array.isArray(summary.files) ? summary.files.slice(0, 16).map((file) => ({
    field: safeMultipartFieldName(file?.field),
    filename: safeMultipartFilename(file?.filename),
    contentType: safeContentType(file?.contentType),
    ...(Number.isFinite(Number(file?.size)) && Number(file.size) >= 0
      ? { size: Math.min(Math.floor(Number(file.size)), PROXY_REQUEST_BODY_LIMIT) }
      : {})
  })) : [];
  const numberOrZero = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : 0;
  return {
    fieldOrder,
    fieldCount: numberOrZero(summary.fieldCount),
    imageCount: numberOrZero(summary.imageCount),
    imageArrayCount: numberOrZero(summary.imageArrayCount),
    files
  };
}
function safeTransportEncoding(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'identity' || normalized === 'unknown') return normalized;
  return /^(?:gzip|deflate|br)(?:, (?:gzip|deflate|br))*$/.test(normalized) ? normalized : 'unknown';
}
function sanitizeTransportSummary(value) {
  if (!value || typeof value !== 'object') return undefined;
  const count = (candidate) => Number.isFinite(Number(candidate)) && Number(candidate) >= 0
    ? Math.min(Math.floor(Number(candidate)), IMAGE_RESPONSE_LIMIT)
    : undefined;
  const rawBytes = count(value.rawBytes);
  const deliveredBytes = count(value.deliveredBytes);
  const contentEncoding = safeTransportEncoding(value.contentEncoding);
  const decodedContentEncoding = safeTransportEncoding(value.decodedContentEncoding);
  if (rawBytes === undefined && deliveredBytes === undefined && !contentEncoding && !decodedContentEncoding && typeof value.decompressed !== 'boolean') return undefined;
  return {
    ...(rawBytes === undefined ? {} : { rawBytes }),
    ...(deliveredBytes === undefined ? {} : { deliveredBytes }),
    ...(contentEncoding ? { contentEncoding } : {}),
    ...(decodedContentEncoding ? { decodedContentEncoding } : {}),
    ...(typeof value.decompressed === 'boolean' ? { decompressed: value.decompressed } : {})
  };
}
function transportSummaryFor(response) {
  return sanitizeTransportSummary(response?.transportMetrics || response?.transport);
}
function transportHeaders(summary, includeByteCounts = false) {
  if (!summary) return {};
  return {
    ...(includeByteCounts && summary.rawBytes !== undefined ? { 'X-GPT-Image-Transport-Raw-Bytes': String(summary.rawBytes) } : {}),
    ...(includeByteCounts && summary.deliveredBytes !== undefined ? { 'X-GPT-Image-Transport-Delivered-Bytes': String(summary.deliveredBytes) } : {}),
    ...(summary.contentEncoding ? { 'X-GPT-Image-Transport-Encoding': summary.contentEncoding } : {}),
    ...(summary.decodedContentEncoding ? { 'X-GPT-Image-Transport-Decoded-Encoding': summary.decodedContentEncoding } : {}),
    ...(summary.decompressed !== undefined ? { 'X-GPT-Image-Transport-Decompressed': String(summary.decompressed) } : {})
  };
}
function sanitizeDiagnosticExtra(extra = {}) {
  const safe = {};
  const allowed = [
    'traceId', 'stage', 'status', 'proxyMs', 'elapsedMs', 'contentType', 'multipart', 'transport',
    'timeoutSeconds', 'timeoutPhase', 'dnsMode', 'transportCauseCode', 'transportCauseName'
  ];
  for (const key of allowed) {
    const value = extra?.[key];
    if (value === undefined || value === null || value === '') continue;
    if (['proxyMs', 'elapsedMs', 'timeoutSeconds'].includes(key)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0) safe[key] = Math.round(numeric * 1000) / 1000;
      continue;
    }
    if (key === 'status') {
      if (value === 'unknown') safe.status = value;
      else {
        const numeric = Number(value);
        if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 599) safe.status = numeric;
      }
      continue;
    }
    if (key === 'contentType') {
      const contentType = safeContentType(value);
      if (contentType) safe.contentType = contentType;
      continue;
    }
    if (key === 'multipart') {
      const multipart = sanitizeMultipartSummary(value);
      if (multipart) safe.multipart = multipart;
      continue;
    }
    if (key === 'transport') {
      const transport = sanitizeTransportSummary(value);
      if (transport) safe.transport = transport;
      continue;
    }
    if (key === 'stage') {
      if (typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value)) safe.stage = value;
      continue;
    }
    if (typeof value === 'string' && value.length <= 128 && /^[\x20-\x7e]*$/.test(value)) safe[key] = value;
  }
  return safe;
}
function proxyDiagnostics(traceId, proxyStart, options = {}) {
  const elapsedMs = Math.max(0, Date.now() - proxyStart);
  return {
    traceId,
    stage: options.stage || 'upstream-acceptance-unknown',
    status: options.status === undefined ? 'unknown' : options.status,
    proxyMs: elapsedMs,
    elapsedMs,
    contentType: options.contentType,
    multipart: options.multipart,
    transport: options.transport,
    timeoutSeconds: options.timeoutSeconds,
    timeoutPhase: options.timeoutPhase,
    dnsMode: options.dnsMode,
    transportCauseCode: options.transportCauseCode,
    transportCauseName: options.transportCauseName
  };
}
const UPSTREAM_ERROR_SCAN_LIMIT = 64 * 1024;
const UPSTREAM_ERROR_MESSAGE_LIMIT = 512;
const UPSTREAM_ERROR_TYPE_LIMIT = 128;
const REDACTED_PROVIDER_ERROR_MESSAGE = '上游错误消息包含敏感内容，已隐藏。';
const REDACTED_PROVIDER_ERROR_TYPE = 'upstream_error';
function containsSensitiveProviderValue(value) {
  const text = String(value || '');
  return /\b(?:https?|wss?|ftp):\/\/[^\s<>'"]+/i.test(text)
    || /\bdata:[^,\s]+,/i.test(text)
    || /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i.test(text)
    || /\b(?:sk|rk)-[A-Za-z0-9_-]{8,}\b/i.test(text)
    || /\b(?:api[-_ ]?key|authorization|cookie|set-cookie|secret|token)\b\s*(?:[:=]|\w+\s*=)/i.test(text)
    || /\bprompt\b\s*(?:[:=]|\bis\b)/i.test(text)
    || /\b[A-Za-z0-9+/_-]{32,}={0,2}\b/.test(text);
}
function sanitizeProviderErrorField(value, limit, sensitiveFallback = '') {
  if (typeof value !== 'string') return '';
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, limit);
  return normalized && containsSensitiveProviderValue(normalized) ? sensitiveFallback : normalized;
}
function providerErrorFields(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [];
  if (payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)) candidates.push(payload.error);
  if (payload.response?.error && typeof payload.response.error === 'object' && !Array.isArray(payload.response.error)) candidates.push(payload.response.error);
  candidates.push(payload);
  for (const candidate of candidates) {
    const message = sanitizeProviderErrorField(candidate.message, UPSTREAM_ERROR_MESSAGE_LIMIT, REDACTED_PROVIDER_ERROR_MESSAGE);
    const type = sanitizeProviderErrorField(candidate.type, UPSTREAM_ERROR_TYPE_LIMIT, REDACTED_PROVIDER_ERROR_TYPE);
    if (message || type) return { message, type };
  }
  if (typeof payload.error === 'string') {
    const message = sanitizeProviderErrorField(payload.error, UPSTREAM_ERROR_MESSAGE_LIMIT, REDACTED_PROVIDER_ERROR_MESSAGE);
    if (message) return { message, type: '' };
  }
  return null;
}
function parseProviderErrorJson(value) {
  try {
    const payload = JSON.parse(value);
    return { parsed: true, fields: providerErrorFields(payload) || { message: '', type: '' } };
  } catch (error) {
    return null;
  }
}
function extractProviderError(bodyText, eventStream = false) {
  const bounded = String(bodyText || '').slice(0, UPSTREAM_ERROR_SCAN_LIMIT);
  const candidates = [];
  if (bounded) candidates.push(bounded);
  if (eventStream) {
    for (const block of bounded.split(/\r?\n\s*\r?\n/).slice(0, 64)) {
      const data = block.split(/\r?\n/)
        .filter((line) => /^\s*data\s*:/i.test(line))
        .map((line) => line.replace(/^\s*data\s*:/i, '').replace(/^ /, ''))
        .join('\n')
        .trim();
      if (data) candidates.push(data);
    }
  }
  for (const candidate of candidates) {
    const parsed = parseProviderErrorJson(candidate);
    if (parsed?.parsed) return parsed.fields;
  }
  return null;
}
function looksLikeStructuredErrorBody(bodyText, contentType, eventStream = false) {
  if (eventStream) return true;
  if (String(contentType || '').toLowerCase().includes('json')) return true;
  return /^[\s]*[\[{]/.test(String(bodyText || ''));
}
function upstreamProviderErrorDescriptor(status, providerType = '') {
  const numericStatus = Number(status);
  const rejected = numericStatus >= 400 && numericStatus < 500;
  return {
    code: rejected ? 'UPSTREAM_PROVIDER_REJECTED' : 'UPSTREAM_PROVIDER_ERROR',
    type: providerType || (rejected ? 'upstream_rejected' : 'upstream_error')
  };
}
function upstreamError(request, message, code, type, status, upstream, extra = {}) {
  const safeExtra = sanitizeDiagnosticExtra(extra);
  const traceId = safeExtra.traceId || createTraceId();
  safeExtra.traceId = traceId;
  const contentType = safeContentType(upstream?.headers?.get('Content-Type'));
  const transport = transportSummaryFor(upstream);
  if (!safeExtra.stage) safeExtra.stage = upstream ? 'upstream-response-headers' : 'upstream-acceptance-unknown';
  if (safeExtra.status === undefined) safeExtra.status = upstream ? upstream.status : 'unknown';
  if (!safeExtra.contentType && contentType) safeExtra.contentType = contentType;
  if (!safeExtra.transport && transport) safeExtra.transport = transport;
  if (safeExtra.elapsedMs === undefined && safeExtra.proxyMs !== undefined) safeExtra.elapsedMs = safeExtra.proxyMs;
  return json({
    error: { message, type, code },
    upstreamStatus: upstream ? upstream.status : status,
    upstreamType: contentType || undefined,
    ...safeExtra
  }, status, corsHeaders(request, {
    'X-GPT-Image-Trace-Id': traceId,
    ...(safeExtra.proxyMs !== undefined ? { 'X-GPT-Image-Proxy-Ms': String(safeExtra.proxyMs) } : {}),
    ...(safeExtra.stage ? { 'X-GPT-Image-Proxy-Stage': safeExtra.stage } : {}),
    ...(safeExtra.status !== undefined ? { 'X-GPT-Image-Proxy-Status': String(safeExtra.status) } : {}),
    ...(safeExtra.contentType ? { 'X-GPT-Image-Proxy-Content-Type': safeExtra.contentType } : {}),
    ...transportHeaders(safeExtra.transport, true)
  }));
}
function proxyFetchFailedMessage(error) {
  return transportFailureDescriptor(error)?.message || 'API 代理请求失败。上游接收状态未知，未自动重试。';
}
function proxyTimeoutDescriptor(phase) {
  if (phase === 'stream-idle') return {
    code: 'PROXY_STREAM_IDLE_TIMEOUT',
    type: 'stream_idle_timeout',
    stage: 'stream-idle',
    message: '本站代理在流式响应阶段等待下一段数据超时。上游接收状态未知，未自动重试。'
  };
  if (phase === 'total') return {
    code: 'PROXY_TOTAL_TIMEOUT',
    type: 'total_timeout',
    stage: 'total-timeout',
    message: '本站代理图片请求超过当前配置的总超时时间。上游接收状态未知，未自动重试。'
  };
  return {
    code: 'PROXY_RESPONSE_HEADER_TIMEOUT',
    type: 'response_header_timeout',
    stage: 'response-header',
    message: '本站代理等待 API 响应头超时。上游接收状态未知，未自动重试。'
  };
}
function requiresNodeDuplex(body) {
  if (body === null || body === undefined) return false;
  if (typeof body === 'string') return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (body instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView(body)) return false;
  if (typeof body.getReader === 'function') return true;
  if (typeof body.pipe === 'function') return true;
  if (typeof body[Symbol.asyncIterator] === 'function') return true;
  return false;
}
function requestBodyWithLimit(request, maxBytes = PROXY_REQUEST_BODY_LIMIT) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    const error = new Error('代理请求体超过安全上限');
    error.code = 'PROXY_REQUEST_BODY_TOO_LARGE';
    error.status = 413;
    throw error;
  }
  const body = request?.body;
  if (!body?.getReader || typeof ReadableStream === 'undefined') return request;
  const reader = body.getReader();
  let totalBytes = 0;
  let finished = false;
  const limitedBody = new ReadableStream({
    async pull(controller) {
      if (finished) return;
      try {
        const { value, done } = await reader.read();
        if (done) {
          finished = true;
          controller.close();
          return;
        }
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          const error = new Error('代理请求体超过安全上限');
          error.code = 'PROXY_REQUEST_BODY_TOO_LARGE';
          error.status = 413;
          finished = true;
          await reader.cancel(error).catch(() => {});
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
      } catch (error) {
        finished = true;
        controller.error(error);
      }
    },
    async cancel(reason) {
      finished = true;
      await reader.cancel(reason).catch(() => {});
    }
  });
  const init = { body: limitedBody };
  if (requiresNodeDuplex(limitedBody)) init.duplex = 'half';
  return new Request(request, init);
}
function streamBodyWithTimeout(body, controller, clearTimeoutState, maxBytes = 0, onChunk = null) {
  const reader = body?.getReader?.();
  if (!reader || typeof ReadableStream === 'undefined') {
    clearTimeoutState();
    return body;
  }
  let finished = false;
  let totalBytes = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeoutState();
  };
  const fail = async (output, error) => {
    const timeoutError = typeof clearTimeoutState?.streamTimeoutError === 'function'
      ? clearTimeoutState.streamTimeoutError()
      : null;
      if (timeoutError) {
        const event = typeof clearTimeoutState?.streamTimeoutEvent === 'function'
          ? clearTimeoutState.streamTimeoutEvent(timeoutError)
          : '';
        finish();
        if (event) {
        controller.abort(timeoutError);
        await reader.cancel?.(timeoutError).catch?.(() => {});
        output.enqueue(new TextEncoder().encode(event));
        output.close();
        return;
      }
      controller.abort(timeoutError);
      await reader.cancel?.(timeoutError).catch?.(() => {});
      output.error(timeoutError);
      return;
    }
    finish();
    output.error(error);
  };
  return new ReadableStream({
    async pull(output) {
      try {
        if (controller.signal?.aborted) {
          await fail(output, controller.signal.reason || new Error('代理请求已中止'));
          return;
        }
        const { value, done } = await reader.read();
        if (done) {
          finish();
          output.close();
          return;
        }
        totalBytes += Number(value?.byteLength || 0);
        if (maxBytes > 0 && totalBytes > maxBytes) {
          const error = new Error('远程图片响应超过代理安全上限');
          error.code = 'REMOTE_IMAGE_RESPONSE_TOO_LARGE';
          finish();
          controller.abort();
          await reader.cancel?.(error).catch?.(() => {});
          output.error(error);
          return;
        }
        if (typeof onChunk === 'function') onChunk(value);
        output.enqueue(value);
      } catch (error) {
        await fail(output, error);
      }
    },
    async cancel(reason) {
      finish();
      controller.abort();
      await reader.cancel?.(reason).catch?.(() => {});
    }
  });
}

export async function onRequest(ctx) {
  const proxyStart = Date.now();
  const traceId = createTraceId();
  let clearProxyTimeout = () => {};
  let resetProxyTimeout = () => {};
  let detachClientAbort = () => {};
  let proxyController = null;
  let proxyClientAbort = null;
  let proxyTimeoutTriggeredPhase = '';
  let configuredTimeoutSeconds = null;
  let proxyDnsMode = '';
  let proxyStage = 'local-validation';
  let proxyStatus = null;
  let proxyContentType = safeContentType(ctx.request?.headers?.get?.('Content-Type'));
  let proxyMultipart;
  let proxyUpstream = null;
  const diagnosticsFor = (options = {}) => proxyDiagnostics(traceId, proxyStart, {
    stage: proxyStage,
    status: proxyStatus === null ? 'unknown' : proxyStatus,
    contentType: proxyContentType,
    multipart: proxyMultipart,
    transport: transportSummaryFor(proxyUpstream),
    ...options
  });
  if (!isSameOriginRequest(ctx.request)) {
    return tracedJson(ctx.request, traceId, { error: 'Cross-origin proxy requests are not allowed' }, 403);
  }
  if (ctx.request.method === 'OPTIONS') return tracedJson(ctx.request, traceId, { ok: true }, 200);
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return tracedJson(ctx.request, traceId, { error: 'Unauthorized' }, 401);
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const url = new URL(ctx.request.url);
  const apiPath = url.pathname.replace(/^\/api-proxy\/?/, '') + url.search;
  if (!apiPath || apiPath === '/') return tracedJson(ctx.request, traceId, { error: 'API Proxy - no path specified' }, 400);
  if (apiPath.split('?')[0] === 'image-download') {
    return proxyRemoteImage(ctx.request, url.searchParams.get('url') || '', ctx.env, traceId);
  }
  let profile;
  try {
    profile = selectedProfile(settings, apiPath, decodeProfileHeaderValue(ctx.request.headers.get('X-GPT-Image-Profile-Id') || ''));
  } catch (error) {
    return tracedJson(ctx.request, traceId, { error: error?.message || 'Invalid API profile configuration', code: 'INVALID_PROFILE_CONFIGURATION' }, 400);
  }
  let baseUrl;
  try {
    baseUrl = normalizeSafeBaseUrl(profile.baseUrl);
  } catch (error) {
    return tracedJson(ctx.request, traceId, { error: 'Unsafe API URL' }, 400);
  }
  const apiKey = String(profile.apiKey || '').trim();
  if (!baseUrl) return tracedJson(ctx.request, traceId, { error: 'API configuration is incomplete: missing API URL' }, 500);
  if (!apiKey) return tracedJson(ctx.request, traceId, { error: 'API configuration is incomplete: missing API Key' }, 500);
  let targetUrl;
  try {
    targetUrl = safeUpstreamEndpoint(baseUrl, apiPath);
  } catch (error) {
    return tracedJson(ctx.request, traceId, { error: 'Unsafe API URL' }, 400);
  }
  try {
    const headers = new Headers(ctx.request.headers);
    const timeoutOverride = Number(ctx.request.headers.get('X-GPT-Image-Timeout-Seconds'));
    for (const headerName of [
      'Host', 'Cookie', 'Origin', 'Referer', 'CF-Connecting-IP', 'X-Forwarded-For', 'Accept-Encoding',
      'X-GPT-Image-Session', 'X-GPT-Image-Profile-Id', 'X-GPT-Image-Profile-Name', 'X-GPT-Image-Response-Delivery',
      'X-GPT-Image-Timeout-Seconds', 'X-GPT-Image-Entry', 'X-GPT-Image-Trace-Id',
      'X-GPT-Image-Upstream-Ms', 'X-GPT-Image-Proxy-Ms', 'X-GPT-Image-Proxy-Stage',
      'X-GPT-Image-Proxy-Status', 'X-GPT-Image-Proxy-Content-Type', 'X-GPT-Image-Proxy-Multipart',
      'X-GPT-Image-DNS-Mode', 'X-GPT-Image-Proxy-Streamed', 'X-GPT-Image-Proxy-Probed',
      'X-GPT-Image-Transport-Raw-Bytes', 'X-GPT-Image-Transport-Delivered-Bytes',
      'X-GPT-Image-Transport-Encoding', 'X-GPT-Image-Transport-Decoded-Encoding',
      'X-GPT-Image-Transport-Decompressed'
    ]) headers.delete(headerName);
    headers.set('Authorization', 'Bearer ' + apiKey);
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    proxyController = controller;
    proxyClientAbort = bindClientAbort(ctx.request, controller);
    detachClientAbort = () => proxyClientAbort.cleanup();
    const requestedTimeout = Number.isFinite(timeoutOverride) && timeoutOverride > 0 ? timeoutOverride : Number(profile.timeout || settings.timeout || 600);
    const timeoutSeconds = normalizeUpstreamTimeoutSeconds(requestedTimeout);
    configuredTimeoutSeconds = timeoutSeconds;
    const timeoutMs = timeoutSeconds * 1000;
    let timeoutId = null;
    let totalTimeoutId = null;
    let timeoutCleared = false;
    const armProxyTimeout = (phase) => {
      if (timeoutCleared) return;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        proxyTimeoutTriggeredPhase = phase;
        controller.abort();
      }, timeoutMs);
      timeoutId.unref?.();
    };
    const armTotalProxyTimeout = () => {
      if (timeoutCleared) return;
      if (totalTimeoutId) clearTimeout(totalTimeoutId);
      totalTimeoutId = setTimeout(() => {
        proxyTimeoutTriggeredPhase = 'total';
        controller.abort();
      }, timeoutMs);
      totalTimeoutId.unref?.();
    };
    resetProxyTimeout = () => armProxyTimeout('stream-idle');
    clearProxyTimeout = () => {
      if (timeoutCleared) return;
      timeoutCleared = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (totalTimeoutId) clearTimeout(totalTimeoutId);
      detachClientAbort();
      detachClientAbort = () => {};
      resetProxyTimeout = () => {};
    };
    armTotalProxyTimeout();
    const localOriginalBody = localOriginalMultipartBody(ctx.env, ctx.request);
    const boundedRequest = localOriginalBody ? ctx.request : requestBodyWithLimit(ctx.request);
    const body = await proxyBody(boundedRequest, headers, apiPath, profile, {
      onMultipartSummary(summary) { proxyMultipart = summary; },
      localOriginalBody
    });
    const requestStreamIntent = headerBool(ctx.request.headers, 'X-GPT-Image-Stream', false)
      || headerBool(headers, 'X-GPT-Image-Proxy-Stream-Intent', false);
    headers.delete('X-GPT-Image-Response-B64');
    headers.delete('X-GPT-Image-Response-Delivery');
    headers.delete('X-GPT-Image-Stream');
    headers.delete('X-GPT-Image-Partial-Images');
    headers.delete('X-GPT-Image-Multipart-Sanitized');
    headers.delete('X-GPT-Image-Proxy-Stream-Intent');
    headers.delete('X-GPT-Image-Proxy-Stage');
    headers.delete('X-GPT-Image-Proxy-Status');
    headers.delete('X-GPT-Image-Proxy-Content-Type');
    headers.delete('X-GPT-Image-Proxy-Multipart');
    const upstreamStart = Date.now();
    const fetchInit = { method: ctx.request.method, headers, body, redirect: 'manual', signal: controller.signal };
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && requiresNodeDuplex(body)) fetchInit.duplex = 'half';
    armProxyTimeout('response-header');
    proxyStage = 'outbound-start';
    proxyDnsMode = 'public-resolver';
    const pinned = await fetchPinnedUpstream(targetUrl, fetchInit, {
      allowedHosts: ctx.env?.UPSTREAM_ALLOWED_HOSTS,
      requireAllowlist: String(ctx.env?.UPSTREAM_ALLOWLIST_REQUIRED || '').toLowerCase() === 'true',
      allowPlatformDnsFallback: true,
      fetchImpl: localUpstreamFetch(ctx.env)
    });
    const upstream = pinned.response;
    proxyUpstream = upstream;
    proxyDnsMode = pinned.dnsFallback ? 'platform-fallback' : 'public-resolver';
    proxyStage = 'upstream-response-headers';
    proxyStatus = upstream.status;
    proxyContentType = safeContentType(upstream.headers.get('Content-Type')) || proxyContentType;
    armProxyTimeout('stream-idle');
    const upstreamMs = Date.now() - upstreamStart;
    if (upstream.status >= 300 && upstream.status < 400) {
      await cancelUpstreamResponseBody(upstream, 'upstream redirect body released');
      clearProxyTimeout();
      return upstreamError(
        ctx.request,
        '上游 API 返回了重定向。为防止凭据被转发到未验证目标，代理不会自动跟随重定向；请将配置改为最终 HTTPS API 地址。',
        'UPSTREAM_REDIRECT_BLOCKED',
        'upstream_redirect',
        502,
        upstream,
        diagnosticsFor({ timeoutSeconds, dnsMode: proxyDnsMode })
      );
    }
    const responseHeaders = new Headers(upstream.headers);
    const passthroughEncoding = unknownContentEncoding(upstream.headers.get('Content-Encoding'));
    responseHeaders.delete('Set-Cookie');
    responseHeaders.delete('Set-Cookie2');
    responseHeaders.delete('Clear-Site-Data');
    responseHeaders.delete('Content-Length');
    if (!passthroughEncoding || !upstream.body) responseHeaders.delete('Content-Encoding');
    responseHeaders.delete('Transfer-Encoding');
    for (const headerName of [
      'X-GPT-Image-Trace-Id', 'X-GPT-Image-Upstream-Ms', 'X-GPT-Image-Proxy-Ms',
      'X-GPT-Image-Proxy-Stage', 'X-GPT-Image-Proxy-Status', 'X-GPT-Image-Proxy-Content-Type',
      'X-GPT-Image-DNS-Mode', 'X-GPT-Image-Profile-Id', 'X-GPT-Image-Profile-Name',
      'X-GPT-Image-Proxy-Streamed', 'X-GPT-Image-Proxy-Probed',
      'X-GPT-Image-Transport-Raw-Bytes', 'X-GPT-Image-Transport-Delivered-Bytes',
      'X-GPT-Image-Transport-Encoding', 'X-GPT-Image-Transport-Decoded-Encoding',
      'X-GPT-Image-Transport-Decompressed'
    ]) responseHeaders.delete(headerName);
    Object.entries(corsHeaders(ctx.request, {
      'X-GPT-Image-Upstream-Ms': String(upstreamMs),
      'X-GPT-Image-Proxy-Ms': String(Date.now() - proxyStart),
      'X-GPT-Image-Trace-Id': traceId,
      'X-GPT-Image-Proxy-Stage': 'upstream-response-headers',
      'X-GPT-Image-Proxy-Status': String(upstream.status),
      ...(proxyContentType ? { 'X-GPT-Image-Proxy-Content-Type': proxyContentType } : {}),
      'X-GPT-Image-DNS-Mode': proxyDnsMode,
      ...transportHeaders(transportSummaryFor(upstream), false),
      'X-GPT-Image-Profile-Id': encodeProfileHeaderValue(profile.id || ''),
      'X-GPT-Image-Profile-Name': encodeURIComponent(String(profile.name || ''))
    })).forEach(([k, v]) => responseHeaders.set(k, v));
    let responseBody = upstream.body;
    const upstreamContentType = String(upstream.headers.get('Content-Type') || '').toLowerCase();
    const rawImageApiResponse = isImageApiPath(apiPath) || isResponsesApiPath(apiPath);
    if (upstream.ok && rawImageApiResponse && responseBody) {
      const declaredSse = isEventStream(upstream.headers);
      let detectedMime = '';
      {
        const sniffed = await sniffImageBody(responseBody, 8192, {
          stopAfterFirstChunk: requestStreamIntent,
          onChunk: resetProxyTimeout
        });
        responseBody = sniffed.body;
        detectedMime = sniffed.mime || '';
        if (detectedMime) responseHeaders.set('Content-Type', detectedMime);
        else if (looksLikeSsePrefix(sniffed.prefix)) responseHeaders.set('Content-Type', 'text/event-stream; charset=utf-8');
        else if (looksLikeJsonPrefix(sniffed.prefix) && (declaredSse || isImageContentType(upstreamContentType))) responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
        if (detectedMime || looksLikeSsePrefix(sniffed.prefix) || looksLikeJsonPrefix(sniffed.prefix)) {
          responseHeaders.set('X-GPT-Image-Proxy-Probed', '1');
        }
      }
      const responseIsSse = isEventStream(responseHeaders);
      clearProxyTimeout.streamTimeoutError = () => {
        if (!proxyController?.signal?.aborted || proxyClientAbort?.wasAborted()) return null;
        const descriptor = proxyTimeoutDescriptor(proxyTimeoutTriggeredPhase || 'response-header');
        const error = new Error(descriptor.message);
        Object.assign(error, descriptor);
        error.name = 'AbortError';
        return error;
      };
      clearProxyTimeout.streamTimeoutEvent = (error) => responseIsSse
        ? `event: error\ndata: ${JSON.stringify({
          error: { message: `${error.message}（代码：${error.code}；阶段：${error.stage}）`, type: error.type, code: error.code, stage: error.stage },
          code: error.code,
          stage: error.stage
        })}\n\n`
        : '';
      responseHeaders.set('Cache-Control', responseIsSse || requestStreamIntent
        ? 'no-cache, no-store, must-revalidate'
        : 'no-store, no-cache, must-revalidate, max-age=0');
      if (responseIsSse || requestStreamIntent) responseHeaders.set('X-Accel-Buffering', 'no');
      responseHeaders.set('X-GPT-Image-Proxy-Streamed', responseIsSse || requestStreamIntent || (!detectedMime && !isImageContentType(upstreamContentType)) ? '1' : '0');
      return new Response(streamBodyWithTimeout(responseBody, controller, clearProxyTimeout, IMAGE_RESPONSE_LIMIT, resetProxyTimeout), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders
      });
    }
    let bodyText = '';
    try {
      const timedBody = responseBody
        ? streamBodyWithTimeout(responseBody, controller, clearProxyTimeout, IMAGE_RESPONSE_LIMIT, resetProxyTimeout)
        : null;
      bodyText = timedBody ? await new Response(timedBody).text() : await upstream.text();
    } finally {
      clearProxyTimeout();
    }
    if (!upstream.ok) {
      const eventStream = isEventStream(upstream.headers);
      const providerError = extractProviderError(bodyText, eventStream);
      const structuredErrorBody = looksLikeStructuredErrorBody(bodyText, upstream.headers.get('Content-Type'), eventStream);
      if (structuredErrorBody && !(looksLikeCloudflareTimeout(bodyText, upstream.status) && !providerError)) {
        const descriptor = upstreamProviderErrorDescriptor(upstream.status, providerError?.type || '');
        return upstreamError(
          ctx.request,
          providerError?.message || `上游 API 返回 HTTP ${upstream.status} 错误。`,
          descriptor.code,
          descriptor.type,
          upstream.status,
          upstream,
          diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode })
        );
      }
    }
    try {
      JSON.parse(bodyText);
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
      Object.entries(transportHeaders(transportSummaryFor(upstream), true)).forEach(([key, value]) => responseHeaders.set(key, value));
      return new Response(bodyText, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    } catch (parseError) {
      if (looksLikeCloudflareTimeout(bodyText, upstream.status)) return upstreamError(
        ctx.request,
        `上游网关响应超时（HTTP ${Number(upstream?.status) || '5xx'}）。这表示 API 服务商长时间未返回结果，不是本站登录或浏览器问题。上游接收状态未知，本站未自动重试。请稍后重试、更换 API 供应商，或使用服务商支持的异步任务/轮询接口。`,
        'UPSTREAM_CLOUDFLARE_TIMEOUT',
        'upstream_timeout',
        504,
        upstream,
        diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode })
      );
      if (looksLikeHtml(bodyText, upstream.headers.get('Content-Type'))) return upstreamError(
        ctx.request,
        '上游 API 返回了 HTML 错误页而不是 JSON。请检查 API 地址是否指向正确的 OpenAI 兼容 /v1 接口，或联系 API 服务商处理网关错误。',
        'UPSTREAM_HTML_RESPONSE',
        'upstream_non_json',
        upstream.ok ? 502 : upstream.status,
        upstream,
        diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode })
      );
      return upstreamError(
        ctx.request,
        '上游 API 返回了非 JSON 响应，无法解析为图片生成结果。请检查 API 地址、模型兼容性和服务商返回格式。',
        'UPSTREAM_NON_JSON_RESPONSE',
        'upstream_non_json',
        upstream.ok ? 502 : upstream.status,
        upstream,
        diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode })
      );
    }
  } catch (e) {
    clearProxyTimeout();
    if (e?.code === 'PROXY_REQUEST_BODY_TOO_LARGE') {
      return upstreamError(ctx.request, '代理请求体超过安全上限。', e.code, 'request_body', 413, null, diagnosticsFor({ stage: 'local-validation', status: 413, timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode }));
    }
    if (e?.code === 'IMAGE_PROFILE_MODEL_MISSING' || e?.code === 'IMAGE_PROFILE_MODEL_MISMATCH') {
      return tracedJson(ctx.request, traceId, {
        error: e.code === 'IMAGE_PROFILE_MODEL_MISSING' ? '图片请求缺少模型名称。' : '图片请求模型与当前配置不一致。',
        code: e.code,
        requestedModel: e.requestedModel || undefined,
        configuredModel: e.configuredModel || profile?.model || undefined
      }, 400, {}, diagnosticsFor({ stage: 'local-validation', status: 400, multipart: e.multipart }));
    }
    if (e?.code === 'UPSTREAM_DNS_REJECTED') {
      return upstreamError(ctx.request, '上游地址解析到了内部网络。', e.code, 'upstream_dns', 400, null, diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode, timeoutPhase: 'dns' }));
    }
    if (e?.code === 'UPSTREAM_HOST_ALLOWLIST_MISSING' || e?.code === 'UPSTREAM_HOST_ALLOWLIST_INVALID' || e?.code === 'UPSTREAM_HOST_NOT_ALLOWED') {
      return upstreamError(ctx.request, '上游 API 域名未通过允许列表校验。', e.code, 'upstream_host_policy', 400, null, diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode }));
    }
    if (e?.code === 'UPSTREAM_DNS_REBOUND' || e?.code === 'UPSTREAM_DNS_FAILED' || e?.code === 'UPSTREAM_DNS_TIMEOUT') {
      return upstreamError(ctx.request, '上游地址 DNS 校验失败。', e.code, 'upstream_dns', 502, null, diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode, timeoutPhase: 'dns' }));
    }
    if (proxyClientAbort?.wasAborted()) {
      return upstreamError(ctx.request, '客户端已取消图片请求。', 'PROXY_CLIENT_ABORTED', 'client_abort', 499, null, diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode }));
    }
    const transport = transportFailureDescriptor(e);
    if (transport) {
      return upstreamError(ctx.request, transport.message, transport.code, transport.type, transport.status, null, diagnosticsFor({
        timeoutSeconds: configuredTimeoutSeconds,
        dnsMode: proxyDnsMode,
        timeoutPhase: transport.stage,
        transportCauseCode: transport.causeCode,
        transportCauseName: transport.causeName
      }));
    }
    if (e?.name === 'AbortError' || (proxyController?.signal?.aborted && !ctx.request.signal?.aborted)) {
      if (proxyClientAbort?.wasAborted()) {
        return upstreamError(ctx.request, '客户端已取消图片请求。', 'PROXY_CLIENT_ABORTED', 'client_abort', 499, null, diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode }));
      }
      const descriptor = proxyTimeoutDescriptor(proxyTimeoutTriggeredPhase || 'response-header');
      return upstreamError(ctx.request, descriptor.message, descriptor.code, descriptor.type, 504, null, diagnosticsFor({ stage: 'upstream-acceptance-unknown', timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode, timeoutPhase: descriptor.stage }));
    }
    if (e?.code === 'UPSTREAM_RESPONSE_TOO_LARGE' || e?.code === 'UPSTREAM_BODY_READ_FAILED') {
      return upstreamError(ctx.request, '上游图片响应读取失败。', e.code, 'upstream_read', 502, null, diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode }));
    }
    return upstreamError(ctx.request, proxyFetchFailedMessage(e), 'PROXY_FETCH_FAILED', 'proxy_error', 502, null, diagnosticsFor({ timeoutSeconds: configuredTimeoutSeconds, dnsMode: proxyDnsMode }));
  }
}

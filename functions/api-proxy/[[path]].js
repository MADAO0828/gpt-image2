import { currentUser, json } from '../_lib/auth.js';
import { assertUpstreamHostAllowed, bindClientAbort, fetchPinnedUpstream, fetchWithPinnedAddress, isPrivateIpAddress as isSharedPrivateIpAddress, normalizeSafeBaseUrl, normalizeUpstreamTimeoutSeconds, resolvePublicAddresses, safeUpstreamEndpoint } from '../_lib/upstream-url.js';
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; } }); return settings; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function normalizeImageQuality(value, fallback = 'high') { const normalized = String(value || '').trim().toLowerCase(); if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized; if (normalized === 'hd') return 'high'; if (normalized === 'standard') return 'medium'; return ['auto', 'low', 'medium', 'high'].includes(fallback) ? fallback : 'high'; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function findProfileById(settings, profileId) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; if (!profileId) return null; return profiles.find(p => p && (p.id === profileId || p.name === profileId)) || null; }
function normalizeAgentMode(value) { value = String(value || 'off'); if (value === 'same') return 'native'; if (value === 'custom') return 'hybrid'; return value === 'native' || value === 'hybrid' ? value : 'off'; }
function selectedProfile(settings, apiPath = '', explicitProfileId = '') { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const activeId = settings.activeProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const activeImageId = settings.activeImageProfileId || ''; const cleanPath = String(apiPath || '').replace(/^\/+/, ''); const mode = normalizeAgentMode(settings.agentApiConfigMode); const isResponsesPath = /^responses(?:$|\?|\/)/.test(cleanPath); const isImagesPath = /^images(?:$|\?|\/)/.test(cleanPath); const explicit = findProfileById(settings, explicitProfileId); let found = null; if (isResponsesPath) { if (explicitProfileId) { if (!explicit || explicit.apiMode !== 'responses') throw new Error('Selected Agent text profile is missing or does not support Responses API'); found = explicit; } else if (mode === 'hybrid') { const agentText = findProfileById(settings, settings.agentTextProfileId); if (!agentText || agentText.apiMode !== 'responses') throw new Error('Hybrid Agent text profile is missing or does not support Responses API'); found = agentText; } else { found = profiles.find(p => p && p.id === activeId) || null; if (!found || found.apiMode !== 'responses') throw new Error('Active profile does not support Responses API'); } } else if (isImagesPath) { if (explicitProfileId) { if (!explicit || (explicit.apiMode || 'images') !== 'images') throw new Error('Selected image profile is missing or does not support Images API'); found = explicit; } else if (activeImageId) { found = findProfileById(settings, activeImageId); if (!found || (found.apiMode || 'images') !== 'images') throw new Error('Active image profile is missing or does not support Images API'); } else { const active = findProfileById(settings, activeId); found = active && (active.apiMode || 'images') === 'images' ? active : profiles.find(p => p && (p.apiMode || 'images') === 'images') || null; } } else { found = explicit || profiles.find(p => p && p.id === activeId) || profiles[0] || null; } const base = found || {}; return {
  id: base.id || activeId || 'default-openai',
  name: base.name || '\u4e91\u7aef\u914d\u7f6e',
  provider: base.provider || 'openai',
  baseUrl: firstString(base.baseUrl, settings.baseUrl),
  nativeBaseUrl: firstString(base.nativeBaseUrl, base.googleNativeBaseUrl, settings.nativeBaseUrl, settings.googleNativeBaseUrl),
  apiKey: firstString(base.apiKey, settings.apiKey),
  nativeApiKey: firstString(base.nativeApiKey, base.googleNativeApiKey, settings.nativeApiKey, settings.googleNativeApiKey),
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
  nativeBaseUrl: p.nativeBaseUrl || p.googleNativeBaseUrl || '',
  apiKey: p.apiKey || '',
  nativeApiKey: p.nativeApiKey ? 'cloudflare-proxy' : '',
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
    'Access-Control-Expose-Headers': 'Retry-After, X-GPT-Image-Upstream-Ms, X-GPT-Image-Proxy-Ms, X-GPT-Image-Profile-Id, X-GPT-Image-Profile-Name, X-GPT-Image-Proxy-Streamed, X-GPT-Image-Proxy-Probed',
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
function looksLikeCloudflareTimeout(text, status) { const lower = String(text || '').toLowerCase(); return status === 524 || lower.includes('524: a timeout occurred') || lower.includes('error code 524') || (lower.includes('cloudflare') && lower.includes('timeout')) || (status >= 502 && status < 600 && lower.trim().startsWith('<!doctype')); }
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
  if (body.image_size === undefined && body.resolution !== undefined) body.image_size = body.resolution;
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
const IMAGE_RESPONSE_LIMIT = 128 * 1024 * 1024;
const PROXY_REQUEST_BODY_LIMIT = 64 * 1024 * 1024;
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
async function inspectMultipartModel(request) {
  const body = request.body;
  if (!body?.tee) {
    const input = await request.clone().formData();
    return {
      body,
      requestedModel: String(input.get('model') || '').trim()
    };
  }
  const [probeBody, replayBody] = body.tee();
  const probeInit = { body: probeBody };
  if (requiresNodeDuplex(probeBody)) probeInit.duplex = 'half';
  const probeRequest = new Request(request, probeInit);
  const input = await probeRequest.formData();
  return {
    body: replayBody,
    requestedModel: String(input.get('model') || '').trim()
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
async function assertPublicRemoteHostname(hostname, signal) {
  const host = String(hostname || '').trim().toLowerCase();
  if (isPrivateRemoteHostname(host)) {
    const error = new Error('远程图片地址不允许访问内部网络');
    error.code = 'REMOTE_IMAGE_HOST_REJECTED';
    throw error;
  }
  try {
    return await resolvePublicAddresses(host, signal, { allowReservedTestHostname: false });
  } catch (error) {
    if (error?.code === 'UPSTREAM_DNS_REJECTED') {
      const mapped = new Error(error.message || '远程图片地址解析未通过安全校验');
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
function remoteImagePolicyResponse(request, error) {
  if (!remoteImageAllowlistError(error?.code)) return null;
  return json({ error: '远程图片地址未通过允许列表校验', code: error.code }, 400, corsHeaders(request));
}
async function proxyRemoteImage(request, value, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Image download only supports GET or HEAD' }, 405, corsHeaders(request));
  let target;
  try {
    target = assertRemoteImageHostAllowed(safeRemoteImageUrl(value), env);
  } catch (error) {
    const policyResponse = remoteImagePolicyResponse(request, error);
    if (policyResponse) return policyResponse;
    return json({ error: error.message || 'Invalid remote image URL', code: 'REMOTE_IMAGE_URL_REJECTED' }, 400, corsHeaders(request));
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
    let current = target;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const resolvedBeforeFetch = await assertPublicRemoteHostname(current.hostname, controller.signal);
      upstream = await fetchWithPinnedAddress(current, resolvedBeforeFetch.addresses, {
        method: request.method,
        redirect: 'manual',
        signal: controller.signal
      }, {
        preferredResolverId: resolvedBeforeFetch.resolverId,
        allowPublicAddressRotation: true
      });
      if (upstream.status < 300 || upstream.status >= 400) break;
      const location = upstream.headers.get('Location');
      if (!location) break;
      current = assertRemoteImageHostAllowed(safeRemoteImageUrl(new URL(location, current).href), env);
    }
    if (!upstream?.ok) {
      cleanup();
      if (upstream && upstream.status >= 300 && upstream.status < 400) {
        return upstreamError(request, '远程图片重定向未通过安全校验', 'REMOTE_IMAGE_REDIRECT_BLOCKED', 'upstream_redirect', 502, upstream, { timeoutSeconds });
      }
      return upstreamError(request, '远程图片下载失败', 'REMOTE_IMAGE_FETCH_FAILED', 'image_fetch', upstream?.status || 502, upstream);
    }
    if (request.method === 'HEAD' || !upstream.body) {
      cleanup();
      return new Response(null, { status: upstream.status, headers: corsHeaders(request, { 'Content-Type': normalizeImageMime(upstream.headers.get('Content-Type')) || 'application/octet-stream' }) });
    }
    const sniffed = await sniffImageBody(upstream.body);
    const mime = sniffed.mime || normalizeImageMime(upstream.headers.get('Content-Type'));
    if (!mime || !isImageContentType(mime)) {
      cleanup();
      return json({ error: '远程响应不是可识别的图片', code: 'REMOTE_IMAGE_NOT_IMAGE' }, 502, corsHeaders(request));
    }
    const headers = corsHeaders(request, {
      'Content-Type': mime,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    });
    return new Response(streamBodyWithTimeout(sniffed.body, controller, cleanup, IMAGE_RESPONSE_LIMIT), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  } catch (error) {
    cleanup();
    if (clientAborted) {
      return upstreamError(request, '远程图片下载已取消', 'REMOTE_IMAGE_CLIENT_ABORTED', 'client_abort', 499, null);
    }
    if (error?.name === 'AbortError') {
      return upstreamError(request, '远程图片下载等待上游超时', 'REMOTE_IMAGE_TIMEOUT', 'image_timeout', 504, null, { timeoutSeconds });
    }
    if (error?.code === 'REMOTE_IMAGE_HOST_REJECTED') {
      return json({ error: error.message || '远程图片地址被安全策略拒绝', code: error.code }, 400, corsHeaders(request));
    }
    if (error?.code === 'REMOTE_IMAGE_DNS_TIMEOUT') {
      return upstreamError(request, error.message || '远程图片域名校验超时', error.code, 'image_dns_timeout', 504, null);
    }
    if (error?.code === 'REMOTE_IMAGE_DNS_FAILED') {
      return upstreamError(request, error.message || '远程图片域名校验失败', error.code, 'image_dns', 502, null);
    }
    const policyResponse = remoteImagePolicyResponse(request, error);
    if (policyResponse) return policyResponse;
    if (error?.code === 'REMOTE_IMAGE_DNS_CHANGED') {
      return json({ error: error.message, code: error.code }, 409, corsHeaders(request));
    }
    return upstreamError(request, '远程图片下载失败', 'REMOTE_IMAGE_FETCH_FAILED', 'image_fetch', 502, null);
  }
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
function googleCompatExtraBody(imageSize, aspectRatio) {
  const normalizedImageSize = String(imageSize || '').toUpperCase();
  return {
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
  };
}
async function proxyMultipartBody(request, headers, apiPath, profile) {
  if (!isImageApiPath(apiPath) || !isMultipart(headers)) return request.body;
  const provider = providerKey(profile);
  if (provider === 'openai') {
    const inspected = await inspectMultipartModel(request);
    const requestedModel = inspected.requestedModel;
    const configuredModel = String(profile.model || '').trim();
    if (!requestedModel) {
      const error = new Error('图片请求缺少 model 字段，无法与当前图片配置绑定。');
      error.code = 'IMAGE_PROFILE_MODEL_MISSING';
      error.status = 400;
      throw error;
    }
    if (configuredModel && requestedModel.toLowerCase() !== configuredModel.toLowerCase()) {
      const error = new Error(`图片请求模型与当前配置不一致：请求为 ${requestedModel}，当前配置为 ${configuredModel}。`);
      error.code = 'IMAGE_PROFILE_MODEL_MISMATCH';
      error.status = 400;
      error.requestedModel = requestedModel;
      error.configuredModel = configuredModel;
      throw error;
    }
    headers.delete('Content-Length');
    headers.delete('Transfer-Encoding');
    if (headerBool(headers, 'X-GPT-Image-Stream', profile.streamImages)) headers.set('X-GPT-Image-Proxy-Stream-Intent', '1');
    return inspected.body;
  }
  const input = await request.formData();
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
      const imageSize = firstValue('image_size', 'resolution', 'size') || '2K';
      const aspectRatio = firstValue('aspect_ratio', 'aspectRatio', 'ratio') || '1:1';
      out.append('resolution', String(imageSize));
      out.append('image_size', String(imageSize));
      out.append('size', String(imageSize));
      out.append('aspect_ratio', String(aspectRatio));
      out.append('response_format', 'url');
      appendIfPresent('target_size', firstValue('target_size', 'targetSize') || googleOfficialImageSize(imageSize, aspectRatio));
      if (firstValue('extra_body')) out.append('extra_body', firstValue('extra_body'));
      else out.append('extra_body', JSON.stringify(googleCompatExtraBody(imageSize, aspectRatio)));
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
async function proxyBody(request, headers, apiPath, profile) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const contentType = String(headers.get('Content-Type') || '').toLowerCase();
  if (contentType.includes('multipart/form-data')) return proxyMultipartBody(request, headers, apiPath, profile);
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
function upstreamError(request, message, code, type, status, upstream, extra = {}) {
  return json({
    error: { message, type, code },
    upstreamStatus: upstream ? upstream.status : status,
    upstreamType: upstream ? upstream.headers.get('Content-Type') : undefined,
    ...extra
  }, status, corsHeaders(request, extra && extra.proxyMs !== undefined ? { 'X-GPT-Image-Proxy-Ms': String(extra.proxyMs) } : {}));
}
function proxyFetchFailedMessage(error, profile, apiPath, request, headers) {
  const provider = providerKey(profile);
  const isMultipartRequest = isMultipart(headers);
  const base = `API 代理请求失败：${error.message || String(error)}`;
  if (!isImageApiPath(apiPath)) return base;
  const mode = isMultipartRequest ? '参考图编辑/图片+提示词' : '纯提示词生图';
  const suggestion = isMultipartRequest && (provider === 'google' || provider === 'xai')
    ? '参考图请求已走当前中转站兼容接口；请检查该模型的图生图通道状态、图片大小/格式和服务商后台错误。'
    : '请检查 API 地址、模型名称和服务商网关状态后重试。';
  return `${base}。模型：${profile.name || profile.id || profile.model} / ${profile.model}；供应商：${provider}；路径：${apiPath}；模式：${mode}。${suggestion}`;
}
function proxyTimeoutDescriptor(phase) {
  if (phase === 'stream-idle') return {
    code: 'PROXY_STREAM_IDLE_TIMEOUT',
    type: 'stream_idle_timeout',
    stage: 'stream-idle',
    message: '本站代理在流式响应阶段等待下一段数据超时。上游可能已开始生成但长时间没有新数据，请检查服务商流状态后重试。'
  };
  if (phase === 'total') return {
    code: 'PROXY_TOTAL_TIMEOUT',
    type: 'total_timeout',
    stage: 'total-timeout',
    message: '本站代理图片请求超过当前配置的总超时时间。上游可能仍在处理，请确认服务商任务状态后重试。'
  };
  return {
    code: 'PROXY_RESPONSE_HEADER_TIMEOUT',
    type: 'response_header_timeout',
    stage: 'response-header',
    message: '本站代理等待 API 响应头超时。请降低生成张数/图片尺寸，或更换响应更稳定的 API 服务商。'
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
  let clearProxyTimeout = () => {};
  let resetProxyTimeout = () => {};
  let detachClientAbort = () => {};
  let proxyController = null;
  let proxyClientAbort = null;
  let proxyTimeoutTriggeredPhase = '';
  if (!isSameOriginRequest(ctx.request)) {
    return json({ error: 'Cross-origin proxy requests are not allowed' }, 403, corsHeaders(ctx.request));
  }
  if (ctx.request.method === 'OPTIONS') return json({ ok: true }, 200, corsHeaders(ctx.request));
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401, corsHeaders(ctx.request));
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const url = new URL(ctx.request.url);
  const apiPath = url.pathname.replace(/^\/api-proxy\/?/, '') + url.search;
  if (!apiPath || apiPath === '/') return json({ error: 'API Proxy - no path specified' }, 400, corsHeaders(ctx.request));
  if (apiPath.split('?')[0] === 'image-download') {
    return proxyRemoteImage(ctx.request, url.searchParams.get('url') || '', ctx.env);
  }
  let profile;
  try {
    profile = selectedProfile(settings, apiPath, ctx.request.headers.get('X-GPT-Image-Profile-Id') || '');
  } catch (error) {
    return json({ error: error?.message || 'Invalid API profile configuration', code: 'INVALID_PROFILE_CONFIGURATION' }, 400, corsHeaders(ctx.request));
  }
  let baseUrl;
  try {
    baseUrl = normalizeSafeBaseUrl(profile.baseUrl);
  } catch (error) {
    return json({ error: error.message || 'Unsafe API URL' }, 400, corsHeaders(ctx.request));
  }
  const apiKey = String(profile.apiKey || '').trim();
  if (!baseUrl) return json({ error: 'API configuration is incomplete: missing API URL' }, 500, corsHeaders(ctx.request));
  if (!apiKey) return json({ error: 'API configuration is incomplete: missing API Key' }, 500, corsHeaders(ctx.request));
  let targetUrl;
  try {
    targetUrl = safeUpstreamEndpoint(baseUrl, apiPath);
  } catch (error) {
    return json({ error: error.message || 'Unsafe API URL' }, 400, corsHeaders(ctx.request));
  }
  try {
    const headers = new Headers(ctx.request.headers);
    const timeoutOverride = Number(ctx.request.headers.get('X-GPT-Image-Timeout-Seconds'));
    headers.delete('Host'); headers.delete('Cookie'); headers.delete('Origin'); headers.delete('Referer'); headers.delete('CF-Connecting-IP'); headers.delete('X-Forwarded-For'); headers.delete('Accept-Encoding'); headers.delete('X-GPT-Image-Session'); headers.delete('X-GPT-Image-Profile-Id'); headers.delete('X-GPT-Image-Timeout-Seconds'); headers.delete('X-GPT-Image-Entry');
    headers.set('Authorization', 'Bearer ' + apiKey);
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    proxyController = controller;
    proxyClientAbort = bindClientAbort(ctx.request, controller);
    detachClientAbort = () => proxyClientAbort.cleanup();
    const requestedTimeout = Number.isFinite(timeoutOverride) && timeoutOverride > 0 ? timeoutOverride : Number(profile.timeout || settings.timeout || 600);
    const timeoutSeconds = normalizeUpstreamTimeoutSeconds(requestedTimeout);
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
    const boundedRequest = requestBodyWithLimit(ctx.request);
    const body = await proxyBody(boundedRequest, headers, apiPath, profile);
    const requestStreamIntent = headerBool(ctx.request.headers, 'X-GPT-Image-Stream', false)
      || headerBool(headers, 'X-GPT-Image-Proxy-Stream-Intent', false);
    headers.delete('X-GPT-Image-Response-B64');
    headers.delete('X-GPT-Image-Stream');
    headers.delete('X-GPT-Image-Partial-Images');
    headers.delete('X-GPT-Image-Multipart-Sanitized');
    headers.delete('X-GPT-Image-Proxy-Stream-Intent');
    const upstreamStart = Date.now();
    const fetchInit = { method: ctx.request.method, headers, body, redirect: 'manual', signal: controller.signal };
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && requiresNodeDuplex(body)) fetchInit.duplex = 'half';
    armProxyTimeout('response-header');
    const pinned = await fetchPinnedUpstream(targetUrl, fetchInit, {
      allowedHosts: ctx.env?.UPSTREAM_ALLOWED_HOSTS,
      requireAllowlist: String(ctx.env?.UPSTREAM_ALLOWLIST_REQUIRED || '').toLowerCase() === 'true',
      allowPlatformDnsFallback: true
    });
    const upstream = pinned.response;
    armProxyTimeout('stream-idle');
    const upstreamMs = Date.now() - upstreamStart;
    if (upstream.status >= 300 && upstream.status < 400) {
      clearProxyTimeout();
      return upstreamError(
        ctx.request,
        '上游 API 返回了重定向。为防止凭据被转发到未验证目标，代理不会自动跟随重定向；请将配置改为最终 HTTPS API 地址。',
        'UPSTREAM_REDIRECT_BLOCKED',
        'upstream_redirect',
        502,
        upstream,
        { proxyMs: Date.now() - proxyStart }
      );
    }
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('Set-Cookie');
    responseHeaders.delete('Set-Cookie2');
    responseHeaders.delete('Clear-Site-Data');
    responseHeaders.delete('Content-Length');
    responseHeaders.delete('Content-Encoding');
    responseHeaders.delete('Transfer-Encoding');
    responseHeaders.delete('X-GPT-Image-Proxy-Probed');
    Object.entries(corsHeaders(ctx.request, {
      'X-GPT-Image-Upstream-Ms': String(upstreamMs),
      'X-GPT-Image-Proxy-Ms': String(Date.now() - proxyStart),
      'X-GPT-Image-DNS-Mode': pinned.dnsFallback ? 'platform-fallback' : 'public-resolver',
      'X-GPT-Image-Profile-Id': String(profile.id || ''),
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
    try { JSON.parse(bodyText); responseHeaders.set('Content-Type', 'application/json; charset=utf-8'); return new Response(bodyText, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders }); } catch (parseError) {
      if (looksLikeCloudflareTimeout(bodyText, upstream.status)) return upstreamError(
        ctx.request,
        '上游 API 服务超时（Cloudflare 524/5xx）。这表示 API 服务商长时间未返回结果，不是本站登录或浏览器问题。请稍后重试、更换 API 供应商，或使用服务商支持的异步任务/轮询接口。',
        'UPSTREAM_CLOUDFLARE_TIMEOUT',
        'upstream_timeout',
        504,
        upstream
      );
      if (looksLikeHtml(bodyText, upstream.headers.get('Content-Type'))) return upstreamError(
        ctx.request,
        '上游 API 返回了 HTML 错误页而不是 JSON。请检查 API 地址是否指向正确的 OpenAI 兼容 /v1 接口，或联系 API 服务商处理网关错误。',
        'UPSTREAM_HTML_RESPONSE',
        'upstream_non_json',
        upstream.ok ? 502 : upstream.status,
        upstream,
        { parseError: parseError.message }
      );
      return upstreamError(
        ctx.request,
        '上游 API 返回了非 JSON 响应，无法解析为图片生成结果。请检查 API 地址、模型兼容性和服务商返回格式。',
        'UPSTREAM_NON_JSON_RESPONSE',
        'upstream_non_json',
        upstream.ok ? 502 : upstream.status,
        upstream,
        { parseError: parseError.message }
      );
    }
  } catch (e) {
    clearProxyTimeout();
    if (e?.code === 'PROXY_REQUEST_BODY_TOO_LARGE') {
      return upstreamError(ctx.request, e.message || '代理请求体超过安全上限。', e.code, 'request_body', 413, null, { proxyMs: Date.now() - proxyStart });
    }
    if (e?.code === 'IMAGE_PROFILE_MODEL_MISSING' || e?.code === 'IMAGE_PROFILE_MODEL_MISMATCH') {
      return json({
        error: e.message,
        code: e.code,
        requestedModel: e.requestedModel || undefined,
        configuredModel: e.configuredModel || profile?.model || undefined
      }, 400, corsHeaders(ctx.request));
    }
    if (e?.code === 'UPSTREAM_DNS_REJECTED') {
      return upstreamError(ctx.request, e.message || '上游地址解析到了内部网络。', e.code, 'upstream_dns', 400, null, { proxyMs: Date.now() - proxyStart });
    }
    if (e?.code === 'UPSTREAM_HOST_ALLOWLIST_MISSING' || e?.code === 'UPSTREAM_HOST_ALLOWLIST_INVALID' || e?.code === 'UPSTREAM_HOST_NOT_ALLOWED') {
      return upstreamError(ctx.request, e.message || '上游 API 域名未通过允许列表校验。', e.code, 'upstream_host_policy', 400, null, { proxyMs: Date.now() - proxyStart });
    }
    if (e?.code === 'UPSTREAM_DNS_REBOUND' || e?.code === 'UPSTREAM_DNS_FAILED' || e?.code === 'UPSTREAM_DNS_TIMEOUT') {
      return upstreamError(ctx.request, e.message || '上游地址 DNS 校验失败。', e.code, 'upstream_dns', 502, null, { proxyMs: Date.now() - proxyStart });
    }
    if (e?.name === 'AbortError' || (proxyController?.signal?.aborted && !ctx.request.signal?.aborted)) {
      if (proxyClientAbort?.wasAborted()) {
        return upstreamError(ctx.request, '客户端已取消图片请求。', 'PROXY_CLIENT_ABORTED', 'client_abort', 499, null, { proxyMs: Date.now() - proxyStart });
      }
      const descriptor = proxyTimeoutDescriptor(proxyTimeoutTriggeredPhase || 'response-header');
      return upstreamError(ctx.request, descriptor.message, descriptor.code, descriptor.type, 504, null, { proxyMs: Date.now() - proxyStart, timeoutPhase: descriptor.stage });
    }
    if (e?.code === 'UPSTREAM_RESPONSE_TOO_LARGE' || e?.code === 'UPSTREAM_BODY_READ_FAILED') {
      return upstreamError(ctx.request, e.message || '上游图片响应读取失败', e.code, 'upstream_read', 502, null, { proxyMs: Date.now() - proxyStart });
    }
    return upstreamError(ctx.request, proxyFetchFailedMessage(e, profile, apiPath, ctx.request, new Headers(ctx.request.headers)), 'PROXY_FETCH_FAILED', 'proxy_error', 502, null, { proxyMs: Date.now() - proxyStart });
  }
}

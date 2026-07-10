import { currentUser, json } from '../_lib/auth.js';
import { normalizeSafeBaseUrl, safeUpstreamEndpoint } from '../_lib/upstream-url.js';
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; } }); return settings; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
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
  streamPartialImages: asNum(p.streamPartialImages, asNum(settings.streamPartialImages, 1))
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
    'Access-Control-Expose-Headers': 'Retry-After, X-GPT-Image-Upstream-Ms, X-GPT-Image-Proxy-Ms, X-GPT-Image-Profile-Id, X-GPT-Image-Profile-Name, X-GPT-Image-Proxy-Streamed',
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
      else if (value !== null && value !== undefined) out.append(key, value);
    }
  } else {
    appendIfPresent('prompt', firstValue('prompt'));
    out.append('n', '1');
    if (provider === 'google') {
      const imageSize = firstValue('image_size', 'resolution', 'size') || '2K';
      const aspectRatio = firstValue('aspect_ratio', 'aspectRatio', 'ratio') || '1:1';
      out.append('resolution', String(imageSize));
      out.append('image_size', String(imageSize));
      out.append('size', String(imageSize));
      out.append('aspect_ratio', String(aspectRatio));
      out.append('response_format', 'url');
      appendIfPresent('target_size', firstValue('target_size', 'targetSize') || googleOfficialImageSize(imageSize, aspectRatio));
      out.append('extra_body', JSON.stringify(googleCompatExtraBody(imageSize, aspectRatio)));
    } else {
      appendIfPresent('resolution', firstValue('resolution', 'image_size', 'size') || '2k');
      appendIfPresent('aspect_ratio', firstValue('aspect_ratio', 'aspectRatio', 'ratio') || '1:1');
    }
    appendIfPresent('quality', firstValue('quality', 'image_quality'));
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
      if ((isResponsesApiPath(apiPath) || isImageApiPath(apiPath)) && profile && profile.model) body.model = profile.model;
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
        const wantsB64 = headerBool(headers, 'X-GPT-Image-Response-B64', profile.responseFormatB64Json);
        const wantsStream = headerBool(headers, 'X-GPT-Image-Stream', profile.streamImages);
        const partialImages = Math.max(0, Math.min(3, headerNum(headers, 'X-GPT-Image-Partial-Images', profile.streamPartialImages || 1)));
        if (wantsB64 && !isGoogleImageProfile(profile)) body.response_format = 'b64_json';
        if (wantsStream && isStreamCompatibleImageProfile(profile) && !isMobileRequest(request)) {
          body.stream = true;
          body.partial_images = partialImages;
        } else if (!isStreamCompatibleImageProfile(profile)) {
          delete body.stream;
          delete body.partial_images;
          delete body.stream_options;
        }
      }
      if (isImageApiPath(apiPath) && isGoogleImageProfile(profile)) sanitizeGoogleImageBody(body);
      headers.delete('Content-Length');
      headers.set('Content-Type', 'application/json');
      return JSON.stringify(body);
    }
  } catch (e) {}
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

export async function onRequest(ctx) {
  const proxyStart = Date.now();
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
    headers.delete('Host'); headers.delete('Cookie'); headers.delete('Origin'); headers.delete('Referer'); headers.delete('CF-Connecting-IP'); headers.delete('X-Forwarded-For'); headers.delete('X-GPT-Image-Session'); headers.delete('X-GPT-Image-Profile-Id'); headers.delete('X-GPT-Image-Timeout-Seconds'); headers.delete('X-GPT-Image-Entry');
    headers.set('Authorization', 'Bearer ' + apiKey);
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Math.min(Number(timeoutOverride || profile.timeout || settings.timeout || 600) * 1000, 6000 * 1000));
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const body = await proxyBody(ctx.request, headers, apiPath, profile);
    headers.delete('X-GPT-Image-Response-B64');
    headers.delete('X-GPT-Image-Stream');
    headers.delete('X-GPT-Image-Partial-Images');
    headers.delete('X-GPT-Image-Multipart-Sanitized');
    const upstreamStart = Date.now();
    const fetchInit = { method: ctx.request.method, headers, body, redirect: 'manual', signal: controller.signal };
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && requiresNodeDuplex(body)) fetchInit.duplex = 'half';
    let upstream;
    try {
      upstream = await fetch(targetUrl, fetchInit);
    } finally {
      clearTimeout(timeoutId);
    }
    const upstreamMs = Date.now() - upstreamStart;
    if (upstream.status >= 300 && upstream.status < 400) {
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
    Object.entries(corsHeaders(ctx.request, {
      'X-GPT-Image-Upstream-Ms': String(upstreamMs),
      'X-GPT-Image-Proxy-Ms': String(Date.now() - proxyStart),
      'X-GPT-Image-Profile-Id': String(profile.id || ''),
      'X-GPT-Image-Profile-Name': encodeURIComponent(String(profile.name || ''))
    })).forEach(([k, v]) => responseHeaders.set(k, v));
    if (isEventStream(upstream.headers) && upstream.ok) return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    const upstreamContentType = String(upstream.headers.get('Content-Type') || '').toLowerCase();
    if (upstream.ok && isImageApiPath(apiPath) && upstream.body && upstreamContentType.includes('application/json')) {
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
      responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      responseHeaders.set('X-GPT-Image-Proxy-Streamed', '1');
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    }
    const bodyText = await upstream.text();
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
    if (e.name === 'AbortError') return upstreamError(ctx.request, '本站代理等待 API 响应超时。请降低生成张数/图片尺寸，或更换响应更稳定的 API 服务商。', 'PROXY_TIMEOUT', 'proxy_timeout', 504, null, { proxyMs: Date.now() - proxyStart });
    return upstreamError(ctx.request, proxyFetchFailedMessage(e, profile, apiPath, ctx.request, new Headers(ctx.request.headers)), 'PROXY_FETCH_FAILED', 'proxy_error', 502, null, { proxyMs: Date.now() - proxyStart });
  }
}

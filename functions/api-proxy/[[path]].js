const JWT_FALLBACK = 'gpt-image2-jwt-secret-key-2026-secure';
function secret(env) { return env && env.JWT_SECRET ? env.JWT_SECRET : JWT_FALLBACK; }
function b64urlDecode(str) { str = String(str || '').replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function getCookie(header, name) { const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
async function importHmacKey(value) { return crypto.subtle.importKey('raw', new TextEncoder().encode(value), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']); }
async function verifyToken(token, env) { const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('invalid token'); const key = await importHmacKey(secret(env)); const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])); if (!ok) throw new Error('bad signature'); const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired'); return payload; }
function getRequestToken(request) {
  const cookieToken = getCookie(request.headers.get('Cookie') || '', 'session');
  if (cookieToken) return cookieToken;
  const headerToken = String(request.headers.get('X-GPT-Image-Session') || '').trim();
  return headerToken || null;
}
async function currentUser(request, env) { const token = getRequestToken(request); if (!token) return null; try { const payload = await verifyToken(token, env); return await env.gpt_image2_db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(payload.userId).first(); } catch (e) { return null; } }
function json(data, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0', ...extraHeaders } }); }
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; } }); return settings; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function normalizeBaseUrl(raw) { let value = String(raw || '').trim().replace(/\/+$/, ''); if (!value) return ''; if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = 'https://' + value; try { const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean); if (!parts.includes('v1')) parts.push('v1'); url.pathname = '/' + parts.join('/'); url.search = ''; url.hash = ''; return url.toString().replace(/\/+$/, ''); } catch (e) { return value.replace(/\/+$/, '') + '/v1'; } }
function findProfileById(settings, profileId) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; if (!profileId) return null; return profiles.find(p => p && (p.id === profileId || p.name === profileId)) || null; }
function normalizeAgentMode(value) { value = String(value || 'off'); if (value === 'same') return 'native'; if (value === 'custom') return 'hybrid'; return value === 'native' || value === 'hybrid' ? value : 'off'; }
function selectedProfile(settings, apiPath = '') { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const activeId = settings.activeProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const cleanPath = String(apiPath || '').replace(/^\/+/, ''); const mode = normalizeAgentMode(settings.agentApiConfigMode); const isResponsesPath = /^responses(?:$|\?|\/)/.test(cleanPath); const isImagesPath = /^images\//.test(cleanPath); const agentText = findProfileById(settings, settings.agentTextProfileId); const agentImage = findProfileById(settings, settings.agentImageProfileId); const preferred = isResponsesPath && (mode === 'native' || mode === 'hybrid') && agentText ? agentText : isImagesPath && mode === 'hybrid' && agentImage ? agentImage : null; const found = preferred || profiles.find(p => p && p.id === activeId) || profiles[0] || null; const base = found || {}; return {
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
  streamPartialImages: asNum(base.streamPartialImages, asNum(settings.streamPartialImages, 1))
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
  streamPartialImages: asNum(p.streamPartialImages, asNum(settings.streamPartialImages, 1))
})); }

function corsHeaders(headers = {}) { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Cache-Control': 'no-store', ...headers }; }
function isEventStream(headers) { return (headers.get('Content-Type') || '').toLowerCase().includes('text/event-stream'); }
function looksLikeCloudflareTimeout(text, status) { const lower = String(text || '').toLowerCase(); return status === 524 || lower.includes('524: a timeout occurred') || lower.includes('error code 524') || (lower.includes('cloudflare') && lower.includes('timeout')) || (status >= 502 && status < 600 && lower.trim().startsWith('<!doctype')); }
function looksLikeHtml(text, contentType) { const lowerType = String(contentType || '').toLowerCase(); const trimmed = String(text || '').trim().toLowerCase(); return lowerType.includes('text/html') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<body'); }
function isMobileRequest(request) { return /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|MQQBrowser|XWEB|TBS/i.test(request.headers.get('User-Agent') || ''); }
function isImageApiPath(apiPath) { return /^images\//i.test(String(apiPath || '').replace(/^\/+/, '')); }
async function proxyBody(request, headers, apiPath) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  if (!isMobileRequest(request) || !isImageApiPath(apiPath)) return request.body;
  const contentType = String(headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return request.body;
  const raw = await request.text();
  try {
    const body = JSON.parse(raw || '{}');
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (body.stream !== undefined) body.stream = false;
      delete body.partial_images;
      delete body.stream_options;
      headers.delete('Content-Length');
      headers.set('Content-Type', 'application/json');
      headers.set('X-GPT-Image-Mobile-Stream-Disabled', '1');
      return JSON.stringify(body);
    }
  } catch (e) {}
  return raw;
}
function upstreamError(message, code, type, status, upstream, extra = {}) {
  return json({
    error: { message, type, code },
    upstreamStatus: upstream ? upstream.status : status,
    upstreamType: upstream ? upstream.headers.get('Content-Type') : undefined,
    ...extra
  }, status, corsHeaders(extra && extra.proxyMs !== undefined ? { 'X-GPT-Image-Proxy-Ms': String(extra.proxyMs) } : {}));
}

export async function onRequest(ctx) {
  const proxyStart = Date.now();
  if (ctx.request.method === 'OPTIONS') return json({ ok: true }, 200, corsHeaders());
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401, corsHeaders());
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const url = new URL(ctx.request.url);
  const apiPath = url.pathname.replace(/^\/api-proxy\/?/, '') + url.search;
  if (!apiPath || apiPath === '/') return json({ error: 'API Proxy - no path specified' }, 400, corsHeaders());
  const profile = selectedProfile(settings, apiPath);
  const baseUrl = normalizeBaseUrl(profile.baseUrl);
  const apiKey = String(profile.apiKey || '').trim();
  if (!baseUrl) return json({ error: 'API configuration is incomplete: missing API URL' }, 500, corsHeaders());
  if (!apiKey) return json({ error: 'API configuration is incomplete: missing API Key' }, 500, corsHeaders());
  const targetUrl = baseUrl + '/' + apiPath.replace(/^\/+/, '');
  try {
    const headers = new Headers(ctx.request.headers);
    headers.delete('Host'); headers.delete('Cookie'); headers.delete('Origin'); headers.delete('Referer'); headers.delete('CF-Connecting-IP'); headers.delete('X-Forwarded-For'); headers.delete('X-GPT-Image-Session');
    headers.set('Authorization', 'Bearer ' + apiKey);
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Math.min(Number(profile.timeout || settings.timeout || 600) * 1000, 6000 * 1000));
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const body = await proxyBody(ctx.request, headers, apiPath);
    const upstreamStart = Date.now();
    let upstream;
    try {
      upstream = await fetch(targetUrl, { method: ctx.request.method, headers, body, redirect: 'follow', signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    const upstreamMs = Date.now() - upstreamStart;
    const responseHeaders = new Headers(upstream.headers);
    Object.entries(corsHeaders({
      'X-GPT-Image-Upstream-Ms': String(upstreamMs),
      'X-GPT-Image-Proxy-Ms': String(Date.now() - proxyStart),
      'X-GPT-Image-Profile-Id': String(profile.id || ''),
      'X-GPT-Image-Profile-Name': encodeURIComponent(String(profile.name || ''))
    })).forEach(([k, v]) => responseHeaders.set(k, v));
    if (isEventStream(upstream.headers) && upstream.ok) return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    const bodyText = await upstream.text();
    try { JSON.parse(bodyText); responseHeaders.set('Content-Type', 'application/json; charset=utf-8'); return new Response(bodyText, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders }); } catch (parseError) {
      if (looksLikeCloudflareTimeout(bodyText, upstream.status)) return upstreamError(
        '上游 API 服务超时（Cloudflare 524/5xx）。这表示 API 服务商长时间未返回结果，不是本站登录或浏览器问题。请稍后重试、更换 API 供应商，或使用服务商支持的异步任务/轮询接口。',
        'UPSTREAM_CLOUDFLARE_TIMEOUT',
        'upstream_timeout',
        504,
        upstream
      );
      if (looksLikeHtml(bodyText, upstream.headers.get('Content-Type'))) return upstreamError(
        '上游 API 返回了 HTML 错误页而不是 JSON。请检查 API 地址是否指向正确的 OpenAI 兼容 /v1 接口，或联系 API 服务商处理网关错误。',
        'UPSTREAM_HTML_RESPONSE',
        'upstream_non_json',
        upstream.ok ? 502 : upstream.status,
        upstream,
        { parseError: parseError.message }
      );
      return upstreamError(
        '上游 API 返回了非 JSON 响应，无法解析为图片生成结果。请检查 API 地址、模型兼容性和服务商返回格式。',
        'UPSTREAM_NON_JSON_RESPONSE',
        'upstream_non_json',
        upstream.ok ? 502 : upstream.status,
        upstream,
        { parseError: parseError.message }
      );
    }
  } catch (e) {
    if (e.name === 'AbortError') return upstreamError('本站代理等待 API 响应超时。请降低生成张数/图片尺寸，或更换响应更稳定的 API 服务商。', 'PROXY_TIMEOUT', 'proxy_timeout', 504, null, { proxyMs: Date.now() - proxyStart });
    return upstreamError('API 代理请求失败：' + (e.message || String(e)), 'PROXY_FETCH_FAILED', 'proxy_error', 502, null, { proxyMs: Date.now() - proxyStart });
  }
}

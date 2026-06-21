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
function normalizeAgentMode(value) { value = String(value || 'off'); if (value === 'same') return 'native'; if (value === 'custom') return 'hybrid'; return value === 'native' || value === 'hybrid' ? value : 'off'; }
function normalizeBaseUrl(raw) { let value = String(raw || '').trim().replace(/\/+$/, ''); if (!value) return ''; if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = 'https://' + value; try { const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean); if (!parts.includes('v1')) parts.push('v1'); url.pathname = '/' + parts.join('/'); url.search = ''; url.hash = ''; return url.toString().replace(/\/+$/, ''); } catch (e) { return value.replace(/\/+$/, '') + '/v1'; } }
function selectedProfile(settings) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const activeId = settings.activeProfileId || (profiles[0] && profiles[0].id) || 'default-openai'; const found = profiles.find(p => p && p.id === activeId) || profiles[0] || null; const base = found || {}; return {
  id: base.id || activeId || 'default-openai',
  name: base.name || '云端配置',
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

export async function onRequest(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const active = selectedProfile(settings);
  const useProxy = active.apiProxy !== false;
  let profiles = sanitizeProfiles(settings);
  const clientActive = clientProfile(active);
  const activeProfileIndex = profiles.findIndex(p => p && p.id === clientActive.id);
  if (activeProfileIndex >= 0) profiles[activeProfileIndex] = clientActive;
  else if (clientActive && clientActive.id) profiles.unshift(clientActive);
  const config = {
    userId: user.id,
    username: user.username,
    defaultApiUrl: clientActive.baseUrl || '',
    defaultModel: clientActive.model || 'gpt-image-2',
    apiKey: useProxy ? (active.apiKey ? 'cloudflare-proxy' : '') : active.apiKey,
    apiMode: clientActive.apiMode || 'images',
    timeout: asNum(clientActive.timeout, 600),
    apiProxy: useProxy,
    codexCli: !!clientActive.codexCli,
    responseFormatB64Json: !!clientActive.responseFormatB64Json,
    streamImages: !!clientActive.streamImages,
    streamPartialImages: asNum(clientActive.streamPartialImages, 1),
    size: settings.size || '',
    quality: settings.quality || 'auto',
    output_format: settings.output_format || 'png',
    output_compression: settings.output_compression === '' ? null : (settings.output_compression === undefined ? null : settings.output_compression),
    moderation: settings.moderation || 'auto',
    n: asNum(settings.n, 1),
    transparent_output: !!settings.transparent_output,
    clearInputAfterSubmit: !!settings.clearInputAfterSubmit,
    persistInput: settings.persistInput !== undefined ? !!settings.persistInput : !!settings.persistInputOnRestart,
    persistInputOnRestart: settings.persistInputOnRestart !== undefined ? !!settings.persistInputOnRestart : !!settings.persistInput,
    taskNotification: settings.taskNotification !== undefined ? !!settings.taskNotification : !!settings.taskCompletionNotification,
    taskCompletionNotification: settings.taskCompletionNotification !== undefined ? !!settings.taskCompletionNotification : !!settings.taskNotification,
    scrollAfterSubmit: !!settings.scrollAfterSubmit,
    alwaysShowRetry: settings.alwaysShowRetry !== undefined ? !!settings.alwaysShowRetry : !!settings.alwaysShowRetryButton,
    reuseProfile: settings.reuseProfile !== undefined ? !!settings.reuseProfile : !!settings.reuseTaskApiProfileTemporarily,
    allowPromptRewrite: !!settings.allowPromptRewrite,
    mathFormatting: settings.mathFormatting !== undefined ? !!settings.mathFormatting : settings.agentMathFormattingPrompt !== false,
    refEditAction: settings.refEditAction || settings.referenceImageEditAction || 'ask',
    enterSubmit: !!settings.enterSubmit,
    zipDownloadRoutes: Array.isArray(settings.zipDownloadRoutes) ? settings.zipDownloadRoutes : undefined,
    agentWebSearch: !!settings.agentWebSearch,
    agentReasoningEffort: settings.agentReasoningEffort || 'medium',
    agentMaxRounds: asNum(settings.agentMaxRounds, asNum(settings.agentMaxToolRounds, 15)),
    agentMaxToolRounds: asNum(settings.agentMaxToolRounds, asNum(settings.agentMaxRounds, 15)),
    agentScrollAfterSubmit: settings.agentScrollAfterSubmit !== undefined ? !!settings.agentScrollAfterSubmit : settings.agentScrollToBottomAfterSubmit !== false,
    agentApiConfigMode: normalizeAgentMode(settings.agentApiConfigMode),
    agentTextProfileId: settings.agentTextProfileId || null,
    agentImageProfileId: settings.agentImageProfileId || null,
    themeMode: settings.themeMode || 'light',
    customProviders: Array.isArray(settings.customProviders) ? settings.customProviders : [],
    profiles: profiles.length ? profiles : [clientActive],
    activeProfileId: settings.activeProfileId || clientActive.id || 'default-openai'
  };
  return json(config, 200, { 'Access-Control-Allow-Origin': '*' });
}

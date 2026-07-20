import { currentUser, json, readJsonBody } from '../../_lib/auth.js';
import { bindClientAbort, fetchPinnedUpstream, isUpstreamTimeoutStatus, normalizeSafeBaseUrl, normalizeUpstreamTimeoutSeconds, safeUpstreamEndpoint } from '../../_lib/upstream-url.js';
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; } }); return settings; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function isSecretPlaceholder(value) { const input = String(value || '').trim(); return input === 'cloudflare-proxy' || input === 'placeholder' || /^\*+MASKED\*+$/i.test(input) || /^\*+REDACTED\*+$/i.test(input); }
function safeProviderDetail(value, secret) { const text = String(value || ''); return (secret ? text.split(secret).join('[redacted]') : text).slice(0, 500); }
function findProfileById(settings, profileId) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; if (!profileId) return null; return profiles.find(p => p && (p.id === profileId || p.name === profileId)) || null; }
function selectedProfile(settings, requestedId = '') { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const imageProfiles = profiles.filter(p => p && (p.apiMode || 'images') === 'images'); const activeId = requestedId || settings.activeImageProfileId || settings.activeProfileId || ''; const found = imageProfiles.find(p => p.id === activeId || p.name === activeId) || imageProfiles[0] || null; const base = found || {}; return {
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

async function handleModelsRequest(ctx, input = {}) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  let baseUrl = input.baseUrl || '';
  let apiKey = input.apiKey || '';
  const requestedProfileId = firstString(input.profileId);
  let timeoutSeconds = normalizeUpstreamTimeoutSeconds(input.timeout);
  if (!baseUrl || !apiKey || isSecretPlaceholder(apiKey) || requestedProfileId) {
    const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
    const profile = selectedProfile(settings, requestedProfileId);
    if (requestedProfileId && !findProfileById(settings, requestedProfileId)) return json({ error: 'Selected profile was not found' }, 400);
    baseUrl = baseUrl || profile.baseUrl;
    apiKey = !apiKey || isSecretPlaceholder(apiKey) ? profile.apiKey : apiKey;
    timeoutSeconds = normalizeUpstreamTimeoutSeconds(profile.timeout, timeoutSeconds);
  }
  if (!baseUrl || !apiKey) return json({ error: 'Missing baseUrl or apiKey' }, 400);
  let timeoutId = null;
  let upstream = null;
  const controller = new AbortController();
  const clientAbort = bindClientAbort(ctx.request, controller);
  timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const endpoint = safeUpstreamEndpoint(normalizeSafeBaseUrl(baseUrl), 'models');
    const pinned = await fetchPinnedUpstream(endpoint, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal
    }, {
      allowedHosts: ctx.env?.UPSTREAM_ALLOWED_HOSTS,
      requireAllowlist: String(ctx.env?.UPSTREAM_ALLOWLIST_REQUIRED || '').toLowerCase() === 'true',
      allowPlatformDnsFallback: true
    });
    upstream = pinned.response;
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel?.().catch?.(() => {});
      return json({ error: 'Provider redirects are not allowed' }, 502);
    }
    const text = await upstream.text();
    if (!upstream.ok) {
      if (isUpstreamTimeoutStatus(upstream.status, text)) {
        return json({ error: 'Models provider request timed out', code: 'UPSTREAM_CLOUDFLARE_TIMEOUT', upstreamStatus: upstream.status, timeoutSeconds, detail: safeProviderDetail(text, apiKey) }, 504);
      }
      return json({ error: 'API error: ' + upstream.status, code: 'UPSTREAM_PROVIDER_ERROR', upstreamStatus: upstream.status, detail: safeProviderDetail(text, apiKey) }, 502);
    }
    let data;
    try { data = JSON.parse(text); } catch (e) { return json({ error: 'Provider did not return valid JSON', detail: safeProviderDetail(text, apiKey) }, 502); }
    const models = (data.data || data.models || []).map(m => typeof m === 'string' ? { id: m, ownedBy: '' } : { id: m.id || m.name || '', ownedBy: m.owned_by || m.ownedBy || '' }).filter(m => m.id);
    return json({ models, source: 'provider' });
  } catch (e) {
    if (clientAbort.wasAborted()) return json({ error: 'Models request cancelled', code: 'CLIENT_ABORTED' }, 499);
    if (controller.signal.aborted || e?.name === 'AbortError' || e?.code === 'UPSTREAM_DNS_TIMEOUT') return json({ error: 'Models request timed out', code: 'UPSTREAM_TIMEOUT', timeoutSeconds }, 504);
    if (e?.code === 'UPSTREAM_DNS_REJECTED') return json({ error: e.message, code: e.code }, 400);
    if (e?.code === 'UPSTREAM_HOST_ALLOWLIST_MISSING' || e?.code === 'UPSTREAM_HOST_ALLOWLIST_INVALID' || e?.code === 'UPSTREAM_HOST_NOT_ALLOWED') return json({ error: e.message, code: e.code }, 400);
    if (e?.code === 'UPSTREAM_DNS_REBOUND' || e?.code === 'UPSTREAM_DNS_FAILED') return json({ error: e.message, code: e.code }, 502);
    if (/^API URL/.test(String(e?.message || ''))) return json({ error: e.message, code: 'INVALID_UPSTREAM_URL' }, 400);
    return json({ error: 'Fetch models failed', code: 'UPSTREAM_FETCH_FAILED', detail: safeProviderDetail(e?.message, apiKey) }, 502);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    clientAbort.cleanup();
  }
}

export async function onRequestGet(ctx) {
  return handleModelsRequest(ctx);
}

export async function onRequestPost(ctx) {
  let body = {};
  try { body = await readJsonBody(ctx.request, 16 * 1024); }
  catch (error) { return json({ error: error.message || 'Invalid JSON body' }, error?.status === 413 ? 413 : 400); }
  return handleModelsRequest(ctx, body || {});
}

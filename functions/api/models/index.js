import { currentUser, json } from '../../_lib/auth.js';
import { normalizeSafeBaseUrl, safeUpstreamEndpoint } from '../../_lib/upstream-url.js';
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; } }); return settings; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
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

async function handleModelsRequest(ctx, input = {}) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  let baseUrl = input.baseUrl || '';
  let apiKey = input.apiKey || '';
  if (!baseUrl || !apiKey) {
    const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
    const profile = selectedProfile(settings);
    baseUrl = baseUrl || profile.baseUrl;
    apiKey = apiKey || profile.apiKey;
  }
  if (!baseUrl || !apiKey) return json({ error: 'Missing baseUrl or apiKey' }, 400);
  try {
    const endpoint = safeUpstreamEndpoint(normalizeSafeBaseUrl(baseUrl), 'models');
    const res = await fetch(endpoint, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
      redirect: 'manual'
    });
    if (res.status >= 300 && res.status < 400) {
      return json({ error: 'Provider redirects are not allowed' }, 502);
    }
    const text = await res.text();
    if (!res.ok) return json({ error: 'API error: ' + res.status, detail: text.slice(0, 500) }, 502);
    let data;
    try { data = JSON.parse(text); } catch (e) { return json({ error: 'Provider did not return valid JSON', detail: text.slice(0, 500) }, 502); }
    const models = (data.data || data.models || []).map(m => typeof m === 'string' ? { id: m, ownedBy: '' } : { id: m.id || m.name || '', ownedBy: m.owned_by || m.ownedBy || '' }).filter(m => m.id);
    return json({ models, source: 'provider' });
  } catch (e) {
    return json({ error: e.message || 'Fetch models failed' }, 500);
  }
}

export async function onRequestGet(ctx) {
  return handleModelsRequest(ctx);
}

export async function onRequestPost(ctx) {
  let body = {};
  try { body = await ctx.request.json(); } catch (e) { body = {}; }
  return handleModelsRequest(ctx, body || {});
}

import { currentUser, json } from '../_lib/auth.js';
import { maskSecrets } from '../_lib/settings-secrets.js';
import { findProfileBySelectionKey, profileSelectionKey } from '../_lib/profile-header.js';
async function loadSettings(db, userId) { const rows = await db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?').bind(userId).all(); const settings = {}; (rows.results || []).forEach(row => { try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; } }); return settings; }
function asBool(value, fallback = false) { return value === undefined || value === null ? fallback : !!value; }
function asNum(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function firstString() { for (let i = 0; i < arguments.length; i++) { const v = arguments[i]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; }
function firstDefined() { for (let i = 0; i < arguments.length; i++) { if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i]; } return undefined; }
function normalizeImageQuality(value, fallback = 'high') { const normalized = String(value || '').trim().toLowerCase(); if (['auto', 'low', 'medium', 'high'].includes(normalized)) return normalized; if (normalized === 'hd') return 'high'; if (normalized === 'standard') return 'medium'; return ['auto', 'low', 'medium', 'high'].includes(fallback) ? fallback : 'high'; }
function normalizeAgentMode(value) { value = String(value || 'off'); if (value === 'same') return 'native'; if (value === 'custom') return 'hybrid'; return value === 'native' || value === 'hybrid' ? value : 'off'; }
function normalizeBaseUrl(raw) { let value = String(raw || '').trim().replace(/\/+$/, ''); if (!value) return ''; if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = 'https://' + value; try { const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean); if (!parts.includes('v1')) parts.push('v1'); url.pathname = '/' + parts.join('/'); url.search = ''; url.hash = ''; return url.toString().replace(/\/+$/, ''); } catch (e) { return value.replace(/\/+$/, '') + '/v1'; } }
function selectedProfile(settings) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; const imageProfiles = profiles.filter(p => p && (p.apiMode || 'images') === 'images'); const activeImageId = settings.activeImageProfileId || ''; const activeId = settings.activeProfileId || ''; const found = findProfileBySelectionKey(imageProfiles, activeImageId) || findProfileBySelectionKey(imageProfiles, activeId) || imageProfiles[0] || null; const base = found || {}; return {
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
  streamPartialImages: asNum(base.streamPartialImages, asNum(settings.streamPartialImages, 1)),
  streamResponses: asBool(base.streamResponses, asBool(settings.streamResponses, false)),
  responsesStream: asBool(base.responsesStream, asBool(settings.responsesStream, false))
}; }
function clientProfile(profile, env) { const browserKeysAllowed = String(env?.ALLOW_BROWSER_API_KEYS || '').toLowerCase() === 'true'; const useProxy = !browserKeysAllowed || !!profile.apiKey || profile.apiProxy !== false; return { ...profile, baseUrl: profile.baseUrl || '', apiKey: useProxy ? (profile.apiKey ? 'cloudflare-proxy' : '') : profile.apiKey, apiProxy: useProxy } }
function sanitizeProfiles(settings, env) { const profiles = Array.isArray(settings.profiles) ? settings.profiles : []; if (!profiles.length) return []; return profiles.map((p, index) => clientProfile({
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
}, env)); }

export async function onRequest(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  const active = selectedProfile(settings);
  const configuredProfiles = Array.isArray(settings.profiles) ? settings.profiles.filter(Boolean) : [];
  const configuredActive = findProfileBySelectionKey(configuredProfiles, settings.activeProfileId || '');
  const activeProfileKey = configuredProfiles.length ? (profileSelectionKey(configuredActive || active, configuredProfiles) || 'default-openai') : String(settings.activeProfileId || active.id || 'default-openai');
  const activeImageProfileKey = configuredProfiles.length ? (profileSelectionKey(active, configuredProfiles) || activeProfileKey) : String(settings.activeImageProfileId || active.id || activeProfileKey);
  let profiles = sanitizeProfiles(settings, ctx.env);
  const clientActive = clientProfile(active, ctx.env);
  const useProxy = clientActive.apiProxy !== false;
  const activeProfileIndex = profiles.findIndex(p => profileSelectionKey(p, profiles) === activeImageProfileKey);
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
    quality: normalizeImageQuality(settings.quality),
    output_format: settings.output_format || 'png',
    output_compression: settings.output_compression === '' ? null : (settings.output_compression === undefined ? null : settings.output_compression),
    moderation: settings.moderation || 'auto',
    n: asNum(settings.n, 1),
    transparent_output: !!settings.transparent_output,
    transparentOutput: !!settings.transparent_output,
    clearInputAfterSubmit: !!settings.clearInputAfterSubmit,
    persistInput: settings.persistInput !== undefined ? !!settings.persistInput : !!settings.persistInputOnRestart,
    persistInputOnRestart: settings.persistInputOnRestart !== undefined ? !!settings.persistInputOnRestart : !!settings.persistInput,
    taskNotification: settings.taskNotification !== undefined ? !!settings.taskNotification : !!settings.taskCompletionNotification,
    taskCompletionNotification: settings.taskCompletionNotification !== undefined ? !!settings.taskCompletionNotification : !!settings.taskNotification,
    scrollAfterSubmit: !!settings.scrollAfterSubmit,
    alwaysShowRetry: settings.alwaysShowRetry !== undefined ? !!settings.alwaysShowRetry : !!settings.alwaysShowRetryButton,
    alwaysShowRetryButton: settings.alwaysShowRetryButton !== undefined ? !!settings.alwaysShowRetryButton : !!settings.alwaysShowRetry,
    reuseProfile: settings.reuseProfile !== undefined ? !!settings.reuseProfile : !!settings.reuseTaskApiProfileTemporarily,
    reuseTaskApiProfileTemporarily: settings.reuseTaskApiProfileTemporarily !== undefined ? !!settings.reuseTaskApiProfileTemporarily : !!settings.reuseProfile,
    allowPromptRewrite: firstDefined(settings.allowPromptRewrite, true) !== false,
    mathFormatting: settings.mathFormatting !== undefined ? !!settings.mathFormatting : settings.agentMathFormattingPrompt !== false,
    agentMathFormattingPrompt: settings.agentMathFormattingPrompt !== undefined ? !!settings.agentMathFormattingPrompt : settings.mathFormatting !== false,
    refEditAction: settings.refEditAction || settings.referenceImageEditAction || 'ask',
    referenceImageEditAction: settings.referenceImageEditAction || settings.refEditAction || 'ask',
    enterSubmit: !!settings.enterSubmit,
    zipDownloadRoutes: Array.isArray(settings.zipDownloadRoutes) ? settings.zipDownloadRoutes : undefined,
    agentWebSearch: !!settings.agentWebSearch,
    agentReasoningEffort: settings.agentReasoningEffort || 'medium',
    agentMaxRounds: asNum(settings.agentMaxRounds, asNum(settings.agentMaxToolRounds, 15)),
    agentMaxToolRounds: asNum(settings.agentMaxToolRounds, asNum(settings.agentMaxRounds, 15)),
    agentScrollAfterSubmit: settings.agentScrollAfterSubmit !== undefined ? !!settings.agentScrollAfterSubmit : settings.agentScrollToBottomAfterSubmit !== false,
    agentScrollToBottomAfterSubmit: settings.agentScrollToBottomAfterSubmit !== undefined ? !!settings.agentScrollToBottomAfterSubmit : settings.agentScrollAfterSubmit !== false,
    agentApiConfigMode: normalizeAgentMode(settings.agentApiConfigMode),
    agentTextProfileId: settings.agentTextProfileId || null,
    agentImageProfileId: settings.agentImageProfileId || null,
    themeMode: settings.themeMode || 'light',
    customProviders: Array.isArray(settings.customProviders) ? settings.customProviders : [],
    profiles: profiles.length ? profiles : [clientActive],
    activeProfileId: activeProfileKey,
    activeImageProfileId: activeImageProfileKey
  };
  return json(maskSecrets(config, '', 'cloudflare-proxy'));
}

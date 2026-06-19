const SK = 'gpt-image2-jwt-secret-key-2026-secure';

function bd(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), function(c) { return c.charCodeAt(0); });
}
function gc(h, n) {
  var m = h.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function gk() {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(SK),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
}
async function vt(t) {
  var parts = t.split('.');
  if (parts.length !== 3) throw new Error('invalid');
  var k = await gk();
  var valid = await crypto.subtle.verify('HMAC', k, bd(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!valid) throw new Error('bad');
  return JSON.parse(new TextDecoder().decode(bd(parts[1])));
}
async function vs(r, env) {
  var t = gc(r.headers.get('Cookie') || '', 'session');
  if (!t) return null;
  try {
    var p = await vt(t);
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return await env.gpt_image2_db
      .prepare('SELECT id, username, role FROM users WHERE id = ?')
      .bind(p.userId).first();
  } catch (e) { return null; }
}

async function getAdminId(db) {
  var admin = await db.prepare('SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1').bind('admin').first();
  return admin ? admin.id : null;
}

async function getSettings(db, userId) {
  if (!userId) return {};
  var results = await db
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .all();
  var saved = {};
  (results.results || []).forEach(function(row) {
    try { saved[row.key] = JSON.parse(row.value); } catch (e) { saved[row.key] = row.value; }
  });
  return saved;
}

export async function onRequest (ctx) {
  var config = {
    defaultApiUrl: '',
    defaultModel: 'gpt-image-2',
    apiKey: '',
    apiMode: 'images',
    timeout: 600,
    apiProxy: true,
    streamImages: true,
    streamPartialImages: 1,
    size: '',
    quality: 'standard',
    output_format: 'png',
    codexCli: false,
    persistInput: false,
    clearInputAfterSubmit: false,
    taskNotification: false,
    scrollAfterSubmit: false,
    alwaysShowRetry: false,
    reuseProfile: false,
    mathFormatting: false,
    refEditAction: 'ask',
    enterSubmit: false,
    agentWebSearch: false,
    agentMaxRounds: 32,
    agentScrollAfterSubmit: false,
    profiles: [],
    customProviders: [],
    activeProfileId: 'default-openai'
  };

  try {
    var adminId = await getAdminId(ctx.env.gpt_image2_db);
    if (adminId) {
      var globalSettings = await getSettings(ctx.env.gpt_image2_db, adminId);
      if (globalSettings.baseUrl) config.defaultApiUrl = globalSettings.baseUrl;
      if (globalSettings.model) config.defaultModel = globalSettings.model;
      if (globalSettings.apiMode) config.apiMode = globalSettings.apiMode;
      if (globalSettings.timeout) config.timeout = parseInt(globalSettings.timeout) || 600;
      config.apiProxy = true;
      if (globalSettings.apiKey !== undefined) config.apiKey = globalSettings.apiKey;
      if (globalSettings.streamImages !== undefined) config.streamImages = globalSettings.streamImages;
      if (globalSettings.streamPartialImages !== undefined) config.streamPartialImages = parseInt(globalSettings.streamPartialImages) || 1;
      if (globalSettings.size) config.size = globalSettings.size;
      if (globalSettings.quality) config.quality = globalSettings.quality;
      if (globalSettings.output_format) config.output_format = globalSettings.output_format;
      if (globalSettings.codexCli !== undefined) config.codexCli = globalSettings.codexCli;
      if (globalSettings.persistInput !== undefined) config.persistInput = globalSettings.persistInput;
      if (globalSettings.clearInputAfterSubmit !== undefined) config.clearInputAfterSubmit = globalSettings.clearInputAfterSubmit;
      if (globalSettings.taskNotification !== undefined) config.taskNotification = globalSettings.taskNotification;
      if (globalSettings.scrollAfterSubmit !== undefined) config.scrollAfterSubmit = globalSettings.scrollAfterSubmit;
      if (globalSettings.alwaysShowRetry !== undefined) config.alwaysShowRetry = globalSettings.alwaysShowRetry;
      if (globalSettings.reuseProfile !== undefined) config.reuseProfile = globalSettings.reuseProfile;
      if (globalSettings.mathFormatting !== undefined) config.mathFormatting = globalSettings.mathFormatting;
      if (globalSettings.refEditAction) config.refEditAction = globalSettings.refEditAction;
      if (globalSettings.enterSubmit !== undefined) config.enterSubmit = globalSettings.enterSubmit;
      if (globalSettings.agentWebSearch !== undefined) config.agentWebSearch = globalSettings.agentWebSearch;
      if (globalSettings.agentMaxRounds) config.agentMaxRounds = parseInt(globalSettings.agentMaxRounds) || 32;
      if (globalSettings.agentScrollAfterSubmit !== undefined) config.agentScrollAfterSubmit = globalSettings.agentScrollAfterSubmit;
      if (globalSettings.profiles) config.profiles = globalSettings.profiles;
      if (globalSettings.customProviders) config.customProviders = globalSettings.customProviders;
      if (globalSettings.activeProfileId) config.activeProfileId = globalSettings.activeProfileId;
    }
  } catch (e) {}

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

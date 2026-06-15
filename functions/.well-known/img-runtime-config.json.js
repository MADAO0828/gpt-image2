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

export async function onRequest(ctx) {
  var config = {
    defaultApiUrl: '',
    defaultModel: 'gpt-image-2',
    apiKey: '',
    apiMode: 'images',
    timeout: 600,
    apiProxyEnabled: false,
    streamImages: false
  };

  // Load global settings from the first admin account
  try {
    var adminId = await getAdminId(ctx.env.gpt_image2_db);
    if (adminId) {
      var globalSettings = await getSettings(ctx.env.gpt_image2_db, adminId);
      if (globalSettings.baseUrl) config.defaultApiUrl = globalSettings.baseUrl;
      if (globalSettings.apiKey) config.apiKey = globalSettings.apiKey;
      if (globalSettings.model) config.defaultModel = globalSettings.model;
      if (globalSettings.apiMode) config.apiMode = globalSettings.apiMode;
      if (globalSettings.timeout) config.timeout = parseInt(globalSettings.timeout) || 600;
      if (globalSettings.apiProxy) config.apiProxyEnabled = true;
      if (globalSettings.streamImages) config.streamImages = true;
    }
  } catch (e) {}

  // Merge user-specific settings on top (logged-in user can override)
  var user = await vs(ctx.request, ctx.env);
  if (user) {
    try {
      var userSettings = await getSettings(ctx.env.gpt_image2_db, user.id);
      if (userSettings.baseUrl) config.defaultApiUrl = userSettings.baseUrl;
      if (userSettings.apiKey) config.apiKey = userSettings.apiKey;
      if (userSettings.model) config.defaultModel = userSettings.model;
      if (userSettings.apiMode) config.apiMode = userSettings.apiMode;
      if (userSettings.timeout) config.timeout = parseInt(userSettings.timeout) || 600;
      if (userSettings.apiProxy) config.apiProxyEnabled = true;
      if (userSettings.streamImages) config.streamImages = true;
    } catch (e) {}
  }

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
}

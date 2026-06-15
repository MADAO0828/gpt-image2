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

// Get the first admin user's id (for global settings)
async function getAdminId(db) {
  var admin = await db.prepare('SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1').bind('admin').first();
  return admin ? admin.id : null;
}

function json(data, status) {
  return new Response(JSON.stringify(data), { 
    status: status || 200, 
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
}

// Helper: load settings for a specific user
async function loadUserSettings(db, userId) {
  if (!userId) return {};
  var results = await db
    .prepare('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? ORDER BY key')
    .bind(userId)
    .all();
  var settings = {};
  (results.results || []).forEach(function(row) {
    try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; }
  });
  return settings;
}

// POST /api/settings/save - Save user settings
// Admin saves are ALSO stored globally (under admin account) for all users
export async function onRequestPost(ctx) {
  var user = await vs(ctx.request, ctx.env);
  if (!user) return json({ error: 'no login' }, 401);

  try {
    var text = await ctx.request.text();
    var body = JSON.parse(text);
    var settings = body.settings || body;
    if (body.key) {
      settings = [{ key: body.key, value: body.value }];
    }
    if (!Array.isArray(settings)) {
      settings = Object.entries(settings).map(function(e) { 
        return { key: e[0], value: typeof e[1] === 'string' ? e[1] : JSON.stringify(e[1]) }; 
      });
    }
    // Save to current user
    for (var i = 0; i < settings.length; i++) {
      var s = settings[i];
      if (!s.key) continue;
      var val = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      await ctx.env.gpt_image2_db
        .prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = datetime(\'now\')')
        .bind(user.id, s.key, val, val)
        .run();
    }
    // If admin, ALSO save globally (to the first admin account)
    if (user.role === 'admin') {
      var adminId = await getAdminId(ctx.env.gpt_image2_db);
      if (adminId && adminId !== user.id) {
        for (var j = 0; j < settings.length; j++) {
          var s2 = settings[j];
          if (!s2.key) continue;
          var val2 = typeof s2.value === 'string' ? s2.value : JSON.stringify(s2.value);
          await ctx.env.gpt_image2_db
            .prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = datetime(\'now\')')
            .bind(adminId, s2.key, val2, val2)
            .run();
        }
      }
    }
    return json({ success: true, message: 'ok' });
  } catch (e) {
    return json({ error: 'format error: ' + e.message }, 400);
  }
}

// GET /api/settings/save - Return merged settings (global defaults + user overrides)
export async function onRequestGet(ctx) {
  var user = await vs(ctx.request, ctx.env);
  if (!user) return json({ error: 'no login' }, 401);
  
  // 1. Load global defaults (from the first admin account)
  var adminId = await getAdminId(ctx.env.gpt_image2_db);
  var globalSettings = adminId ? await loadUserSettings(ctx.env.gpt_image2_db, adminId) : {};
  // 2. Load current user's own settings
  var userSettings = await loadUserSettings(ctx.env.gpt_image2_db, user.id);
  // 3. Merge: user settings override global defaults
  var merged = {};
  Object.keys(globalSettings).forEach(function(k) { merged[k] = globalSettings[k]; });
  Object.keys(userSettings).forEach(function(k) { merged[k] = userSettings[k]; });
  
  return json({ settings: merged });
}

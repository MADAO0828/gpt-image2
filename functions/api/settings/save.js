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
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

// Load settings for a specific user
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

// POST /api/settings/save - ONLY admin can save global settings
// Regular users cannot save settings - admin is the single source of truth
export async function onRequestPost(ctx) {
  var user = await vs(ctx.request, ctx.env);
  if (!user) return json({ error: 'no login' }, 401);
  // Only admin can modify global settings
  if (user.role !== 'admin') return json({ error: 'insufficient permissions' }, 403);

  try {
    var text = await ctx.request.text();
    var body = JSON.parse(text);
    var settings = body.settings || body;
    
    // Convert object to array of {key, value}
    if (!Array.isArray(settings)) {
      settings = Object.entries(settings).map(function(e) { 
        return { key: e[0], value: typeof e[1] === 'string' ? e[1] : JSON.stringify(e[1]) }; 
      });
    }
    
    // Save to the FIRST admin account (global settings)
    var adminId = await getAdminId(ctx.env.gpt_image2_db);
    if (!adminId) return json({ error: 'no admin user found' }, 500);
    
    for (var i = 0; i < settings.length; i++) {
      var s = settings[i];
      if (!s.key) continue;
      var val = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      await ctx.env.gpt_image2_db
        .prepare('INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = datetime(\'now\')')
        .bind(adminId, s.key, val, val)
        .run();
    }
    
    return json({ success: true, message: 'settings saved to global config' });
  } catch (e) {
    return json({ error: 'format error: ' + e.message }, 400);
  }
}

// GET /api/settings/save - Return ONLY global settings (admin = single source of truth)
// No user overrides - everyone gets same settings from admin
export async function onRequestGet(ctx) {
  var user = await vs(ctx.request, ctx.env);
  if (!user) return json({ error: 'no login' }, 401);
  if (user.role !== 'admin') return json({ error: 'insufficient permissions' }, 403);
  
  // Load ONLY global defaults (from the first admin account)
  var adminId = await getAdminId(ctx.env.gpt_image2_db);
  var globalSettings = adminId ? await loadUserSettings(ctx.env.gpt_image2_db, adminId) : {};
  
  return json({ settings: globalSettings });
}

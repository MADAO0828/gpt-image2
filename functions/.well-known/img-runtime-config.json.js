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

export async function onRequest(ctx) {
  var config = {
    defaultApiUrl: "",
    defaultModel: "gpt-image-2",
    apiProxyUrl: "",
    apiProxyEnabled: false,
    apiProxyLocked: false
  };

  var user = await vs(ctx.request, ctx.env);
  if (user) {
    try {
      var results = await ctx.env.gpt_image2_db
        .prepare("SELECT key, value FROM user_settings WHERE user_id = ?")
        .bind(user.id)
        .all();

      var saved = {};
      (results.results || []).forEach(function(row) {
        try { saved[row.key] = JSON.parse(row.value); }
        catch (e) { saved[row.key] = row.value; }
      });

      // Map cloud settings to SPA-compatible config keys
      if (saved.baseUrl) config.defaultApiUrl = saved.baseUrl;
      if (saved.apiKey) config.apiKey = saved.apiKey;
      if (saved.model) config.defaultModel = saved.model;
      if (saved.apiProxy) config.apiProxyEnabled = true;
      if (saved.timeout) config.timeout = parseInt(saved.timeout) || 600;
    } catch (e) {}
  }

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

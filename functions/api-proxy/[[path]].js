// API Proxy - forwards requests to the user's configured API URL
// Handles /api-proxy/* paths

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
    return await env.gpt_image2_db.prepare('SELECT id, username, role FROM users WHERE id = ?')
      .bind(p.userId).first();
  } catch (e) { return null; }
}

export async function onRequest(ctx) {
  var user = await vs(ctx.request, ctx.env);
  
  // Get the user's configured API base URL from their settings
  var targetBase = 'https://api.openai.com'; // default
  if (user) {
    try {
      var result = await ctx.env.gpt_image2_db
        .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'baseUrl'")
        .bind(user.id)
        .first();
      if (result && result.value) {
        var val = result.value;
        try { val = JSON.parse(val); } catch (e) {}
        if (val && val !== '') targetBase = val;
      }
    } catch (e) {}
  }

  // Get the API path from the URL (everything after /api-proxy/)
  var url = new URL(ctx.request.url);
  var apiPath = url.pathname.replace('/api-proxy', '') + url.search;
  if (!apiPath || apiPath === '/') {
    return new Response('API Proxy - no path specified', { status: 400 });
  }

  // Build the target URL
  var targetUrl = targetBase.replace(/\/+$/, '') + apiPath;
  
  // Forward the request
  try {
    var headers = new Headers(ctx.request.headers);
    // Remove host and cookie headers (don't forward to API)
    headers.delete('Host');
    headers.delete('Cookie');
    headers.delete('Origin');
    headers.delete('Referer');
    // Ensure content-type is set
    if (!headers.has('Content-Type') && ctx.request.method !== 'GET') {
      headers.set('Content-Type', 'application/json');
    }

    var proxyReq = new Request(targetUrl, {
      method: ctx.request.method,
      headers: headers,
      body: ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD' 
        ? ctx.request.body : undefined,
      redirect: 'follow'
    });

    var response = await fetch(proxyReq);
    
    // Return with CORS headers
    var respHeaders = new Headers(response.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders
    });
  } catch (e) {
    return new Response(JSON.stringify({ 
      error: 'API 代理请求失败: ' + e.message,
      hint: '请检查 API 地址是否正确、服务是否正常运行'
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

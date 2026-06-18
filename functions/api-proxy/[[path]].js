const DEFAULT_SK = 'gpt-image2-jwt-secret-key-2026-secure';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'no-store'
    }
  });
}

function bd(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), function(c) { return c.charCodeAt(0); });
}
function gc(h, n) {
  var m = h.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function gk(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret || DEFAULT_SK),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
}
async function vt(t, secret) {
  var parts = t.split('.');
  if (parts.length !== 3) throw new Error('invalid');
  var k = await gk(secret);
  var valid = await crypto.subtle.verify('HMAC', k, bd(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!valid) throw new Error('bad');
  return JSON.parse(new TextDecoder().decode(bd(parts[1])));
}
async function vs(r, env) {
  var t = gc(r.headers.get('Cookie') || '', 'session');
  if (!t) return null;
  try {
    var p = await vt(t, env.JWT_SECRET);
    if (p.exp && p.exp < Math.floor(Date.now() / 1000)) return null;
    return await env.gpt_image2_db
      .prepare('SELECT id, username, role FROM users WHERE id = ?')
      .bind(p.userId).first();
  } catch (e) { return null; }
}

async function getGlobalSettings(db) {
  var settings = {};
  var admin = await db
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
    .first();
  if (!admin) return settings;
  var rows = await db
    .prepare("SELECT key, value FROM user_settings WHERE user_id = ? AND key IN ('baseUrl', 'apiKey')")
    .bind(admin.id)
    .all();
  (rows.results || []).forEach(function(row) {
    var val = row.value;
    try { val = JSON.parse(val); } catch (e) {}
    settings[row.key] = val;
  });
  return settings;
}

function normalizeBaseUrl(raw) {
  var value = String(raw || 'https://api.openai.com').trim().replace(/\/+$/, '');
  if (!value) value = 'https://api.openai.com';
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) value = 'https://' + value;
  try {
    var url = new URL(value);
    var parts = url.pathname.split('/').filter(Boolean);
    if (parts.indexOf('v1') < 0) parts.push('v1');
    url.pathname = '/' + parts.join('/');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch (e) {
    return value.replace(/\/+$/, '') + '/v1';
  }
}

export async function onRequest(ctx) {
  if (ctx.request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  var user = await vs(ctx.request, ctx.env);
  if (!user) return json({ error: '未登录' }, 401);

  var settings = {};
  try {
    settings = await getGlobalSettings(ctx.env.gpt_image2_db);
  } catch (e) {}

  var targetBase = normalizeBaseUrl(settings.baseUrl);
  var apiKey = String(settings.apiKey || '').trim();
  if (!apiKey) return json({ error: '尚未完成 API Key 配置' }, 500);

  var url = new URL(ctx.request.url);
  var apiPath = url.pathname.replace('/api-proxy', '') + url.search;
  if (!apiPath || apiPath === '/') {
    return json({ error: 'API Proxy - no path specified' }, 400);
  }

  var targetUrl = targetBase + apiPath;
  try {
    var headers = new Headers(ctx.request.headers);
    headers.delete('Host');
    headers.delete('Cookie');
    headers.delete('Origin');
    headers.delete('Referer');
    headers.set('Authorization', 'Bearer ' + apiKey);
    if (!headers.has('Content-Type') && ctx.request.method !== 'GET') {
      headers.set('Content-Type', 'application/json');
    }

    var response = await fetch(new Request(targetUrl, {
      method: ctx.request.method,
      headers: headers,
      body: ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD'
        ? ctx.request.body : undefined,
      redirect: 'follow'
    }));

    var respHeaders = new Headers(response.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');
    respHeaders.set('Cache-Control', 'no-store');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders
    });
  } catch (e) {
    return json({
      error: 'API 代理请求失败: ' + e.message,
      hint: '请检查 API 地址是否正确、服务是否正常运行'
    }, 502);
  }
}

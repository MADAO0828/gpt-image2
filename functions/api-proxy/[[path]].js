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
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
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

// Check if upstream response is valid JSON content (including SSE streaming)
function isJsonResponse(headers) {
  var ct = (headers.get('Content-Type') || '').toLowerCase();
  return ct.indexOf('application/json') === 0 ||
         ct.indexOf('text/event-stream') === 0;
}

function isEventStream(headers) {
  var ct = (headers.get('Content-Type') || '').toLowerCase();
  return ct.indexOf('text/event-stream') === 0;
}


// Detect upstream timeout/524 error
function detectUpstreamTimeout(bodyText, status) {
  if (status === 524) return true;
  if (bodyText.indexOf('524: A timeout occurred') >= 0 || bodyText.indexOf('Error code 524') >= 0) return true;
  if (bodyText.indexOf('cloudflare') >= 0 && bodyText.indexOf('timeout') >= 0) return true;
  if (status >= 502 && status < 600 && bodyText.indexOf('<!DOCTYPE') === 0) return true;
  return false;
}
function truncateBody(text) {
  if (!text) return '';
  return text.length > 2000 ? text.substring(0, 2000) + '...' : text;
}

export async function onRequest(ctx) {
  if (ctx.request.method === 'OPTIONS') {
    return json({ ok: true });
  }

  var user = await vs(ctx.request, ctx.env);
  if (!user) return json({ error: '\u672a\u767b\u5f55' }, 401);

  var settings = {};
  try {
    settings = await getGlobalSettings(ctx.env.gpt_image2_db);
  } catch (e) {}

  var targetBase = normalizeBaseUrl(settings.baseUrl);
  var apiKey = String(settings.apiKey || '').trim();
  if (!apiKey) return json({ error: '\u5c1a\u672a\u5b8c\u6210 API Key \u914d\u7f6e' }, 500);

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

    // Use AbortController for timeout (Cloudflare free plan subrequest limit ~100s)
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, 300000); // 5 minute timeout

    var response = await fetch(new Request(targetUrl, {
      method: ctx.request.method,
      headers: headers,
      body: ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD'
        ? ctx.request.body : undefined,
      redirect: 'follow',
      signal: controller.signal
    }));

    clearTimeout(timeoutId);

    var respHeaders = new Headers(response.headers);
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', '*');
    respHeaders.set('Cache-Control', 'no-store');

    if (isEventStream(response.headers) && response.ok) {
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders
      });
    }

    var bodyText = '';
    try {
      bodyText = await response.text();
    } catch (e) {
      bodyText = '(unable to read response body)';
    }

    var parsedOk = false;
    var parseError = '';
    try {
      JSON.parse(bodyText);
      parsedOk = true;
    } catch (e) {
      parseError = e.message || String(e);
    }

    if (parsedOk) {
      respHeaders.set('Content-Type', 'application/json');
      return new Response(bodyText, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders
      });
    }

    if (detectUpstreamTimeout(bodyText, response.status)) {
      return json({
        error: 'API \u4e0a\u6e38\u8d85\u65f6(524)\uff0c\u751f\u56fe\u65f6\u95f4\u8fc7\u957f\u5bfc\u81f4\u8fde\u63a5\u65ad\u5f00\u3002'
          + '\u5efa\u8bae\uff1a\u5728\u7ba1\u7406\u5458\u540e\u53f0\u5f00\u542f\u201c\u6d41\u5f0f\u8f93\u51fa\u201d\u5e76\u5207\u6362\u4e3a Responses API \u6a21\u5f0f\uff0c'
          + '\u6216\u4f7f\u7528\u66f4\u5feb\u7684 API \u670d\u52a1\u5546\u3001\u964d\u4f4e\u56fe\u7247\u5c3a\u5bf8/\u8d28\u91cf\u3001\u51cf\u5c11\u6bcf\u6b21\u751f\u6210\u6570\u91cf\u3002'
          + '\u5f53\u524d\u8bf7\u6c42\u72b6\u6001: ' + response.status + ' ' + response.statusText,
        status: 504,
        upstreamType: response.headers.get('Content-Type'),
        detail: truncateBody(bodyText)
      }, 504);
    }

    return json({
      error: 'API \u4e0a\u6e38\u8fd4\u56de\u975e\u6cd5\u54cd\u5e94',
      status: response.status,
      upstreamType: response.headers.get('Content-Type'),
      parseError: parseError,
      detail: truncateBody(bodyText),
      hint: '\u8bf7\u68c0\u67e5 API \u5730\u5740\u662f\u5426\u6b63\u786e\u3001\u670d\u52a1\u662f\u5426\u6b63\u5e38\u8fd0\u884c\uff0c\u6216\u8005\u8bd5\u8bd5\u91cd\u65b0\u53d1\u9001\u8bf7\u6c42'
    }, response.ok ? 502 : (response.status >= 400 && response.status < 600 ? response.status : 502));
  } catch (e) {
    var errorMsg = e.message || String(e);
    var isTimeout = e.name === 'AbortError';
    return json({
      error: isTimeout
        ? 'API \u8bf7\u6c42\u8d85\u65f6\uff0c\u751f\u56fe\u65f6\u95f4\u8fc7\u957f'
        : 'API \u4ee3\u7406\u8bf7\u6c42\u5931\u8d25: ' + errorMsg,
      hint: '\u8bf7\u68c0\u67e5 API \u5730\u5740\u662f\u5426\u6b63\u786e\u3001\u670d\u52a1\u662f\u5426\u6b63\u5e38\u8fd0\u884c'
    }, 502);
  }
}

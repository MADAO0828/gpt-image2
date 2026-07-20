function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(value) {
  let input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Uint8Array.from(atob(input), char => char.charCodeAt(0));
}

function getCookie(header, name) {
  const match = String(header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return null;
  }
}

function resolveJwtSecret(env) {
  if (env?.JWT_SECRET) return env.JWT_SECRET;
  if (env?.ALLOW_INSECURE_JWT_FALLBACK === 'true' && env?.LOCAL_JWT_SECRET) return env.LOCAL_JWT_SECRET;
  throw new Error('JWT_SECRET is required');
}

async function importHmacKey(value, usages) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(value),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

export async function signToken(payload, env, request) {
  if (payload?.userId && (!Number.isSafeInteger(payload.sessionVersion) || payload.sessionVersion < 1)) {
    throw new Error('sessionVersion is required');
  }
  const encoder = new TextEncoder();
  const head = b64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(resolveJwtSecret(env), ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(head + '.' + body));
  return head + '.' + body + '.' + b64url(signature);
}

export async function verifyToken(token, env, request) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid token');
  const key = await importHmacKey(resolveJwtSecret(env), ['verify']);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!valid) throw new Error('bad signature');
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
  return payload;
}

export function getRequestToken(request, env) {
  const cookieToken = getCookie(request.headers.get('Cookie') || '', 'session');
  if (cookieToken) return cookieToken;
  const allowHeader = env?.ALLOW_SESSION_HEADER_AUTH === 'true';
  if (!allowHeader) return null;
  const headerToken = String(request.headers.get('X-GPT-Image-Session') || '').trim();
  return headerToken || null;
}

export async function currentUser(request, env) {
  try {
    const token = getRequestToken(request, env);
    if (!token) return null;
    const payload = await verifyToken(token, env, request);
    if (!Number.isSafeInteger(payload.sessionVersion) || payload.sessionVersion < 1) return null;
    const user = await env.gpt_image2_db
      .prepare('SELECT id, username, role, session_version, last_login, last_ip, created_at FROM users WHERE id = ?')
      .bind(payload.userId)
      .first();
    if (!user || Number(user.session_version) !== payload.sessionVersion) return null;
    return user;
  } catch (error) {
    return null;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...extraHeaders
    }
  });
}

export async function readJsonBody(request, maxBytes = 16 * 1024) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (declared > maxBytes) throw Object.assign(new Error('Request body is too large'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw Object.assign(new Error('Request body is too large'), { status: 413 });
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

export function clientIp(request) {
  return String(request.headers.get('CF-Connecting-IP') || '').trim() || 'unknown';
}

export function decodeUsername(body) {
  if (body?.usernameB64) {
    try {
      const raw = atob(String(body.usernameB64).replace(/-/g, '+').replace(/_/g, '/'));
      return new TextDecoder().decode(Uint8Array.from(raw, char => char.charCodeAt(0))).trim();
    } catch (error) {}
  }
  return String(body?.username || '').trim();
}

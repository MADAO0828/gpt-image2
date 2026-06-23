const JWT_FALLBACK = 'gpt-image2-jwt-secret-key-2026-secure';

function secret(env) { return env && env.JWT_SECRET ? env.JWT_SECRET : JWT_FALLBACK; }
function b64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function getCookie(header, name) { const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
async function importHmacKey(value, usages) { return crypto.subtle.importKey('raw', new TextEncoder().encode(value), { name: 'HMAC', hash: 'SHA-256' }, false, usages); }
async function verifyToken(token, env) { const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('invalid token'); const key = await importHmacKey(secret(env), ['verify']); const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])); if (!ok) throw new Error('bad signature'); const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired'); return payload; }
function getRequestToken(request) {
  const cookieToken = getCookie(request.headers.get('Cookie') || '', 'session');
  if (cookieToken) return cookieToken;
  const headerToken = String(request.headers.get('X-GPT-Image-Session') || '').trim();
  return headerToken || null;
}
async function currentUser(request, env) { const token = getRequestToken(request); if (!token) return null; try { const payload = await verifyToken(token, env); return await env.gpt_image2_db.prepare('SELECT id, username, role, last_login, last_ip, created_at FROM users WHERE id = ?').bind(payload.userId).first(); } catch (e) { return null; } }
function json(data, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0', ...extraHeaders } }); }

async function loadSettings(db, userId) {
  const result = await db.prepare('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? ORDER BY key').bind(userId).all();
  const settings = {};
  const updatedAt = {};
  (result.results || []).forEach(row => {
    try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; }
    if (row.updated_at) updatedAt[row.key] = row.updated_at;
  });
  return { settings, updatedAt };
}

function isSecretField(name) {
  return /^(apiKey|api_key|api-key|authorization|bearerToken|accessToken|refreshToken)$/i.test(String(name || ''));
}

function isUnsafeSecretPlaceholder(value) {
  const s = String(value || '').trim();
  return s === 'cloudflare-proxy' || s === 'placeholder' || /^\*+MASKED\*+$/i.test(s) || /^\*+REDACTED\*+$/i.test(s);
}

function maskSecrets(value, fieldName) {
  if (isSecretField(fieldName) && value) return '***MASKED***';
  if (Array.isArray(value)) return value.map(item => maskSecrets(item, ''));
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(key => { out[key] = maskSecrets(value[key], key); });
    return out;
  }
  return value;
}

function profileKey(profile) {
  if (!profile || typeof profile !== 'object') return '';
  return String(profile.id || profile.name || '').trim();
}

function preserveProfileSecrets(incomingProfiles, existingProfiles) {
  if (!Array.isArray(incomingProfiles)) return incomingProfiles;
  const oldMap = new Map();
  (Array.isArray(existingProfiles) ? existingProfiles : []).forEach(profile => {
    const key = profileKey(profile);
    if (key) oldMap.set(key, profile);
  });
  return incomingProfiles.map(profile => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return profile;
    const next = { ...profile };
    if (isUnsafeSecretPlaceholder(next.apiKey)) {
      const old = oldMap.get(profileKey(next));
      if (old && old.apiKey && !isUnsafeSecretPlaceholder(old.apiKey)) next.apiKey = old.apiKey;
      else delete next.apiKey;
    }
    return next;
  });
}

function extractImportSettings(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) return body.settings;
  if (body.backup && body.backup.settings && typeof body.backup.settings === 'object' && !Array.isArray(body.backup.settings)) return body.backup.settings;
  return body;
}

function normalizeImportItems(body, existingSettings) {
  const source = extractImportSettings(body);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  const items = [];
  Object.keys(source).forEach(key => {
    let value = source[key];
    if (isSecretField(key) && isUnsafeSecretPlaceholder(value)) return;
    if (key === 'profiles') value = preserveProfileSecrets(value, existingSettings.profiles);
    items.push({ key, value });
  });
  return items;
}

export async function onRequestGet(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    const url = new URL(ctx.request.url);
    const scope = url.searchParams.get('scope') || 'settings';
    if (scope === 'users') {
      if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
      const { results } = await ctx.env.gpt_image2_db.prepare('SELECT id, username, role, last_login, last_ip, created_at, updated_at FROM users ORDER BY id ASC').all();
      return json({
        type: 'gpt-image2-admin-user-summary',
        version: 1,
        exportedAt: new Date().toISOString(),
        exportedBy: { id: user.id, username: user.username, role: user.role },
        users: (results || []).map(u => ({ id: u.id, username: u.username, role: u.role, last_login: u.last_login || null, last_ip: u.last_ip || null, created_at: u.created_at || null, updated_at: u.updated_at || null }))
      });
    }
    const loaded = await loadSettings(ctx.env.gpt_image2_db, user.id);
    return json({
      type: 'gpt-image2-settings-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { id: user.id, username: user.username, role: user.role },
      settings: maskSecrets(loaded.settings, ''),
      maskedSecrets: true,
      note: 'API keys and tokens are masked and will not overwrite existing secrets when imported.',
      updatedAt: loaded.updatedAt
    });
  } catch (e) {
    return json({ error: 'Backup export failed: ' + (e.message || 'unknown error') }, 500);
  }
}

export async function onRequestPost(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await ctx.request.json();
    const existing = await loadSettings(ctx.env.gpt_image2_db, user.id);
    const items = normalizeImportItems(body, existing.settings);
    if (!items.length) return json({ error: 'No importable settings provided' }, 400);
    let saved = 0;
    for (const item of items) {
      if (!item.key || item.value === undefined) continue;
      const value = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
      await ctx.env.gpt_image2_db.prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = datetime('now')").bind(user.id, item.key, value, value).run();
      saved++;
    }
    return json({ success: true, imported: saved, skippedSecrets: true, userId: user.id });
  } catch (e) {
    return json({ error: 'Backup import failed: ' + (e.message || 'unknown error') }, 400);
  }
}

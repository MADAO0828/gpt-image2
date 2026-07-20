import { currentUser, json } from '../../_lib/auth.js';
import { maskSecrets, preserveSecretPlaceholders } from '../../_lib/settings-secrets.js';

const MAX_SETTINGS_BODY_BYTES = 512 * 1024;
const MAX_SETTINGS_KEYS = 64;
const MAX_SETTING_KEY_LENGTH = 96;
const MAX_SETTING_VALUE_BYTES = 128 * 1024;
const SETTING_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,95}$/;

async function readJsonBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_SETTINGS_BODY_BYTES) throw new Error('Settings request body is too large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_SETTINGS_BODY_BYTES) throw new Error('Settings request body is too large');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('Invalid JSON body'); }
}

function validateSettingsItems(items) {
  if (items.length > MAX_SETTINGS_KEYS) throw new Error('Too many settings keys');
  let totalBytes = 0;
  for (const item of items) {
    if (!SETTING_KEY_PATTERN.test(String(item.key || '')) || String(item.key).length > MAX_SETTING_KEY_LENGTH) throw new Error('Invalid settings key');
    let serialized;
    try { serialized = JSON.stringify(item.value); } catch { throw new Error('Invalid settings value'); }
    const bytes = new TextEncoder().encode(String(serialized || '')).byteLength;
    if (bytes > MAX_SETTING_VALUE_BYTES) throw new Error('A settings value is too large');
    totalBytes += bytes;
  }
  if (totalBytes > MAX_SETTINGS_BODY_BYTES) throw new Error('Settings values are too large');
}

async function loadSettings(db, userId) {
  const result = await db
    .prepare('SELECT key, value, updated_at FROM user_settings WHERE user_id = ? ORDER BY key')
    .bind(userId)
    .all();
  const settings = {};
  for (const row of result.results || []) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch (error) {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

function normalizeIncoming(body) {
  const source = body?.settings !== undefined ? body.settings : body;
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source)) {
    return source
      .filter(item => item?.key)
      .map(item => ({ key: String(item.key), value: item.value }));
  }
  return Object.keys(source).map(key => ({ key, value: source[key] }));
}

export async function onRequestGet(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const settings = await loadSettings(ctx.env.gpt_image2_db, user.id);
  return json({
    settings: maskSecrets(settings),
    user: { id: user.id, username: user.username, role: user.role }
  });
}

export async function onRequestPost(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    const body = await readJsonBody(ctx.request);
    const existingSettings = await loadSettings(ctx.env.gpt_image2_db, user.id);
    const items = normalizeIncoming(body);
    if (!items.length) return json({ error: 'No settings provided' }, 400);
    validateSettingsItems(items);

    for (const item of items) {
      if (!item.key || item.value === undefined) continue;
      const preserved = preserveSecretPlaceholders(
        item.value,
        existingSettings[item.key],
        item.key
      );
      const value = typeof preserved === 'string' ? preserved : JSON.stringify(preserved);
      await ctx.env.gpt_image2_db
        .prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?, updated_at = datetime('now')")
        .bind(user.id, item.key, value, value)
        .run();
    }
    return json({ success: true, message: 'settings saved', userId: user.id });
  } catch (error) {
    return json({ error: 'Save failed: ' + (error.message || 'unknown error') }, 400);
  }
}

export async function onRequestDelete(ctx) {
  const user = await currentUser(ctx.request, ctx.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  await ctx.env.gpt_image2_db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(user.id).run();
  return json({ success: true });
}

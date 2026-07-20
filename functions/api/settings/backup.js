import { currentUser, json } from '../../_lib/auth.js';
import {
  isSecretKey,
  isSecretPlaceholder,
  maskSecrets,
  preserveSecretPlaceholders
} from '../../_lib/settings-secrets.js';

const MAX_BACKUP_BODY_BYTES = 512 * 1024;
const MAX_BACKUP_KEYS = 64;
const MAX_BACKUP_VALUE_BYTES = 128 * 1024;
const BACKUP_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,95}$/;

async function readJsonBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BACKUP_BODY_BYTES) throw new Error('Backup request body is too large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BODY_BYTES) throw new Error('Backup request body is too large');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('Invalid JSON body'); }
}

function validateImportItems(items) {
  if (items.length > MAX_BACKUP_KEYS) throw new Error('Too many backup settings keys');
  let totalBytes = 0;
  for (const item of items) {
    if (!BACKUP_KEY_PATTERN.test(String(item.key || ''))) throw new Error('Invalid backup settings key');
    const serialized = JSON.stringify(item.value);
    const bytes = new TextEncoder().encode(String(serialized || '')).byteLength;
    if (bytes > MAX_BACKUP_VALUE_BYTES) throw new Error('A backup setting value is too large');
    totalBytes += bytes;
  }
  if (totalBytes > MAX_BACKUP_BODY_BYTES) throw new Error('Backup settings values are too large');
}

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
    if (isSecretKey(key) && isSecretPlaceholder(source[key])) return;
    items.push({
      key,
      value: preserveSecretPlaceholders(source[key], existingSettings[key], key)
    });
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
    const body = await readJsonBody(ctx.request);
    const existing = await loadSettings(ctx.env.gpt_image2_db, user.id);
    const items = normalizeImportItems(body, existing.settings);
    if (!items.length) return json({ error: 'No importable settings provided' }, 400);
    validateImportItems(items);
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

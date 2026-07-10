import { currentUser, json } from '../../_lib/auth.js';
import { maskSecrets, preserveSecretPlaceholders } from '../../_lib/settings-secrets.js';

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
    const body = await ctx.request.json();
    const existingSettings = await loadSettings(ctx.env.gpt_image2_db, user.id);
    const items = normalizeIncoming(body);
    if (!items.length) return json({ error: 'No settings provided' }, 400);

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

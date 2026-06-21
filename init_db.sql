CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  last_login TEXT,
  last_ip TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  title TEXT,
  prompt TEXT,
  image_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 默认管理员账号：徐皓 / 778839
-- 密码算法必须与 functions 内的 passwordHash(password) 保持一致：
-- base64url(sha256(password + ':gpt-image2-auth-salt-2026'))
INSERT OR IGNORE INTO users (username, password_hash, role)
VALUES ('徐皓', 'BtGs_bI3gUtzS6kpjjJyPE4e6GVrFhqjpCT-zoH3qb0', 'admin');

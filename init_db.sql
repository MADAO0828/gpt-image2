-- AI工作台 数据库初始化脚本
-- 在部署前执行: wrangler d1 execute gpt-image2-db --file=init_db.sql

-- 用户表
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

-- 用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 提示词表（可选-从 prompts_data.json 静态加载）
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  title TEXT,
  prompt TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 默认管理员账号: admin / 123456
-- 密码哈希使用 SHA-256 + salt 算法
INSERT OR IGNORE INTO users (username, password_hash, role)
VALUES ('admin', 'WnAzt5giVqNwmUqFmKjSCv495RT3_uWoI2cv6p5e_2c', 'admin');

-- Apply to existing databases before deploying the matching Functions code.
-- This intentionally fails if applied twice; migration runners must track it.
ALTER TABLE users
ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE auth_rate_limits (
  rate_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_auth_rate_limits_updated_at
ON auth_rate_limits(updated_at);

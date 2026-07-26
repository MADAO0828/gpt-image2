#!/usr/bin/env node
// Create and migrate the local miniflare D1 database used by the local preview
// server and by `wrangler pages dev`.
//
//   node scripts/bootstrap-local-db.mjs                       # create + migrate
//   node scripts/bootstrap-local-db.mjs --status              # report only
//   node scripts/bootstrap-local-db.mjs --seed-admin          # + create an admin
//   node scripts/bootstrap-local-db.mjs --disable-bootstrap-account
//
// A fresh clone has no .wrangler/ directory at all, so scripts/local-preview-server.mjs
// throws ENOENT on startup. This script is the missing bootstrap step.
//
// Local only. It never touches the remote Cloudflare D1.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../functions/_lib/password.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const d1Dir = path.join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
// Miniflare derives this filename from the `gpt_image2_db` binding in wrangler.jsonc.
// Reusing it keeps the Node preview engine and `wrangler pages dev` on the same file.
const DEFAULT_D1_FILE = 'aa7ef2bacfc52f87d82da5b127809149cde30b8050b2d73693d7cacdd8a540ca.sqlite';

const args = new Set(process.argv.slice(2));
const statusOnly = args.has('--status');
const seedAdmin = args.has('--seed-admin');
const disableBootstrapAccount = args.has('--disable-bootstrap-account');

// The password hash published in the pre-2026-07 init_db.sql. Any account still
// carrying it can be logged into by anyone who has read the repository history.
const KNOWN_BOOTSTRAP_HASH = 'BtGs_bI3gUtzS6kpjjJyPE4e6GVrFhqjpCT-zoH3qb0';

function readSql(file) {
  // init_db.sql and the migrations are written with a UTF-8 BOM, which sqlite
  // rejects as a syntax error at the very first statement.
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
}

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function locateDatabase({ create }) {
  if (!fs.existsSync(d1Dir)) {
    if (!create) return null;
    fs.mkdirSync(d1Dir, { recursive: true });
  }
  const existing = fs
    .readdirSync(d1Dir)
    .filter((name) => /\.sqlite$/i.test(name) && !/^metadata/i.test(name))
    .sort();
  if (existing.length > 1) {
    console.warn(`! ${existing.length} D1 sqlite files present; using ${existing[0]}. Remove the extras to avoid ambiguity.`);
  }
  if (existing.length) return path.join(d1Dir, existing[0]);
  return create ? path.join(d1Dir, DEFAULT_D1_FILE) : null;
}

function applySchema(db) {
  const before = tableExists(db, 'users');
  // Every statement in init_db.sql is CREATE ... IF NOT EXISTS, so this is idempotent.
  db.exec(readSql(path.join(root, 'init_db.sql')));
  return before ? 'existing schema verified' : 'schema created';
}

// The migrations exist for databases created before 2026-07-10. init_db.sql now
// contains their result, so a freshly created database is already up to date and
// each migration must be skipped rather than replayed.
function applyMigrations(db) {
  db.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime(\'now\')), note TEXT)');
  const recorded = new Set(db.prepare('SELECT name FROM _local_migrations').all().map((row) => row.name));
  const dir = path.join(root, 'migrations');
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (recorded.has(name)) {
      results.push({ name, action: 'already recorded' });
      continue;
    }
    let action;
    if (name.includes('session_version_and_auth_rate_limits')) {
      // init_db.sql already creates auth_rate_limits and its index with
      // IF NOT EXISTS, so only the ALTER TABLE is left to reconcile — and it
      // throws if the column is already there.
      if (columnExists(db, 'users', 'session_version')) {
        action = 'already satisfied by init_db.sql';
      } else {
        db.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1');
        action = 'added users.session_version';
      }
    } else if (name.includes('remove_known_bootstrap_account')) {
      const affected = db
        .prepare('SELECT id, username FROM users WHERE password_hash = ?')
        .all(KNOWN_BOOTSTRAP_HASH);
      if (!affected.length) {
        action = 'no account carries the published bootstrap hash';
      } else if (!disableBootstrapAccount) {
        // Locking the user out of their own local admin account is not something
        // to do silently as a side effect of "bootstrap the database".
        console.warn(`! ${affected.length} account(s) still use the PUBLISHED bootstrap password hash: ${affected.map((r) => `${r.username}(id=${r.id})`).join(', ')}`);
        console.warn('  Anyone who has read this repository can log in as them. Re-run with --disable-bootstrap-account to invalidate the credential.');
        results.push({ name, action: 'SKIPPED (needs --disable-bootstrap-account)', skipped: true });
        continue;
      } else {
        db.exec(readSql(path.join(dir, name)));
        action = `invalidated ${affected.length} bootstrap credential(s)`;
      }
    } else {
      db.exec(readSql(path.join(dir, name)));
      action = 'applied';
    }
    db.prepare('INSERT OR REPLACE INTO _local_migrations (name, note) VALUES (?, ?)').run(name, action);
    results.push({ name, action });
  }
  return results;
}

async function createAdmin(db) {
  const username = String(process.env.SEED_ADMIN_USER || '').trim();
  const password = String(process.env.SEED_ADMIN_PASS || '');
  if (!username || !password) {
    throw new Error('--seed-admin requires SEED_ADMIN_USER and SEED_ADMIN_PASS in the environment (never pass a password as an argv value; it lands in shell history)');
  }
  if (password.length < 6) throw new Error('SEED_ADMIN_PASS must be at least 6 characters');
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  const hash = await hashPassword(password);
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, role = 'admin', session_version = COALESCE(session_version, 1) + 1, updated_at = datetime('now') WHERE id = ?")
      .run(hash, existing.id);
    return `reset password and role for existing user ${username} (id=${existing.id})`;
  }
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')").run(username, hash);
  return `created admin ${username}`;
}

function report(db, file) {
  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
  const settings = tableExists(db, 'user_settings')
    ? db.prepare('SELECT COUNT(*) AS c FROM user_settings').get().c
    : 0;
  const legacy = db.prepare("SELECT COUNT(*) AS c FROM users WHERE password_hash NOT LIKE 'pbkdf2-sha256$%'").get().c;
  const bootstrap = db.prepare('SELECT COUNT(*) AS c FROM users WHERE password_hash = ?').get(KNOWN_BOOTSTRAP_HASH).c;
  console.log(`  database        ${path.relative(root, file)}`);
  console.log(`  size            ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  console.log(`  users           ${users} (${admins} admin)`);
  console.log(`  user_settings   ${settings} rows`);
  console.log(`  session_version ${columnExists(db, 'users', 'session_version') ? 'present' : 'MISSING'}`);
  console.log(`  rate limits     ${tableExists(db, 'auth_rate_limits') ? 'present' : 'MISSING'}`);
  console.log(`  legacy hashes   ${legacy} account(s) not yet on PBKDF2 (migrated automatically on next successful login)`);
  if (bootstrap) console.log(`  BOOTSTRAP RISK  ${bootstrap} account(s) use the published bootstrap password hash`);
}

async function main() {
  const file = locateDatabase({ create: !statusOnly });
  if (!file) {
    console.error('No local D1 database found. Run without --status to create one.');
    process.exitCode = 1;
    return;
  }
  const isNew = !fs.existsSync(file);
  const db = new DatabaseSync(file);
  try {
    if (statusOnly) {
      console.log('Local D1 status');
      report(db, file);
      return;
    }
    console.log(`${isNew ? 'Creating' : 'Updating'} local D1 at ${path.relative(root, file)}`);
    console.log(`  schema: ${applySchema(db)}`);
    for (const result of applyMigrations(db)) {
      console.log(`  migration ${result.name}: ${result.action}`);
    }
    if (seedAdmin) console.log(`  seed: ${await createAdmin(db)}`);
    console.log('');
    report(db, file);
    console.log('');
    console.log('Local D1 ready. Start the preview with:');
    console.log('  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local-preview.ps1 -NoBrowser');
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`bootstrap-local-db failed: ${error.message}`);
  process.exitCode = 1;
});

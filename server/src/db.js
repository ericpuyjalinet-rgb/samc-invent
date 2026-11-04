import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'samc-invent.db');
export const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','gestionnaire','agent')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  code TEXT UNIQUE,
  building TEXT,
  floor TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  family TEXT NOT NULL DEFAULT 'autre' CHECK (family IN ('informatique','mobilier','autre')),
  depreciation_years INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'en_service'
    CHECK (status IN ('en_service','en_stock','en_reparation','reforme','perdu')),
  condition TEXT NOT NULL DEFAULT 'bon'
    CHECK (condition IN ('neuf','bon','moyen','mauvais','hs')),
  purchase_date TEXT,
  purchase_price REAL,
  supplier TEXT,
  warranty_end TEXT,
  notes TEXT,
  photo TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location_id);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets(serial_number);

CREATE TABLE IF NOT EXISTS asset_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_asset ON asset_history(asset_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','en_cours','cloturee')),
  start_date TEXT,
  end_date TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Périmètre de la campagne (si vide : toutes les localisations)
CREATE TABLE IF NOT EXISTS campaign_locations (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, location_id)
);

-- Instantané des équipements attendus au lancement de la campagne
CREATE TABLE IF NOT EXISTS campaign_expected (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  location_id INTEGER,
  PRIMARY KEY (campaign_id, asset_id)
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_uuid TEXT NOT NULL UNIQUE,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  scanned_code TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  result TEXT NOT NULL CHECK (result IN ('trouve','deplace','inconnu')),
  condition TEXT,
  comment TEXT,
  photo TEXT,
  unknown_label TEXT,
  unknown_category_id INTEGER,
  resolved_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  scanned_at TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scans_campaign ON scans(campaign_id);
CREATE INDEX IF NOT EXISTS idx_scans_asset ON scans(asset_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

/** Exécute fn dans une transaction. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getSetting(key, def = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : def;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

/** Génère le prochain code inventaire (ex. SAMC-000042). */
export function nextAssetCode() {
  const prefix = getSetting('code_prefix', 'SAMC');
  const exists = db.prepare('SELECT 1 FROM assets WHERE code = ?');
  let n = parseInt(getSetting('code_counter', '0'), 10) || 0;
  let code;
  do {
    n += 1;
    code = `${prefix}-${String(n).padStart(6, '0')}`;
  } while (exists.get(code));
  setSetting('code_counter', n);
  return code;
}

export function logHistory(assetId, userId, action, details = null) {
  db.prepare('INSERT INTO asset_history(asset_id, user_id, action, details) VALUES (?, ?, ?, ?)')
    .run(assetId, userId ?? null, action, details ? JSON.stringify(details) : null);
}

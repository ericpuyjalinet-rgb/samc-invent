/**
 * Accès aux données PostgreSQL.
 *  - DATABASE_URL défini  → PostgreSQL (Supabase en production, Supabase local ou autre serveur Postgres)
 *  - sinon                → PGlite : PostgreSQL embarqué, stocké dans server/data/pglite (aucune installation)
 *
 * API commune : db.get / db.all / db.run (paramètres « ? » convertis en $1, $2…) et tx(async (t) => …).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const IS_VERCEL = !!process.env.VERCEL;
export const DATA_DIR = process.env.DATA_DIR || (IS_VERCEL ? '/tmp/samc-invent' : path.resolve(__dirname, '../data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const DB_KIND = DATABASE_URL ? 'postgres' : 'pglite';

const MIGRATIONS_DIR = [path.resolve(__dirname, '../../supabase/migrations'), path.resolve(process.cwd(), 'supabase/migrations')]
  .find((d) => fs.existsSync(d));

if (IS_VERCEL && !DATABASE_URL) {
  console.error('[SAMC Invent] DATABASE_URL non défini : configurez la chaîne de connexion Supabase dans Vercel.');
}

/** Convertit les paramètres « ? » en $1, $2… */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
const clean = (args) => args.map((v) => (v === undefined ? null : v));
/** Les INSERT renvoient la ligne créée (pour récupérer l'identifiant). */
const withReturning = (sql) => (/^\s*insert\b/i.test(sql) && !/\breturning\b/i.test(sql) ? `${sql} RETURNING *` : sql);

// ---------------------------------------------------------------------------
let backend; // { query(sql, args) → { rows, count }, exec(sqlMulti), begin(fn) }

async function createBackend() {
  if (IS_VERCEL && !DATABASE_URL) {
    throw new Error('DATABASE_URL non configurée sur Vercel (chaîne de connexion Supabase « Transaction pooler »)');
  }
  if (DATABASE_URL) {
    const { default: postgres } = await import('postgres');
    const sql = postgres(DATABASE_URL, {
      prepare: false, // compatible avec le pooler Supabase (mode transaction, port 6543)
      max: IS_VERCEL ? 3 : 10,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
      ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(DATABASE_URL) ? false : 'require',
      types: {
        date: { to: 1082, from: [1082], serialize: (x) => x, parse: (x) => x },
        int8: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) },
        numeric: { to: 1700, from: [1700], serialize: (x) => String(x), parse: (x) => Number(x) },
      },
    });
    const wrap = (s) => ({
      async query(q, args) { const rows = await s.unsafe(q, args); return { rows: [...rows], count: rows.count ?? 0 }; },
    });
    return { ...wrap(sql), exec: (q) => sql.unsafe(q), begin: (fn) => sql.begin((t) => fn(wrap(t))), end: () => sql.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.join(DATA_DIR, 'pglite');
  if (dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir, { parsers: { 20: Number, 1700: Number, 1082: (v) => v } });
  const wrap = (s) => ({
    async query(q, args) { const r = await s.query(q, args); return { rows: r.rows, count: r.affectedRows ?? 0 }; },
  });
  return { ...wrap(pg), exec: (q) => pg.exec(q), begin: (fn) => pg.transaction((t) => fn(wrap(t))), end: () => pg.close() };
}

function executor(get) {
  return {
    async get(sql, ...args) { return (await (await get()).query(toPg(sql), clean(args))).rows[0]; },
    async all(sql, ...args) { return (await (await get()).query(toPg(sql), clean(args))).rows; },
    async run(sql, ...args) {
      const r = await (await get()).query(toPg(withReturning(sql)), clean(args));
      return { changes: r.count, lastInsertRowid: r.rows[0]?.id ?? null, row: r.rows[0] };
    },
  };
}

/** Initialisation : connexion + application des migrations (idempotentes). */
export const ready = (async () => {
  backend = await createBackend();
  if (MIGRATIONS_DIR && process.env.SKIP_MIGRATIONS !== '1') {
    await backend.exec('CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE app_migrations ENABLE ROW LEVEL SECURITY;');
    const done = new Set((await backend.query('SELECT name FROM app_migrations', [])).rows.map((r) => r.name));
    for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await backend.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      await backend.query('INSERT INTO app_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      console.log(`[SAMC Invent] Migration appliquée : ${f}`);
    }
  }
  return backend;
})();
ready.catch((e) => console.error('[SAMC Invent] Base de données indisponible :', e.message));

export const db = executor(() => ready);

/** Exécute fn(t) dans une transaction ; t expose get / all / run. */
export async function tx(fn) {
  const b = await ready;
  return b.begin((t) => fn(executor(async () => t)));
}

export async function closeDb() { (await ready).end?.(); }

// ---------------------------------------------------------------------------
export async function getSetting(key, def = null, x = db) {
  const row = await x.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : def;
}
export async function setSetting(key, value, x = db) {
  await x.run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}

/** Génère le prochain code inventaire (ex. SAMC-000042). */
export async function nextAssetCode(x = db) {
  const prefix = await getSetting('code_prefix', 'SAMC', x);
  let n = parseInt(await getSetting('code_counter', '0', x), 10) || 0;
  let code;
  do {
    n += 1;
    code = `${prefix}-${String(n).padStart(6, '0')}`;
  } while (await x.get('SELECT 1 AS ok FROM assets WHERE code = ?', code));
  await setSetting('code_counter', n, x);
  return code;
}

export async function logHistory(assetId, userId, action, details = null, x = db) {
  await x.run('INSERT INTO asset_history(asset_id, user_id, action, details) VALUES (?, ?, ?, ?)',
    assetId, userId ?? null, action, details ? JSON.stringify(details) : null);
}

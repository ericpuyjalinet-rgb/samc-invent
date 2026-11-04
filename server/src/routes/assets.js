import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, tx, nextAssetCode, logHistory, UPLOAD_DIR } from '../db.js';
import { requireRole, MANAGERS } from '../auth.js';
import { h, HttpError, pick, toCsv, parseCsv } from '../util.js';

const r = Router();
const manage = requireRole(...MANAGERS);

export const STATUSES = ['en_service', 'en_stock', 'en_reparation', 'reforme', 'perdu'];
export const CONDITIONS = ['neuf', 'bon', 'moyen', 'mauvais', 'hs'];
const FIELDS = ['code', 'label', 'category_id', 'brand', 'model', 'serial_number', 'location_id', 'assigned_to',
  'status', 'condition', 'purchase_date', 'purchase_price', 'supplier', 'warranty_end', 'notes'];

export const ASSET_SELECT = `
  SELECT a.*, c.name AS category_name, c.family AS family,
    l.name AS location_name, l.building, l.floor, l.code AS location_code, s.id AS site_id, s.name AS site_name
  FROM assets a
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN locations l ON l.id = a.location_id
  LEFT JOIN sites s ON s.id = l.site_id`;

const SORTS = {
  code: 'a.code', label: 'a.label', category: 'c.name', location: 's.name, l.name', status: 'a.status',
  condition: 'a.condition', purchase_date: 'a.purchase_date', updated_at: 'a.updated_at', last_seen_at: 'a.last_seen_at',
};

function buildFilters(q) {
  const where = [];
  const params = [];
  if (q.q) {
    where.push(`(a.code LIKE ? OR a.label LIKE ? OR a.brand LIKE ? OR a.model LIKE ? OR a.serial_number LIKE ? OR a.assigned_to LIKE ?)`);
    const like = `%${q.q}%`;
    params.push(like, like, like, like, like, like);
  }
  for (const [key, col] of [['category_id', 'a.category_id'], ['location_id', 'a.location_id'], ['site_id', 's.id'],
    ['status', 'a.status'], ['condition', 'a.condition'], ['family', 'c.family']]) {
    if (q[key]) { where.push(`${col} = ?`); params.push(q[key]); }
  }
  if (q.no_location === '1') where.push('a.location_id IS NULL');
  if (q.ids) {
    const ids = String(q.ids).split(',').map(Number).filter(Boolean);
    if (ids.length) { where.push(`a.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function validate(d) {
  if (d.status && !STATUSES.includes(d.status)) throw new HttpError(400, 'Statut invalide');
  if (d.condition && !CONDITIONS.includes(d.condition)) throw new HttpError(400, 'État invalide');
  if (d.purchase_price !== undefined && d.purchase_price !== null) {
    const n = Number(String(d.purchase_price).replace(',', '.'));
    if (Number.isNaN(n)) throw new HttpError(400, "Prix d'achat invalide");
    d.purchase_price = n;
  }
  return d;
}

const getAsset = (id) => db.prepare(`${ASSET_SELECT} WHERE a.id = ?`).get(id);

// ---------- Liste ----------
r.get('/', (req, res) => {
  const { sql, params } = buildFilters(req.query);
  const sort = SORTS[req.query.sort] || 'a.updated_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Number(req.query.limit) || 50, 1000);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const total = db.prepare(`SELECT COUNT(*) n FROM assets a LEFT JOIN categories c ON c.id = a.category_id
    LEFT JOIN locations l ON l.id = a.location_id LEFT JOIN sites s ON s.id = l.site_id ${sql}`).get(...params).n;
  const items = db.prepare(`${ASSET_SELECT} ${sql} ORDER BY ${sort} ${dir}, a.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);
  res.json({ items, total, page, limit });
});

// ---------- Export CSV ----------
const CSV_COLUMNS = [
  { key: 'code', label: 'code' }, { key: 'label', label: 'designation' }, { key: 'category_name', label: 'categorie' },
  { key: 'family', label: 'famille' }, { key: 'brand', label: 'marque' }, { key: 'model', label: 'modele' },
  { key: 'serial_number', label: 'numero_serie' }, { key: 'site_name', label: 'site' }, { key: 'building', label: 'batiment' },
  { key: 'floor', label: 'etage' }, { key: 'location_name', label: 'salle' }, { key: 'location_code', label: 'code_salle' },
  { key: 'assigned_to', label: 'affecte_a' }, { key: 'status', label: 'statut' }, { key: 'condition', label: 'etat' },
  { key: 'purchase_date', label: 'date_achat' },
  { label: 'prix_achat', get: (r) => (r.purchase_price ?? '') === '' ? '' : String(r.purchase_price).replace('.', ',') },
  { key: 'supplier', label: 'fournisseur' }, { key: 'warranty_end', label: 'fin_garantie' }, { key: 'notes', label: 'notes' },
  { key: 'last_seen_at', label: 'dernier_inventaire' },
];

r.get('/export.csv', (req, res) => {
  const { sql, params } = buildFilters(req.query);
  const rows = db.prepare(`${ASSET_SELECT} ${sql} ORDER BY a.code`).all(...params);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="samc-invent-equipements-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(rows, CSV_COLUMNS));
});

r.get('/import-template.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-import-samc-invent.csv"');
  res.send(toCsv([{
    code: '', label: 'PC portable Dell Latitude 5440', category_name: 'Ordinateur portable', brand: 'Dell', model: 'Latitude 5440',
    serial_number: 'ABC123XYZ', site_name: 'Siège', building: 'A', floor: '1', location_name: 'Bureau 101', assigned_to: 'Jean Dupont',
    status: 'en_service', condition: 'bon', purchase_date: '2024-03-15', purchase_price: 1150, supplier: 'Fournisseur X',
    warranty_end: '2027-03-15', notes: '',
  }], CSV_COLUMNS.filter((c) => !['family', 'location_code', 'last_seen_at'].includes(c.label))));
});

// ---------- Import CSV ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

r.post('/import', manage, upload.single('file'), h((req, res) => {
  if (!req.file) throw new HttpError(400, 'Fichier CSV manquant');
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  const dryRun = req.query.dry_run === '1';
  const report = { created: 0, updated: 0, errors: [], created_refs: { sites: 0, locations: 0, categories: 0 } };
  const norm = (v) => (v === undefined || v === '' ? null : v);

  const run = () => {
    rows.forEach((row, idx) => {
      const line = idx + 2;
      try {
        const label = norm(row.designation || row.label);
        if (!label) throw new Error('désignation manquante');
        // Catégorie
        let category_id = null;
        const catName = norm(row.categorie);
        if (catName) {
          let cat = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(catName);
          if (!cat) {
            const fam = ['informatique', 'mobilier'].includes((row.famille || '').toLowerCase()) ? row.famille.toLowerCase() : 'autre';
            cat = { id: db.prepare('INSERT INTO categories(name, family) VALUES (?, ?)').run(catName, fam).lastInsertRowid };
            report.created_refs.categories++;
          }
          category_id = cat.id;
        }
        // Localisation
        let location_id = null;
        if (norm(row.code_salle)) {
          const loc = db.prepare('SELECT id FROM locations WHERE code = ?').get(row.code_salle);
          if (loc) location_id = loc.id;
        }
        if (!location_id && norm(row.site) && norm(row.salle)) {
          let site = db.prepare('SELECT id FROM sites WHERE name = ? COLLATE NOCASE').get(row.site);
          if (!site) {
            site = { id: db.prepare('INSERT INTO sites(name) VALUES (?)').run(row.site).lastInsertRowid };
            report.created_refs.sites++;
          }
          let loc = db.prepare(`SELECT id FROM locations WHERE site_id = ? AND name = ? COLLATE NOCASE
            AND IFNULL(building,'') = ? AND IFNULL(floor,'') = ?`).get(site.id, row.salle, row.batiment || '', row.etage || '');
          if (!loc) {
            loc = { id: db.prepare('INSERT INTO locations(site_id, building, floor, name) VALUES (?, ?, ?, ?)')
              .run(site.id, norm(row.batiment), norm(row.etage), row.salle).lastInsertRowid };
            report.created_refs.locations++;
          }
          location_id = loc.id;
        }
        const status = norm(row.statut) || 'en_service';
        const condition = norm(row.etat) || 'bon';
        if (!STATUSES.includes(status)) throw new Error(`statut "${status}" invalide`);
        if (!CONDITIONS.includes(condition)) throw new Error(`état "${condition}" invalide`);
        const price = norm(row.prix_achat) === null ? null : Number(String(row.prix_achat).replace(/\s/g, '').replace(',', '.'));
        if (price !== null && Number.isNaN(price)) throw new Error('prix invalide');
        const data = {
          label, category_id, brand: norm(row.marque), model: norm(row.modele), serial_number: norm(row.numero_serie),
          location_id, assigned_to: norm(row.affecte_a), status, condition, purchase_date: norm(row.date_achat),
          purchase_price: price, supplier: norm(row.fournisseur), warranty_end: norm(row.fin_garantie), notes: norm(row.notes),
        };
        const existing = norm(row.code) ? db.prepare('SELECT id FROM assets WHERE code = ?').get(row.code) : null;
        if (existing) {
          const keys = Object.keys(data);
          db.prepare(`UPDATE assets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
            .run(...keys.map((k) => data[k]), existing.id);
          logHistory(existing.id, req.user.id, 'import_maj');
          report.updated++;
        } else {
          const code = norm(row.code) || nextAssetCode();
          const keys = ['code', ...Object.keys(data)];
          const vals = [code, ...Object.values(data)];
          const id = db.prepare(`INSERT INTO assets(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals).lastInsertRowid;
          logHistory(id, req.user.id, 'import_creation');
          report.created++;
        }
      } catch (e) {
        report.errors.push({ line, message: e.message });
      }
    });
    if (dryRun) throw Object.assign(new Error('dry-run'), { dryRun: true });
  };

  try { tx(run); } catch (e) { if (!e.dryRun) throw e; }
  res.json({ ...report, total: rows.length, dry_run: dryRun });
}));

// ---------- Recherche par code (QR / code-barres / n° série) ----------
r.get('/by-code/:code', h((req, res) => {
  const code = req.params.code.trim();
  const a = db.prepare(`${ASSET_SELECT} WHERE a.code = ? COLLATE NOCASE OR a.serial_number = ? COLLATE NOCASE LIMIT 1`).get(code, code);
  if (!a) throw new HttpError(404, 'Aucun équipement ne correspond à ce code');
  res.json(a);
}));

// ---------- Actions groupées ----------
r.post('/bulk', manage, h((req, res) => {
  const { ids = [], action, value } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Aucun équipement sélectionné');
  const map = { move: 'location_id', status: 'status', condition: 'condition', category: 'category_id', delete: null };
  if (!(action in map)) throw new HttpError(400, 'Action inconnue');
  if (action === 'status' && !STATUSES.includes(value)) throw new HttpError(400, 'Statut invalide');
  if (action === 'condition' && !CONDITIONS.includes(value)) throw new HttpError(400, 'État invalide');
  if (action === 'delete' && req.user.role !== 'admin') throw new HttpError(403, 'Suppression réservée aux administrateurs');
  tx(() => {
    for (const id of ids) {
      if (action === 'delete') { db.prepare('DELETE FROM assets WHERE id = ?').run(id); continue; }
      const col = map[action];
      const before = db.prepare(`SELECT ${col} v FROM assets WHERE id = ?`).get(id);
      if (!before) continue;
      db.prepare(`UPDATE assets SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`).run(value ?? null, id);
      logHistory(id, req.user.id, action === 'move' ? 'deplacement' : 'modification', { [col]: [before.v, value ?? null] });
    }
  });
  res.json({ ok: true, count: ids.length });
}));

// ---------- Détail ----------
r.get('/:id', h((req, res) => {
  const a = getAsset(req.params.id);
  if (!a) throw new HttpError(404, 'Équipement introuvable');
  const history = db.prepare(`SELECT h.*, u.name AS user_name FROM asset_history h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.asset_id = ? ORDER BY h.id DESC LIMIT 200`).all(a.id).map((x) => ({ ...x, details: x.details ? JSON.parse(x.details) : null }));
  const scans = db.prepare(`SELECT sc.*, c.name AS campaign_name, u.name AS user_name, l.name AS location_name
    FROM scans sc JOIN campaigns c ON c.id = sc.campaign_id LEFT JOIN users u ON u.id = sc.user_id
    LEFT JOIN locations l ON l.id = sc.location_id WHERE sc.asset_id = ? ORDER BY sc.scanned_at DESC LIMIT 50`).all(a.id);
  res.json({ ...a, history, scans });
}));

// ---------- Création ----------
r.post('/', manage, h((req, res) => {
  const d = validate(pick(req.body, FIELDS));
  if (!d.label) throw new HttpError(400, 'La désignation est requise');
  d.code = d.code ? String(d.code).trim() : nextAssetCode();
  if (db.prepare('SELECT 1 FROM assets WHERE code = ?').get(d.code)) throw new HttpError(409, `Le code ${d.code} existe déjà`);
  const keys = Object.keys(d).filter((k) => d[k] !== null);
  const id = db.prepare(`INSERT INTO assets(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map((k) => d[k])).lastInsertRowid;
  logHistory(id, req.user.id, 'creation');
  res.status(201).json(getAsset(id));
}));

// ---------- Modification ----------
r.put('/:id', manage, h((req, res) => {
  const before = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!before) throw new HttpError(404, 'Équipement introuvable');
  const d = validate(pick(req.body, FIELDS));
  if ('label' in d && !d.label) throw new HttpError(400, 'La désignation est requise');
  if ('code' in d) {
    if (!d.code) delete d.code;
    else if (db.prepare('SELECT 1 FROM assets WHERE code = ? AND id <> ?').get(d.code, before.id)) {
      throw new HttpError(409, `Le code ${d.code} existe déjà`);
    }
  }
  if ('status' in d && !d.status) delete d.status;
  if ('condition' in d && !d.condition) delete d.condition;
  const changes = {};
  for (const k of Object.keys(d)) {
    // eslint-disable-next-line eqeqeq
    if (String(before[k] ?? '') !== String(d[k] ?? '')) changes[k] = [before[k], d[k]];
  }
  const keys = Object.keys(changes);
  if (keys.length) {
    db.prepare(`UPDATE assets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => d[k]), before.id);
    logHistory(before.id, req.user.id, keys.length === 1 && keys[0] === 'location_id' ? 'deplacement' : 'modification', changes);
  }
  res.json(getAsset(before.id));
}));

r.delete('/:id', requireRole('admin'), h((req, res) => {
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- Photo ----------
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
});

r.post('/:id/photo', manage, photoUpload.single('photo'), h((req, res) => {
  if (!req.file) throw new HttpError(400, 'Image invalide (PNG, JPEG ou WEBP)');
  db.prepare(`UPDATE assets SET photo = ?, updated_at = datetime('now') WHERE id = ?`).run(req.file.filename, req.params.id);
  logHistory(Number(req.params.id), req.user.id, 'photo');
  res.json(getAsset(req.params.id));
}));

export default r;

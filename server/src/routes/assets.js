import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { db, tx, nextAssetCode, logHistory } from '../db.js';
import { savePhoto } from '../storage.js';
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
    where.push(`(a.code ILIKE ? OR a.label ILIKE ? OR a.brand ILIKE ? OR a.model ILIKE ? OR a.serial_number ILIKE ? OR a.assigned_to ILIKE ?)`);
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

const getAsset = (id) => db.get(`${ASSET_SELECT} WHERE a.id = ?`, id);

// ---------- Liste ----------
r.get('/', h(async (req, res) => {
  const { sql, params } = buildFilters(req.query);
  const sort = SORTS[req.query.sort] || 'a.updated_at';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(Number(req.query.limit) || 50, 1000);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const { n: total } = await db.get(`SELECT COUNT(*) AS n FROM assets a LEFT JOIN categories c ON c.id = a.category_id
    LEFT JOIN locations l ON l.id = a.location_id LEFT JOIN sites s ON s.id = l.site_id ${sql}`, ...params);
  const items = await db.all(`${ASSET_SELECT} ${sql} ORDER BY ${sort} ${dir}, a.id DESC LIMIT ? OFFSET ?`,
    ...params, limit, (page - 1) * limit);
  res.json({ items, total, page, limit });
}));

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

r.get('/export.csv', h(async (req, res) => {
  const { sql, params } = buildFilters(req.query);
  const rows = await db.all(`${ASSET_SELECT} ${sql} ORDER BY a.code`, ...params);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="samc-invent-equipements-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(rows, CSV_COLUMNS));
}));

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

r.post('/import', manage, upload.single('file'), h(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Fichier CSV manquant');
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  const dryRun = req.query.dry_run === '1';
  const report = { created: 0, updated: 0, errors: [], created_refs: { sites: 0, locations: 0, categories: 0 } };
  const norm = (v) => (v === undefined || v === '' ? null : v);

  const run = async (t) => {
    for (const [idx, row] of rows.entries()) {
      const line = idx + 2;
      try {
        const label = norm(row.designation || row.label);
        if (!label) throw new Error('désignation manquante');
        // Catégorie
        let category_id = null;
        const catName = norm(row.categorie);
        if (catName) {
          let cat = await t.get('SELECT id FROM categories WHERE lower(name) = lower(?)', catName);
          if (!cat) {
            const fam = ['informatique', 'mobilier'].includes((row.famille || '').toLowerCase()) ? row.famille.toLowerCase() : 'autre';
            cat = { id: (await t.run('INSERT INTO categories(name, family) VALUES (?, ?)', catName, fam)).lastInsertRowid };
            report.created_refs.categories++;
          }
          category_id = cat.id;
        }
        // Localisation
        let location_id = null;
        if (norm(row.code_salle)) {
          const loc = await t.get('SELECT id FROM locations WHERE code = ?', row.code_salle);
          if (loc) location_id = loc.id;
        }
        if (!location_id && norm(row.site) && norm(row.salle)) {
          let site = await t.get('SELECT id FROM sites WHERE lower(name) = lower(?)', row.site);
          if (!site) {
            site = { id: (await t.run('INSERT INTO sites(name) VALUES (?)', row.site)).lastInsertRowid };
            report.created_refs.sites++;
          }
          let loc = await t.get(`SELECT id FROM locations WHERE site_id = ? AND lower(name) = lower(?)
            AND COALESCE(building,'') = ? AND COALESCE(floor,'') = ?`, site.id, row.salle, row.batiment || '', row.etage || '');
          if (!loc) {
            loc = { id: (await t.run('INSERT INTO locations(site_id, building, floor, name) VALUES (?, ?, ?, ?)',
              site.id, norm(row.batiment), norm(row.etage), row.salle)).lastInsertRowid };
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
        const existing = norm(row.code) ? await t.get('SELECT id FROM assets WHERE code = ?', row.code) : null;
        if (existing) {
          const keys = Object.keys(data);
          await t.run(`UPDATE assets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = now() WHERE id = ?`,
            ...keys.map((k) => data[k]), existing.id);
          await logHistory(existing.id, req.user.id, 'import_maj', null, t);
          report.updated++;
        } else {
          const code = norm(row.code) || await nextAssetCode(t);
          const keys = ['code', ...Object.keys(data)];
          const vals = [code, ...Object.values(data)];
          const id = (await t.run(`INSERT INTO assets(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...vals)).lastInsertRowid;
          await logHistory(id, req.user.id, 'import_creation', null, t);
          report.created++;
        }
      } catch (e) {
        report.errors.push({ line, message: e.message });
      }
    }
    if (dryRun) throw Object.assign(new Error('dry-run'), { dryRun: true });
  };

  try { await tx(run); } catch (e) { if (!e.dryRun) throw e; }
  res.json({ ...report, total: rows.length, dry_run: dryRun });
}));

// ---------- Recherche par code (QR / code-barres / n° série) ----------
r.get('/by-code/:code', h(async (req, res) => {
  const code = req.params.code.trim();
  const a = await db.get(`${ASSET_SELECT} WHERE lower(a.code) = lower(?) OR lower(a.serial_number) = lower(?) LIMIT 1`, code, code);
  if (!a) throw new HttpError(404, 'Aucun équipement ne correspond à ce code');
  res.json(a);
}));

// ---------- Actions groupées ----------
r.post('/bulk', manage, h(async (req, res) => {
  const { ids = [], action, value } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Aucun équipement sélectionné');
  const map = { move: 'location_id', status: 'status', condition: 'condition', category: 'category_id', delete: null };
  if (!(action in map)) throw new HttpError(400, 'Action inconnue');
  if (action === 'status' && !STATUSES.includes(value)) throw new HttpError(400, 'Statut invalide');
  if (action === 'condition' && !CONDITIONS.includes(value)) throw new HttpError(400, 'État invalide');
  if (action === 'delete' && req.user.role !== 'admin') throw new HttpError(403, 'Suppression réservée aux administrateurs');
  await tx(async (t) => {
    for (const id of ids) {
      if (action === 'delete') { await deleteAsset(t, id); continue; }
      const col = map[action];
      const before = await t.get(`SELECT ${col} AS v FROM assets WHERE id = ?`, id);
      if (!before) continue;
      await t.run(`UPDATE assets SET ${col} = ?, updated_at = now() WHERE id = ?`, value ?? null, id);
      await logHistory(id, req.user.id, action === 'move' ? 'deplacement' : 'modification', { [col]: [before.v, value ?? null] }, t);
    }
  });
  res.json({ ok: true, count: ids.length });
}));

// ---------- Détail ----------
r.get('/:id', h(async (req, res) => {
  const a = await getAsset(req.params.id);
  if (!a) throw new HttpError(404, 'Équipement introuvable');
  const history = (await db.all(`SELECT h.*, u.name AS user_name FROM asset_history h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.asset_id = ? ORDER BY h.id DESC LIMIT 200`, a.id)).map((x) => ({ ...x, details: x.details ? JSON.parse(x.details) : null }));
  const scans = await db.all(`SELECT sc.*, c.name AS campaign_name, u.name AS user_name, l.name AS location_name
    FROM scans sc JOIN campaigns c ON c.id = sc.campaign_id LEFT JOIN users u ON u.id = sc.user_id
    LEFT JOIN locations l ON l.id = sc.location_id WHERE sc.asset_id = ? ORDER BY sc.scanned_at DESC LIMIT 50`, a.id);
  res.json({ ...a, history, scans });
}));

// ---------- Création ----------
r.post('/', manage, h(async (req, res) => {
  const d = validate(pick(req.body, FIELDS));
  if (!d.label) throw new HttpError(400, 'La désignation est requise');
  const id = await tx(async (t) => {
    d.code = d.code ? String(d.code).trim() : await nextAssetCode(t);
    if (await t.get('SELECT 1 AS ok FROM assets WHERE code = ?', d.code)) throw new HttpError(409, `Le code ${d.code} existe déjà`);
    const keys = Object.keys(d).filter((k) => d[k] !== null);
    const newId = (await t.run(`INSERT INTO assets(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      ...keys.map((k) => d[k]))).lastInsertRowid;
    await logHistory(newId, req.user.id, 'creation', null, t);
    return newId;
  });
  res.status(201).json(await getAsset(id));
}));

// ---------- Modification ----------
r.put('/:id', manage, h(async (req, res) => {
  const before = await db.get('SELECT * FROM assets WHERE id = ?', req.params.id);
  if (!before) throw new HttpError(404, 'Équipement introuvable');
  const d = validate(pick(req.body, FIELDS));
  if ('label' in d && !d.label) throw new HttpError(400, 'La désignation est requise');
  if ('code' in d) {
    if (!d.code) delete d.code;
    else if (await db.get('SELECT 1 AS ok FROM assets WHERE code = ? AND id <> ?', d.code, before.id)) {
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
    await db.run(`UPDATE assets SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = now() WHERE id = ?`,
      ...keys.map((k) => d[k]), before.id);
    await logHistory(before.id, req.user.id, keys.length === 1 && keys[0] === 'location_id' ? 'deplacement' : 'modification', changes);
  }
  res.json(await getAsset(before.id));
}));

r.delete('/:id', requireRole('admin'), h(async (req, res) => {
  await tx((t) => deleteAsset(t, req.params.id));
  res.json({ ok: true });
}));

// ---------- Photo ----------
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
});

r.post('/:id/photo', manage, photoUpload.single('photo'), h(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Image invalide (PNG, JPEG ou WEBP)');
  const ext = (path.extname(req.file.originalname).slice(1) || req.file.mimetype.split('/')[1] || 'jpg');
  const photo = await savePhoto(req.file.buffer, ext);
  await db.run(`UPDATE assets SET photo = ?, updated_at = now() WHERE id = ?`, photo, req.params.id);
  await logHistory(Number(req.params.id), req.user.id, 'photo');
  res.json(await getAsset(req.params.id));
}));

/** Suppression d'un équipement et de ses données liées. */
async function deleteAsset(t, id) {
  await t.run('DELETE FROM asset_history WHERE asset_id = ?', id);
  await t.run('DELETE FROM campaign_expected WHERE asset_id = ?', id);
  await t.run('UPDATE scans SET asset_id = NULL, resolved_asset_id = NULL WHERE asset_id = ? OR resolved_asset_id = ?', id, id);
  await t.run('DELETE FROM assets WHERE id = ?', id);
}

export default r;

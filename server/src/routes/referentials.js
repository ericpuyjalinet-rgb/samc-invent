import { Router } from 'express';
import { db } from '../db.js';
import { requireRole, MANAGERS } from '../auth.js';
import { h, HttpError, pickAll as pick } from '../util.js';

const r = Router();
const manage = requireRole(...MANAGERS);
const FAMILIES = ['informatique', 'mobilier', 'autre'];

const uniqueGuard = (fn) => {
  try { return fn(); } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Cet élément existe déjà (nom ou code en doublon)');
    throw e;
  }
};

// ---------- Sites ----------
r.get('/sites', (req, res) => {
  res.json(db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM locations l WHERE l.site_id = s.id) AS location_count,
      (SELECT COUNT(*) FROM assets a JOIN locations l ON l.id = a.location_id WHERE l.site_id = s.id) AS asset_count
    FROM sites s ORDER BY s.name`).all());
});
r.post('/sites', manage, h((req, res) => {
  const d = pick(req.body, ['name', 'address']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  const info = uniqueGuard(() => db.prepare('INSERT INTO sites(name, address) VALUES (?, ?)').run(d.name, d.address));
  res.status(201).json(db.prepare('SELECT * FROM sites WHERE id = ?').get(info.lastInsertRowid));
}));
r.put('/sites/:id', manage, h((req, res) => {
  const d = pick(req.body, ['name', 'address']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  uniqueGuard(() => db.prepare('UPDATE sites SET name = ?, address = ? WHERE id = ?').run(d.name, d.address, req.params.id));
  res.json(db.prepare('SELECT * FROM sites WHERE id = ?').get(req.params.id));
}));
r.delete('/sites/:id', manage, h((req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM assets a JOIN locations l ON l.id = a.location_id WHERE l.site_id = ?').get(req.params.id).n;
  if (n > 0) throw new HttpError(409, `Impossible : ${n} équipement(s) sont rattachés à ce site`);
  db.prepare('DELETE FROM sites WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- Localisations (bâtiment / étage / salle) ----------
const LOC_SELECT = `
  SELECT l.*, s.name AS site_name,
    (SELECT COUNT(*) FROM assets a WHERE a.location_id = l.id) AS asset_count
  FROM locations l JOIN sites s ON s.id = l.site_id`;

r.get('/locations', (req, res) => {
  const where = req.query.site_id ? 'WHERE l.site_id = ?' : '';
  const params = req.query.site_id ? [req.query.site_id] : [];
  res.json(db.prepare(`${LOC_SELECT} ${where} ORDER BY s.name, l.building, l.floor, l.name`).all(...params));
});
r.get('/locations/by-code/:code', h((req, res) => {
  const loc = db.prepare(`${LOC_SELECT} WHERE l.code = ?`).get(req.params.code);
  if (!loc) throw new HttpError(404, 'Localisation introuvable');
  res.json(loc);
}));
const LOC_FIELDS = ['site_id', 'code', 'building', 'floor', 'name'];
r.post('/locations', manage, h((req, res) => {
  const d = pick(req.body, LOC_FIELDS);
  if (!d.site_id || !d.name) throw new HttpError(400, 'Site et nom de la salle requis');
  const info = uniqueGuard(() => db.prepare('INSERT INTO locations(site_id, code, building, floor, name) VALUES (?, ?, ?, ?, ?)')
    .run(d.site_id, d.code, d.building, d.floor, d.name));
  res.status(201).json(db.prepare(`${LOC_SELECT} WHERE l.id = ?`).get(info.lastInsertRowid));
}));
r.put('/locations/:id', manage, h((req, res) => {
  const d = pick(req.body, LOC_FIELDS);
  if (!d.site_id || !d.name) throw new HttpError(400, 'Site et nom de la salle requis');
  uniqueGuard(() => db.prepare('UPDATE locations SET site_id = ?, code = ?, building = ?, floor = ?, name = ? WHERE id = ?')
    .run(d.site_id, d.code, d.building, d.floor, d.name, req.params.id));
  res.json(db.prepare(`${LOC_SELECT} WHERE l.id = ?`).get(req.params.id));
}));
r.delete('/locations/:id', manage, h((req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM assets WHERE location_id = ?').get(req.params.id).n;
  if (n > 0) throw new HttpError(409, `Impossible : ${n} équipement(s) sont dans cette localisation`);
  db.prepare('DELETE FROM locations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- Catégories ----------
r.get('/categories', (req, res) => {
  res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM assets a WHERE a.category_id = c.id) AS asset_count
    FROM categories c ORDER BY c.family, c.name`).all());
});
r.post('/categories', manage, h((req, res) => {
  const d = pick(req.body, ['name', 'family', 'depreciation_years']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  if (!FAMILIES.includes(d.family || 'autre')) throw new HttpError(400, 'Famille invalide');
  const info = uniqueGuard(() => db.prepare('INSERT INTO categories(name, family, depreciation_years) VALUES (?, ?, ?)')
    .run(d.name, d.family || 'autre', d.depreciation_years));
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
}));
r.put('/categories/:id', manage, h((req, res) => {
  const d = pick(req.body, ['name', 'family', 'depreciation_years']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  if (!FAMILIES.includes(d.family || 'autre')) throw new HttpError(400, 'Famille invalide');
  uniqueGuard(() => db.prepare('UPDATE categories SET name = ?, family = ?, depreciation_years = ? WHERE id = ?')
    .run(d.name, d.family || 'autre', d.depreciation_years, req.params.id));
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id));
}));
r.delete('/categories/:id', manage, h((req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

export default r;

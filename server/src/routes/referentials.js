import { Router } from 'express';
import { db, tx } from '../db.js';
import { requireRole, MANAGERS } from '../auth.js';
import { h, HttpError, pickAll as pick } from '../util.js';

const r = Router();
const manage = requireRole(...MANAGERS);
const FAMILIES = ['informatique', 'mobilier', 'autre'];

const uniqueGuard = async (fn) => {
  try { return await fn(); } catch (e) {
    if (e.code === '23505' || String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Cet élément existe déjà (nom ou code en doublon)');
    throw e;
  }
};

// ---------- Sites ----------
r.get('/sites', h(async (req, res) => {
  res.json(await db.all(`
    SELECT s.*, (SELECT COUNT(*) FROM locations l WHERE l.site_id = s.id) AS location_count,
      (SELECT COUNT(*) FROM assets a JOIN locations l ON l.id = a.location_id WHERE l.site_id = s.id) AS asset_count
    FROM sites s ORDER BY s.name`));
}));
r.post('/sites', manage, h(async (req, res) => {
  const d = pick(req.body, ['name', 'address']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  const info = await uniqueGuard(() => db.run('INSERT INTO sites(name, address) VALUES (?, ?)', d.name, d.address));
  res.status(201).json(await db.get('SELECT * FROM sites WHERE id = ?', info.lastInsertRowid));
}));
r.put('/sites/:id', manage, h(async (req, res) => {
  const d = pick(req.body, ['name', 'address']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  await uniqueGuard(() => db.run('UPDATE sites SET name = ?, address = ? WHERE id = ?', d.name, d.address, req.params.id));
  res.json(await db.get('SELECT * FROM sites WHERE id = ?', req.params.id));
}));
r.delete('/sites/:id', manage, h(async (req, res) => {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM assets a JOIN locations l ON l.id = a.location_id WHERE l.site_id = ?', req.params.id);
  if (n > 0) throw new HttpError(409, `Impossible : ${n} équipement(s) sont rattachés à ce site`);
  await tx(async (t) => {
    const ids = (await t.all('SELECT id FROM locations WHERE site_id = ?', req.params.id)).map((x) => x.id);
    for (const id of ids) await deleteLocation(t, id);
    await t.run('DELETE FROM sites WHERE id = ?', req.params.id);
  });
  res.json({ ok: true });
}));

async function deleteLocation(t, id) {
  await t.run('DELETE FROM campaign_locations WHERE location_id = ?', id);
  await t.run('UPDATE scans SET location_id = NULL WHERE location_id = ?', id);
  await t.run('DELETE FROM locations WHERE id = ?', id);
}

// ---------- Localisations (bâtiment / étage / salle) ----------
const LOC_SELECT = `
  SELECT l.*, s.name AS site_name,
    (SELECT COUNT(*) FROM assets a WHERE a.location_id = l.id) AS asset_count
  FROM locations l JOIN sites s ON s.id = l.site_id`;

r.get('/locations', h(async (req, res) => {
  const where = req.query.site_id ? 'WHERE l.site_id = ?' : '';
  const params = req.query.site_id ? [req.query.site_id] : [];
  res.json(await db.all(`${LOC_SELECT} ${where} ORDER BY s.name, l.building, l.floor, l.name`, ...params));
}));
r.get('/locations/by-code/:code', h(async (req, res) => {
  const loc = await db.get(`${LOC_SELECT} WHERE l.code = ?`, req.params.code);
  if (!loc) throw new HttpError(404, 'Localisation introuvable');
  res.json(loc);
}));
const LOC_FIELDS = ['site_id', 'code', 'building', 'floor', 'name'];
r.post('/locations', manage, h(async (req, res) => {
  const d = pick(req.body, LOC_FIELDS);
  if (!d.site_id || !d.name) throw new HttpError(400, 'Site et nom de la salle requis');
  const info = await uniqueGuard(() => db.run('INSERT INTO locations(site_id, code, building, floor, name) VALUES (?, ?, ?, ?, ?)',
    d.site_id, d.code, d.building, d.floor, d.name));
  res.status(201).json(await db.get(`${LOC_SELECT} WHERE l.id = ?`, info.lastInsertRowid));
}));
r.put('/locations/:id', manage, h(async (req, res) => {
  const d = pick(req.body, LOC_FIELDS);
  if (!d.site_id || !d.name) throw new HttpError(400, 'Site et nom de la salle requis');
  await uniqueGuard(() => db.run('UPDATE locations SET site_id = ?, code = ?, building = ?, floor = ?, name = ? WHERE id = ?',
    d.site_id, d.code, d.building, d.floor, d.name, req.params.id));
  res.json(await db.get(`${LOC_SELECT} WHERE l.id = ?`, req.params.id));
}));
r.delete('/locations/:id', manage, h(async (req, res) => {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM assets WHERE location_id = ?', req.params.id);
  if (n > 0) throw new HttpError(409, `Impossible : ${n} équipement(s) sont dans cette localisation`);
  await tx((t) => deleteLocation(t, req.params.id));
  res.json({ ok: true });
}));

// ---------- Catégories ----------
r.get('/categories', h(async (req, res) => {
  res.json(await db.all(`SELECT c.*, (SELECT COUNT(*) FROM assets a WHERE a.category_id = c.id) AS asset_count
    FROM categories c ORDER BY c.family, c.name`));
}));
r.post('/categories', manage, h(async (req, res) => {
  const d = pick(req.body, ['name', 'family', 'depreciation_years']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  if (!FAMILIES.includes(d.family || 'autre')) throw new HttpError(400, 'Famille invalide');
  const info = await uniqueGuard(() => db.run('INSERT INTO categories(name, family, depreciation_years) VALUES (?, ?, ?)',
    d.name, d.family || 'autre', d.depreciation_years));
  res.status(201).json(await db.get('SELECT * FROM categories WHERE id = ?', info.lastInsertRowid));
}));
r.put('/categories/:id', manage, h(async (req, res) => {
  const d = pick(req.body, ['name', 'family', 'depreciation_years']);
  if (!d.name) throw new HttpError(400, 'Nom requis');
  if (!FAMILIES.includes(d.family || 'autre')) throw new HttpError(400, 'Famille invalide');
  await uniqueGuard(() => db.run('UPDATE categories SET name = ?, family = ?, depreciation_years = ? WHERE id = ?',
    d.name, d.family || 'autre', d.depreciation_years, req.params.id));
  res.json(await db.get('SELECT * FROM categories WHERE id = ?', req.params.id));
}));
r.delete('/categories/:id', manage, h(async (req, res) => {
  await tx(async (t) => {
    await t.run('UPDATE assets SET category_id = NULL WHERE category_id = ?', req.params.id);
    await t.run('DELETE FROM categories WHERE id = ?', req.params.id);
  });
  res.json({ ok: true });
}));

export default r;

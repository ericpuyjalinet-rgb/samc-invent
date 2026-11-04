import { Router } from 'express';
import { db, getSetting, setSetting } from '../db.js';
import { requireRole } from '../auth.js';
import { h, HttpError } from '../util.js';

const r = Router();

r.get('/dashboard', h(async (req, res) => {
  const one = (sql, ...p) => db.get(sql, ...p);
  const all = (sql, ...p) => db.all(sql, ...p);
  const q = {
    totals: {
      assets: one('SELECT COUNT(*) AS n FROM assets').then((r) => r.n),
      active: one(`SELECT COUNT(*) AS n FROM assets WHERE status IN ('en_service','en_stock','en_reparation')`).then((r) => r.n),
      value: one(`SELECT COALESCE(SUM(purchase_price),0) AS v FROM assets WHERE status <> 'reforme'`).then((r) => r.v),
      sites: one('SELECT COUNT(*) AS n FROM sites').then((r) => r.n),
      locations: one('SELECT COUNT(*) AS n FROM locations').then((r) => r.n),
      no_location: one('SELECT COUNT(*) AS n FROM assets WHERE location_id IS NULL').then((r) => r.n),
      warranty_soon: one(`SELECT COUNT(*) AS n FROM assets WHERE warranty_end BETWEEN current_date AND current_date + 90`).then((r) => r.n),
      never_seen: one(`SELECT COUNT(*) AS n FROM assets WHERE last_seen_at IS NULL AND status IN ('en_service','en_stock')`).then((r) => r.n),
    },
    by_family: all(`SELECT COALESCE(c.family,'non classé') family, COUNT(*) AS n FROM assets a LEFT JOIN categories c ON c.id = a.category_id GROUP BY 1 ORDER BY n DESC`),
    by_status: all('SELECT status, COUNT(*) AS n FROM assets GROUP BY status ORDER BY n DESC'),
    by_condition: all(`SELECT condition, COUNT(*) AS n FROM assets GROUP BY condition
      ORDER BY CASE condition WHEN 'neuf' THEN 1 WHEN 'bon' THEN 2 WHEN 'moyen' THEN 3 WHEN 'mauvais' THEN 4 ELSE 5 END`),
    by_category: all(`SELECT COALESCE(c.name,'Sans catégorie') name, COUNT(*) AS n FROM assets a LEFT JOIN categories c ON c.id = a.category_id GROUP BY 1 ORDER BY n DESC LIMIT 10`),
    by_site: all(`SELECT COALESCE(s.name,'Non localisé') name, COUNT(*) AS n FROM assets a LEFT JOIN locations l ON l.id = a.location_id LEFT JOIN sites s ON s.id = l.site_id GROUP BY 1 ORDER BY n DESC`),
    campaigns: all(`SELECT id, name, status, start_date, end_date FROM campaigns WHERE status <> 'cloturee' ORDER BY id DESC LIMIT 5`),
    recent: all(`SELECT h.action, h.created_at, a.id asset_id, a.code, a.label, u.name user_name FROM asset_history h
      JOIN assets a ON a.id = h.asset_id LEFT JOIN users u ON u.id = h.user_id ORDER BY h.id DESC LIMIT 12`),
  };
  // résolution parallèle de toutes les requêtes
  const resolve = async (o) => Object.fromEntries(await Promise.all(Object.entries(o).map(async ([k, v]) =>
    [k, v && typeof v.then === 'function' ? await v : await resolve(v)])));
  res.json(await resolve(q));
}));

const SETTINGS = ['organization_name', 'code_prefix', 'label_footer'];
r.get('/settings', h(async (req, res) => {
  res.json({
    organization_name: await getSetting('organization_name', 'SAMC'),
    code_prefix: await getSetting('code_prefix', 'SAMC'),
    label_footer: await getSetting('label_footer', 'Propriété SAMC — ne pas retirer'),
  });
}));
r.put('/settings', requireRole('admin'), h(async (req, res) => {
  for (const k of SETTINGS) {
    if (k in (req.body || {})) {
      const v = String(req.body[k] ?? '').trim();
      if (k === 'code_prefix' && !/^[A-Z0-9]{1,10}$/i.test(v)) throw new HttpError(400, 'Préfixe : 1 à 10 caractères alphanumériques');
      await setSetting(k, k === 'code_prefix' ? v.toUpperCase() : v);
    }
  }
  res.json({ ok: true });
}));

export default r;

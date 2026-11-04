import { Router } from 'express';
import { db, getSetting, setSetting } from '../db.js';
import { requireRole } from '../auth.js';
import { h, HttpError } from '../util.js';

const r = Router();

r.get('/dashboard', (req, res) => {
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  res.json({
    totals: {
      assets: one('SELECT COUNT(*) n FROM assets').n,
      active: one(`SELECT COUNT(*) n FROM assets WHERE status IN ('en_service','en_stock','en_reparation')`).n,
      value: one(`SELECT IFNULL(SUM(purchase_price),0) v FROM assets WHERE status <> 'reforme'`).v,
      sites: one('SELECT COUNT(*) n FROM sites').n,
      locations: one('SELECT COUNT(*) n FROM locations').n,
      no_location: one('SELECT COUNT(*) n FROM assets WHERE location_id IS NULL').n,
      warranty_soon: one(`SELECT COUNT(*) n FROM assets WHERE warranty_end BETWEEN date('now') AND date('now','+90 day')`).n,
      never_seen: one(`SELECT COUNT(*) n FROM assets WHERE last_seen_at IS NULL AND status IN ('en_service','en_stock')`).n,
    },
    by_family: all(`SELECT IFNULL(c.family,'non classé') family, COUNT(*) n FROM assets a LEFT JOIN categories c ON c.id = a.category_id GROUP BY 1 ORDER BY n DESC`),
    by_status: all('SELECT status, COUNT(*) n FROM assets GROUP BY status ORDER BY n DESC'),
    by_condition: all(`SELECT condition, COUNT(*) n FROM assets GROUP BY condition
      ORDER BY CASE condition WHEN 'neuf' THEN 1 WHEN 'bon' THEN 2 WHEN 'moyen' THEN 3 WHEN 'mauvais' THEN 4 ELSE 5 END`),
    by_category: all(`SELECT IFNULL(c.name,'Sans catégorie') name, COUNT(*) n FROM assets a LEFT JOIN categories c ON c.id = a.category_id GROUP BY 1 ORDER BY n DESC LIMIT 10`),
    by_site: all(`SELECT IFNULL(s.name,'Non localisé') name, COUNT(*) n FROM assets a LEFT JOIN locations l ON l.id = a.location_id LEFT JOIN sites s ON s.id = l.site_id GROUP BY 1 ORDER BY n DESC`),
    campaigns: all(`SELECT id, name, status, start_date, end_date FROM campaigns WHERE status <> 'cloturee' ORDER BY id DESC LIMIT 5`),
    recent: all(`SELECT h.action, h.created_at, a.id asset_id, a.code, a.label, u.name user_name FROM asset_history h
      JOIN assets a ON a.id = h.asset_id LEFT JOIN users u ON u.id = h.user_id ORDER BY h.id DESC LIMIT 12`),
  });
});

const SETTINGS = ['organization_name', 'code_prefix', 'label_footer'];
r.get('/settings', (req, res) => {
  res.json({
    organization_name: getSetting('organization_name', 'SAMC'),
    code_prefix: getSetting('code_prefix', 'SAMC'),
    label_footer: getSetting('label_footer', 'Propriété SAMC — ne pas retirer'),
  });
});
r.put('/settings', requireRole('admin'), h((req, res) => {
  for (const k of SETTINGS) {
    if (k in (req.body || {})) {
      const v = String(req.body[k] ?? '').trim();
      if (k === 'code_prefix' && !/^[A-Z0-9]{1,10}$/i.test(v)) throw new HttpError(400, 'Préfixe : 1 à 10 caractères alphanumériques');
      setSetting(k, k === 'code_prefix' ? v.toUpperCase() : v);
    }
  }
  res.json({ ok: true });
}));

export default r;

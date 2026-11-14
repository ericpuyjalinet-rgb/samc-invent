// État de l'actif : biens inscrits, regroupés par compte d'imputation, à une date donnée
import { Router } from 'express';
import { db } from '../db.js';
import { requireRole, MANAGERS } from '../auth.js';
import { h, HttpError, toCsv } from '../util.js';
import { ASSET_SELECT } from './assets.js';
import { accountingSettings, depreciation, accountOf } from '../accounting.js';

const r = Router();
r.use(requireRole(...MANAGERS));

/** Biens à l'actif à la date : acquis au plus tard ce jour-là, pas encore sortis à cette date. */
async function assetsAt(date) {
  const rows = await db.all(`SELECT x.*,
      (SELECT d.exit_date FROM disposals d WHERE d.asset_id = x.id AND d.status = 'validee' ORDER BY d.id DESC LIMIT 1) AS exit_date
    FROM (${ASSET_SELECT}) x
    WHERE x.acquisition_mode <> 'location' AND (x.purchase_date IS NULL OR x.purchase_date <= ?::date)
    ORDER BY x.inventory_number NULLS LAST, x.code`, date);
  return rows.filter((a) => a.status !== 'sorti' || (a.exit_date && a.exit_date > date));
}

const parseDate = (q) => {
  const d = q.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'Date invalide (AAAA-MM-JJ)');
  return d;
};

r.get('/actif', h(async (req, res) => {
  const date = parseDate(req.query);
  const settings = await accountingSettings();
  const groups = new Map();
  const totals = { count: 0, gross: 0, accumulated: 0, net: 0, no_value: 0, no_inventory_number: 0 };
  for (const a of await assetsAt(date)) {
    const dep = depreciation(a, settings, date);
    const key = accountOf(a) || 'non renseigné';
    const g = groups.get(key) || { account: key, count: 0, gross: 0, accumulated: 0, net: 0 };
    g.count++; g.gross += dep.gross_value; g.accumulated += dep.accumulated; g.net += dep.net_book_value;
    groups.set(key, g);
    totals.count++; totals.gross += dep.gross_value; totals.accumulated += dep.accumulated; totals.net += dep.net_book_value;
    if (!dep.gross_value) totals.no_value++;
    if (!a.inventory_number) totals.no_inventory_number++;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  res.json({
    date, settings,
    accounts: [...groups.values()].sort((x, y) => x.account.localeCompare(y.account))
      .map((g) => ({ ...g, gross: r2(g.gross), accumulated: r2(g.accumulated), net: r2(g.net) })),
    totals: { ...totals, gross: r2(totals.gross), accumulated: r2(totals.accumulated), net: r2(totals.net) },
  });
}));

r.get('/actif.csv', h(async (req, res) => {
  const date = parseDate(req.query);
  const settings = await accountingSettings();
  const money = (n) => String(n ?? '').replace('.', ',');
  const rows = (await assetsAt(date)).map((a) => ({ ...a, account: accountOf(a), dep: depreciation(a, settings, date) }));
  const cols = [
    { key: 'account', label: 'compte' }, { key: 'inventory_number', label: 'n_inventaire' }, { key: 'code', label: 'code' },
    { key: 'label', label: 'designation' }, { key: 'category_name', label: 'categorie' }, { key: 'service_name', label: 'service' },
    { key: 'fiscal_year', label: 'exercice' }, { key: 'purchase_date', label: 'date_acquisition' },
    { key: 'acquisition_mode', label: 'mode_acquisition' }, { key: 'mandate_number', label: 'mandat' },
    { label: 'valeur_brute', get: (x) => money(x.dep.gross_value) }, { label: 'duree', get: (x) => x.dep.years ?? '' },
    { label: 'faible_valeur', get: (x) => (x.dep.low_value ? 'oui' : '') },
    { label: 'dotation_annuelle', get: (x) => money(x.dep.annual) },
    { label: 'amortissements_cumules', get: (x) => money(x.dep.accumulated) },
    { label: 'valeur_nette_comptable', get: (x) => money(x.dep.net_book_value) },
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="etat-de-l-actif-${date}.csv"`);
  res.send(toCsv(rows, cols));
}));

export default r;

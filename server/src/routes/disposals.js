// Sorties d'inventaire (réforme) : proposition → décision de l'ordonnateur → sortie de l'actif
import { Router } from 'express';
import { db, tx, logHistory } from '../db.js';
import { requireRole, MANAGERS } from '../auth.js';
import { h, HttpError, toCsv } from '../util.js';
import { ASSET_SELECT } from './assets.js';
import { accountingSettings, depreciation, accountOf, DISPOSAL_REASONS, DECISION_TYPES } from '../accounting.js';

const r = Router();
r.use(requireRole(...MANAGERS));

const LIST = `
  SELECT d.*, a.code, a.label, a.inventory_number, a.serial_number, a.purchase_date, a.purchase_price, a.status AS asset_status,
    a.account_code, c.account_code AS category_account_code, c.name AS category_name, sv.name AS service_name,
    l.name AS location_name, s.name AS site_name, u.name AS proposed_by_name, v.name AS validated_by_name
  FROM disposals d
  JOIN assets a ON a.id = d.asset_id
  LEFT JOIN categories c ON c.id = a.category_id
  LEFT JOIN services sv ON sv.id = a.service_id
  LEFT JOIN locations l ON l.id = a.location_id
  LEFT JOIN sites s ON s.id = l.site_id
  LEFT JOIN users u ON u.id = d.proposed_by
  LEFT JOIN users v ON v.id = d.validated_by`;

const withAccount = (x) => ({ ...x, account: accountOf(x) });

r.get('/', h(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) { where.push('d.status = ?'); params.push(req.query.status); }
  if (req.query.year) { where.push('EXTRACT(YEAR FROM d.exit_date) = ?'); params.push(Number(req.query.year)); }
  if (req.query.ids) {
    const ids = String(req.query.ids).split(',').map(Number).filter(Boolean);
    if (ids.length) { where.push(`d.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  }
  const rows = await db.all(`${LIST} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.id DESC LIMIT 2000`, ...params);
  const settings = await accountingSettings();
  res.json(rows.map((x) => ({ ...withAccount(x), current_net_book_value: depreciation(x, settings).net_book_value })));
}));

/** Proposer un ou plusieurs biens à la sortie. */
r.post('/', h(async (req, res) => {
  const { asset_ids = [], reason, reason_details = null, notes = null } = req.body || {};
  if (!Array.isArray(asset_ids) || !asset_ids.length) throw new HttpError(400, 'Aucun bien sélectionné');
  if (!DISPOSAL_REASONS.includes(reason)) throw new HttpError(400, 'Motif de sortie invalide');
  const result = { created: 0, skipped: [] };
  await tx(async (t) => {
    for (const id of asset_ids) {
      const a = await t.get('SELECT id, code, status FROM assets WHERE id = ?', id);
      if (!a) { result.skipped.push({ id, reason: 'introuvable' }); continue; }
      if (a.status === 'sorti') { result.skipped.push({ id, code: a.code, reason: 'déjà sorti' }); continue; }
      if (await t.get(`SELECT 1 AS ok FROM disposals WHERE asset_id = ? AND status = 'proposee'`, id)) {
        result.skipped.push({ id, code: a.code, reason: 'proposition déjà en cours' }); continue;
      }
      await t.run(`INSERT INTO disposals(asset_id, reason, reason_details, notes, proposed_by, previous_status)
        VALUES (?, ?, ?, ?, ?, ?)`, id, reason, reason_details, notes, req.user.id, a.status);
      const target = ['vol', 'perte'].includes(reason) ? 'perdu' : 'reforme';
      await t.run(`UPDATE assets SET status = ?, updated_at = now() WHERE id = ?`, target, id);
      await logHistory(id, req.user.id, 'sortie_proposee', { status: [a.status, target], motif: reason }, t);
      result.created++;
    }
  });
  res.status(201).json(result);
}));

/** Valider des propositions : décision de l'ordonnateur, sortie de l'actif. Réservé aux administrateurs. */
r.post('/validate', requireRole('admin'), h(async (req, res) => {
  const { ids = [], decision_type, decision_number, decision_date, exit_date, sale_price = null, beneficiary = null } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Aucune proposition sélectionnée');
  if (!DECISION_TYPES.includes(decision_type)) throw new HttpError(400, 'Type de décision invalide');
  if (!decision_number || !decision_date) throw new HttpError(400, 'N° et date de la décision requis');
  const exit = exit_date || decision_date;
  const price = sale_price === null || sale_price === '' ? null : Number(String(sale_price).replace(',', '.'));
  if (price !== null && (Number.isNaN(price) || price < 0)) throw new HttpError(400, 'Prix de cession invalide');
  const settings = await accountingSettings();
  let count = 0;
  await tx(async (t) => {
    for (const id of ids) {
      const d = await t.get(`SELECT * FROM disposals WHERE id = ? AND status = 'proposee'`, id);
      if (!d) continue;
      const a = await t.get(`${ASSET_SELECT} WHERE a.id = ?`, d.asset_id);
      const dep = depreciation(a, settings, exit);
      await t.run(`UPDATE disposals SET status = 'validee', decision_type = ?, decision_number = ?, decision_date = ?, exit_date = ?,
          sale_price = ?, beneficiary = ?, gross_value = ?, net_book_value = ?, validated_by = ?, validated_at = now() WHERE id = ?`,
      decision_type, decision_number, decision_date, exit, price, beneficiary, dep.gross_value, dep.net_book_value, req.user.id, id);
      await t.run(`UPDATE assets SET status = 'sorti', updated_at = now() WHERE id = ?`, a.id);
      await logHistory(a.id, req.user.id, 'sortie_validee', { status: [a.status, 'sorti'], decision: `${decision_type} n° ${decision_number}` }, t);
      count++;
    }
  });
  res.json({ ok: true, count });
}));

/** Annuler une proposition : le bien retrouve son statut d'avant. */
r.post('/:id/cancel', h(async (req, res) => {
  const d = await db.get(`SELECT * FROM disposals WHERE id = ?`, req.params.id);
  if (!d) throw new HttpError(404, 'Proposition introuvable');
  if (d.status !== 'proposee') throw new HttpError(409, 'Seule une proposition en attente peut être annulée');
  await tx(async (t) => {
    await t.run(`UPDATE disposals SET status = 'annulee' WHERE id = ?`, d.id);
    const back = d.previous_status && d.previous_status !== 'sorti' ? d.previous_status : 'en_stock';
    await t.run(`UPDATE assets SET status = ?, updated_at = now() WHERE id = ?`, back, d.asset_id);
    await logHistory(d.asset_id, req.user.id, 'sortie_annulee', { status: [null, back] }, t);
  });
  res.json({ ok: true });
}));

/** État des sorties de l'exercice, à transmettre au comptable public. */
r.get('/export.csv', h(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const rows = (await db.all(`${LIST} WHERE d.status = 'validee' AND EXTRACT(YEAR FROM d.exit_date) = ? ORDER BY d.exit_date, a.code`, year))
    .map(withAccount);
  const money = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
  const cols = [
    { key: 'inventory_number', label: 'n_inventaire' }, { key: 'code', label: 'code' }, { key: 'label', label: 'designation' },
    { key: 'account', label: 'compte' }, { key: 'purchase_date', label: 'date_acquisition' },
    { label: 'valeur_brute', get: (x) => money(x.gross_value) }, { label: 'valeur_nette_comptable', get: (x) => money(x.net_book_value) },
    { key: 'exit_date', label: 'date_sortie' }, { key: 'reason', label: 'motif' }, { key: 'decision_type', label: 'type_decision' },
    { key: 'decision_number', label: 'n_decision' }, { key: 'decision_date', label: 'date_decision' },
    { label: 'prix_cession', get: (x) => money(x.sale_price) }, { key: 'beneficiary', label: 'beneficiaire' },
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="etat-des-sorties-${year}.csv"`);
  res.send(toCsv(rows, cols));
}));

export default r;

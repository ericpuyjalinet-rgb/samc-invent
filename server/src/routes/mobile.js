import { Router } from 'express';
import { db, tx } from '../db.js';
import { h, HttpError } from '../util.js';
import { saveDataUrl } from '../storage.js';
import { getCampaign, scopeLocationIds, expectedAssets, computeReport } from './campaigns.js';

const r = Router();
const CONDITIONS = ['neuf', 'bon', 'moyen', 'mauvais', 'hs'];
const stats = async (c) => (await computeReport(c, { statsOnly: true })).stats;

r.get('/campaigns', h(async (req, res) => {
  const rows = await db.all(`SELECT * FROM campaigns WHERE status = 'en_cours' ORDER BY id DESC`);
  const out = [];
  for (const c of rows) out.push({ ...c, stats: await stats(await getCampaign(c.id)) });
  res.json(out);
}));

/**
 * Données nécessaires au travail hors-ligne : localisations, catégories,
 * référentiel allégé des équipements et relevés déjà effectués.
 */
r.get('/campaigns/:id/bootstrap', h(async (req, res) => {
  const c = await getCampaign(req.params.id);
  if (c.status !== 'en_cours') throw new HttpError(409, "Cette campagne n'est pas ouverte à la saisie");
  const scope = new Set(await scopeLocationIds(c));
  const [locRows, expRows, assetRows, categories, scans] = await Promise.all([
    db.all(`SELECT l.id, l.code, l.name, l.building, l.floor, l.site_id, s.name AS site_name
      FROM locations l JOIN sites s ON s.id = l.site_id ORDER BY s.name, l.building, l.floor, l.name`),
    expectedAssets(c),
    db.all(`SELECT a.id, a.code, a.label, a.brand, a.model, a.serial_number, a.location_id, a.status,
        a.condition, a.assigned_to, c.name AS category_name, c.family
      FROM assets a LEFT JOIN categories c ON c.id = a.category_id`),
    db.all('SELECT id, name, family FROM categories ORDER BY family, name'),
    db.all(`SELECT sc.client_uuid, sc.asset_id, sc.scanned_code, sc.location_id, sc.result, sc.condition,
        sc.comment, sc.unknown_label, sc.unknown_category_id, sc.scanned_at, sc.user_id, u.name AS user_name
      FROM scans sc LEFT JOIN users u ON u.id = sc.user_id WHERE sc.campaign_id = ? ORDER BY sc.id`, c.id),
  ]);
  const expected = new Map(expRows.map((e) => [e.asset_id, e.expected_location_id]));
  res.json({
    campaign: c,
    locations: locRows.map((l) => ({ ...l, in_scope: scope.has(l.id) })),
    assets: assetRows.map((a) => ({ ...a, expected: expected.has(a.id), expected_location_id: expected.get(a.id) ?? null })),
    categories,
    scans,
    generated_at: new Date().toISOString(),
  });
}));

/**
 * Synchronisation des relevés saisis (éventuellement hors-ligne).
 * Idempotent grâce à client_uuid. ops = [{ type: 'upsert', scan: {...} } | { type: 'delete', client_uuid }]
 */
r.post('/campaigns/:id/sync', h(async (req, res) => {
  const c = await getCampaign(req.params.id);
  if (c.status !== 'en_cours') throw new HttpError(409, 'Campagne clôturée : synchronisation impossible');
  const ops = Array.isArray(req.body?.ops) ? req.body.ops : [];
  const expected = new Map((await expectedAssets(c)).map((e) => [e.asset_id, e.expected_location_id]));
  const isManager = ['admin', 'gestionnaire'].includes(req.user.role);

  // Les photos sont enregistrées avant la transaction (appels réseau éventuels vers Vercel Blob)
  const photos = new Map();
  for (const op of ops) {
    const p = op.scan?.photo;
    if (op.type !== 'delete' && p && String(p).startsWith('data:')) photos.set(op.scan.client_uuid, await saveDataUrl(p));
  }

  const results = [];
  await tx(async (t) => {
    for (const op of ops) {
      try {
        if (op.type === 'delete') {
          await t.run(`DELETE FROM scans WHERE client_uuid = ? AND campaign_id = ? AND (user_id = ? OR ? = 1)`,
            op.client_uuid, c.id, req.user.id, isManager ? 1 : 0);
          results.push({ client_uuid: op.client_uuid, ok: true });
          continue;
        }
        const s = op.scan || {};
        if (!s.client_uuid) throw new Error('client_uuid manquant');
        let asset = s.asset_id ? await t.get('SELECT id, location_id FROM assets WHERE id = ?', s.asset_id) : null;
        if (!asset && s.scanned_code) {
          const code = String(s.scanned_code).trim();
          asset = await t.get(`SELECT id, location_id FROM assets WHERE lower(code) = lower(?)
            OR lower(serial_number) = lower(?) LIMIT 1`, code, code);
        }
        const locationId = s.location_id ? Number(s.location_id) : null;
        const expectedLoc = asset ? (expected.has(asset.id) ? expected.get(asset.id) : asset.location_id) : null;
        const result = !asset ? 'inconnu' : expectedLoc === locationId ? 'trouve' : 'deplace';
        const condition = CONDITIONS.includes(s.condition) ? s.condition : null;
        const existing = await t.get('SELECT id, photo FROM scans WHERE client_uuid = ?', s.client_uuid);
        const photo = photos.get(s.client_uuid) || existing?.photo || null;
        const scannedAt = s.scanned_at || new Date().toISOString();
        const vals = [asset?.id ?? null, s.scanned_code ?? null, locationId, result, condition, s.comment || null, photo,
          s.unknown_label || null, s.unknown_category_id || null, scannedAt];
        if (existing) {
          await t.run(`UPDATE scans SET asset_id = ?, scanned_code = ?, location_id = ?, result = ?, condition = ?, comment = ?,
            photo = ?, unknown_label = ?, unknown_category_id = ?, scanned_at = ?, synced_at = now() WHERE id = ?`,
          ...vals, existing.id);
        } else {
          await t.run(`INSERT INTO scans(asset_id, scanned_code, location_id, result, condition, comment, photo, unknown_label,
            unknown_category_id, scanned_at, client_uuid, campaign_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ...vals, s.client_uuid, c.id, req.user.id);
        }
        if (asset) {
          await t.run('UPDATE assets SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)',
            scannedAt, asset.id, scannedAt);
        }
        results.push({ client_uuid: s.client_uuid, ok: true, result, asset_id: asset?.id ?? null });
      } catch (e) {
        results.push({ client_uuid: op.client_uuid || op.scan?.client_uuid, ok: false, error: e.message });
      }
    }
  });
  res.json({ results, stats: await stats(await getCampaign(c.id)) });
}));

export default r;

import { Router } from 'express';
import { db, tx, logHistory, nextAssetCode } from '../db.js';
import { requireRole, MANAGERS } from '../auth.js';
import { h, HttpError, pickAll, toCsv } from '../util.js';
import { ASSET_SELECT } from './assets.js';

const r = Router();
const manage = requireRole(...MANAGERS);

// Statuts d'équipement attendus physiquement lors d'un inventaire
const COUNTED_STATUSES = `('en_service','en_stock','en_reparation')`;

export function getCampaign(id) {
  const c = db.prepare(`SELECT c.*, u.name AS created_by_name FROM campaigns c
    LEFT JOIN users u ON u.id = c.created_by WHERE c.id = ?`).get(id);
  if (!c) throw new HttpError(404, 'Campagne introuvable');
  c.location_ids = db.prepare('SELECT location_id FROM campaign_locations WHERE campaign_id = ?').all(id).map((x) => x.location_id);
  return c;
}

/** Localisations du périmètre (toutes si aucune sélection). */
export function scopeLocationIds(campaign) {
  if (campaign.location_ids?.length) return campaign.location_ids;
  return db.prepare('SELECT id FROM locations').all().map((x) => x.id);
}

/** Équipements attendus : instantané si la campagne a démarré, sinon calcul à la volée. */
export function expectedAssets(campaign) {
  if (campaign.status !== 'brouillon') {
    return db.prepare(`SELECT ce.asset_id, ce.location_id AS expected_location_id FROM campaign_expected ce
      WHERE ce.campaign_id = ?`).all(campaign.id);
  }
  const ids = scopeLocationIds(campaign);
  if (!ids.length) return [];
  return db.prepare(`SELECT id AS asset_id, location_id AS expected_location_id FROM assets
    WHERE status IN ${COUNTED_STATUSES} AND location_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
}

/** Dernier relevé effectif par équipement (+ relevés d'équipements inconnus). */
function latestScans(campaignId) {
  return db.prepare(`
    SELECT sc.*, u.name AS user_name, l.name AS location_name, s.name AS site_name
    FROM scans sc
    LEFT JOIN users u ON u.id = sc.user_id
    LEFT JOIN locations l ON l.id = sc.location_id
    LEFT JOIN sites s ON s.id = l.site_id
    WHERE sc.campaign_id = ?
      AND (sc.asset_id IS NULL OR sc.id = (SELECT MAX(id) FROM scans x WHERE x.campaign_id = sc.campaign_id AND x.asset_id = sc.asset_id))
    ORDER BY sc.scanned_at DESC`).all(campaignId);
}

/** Calcule le rapprochement attendu / constaté. */
export function computeReport(campaign) {
  const expected = expectedAssets(campaign);
  const expectedMap = new Map(expected.map((e) => [e.asset_id, e.expected_location_id]));
  const scans = latestScans(campaign.id);
  const scannedByAsset = new Map(scans.filter((s) => s.asset_id).map((s) => [s.asset_id, s]));

  const found = [], moved = [], unknown = [], extra = [];
  for (const s of scans) {
    if (!s.asset_id) { unknown.push(s); continue; }
    if (!expectedMap.has(s.asset_id)) { extra.push(s); continue; }
    if (s.location_id === expectedMap.get(s.asset_id)) found.push(s); else moved.push(s);
  }
  const missingIds = expected.filter((e) => !scannedByAsset.has(e.asset_id)).map((e) => e.asset_id);

  const assetMap = new Map();
  const allIds = [...new Set([...expectedMap.keys(), ...scannedByAsset.keys()])];
  for (let i = 0; i < allIds.length; i += 500) {
    const chunk = allIds.slice(i, i + 500);
    for (const a of db.prepare(`${ASSET_SELECT} WHERE a.id IN (${chunk.map(() => '?').join(',')})`).all(...chunk)) assetMap.set(a.id, a);
  }
  const withAsset = (s) => ({ ...s, asset: assetMap.get(s.asset_id) || null });
  const locName = db.prepare(`SELECT l.name, s.name AS site_name FROM locations l JOIN sites s ON s.id = l.site_id WHERE l.id = ?`);
  const withExpectedLoc = (s) => {
    const loc = expectedMap.get(s.asset_id) ? locName.get(expectedMap.get(s.asset_id)) : null;
    return { ...withAsset(s), expected_location_id: expectedMap.get(s.asset_id) ?? null,
      expected_location_name: loc ? `${loc.site_name} › ${loc.name}` : null };
  };

  return {
    stats: {
      expected: expected.length,
      found: found.length,
      moved: moved.length,
      missing: missingIds.length,
      unknown: unknown.length,
      extra: extra.length,
      progress: expected.length ? Math.round(((found.length + moved.length) / expected.length) * 100) : 0,
    },
    found: found.map(withAsset),
    moved: moved.map(withExpectedLoc),
    extra: extra.map(withExpectedLoc),
    unknown,
    missing: missingIds.map((id) => assetMap.get(id)).filter(Boolean),
  };
}

function perLocationProgress(campaign) {
  const expected = expectedAssets(campaign);
  const scans = latestScans(campaign.id);
  const ids = scopeLocationIds(campaign);
  const rows = ids.length ? db.prepare(`SELECT l.id, l.name, l.building, l.floor, s.name AS site_name FROM locations l
    JOIN sites s ON s.id = l.site_id WHERE l.id IN (${ids.map(() => '?').join(',')}) ORDER BY s.name, l.building, l.floor, l.name`).all(...ids) : [];
  const scannedAssets = new Set(scans.filter((s) => s.asset_id).map((s) => s.asset_id));
  return rows.map((l) => {
    const exp = expected.filter((e) => e.expected_location_id === l.id);
    return {
      ...l,
      expected: exp.length,
      checked: exp.filter((e) => scannedAssets.has(e.asset_id)).length,
      scanned_here: scans.filter((s) => s.location_id === l.id).length,
    };
  });
}

// ---------- Liste ----------
r.get('/', (req, res) => {
  const rows = db.prepare(`SELECT c.*, u.name AS created_by_name,
      (SELECT COUNT(*) FROM campaign_locations cl WHERE cl.campaign_id = c.id) AS location_count,
      (SELECT COUNT(DISTINCT user_id) FROM scans sc WHERE sc.campaign_id = c.id) AS agent_count
    FROM campaigns c LEFT JOIN users u ON u.id = c.created_by ORDER BY c.id DESC`).all();
  res.json(rows.map((c) => {
    const full = getCampaign(c.id);
    return { ...c, stats: computeReport(full).stats };
  }));
});

r.get('/:id', h((req, res) => {
  const c = getCampaign(req.params.id);
  const report = computeReport(c);
  res.json({ ...c, stats: report.stats, locations: perLocationProgress(c) });
}));

r.get('/:id/report', h((req, res) => {
  res.json(computeReport(getCampaign(req.params.id)));
}));

r.get('/:id/report.csv', h((req, res) => {
  const c = getCampaign(req.params.id);
  const rep = computeReport(c);
  const rows = [
    ...rep.found.map((s) => ({ resultat: 'Trouvé', ...flat(s) })),
    ...rep.moved.map((s) => ({ resultat: 'Déplacé', ...flat(s) })),
    ...rep.extra.map((s) => ({ resultat: 'Hors périmètre', ...flat(s) })),
    ...rep.missing.map((a) => ({ resultat: 'Manquant', code: a.code, designation: a.label, categorie: a.category_name,
      numero_serie: a.serial_number, localisation_attendue: a.location_name ? `${a.site_name} › ${a.location_name}` : '' })),
    ...rep.unknown.map((s) => ({ resultat: 'Inconnu', code: s.scanned_code, designation: s.unknown_label,
      localisation_constatee: s.location_name ? `${s.site_name} › ${s.location_name}` : '', etat_constate: s.condition,
      commentaire: s.comment, agent: s.user_name, date: s.scanned_at })),
  ];
  function flat(s) {
    return {
      code: s.asset?.code, designation: s.asset?.label, categorie: s.asset?.category_name, numero_serie: s.asset?.serial_number,
      localisation_attendue: s.expected_location_name || (s.asset?.location_name ? `${s.asset.site_name} › ${s.asset.location_name}` : ''),
      localisation_constatee: s.location_name ? `${s.site_name} › ${s.location_name}` : '',
      etat_constate: s.condition, commentaire: s.comment, agent: s.user_name, date: s.scanned_at,
    };
  }
  const cols = ['resultat', 'code', 'designation', 'categorie', 'numero_serie', 'localisation_attendue', 'localisation_constatee',
    'etat_constate', 'commentaire', 'agent', 'date'].map((k) => ({ key: k, label: k }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rapport-campagne-${c.id}.csv"`);
  res.send(toCsv(rows, cols));
}));

// ---------- Création / modification ----------
function saveScope(campaignId, locationIds) {
  db.prepare('DELETE FROM campaign_locations WHERE campaign_id = ?').run(campaignId);
  const ins = db.prepare('INSERT OR IGNORE INTO campaign_locations(campaign_id, location_id) VALUES (?, ?)');
  for (const lid of locationIds || []) ins.run(campaignId, Number(lid));
}

r.post('/', manage, h((req, res) => {
  const d = pickAll(req.body, ['name', 'description', 'start_date', 'end_date']);
  if (!d.name) throw new HttpError(400, 'Le nom de la campagne est requis');
  const id = tx(() => {
    const id = db.prepare('INSERT INTO campaigns(name, description, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(d.name, d.description, d.start_date, d.end_date, req.user.id).lastInsertRowid;
    saveScope(id, req.body.location_ids);
    return id;
  });
  res.status(201).json(getCampaign(id));
}));

r.put('/:id', manage, h((req, res) => {
  const c = getCampaign(req.params.id);
  if (c.status === 'cloturee') throw new HttpError(409, 'Une campagne clôturée ne peut plus être modifiée');
  const d = pickAll(req.body, ['name', 'description', 'start_date', 'end_date']);
  if (!d.name) throw new HttpError(400, 'Le nom de la campagne est requis');
  tx(() => {
    db.prepare('UPDATE campaigns SET name = ?, description = ?, start_date = ?, end_date = ? WHERE id = ?')
      .run(d.name, d.description, d.start_date, d.end_date, c.id);
    if (Array.isArray(req.body.location_ids) && c.status === 'brouillon') saveScope(c.id, req.body.location_ids);
  });
  res.json(getCampaign(c.id));
}));

r.delete('/:id', manage, h((req, res) => {
  const c = getCampaign(req.params.id);
  if (c.status === 'en_cours' && req.user.role !== 'admin') throw new HttpError(403, 'Seul un administrateur peut supprimer une campagne en cours');
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(c.id);
  res.json({ ok: true });
}));

// ---------- Cycle de vie ----------
r.post('/:id/start', manage, h((req, res) => {
  const c = getCampaign(req.params.id);
  if (c.status !== 'brouillon') throw new HttpError(409, 'La campagne a déjà été lancée');
  const exp = expectedAssets(c);
  tx(() => {
    const ins = db.prepare('INSERT INTO campaign_expected(campaign_id, asset_id, location_id) VALUES (?, ?, ?)');
    for (const e of exp) ins.run(c.id, e.asset_id, e.expected_location_id);
    db.prepare(`UPDATE campaigns SET status = 'en_cours', start_date = COALESCE(start_date, date('now')) WHERE id = ?`).run(c.id);
  });
  res.json(getCampaign(c.id));
}));

r.post('/:id/close', manage, h((req, res) => {
  const c = getCampaign(req.params.id);
  if (c.status !== 'en_cours') throw new HttpError(409, "La campagne n'est pas en cours");
  const { apply_moves = true, apply_conditions = true, mark_missing = false } = req.body || {};
  const rep = computeReport(c);
  const summary = { moved: 0, conditions: 0, missing: 0 };
  tx(() => {
    if (apply_moves) {
      for (const s of [...rep.moved, ...rep.extra]) {
        if (!s.asset || s.asset.location_id === s.location_id || !s.location_id) continue;
        db.prepare(`UPDATE assets SET location_id = ?, updated_at = datetime('now') WHERE id = ?`).run(s.location_id, s.asset_id);
        logHistory(s.asset_id, req.user.id, 'inventaire_deplacement', { location_id: [s.asset.location_id, s.location_id], campagne: c.name });
        summary.moved++;
      }
    }
    if (apply_conditions) {
      for (const s of [...rep.found, ...rep.moved, ...rep.extra]) {
        if (!s.asset || !s.condition || s.condition === s.asset.condition) continue;
        db.prepare(`UPDATE assets SET condition = ?, updated_at = datetime('now') WHERE id = ?`).run(s.condition, s.asset_id);
        logHistory(s.asset_id, req.user.id, 'inventaire_etat', { condition: [s.asset.condition, s.condition], campagne: c.name });
        summary.conditions++;
      }
    }
    if (mark_missing) {
      for (const a of rep.missing) {
        db.prepare(`UPDATE assets SET status = 'perdu', updated_at = datetime('now') WHERE id = ?`).run(a.id);
        logHistory(a.id, req.user.id, 'inventaire_manquant', { status: [a.status, 'perdu'], campagne: c.name });
        summary.missing++;
      }
    }
    db.prepare(`UPDATE campaigns SET status = 'cloturee', closed_at = datetime('now'), end_date = COALESCE(end_date, date('now')) WHERE id = ?`).run(c.id);
  });
  res.json({ ...getCampaign(c.id), summary });
}));

r.post('/:id/reopen', requireRole('admin'), h((req, res) => {
  const c = getCampaign(req.params.id);
  if (c.status !== 'cloturee') throw new HttpError(409, "La campagne n'est pas clôturée");
  db.prepare(`UPDATE campaigns SET status = 'en_cours', closed_at = NULL WHERE id = ?`).run(c.id);
  res.json(getCampaign(c.id));
}));

// ---------- Traitement des relevés ----------
/** Transforme un relevé « inconnu » en nouvel équipement, ou le rattache à un équipement existant. */
r.post('/:id/scans/:scanId/resolve', manage, h((req, res) => {
  const scan = db.prepare('SELECT * FROM scans WHERE id = ? AND campaign_id = ?').get(req.params.scanId, req.params.id);
  if (!scan) throw new HttpError(404, 'Relevé introuvable');
  if (scan.asset_id) throw new HttpError(409, 'Ce relevé est déjà rattaché à un équipement');
  const { asset_id, create } = req.body || {};
  let id = asset_id ? Number(asset_id) : null;
  tx(() => {
    if (!id && create) {
      const d = pickAll(create, ['label', 'category_id', 'brand', 'model', 'serial_number']);
      if (!d.label) throw new HttpError(400, 'Désignation requise');
      let code = create.code || scan.scanned_code || nextAssetCode();
      if (db.prepare('SELECT 1 FROM assets WHERE code = ?').get(code)) code = nextAssetCode();
      id = db.prepare(`INSERT INTO assets(code, label, category_id, brand, model, serial_number, location_id, condition, last_seen_at, photo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(code, d.label, d.category_id, d.brand, d.model, d.serial_number,
        scan.location_id, scan.condition || 'bon', scan.scanned_at, scan.photo).lastInsertRowid;
      logHistory(id, req.user.id, 'creation', { source: 'inventaire', campagne_id: scan.campaign_id });
      // Nouvel équipement : il est considéré comme attendu là où il a été trouvé
      db.prepare('INSERT OR IGNORE INTO campaign_expected(campaign_id, asset_id, location_id) VALUES (?, ?, ?)')
        .run(scan.campaign_id, id, scan.location_id);
    }
    if (!id) throw new HttpError(400, 'Indiquez un équipement existant ou les informations de création');
    db.prepare(`UPDATE scans SET asset_id = ?, resolved_asset_id = ?, result = 'trouve' WHERE id = ?`).run(id, id, scan.id);
  });
  res.json({ ok: true, asset_id: id });
}));

r.delete('/:id/scans/:scanId', manage, h((req, res) => {
  db.prepare('DELETE FROM scans WHERE id = ? AND campaign_id = ?').run(req.params.scanId, req.params.id);
  res.json({ ok: true });
}));

export default r;

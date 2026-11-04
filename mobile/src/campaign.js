/** Index et calculs dérivés d'une campagne chargée. */
export function buildIndex(bundle) {
  const assetByCode = new Map();
  for (const a of bundle.assets) {
    assetByCode.set(a.code.toLowerCase(), a);
    if (a.serial_number && !assetByCode.has(a.serial_number.toLowerCase())) assetByCode.set(a.serial_number.toLowerCase(), a);
  }
  const assetById = new Map(bundle.assets.map((a) => [a.id, a]));
  const locById = new Map(bundle.locations.map((l) => [l.id, l]));
  const locByCode = new Map(bundle.locations.filter((l) => l.code).map((l) => [l.code.toLowerCase(), l]));

  // Relevé effectif = le plus récent par équipement ; tous les relevés d'inconnus
  const latest = new Map();
  const unknown = [];
  for (const s of bundle.scans) {
    if (!s.asset_id) { unknown.push(s); continue; }
    const cur = latest.get(s.asset_id);
    if (!cur || s.scanned_at > cur.scanned_at) latest.set(s.asset_id, s);
  }
  const effective = [...latest.values(), ...unknown];
  const expected = bundle.assets.filter((a) => a.expected);
  return { assetByCode, assetById, locById, locByCode, latest, effective, expected };
}

export const expectedLocationOf = (asset) => (asset.expected ? asset.expected_location_id : asset.location_id);

export function roomStats(idx, roomId) {
  const exp = idx.expected.filter((a) => a.expected_location_id === roomId);
  const checked = exp.filter((a) => idx.latest.has(a.id)).length;
  const here = idx.effective.filter((s) => s.location_id === roomId).length;
  return { expected: exp.length, checked, here, todo: exp.length - checked };
}

export function globalStats(idx) {
  const expected = idx.expected.length;
  const checked = idx.expected.filter((a) => idx.latest.has(a.id)).length;
  return { expected, checked, progress: expected ? Math.round((checked / expected) * 100) : 0, unknown: idx.effective.filter((s) => !s.asset_id).length };
}

/** Résout un code scanné en équipement / salle. */
export function resolveCode(idx, raw) {
  const code = String(raw).trim();
  const key = code.toLowerCase();
  // Les QR peuvent contenir une URL : on prend le dernier segment
  const tail = key.includes('/') ? key.split(/[/?#=]/).filter(Boolean).pop() : key;
  const asset = idx.assetByCode.get(key) || idx.assetByCode.get(tail);
  if (asset) return { type: 'asset', asset, code: asset.code };
  const loc = idx.locByCode.get(key) || idx.locByCode.get(tail);
  if (loc) return { type: 'location', location: loc, code };
  return { type: 'unknown', code };
}

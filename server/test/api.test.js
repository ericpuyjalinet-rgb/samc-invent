// Tests d'intégration de l'API : npm test -w server
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samc-test-'));
process.env.DATA_DIR = dir;
if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = 'memory://';
process.env.ADMIN_PASSWORD = 'admin-test-123';
const { app, init } = await import('../src/app.js');
const { closeDb } = await import('../src/db.js');
await init;

let server, base, token;
const call = async (method, url, body, tok = token) => {
  const res = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
};

before(async () => {
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
  token = (await call('POST', '/auth/login', { email: 'admin@samc.local', password: 'admin-test-123' })).body.token;
});
after(async () => { server.close(); await closeDb(); fs.rmSync(dir, { recursive: true, force: true }); });

test('authentification requise et identifiants vérifiés', async () => {
  assert.equal((await call('GET', '/assets', null, null)).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'admin@samc.local', password: 'faux' }, null)).status, 401);
  assert.ok(token);
});

test('cycle complet : référentiels, équipements, campagne, synchronisation, clôture', async () => {
  const site = (await call('POST', '/sites', { name: 'Siège' })).body;
  const r1 = (await call('POST', '/locations', { site_id: site.id, name: 'Bureau 1', code: 'LOC-1' })).body;
  const r2 = (await call('POST', '/locations', { site_id: site.id, name: 'Bureau 2' })).body;
  const cat = (await call('POST', '/categories', { name: 'Écran', family: 'informatique' })).body;

  const a1 = (await call('POST', '/assets', { label: 'Écran 24', category_id: cat.id, location_id: r1.id })).body;
  const a2 = (await call('POST', '/assets', { label: 'Écran 27', location_id: r1.id, serial_number: 'SN-42' })).body;
  const a3 = (await call('POST', '/assets', { label: 'Bureau', location_id: r1.id })).body;
  assert.match(a1.code, /^SAMC-\d{6}$/);
  assert.notEqual(a1.code, a2.code);
  assert.equal((await call('POST', '/assets', { label: 'x', code: a1.code })).status, 409);

  // agent
  await call('POST', '/users', { email: 'agent@t.fr', name: 'Agent', password: 'agent-pass-1', role: 'agent' });
  const agent = (await call('POST', '/auth/login', { email: 'agent@t.fr', password: 'agent-pass-1' }, null)).body.token;
  assert.equal((await call('GET', '/campaigns', null, agent)).status, 403);

  const c = (await call('POST', '/campaigns', { name: 'Test', location_ids: [r1.id] })).body;
  assert.equal((await call('POST', `/campaigns/${c.id}/start`)).body.status, 'en_cours');
  const boot = (await call('GET', `/mobile/campaigns/${c.id}/bootstrap`, null, agent)).body;
  assert.equal(boot.assets.filter((a) => a.expected).length, 3);

  const ops = [
    { type: 'upsert', scan: { client_uuid: 'a', scanned_code: a1.code, location_id: r1.id, condition: 'bon' } },
    { type: 'upsert', scan: { client_uuid: 'b', scanned_code: 'SN-42', location_id: r2.id, condition: 'mauvais' } },
    { type: 'upsert', scan: { client_uuid: 'c', scanned_code: 'INCONNU', location_id: r1.id, unknown_label: 'Chaise' } },
  ];
  const sync = (await call('POST', `/mobile/campaigns/${c.id}/sync`, { ops }, agent)).body;
  assert.deepEqual(sync.results.map((r) => r.result), ['trouve', 'deplace', 'inconnu']);
  // idempotence : renvoyer les mêmes opérations ne crée pas de doublon
  const again = (await call('POST', `/mobile/campaigns/${c.id}/sync`, { ops }, agent)).body;
  assert.deepEqual(again.stats, sync.stats);
  assert.deepEqual(sync.stats, { expected: 3, found: 1, moved: 1, missing: 1, unknown: 1, extra: 0, progress: 67 });

  const closed = (await call('POST', `/campaigns/${c.id}/close`, { apply_moves: true, apply_conditions: true, mark_missing: true })).body;
  assert.deepEqual(closed.summary, { moved: 1, conditions: 1, missing: 1 });
  const moved = (await call('GET', `/assets/${a2.id}`)).body;
  assert.equal(moved.location_id, r2.id);
  assert.equal(moved.condition, 'mauvais');
  assert.equal((await call('GET', `/assets/${a3.id}`)).body.status, 'perdu');
  assert.equal((await call('POST', `/mobile/campaigns/${c.id}/sync`, { ops }, agent)).status, 409);
});

test('amortissement linéaire au prorata temporis et biens de faible valeur', async () => {
  const { depreciation } = await import('../src/accounting.js');
  const st = { lowValueThreshold: 500, depreciationEnabled: true };
  const pc = { purchase_price: 1200, purchase_date: '2024-01-01', category_depreciation_years: 4 };
  const mid = depreciation(pc, st, '2026-01-01');
  assert.equal(mid.annual, 300);
  assert.ok(Math.abs(mid.accumulated - 600) < 2, `cumul ${mid.accumulated}`);
  assert.equal(depreciation(pc, st, '2030-01-01').net_book_value, 0);
  const chair = depreciation({ purchase_price: 290, purchase_date: '2025-06-01', category_depreciation_years: 10 }, st, '2026-06-01');
  assert.equal(chair.low_value, true);
  assert.equal(chair.years, 1);
  assert.equal(chair.net_book_value, 0);
  assert.equal(depreciation(pc, { ...st, depreciationEnabled: false }, '2026-01-01').net_book_value, 1200);
});

test('fonction publique : services, n° d\'inventaire, sortie d\'inventaire, état de l\'actif', async () => {
  const sv = (await call('POST', '/services', { name: 'Services techniques', code: 'ST' })).body;
  const cat = (await call('POST', '/categories', { name: 'Ordinateur', family: 'informatique', depreciation_years: 4, account_code: '2183' })).body;
  const a = (await call('POST', '/assets', { label: 'PC', category_id: cat.id, service_id: sv.id, inventory_number: '2024-0001',
    purchase_date: '2024-01-01', purchase_price: '1 200', mandate_number: '2024-00012' })).body;
  assert.equal(a.fiscal_year, 2024);
  assert.equal(a.service_name, 'Services techniques');
  assert.equal((await call('POST', '/assets', { label: 'Doublon', inventory_number: '2024-0001' })).status, 409);
  const detail = (await call('GET', `/assets/${a.id}`)).body;
  assert.equal(detail.account, '2183');
  assert.equal(detail.depreciation.years, 4);

  // Proposition puis validation de la sortie
  assert.equal((await call('POST', '/disposals', { asset_ids: [a.id], reason: 'mauvais-motif' })).status, 400);
  assert.equal((await call('POST', '/disposals', { asset_ids: [a.id], reason: 'obsolescence' })).body.created, 1);
  assert.equal((await call('GET', `/assets/${a.id}`)).body.status, 'reforme');
  const [prop] = (await call('GET', '/disposals?status=proposee')).body.filter((d) => d.asset_id === a.id);
  const v = await call('POST', '/disposals/validate', { ids: [prop.id], decision_type: 'certificat_administratif',
    decision_number: 'CA-2026-04', decision_date: '2026-03-01', sale_price: '50' });
  assert.equal(v.body.count, 1);
  const out = (await call('GET', `/assets/${a.id}`)).body;
  assert.equal(out.status, 'sorti');
  assert.equal(out.disposals[0].gross_value, 1200);
  assert.ok(out.disposals[0].net_book_value > 0 && out.disposals[0].net_book_value < 1200);
  assert.equal((await call('PUT', `/assets/${a.id}`, { label: 'x' })).status, 409);

  // État de l'actif : présent avant la sortie, absent après
  const before = (await call('GET', '/accounting/actif?date=2025-12-31')).body;
  const after = (await call('GET', '/accounting/actif?date=2026-12-31')).body;
  assert.equal(before.accounts.find((x) => x.account === '2183')?.count, 1);
  assert.equal(after.accounts.find((x) => x.account === '2183'), undefined);
  const csv = await call('GET', '/disposals/export.csv?year=2026');
  assert.match(csv.body, /2024-0001/);

  // Annulation : le bien retrouve son statut
  const b = (await call('POST', '/assets', { label: 'Chaise', status: 'en_stock' })).body;
  await call('POST', '/disposals', { asset_ids: [b.id], reason: 'panne' });
  const [pb] = (await call('GET', '/disposals?status=proposee')).body.filter((d) => d.asset_id === b.id);
  await call('POST', `/disposals/${pb.id}/cancel`);
  assert.equal((await call('GET', `/assets/${b.id}`)).body.status, 'en_stock');
});

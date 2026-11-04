// Tests d'intégration de l'API : npm test -w server
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samc-test-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_PASSWORD = 'admin-test-123';
const { app } = await import('../src/index.js');

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
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

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

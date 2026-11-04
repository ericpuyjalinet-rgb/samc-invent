/**
 * Stockage hors-ligne (IndexedDB) et moteur de synchronisation.
 *
 *  kv  : `boot:<id>`  instantané serveur de la campagne (localisations, équipements, relevés)
 *        `campaigns`  dernière liste de campagnes connue
 *  ops : file d'attente des opérations non synchronisées
 *        { seq, campaign_id, type: 'upsert' | 'delete', scan?, client_uuid }
 */
import { openDB } from 'idb';
import { api } from './api.js';

const dbp = openDB('samc-invent', 1, {
  upgrade(db) {
    db.createObjectStore('kv');
    const ops = db.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true });
    ops.createIndex('campaign', 'campaign_id');
  },
});

export const kvGet = async (k) => (await dbp).get('kv', k);
export const kvSet = async (k, v) => (await dbp).put('kv', v, k);

export async function listOps(campaignId) {
  const db = await dbp;
  return campaignId ? db.getAllFromIndex('ops', 'campaign', campaignId) : db.getAll('ops');
}
export async function countOps() { return (await dbp).count('ops'); }

async function addOp(op) { return (await dbp).add('ops', { ...op, created_at: Date.now() }); }

/** Applique les opérations locales en attente sur la liste de relevés serveur. */
export function applyOps(scans, ops, me) {
  const map = new Map(scans.map((s) => [s.client_uuid, s]));
  for (const op of ops) {
    if (op.type === 'delete') map.delete(op.client_uuid);
    else map.set(op.scan.client_uuid, { ...map.get(op.scan.client_uuid), ...op.scan, user_id: me?.id, user_name: me?.name, pending: true });
  }
  return [...map.values()];
}

/** Charge une campagne : depuis le serveur si possible, sinon depuis le cache local. */
export async function loadCampaign(id, me, { preferCache = false } = {}) {
  let boot = await kvGet(`boot:${id}`);
  let fromCache = true;
  if (!preferCache || !boot) {
    try {
      boot = await api(`/mobile/campaigns/${id}/bootstrap`, { timeout: 60000 });
      await kvSet(`boot:${id}`, boot);
      fromCache = false;
    } catch (e) {
      if (!boot || e.status === 409 || e.status === 404) throw e;
    }
  }
  const ops = await listOps(id);
  return { ...boot, scans: applyOps(boot.scans, ops, me), fromCache };
}

export async function queueUpsert(campaignId, scan) {
  await addOp({ campaign_id: campaignId, type: 'upsert', client_uuid: scan.client_uuid, scan });
}
export async function queueDelete(campaignId, clientUuid) {
  const db = await dbp;
  // Si le relevé n'a jamais été envoyé, on supprime simplement les opérations locales
  const ops = await db.getAllFromIndex('ops', 'campaign', campaignId);
  const local = ops.filter((o) => o.client_uuid === clientUuid);
  const boot = await kvGet(`boot:${campaignId}`);
  const known = boot?.scans?.some((s) => s.client_uuid === clientUuid);
  for (const o of local) await db.delete('ops', o.seq);
  if (known) await addOp({ campaign_id: campaignId, type: 'delete', client_uuid: clientUuid });
}

let syncing = null;

/** Envoie les opérations en attente, par lots. Retourne { sent, failed, stats }. */
export function syncCampaign(campaignId) {
  if (syncing) return syncing;
  syncing = (async () => {
    const db = await dbp;
    const ops = await db.getAllFromIndex('ops', 'campaign', campaignId);
    let sent = 0; let failed = 0; let stats = null;
    for (let i = 0; i < ops.length; i += 15) {
      const batch = ops.slice(i, i + 15);
      const res = await api(`/mobile/campaigns/${campaignId}/sync`, {
        method: 'POST', timeout: 60000,
        body: { ops: batch.map((o) => (o.type === 'delete' ? { type: 'delete', client_uuid: o.client_uuid } : { type: 'upsert', scan: o.scan })) },
      });
      stats = res.stats;
      const okIds = new Set(res.results.filter((r) => r.ok).map((r) => r.client_uuid));
      for (const o of batch) {
        if (okIds.has(o.client_uuid)) { await db.delete('ops', o.seq); sent++; } else failed++;
      }
    }
    return { sent, failed, stats };
  })().finally(() => { syncing = null; });
  return syncing;
}

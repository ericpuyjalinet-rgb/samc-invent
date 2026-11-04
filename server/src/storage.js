/**
 * Stockage des photos :
 *  - Supabase Storage si SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont définis (bucket public, créé automatiquement)
 *  - sinon disque local (dossier uploads, servi sous /uploads/)
 * Retourne une URL absolue (Supabase) ou un nom de fichier local.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from './db.js';

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || 'photos';

let bucketReady = null;
function ensureBucket() {
  bucketReady ??= fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: Object.values(MIME) }),
  }).then(() => true).catch(() => { bucketReady = null; });
  return bucketReady;
}

export async function savePhoto(buffer, ext = 'jpg') {
  ext = String(ext).toLowerCase().replace('jpeg', 'jpg');
  if (!MIME[ext]) ext = 'jpg';
  const name = `${new Date().toISOString().slice(0, 7)}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  if (SUPABASE_URL && SERVICE_KEY) {
    await ensureBucket(); // ignoré si le bucket existe déjà
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': MIME[ext], 'x-upsert': 'false' },
      body: buffer,
    });
    if (!res.ok) throw new Error(`Envoi de la photo vers Supabase Storage impossible (${res.status})`);
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;
  }
  const file = path.join(UPLOAD_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return name;
}

/** Enregistre une image envoyée en data URL (base64). */
export async function saveDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return null;
  return savePhoto(Buffer.from(m[2], 'base64'), m[1]);
}

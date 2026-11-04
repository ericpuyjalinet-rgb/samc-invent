// Assemble les deux applications compilées dans public/ (dossier servi par Vercel)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'admin/dist'), out, { recursive: true });
fs.cpSync(path.join(root, 'mobile/dist'), path.join(out, 'mobile'), { recursive: true });
console.log('public/ prêt : administration sur /, PWA sur /mobile/');

// Applique les migrations SQL (supabase/migrations) sur la base configurée : npm run db:migrate
import { ready, closeDb, DB_KIND } from './db.js';

await ready;
console.log(`[SAMC Invent] Base ${DB_KIND} à jour.`);
await closeDb();

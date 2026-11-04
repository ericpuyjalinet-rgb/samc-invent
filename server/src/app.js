import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { db, ready, UPLOAD_DIR } from './db.js';
import { authenticate, requireRole, MANAGERS } from './auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import refRoutes from './routes/referentials.js';
import assetRoutes from './routes/assets.js';
import campaignRoutes from './routes/campaigns.js';
import mobileRoutes from './routes/mobile.js';
import dashboardRoutes from './routes/dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialisation : schéma + compte administrateur initial
export const init = (async () => {
  await ready;
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  if (n === 0 && process.env.VERCEL && !process.env.ADMIN_PASSWORD) {
    console.error('[SAMC Invent] Base vide : définissez ADMIN_PASSWORD (et ADMIN_EMAIL) dans Vercel pour créer le compte administrateur.');
  } else if (n === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@samc.local';
    const password = process.env.ADMIN_PASSWORD || 'admin1234';
    await db.run(`INSERT INTO users(email, name, password_hash, role) VALUES (?, 'Administrateur', ?, 'admin') ON CONFLICT DO NOTHING`,
      email, bcrypt.hashSync(password, 10));
    console.log(`[SAMC Invent] Compte administrateur créé : ${email}${process.env.ADMIN_PASSWORD ? '' : ' / admin1234'} (mot de passe à changer !)`);
  }
})();

export const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '25mb' })); // les relevés mobiles peuvent contenir des photos
// Attendre l'initialisation de la base avant de servir l'API (démarrage à froid serverless)
app.use('/api', (req, res, next) => { init.then(() => next(), next); });

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'SAMC Invent', time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/mobile', authenticate, mobileRoutes);
app.use('/api/assets', authenticate, assetRoutes);
app.use('/api/campaigns', authenticate, requireRole(...MANAGERS), campaignRoutes);
app.use('/api', authenticate, refRoutes);
app.use('/api', authenticate, dashboardRoutes);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Fichiers statiques des applications compilées
const mobileDist = path.resolve(__dirname, '../../mobile/dist');
const adminDist = path.resolve(__dirname, '../../admin/dist');
if (fs.existsSync(mobileDist)) {
  app.use('/mobile', express.static(mobileDist));
  app.get(/^\/mobile(\/.*)?$/, (req, res) => res.sendFile(path.join(mobileDist, 'index.html')));
}
if (fs.existsSync(adminDist)) {
  app.use(express.static(adminDist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
}

// Gestion des erreurs
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erreur interne du serveur' : err.message });
});

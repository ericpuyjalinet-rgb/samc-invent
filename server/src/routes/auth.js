import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { authenticate, signToken, publicUser } from '../auth.js';
import { h, HttpError } from '../util.js';

const r = Router();

r.post('/login', h(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, 'Email et mot de passe requis');
  const user = await db.get('SELECT * FROM users WHERE lower(email) = lower(?)', String(email).trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) throw new HttpError(401, 'Identifiants incorrects');
  if (!user.active) throw new HttpError(403, 'Ce compte est désactivé');
  res.json({ token: await signToken(user), user: publicUser(user) });
}));

r.get('/me', authenticate, (req, res) => res.json(req.user));

r.post('/password', authenticate, h(async (req, res) => {
  const { current, next } = req.body || {};
  const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(current || '', user.password_hash)) throw new HttpError(400, 'Mot de passe actuel incorrect');
  if (!next || next.length < 8) throw new HttpError(400, 'Le nouveau mot de passe doit contenir au moins 8 caractères');
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
}));

export default r;

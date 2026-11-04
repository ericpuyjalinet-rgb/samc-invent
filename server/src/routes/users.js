import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, tx } from '../db.js';
import { requireRole, publicUser } from '../auth.js';
import { h, HttpError } from '../util.js';

const r = Router();
r.use(requireRole('admin'));

const ROLES = ['admin', 'gestionnaire', 'agent'];
const getUser = async (id) => publicUser(await db.get('SELECT * FROM users WHERE id = ?', id));

r.get('/', h(async (req, res) => {
  res.json((await db.all('SELECT * FROM users ORDER BY name')).map(publicUser));
}));

r.post('/', h(async (req, res) => {
  const { email, name, password, role = 'agent' } = req.body || {};
  if (!email || !name) throw new HttpError(400, 'Nom et email requis');
  if (!password || password.length < 8) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rôle invalide');
  if (await db.get('SELECT 1 AS ok FROM users WHERE lower(email) = lower(?)', email)) throw new HttpError(409, 'Cet email est déjà utilisé');
  const info = await db.run('INSERT INTO users(email, name, password_hash, role) VALUES (?, ?, ?, ?)',
    email.trim(), name.trim(), bcrypt.hashSync(password, 10), role);
  res.status(201).json(await getUser(info.lastInsertRowid));
}));

r.put('/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!u) throw new HttpError(404, 'Utilisateur introuvable');
  const { email = u.email, name = u.name, role = u.role, active = !!u.active, password } = req.body || {};
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rôle invalide');
  if (id === req.user.id && (role !== 'admin' || !active)) throw new HttpError(400, 'Vous ne pouvez pas retirer vos propres droits administrateur');
  if (await db.get('SELECT 1 AS ok FROM users WHERE lower(email) = lower(?) AND id <> ?', email, id)) throw new HttpError(409, 'Cet email est déjà utilisé');
  if (password && password.length < 8) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
  await db.run('UPDATE users SET email = ?, name = ?, role = ?, active = ? WHERE id = ?', email.trim(), name.trim(), role, !!active, id);
  if (password) await db.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(password, 10), id);
  res.json(await getUser(id));
}));

r.delete('/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte');
  await tx(async (t) => {
    await t.run('UPDATE asset_history SET user_id = NULL WHERE user_id = ?', id);
    await t.run('UPDATE scans SET user_id = NULL WHERE user_id = ?', id);
    await t.run('UPDATE campaigns SET created_by = NULL WHERE created_by = ?', id);
    await t.run('DELETE FROM users WHERE id = ?', id);
  });
  res.json({ ok: true });
}));

export default r;

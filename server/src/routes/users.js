import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { requireRole, publicUser } from '../auth.js';
import { h, HttpError } from '../util.js';

const r = Router();
r.use(requireRole('admin'));

const ROLES = ['admin', 'gestionnaire', 'agent'];

r.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY name').all().map(publicUser));
});

r.post('/', h((req, res) => {
  const { email, name, password, role = 'agent' } = req.body || {};
  if (!email || !name) throw new HttpError(400, 'Nom et email requis');
  if (!password || password.length < 8) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rôle invalide');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Cet email est déjà utilisé');
  const info = db.prepare('INSERT INTO users(email, name, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(email.trim(), name.trim(), bcrypt.hashSync(password, 10), role);
  res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
}));

r.put('/:id', h((req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'Utilisateur introuvable');
  const { email = u.email, name = u.name, role = u.role, active = !!u.active, password } = req.body || {};
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rôle invalide');
  if (id === req.user.id && (role !== 'admin' || !active)) {
    throw new HttpError(400, 'Vous ne pouvez pas retirer vos propres droits administrateur');
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(email, id)) throw new HttpError(409, 'Cet email est déjà utilisé');
  db.prepare('UPDATE users SET email = ?, name = ?, role = ?, active = ? WHERE id = ?')
    .run(email.trim(), name.trim(), role, active ? 1 : 0, id);
  if (password) {
    if (password.length < 8) throw new HttpError(400, 'Mot de passe : 8 caractères minimum');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
  }
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
}));

r.delete('/:id', h((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
}));

export default r;

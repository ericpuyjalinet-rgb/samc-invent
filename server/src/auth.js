import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';

let SECRET = process.env.JWT_SECRET || getSetting('jwt_secret');
if (!SECRET) {
  SECRET = crypto.randomBytes(48).toString('hex');
  setSetting('jwt_secret', SECRET);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '30d' });
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, active: !!rest.active };
}

/** Vérifie le jeton JWT et charge l'utilisateur. */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Compte inactif ou inexistant' });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
}

/** Restreint l'accès aux rôles listés. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
};

export const MANAGERS = ['admin', 'gestionnaire'];

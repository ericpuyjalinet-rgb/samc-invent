import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db, ready, getSetting } from './db.js';

let secretPromise = null;
/** Secret JWT : variable JWT_SECRET, sinon généré une fois et stocké en base. */
function getSecret() {
  if (process.env.JWT_SECRET) return Promise.resolve(process.env.JWT_SECRET);
  secretPromise ??= (async () => {
    await ready;
    let s = await getSetting('jwt_secret');
    if (!s) {
      s = crypto.randomBytes(48).toString('hex');
      await db.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT DO NOTHING', 'jwt_secret', s);
      s = await getSetting('jwt_secret'); // en cas de création concurrente
    }
    return s;
  })();
  return secretPromise;
}

export async function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, await getSecret(), { expiresIn: '30d' });
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, active: !!rest.active };
}

/** Vérifie le jeton JWT et charge l'utilisateur. */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  let payload;
  try {
    payload = jwt.verify(token, await getSecret());
  } catch {
    return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', payload.sub);
    if (!user || !user.active) return res.status(401).json({ error: 'Compte inactif ou inexistant' });
    req.user = publicUser(user);
    next();
  } catch (e) { next(e); }
}

/** Restreint l'accès aux rôles listés. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
};

export const MANAGERS = ['admin', 'gestionnaire'];

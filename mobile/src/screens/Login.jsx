import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogged }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      onLogged(token, user);
    } catch (err) {
      setError(err.status === 0 ? 'Connexion internet requise pour la première identification.' : err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="login-form">
        <img src="/mobile/favicon.svg" alt="" className="login-logo" />
        <h1>SAMC Invent</h1>
        <p className="muted">Saisie d'inventaire</p>
        {error && <div className="alert alert-err">{error}</div>}
        <input type="email" placeholder="Adresse email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" inputMode="email" />
        <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  );
}

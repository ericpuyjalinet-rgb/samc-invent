import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card stack" onSubmit={submit}>
        <div className="brand">
          <img src="/favicon.svg" className="brand-logo" alt="" />
          <div>SAMC Invent<small>Espace d'administration</small></div>
        </div>
        {error && <div className="error-box">{error}</div>}
        <label className="field"><span className="field-label">Adresse email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" />
        </label>
        <label className="field"><span className="field-label">Mot de passe</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="muted small" style={{ textAlign: 'center' }}>
          Agent d'inventaire ? Utilisez l'<a href="/mobile/">application mobile</a>.
        </p>
      </form>
    </div>
  );
}

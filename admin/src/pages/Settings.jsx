import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, useToast } from '../components/ui.jsx';

export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => { api('/settings').then(setS); }, []);

  const saveSettings = async (e) => {
    e.preventDefault();
    try { await api('/settings', { method: 'PUT', body: s }); toast('Paramètres enregistrés'); } catch (err) { toast(err.message, 'err'); }
  };
  const changePwd = async (e) => {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) { toast('Les mots de passe ne correspondent pas', 'err'); return; }
    try { await api('/auth/password', { method: 'POST', body: pwd }); toast('Mot de passe modifié'); setPwd({ current: '', next: '', confirm: '' }); }
    catch (err) { toast(err.message, 'err'); }
  };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Paramètres</h1></div></div>
      <div className="grid grid-2">
        {user.role === 'admin' && s && (
          <form className="card card-pad form-grid" onSubmit={saveSettings}>
            <h2 className="span-2">Organisation</h2>
            <Field label="Nom de l'organisation" span={2} hint="Imprimé sur les étiquettes"><input value={s.organization_name} onChange={(e) => setS({ ...s, organization_name: e.target.value })} /></Field>
            <Field label="Préfixe des codes inventaire" hint={`Ex. ${s.code_prefix || 'SAMC'}-000123`}><input value={s.code_prefix} onChange={(e) => setS({ ...s, code_prefix: e.target.value.toUpperCase() })} className="mono" /></Field>
            <Field label="Mention bas d'étiquette"><input value={s.label_footer} onChange={(e) => setS({ ...s, label_footer: e.target.value })} /></Field>
            <div className="span-2"><button className="btn btn-primary">Enregistrer</button></div>
          </form>
        )}
        <form className="card card-pad form-grid" onSubmit={changePwd}>
          <h2 className="span-2">Mon mot de passe</h2>
          <Field label="Mot de passe actuel" span={2}><input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} required autoComplete="current-password" /></Field>
          <Field label="Nouveau mot de passe"><input type="password" minLength={8} value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} required autoComplete="new-password" /></Field>
          <Field label="Confirmation"><input type="password" minLength={8} value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required autoComplete="new-password" /></Field>
          <div className="span-2"><button className="btn btn-primary">Changer le mot de passe</button></div>
        </form>
      </div>
    </div>
  );
}

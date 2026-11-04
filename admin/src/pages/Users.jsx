import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, MapBadge, Spinner, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import CrudModal from '../components/CrudModal.jsx';
import { ROLE, fmtDate } from '../labels.js';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const { data, loading, reload } = useLoad(() => api('/users'));
  const [edit, setEdit] = useState(null);

  const save = async (d) => {
    const body = { ...d };
    if (!body.password) delete body.password;
    await api(edit.id ? `/users/${edit.id}` : '/users', { method: edit.id ? 'PUT' : 'POST', body });
    toast('Utilisateur enregistré'); setEdit(null); reload();
  };
  const remove = async (u) => {
    if (!(await confirm(`Supprimer le compte de ${u.name} ?`, { okLabel: 'Supprimer' }))) return;
    try { await api(`/users/${u.id}`, { method: 'DELETE' }); reload(); } catch (e) { toast(e.message, 'err'); }
  };

  if (loading && !data) return <Spinner />;
  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div><h1>Utilisateurs</h1><div className="sub">Administrateurs, gestionnaires et agents d'inventaire</div></div>
        <button className="btn btn-primary right" onClick={() => setEdit({})}>+ Utilisateur</button>
      </div>
      <div className="info-box small">
        <strong>Administrateur</strong> : accès complet · <strong>Gestionnaire</strong> : parc, référentiels et campagnes · <strong>Agent</strong> : saisie d'inventaire sur l'application mobile uniquement.
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th /></tr></thead>
          <tbody>{data.map((u) => (
            <tr key={u.id}>
              <td className="title">{u.name}{u.id === me.id && <span className="muted small"> (vous)</span>}</td>
              <td>{u.email}</td>
              <td><MapBadge map={ROLE} value={u.role} /></td>
              <td>{u.active ? <span className="badge badge-green">Actif</span> : <span className="badge badge-gray">Désactivé</span>}</td>
              <td className="small muted">{fmtDate(u.created_at)}</td>
              <td className="actions">
                <button className="link-btn small" onClick={() => setEdit(u)}>Modifier</button>{'  '}
                {u.id !== me.id && <button className="link-btn danger small" onClick={() => remove(u)}>Supprimer</button>}
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>
      {edit && (
        <CrudModal title={edit.id ? `Modifier ${edit.name}` : 'Nouvel utilisateur'}
          initial={{ name: edit.name || '', email: edit.email || '', role: edit.role || 'agent', active: edit.id ? edit.active : true, password: '' }}
          onClose={() => setEdit(null)} onSubmit={save}>
          {(d, set) => (<>
            <Field label="Nom complet *"><input value={d.name} onChange={set('name')} required autoFocus /></Field>
            <Field label="Email *"><input type="email" value={d.email} onChange={set('email')} required /></Field>
            <Field label="Rôle">
              <select value={d.role} onChange={set('role')}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </Field>
            <Field label={edit.id ? 'Nouveau mot de passe' : 'Mot de passe *'} hint={edit.id ? 'Laisser vide pour ne pas changer' : '8 caractères minimum'}>
              <input type="password" value={d.password} onChange={set('password')} required={!edit.id} minLength={8} autoComplete="new-password" />
            </Field>
            <label className="check span-2"><input type="checkbox" checked={d.active} onChange={set('active')} /> Compte actif</label>
          </>)}
        </CrudModal>
      )}
    </div>
  );
}

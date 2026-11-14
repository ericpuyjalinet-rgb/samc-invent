import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Field, Spinner, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import { invalidateRefs } from '../components/refs.js';
import CrudModal from '../components/CrudModal.jsx';

export default function Services() {
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const { data, loading, reload } = useLoad(() => api('/services'));
  const [edit, setEdit] = useState(null);

  const refresh = () => { reload(); invalidateRefs(); };
  const save = async (d) => {
    await api(edit.id ? `/services/${edit.id}` : '/services', { method: edit.id ? 'PUT' : 'POST', body: { ...d, parent_id: d.parent_id || null } });
    toast('Service enregistré'); setEdit(null); refresh();
  };
  const remove = async (s) => {
    if (!(await confirm(`Supprimer le service « ${s.name} » ? Ses ${s.asset_count} bien(s) n'auront plus de service.`, { okLabel: 'Supprimer' }))) return;
    await api(`/services/${s.id}`, { method: 'DELETE' }); toast('Service supprimé'); refresh();
  };

  if (loading && !data) return <Spinner />;
  const roots = data.filter((s) => !s.parent_id);
  const rows = roots.flatMap((r) => [r, ...data.filter((s) => s.parent_id === r.id)]);
  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div><h1>Services</h1><div className="sub">Organigramme des services gestionnaires, auxquels les biens sont affectés</div></div>
        <button className="btn btn-primary right" onClick={() => setEdit({})}>+ Service</button>
      </div>
      <div className="card">
        {!rows.length ? <Empty title="Aucun service">Créez vos directions puis leurs services (ex. Direction générale › Ressources humaines).</Empty> : (
          <table>
            <thead><tr><th>Service</th><th>Code</th><th>Responsable</th><th>Biens</th><th /></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id}>
                <td className="title" style={{ paddingLeft: s.parent_id ? 34 : 14 }}>{s.parent_id ? '↳ ' : ''}{s.name}</td>
                <td className="mono">{s.code || '—'}</td><td>{s.manager_name || '—'}</td>
                <td><Link to={`/equipements?service_id=${s.id}`}>{s.asset_count}</Link></td>
                <td className="actions">
                  <button className="link-btn small" onClick={() => setEdit(s)}>Modifier</button>{'  '}
                  <button className="link-btn danger small" onClick={() => remove(s)}>Supprimer</button>
                </td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>
      {edit && (
        <CrudModal title={edit.id ? 'Modifier le service' : 'Nouveau service'}
          initial={{ name: edit.name || '', code: edit.code || '', parent_id: edit.parent_id || '', manager_name: edit.manager_name || '' }}
          onClose={() => setEdit(null)} onSubmit={save}>
          {(d, set) => (<>
            <Field label="Nom *" span={2}><input value={d.name} onChange={set('name')} required autoFocus /></Field>
            <Field label="Code"><input value={d.code} onChange={set('code')} className="mono" placeholder="ST" /></Field>
            <Field label="Rattaché à">
              <select value={d.parent_id} onChange={set('parent_id')}>
                <option value="">— Direction (niveau 1) —</option>
                {roots.filter((r) => r.id !== edit.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Responsable" span={2}><input value={d.manager_name} onChange={set('manager_name')} /></Field>
          </>)}
        </CrudModal>
      )}
    </div>
  );
}

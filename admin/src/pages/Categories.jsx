import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Field, MapBadge, Spinner, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import { invalidateRefs } from '../components/refs.js';
import CrudModal from '../components/CrudModal.jsx';
import { FAMILY } from '../labels.js';

export default function Categories() {
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const { data, loading, reload } = useLoad(() => api('/categories'));
  const [edit, setEdit] = useState(null);

  const refresh = () => { reload(); invalidateRefs(); };
  const remove = async (c) => {
    if (!(await confirm(`Supprimer la catégorie « ${c.name} » ? Les ${c.asset_count} équipement(s) associés deviendront « sans catégorie ».`, { okLabel: 'Supprimer' }))) return;
    await api(`/categories/${c.id}`, { method: 'DELETE' }); toast('Catégorie supprimée'); refresh();
  };
  const save = async (d) => {
    await api(edit.id ? `/categories/${edit.id}` : '/categories', { method: edit.id ? 'PUT' : 'POST', body: d });
    toast('Enregistré'); setEdit(null); refresh();
  };

  if (loading && !data) return <Spinner />;
  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div><h1>Catégories</h1><div className="sub">Typologie des équipements : informatique, mobilier, autre</div></div>
        <button className="btn btn-primary right" onClick={() => setEdit({})}>+ Catégorie</button>
      </div>
      <div className="card">
        {!data.length ? <Empty title="Aucune catégorie" /> : (
          <table>
            <thead><tr><th>Nom</th><th>Famille</th><th>Amortissement</th><th>Équipements</th><th /></tr></thead>
            <tbody>{data.map((c) => (
              <tr key={c.id}>
                <td className="title">{c.name}</td>
                <td><MapBadge map={FAMILY} value={c.family} /></td>
                <td>{c.depreciation_years ? `${c.depreciation_years} ans` : '—'}</td>
                <td><Link to={`/equipements?category_id=${c.id}`}>{c.asset_count}</Link></td>
                <td className="actions">
                  <button className="link-btn small" onClick={() => setEdit(c)}>Modifier</button>{'  '}
                  <button className="link-btn danger small" onClick={() => remove(c)}>Supprimer</button>
                </td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>
      {edit && (
        <CrudModal title={edit.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          initial={{ name: edit.name || '', family: edit.family || 'informatique', depreciation_years: edit.depreciation_years || '' }}
          onClose={() => setEdit(null)} onSubmit={save}>
          {(d, set) => (<>
            <Field label="Nom *" span={2}><input value={d.name} onChange={set('name')} required autoFocus /></Field>
            <Field label="Famille">
              <select value={d.family} onChange={set('family')}>{Object.entries(FAMILY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </Field>
            <Field label="Durée d'amortissement (ans)"><input type="number" min="0" value={d.depreciation_years} onChange={set('depreciation_years')} /></Field>
          </>)}
        </CrudModal>
      )}
    </div>
  );
}

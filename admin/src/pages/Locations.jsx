import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, Field, Spinner, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import { invalidateRefs } from '../components/refs.js';
import CrudModal from '../components/CrudModal.jsx';

export default function Locations() {
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const sites = useLoad(() => api('/sites'));
  const locs = useLoad(() => api('/locations'));
  const [siteEdit, setSiteEdit] = useState(null);
  const [locEdit, setLocEdit] = useState(null);
  const [filter, setFilter] = useState('');

  const refresh = () => { sites.reload(); locs.reload(); invalidateRefs(); };
  const remove = async (kind, item) => {
    if (!(await confirm(`Supprimer ${kind === 'sites' ? 'le site' : 'la salle'} « ${item.name} » ?`, { okLabel: 'Supprimer' }))) return;
    try { await api(`/${kind}/${item.id}`, { method: 'DELETE' }); toast('Supprimé'); refresh(); } catch (e) { toast(e.message, 'err'); }
  };
  const save = (kind, item) => async (d) => {
    await api(item.id ? `/${kind}/${item.id}` : `/${kind}`, { method: item.id ? 'PUT' : 'POST', body: d });
    toast('Enregistré'); setSiteEdit(null); setLocEdit(null); refresh();
  };

  if (sites.loading && !sites.data) return <Spinner />;
  const q = filter.toLowerCase();

  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div><h1>Sites & salles</h1><div className="sub">Organisation physique : site › bâtiment › étage › salle</div></div>
        <div className="right row gap-s">
          <Link className="btn" to="/etiquettes?mode=locations">▦ Étiquettes de salles</Link>
          <button className="btn" onClick={() => setSiteEdit({})}>+ Site</button>
          <button className="btn btn-primary" onClick={() => setLocEdit({ site_id: sites.data[0]?.id })} disabled={!sites.data.length}>+ Salle</button>
        </div>
      </div>

      {!sites.data.length && <div className="card"><Empty title="Aucun site">Commencez par créer un site (ex. « Siège »), puis ses salles.</Empty></div>}

      <input type="search" placeholder="Filtrer les salles…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 320 }} />

      {sites.data.map((s) => {
        const rows = (locs.data || []).filter((l) => l.site_id === s.id &&
          (!q || [l.name, l.code, l.building, l.floor].some((v) => v?.toLowerCase().includes(q))));
        return (
          <div className="card" key={s.id}>
            <div className="card-head">
              <div><h2>{s.name}</h2><div className="small muted">{s.address || 'Adresse non renseignée'} · {s.location_count} salle(s) · {s.asset_count} équipement(s)</div></div>
              <div className="right row gap-s">
                <button className="btn btn-sm" onClick={() => setLocEdit({ site_id: s.id })}>+ Salle</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setSiteEdit(s)}>Modifier</button>
                <button className="link-btn danger small" onClick={() => remove('sites', s)}>Supprimer</button>
              </div>
            </div>
            {rows.length ? (
              <table>
                <thead><tr><th>Code</th><th>Bâtiment</th><th>Étage</th><th>Salle</th><th>Équipements</th><th /></tr></thead>
                <tbody>{rows.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.code || <span className="muted">—</span>}</td>
                    <td>{l.building || '—'}</td><td>{l.floor || '—'}</td><td className="title">{l.name}</td>
                    <td><Link to={`/equipements?location_id=${l.id}`}>{l.asset_count}</Link></td>
                    <td className="actions">
                      <button className="link-btn small" onClick={() => setLocEdit(l)}>Modifier</button>{'  '}
                      <button className="link-btn danger small" onClick={() => remove('locations', l)}>Supprimer</button>
                    </td>
                  </tr>))}
                </tbody>
              </table>
            ) : <Empty title="Aucune salle" />}
          </div>
        );
      })}

      {siteEdit && (
        <CrudModal title={siteEdit.id ? 'Modifier le site' : 'Nouveau site'} initial={{ name: siteEdit.name || '', address: siteEdit.address || '' }}
          onClose={() => setSiteEdit(null)} onSubmit={save('sites', siteEdit)}>
          {(d, set) => (<>
            <Field label="Nom *" span={2}><input value={d.name} onChange={set('name')} required autoFocus /></Field>
            <Field label="Adresse" span={2}><textarea value={d.address} onChange={set('address')} /></Field>
          </>)}
        </CrudModal>
      )}
      {locEdit && (
        <CrudModal title={locEdit.id ? 'Modifier la salle' : 'Nouvelle salle'}
          initial={{ site_id: locEdit.site_id || '', code: locEdit.code || '', building: locEdit.building || '', floor: locEdit.floor || '', name: locEdit.name || '' }}
          onClose={() => setLocEdit(null)} onSubmit={save('locations', locEdit)}>
          {(d, set) => (<>
            <Field label="Site *" span={2}>
              <select value={d.site_id} onChange={set('site_id')} required>{sites.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </Field>
            <Field label="Bâtiment"><input value={d.building} onChange={set('building')} /></Field>
            <Field label="Étage"><input value={d.floor} onChange={set('floor')} placeholder="RDC, 1, 2…" /></Field>
            <Field label="Nom de la salle *"><input value={d.name} onChange={set('name')} required autoFocus /></Field>
            <Field label="Code salle" hint="Imprimé en QR à l'entrée de la salle"><input value={d.code} onChange={set('code')} className="mono" placeholder="LOC-A1-101" /></Field>
          </>)}
        </CrudModal>
      )}
    </div>
  );
}

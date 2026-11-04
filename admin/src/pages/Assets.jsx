import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, download, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, MapBadge, Pagination, Spinner, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import { useRefs } from '../components/refs.js';
import LocationSelect from '../components/LocationSelect.jsx';
import AssetForm from '../components/AssetForm.jsx';
import { STATUS, CONDITION, FAMILY, locLabel, fmtDate } from '../labels.js';

const FILTER_KEYS = ['q', 'family', 'category_id', 'site_id', 'location_id', 'status', 'condition'];

export default function Assets() {
  const { user } = useAuth();
  const { categories, sites } = useRefs();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const [search, setSearch] = useState(filters.q);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'updated_at', dir: 'desc' });
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(params.get('new') ? {} : null);
  const [bulk, setBulk] = useState({ action: '', value: '' });

  const key = JSON.stringify([filters, page, sort]);
  const { data, loading, error, reload } = useLoad(
    () => api(`/assets${qs({ ...filters, page, limit: 50, sort: sort.key, dir: sort.dir })}`), [key]);

  // recherche différée
  useEffect(() => {
    const t = setTimeout(() => { if (search !== filters.q) setFilter('q', search); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setFilter(k, v) {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    if (k === 'site_id') p.delete('location_id');
    if (k === 'family') p.delete('category_id');
    p.delete('new');
    setParams(p, { replace: true });
    setPage(1);
  }

  const toggleSort = (k) => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }));
  const Th = ({ k, children }) => (
    <th className="sortable" onClick={() => toggleSort(k)}>{children}{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
  );
  const items = data?.items || [];
  const allChecked = items.length > 0 && items.every((a) => selected.has(a.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    items.forEach((a) => (allChecked ? n.delete(a.id) : n.add(a.id)));
    return n;
  });

  const runBulk = async () => {
    const ids = [...selected];
    if (bulk.action === 'labels') { navigate(`/etiquettes?ids=${ids.join(',')}`); return; }
    if (bulk.action === 'delete' && !(await confirm(`Supprimer définitivement ${ids.length} équipement(s) ?`, { okLabel: 'Supprimer' }))) return;
    try {
      await api('/assets/bulk', { method: 'POST', body: { ids, action: bulk.action, value: bulk.value || null } });
      toast(`${ids.length} équipement(s) mis à jour`);
      setSelected(new Set()); setBulk({ action: '', value: '' }); reload();
    } catch (e) { toast(e.message, 'err'); }
  };

  const exportCsv = () => download(`/assets/export.csv${qs(filters)}`, `samc-invent-equipements.csv`).catch((e) => toast(e.message, 'err'));
  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div><h1>Équipements</h1><div className="sub">Matériel informatique, mobilier de bureau et autres biens</div></div>
        <div className="right row gap-s">
          <button className="btn" onClick={exportCsv}>⇩ Exporter CSV</button>
          <button className="btn btn-primary" onClick={() => setEditing({})}>+ Nouvel équipement</button>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <input type="search" placeholder="Rechercher : code, désignation, marque, n° de série, affectation…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filters.family} onChange={(e) => setFilter('family', e.target.value)}>
            <option value="">Toutes familles</option>
            {Object.entries(FAMILY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.category_id} onChange={(e) => setFilter('category_id', e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.filter((c) => !filters.family || c.family === filters.family).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filters.site_id} onChange={(e) => setFilter('site_id', e.target.value)}>
            <option value="">Tous sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <LocationSelect value={filters.location_id ? Number(filters.location_id) : null} siteId={filters.site_id}
            onChange={(v) => setFilter('location_id', v)} emptyLabel="Toutes salles" />
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.condition} onChange={(e) => setFilter('condition', e.target.value)}>
            <option value="">Tous états</option>
            {Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {hasFilters && <button className="btn btn-ghost" onClick={() => { setSearch(''); setParams({}); }}>Réinitialiser</button>}
        </div>

        {selected.size > 0 && (
          <div className="bulkbar">
            <strong>{selected.size} sélectionné(s)</strong>
            <select value={bulk.action} onChange={(e) => setBulk({ action: e.target.value, value: '' })}>
              <option value="">Action groupée…</option>
              <option value="labels">Imprimer les étiquettes QR</option>
              <option value="move">Déplacer vers…</option>
              <option value="status">Changer le statut…</option>
              <option value="condition">Changer l'état…</option>
              <option value="category">Changer la catégorie…</option>
              {user.role === 'admin' && <option value="delete">Supprimer</option>}
            </select>
            {bulk.action === 'move' && <LocationSelect value={bulk.value || null} onChange={(v) => setBulk((b) => ({ ...b, value: v }))} style={{ width: 'auto' }} />}
            {bulk.action === 'status' && (
              <select value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}>
                <option value="">Choisir…</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>)}
            {bulk.action === 'condition' && (
              <select value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}>
                <option value="">Choisir…</option>{Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>)}
            {bulk.action === 'category' && (
              <select value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}>
                <option value="">Choisir…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>)}
            <button className="btn btn-primary btn-sm" onClick={runBulk}
              disabled={!bulk.action || (['status', 'condition', 'category'].includes(bulk.action) && !bulk.value)}>Appliquer</button>
            <button className="btn btn-ghost btn-sm right" onClick={() => setSelected(new Set())}>Désélectionner</button>
          </div>
        )}

        {error && <div className="error-box" style={{ margin: 16 }}>{error}</div>}
        {loading && !data ? <Spinner /> : items.length === 0 ? (
          <Empty title="Aucun équipement">{hasFilters ? 'Aucun résultat pour ces filtres.' : 'Ajoutez un équipement ou importez un fichier CSV.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width: 32 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Tout sélectionner" /></th>
                <Th k="code">Code</Th><Th k="label">Désignation</Th><Th k="category">Catégorie</Th><Th k="location">Localisation</Th>
                <Th k="status">Statut</Th><Th k="condition">État</Th><Th k="last_seen_at">Dernier inventaire</Th>
              </tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className={`clickable ${selected.has(a.id) ? 'selected' : ''}`} onClick={() => navigate(`/equipements/${a.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} /></td>
                    <td className="mono nowrap">{a.code}</td>
                    <td><div className="title">{a.label}</div><div className="small muted">{[a.brand, a.model, a.serial_number && `S/N ${a.serial_number}`].filter(Boolean).join(' · ')}</div></td>
                    <td>{a.category_name || <span className="muted">—</span>}{a.family && <div className="small muted">{FAMILY[a.family]?.label}</div>}</td>
                    <td className="small">{locLabel(a)}{a.assigned_to && <div className="muted">👤 {a.assigned_to}</div>}</td>
                    <td><MapBadge map={STATUS} value={a.status} /></td>
                    <td><MapBadge map={CONDITION} value={a.condition} /></td>
                    <td className="small muted nowrap">{a.last_seen_at ? fmtDate(a.last_seen_at) : 'Jamais'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} total={data.total} limit={data.limit} onChange={setPage} />}
      </div>

      {editing && (
        <AssetForm asset={editing} onClose={() => setEditing(null)}
          onSaved={(a) => { setEditing(null); navigate(`/equipements/${a.id}`); }} />
      )}
    </div>
  );
}

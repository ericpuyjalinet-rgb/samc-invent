import { useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, useToast } from './ui.jsx';
import { useRefs } from './refs.js';

export default function CampaignForm({ campaign, onClose, onSaved }) {
  const { sites, locations } = useRefs();
  const toast = useToast();
  const [d, setD] = useState({
    name: campaign?.name || '', description: campaign?.description || '',
    start_date: campaign?.start_date || '', end_date: campaign?.end_date || '',
  });
  const [scope, setScope] = useState(new Set(campaign?.location_ids || []));
  const [error, setError] = useState('');
  const editableScope = !campaign?.id || campaign.status === 'brouillon';
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));

  const toggle = (ids, on) => setScope((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...d, location_ids: [...scope] };
      const saved = campaign?.id ? await api(`/campaigns/${campaign.id}`, { method: 'PUT', body }) : await api('/campaigns', { method: 'POST', body });
      toast(campaign?.id ? 'Campagne mise à jour' : 'Campagne créée');
      onSaved(saved);
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal wide title={campaign?.id ? 'Modifier la campagne' : "Nouvelle campagne d'inventaire"} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" form="campaign-form">Enregistrer</button>
    </>}>
      <form id="campaign-form" className="form-grid" onSubmit={submit}>
        {error && <div className="error-box span-2">{error}</div>}
        <Field label="Nom *" span={2}><input value={d.name} onChange={set('name')} required autoFocus placeholder="ex. Inventaire annuel 2026 — Siège" /></Field>
        <Field label="Date de début"><input type="date" value={d.start_date} onChange={set('start_date')} /></Field>
        <Field label="Date de fin prévue"><input type="date" value={d.end_date} onChange={set('end_date')} /></Field>
        <Field label="Consignes pour les agents" span={2}><textarea value={d.description} onChange={set('description')} /></Field>
        <div className="form-section">Périmètre</div>
        <div className="span-2">
          {!editableScope ? <div className="info-box">Le périmètre ne peut plus être modifié une fois la campagne lancée.</div> : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>Cochez les salles à inventorier. <strong>Si aucune salle n'est cochée, la campagne porte sur l'ensemble des localisations.</strong></p>
              <div className="grid grid-2">
                {sites.map((s) => {
                  const locs = locations.filter((l) => l.site_id === s.id);
                  const all = locs.length > 0 && locs.every((l) => scope.has(l.id));
                  return (
                    <div key={s.id} className="card card-pad" style={{ boxShadow: 'none' }}>
                      <label className="check" style={{ fontWeight: 600 }}>
                        <input type="checkbox" checked={all} onChange={(e) => toggle(locs.map((l) => l.id), e.target.checked)} />
                        {s.name} <span className="muted small">({locs.length} salles)</span>
                      </label>
                      <div style={{ paddingLeft: 22, marginTop: 6, display: 'grid', gap: 4 }}>
                        {locs.map((l) => (
                          <label key={l.id} className="check small">
                            <input type="checkbox" checked={scope.has(l.id)} onChange={(e) => toggle([l.id], e.target.checked)} />
                            {[l.building && `Bât. ${l.building}`, l.floor && `Ét. ${l.floor}`, l.name].filter(Boolean).join(' › ')}
                            <span className="muted">· {l.asset_count} éq.</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

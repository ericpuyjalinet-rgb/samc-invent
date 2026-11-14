import { useState } from 'react';
import { api } from '../api.js';
import { Field, Modal, useToast } from './ui.jsx';
import { DISPOSAL_REASON } from '../labels.js';

/** Proposer un ou plusieurs biens à la sortie d'inventaire. */
export default function DisposalProposeDialog({ assetIds, onClose, onDone }) {
  const toast = useToast();
  const [d, setD] = useState({ reason: 'obsolescence', reason_details: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/disposals', { method: 'POST', body: { asset_ids: assetIds, ...d } });
      toast(`${r.created} bien(s) proposé(s) à la sortie${r.skipped.length ? ` · ${r.skipped.length} ignoré(s)` : ''}`);
      onDone?.(r);
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title="Proposer à la sortie d'inventaire" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" form="disposal-form">Proposer</button>
    </>}>
      <form id="disposal-form" className="form-grid" onSubmit={submit}>
        {error && <div className="error-box span-2">{error}</div>}
        <p className="span-2" style={{ margin: 0 }}>
          {assetIds.length} bien(s). La sortie ne sera effective qu'après validation par un administrateur, au vu d'une décision
          (certificat administratif, décision ou délibération).
        </p>
        <Field label="Motif" span={2}>
          <select value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })}>
            {Object.entries(DISPOSAL_REASON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Précisions" span={2} hint="Constat, n° de dépôt de plainte en cas de vol, état du bien…">
          <textarea value={d.reason_details} onChange={(e) => setD({ ...d, reason_details: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

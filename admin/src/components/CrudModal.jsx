import { useState } from 'react';
import { Modal } from './ui.jsx';

/** Modale générique d'édition : children(d, set) rend les champs. */
export default function CrudModal({ title, initial, onClose, onSubmit, children }) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await onSubmit(d); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" form="crud-form" disabled={busy}>Enregistrer</button>
    </>}>
      <form id="crud-form" className="form-grid" onSubmit={submit}>
        {error && <div className="error-box span-2">{error}</div>}
        {children(d, set)}
      </form>
    </Modal>
  );
}

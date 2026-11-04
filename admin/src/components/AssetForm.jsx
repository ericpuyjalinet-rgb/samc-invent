import { useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, useToast } from './ui.jsx';
import { useRefs } from './refs.js';
import LocationSelect from './LocationSelect.jsx';
import { STATUS, CONDITION, FAMILY } from '../labels.js';

const EMPTY = { code: '', label: '', category_id: '', brand: '', model: '', serial_number: '', location_id: null, assigned_to: '',
  status: 'en_service', condition: 'bon', purchase_date: '', purchase_price: '', supplier: '', warranty_end: '', notes: '' };

export default function AssetForm({ asset, onClose, onSaved }) {
  const { categories } = useRefs();
  const toast = useToast();
  const [d, setD] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(asset || {}).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])) }));
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { ...d, location_id: d.location_id || null };
      let saved = asset?.id
        ? await api(`/assets/${asset.id}`, { method: 'PUT', body })
        : await api('/assets', { method: 'POST', body });
      if (photo) {
        const form = new FormData();
        form.append('photo', photo);
        saved = await api(`/assets/${saved.id}/photo`, { method: 'POST', form });
      }
      toast(asset?.id ? 'Équipement mis à jour' : `Équipement ${saved.code} créé`);
      onSaved?.(saved);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const families = Object.keys(FAMILY);
  return (
    <Modal wide title={asset?.id ? `Modifier ${asset.code}` : 'Nouvel équipement'} onClose={onClose} footer={<>
      <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" form="asset-form" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </>}>
      <form id="asset-form" className="form-grid" onSubmit={submit}>
        {error && <div className="error-box span-2">{error}</div>}
        <div className="form-section">Identification</div>
        <Field label="Désignation *" span={2}><input value={d.label} onChange={set('label')} required autoFocus placeholder="ex. PC portable Dell Latitude 5440" /></Field>
        <Field label="Code inventaire" hint="Laisser vide pour générer automatiquement (étiquette QR)"><input value={d.code} onChange={set('code')} className="mono" /></Field>
        <Field label="Catégorie">
          <select value={d.category_id ?? ''} onChange={set('category_id')}>
            <option value="">— Aucune —</option>
            {families.map((f) => (
              <optgroup key={f} label={FAMILY[f].label}>
                {categories.filter((c) => c.family === f).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Marque"><input value={d.brand} onChange={set('brand')} /></Field>
        <Field label="Modèle"><input value={d.model} onChange={set('model')} /></Field>
        <Field label="N° de série" span={2}><input value={d.serial_number} onChange={set('serial_number')} className="mono" /></Field>

        <div className="form-section">Localisation & affectation</div>
        <Field label="Localisation"><LocationSelect value={d.location_id} onChange={set('location_id')} /></Field>
        <Field label="Affecté à"><input value={d.assigned_to} onChange={set('assigned_to')} placeholder="Nom de l'utilisateur ou service" /></Field>
        <Field label="Statut">
          <select value={d.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Field>
        <Field label="État">
          <select value={d.condition} onChange={set('condition')}>{Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Field>

        <div className="form-section">Acquisition</div>
        <Field label="Date d'achat"><input type="date" value={d.purchase_date} onChange={set('purchase_date')} /></Field>
        <Field label="Prix d'achat HT (€)"><input inputMode="decimal" value={d.purchase_price} onChange={set('purchase_price')} /></Field>
        <Field label="Fournisseur"><input value={d.supplier} onChange={set('supplier')} /></Field>
        <Field label="Fin de garantie"><input type="date" value={d.warranty_end} onChange={set('warranty_end')} /></Field>

        <div className="form-section">Compléments</div>
        <Field label="Photo" span={2}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files[0] || null)} /></Field>
        <Field label="Notes" span={2}><textarea value={d.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

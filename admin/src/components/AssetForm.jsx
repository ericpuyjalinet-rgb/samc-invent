import { useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, useToast } from './ui.jsx';
import { useRefs } from './refs.js';
import LocationSelect from './LocationSelect.jsx';
import ServiceSelect from './ServiceSelect.jsx';
import { STATUS, CONDITION, FAMILY, ACQUISITION_MODE, M57_ACCOUNTS } from '../labels.js';

const EMPTY = { code: '', label: '', category_id: '', brand: '', model: '', serial_number: '', location_id: null, assigned_to: '',
  status: 'en_service', condition: 'bon', purchase_date: '', purchase_price: '', supplier: '', warranty_end: '', notes: '',
  service_id: null, inventory_number: '', account_code: '', acquisition_mode: 'achat', fiscal_year: '', mandate_number: '',
  invoice_number: '', contract_number: '', depreciation_years: '', commissioning_date: '' };

export default function AssetForm({ asset, onClose, onSaved }) {
  const { categories } = useRefs();
  const toast = useToast();
  const [d, setD] = useState(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(asset || {}).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])) }));
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const selectedCat = categories.find((c) => c.id === Number(d.category_id));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { ...d, location_id: d.location_id || null, service_id: d.service_id || null };
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
        <Field label="Service gestionnaire"><ServiceSelect value={d.service_id} onChange={set('service_id')} /></Field>
        <Field label="Statut">
          <select value={d.status} onChange={set('status')}>
            {Object.entries(STATUS).filter(([k]) => k !== 'sorti').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="État">
          <select value={d.condition} onChange={set('condition')}>{Object.entries(CONDITION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Field>

        <div className="form-section">Acquisition</div>
        <Field label="Mode d'acquisition">
          <select value={d.acquisition_mode} onChange={set('acquisition_mode')}>{Object.entries(ACQUISITION_MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Date d'acquisition"><input type="date" value={d.purchase_date} onChange={set('purchase_date')} /></Field>
        <Field label="Valeur d'acquisition TTC (€)" hint="Valeur inscrite à l'inventaire comptable (estimée pour un don)"><input inputMode="decimal" value={d.purchase_price} onChange={set('purchase_price')} /></Field>
        <Field label="Fournisseur / titulaire"><input value={d.supplier} onChange={set('supplier')} /></Field>
        <Field label="Marché public" hint="N° ou intitulé : MAPA, appel d'offres, UGAP…"><input value={d.contract_number} onChange={set('contract_number')} /></Field>
        <Field label="Fin de garantie"><input type="date" value={d.warranty_end} onChange={set('warranty_end')} /></Field>

        <div className="form-section">Comptabilité publique (M57)</div>
        <Field label="N° d'inventaire comptable" hint="Numéro de l'état de l'actif, partagé avec le comptable public"><input value={d.inventory_number} onChange={set('inventory_number')} className="mono" placeholder="2026-0001" /></Field>
        <Field label="Compte d'imputation" hint={selectedCat?.account_code ? `Vide = compte de la catégorie (${selectedCat.account_code})` : 'Nomenclature M57'}>
          <input list="m57-accounts" value={d.account_code} onChange={set('account_code')} className="mono" placeholder={selectedCat?.account_code || '2183'} />
          <datalist id="m57-accounts">{Object.entries(M57_ACCOUNTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</datalist>
        </Field>
        <Field label="Exercice d'acquisition" hint="Vide = année de la date d'acquisition"><input type="number" min="1950" max="2100" value={d.fiscal_year} onChange={set('fiscal_year')} /></Field>
        <Field label="N° de mandat"><input value={d.mandate_number} onChange={set('mandate_number')} className="mono" /></Field>
        <Field label="N° de facture"><input value={d.invoice_number} onChange={set('invoice_number')} /></Field>
        <Field label="Date de mise en service" hint="Début de l'amortissement (vide = date d'acquisition)"><input type="date" value={d.commissioning_date} onChange={set('commissioning_date')} /></Field>
        <Field label="Durée d'amortissement (ans)" hint={selectedCat?.depreciation_years ? `Vide = durée de la catégorie (${selectedCat.depreciation_years} ans)` : 'Selon la délibération'}><input type="number" min="1" max="100" value={d.depreciation_years} onChange={set('depreciation_years')} /></Field>

        <div className="form-section">Compléments</div>
        <Field label="Photo" span={2}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files[0] || null)} /></Field>
        <Field label="Notes" span={2}><textarea value={d.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

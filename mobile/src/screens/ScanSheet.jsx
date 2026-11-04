import { useState } from 'react';
import { CONDITIONS, compressImage, fmtTime, fullRoomLabel } from '../util.js';
import { expectedLocationOf } from '../campaign.js';

export default function ScanSheet({ draft, idx, room, categories, onCancel, onSave, onDelete }) {
  const [scan, setScan] = useState(draft.scan);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const a = draft.asset;
  const set = (k, v) => setScan((s) => ({ ...s, [k]: v }));
  const unknown = !a;
  const expectedLoc = a ? idx.locById.get(expectedLocationOf(a)) : null;

  const onPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await compressImage(f);
    setPhotoPreview(data);
    set('photo', data);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (unknown && !scan.unknown_label?.trim()) return;
    setBusy(true);
    try { await onSave(scan); } finally { setBusy(false); }
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-grip" />
        {scan.result === 'trouve' && <div className="result result-ok">✓ Attendu dans cette salle</div>}
        {scan.result === 'deplace' && (
          <div className="result result-warn">⚠ {a?.expected ? 'Équipement déplacé' : 'Hors périmètre de la campagne'}
            <div className="small">Localisation enregistrée : {fullRoomLabel(expectedLoc)}</div>
          </div>
        )}
        {unknown && <div className="result result-unknown">? Code non référencé<div className="small mono">{scan.scanned_code || 'sans étiquette'}</div></div>}

        {a && (
          <div className="asset-card">
            <div className="mono small">{a.code}</div>
            <div className="asset-title">{a.label}</div>
            <div className="small muted">{[a.category_name, [a.brand, a.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</div>
            {a.serial_number && <div className="small">S/N <span className="mono">{a.serial_number}</span></div>}
            {a.assigned_to && <div className="small">👤 {a.assigned_to}</div>}
          </div>
        )}

        {draft.previous && (
          <div className="alert alert-info small">
            Déjà relevé dans « {fullRoomLabel(idx.locById.get(draft.previous.location_id))} » par {draft.previous.user_name || '—'} le {fmtTime(draft.previous.scanned_at)}.
            Ce nouveau relevé dans « {room?.name} » le remplacera.
          </div>
        )}

        {unknown && (
          <>
            <label className="lbl">Description de l'équipement *</label>
            <input value={scan.unknown_label || ''} onChange={(e) => set('unknown_label', e.target.value)} placeholder="ex. Chaise visiteur noire" required autoFocus />
            <label className="lbl">Catégorie</label>
            <select value={scan.unknown_category_id || ''} onChange={(e) => set('unknown_category_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Non précisée —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}

        <label className="lbl">État constaté</label>
        <div className="chips">
          {CONDITIONS.map((c) => (
            <button type="button" key={c.key} className={`chip ${scan.condition === c.key ? 'active' : ''} chip-${c.key}`} onClick={() => set('condition', c.key)}>{c.label}</button>
          ))}
        </div>

        <label className="lbl">Commentaire</label>
        <textarea value={scan.comment || ''} onChange={(e) => set('comment', e.target.value)} placeholder="Étiquette abîmée, rayure, utilisateur différent…" rows={2} />

        <label className="photo-btn">
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
          {photoPreview ? <img src={photoPreview} alt="Aperçu" /> : <span>📷 Ajouter une photo</span>}
        </label>

        <div className="sheet-actions">
          {draft.editing && draft.canDelete && <button type="button" className="btn btn-danger-ghost" onClick={onDelete}>Supprimer</button>}
          <button type="button" className="btn grow" onClick={onCancel}>Annuler</button>
          <button className="btn btn-primary grow" disabled={busy || (unknown && !scan.unknown_label?.trim())}>Enregistrer</button>
        </div>
      </form>
    </div>
  );
}

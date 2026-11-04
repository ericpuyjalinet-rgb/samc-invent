import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Header } from '../components.jsx';
import Scanner from '../Scanner.jsx';
import { buildIndex, resolveCode } from '../campaign.js';
import { conditionLabel, feedback, fullRoomLabel } from '../util.js';

const STATUS = { en_service: 'En service', en_stock: 'En stock', en_reparation: 'En réparation', reforme: 'Réformé', perdu: 'Perdu' };

export default function Lookup({ bundle, onBack }) {
  const idx = useMemo(() => (bundle ? buildIndex(bundle) : null), [bundle]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async (code) => {
    setError(''); setLoading(true);
    try {
      try {
        const a = await api(`/assets/by-code/${encodeURIComponent(code)}`, { timeout: 8000 });
        setResult({ ...a, locLabel: a.location_name ? `${a.site_name} › ${a.location_name}` : 'Non localisé', online: true });
        feedback('ok');
      } catch (e) {
        if (e.status === 404) throw e;
        // Hors-ligne : recherche dans les données de la campagne en cache
        const r = idx && resolveCode(idx, code);
        if (r?.type !== 'asset') throw new Error(idx ? 'Équipement introuvable dans les données hors-ligne' : 'Hors-ligne : ouvrez une campagne pour consulter les données en cache');
        setResult({ ...r.asset, locLabel: fullRoomLabel(idx.locById.get(r.asset.location_id)), online: false });
        feedback('ok');
      }
    } catch (e) { setError(e.message); setResult(null); feedback('err'); } finally { setLoading(false); }
  };

  return (
    <div className="screen">
      <Header title="Consulter un équipement" onBack={onBack} />
      <main className="content">
        {!result && <Scanner onDetect={lookup} paused={loading} />}
        <form className="row gap manual" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) lookup(manual.trim()); }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Code inventaire ou n° de série" />
          <button className="btn">Chercher</button>
        </form>
        {error && <div className="alert alert-err">{error}</div>}
        {result && (
          <div className="card">
            <div className="mono small">{result.code}</div>
            <div className="asset-title">{result.label}</div>
            <dl className="dl">
              <dt>Catégorie</dt><dd>{result.category_name || '—'}</dd>
              <dt>Marque / modèle</dt><dd>{[result.brand, result.model].filter(Boolean).join(' ') || '—'}</dd>
              <dt>N° de série</dt><dd className="mono">{result.serial_number || '—'}</dd>
              <dt>Localisation</dt><dd>{result.locLabel}</dd>
              <dt>Affecté à</dt><dd>{result.assigned_to || '—'}</dd>
              <dt>Statut</dt><dd>{STATUS[result.status] || '—'}</dd>
              <dt>État</dt><dd>{conditionLabel(result.condition)}</dd>
            </dl>
            {!result.online && <p className="small muted">Données hors-ligne</p>}
            <button className="btn btn-primary btn-block" onClick={() => { setResult(null); setManual(''); }}>Scanner un autre équipement</button>
          </div>
        )}
      </main>
    </div>
  );
}

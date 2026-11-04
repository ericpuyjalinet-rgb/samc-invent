import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Empty, MapBadge, Progress, Spinner, useLoad } from '../components/ui.jsx';
import CampaignForm from '../components/CampaignForm.jsx';
import { CAMPAIGN_STATUS, fmtDate } from '../labels.js';

export default function Campaigns() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, loading, error } = useLoad(() => api('/campaigns'));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Campagnes d'inventaire</h1><div className="sub">Planifiez, suivez et clôturez les inventaires physiques</div></div>
        <button className="btn btn-primary right" onClick={() => setCreating(true)}>+ Nouvelle campagne</button>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="card">
        {loading ? <Spinner /> : !data.length ? (
          <Empty title="Aucune campagne">Créez une première campagne pour lancer l'inventaire avec l'application mobile.</Empty>
        ) : (
          <table>
            <thead><tr><th>Campagne</th><th>Statut</th><th>Période</th><th>Périmètre</th><th style={{ width: 220 }}>Avancement</th><th>Écarts</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/campagnes/${c.id}`)}>
                  <td><Link to={`/campagnes/${c.id}`} className="title">{c.name}</Link><div className="small muted">par {c.created_by_name || '—'}</div></td>
                  <td><MapBadge map={CAMPAIGN_STATUS} value={c.status} /></td>
                  <td className="small">{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</td>
                  <td className="small">{c.location_count ? `${c.location_count} salle(s)` : 'Toutes les salles'}<div className="muted">{c.stats.expected} équipements attendus</div></td>
                  <td><Progress value={c.stats.progress} tone={c.status === 'cloturee' ? 'green' : 'blue'} /><div className="small muted" style={{ marginTop: 4 }}>{c.stats.progress}% · {c.stats.found + c.stats.moved}/{c.stats.expected}</div></td>
                  <td className="small">
                    {c.stats.moved > 0 && <span className="badge badge-amber">{c.stats.moved} déplacé(s)</span>}{' '}
                    {c.status !== 'brouillon' && c.stats.missing > 0 && <span className="badge badge-red">{c.stats.missing} manquant(s)</span>}{' '}
                    {c.stats.unknown > 0 && <span className="badge badge-violet">{c.stats.unknown} inconnu(s)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && <CampaignForm onClose={() => setCreating(false)} onSaved={(c) => navigate(`/campagnes/${c.id}`)} />}
    </div>
  );
}

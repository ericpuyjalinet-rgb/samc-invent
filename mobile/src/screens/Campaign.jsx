import { useMemo, useState } from 'react';
import { Header, ProgressBar, SyncPill } from '../components.jsx';
import Scanner from '../Scanner.jsx';
import { buildIndex, globalStats, resolveCode, roomStats } from '../campaign.js';
import { feedback, roomLabel } from '../util.js';

export default function CampaignScreen({ bundle, online, pending, sync, onSync, onBack, onOpenRoom, onLookup, notify }) {
  const idx = useMemo(() => buildIndex(bundle), [bundle]);
  const g = globalStats(idx);
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const rooms = bundle.locations
    .filter((l) => (showAll || l.in_scope))
    .filter((l) => !q || [l.name, l.code, l.site_name, l.building, l.floor].some((v) => v?.toLowerCase().includes(q.toLowerCase())));
  const sites = [...new Set(rooms.map((r) => r.site_name))];

  const onDetect = (code) => {
    const r = resolveCode(idx, code);
    if (r.type === 'location') { feedback('ok'); setScan(false); onOpenRoom(r.location.id); }
    else { feedback('err'); notify(r.type === 'asset' ? "C'est une étiquette d'équipement : choisissez d'abord la salle" : `Code salle inconnu : ${code}`, 'warn'); }
  };

  return (
    <div className="screen">
      <Header title={bundle.campaign.name} subtitle={`${g.checked}/${g.expected} vérifiés · ${g.progress}%`} onBack={onBack}
        right={<SyncPill online={online} pending={pending} sync={sync} onSync={onSync} />} />
      <main className="content">
        <ProgressBar value={g.progress} />
        {bundle.campaign.description && <div className="alert alert-info small" style={{ marginTop: 12 }}>{bundle.campaign.description}</div>}

        {scan ? (
          <div style={{ marginTop: 12 }}><Scanner onDetect={onDetect} onClose={() => setScan(false)} /></div>
        ) : (
          <div className="row gap" style={{ marginTop: 12 }}>
            <button className="btn btn-primary grow" onClick={() => setScan(true)}>📷 Scanner une salle</button>
            <button className="btn" onClick={onLookup}>🔎 Consulter</button>
          </div>
        )}

        <input type="search" className="search" placeholder="Rechercher une salle…" value={q} onChange={(e) => setQ(e.target.value)} />

        {sites.map((site) => (
          <section key={site}>
            <h2 className="section-title">{site}</h2>
            {rooms.filter((r) => r.site_name === site).map((r) => {
              const s = roomStats(idx, r.id);
              const done = s.expected > 0 && s.todo === 0;
              return (
                <button key={r.id} className="card card-btn room" onClick={() => onOpenRoom(r.id)}>
                  <div className="row">
                    <div className="grow">
                      <strong>{roomLabel(r)}</strong>
                      <div className="small muted">{r.code || ''}{!r.in_scope && ' · hors périmètre'}</div>
                    </div>
                    <span className={`count-badge ${done ? 'is-done' : ''}`}>{done ? '✓' : `${s.checked}/${s.expected}`}</span>
                  </div>
                  {s.expected > 0 && <ProgressBar value={(s.checked / s.expected) * 100} />}
                </button>
              );
            })}
          </section>
        ))}
        {!rooms.length && <p className="muted center">Aucune salle.</p>}
        <button className="btn btn-ghost btn-block" onClick={() => setShowAll((x) => !x)}>
          {showAll ? 'Masquer les salles hors périmètre' : 'Afficher aussi les salles hors périmètre'}
        </button>
        {bundle.fromCache && <p className="small muted center">Données hors-ligne du {new Date(bundle.generated_at).toLocaleString('fr-FR')}</p>}
      </main>
    </div>
  );
}

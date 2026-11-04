import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { kvGet, kvSet } from '../store.js';
import { Header, ProgressBar } from '../components.jsx';

export default function Home({ user, online, pending, onOpen, onLogout, onLookup, current, notify }) {
  const [campaigns, setCampaigns] = useState(null);
  const [offline, setOffline] = useState(false);
  const [opening, setOpening] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/mobile/campaigns')
      .then((c) => { if (alive) { setCampaigns(c); setOffline(false); kvSet('campaigns', c); } })
      .catch(async () => { const c = await kvGet('campaigns'); if (alive) { setCampaigns(c || []); setOffline(true); } });
    return () => { alive = false; };
  }, [online]);

  const open = async (id) => {
    setOpening(id);
    try { await onOpen(id); } catch { /* notifié */ } finally { setOpening(null); }
  };

  return (
    <div className="screen">
      <Header title="SAMC Invent" subtitle={`Bonjour ${user.name}`}
        right={<button className="topbar-btn small" onClick={onLogout}>Quitter</button>} />
      <main className="content">
        {pending > 0 && <div className="alert alert-warn">{pending} relevé(s) en attente de synchronisation sur cet appareil.</div>}
        <h2 className="section-title">Campagnes en cours</h2>
        {offline && <p className="muted small">Hors-ligne : liste issue de la dernière connexion.</p>}
        {campaigns === null ? <div className="spinner" /> : campaigns.length === 0 ? (
          <div className="empty">
            <div className="empty-ico">📋</div>
            <strong>Aucune campagne ouverte</strong>
            <p className="muted">Un gestionnaire doit lancer une campagne d'inventaire depuis l'administration.</p>
          </div>
        ) : campaigns.map((c) => (
          <button key={c.id} className={`card card-btn ${current?.campaign.id === c.id ? 'card-current' : ''}`} onClick={() => open(c.id)} disabled={!!opening}>
            <div className="row"><strong className="grow">{c.name}</strong><span className="chev">{opening === c.id ? '…' : '›'}</span></div>
            {c.description && <p className="muted small clamp">{c.description}</p>}
            <ProgressBar value={c.stats.progress} />
            <div className="small muted row" style={{ marginTop: 6 }}>
              <span className="grow">{c.stats.found + c.stats.moved} / {c.stats.expected} vérifiés</span><span>{c.stats.progress}%</span>
            </div>
          </button>
        ))}
        <h2 className="section-title">Outils</h2>
        <button className="card card-btn row" onClick={onLookup}>
          <span className="tool-ico">🔎</span>
          <span className="grow"><strong>Consulter un équipement</strong><br /><span className="small muted">Scanner une étiquette pour afficher sa fiche</span></span>
          <span className="chev">›</span>
        </button>
        <p className="muted small center" style={{ marginTop: 24 }}>
          Astuce : installez l'application sur l'écran d'accueil (menu du navigateur › « Ajouter à l'écran d'accueil ») pour l'utiliser hors-ligne.
        </p>
      </main>
    </div>
  );
}

export function Header({ title, subtitle, onBack, right }) {
  return (
    <header className="topbar">
      {onBack ? <button className="topbar-btn" onClick={onBack} aria-label="Retour">‹</button> : <img src="/mobile/favicon.svg" className="topbar-logo" alt="" />}
      <div className="topbar-title">
        <div className="t1">{title}</div>
        {subtitle && <div className="t2">{subtitle}</div>}
      </div>
      {right}
    </header>
  );
}

export function SyncPill({ online, pending, sync, onSync }) {
  const label = sync.busy ? 'Synchro…' : pending ? `${pending} en attente` : online ? 'À jour' : 'Hors-ligne';
  const tone = sync.busy ? 'blue' : pending ? 'amber' : online ? 'green' : 'gray';
  return (
    <button className={`sync-pill pill-${tone}`} onClick={onSync} disabled={sync.busy} aria-label="Synchroniser">
      <span className={`dot ${sync.busy ? 'spin' : ''}`} />{label}
    </button>
  );
}

export function ProgressBar({ value }) {
  return <div className="pbar"><div style={{ width: `${Math.min(100, value)}%` }} /></div>;
}

export const ResultBadge = ({ result }) => {
  const m = { trouve: ['Trouvé', 'green'], deplace: ['Déplacé', 'amber'], inconnu: ['Inconnu', 'violet'] }[result] || ['—', 'gray'];
  return <span className={`badge badge-${m[1]}`}>{m[0]}</span>;
};

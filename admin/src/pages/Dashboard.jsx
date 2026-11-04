import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Stat, Spinner, useLoad, MapBadge, Empty } from '../components/ui.jsx';
import { STATUS, CONDITION, FAMILY, CAMPAIGN_STATUS, ACTION, fmtMoney, fmtDateTime } from '../labels.js';

const TONE_COLOR = { green: 'var(--green)', amber: '#d97706', red: 'var(--red)', blue: 'var(--primary)', violet: 'var(--violet)', gray: '#94a3b8' };

function Bars({ rows, map, labelKey = 'name' }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <Empty title="Aucune donnée" />;
  return (
    <div className="bars">
      {rows.map((r) => {
        const key = r[labelKey];
        const m = map?.[key];
        return (
          <div className="bar-row" key={key}>
            <span title={m?.label || key}>{m?.label || key}</span>
            <div className="track"><div className="fill" style={{ width: `${(r.n / max) * 100}%`, background: TONE_COLOR[m?.tone || 'blue'] }} /></div>
            <span className="right">{r.n}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { data, loading, error } = useLoad(() => api('/dashboard'));
  if (loading) return <Spinner />;
  if (error) return <div className="error-box">{error}</div>;
  const t = data.totals;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Tableau de bord</h1><div className="sub">Vue d'ensemble du parc d'équipements</div></div>
        <div className="right row gap-s">
          <Link className="btn" to="/campagnes">Campagnes</Link>
          <Link className="btn btn-primary" to="/equipements?new=1">+ Nouvel équipement</Link>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Équipements" value={t.assets} sub={`${t.active} actifs`} />
        <Stat label="Valeur d'acquisition" value={fmtMoney(t.value)} sub="hors équipements réformés" tone="blue" />
        <Stat label="Sites / salles" value={`${t.sites} / ${t.locations}`} sub={`${t.no_location} équipement(s) non localisé(s)`} />
        <Stat label="Jamais inventoriés" value={t.never_seen} sub={`${t.warranty_soon} garantie(s) expirant sous 90 j`} tone={t.never_seen ? 'amber' : 'green'} />
      </div>

      <div className="grid grid-3">
        <div className="card card-pad"><h3>Par famille</h3><Bars rows={data.by_family} map={FAMILY} labelKey="family" /></div>
        <div className="card card-pad"><h3>Par statut</h3><Bars rows={data.by_status} map={STATUS} labelKey="status" /></div>
        <div className="card card-pad"><h3>Par état</h3><Bars rows={data.by_condition} map={CONDITION} labelKey="condition" /></div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad"><h3>Top catégories</h3><Bars rows={data.by_category} /></div>
        <div className="card card-pad"><h3>Par site</h3><Bars rows={data.by_site} /></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>Campagnes actives</h2><Link className="right small" to="/campagnes">Tout voir</Link></div>
          {data.campaigns.length ? (
            <table><tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id}><td><Link to={`/campagnes/${c.id}`}>{c.name}</Link></td><td><MapBadge map={CAMPAIGN_STATUS} value={c.status} /></td></tr>
              ))}
            </tbody></table>
          ) : <Empty title="Aucune campagne en cours"><Link to="/campagnes">Créer une campagne d'inventaire</Link></Empty>}
        </div>
        <div className="card">
          <div className="card-head"><h2>Activité récente</h2></div>
          <table><tbody>
            {data.recent.map((r, i) => (
              <tr key={i}>
                <td><Link to={`/equipements/${r.asset_id}`} className="mono">{r.code}</Link><div className="small muted">{r.label}</div></td>
                <td className="small">{ACTION[r.action] || r.action}<div className="muted">{r.user_name || '—'}</div></td>
                <td className="small muted nowrap">{fmtDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

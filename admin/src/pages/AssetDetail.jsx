import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MapBadge, Spinner, useConfirm, useLoad, useToast, Empty } from '../components/ui.jsx';
import { useRefs } from '../components/refs.js';
import AssetForm from '../components/AssetForm.jsx';
import QrImg from '../components/QrImg.jsx';
import DisposalProposeDialog from '../components/DisposalProposeDialog.jsx';
import { STATUS, CONDITION, FAMILY, ACTION, FIELD_LABEL, ACQUISITION_MODE, DISPOSAL_REASON, DISPOSAL_STATUS, DECISION_TYPE, accountLabel, fmtDate, fmtDateTime, fmtMoney, locLabel, photoUrl } from '../labels.js';

export default function AssetDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const { categories, locations, services } = useRefs();
  const [editing, setEditing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const { data: a, loading, error, reload } = useLoad(() => api(`/assets/${id}`), [id]);

  if (loading && !a) return <Spinner />;
  if (error) return <div className="error-box">{error}</div>;

  const del = async () => {
    if (!(await confirm(`Supprimer définitivement l'équipement ${a.code} et son historique ?`, { okLabel: 'Supprimer' }))) return;
    await api(`/assets/${a.id}`, { method: 'DELETE' });
    toast('Équipement supprimé');
    navigate('/equipements');
  };

  const fmtChange = (field, v) => {
    if (v === null || v === undefined || v === '') return '∅';
    if (field === 'location_id') { const l = locations.find((x) => x.id === Number(v)); return l ? locLabel(l) : `#${v}`; }
    if (field === 'category_id') return categories.find((x) => x.id === Number(v))?.name || `#${v}`;
    if (field === 'status') return STATUS[v]?.label || v;
    if (field === 'condition') return CONDITION[v]?.label || v;
    if (field === 'service_id') return services.find((x) => x.id === Number(v))?.name || `#${v}`;
    if (field === 'acquisition_mode') return ACQUISITION_MODE[v] || v;
    if (field === 'motif') return DISPOSAL_REASON[v] || v;
    return String(v);
  };

  const warrantyOk = a.warranty_end && a.warranty_end >= new Date().toISOString().slice(0, 10);

  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div>
          <div className="small"><Link to="/equipements">← Équipements</Link></div>
          <h1 style={{ marginTop: 6 }}>{a.label}</h1>
          <div className="row gap-s wrap" style={{ marginTop: 8 }}>
            <span className="mono badge badge-gray">{a.code}</span>
            {a.inventory_number && <span className="mono badge badge-blue">Inv. {a.inventory_number}</span>}
            <MapBadge map={STATUS} value={a.status} />
            <MapBadge map={CONDITION} value={a.condition} />
            {a.family && <MapBadge map={FAMILY} value={a.family} />}
          </div>
        </div>
        <div className="right row gap-s">
          <Link className="btn" to={`/etiquettes?ids=${a.id}`}>▦ Étiquette</Link>
          {user.role === 'admin' && <button className="btn btn-ghost" onClick={del}>Supprimer</button>}
          {a.status !== 'sorti' && !a.disposals.some((x) => x.status === 'proposee') && (
            <button className="btn" onClick={() => setProposing(true)}>Proposer à la sortie</button>)}
          {a.status !== 'sorti' && <button className="btn btn-primary" onClick={() => setEditing(true)}>Modifier</button>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
        <div className="stack">
          <div className="card card-pad">
            <h3>Informations</h3>
            <dl className="dl">
              <dt>Catégorie</dt><dd>{a.category_name || '—'}</dd>
              <dt>Marque / modèle</dt><dd>{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</dd>
              <dt>N° de série</dt><dd className="mono">{a.serial_number || '—'}</dd>
              <dt>Localisation</dt><dd>{a.location_id ? <Link to={`/equipements?location_id=${a.location_id}`}>{locLabel(a)}</Link> : 'Non localisé'}</dd>
              <dt>Service</dt><dd>{a.service_name || '—'}</dd>
              <dt>Affecté à</dt><dd>{a.assigned_to || '—'}</dd>
              <dt>Fournisseur</dt><dd>{a.supplier || '—'}</dd>
              <dt>Marché</dt><dd>{a.contract_number || '—'}</dd>
              <dt>Fin de garantie</dt><dd>{a.warranty_end ? <>{fmtDate(a.warranty_end)} {warrantyOk ? <span className="badge badge-green">sous garantie</span> : <span className="badge badge-gray">expirée</span>}</> : '—'}</dd>
              <dt>Dernier inventaire</dt><dd>{a.last_seen_at ? fmtDateTime(a.last_seen_at) : <span className="badge badge-amber">Jamais inventorié</span>}</dd>
              <dt>Notes</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{a.notes || '—'}</dd>
            </dl>
          </div>

          <div className="card card-pad">
            <h3>Comptabilité publique</h3>
            <dl className="dl">
              <dt>N° d'inventaire</dt><dd className="mono">{a.inventory_number || <span className="badge badge-amber">non attribué</span>}</dd>
              <dt>Compte</dt><dd>{accountLabel(a.account)}{!a.account_code && a.account && <span className="muted small"> (catégorie)</span>}</dd>
              <dt>Mode d'acquisition</dt><dd>{ACQUISITION_MODE[a.acquisition_mode] || '—'}</dd>
              <dt>Exercice</dt><dd>{a.fiscal_year || '—'}</dd>
              <dt>Date d'acquisition</dt><dd>{fmtDate(a.purchase_date)}</dd>
              <dt>Mandat · facture</dt><dd>{[a.mandate_number, a.invoice_number].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Valeur brute</dt><dd>{fmtMoney(a.depreciation.gross_value)}</dd>
              {a.depreciation.depreciable ? (<>
                <dt>Amortissement</dt><dd>{a.depreciation.years} an(s) à partir du {fmtDate(a.depreciation.start_date)}
                  {a.depreciation.low_value && <> <span className="badge badge-blue">bien de faible valeur</span></>}
                  <div className="small muted">dotation annuelle {fmtMoney(a.depreciation.annual)} · fin le {fmtDate(a.depreciation.end_date)}</div></dd>
                <dt>Amortissements cumulés</dt><dd>{fmtMoney(a.depreciation.accumulated)}</dd>
                <dt>Valeur nette comptable</dt><dd><strong>{fmtMoney(a.depreciation.net_book_value)}</strong>
                  {a.depreciation.fully_depreciated && <> <span className="badge badge-gray">totalement amorti</span></>}</dd>
              </>) : (
                <><dt>Amortissement</dt><dd className="muted">Non amorti (valeur, durée ou date manquante, location, ou amortissement désactivé)</dd></>
              )}
            </dl>
          </div>

          {a.disposals.length > 0 && (
            <div className="card">
              <div className="card-head"><h2>Sortie d'inventaire</h2></div>
              <table>
                <thead><tr><th>Statut</th><th>Motif</th><th>Décision</th><th>Date de sortie</th><th>VNC à la sortie</th></tr></thead>
                <tbody>{a.disposals.map((x) => (
                  <tr key={x.id}>
                    <td><MapBadge map={DISPOSAL_STATUS} value={x.status} /><div className="small muted">proposé par {x.proposed_by_name || '—'}</div></td>
                    <td>{DISPOSAL_REASON[x.reason]}{x.reason_details && <div className="small muted">{x.reason_details}</div>}</td>
                    <td className="small">{x.decision_type ? `${DECISION_TYPE[x.decision_type]} n° ${x.decision_number} du ${fmtDate(x.decision_date)}` : '—'}</td>
                    <td>{fmtDate(x.exit_date)}</td>
                    <td>{x.net_book_value !== null ? fmtMoney(x.net_book_value) : '—'}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div className="card-head"><h2>Relevés d'inventaire</h2></div>
            {a.scans.length ? (
              <table>
                <thead><tr><th>Campagne</th><th>Résultat</th><th>Salle constatée</th><th>État</th><th>Agent</th><th>Date</th></tr></thead>
                <tbody>{a.scans.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/campagnes/${s.campaign_id}`}>{s.campaign_name}</Link></td>
                    <td>{s.result === 'trouve' ? <span className="badge badge-green">Trouvé</span> : <span className="badge badge-amber">Déplacé</span>}</td>
                    <td>{s.location_name || '—'}</td>
                    <td><MapBadge map={CONDITION} value={s.condition} /></td>
                    <td>{s.user_name}</td>
                    <td className="small muted">{fmtDateTime(s.scanned_at)}</td>
                  </tr>))}
                </tbody>
              </table>
            ) : <Empty title="Aucun relevé">Cet équipement n'a encore été scanné lors d'aucune campagne.</Empty>}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <h3>Étiquette</h3>
            <div className="qr-box">
              <QrImg value={a.code} />
              <div><div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{a.code}</div><div className="small muted">À scanner avec l'application mobile</div></div>
            </div>
          </div>
          {a.photo && <div className="card card-pad"><h3>Photo</h3><img className="photo" src={photoUrl(a.photo)} alt={a.label} /></div>}
          <div className="card card-pad">
            <h3>Historique</h3>
            <ul className="timeline">
              {a.history.map((h) => (
                <li key={h.id}>
                  <div><strong>{ACTION[h.action] || h.action}</strong> <span className="small muted">· {h.user_name || 'Système'}</span></div>
                  <div className="small muted">{fmtDateTime(h.created_at)}</div>
                  {h.details && Object.entries(h.details).filter(([, v]) => Array.isArray(v)).map(([k, [from, to]]) => (
                    <div key={k} className="small">{FIELD_LABEL[k] || k} : <span className="muted">{fmtChange(k, from)}</span> → {fmtChange(k, to)}</div>
                  ))}
                  {h.details?.campagne && <div className="small muted">Campagne : {h.details.campagne}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {editing && <AssetForm asset={a} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {proposing && <DisposalProposeDialog assetIds={[a.id]} onClose={() => setProposing(false)} onDone={() => { setProposing(false); reload(); }} />}
    </div>
  );
}

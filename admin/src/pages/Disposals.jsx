import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, download, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Field, MapBadge, Modal, Spinner, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import { DISPOSAL_REASON, DISPOSAL_STATUS, DECISION_TYPE, fmtDate, fmtMoney, locLabel } from '../labels.js';

const TABS = [
  { key: 'proposee', label: 'À valider' },
  { key: 'validee', label: 'Sortis' },
  { key: 'annulee', label: 'Annulées' },
];

export default function Disposals() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState('proposee');
  const [year, setYear] = useState(new Date().getFullYear());
  const [selected, setSelected] = useState(new Set());
  const [validating, setValidating] = useState(false);
  const { data, loading, error, reload } = useLoad(
    () => api(`/disposals${qs({ status: tab, year: tab === 'validee' ? year : '' })}`), [tab, year]);

  useEffect(() => setSelected(new Set()), [tab, year]);
  const rows = data || [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const cancel = async (d) => {
    if (!(await confirm(`Annuler la proposition de sortie de ${d.code} ? Le bien retrouvera son statut précédent.`, { okLabel: 'Annuler la proposition' }))) return;
    try { await api(`/disposals/${d.id}/cancel`, { method: 'POST' }); toast('Proposition annulée'); reload(); } catch (e) { toast(e.message, 'err'); }
  };

  const total = (k) => rows.filter((r) => tab !== 'proposee' || selected.size === 0 || selected.has(r.id))
    .reduce((t, r) => t + (Number(r[k]) || 0), 0);

  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div>
          <h1>Sorties d'inventaire</h1>
          <div className="sub">Réforme des biens : proposition, décision de l'ordonnateur, sortie de l'actif et transmission au comptable public</div>
        </div>
        <div className="right row gap-s">
          {tab === 'validee' && <>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
              {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>Exercice {y}</option>)}
            </select>
            <button className="btn" onClick={() => download(`/disposals/export.csv?year=${year}`, `etat-des-sorties-${year}.csv`)}>⇩ État des sorties {year}</button>
          </>}
        </div>
      </div>

      <div className="info-box small">
        Un bien n'est sorti de l'inventaire qu'au vu d'une décision : certificat administratif, décision du maire ou du président, ou délibération pour les cessions.
        La valeur brute et la valeur nette comptable sont figées à la date de sortie, puis l'état des sorties est transmis au comptable public pour la mise à jour de l'état de l'actif.
      </div>

      <div className="card">
        <div className="tabs">
          {TABS.map((t) => <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>

        {tab === 'proposee' && selected.size > 0 && (
          <div className="bulkbar">
            <strong>{selected.size} sélectionnée(s)</strong>
            {user.role === 'admin'
              ? <button className="btn btn-primary btn-sm" onClick={() => setValidating(true)}>Valider la sortie…</button>
              : <span className="small muted">La validation est réservée aux administrateurs (ordonnateur ou délégataire).</span>}
            <button className="btn btn-ghost btn-sm right" onClick={() => setSelected(new Set())}>Désélectionner</button>
          </div>
        )}
        {tab === 'validee' && selected.size > 0 && (
          <div className="bulkbar">
            <strong>{selected.size} sélectionnée(s)</strong>
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/sorties/proces-verbal?ids=${[...selected].join(',')}`)}>🖨 Procès-verbal de sortie</button>
          </div>
        )}

        {error && <div className="error-box" style={{ margin: 16 }}>{error}</div>}
        {loading && !data ? <Spinner /> : rows.length === 0 ? (
          <Empty title="Rien à afficher">
            {tab === 'proposee' ? <>Proposez un bien à la sortie depuis sa fiche ou par une action groupée dans <Link to="/equipements">Équipements</Link>.</> : 'Aucune sortie pour cette sélection.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                {tab !== 'annulee' && <th style={{ width: 32 }}><input type="checkbox" checked={allChecked} aria-label="Tout sélectionner"
                  onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} /></th>}
                <th>Bien</th><th>Compte</th><th>Motif</th>
                {tab === 'validee' ? <><th>Décision</th><th>Sortie</th><th>Valeur brute</th><th>VNC</th><th>Cession</th></>
                  : <><th>Proposé</th><th>Valeur brute</th><th>VNC actuelle</th><th /></>}
              </tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className={selected.has(d.id) ? 'selected' : ''}>
                    {tab !== 'annulee' && <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} /></td>}
                    <td>
                      <Link to={`/equipements/${d.asset_id}`} className="mono">{d.code}</Link>
                      {d.inventory_number && <span className="small muted"> · Inv. {d.inventory_number}</span>}
                      <div className="title">{d.label}</div>
                      <div className="small muted">{[d.service_name, d.location_name && locLabel(d)].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="mono">{d.account || '—'}</td>
                    <td>{DISPOSAL_REASON[d.reason]}{d.reason_details && <div className="small muted">{d.reason_details}</div>}</td>
                    {tab === 'validee' ? <>
                      <td className="small">{DECISION_TYPE[d.decision_type]}<div className="muted">n° {d.decision_number} du {fmtDate(d.decision_date)}</div></td>
                      <td className="nowrap">{fmtDate(d.exit_date)}</td>
                      <td className="nowrap">{fmtMoney(d.gross_value)}</td>
                      <td className="nowrap">{fmtMoney(d.net_book_value)}</td>
                      <td className="small">{d.sale_price !== null ? fmtMoney(d.sale_price) : '—'}{d.beneficiary && <div className="muted">{d.beneficiary}</div>}</td>
                    </> : <>
                      <td className="small">{fmtDate(d.proposed_at)}<div className="muted">{d.proposed_by_name || '—'}</div></td>
                      <td className="nowrap">{fmtMoney(d.purchase_price)}</td>
                      <td className="nowrap">{fmtMoney(d.current_net_book_value)}</td>
                      <td className="actions">{tab === 'proposee' && <button className="link-btn danger small" onClick={() => cancel(d)}>Annuler</button>}<MapBadge map={DISPOSAL_STATUS} value={d.status} /></td>
                    </>}
                  </tr>
                ))}
              </tbody>
              {tab === 'validee' && (
                <tfoot><tr>
                  <td /><td colSpan={5}><strong>Total exercice {year} · {rows.length} bien(s)</strong></td>
                  <td className="nowrap"><strong>{fmtMoney(total('gross_value'))}</strong></td>
                  <td className="nowrap"><strong>{fmtMoney(total('net_book_value'))}</strong></td>
                  <td className="nowrap"><strong>{fmtMoney(total('sale_price'))}</strong></td>
                </tr></tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {validating && <ValidateDialog ids={[...selected]} onClose={() => setValidating(false)}
        onDone={(ids) => { setValidating(false); setSelected(new Set()); reload(); navigate(`/sorties/proces-verbal?ids=${ids.join(',')}`); }} />}
    </div>
  );
}

function ValidateDialog({ ids, onClose, onDone }) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [d, setD] = useState({ decision_type: 'certificat_administratif', decision_number: '', decision_date: today, exit_date: today, sale_price: '', beneficiary: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/disposals/validate', { method: 'POST', body: { ids, ...d } });
      toast(`${r.count} bien(s) sorti(s) de l'inventaire`);
      onDone(ids);
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={`Valider la sortie de ${ids.length} bien(s)`} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" form="validate-form">Valider et éditer le procès-verbal</button>
    </>}>
      <form id="validate-form" className="form-grid" onSubmit={submit}>
        {error && <div className="error-box span-2">{error}</div>}
        <Field label="Acte" span={2}>
          <select value={d.decision_type} onChange={set('decision_type')}>{Object.entries(DECISION_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="N° de l'acte *"><input value={d.decision_number} onChange={set('decision_number')} required placeholder="CA-2026-012" /></Field>
        <Field label="Date de l'acte *"><input type="date" value={d.decision_date} onChange={set('decision_date')} required /></Field>
        <Field label="Date de sortie" hint="Date de la sortie de l'actif"><input type="date" value={d.exit_date} onChange={set('exit_date')} /></Field>
        <Field label="Prix de cession (€)" hint="En cas de vente"><input inputMode="decimal" value={d.sale_price} onChange={set('sale_price')} /></Field>
        <Field label="Bénéficiaire" span={2} hint="Acheteur, association ou collectivité bénéficiaire, filière de recyclage (D3E)…"><input value={d.beneficiary} onChange={set('beneficiary')} /></Field>
      </form>
    </Modal>
  );
}

/** Procès-verbal de sortie d'inventaire, imprimable. */
export function DisposalReport() {
  const [params] = useSearchParams();
  const ids = params.get('ids') || '';
  const { data, loading } = useLoad(() => Promise.all([api(`/disposals${qs({ ids })}`), api('/settings')]), [ids]);
  if (loading || !data) return <Spinner />;
  const [rows, settings] = data;
  const validated = rows.filter((r) => r.status === 'validee');
  if (!validated.length) return <Empty title="Aucune sortie validée dans la sélection" />;
  const decisions = [...new Set(validated.map((r) => `${DECISION_TYPE[r.decision_type]} n° ${r.decision_number} du ${fmtDate(r.decision_date)}`))];
  const sum = (k) => validated.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  return (
    <div className="stack pv">
      <div className="page-head no-print">
        <div className="small"><Link to="/sorties">← Sorties d'inventaire</Link></div>
        <button className="btn btn-primary right" onClick={() => window.print()}>🖨 Imprimer</button>
      </div>
      <div className="card card-pad">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div><strong>{settings.organization_name}</strong>{settings.organization_siret && <div className="small muted">SIRET {settings.organization_siret}</div>}</div>
          <div className="right small muted">Édité le {fmtDate(new Date().toISOString())}</div>
        </div>
        <h1 style={{ textAlign: 'center', margin: '28px 0 6px' }}>Procès-verbal de sortie d'inventaire</h1>
        <p style={{ textAlign: 'center', marginTop: 0 }} className="muted">{decisions.join(' · ')}</p>
        <p>
          Les biens ci-dessous sont sortis de l'inventaire de la collectivité et de son état de l'actif à la date indiquée, pour les motifs mentionnés.
          Le présent procès-verbal est transmis au comptable public{settings.accountant_name ? ` (${settings.accountant_name})` : ''} pour mise à jour de l'état de l'actif.
        </p>
        <table className="pv-table">
          <thead><tr><th>N° inventaire</th><th>Désignation</th><th>Compte</th><th>Acquis le</th><th>Motif</th><th>Sortie</th><th>Valeur brute</th><th>VNC</th><th>Cession</th></tr></thead>
          <tbody>{validated.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.inventory_number || r.code}</td>
              <td>{r.label}{r.serial_number && <div className="small muted">S/N {r.serial_number}</div>}</td>
              <td className="mono">{r.account || '—'}</td>
              <td className="nowrap">{fmtDate(r.purchase_date)}</td>
              <td>{DISPOSAL_REASON[r.reason]}{r.beneficiary && <div className="small muted">{r.beneficiary}</div>}</td>
              <td className="nowrap">{fmtDate(r.exit_date)}</td>
              <td className="nowrap">{fmtMoney(r.gross_value)}</td>
              <td className="nowrap">{fmtMoney(r.net_book_value)}</td>
              <td className="nowrap">{r.sale_price !== null ? fmtMoney(r.sale_price) : '—'}</td>
            </tr>))}
          </tbody>
          <tfoot><tr><td colSpan={6}><strong>Total · {validated.length} bien(s)</strong></td>
            <td className="nowrap"><strong>{fmtMoney(sum('gross_value'))}</strong></td><td className="nowrap"><strong>{fmtMoney(sum('net_book_value'))}</strong></td>
            <td className="nowrap"><strong>{fmtMoney(sum('sale_price'))}</strong></td></tr></tfoot>
        </table>
        <div className="grid grid-2" style={{ marginTop: 40 }}>
          <div className="signature">Le gestionnaire du patrimoine<br /><span className="small muted">Nom, date et signature</span></div>
          <div className="signature">L'ordonnateur (ou son délégataire)<br /><span className="small muted">Nom, date, signature et cachet</span></div>
        </div>
      </div>
    </div>
  );
}

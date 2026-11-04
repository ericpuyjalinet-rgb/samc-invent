import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Field, MapBadge, Modal, Progress, Spinner, Stat, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import { useRefs } from '../components/refs.js';
import CampaignForm from '../components/CampaignForm.jsx';
import QrImg from '../components/QrImg.jsx';
import { CAMPAIGN_STATUS, CONDITION, fmtDate, fmtDateTime, locLabel } from '../labels.js';

const TABS = [
  { key: 'locations', label: 'Par salle' },
  { key: 'found', label: 'Trouvés', stat: 'found' },
  { key: 'moved', label: 'Déplacés', stat: 'moved' },
  { key: 'missing', label: 'Manquants', stat: 'missing' },
  { key: 'unknown', label: 'Inconnus', stat: 'unknown' },
  { key: 'extra', label: 'Hors périmètre', stat: 'extra' },
];

export default function CampaignDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState('locations');
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [resolving, setResolving] = useState(null);
  const { data: c, loading, error, reload } = useLoad(() => api(`/campaigns/${id}`), [id]);
  const report = useLoad(() => api(`/campaigns/${id}/report`), [id]);

  // Rafraîchissement automatique pendant la saisie terrain
  useEffect(() => {
    if (c?.status !== 'en_cours') return;
    const t = setInterval(() => { reload(); report.reload(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.status]);

  if (loading && !c) return <Spinner />;
  if (error) return <div className="error-box">{error}</div>;
  const refresh = () => { reload(); report.reload(); };
  const s = c.stats;

  const start = async () => {
    if (!(await confirm(`Lancer la campagne ? ${s.expected} équipement(s) attendu(s) seront figés comme référence et la saisie mobile sera ouverte.`, { danger: false, okLabel: 'Lancer' }))) return;
    try { await api(`/campaigns/${id}/start`, { method: 'POST' }); toast('Campagne lancée — les agents peuvent saisir sur mobile'); refresh(); } catch (e) { toast(e.message, 'err'); }
  };
  const del = async () => {
    if (!(await confirm('Supprimer cette campagne et tous ses relevés ?', { okLabel: 'Supprimer' }))) return;
    try { await api(`/campaigns/${id}`, { method: 'DELETE' }); navigate('/campagnes'); } catch (e) { toast(e.message, 'err'); }
  };
  const reopen = async () => {
    try { await api(`/campaigns/${id}/reopen`, { method: 'POST' }); toast('Campagne rouverte'); refresh(); } catch (e) { toast(e.message, 'err'); }
  };
  const removeScan = async (scanId) => {
    if (!(await confirm('Supprimer ce relevé ?', { okLabel: 'Supprimer' }))) return;
    await api(`/campaigns/${id}/scans/${scanId}`, { method: 'DELETE' }); refresh();
  };

  const mobileUrl = `${window.location.origin}/mobile/?campagne=${c.id}`;
  const r = report.data;

  return (
    <div className="stack">
      {confirmNode}
      <div className="page-head">
        <div>
          <div className="small"><Link to="/campagnes">← Campagnes</Link></div>
          <h1 style={{ marginTop: 6 }}>{c.name}</h1>
          <div className="row gap-s wrap sub">
            <MapBadge map={CAMPAIGN_STATUS} value={c.status} />
            <span>{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</span>
            <span>· {c.location_ids.length ? `${c.location_ids.length} salle(s)` : 'Toutes les salles'}</span>
            {c.closed_at && <span>· clôturée le {fmtDateTime(c.closed_at)}</span>}
          </div>
        </div>
        <div className="right row gap-s wrap">
          {c.status !== 'brouillon' && <button className="btn" onClick={() => download(`/campaigns/${id}/report.csv`, `rapport-${c.name}.csv`)}>⇩ Rapport CSV</button>}
          {c.status !== 'cloturee' && <button className="btn" onClick={() => setEditing(true)}>Modifier</button>}
          {(c.status === 'brouillon' || user.role === 'admin') && <button className="btn btn-ghost" onClick={del}>Supprimer</button>}
          {c.status === 'brouillon' && <button className="btn btn-primary" onClick={start}>▶ Lancer la campagne</button>}
          {c.status === 'en_cours' && <button className="btn btn-primary" onClick={() => setClosing(true)}>Clôturer…</button>}
          {c.status === 'cloturee' && user.role === 'admin' && <button className="btn" onClick={reopen}>Rouvrir</button>}
        </div>
      </div>

      {c.description && <div className="info-box">{c.description}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,1fr)' }}>
        <div className="card card-pad">
          <div className="row" style={{ marginBottom: 8 }}><strong>Avancement</strong><span className="right">{s.progress}%</span></div>
          <Progress value={s.progress} tone={c.status === 'cloturee' ? 'green' : 'blue'} />
          <div className="grid grid-3" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
            <Stat label="Attendus" value={s.expected} />
            <Stat label="Trouvés" value={s.found} tone="green" />
            <Stat label="Déplacés" value={s.moved} tone="amber" />
            <Stat label={c.status === 'cloturee' ? 'Manquants' : 'Restants'} value={s.missing} tone={s.missing && c.status === 'cloturee' ? 'red' : undefined} />
            <Stat label="Inconnus" value={s.unknown} tone="violet" />
            <Stat label="Hors périmètre" value={s.extra} />
          </div>
        </div>
        <div className="card card-pad">
          <h3>Saisie mobile</h3>
          {c.status === 'en_cours' ? (
            <div className="qr-box">
              <QrImg value={mobileUrl} />
              <div className="small muted">Les agents scannent ce code pour ouvrir l'application mobile sur cette campagne.<br /><a href={mobileUrl} target="_blank" rel="noreferrer">Ouvrir ↗</a></div>
            </div>
          ) : <p className="muted small">{c.status === 'brouillon' ? 'Lancez la campagne pour ouvrir la saisie sur mobile.' : 'Campagne clôturée : saisie fermée.'}</p>}
        </div>
      </div>

      <div className="card">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.key === 'missing' && c.status !== 'cloturee' ? 'Restants' : t.label}{t.stat && <span className="count">{s[t.stat]}</span>}
            </button>
          ))}
        </div>

        {tab === 'locations' && (
          c.locations.length ? (
            <table>
              <thead><tr><th>Salle</th><th>Attendus</th><th>Vérifiés</th><th style={{ width: 260 }}>Avancement</th><th>Relevés dans la salle</th></tr></thead>
              <tbody>{c.locations.map((l) => {
                const p = l.expected ? Math.round((l.checked / l.expected) * 100) : (l.scanned_here ? 100 : 0);
                return (
                  <tr key={l.id}>
                    <td>{locLabel(l)}</td><td>{l.expected}</td><td>{l.checked}</td>
                    <td><Progress value={p} tone={p === 100 ? 'green' : 'blue'} /></td>
                    <td>{l.scanned_here}</td>
                  </tr>);
              })}</tbody>
            </table>
          ) : <Empty title="Aucune salle dans le périmètre" />
        )}

        {tab !== 'locations' && (!r ? <Spinner /> : (
          <ReportTable kind={tab} rows={r[tab]} campaign={c} onResolve={setResolving} onRemove={removeScan} />
        ))}
      </div>

      {editing && <CampaignForm campaign={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      {closing && <CloseDialog campaign={c} onClose={() => setClosing(false)} onDone={() => { setClosing(false); refresh(); }} />}
      {resolving && <ResolveDialog campaignId={c.id} scan={resolving} onClose={() => setResolving(null)} onDone={() => { setResolving(null); refresh(); }} />}
    </div>
  );
}

function ReportTable({ kind, rows, campaign, onResolve, onRemove }) {
  const { categories } = useRefs();
  const canEdit = campaign.status === 'en_cours';
  if (!rows?.length) {
    const msg = { found: 'Aucun équipement trouvé pour le moment.', moved: 'Aucun déplacement constaté.', missing: 'Tous les équipements attendus ont été vérifiés.',
      unknown: 'Aucun équipement inconnu relevé.', extra: "Aucun équipement hors périmètre n'a été scanné." }[kind];
    return <Empty title="Rien à afficher">{msg}</Empty>;
  }
  if (kind === 'missing') {
    return (
      <div className="table-wrap"><table>
        <thead><tr><th>Code</th><th>Désignation</th><th>Localisation attendue</th><th>Affecté à</th><th>Dernier inventaire</th></tr></thead>
        <tbody>{rows.map((a) => (
          <tr key={a.id}>
            <td className="mono"><Link to={`/equipements/${a.id}`}>{a.code}</Link></td>
            <td>{a.label}<div className="small muted">{a.serial_number && `S/N ${a.serial_number}`}</div></td>
            <td className="small">{locLabel(a)}</td><td className="small">{a.assigned_to || '—'}</td>
            <td className="small muted">{a.last_seen_at ? fmtDate(a.last_seen_at) : 'Jamais'}</td>
          </tr>))}
        </tbody>
      </table></div>
    );
  }
  if (kind === 'unknown') {
    return (
      <div className="table-wrap"><table>
        <thead><tr><th>Code scanné</th><th>Description saisie</th><th>Salle</th><th>État</th><th>Commentaire / photo</th><th>Agent</th><th /></tr></thead>
        <tbody>{rows.map((sc) => (
          <tr key={sc.id}>
            <td className="mono">{sc.scanned_code || '—'}</td>
            <td>{sc.unknown_label || '—'}<div className="small muted">{categories.find((x) => x.id === sc.unknown_category_id)?.name}</div></td>
            <td className="small">{sc.site_name} › {sc.location_name}</td>
            <td><MapBadge map={CONDITION} value={sc.condition} /></td>
            <td className="small">{sc.comment}{sc.photo && <div><a href={`/uploads/${sc.photo}`} target="_blank" rel="noreferrer">📷 Voir la photo</a></div>}</td>
            <td className="small">{sc.user_name}<div className="muted">{fmtDateTime(sc.scanned_at)}</div></td>
            <td className="actions">
              {campaign.status !== 'brouillon' && <button className="btn btn-sm btn-primary" onClick={() => onResolve(sc)}>Intégrer au parc</button>}{' '}
              {canEdit && <button className="link-btn danger small" onClick={() => onRemove(sc.id)}>Supprimer</button>}
            </td>
          </tr>))}
        </tbody>
      </table></div>
    );
  }
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Code</th><th>Désignation</th>{kind !== 'found' && <th>Localisation attendue</th>}<th>Salle constatée</th><th>État constaté</th><th>Commentaire</th><th>Agent</th>{canEdit && <th />}</tr></thead>
      <tbody>{rows.map((sc) => (
        <tr key={sc.id}>
          <td className="mono"><Link to={`/equipements/${sc.asset_id}`}>{sc.asset?.code}</Link></td>
          <td>{sc.asset?.label}</td>
          {kind !== 'found' && <td className="small">{sc.expected_location_name || (sc.asset ? locLabel(sc.asset) : '—')}</td>}
          <td className="small">{sc.site_name} › {sc.location_name}</td>
          <td>
            <MapBadge map={CONDITION} value={sc.condition} />
            {sc.condition && sc.asset && sc.condition !== sc.asset.condition && <div className="small muted">était : {CONDITION[sc.asset.condition]?.label}</div>}
          </td>
          <td className="small">{sc.comment}{sc.photo && <div><a href={`/uploads/${sc.photo}`} target="_blank" rel="noreferrer">📷 Photo</a></div>}</td>
          <td className="small">{sc.user_name}<div className="muted">{fmtDateTime(sc.scanned_at)}</div></td>
          {canEdit && <td className="actions"><button className="link-btn danger small" onClick={() => onRemove(sc.id)}>Supprimer</button></td>}
        </tr>))}
      </tbody>
    </table></div>
  );
}

function CloseDialog({ campaign, onClose, onDone }) {
  const toast = useToast();
  const s = campaign.stats;
  const [opts, setOpts] = useState({ apply_moves: true, apply_conditions: true, mark_missing: false });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.checked }));
  const submit = async () => {
    setBusy(true);
    try {
      const res = await api(`/campaigns/${campaign.id}/close`, { method: 'POST', body: opts });
      toast(`Campagne clôturée : ${res.summary.moved} déplacement(s), ${res.summary.conditions} état(s), ${res.summary.missing} manquant(s) appliqué(s)`);
      onDone();
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Modal title="Clôturer la campagne" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" onClick={submit} disabled={busy}>Clôturer et appliquer</button>
    </>}>
      <div className="stack">
        <p style={{ marginTop: 0 }}>Avancement : <strong>{s.progress}%</strong> ({s.found + s.moved}/{s.expected}). Choisissez les mises à jour à reporter dans le parc :</p>
        <label className="check"><input type="checkbox" checked={opts.apply_moves} onChange={set('apply_moves')} />
          <span>Mettre à jour la localisation des <strong>{s.moved + s.extra}</strong> équipement(s) déplacé(s) ou hors périmètre</span></label>
        <label className="check"><input type="checkbox" checked={opts.apply_conditions} onChange={set('apply_conditions')} />
          <span>Reporter l'état constaté par les agents (neuf, bon, moyen…)</span></label>
        <label className="check"><input type="checkbox" checked={opts.mark_missing} onChange={set('mark_missing')} />
          <span>Passer les <strong>{s.missing}</strong> équipement(s) manquant(s) au statut <span className="badge badge-red">Perdu</span></span></label>
        {s.unknown > 0 && <div className="info-box">{s.unknown} équipement(s) inconnu(s) n'ont pas été intégrés au parc. Vous pourrez encore les traiter après la clôture.</div>}
      </div>
    </Modal>
  );
}

function ResolveDialog({ campaignId, scan, onClose, onDone }) {
  const toast = useToast();
  const { categories } = useRefs();
  const [mode, setMode] = useState('create');
  const [d, setD] = useState({ label: scan.unknown_label || '', category_id: scan.unknown_category_id || '', brand: '', model: '', serial_number: '', code: scan.scanned_code || '' });
  const [existingCode, setExistingCode] = useState('');
  const [error, setError] = useState('');
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      let body;
      if (mode === 'link') {
        const a = await api(`/assets/by-code/${encodeURIComponent(existingCode.trim())}`);
        body = { asset_id: a.id };
      } else body = { create: d };
      await api(`/campaigns/${campaignId}/scans/${scan.id}/resolve`, { method: 'POST', body });
      toast(mode === 'link' ? 'Relevé rattaché à l’équipement existant' : 'Équipement créé dans le parc');
      onDone();
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal title="Intégrer l'équipement inconnu" onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" form="resolve-form">Valider</button>
    </>}>
      <form id="resolve-form" className="form-grid" onSubmit={submit}>
        {error && <div className="error-box span-2">{error}</div>}
        <div className="span-2 row gap">
          <label className="check"><input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} /> Créer un nouvel équipement</label>
          <label className="check"><input type="radio" checked={mode === 'link'} onChange={() => setMode('link')} /> Rattacher à un équipement existant</label>
        </div>
        {mode === 'link' ? (
          <Field label="Code inventaire ou n° de série de l'équipement existant" span={2}>
            <input value={existingCode} onChange={(e) => setExistingCode(e.target.value)} required className="mono" autoFocus />
          </Field>
        ) : (<>
          <Field label="Désignation *" span={2}><input value={d.label} onChange={set('label')} required autoFocus /></Field>
          <Field label="Code inventaire" hint="Le code de l'étiquette scannée, ou vide pour en générer un"><input value={d.code} onChange={set('code')} className="mono" /></Field>
          <Field label="Catégorie">
            <select value={d.category_id} onChange={set('category_id')}>
              <option value="">— Aucune —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Marque"><input value={d.brand} onChange={set('brand')} /></Field>
          <Field label="Modèle"><input value={d.model} onChange={set('model')} /></Field>
          <Field label="N° de série" span={2}><input value={d.serial_number} onChange={set('serial_number')} /></Field>
          <p className="span-2 small muted" style={{ margin: 0 }}>L'équipement sera localisé dans « {scan.site_name} › {scan.location_name} » avec l'état constaté.</p>
        </>)}
      </form>
    </Modal>
  );
}

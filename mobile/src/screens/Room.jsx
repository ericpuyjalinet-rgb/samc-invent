import { useMemo, useState } from 'react';
import { Header, ResultBadge, SyncPill } from '../components.jsx';
import Scanner from '../Scanner.jsx';
import ScanSheet from './ScanSheet.jsx';
import { buildIndex, expectedLocationOf, resolveCode, roomStats } from '../campaign.js';
import { queueDelete, queueUpsert } from '../store.js';
import { conditionLabel, feedback, fmtTime, roomLabel, uuid } from '../util.js';

const QUICK_KEY = 'samc_quick_mode';

export default function Room({ bundle, roomId, user, online, pending, sync, onSync, onBack, onChangeRoom, onLocalChange, notify }) {
  const idx = useMemo(() => buildIndex(bundle), [bundle]);
  const room = idx.locById.get(roomId);
  const stats = roomStats(idx, roomId);
  const [camera, setCamera] = useState(true);
  const [manual, setManual] = useState('');
  const [tab, setTab] = useState('todo');
  const [draft, setDraft] = useState(null);
  const [quick, setQuick] = useState(() => localStorage.getItem(QUICK_KEY) === '1');
  const [lastQuick, setLastQuick] = useState(null);

  const todo = idx.expected.filter((a) => a.expected_location_id === roomId && !idx.latest.has(a.id));
  const scansHere = idx.effective.filter((s) => s.location_id === roomId).sort((a, b) => (a.scanned_at < b.scanned_at ? 1 : -1));

  const toggleQuick = () => { const v = !quick; setQuick(v); localStorage.setItem(QUICK_KEY, v ? '1' : '0'); };

  /** Prépare un relevé à partir d'un équipement (ou d'un code inconnu). */
  function makeDraft(asset, scannedCode) {
    if (!asset) {
      return { isNew: true, scan: { client_uuid: uuid(), asset_id: null, scanned_code: scannedCode, location_id: roomId, result: 'inconnu', condition: 'bon', comment: '', unknown_label: '', unknown_category_id: null } };
    }
    const prev = idx.latest.get(asset.id);
    const mine = prev && prev.user_id === user.id;
    const result = expectedLocationOf(asset) === roomId ? 'trouve' : 'deplace';
    return {
      isNew: !mine,
      previous: prev && !(mine && prev.location_id === roomId) ? prev : null,
      asset,
      scan: {
        client_uuid: mine ? prev.client_uuid : uuid(), asset_id: asset.id, scanned_code: asset.code, location_id: roomId, result,
        condition: (mine && prev.condition) || asset.condition || 'bon', comment: mine ? prev.comment || '' : '',
      },
    };
  }

  async function save(scan) {
    await queueUpsert(bundle.campaign.id, { ...scan, scanned_at: new Date().toISOString() });
    await onLocalChange();
  }

  async function onDetect(raw) {
    if (draft) return;
    const r = resolveCode(idx, raw);
    if (r.type === 'location') {
      if (r.location.id === roomId) { notify('Vous êtes déjà dans cette salle'); return; }
      feedback('warn');
      if (window.confirm(`Changer de salle pour « ${roomLabel(r.location)} » ?`)) onChangeRoom(r.location.id);
      return;
    }
    const d = makeDraft(r.asset, r.code);
    const prev = r.asset && idx.latest.get(r.asset.id);
    if (r.asset && prev && prev.location_id === roomId && quick) {
      feedback('warn'); notify(`Déjà relevé : ${r.asset.code}`, 'warn'); return;
    }
    if (quick && d.scan.result === 'trouve' && !d.previous) {
      await save(d.scan);
      feedback('ok');
      setLastQuick({ asset: r.asset, at: Date.now() });
      return;
    }
    feedback(d.scan.result === 'trouve' ? 'ok' : 'warn');
    setDraft(d);
  }

  const submitManual = (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    onDetect(manual.trim());
    setManual('');
  };

  const editScan = (s) => {
    const asset = s.asset_id ? idx.assetById.get(s.asset_id) : null;
    setDraft({ isNew: false, editing: true, asset, canDelete: s.user_id === user.id || ['admin', 'gestionnaire'].includes(user.role),
      scan: { ...s, comment: s.comment || '', photo: undefined } });
  };

  return (
    <div className="screen">
      <Header title={room ? roomLabel(room) : 'Salle'} subtitle={`${room?.site_name || ''} · ${stats.checked}/${stats.expected} attendus vérifiés`} onBack={onBack}
        right={<SyncPill online={online} pending={pending} sync={sync} onSync={onSync} />} />

      <main className="content content-room">
        {camera ? (
          <Scanner onDetect={onDetect} paused={!!draft} onClose={() => setCamera(false)} />
        ) : (
          <button className="btn btn-primary btn-block btn-lg" onClick={() => setCamera(true)}>📷 Activer le scanner</button>
        )}

        {lastQuick && Date.now() - lastQuick.at < 4000 && (
          <div className="alert alert-ok small">✓ {lastQuick.asset.code} — {lastQuick.asset.label}</div>
        )}

        <form className="row gap manual" onSubmit={submitManual}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Saisir un code ou n° de série" autoCapitalize="characters" />
          <button className="btn" type="submit">OK</button>
        </form>
        <label className="switch-row">
          <input type="checkbox" checked={quick} onChange={toggleQuick} />
          <span><strong>Validation rapide</strong><br /><span className="small muted">Enregistre directement les équipements attendus ici, sans fiche</span></span>
        </label>

        <div className="seg">
          <button className={tab === 'todo' ? 'active' : ''} onClick={() => setTab('todo')}>À vérifier <span className="seg-count">{todo.length}</span></button>
          <button className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>Relevés ici <span className="seg-count">{scansHere.length}</span></button>
        </div>

        {tab === 'todo' && (todo.length === 0 ? (
          <div className="empty"><div className="empty-ico">🎉</div><strong>{stats.expected ? 'Tous les équipements attendus ont été vérifiés' : 'Aucun équipement attendu dans cette salle'}</strong>
            <p className="muted small">Scannez tout équipement supplémentaire présent dans la salle.</p></div>
        ) : (
          <ul className="list">
            {todo.map((a) => (
              <li key={a.id} className="list-item">
                <div className="grow">
                  <div className="mono small">{a.code}</div>
                  <div className="li-title">{a.label}</div>
                  <div className="small muted">{[a.category_name, a.serial_number && `S/N ${a.serial_number}`, a.assigned_to].filter(Boolean).join(' · ')}</div>
                </div>
                <button className="btn btn-sm" onClick={() => setDraft(makeDraft(a, a.code))} aria-label={`Marquer ${a.code} présent`}>✓ Présent</button>
              </li>
            ))}
          </ul>
        ))}

        {tab === 'done' && (scansHere.length === 0 ? (
          <div className="empty"><strong>Aucun relevé dans cette salle</strong></div>
        ) : (
          <ul className="list">
            {scansHere.map((s) => {
              const a = s.asset_id ? idx.assetById.get(s.asset_id) : null;
              return (
                <li key={s.client_uuid} className="list-item" onClick={() => editScan(s)}>
                  <div className="grow">
                    <div className="row gap-s"><span className="mono small">{a?.code || s.scanned_code || '—'}</span><ResultBadge result={s.result} />{s.pending && <span className="badge badge-amber">non envoyé</span>}</div>
                    <div className="li-title">{a?.label || s.unknown_label || 'Équipement inconnu'}</div>
                    <div className="small muted">État : {conditionLabel(s.condition)} · {s.user_name || '—'} · {fmtTime(s.scanned_at)}</div>
                    {s.comment && <div className="small">💬 {s.comment}</div>}
                  </div>
                  <span className="chev">›</span>
                </li>
              );
            })}
          </ul>
        ))}
      </main>

      {draft && (
        <ScanSheet draft={draft} idx={idx} room={room} categories={bundle.categories}
          onCancel={() => setDraft(null)}
          onSave={async (scan) => { await save(scan); setDraft(null); feedback('ok'); notify('Relevé enregistré'); }}
          onDelete={async () => {
            await queueDelete(bundle.campaign.id, draft.scan.client_uuid);
            await onLocalChange(); setDraft(null); notify('Relevé supprimé');
          }} />
      )}
    </div>
  );
}

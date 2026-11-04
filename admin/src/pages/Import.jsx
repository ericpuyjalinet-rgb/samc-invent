import { useState } from 'react';
import { api, download } from '../api.js';
import { useToast } from '../components/ui.jsx';
import { invalidateRefs } from '../components/refs.js';

export default function ImportPage() {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (dry) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api(`/assets/import${dry ? '?dry_run=1' : ''}`, { method: 'POST', form });
      setReport(r);
      if (!dry) { toast(`Import terminé : ${r.created} créé(s), ${r.updated} mis à jour`); invalidateRefs(); }
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Import / Export</h1><div className="sub">Reprise de données depuis un tableur et extractions</div></div>
      </div>
      <div className="grid grid-2">
        <div className="card card-pad stack">
          <h2>Importer des équipements (CSV)</h2>
          <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Téléchargez le <button className="link-btn" onClick={() => download('/assets/import-template.csv', 'modele-import-samc-invent.csv')}>modèle CSV</button> (séparateur « ; », compatible Excel).</li>
            <li>Complétez une ligne par équipement. Les sites, salles et catégories inexistants sont créés automatiquement.</li>
            <li>Si la colonne <code>code</code> correspond à un équipement existant, celui-ci est mis à jour ; vide, un code est généré.</li>
            <li>Valeurs de <code>statut</code> : en_service, en_stock, en_reparation, reforme, perdu — <code>etat</code> : neuf, bon, moyen, mauvais, hs.</li>
          </ol>
          <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files[0] || null); setReport(null); }} />
          <div className="row gap-s">
            <button className="btn" disabled={!file || busy} onClick={() => run(true)}>Simuler l'import</button>
            <button className="btn btn-primary" disabled={!file || busy} onClick={() => run(false)}>Importer</button>
          </div>
          {report && (
            <div className={report.errors.length ? 'error-box' : 'info-box'}>
              <strong>{report.dry_run ? 'Simulation' : 'Résultat'} :</strong> {report.total} ligne(s) — {report.created} création(s), {report.updated} mise(s) à jour,
              {' '}{report.errors.length} erreur(s). Référentiels créés : {report.created_refs.sites} site(s), {report.created_refs.locations} salle(s), {report.created_refs.categories} catégorie(s).
              {report.errors.length > 0 && <ul className="small">{report.errors.slice(0, 50).map((e) => <li key={e.line}>Ligne {e.line} : {e.message}</li>)}</ul>}
            </div>
          )}
        </div>
        <div className="card card-pad stack">
          <h2>Exporter</h2>
          <p className="muted">Export complet du parc au format CSV (ouvrable dans Excel). Pour un export filtré, utilisez le bouton « Exporter » de la liste des équipements.</p>
          <div><button className="btn" onClick={() => download('/assets/export.csv', 'samc-invent-equipements.csv')}>⇩ Exporter tout le parc</button></div>
          <p className="muted small">Les rapports de campagne (trouvés, déplacés, manquants, inconnus) s'exportent depuis la page de chaque campagne.</p>
        </div>
      </div>
    </div>
  );
}

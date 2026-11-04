import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Field, Spinner, Empty } from '../components/ui.jsx';
import { useRefs } from '../components/refs.js';
import LocationSelect from '../components/LocationSelect.jsx';
import QrImg from '../components/QrImg.jsx';

const FORMATS = {
  standard: { label: '3 colonnes — 32 mm', cols: 3, h: '32mm' },
  small: { label: '4 colonnes — 24 mm', cols: 4, h: '24mm' },
  large: { label: '2 colonnes — 45 mm', cols: 2, h: '45mm' },
};

export default function Labels() {
  const [params] = useSearchParams();
  const { sites } = useRefs();
  const [mode, setMode] = useState(params.get('mode') || 'assets');
  const [locationId, setLocationId] = useState(null);
  const [siteId, setSiteId] = useState('');
  const [format, setFormat] = useState('standard');
  const [items, setItems] = useState(null);
  const [settings, setSettings] = useState({});
  const ids = params.get('ids');

  useEffect(() => { api('/settings').then(setSettings); }, []);

  useEffect(() => {
    setItems(null);
    if (mode === 'locations') {
      api(`/locations${qs({ site_id: siteId })}`).then((locs) => setItems(locs.map((l) => ({
        key: `l${l.id}`, code: l.code || `LOC-${l.id}`, title: l.name, sub: [l.site_name, l.building && `Bât. ${l.building}`, l.floor && `Ét. ${l.floor}`].filter(Boolean).join(' › '), missing: !l.code,
      }))));
    } else {
      if (!ids && !locationId) { setItems([]); return; }
      api(`/assets${qs({ ids: ids || undefined, location_id: ids ? undefined : locationId, limit: 1000, sort: 'code', dir: 'asc' })}`)
        .then((r) => setItems(r.items.map((a) => ({ key: `a${a.id}`, code: a.code, title: a.label, sub: a.location_name || '' }))));
    }
  }, [mode, ids, locationId, siteId]);

  const f = FORMATS[format];
  return (
    <div className="stack">
      <div className="page-head no-print">
        <div><h1>Étiquettes QR</h1><div className="sub">Imprimez les étiquettes à coller sur les équipements et à l'entrée des salles</div></div>
        <button className="btn btn-primary right" onClick={() => window.print()} disabled={!items?.length}>🖨 Imprimer ({items?.length || 0})</button>
      </div>

      <div className="card card-pad no-print">
        <div className="row gap wrap" style={{ alignItems: 'flex-end' }}>
          <Field label="Type d'étiquettes">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="assets">Équipements</option>
              <option value="locations">Salles / localisations</option>
            </select>
          </Field>
          {mode === 'assets' && !ids && <Field label="Équipements de la salle"><LocationSelect value={locationId} onChange={setLocationId} emptyLabel="Choisir une salle…" /></Field>}
          {mode === 'assets' && ids && <div className="info-box">{ids.split(',').length} équipement(s) sélectionné(s) depuis la liste</div>}
          {mode === 'locations' && (
            <Field label="Site">
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Tous les sites</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        {mode === 'locations' && items?.some((i) => i.missing) && (
          <div className="info-box" style={{ marginTop: 12 }}>Certaines salles n'ont pas de code : un code provisoire LOC-&lt;id&gt; est utilisé. Définissez un code dans « Sites & salles » pour des étiquettes durables.</div>
        )}
      </div>

      {items === null ? <Spinner /> : items.length === 0 ? (
        <div className="card no-print"><Empty title="Aucune étiquette à afficher">Sélectionnez des équipements depuis la liste ou choisissez une salle.</Empty></div>
      ) : (
        <div className="labels-sheet" style={{ '--cols': f.cols, '--h': f.h }}>
          {items.map((it) => (
            <div className="label" key={it.key}>
              <QrImg value={it.code} size={200} />
              <div style={{ minWidth: 0 }}>
                <div className="l-org">{settings.organization_name || 'SAMC'}</div>
                <div className="l-code">{it.code}</div>
                <div className="l-name">{it.title}</div>
                {format !== 'small' && <div className="l-foot">{mode === 'locations' ? it.sub : settings.label_footer}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

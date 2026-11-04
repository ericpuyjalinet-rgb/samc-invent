import { useRefs } from './refs.js';

/** Liste déroulante des salles groupées par site. */
export default function LocationSelect({ value, onChange, emptyLabel = '— Non localisé —', siteId, ...rest }) {
  const { sites, locations } = useRefs();
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} {...rest}>
      <option value="">{emptyLabel}</option>
      {sites.filter((s) => !siteId || s.id === Number(siteId)).map((s) => (
        <optgroup key={s.id} label={s.name}>
          {locations.filter((l) => l.site_id === s.id).map((l) => (
            <option key={l.id} value={l.id}>
              {[l.building && `Bât. ${l.building}`, l.floor && `Ét. ${l.floor}`, l.name].filter(Boolean).join(' › ')}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

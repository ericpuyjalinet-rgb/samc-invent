import { useRefs } from './refs.js';

/** Liste déroulante des services gestionnaires, les services rattachés sous leur direction. */
export default function ServiceSelect({ value, onChange, emptyLabel = '— Aucun service —', ...rest }) {
  const { services } = useRefs();
  const roots = services.filter((s) => !s.parent_id);
  const childrenOf = (id) => services.filter((s) => s.parent_id === id);
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} {...rest}>
      <option value="">{emptyLabel}</option>
      {roots.map((r) => (
        [<option key={r.id} value={r.id}>{r.name}</option>,
          ...childrenOf(r.id).map((c) => <option key={c.id} value={c.id}>&nbsp;&nbsp;↳ {c.name}</option>)]
      ))}
    </select>
  );
}

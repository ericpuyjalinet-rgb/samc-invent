export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Encapsule un handler (sync ou async) pour remonter les erreurs. */
export const h = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) { next(e); }
};

export const nullIfEmpty = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : v);

/** Ne garde que les clés autorisées, chaînes vides -> null. */
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && k in obj) out[k] = nullIfEmpty(obj[k]);
  return out;
}

/** Comme pick mais toutes les clés sont présentes (absentes -> null). */
export function pickAll(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = nullIfEmpty(obj?.[k]);
  return out;
}

// ---- CSV (séparateur ; pour compatibilité Excel FR) ----
export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

import { useEffect, useState } from 'react';
import { api } from '../api.js';

let cache = null;
let pending = null;
const listeners = new Set();

export function invalidateRefs() {
  cache = null;
  load();
}

function load() {
  pending = Promise.all([api('/categories'), api('/sites'), api('/locations')])
    .then(([categories, sites, locations]) => {
      cache = { categories, sites, locations };
      listeners.forEach((l) => l(cache));
      return cache;
    })
    .finally(() => { pending = null; });
  return pending;
}

/** Référentiels partagés (catégories, sites, localisations) avec cache. */
export function useRefs() {
  const [refs, setRefs] = useState(cache);
  useEffect(() => {
    listeners.add(setRefs);
    if (!cache && !pending) load();
    return () => listeners.delete(setRefs);
  }, []);
  return refs || { categories: [], sites: [], locations: [] };
}

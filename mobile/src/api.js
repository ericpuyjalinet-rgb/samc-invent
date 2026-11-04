const TOKEN_KEY = 'samc_mobile_token';
const USER_KEY = 'samc_mobile_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getStoredUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };
export function setSession(token, user) {
  if (token) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, timeout = 20000 } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal });
  } catch {
    throw new ApiError('Réseau indisponible', 0);
  } finally { clearTimeout(t); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('samc:unauthorized'));
  if (!res.ok) throw new ApiError(data?.error || `Erreur ${res.status}`, res.status);
  return data;
}

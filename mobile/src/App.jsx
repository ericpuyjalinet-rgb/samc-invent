import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredUser, getToken, setSession } from './api.js';
import { countOps, loadCampaign, syncCampaign, kvGet, kvSet } from './store.js';
import Login from './screens/Login.jsx';
import Home from './screens/Home.jsx';
import CampaignScreen from './screens/Campaign.jsx';
import Room from './screens/Room.jsx';
import Lookup from './screens/Lookup.jsx';

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));
  const [screen, setScreen] = useState({ name: 'home' });
  const [bundle, setBundle] = useState(null); // campagne chargée (avec relevés locaux fusionnés)
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [sync, setSync] = useState({ busy: false, error: '', at: null });
  const [toast, setToast] = useState(null);
  const bundleRef = useRef(null);
  bundleRef.current = bundle;

  const notify = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, id: Math.random() });
  }, []);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const refreshPending = useCallback(() => countOps().then(setPending), []);

  // Connectivité
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const unauthorized = () => { setSession(null); setUser(null); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('samc:unauthorized', unauthorized);
    refreshPending();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('samc:unauthorized', unauthorized);
    };
  }, [refreshPending]);

  const openCampaign = useCallback(async (id, { silent } = {}) => {
    try {
      const b = await loadCampaign(id, user);
      setBundle(b);
      await kvSet('last_campaign', id);
      if (!silent && b.fromCache) notify('Hors-ligne : données de la dernière synchronisation', 'warn');
      return b;
    } catch (e) {
      notify(e.message, 'err');
      throw e;
    }
  }, [user, notify]);

  /** Synchronise puis recharge les relevés des autres agents. */
  const doSync = useCallback(async ({ quiet } = {}) => {
    const b = bundleRef.current;
    if (!b) return;
    setSync((s) => ({ ...s, busy: true, error: '' }));
    try {
      const r = await syncCampaign(b.campaign.id);
      const fresh = await loadCampaign(b.campaign.id, user);
      if (bundleRef.current?.campaign.id === b.campaign.id) setBundle(fresh);
      setSync({ busy: false, error: fresh.fromCache ? 'Hors-ligne' : '', at: new Date() });
      if (!quiet && r.sent) notify(`${r.sent} relevé(s) synchronisé(s)`);
      if (r.failed) notify(`${r.failed} relevé(s) rejeté(s) par le serveur`, 'err');
    } catch (e) {
      setSync({ busy: false, error: e.message, at: null });
      if (!quiet) notify(e.status === 0 ? 'Hors-ligne : les relevés seront envoyés plus tard' : e.message, e.status === 0 ? 'warn' : 'err');
    } finally { refreshPending(); }
  }, [user, notify, refreshPending]);

  // Synchronisation automatique : retour du réseau + toutes les 30 s
  useEffect(() => {
    if (!bundle || !online) return undefined;
    doSync({ quiet: true });
    const t = setInterval(() => doSync({ quiet: true }), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, bundle?.campaign.id]);

  // Ouverture directe : /mobile/?campagne=ID (QR affiché dans l'administration) ou dernière campagne
  useEffect(() => {
    if (!user) return;
    const fromUrl = Number(new URLSearchParams(window.location.search).get('campagne'));
    (fromUrl ? Promise.resolve(fromUrl) : kvGet('last_campaign')).then((id) => {
      if (!id) return;
      openCampaign(id, { silent: true }).then(() => setScreen({ name: 'campaign' })).catch(() => {});
      if (fromUrl) window.history.replaceState(null, '', window.location.pathname);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const logout = async () => {
    const n = await countOps();
    if (n && !window.confirm(`${n} relevé(s) ne sont pas encore synchronisés et seront conservés sur cet appareil. Se déconnecter ?`)) return;
    setSession(null); setUser(null); setBundle(null); setScreen({ name: 'home' });
  };

  if (!user) {
    return <Login onLogged={(token, u) => { setSession(token, u); setUser(u); }} />;
  }

  const common = { user, online, pending, sync, onSync: () => doSync(), notify };
  let content;
  if (screen.name === 'lookup') {
    content = <Lookup {...common} bundle={bundle} onBack={() => setScreen({ name: bundle ? 'campaign' : 'home' })} />;
  } else if (screen.name === 'room' && bundle) {
    content = (
      <Room {...common} bundle={bundle} roomId={screen.roomId}
        onBack={() => setScreen({ name: 'campaign' })}
        onChangeRoom={(roomId) => setScreen({ name: 'room', roomId })}
        onLocalChange={async () => {
          const b = await loadCampaign(bundle.campaign.id, user, { preferCache: true });
          setBundle(b); refreshPending();
          if (navigator.onLine) doSync({ quiet: true });
        }} />
    );
  } else if (screen.name === 'campaign' && bundle) {
    content = (
      <CampaignScreen {...common} bundle={bundle}
        onBack={() => setScreen({ name: 'home' })}
        onOpenRoom={(roomId) => setScreen({ name: 'room', roomId })}
        onLookup={() => setScreen({ name: 'lookup' })} />
    );
  } else {
    content = (
      <Home {...common} onLogout={logout} current={bundle}
        onOpen={async (id) => { await openCampaign(id); setScreen({ name: 'campaign' }); }}
        onLookup={() => setScreen({ name: 'lookup' })} />
    );
  }

  return (
    <>
      {!online && <div className="offline-banner">Mode hors-ligne — {pending} relevé(s) en attente d'envoi</div>}
      {content}
      {toast && <div key={toast.id} className={`toast toast-${toast.tone}`}>{toast.message}</div>}
    </>
  );
}


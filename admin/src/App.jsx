import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Assets from './pages/Assets.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import Labels from './pages/Labels.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Locations from './pages/Locations.jsx';
import Categories from './pages/Categories.jsx';
import Users from './pages/Users.jsx';
import ImportPage from './pages/Import.jsx';
import Settings from './pages/Settings.jsx';
import { ROLE } from './labels.js';

const NAV = [
  { section: 'Pilotage' },
  { to: '/', label: 'Tableau de bord', ico: '◧', end: true },
  { section: 'Parc' },
  { to: '/equipements', label: 'Équipements', ico: '▤' },
  { to: '/etiquettes', label: 'Étiquettes QR', ico: '▦' },
  { to: '/import', label: 'Import / Export', ico: '⇅' },
  { section: 'Inventaire' },
  { to: '/campagnes', label: 'Campagnes', ico: '✓' },
  { section: 'Référentiels' },
  { to: '/localisations', label: 'Sites & salles', ico: '⌂' },
  { to: '/categories', label: 'Catégories', ico: '◈' },
  { section: 'Administration', admin: true },
  { to: '/utilisateurs', label: 'Utilisateurs', ico: '☺', admin: true },
  { to: '/parametres', label: 'Paramètres', ico: '⚙' },
];

export default function App() {
  const { user, loading, logout } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  const isAdmin = user.role === 'admin';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" className="brand-logo" alt="" />
          <div>SAMC Invent<small>Gestion d'inventaire</small></div>
        </div>
        <nav className="nav">
          {NAV.filter((n) => !n.admin || isAdmin).map((n, i) => n.section
            ? <div key={i} className="nav-section">{n.section}</div>
            : <NavLink key={n.to} to={n.to} end={n.end}><span className="nav-ico">{n.ico}</span>{n.label}</NavLink>)}
          <a href="/mobile/" target="_blank" rel="noreferrer"><span className="nav-ico">▢</span>App mobile ↗</a>
        </nav>
        <div className="sidebar-foot">
          <div className="name">{user.name}</div>
          <div className="small">{ROLE[user.role]?.label}</div>
          <button className="link-btn small" style={{ color: '#93c5fd', marginTop: 6 }} onClick={logout}>Se déconnecter</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/equipements" element={<Assets />} />
          <Route path="/equipements/:id" element={<AssetDetail />} />
          <Route path="/etiquettes" element={<Labels />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/campagnes" element={<Campaigns />} />
          <Route path="/campagnes/:id" element={<CampaignDetail />} />
          <Route path="/localisations" element={<Locations />} />
          <Route path="/categories" element={<Categories />} />
          {isAdmin && <Route path="/utilisateurs" element={<Users />} />}
          <Route path="/parametres" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

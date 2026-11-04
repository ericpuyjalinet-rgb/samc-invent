// Jeu de données de démonstration : node src/seed.js
import bcrypt from 'bcryptjs';
import { db, ready, tx, nextAssetCode, logHistory } from './db.js';

await ready;
const { n: count } = await db.get('SELECT COUNT(*) AS n FROM assets');
if (count > 0 && !process.argv.includes('--force')) {
  console.log(`La base contient déjà ${count} équipements. Utilisez --force pour ajouter quand même les données de démo.`);
  process.exit(0);
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const users = [
  ['admin@samc.local', 'Administrateur', 'admin', 'admin1234'],
  ['gestion@samc.local', 'Claire Gestion', 'gestionnaire', 'gestion1234'],
  ['agent@samc.local', 'Paul Agent', 'agent', 'agent1234'],
];

await tx(async (t) => {
  for (const [email, name, role, pwd] of users) {
    await t.run('INSERT INTO users(email, name, role, password_hash) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      email, name, role, bcrypt.hashSync(pwd, 10));
  }
  const cats = [
    ['Ordinateur portable', 'informatique', 4], ['Ordinateur fixe', 'informatique', 5], ['Écran', 'informatique', 5],
    ['Imprimante', 'informatique', 5], ['Téléphone IP', 'informatique', 5], ['Vidéoprojecteur', 'informatique', 5],
    ['Bureau', 'mobilier', 10], ['Fauteuil de bureau', 'mobilier', 10], ['Armoire', 'mobilier', 10],
    ['Caisson', 'mobilier', 10], ['Table de réunion', 'mobilier', 10], ['Climatiseur mobile', 'autre', 5],
  ];
  for (const [n, f, d] of cats) await t.run('INSERT INTO categories(name, family, depreciation_years) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', n, f, d);
  const catId = Object.fromEntries((await t.all('SELECT id, name FROM categories')).map((c) => [c.name, c.id]));

  const sites = [['Siège', '12 avenue de la République, 75011 Paris'], ['Agence Lyon', '5 rue de la Part-Dieu, 69003 Lyon']];
  for (const [n, a] of sites) await t.run('INSERT INTO sites(name, address) VALUES (?, ?) ON CONFLICT DO NOTHING', n, a);
  const siteId = Object.fromEntries((await t.all('SELECT id, name FROM sites')).map((s) => [s.name, s.id]));
  const locs = [
    ['Siège', 'A', 'RDC', 'Accueil', 'LOC-A0-ACC'], ['Siège', 'A', '1', 'Bureau 101', 'LOC-A1-101'],
    ['Siège', 'A', '1', 'Bureau 102', 'LOC-A1-102'], ['Siège', 'A', '1', 'Salle de réunion Horizon', 'LOC-A1-SRH'],
    ['Siège', 'A', '2', 'Open space Direction', 'LOC-A2-OSD'], ['Siège', 'B', 'RDC', 'Local informatique', 'LOC-B0-INF'],
    ['Siège', 'B', 'SS', 'Stock / Réserve', 'LOC-BS-STK'],
    ['Agence Lyon', null, 'RDC', 'Bureau commercial', 'LOC-LY-COM'], ['Agence Lyon', null, '1', 'Salle de formation', 'LOC-LY-FOR'],
  ];
  for (const [s, b, f, n, c] of locs) await t.run('INSERT INTO locations(site_id, building, floor, name, code) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', siteId[s], b, f, n, c);
  const locIds = await t.all('SELECT id, name FROM locations');
  const stock = locIds.find((l) => l.name === 'Stock / Réserve');

  const models = [
    ['Ordinateur portable', 'PC portable', [['Dell', 'Latitude 5440', 1150], ['HP', 'EliteBook 840 G10', 1290], ['Lenovo', 'ThinkPad T14', 1240]]],
    ['Ordinateur fixe', 'Unité centrale', [['Dell', 'OptiPlex 7010', 890], ['HP', 'ProDesk 400 G9', 760]]],
    ['Écran', 'Écran 24"', [['Dell', 'P2423D', 240], ['Iiyama', 'ProLite XUB2493', 170]]],
    ['Imprimante', 'Imprimante multifonction', [['Brother', 'MFC-L8900CDW', 640], ['Canon', 'i-SENSYS MF455dw', 420]]],
    ['Téléphone IP', 'Téléphone IP', [['Yealink', 'T54W', 160]]],
    ['Vidéoprojecteur', 'Vidéoprojecteur', [['Epson', 'EB-W51', 520]]],
    ['Bureau', 'Bureau droit 160x80', [['Bruneau', 'Excellens', 320], ['Majencia', 'Arko', 410]]],
    ['Fauteuil de bureau', 'Fauteuil ergonomique', [['Steelcase', 'Series 1', 480], ['Sokoa', 'Olympe', 290]]],
    ['Armoire', 'Armoire haute à rideaux', [['Bruneau', 'Classeur 198cm', 360]]],
    ['Caisson', 'Caisson mobile 3 tiroirs', [['Bruneau', 'Excellens', 140]]],
    ['Table de réunion', 'Table de réunion 8 places', [['Majencia', 'Arko', 890]]],
  ];
  const people = ['Jean Dupont', 'Marie Martin', 'Luc Bernard', 'Sophie Petit', 'Karim Haddad', 'Emma Leroy', null, null];
  const user = await t.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  for (let i = 0; i < 120; i++) {
    const [cat, label, opts] = rand(models);
    const [brand, model, price] = rand(opts);
    const isIT = ['Ordinateur portable', 'Ordinateur fixe', 'Écran', 'Imprimante', 'Téléphone IP', 'Vidéoprojecteur'].includes(cat);
    const year = 2019 + Math.floor(Math.random() * 6);
    const date = `${year}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
    const status = Math.random() < 0.08 ? 'en_stock' : Math.random() < 0.04 ? 'en_reparation' : 'en_service';
    const loc = status === 'en_stock' ? stock : rand(locIds);
    const { lastInsertRowid: id } = await t.run(`INSERT INTO assets(code, label, category_id, brand, model, serial_number, location_id, assigned_to, status,
      condition, purchase_date, purchase_price, supplier, warranty_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      await nextAssetCode(t), `${label} ${brand} ${model}`, catId[cat], brand, model,
      isIT ? `${brand.slice(0, 2).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}` : null,
      loc.id, isIT ? rand(people) : null, status, rand(['neuf', 'bon', 'bon', 'bon', 'moyen', 'moyen', 'mauvais']), date,
      price, isIT ? rand(['Bechtle', 'Inmac Wstore', 'LDLC Pro']) : rand(['Bureau Vallée Pro', 'Manutan']),
      isIT ? `${year + 3}${date.slice(4)}` : null);
    await logHistory(id, user.id, 'creation', { source: 'démo' }, t);
  }
});
console.log('Données de démonstration créées.');
console.log('Comptes : admin@samc.local / admin1234 · gestion@samc.local / gestion1234 · agent@samc.local / agent1234');

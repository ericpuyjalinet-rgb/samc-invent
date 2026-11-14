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
  // Catégories : compte d'imputation M57 et durée d'amortissement (délibération type)
  const cats = [
    ['Ordinateur portable', 'informatique', 4, '2183'], ['Ordinateur fixe', 'informatique', 5, '2183'], ['Écran', 'informatique', 5, '2183'],
    ['Imprimante', 'informatique', 5, '2183'], ['Téléphone IP', 'informatique', 5, '2183'], ['Vidéoprojecteur', 'informatique', 5, '2183'],
    ['Tableau numérique interactif', 'informatique', 5, '2183'],
    ['Bureau', 'mobilier', 10, '2184'], ['Fauteuil de bureau', 'mobilier', 10, '2184'], ['Armoire', 'mobilier', 10, '2184'],
    ['Caisson', 'mobilier', 10, '2184'], ['Table de réunion', 'mobilier', 10, '2184'], ['Mobilier scolaire', 'mobilier', 10, '2184'],
    ['Climatiseur mobile', 'autre', 5, '2188'], ['Autolaveuse', 'autre', 8, '2158'],
  ];
  for (const [n, f, d, acc] of cats) {
    await t.run(`INSERT INTO categories(name, family, depreciation_years, account_code) VALUES (?, ?, ?, ?)
      ON CONFLICT (name) DO UPDATE SET account_code = excluded.account_code`, n, f, d, acc);
  }
  const catId = Object.fromEntries((await t.all('SELECT id, name FROM categories')).map((c) => [c.name, c.id]));

  // Services gestionnaires
  const dgs = (await t.run(`INSERT INTO services(name, code, manager_name) VALUES ('Direction générale des services', 'DGS', 'Directrice générale')
    ON CONFLICT (name) DO UPDATE SET code = excluded.code RETURNING id`)).lastInsertRowid;
  const svcs = [['Ressources humaines', 'RH'], ['Finances et commande publique', 'FIN'], ['Accueil et état civil', 'EC'],
    ['Services techniques', 'ST'], ['Affaires scolaires', 'SCO'], ['Médiathèque', 'MED'], ['Police municipale', 'PM']];
  for (const [n, c] of svcs) await t.run('INSERT INTO services(name, code, parent_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', n, c, dgs);
  const svcId = Object.fromEntries((await t.all('SELECT id, code FROM services')).map((x) => [x.code, x.id]));

  const sites = [['Hôtel de ville', '1 place de la Mairie'], ['Centre technique municipal', 'Zone artisanale, rue des Artisans'],
    ['École élémentaire Jules Ferry', '8 rue des Écoles'], ['Médiathèque', '3 rue Victor Hugo']];
  for (const [n, a] of sites) await t.run('INSERT INTO sites(name, address) VALUES (?, ?) ON CONFLICT DO NOTHING', n, a);
  const siteId = Object.fromEntries((await t.all('SELECT id, name FROM sites')).map((x) => [x.name, x.id]));
  // [site, bâtiment, étage, salle, code, service occupant]
  const locs = [
    ['Hôtel de ville', null, 'RDC', 'Accueil', 'HDV-0-ACC', 'EC'], ['Hôtel de ville', null, 'RDC', 'État civil', 'HDV-0-ECV', 'EC'],
    ['Hôtel de ville', null, '1', 'Bureau du DGS', 'HDV-1-DGS', 'DGS'], ['Hôtel de ville', null, '1', 'Ressources humaines', 'HDV-1-RH', 'RH'],
    ['Hôtel de ville', null, '1', 'Finances', 'HDV-1-FIN', 'FIN'], ['Hôtel de ville', null, '1', 'Salle du conseil', 'HDV-1-CON', 'DGS'],
    ['Hôtel de ville', null, 'SS', 'Archives et réserve', 'HDV-S-RES', 'DGS'], ['Hôtel de ville', null, 'RDC', 'Poste de police municipale', 'HDV-0-PM', 'PM'],
    ['Centre technique municipal', null, 'RDC', 'Bureau des services techniques', 'CTM-0-BUR', 'ST'], ['Centre technique municipal', null, 'RDC', 'Atelier', 'CTM-0-ATL', 'ST'],
    ['École élémentaire Jules Ferry', null, 'RDC', 'Classe CP', 'ECO-0-CP', 'SCO'], ['École élémentaire Jules Ferry', null, '1', 'Classe CM2', 'ECO-1-CM2', 'SCO'],
    ['École élémentaire Jules Ferry', null, 'RDC', 'Direction de l\'école', 'ECO-0-DIR', 'SCO'],
    ['Médiathèque', null, 'RDC', 'Espace public numérique', 'MED-0-EPN', 'MED'], ['Médiathèque', null, '1', 'Bureau des bibliothécaires', 'MED-1-BUR', 'MED'],
  ];
  for (const [st, b, f, n, c] of locs) {
    await t.run('INSERT INTO locations(site_id, building, floor, name, code) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', siteId[st], b, f, n, c);
  }
  const locRows = await t.all('SELECT id, code FROM locations');
  const locByCode = Object.fromEntries(locRows.map((l) => [l.code, l.id]));
  const placed = locs.map(([, , , , c, sv]) => ({ id: locByCode[c], service: svcId[sv], code: c }));
  const reserve = placed.find((l) => l.code === 'HDV-S-RES');

  // [catégorie, désignation, [[marque, modèle, prix TTC]], salles possibles (préfixe de code)]
  const models = [
    ['Ordinateur portable', 'PC portable', [['Dell', 'Latitude 5440', 1150], ['HP', 'EliteBook 840 G10', 1290], ['Lenovo', 'ThinkPad T14', 1240]], ['HDV', 'CTM', 'MED']],
    ['Ordinateur fixe', 'Unité centrale', [['Dell', 'OptiPlex 7010', 890], ['HP', 'ProDesk 400 G9', 760]], ['HDV', 'MED', 'ECO']],
    ['Écran', 'Écran 24"', [['Dell', 'P2423D', 240], ['Iiyama', 'ProLite XUB2493', 170]], ['HDV', 'MED', 'CTM']],
    ['Imprimante', 'Imprimante multifonction', [['Brother', 'MFC-L8900CDW', 640], ['Canon', 'i-SENSYS MF455dw', 420]], ['HDV', 'CTM', 'ECO']],
    ['Téléphone IP', 'Téléphone IP', [['Yealink', 'T54W', 160]], ['HDV', 'CTM']],
    ['Tableau numérique interactif', 'Écran numérique interactif 75"', [['Promethean', 'ActivPanel 9', 3900]], ['ECO-0-CP', 'ECO-1-CM2']],
    ['Vidéoprojecteur', 'Vidéoprojecteur', [['Epson', 'EB-W51', 520]], ['HDV-1-CON', 'MED']],
    ['Bureau', 'Bureau droit 160x80', [['Bruneau', 'Excellens', 320], ['Majencia', 'Arko', 410]], ['HDV', 'CTM-0-BUR', 'MED-1-BUR']],
    ['Fauteuil de bureau', 'Fauteuil ergonomique', [['Steelcase', 'Series 1', 480], ['Sokoa', 'Olympe', 290]], ['HDV', 'CTM-0-BUR', 'MED-1-BUR']],
    ['Armoire', 'Armoire haute à rideaux', [['Bruneau', 'Classeur 198cm', 360]], ['HDV', 'ECO-0-DIR']],
    ['Mobilier scolaire', 'Lot table + chaise élève', [['Manutan', 'Taille 6', 135]], ['ECO-0-CP', 'ECO-1-CM2']],
    ['Table de réunion', 'Table de réunion 12 places', [['Majencia', 'Arko', 1890]], ['HDV-1-CON']],
    ['Autolaveuse', 'Autolaveuse autoportée', [['Kärcher', 'B 50 W', 6200]], ['CTM-0-ATL']],
  ];
  const people = ['Jean Dupont', 'Marie Martin', 'Luc Bernard', 'Sophie Petit', 'Karim Haddad', 'Emma Leroy', null, null];
  const contracts = { informatique: ['UGAP', 'MAPA-2023-04 Informatique', 'MAPA-2025-02 Postes de travail'], mobilier: ['MAPA-2022-07 Mobilier', 'UGAP'], autre: ['MAPA-2021-05 Matériel technique'] };
  const user = await t.get(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  const invSeq = {};
  let mandate = 100;
  for (let i = 0; i < 120; i++) {
    const [cat, label, opts, where] = rand(models);
    const [brand, model, price] = rand(opts);
    const family = ['Bureau', 'Fauteuil de bureau', 'Armoire', 'Mobilier scolaire', 'Table de réunion'].includes(cat) ? 'mobilier'
      : cat === 'Autolaveuse' ? 'autre' : 'informatique';
    const isIT = family === 'informatique';
    const year = 2018 + Math.floor(Math.random() * 8);
    const date = `${year}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
    const status = Math.random() < 0.07 ? 'en_stock' : Math.random() < 0.03 ? 'en_reparation' : 'en_service';
    const candidates = placed.filter((l) => where.some((w) => l.code.startsWith(w)));
    const loc = status === 'en_stock' ? reserve : rand(candidates);
    const don = Math.random() < 0.04;
    invSeq[year] = (invSeq[year] || 0) + 1;
    mandate += 1 + Math.floor(Math.random() * 3);
    const { lastInsertRowid: id } = await t.run(`INSERT INTO assets(code, label, category_id, brand, model, serial_number, location_id, assigned_to,
        status, condition, purchase_date, purchase_price, supplier, warranty_end, service_id, inventory_number, acquisition_mode, fiscal_year,
        mandate_number, invoice_number, contract_number, commissioning_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    await nextAssetCode(t), `${label} ${brand} ${model}`, catId[cat], brand, model,
    isIT ? `${brand.slice(0, 2).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}` : null,
    loc.id, isIT && loc.service !== svcId.SCO ? rand(people) : null, status,
    rand(['neuf', 'bon', 'bon', 'bon', 'moyen', 'moyen', 'mauvais']), date, price,
    isIT ? rand(['Bechtle', 'Inmac Wstore', 'UGAP']) : rand(['Manutan Collectivités', 'UGAP', 'Bruneau']),
    isIT ? `${year + 3}${date.slice(4)}` : null, loc.service,
    `${year}-${String(invSeq[year]).padStart(4, '0')}`, don ? 'don' : 'achat', year,
    don ? null : `${year}-${String(mandate).padStart(5, '0')}`, don ? null : `F${String(year).slice(2)}-${String(1000 + i)}`,
    don ? null : rand(contracts[family]), date);
    await logHistory(id, user.id, 'creation', { source: 'démo' }, t);
  }
  await t.run(`INSERT INTO settings(key, value) VALUES ('organization_name', 'Commune de Démo-sur-Loire') ON CONFLICT (key) DO NOTHING`);
  await t.run(`INSERT INTO settings(key, value) VALUES ('label_footer', 'Propriété de la commune — inventaire') ON CONFLICT (key) DO NOTHING`);
});
console.log('Données de démonstration créées.');
console.log('Comptes : admin@samc.local / admin1234 · gestion@samc.local / gestion1234 · agent@samc.local / agent1234');

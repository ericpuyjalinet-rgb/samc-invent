# SAMC Invent

Logiciel d'inventaire d'équipements : matériel informatique, mobilier de bureau et autres biens.

| Application | URL | Utilisateurs |
|---|---|---|
| **Administration** (web) | `http://serveur:3000/` | Administrateurs, gestionnaires |
| **Saisie d'inventaire** (PWA mobile) | `http://serveur:3000/mobile/` | Agents d'inventaire (et gestionnaires) |

## Fonctionnalités

**Administration**
- Tableau de bord : effectifs, valeur du parc, répartition par famille, statut, état, catégorie, site ; activité récente.
- Équipements : fiche complète (code inventaire, désignation, catégorie, marque, modèle, n° de série, localisation, affectation, statut, état, achat, fournisseur, garantie, photo, notes), recherche plein texte, filtres, tri, actions groupées (déplacer, changer statut / état / catégorie, supprimer), historique de toutes les modifications.
- Codes inventaire générés automatiquement (`SAMC-000001`, préfixe paramétrable).
- Étiquettes QR imprimables (3 formats A4) pour les équipements et pour les salles.
- Référentiels : sites › bâtiments › étages › salles (avec code salle), catégories par famille (informatique, mobilier, autre).
- Campagnes d'inventaire : périmètre (salles), lancement (photo figée des équipements attendus), suivi en temps réel par salle, rapprochement **trouvés / déplacés / restants-manquants / inconnus / hors périmètre**, intégration des équipements inconnus au parc, clôture avec report automatique des déplacements, des états constatés et passage des manquants en « Perdu ». Rapport CSV.
- Import CSV (avec simulation, création automatique des sites / salles / catégories) et export CSV compatibles Excel.
- Utilisateurs et rôles : administrateur, gestionnaire, agent.

**Application mobile (PWA)**
- Installable sur l'écran d'accueil (Android / iOS), fonctionne **hors-ligne**.
- Scan QR code et codes-barres (EAN, Code 128, Code 39, DataMatrix…) avec la caméra, lampe torche, ou saisie manuelle du code / n° de série.
- Choix de la salle par liste ou par scan du QR de la salle.
- Par salle : liste « À vérifier » (attendus non encore vus, validables sans scan si l'étiquette manque) et « Relevés ici ».
- Fiche de relevé : résultat immédiat (attendu ici / déplacé / inconnu), état constaté, commentaire, photo.
- Mode **validation rapide** : les équipements attendus sont enregistrés dès le scan (bip + vibration).
- Relevés stockés localement (IndexedDB) et synchronisés automatiquement (retour réseau, toutes les 30 s, ou manuellement) ; synchronisation idempotente, travail à plusieurs agents simultanément.
- Consultation d'un équipement par scan.

## Démarrage rapide

Prérequis : **Node.js 22+** (la base SQLite intégrée à Node est utilisée, aucun serveur de base de données à installer).

```bash
npm install
npm run build        # compile l'administration et la PWA
npm run seed         # (optionnel) données de démonstration
npm start            # http://localhost:3000
```

Comptes de démonstration (après `npm run seed`) :

| Rôle | Email | Mot de passe |
|---|---|---|
| Administrateur | admin@samc.local | admin1234 |
| Gestionnaire | gestion@samc.local | gestion1234 |
| Agent | agent@samc.local | agent1234 |

Sans `seed`, seul le compte administrateur est créé au premier démarrage (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, par défaut `admin@samc.local` / `admin1234`). **Changez ce mot de passe** (Paramètres).

### Développement

```bash
npm run dev
```
Lance l'API (port 3000), l'administration (Vite, port 5173) et la PWA (Vite, port 5174, ouverte sur le réseau local) avec rechargement à chaud.

### Tests

```bash
npm test -w server
```

### Docker

```bash
docker build -t samc-invent .
docker run -d -p 3000:3000 -v samc-data:/data -e JWT_SECRET=changez-moi samc-invent
```

## Mise en production

- **HTTPS obligatoire** pour l'application mobile : les navigateurs n'autorisent la caméra et l'installation PWA qu'en HTTPS (ou sur `localhost`). Placez le serveur derrière un reverse proxy (Nginx, Caddy, Traefik…) avec un certificat.
- Définissez `JWT_SECRET` (sinon un secret est généré et stocké dans la base).
- Sauvegarde : copiez le dossier `DATA_DIR` (fichier `samc-invent.db` + dossier `uploads/` des photos).

## Déroulé type d'un inventaire

1. Créer les sites et salles, imprimer les **étiquettes de salles** (QR à l'entrée de chaque salle).
2. Importer ou saisir le parc, imprimer les **étiquettes d'équipements**.
3. Créer une campagne, choisir le périmètre, la **lancer**.
4. Les agents ouvrent `/mobile/` (ou scannent le QR affiché sur la page de la campagne), choisissent la salle et scannent les équipements.
5. Le gestionnaire suit l'avancement, traite les inconnus, puis **clôture** : les localisations et états sont mis à jour dans le parc.

## Architecture

```
server/   API REST Node.js (Express 5, SQLite node:sqlite, JWT)
  src/routes/   auth, users, referentials (sites, salles, catégories), assets, campaigns, mobile (bootstrap + sync), dashboard
admin/    Application web d'administration (React + Vite)
mobile/   PWA de saisie (React + Vite + vite-plugin-pwa, @zxing/browser, IndexedDB)
```

Le serveur sert l'API sur `/api`, l'administration sur `/` et la PWA sur `/mobile/`.

### Format d'import CSV

Séparateur `;` (ou `,`), encodage UTF-8. Colonnes : `code; designation; categorie; marque; modele; numero_serie; site; batiment; etage; salle; affecte_a; statut; etat; date_achat; prix_achat; fournisseur; fin_garantie; notes` (un modèle est téléchargeable depuis la page Import / Export).

- `statut` : `en_service`, `en_stock`, `en_reparation`, `reforme`, `perdu`
- `etat` : `neuf`, `bon`, `moyen`, `mauvais`, `hs`
- Dates au format `AAAA-MM-JJ`.

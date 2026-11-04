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

## Architecture technique

```
                 ┌──────────────────────── Vercel ────────────────────────┐
 Navigateur  ──► │  /            Administration (React, fichiers statiques) │
 PC / mobile     │  /mobile/     PWA de saisie (React, service worker)      │
                 │  /api/*       Fonction serverless Node.js (Express)  ────┼──► Supabase
                 └──────────────────────────────────────────────────────────┘     • PostgreSQL (données)
                                                                                     • Storage (photos)
```

| Couche | Technologie | Détail |
|---|---|---|
| Base de données | **Supabase PostgreSQL** | Schéma versionné dans `supabase/migrations/`, RLS activé (tables non exposées par l'API REST publique Supabase) |
| Photos | **Supabase Storage** | Bucket public `photos`, créé automatiquement au premier envoi |
| API | Node.js 20+, Express 5 | `server/src` — exécutée en fonction serverless sur Vercel (`api/index.js`) ou en serveur classique en local |
| Authentification | JWT applicatif | Comptes et rôles (admin, gestionnaire, agent) gérés dans la table `users` |
| Administration | React 19 + Vite | `admin/` |
| Application mobile | React 19 + Vite + vite-plugin-pwa | `mobile/` — scan @zxing, hors-ligne IndexedDB, synchronisation idempotente |
| Hébergement | **Vercel** | `vercel.json` : build, routage `/`, `/mobile/`, `/api/*` |

L'API parle PostgreSQL via `DATABASE_URL`. Sans cette variable, elle utilise **PGlite** (PostgreSQL embarqué, stocké dans `server/data/pglite`) : le projet démarre en local sans rien installer d'autre que Node.js, avec exactement le même SQL qu'en production.

### Arborescence

```
dev/samc-invent/
├── admin/                    Application web d'administration
├── mobile/                   PWA de saisie d'inventaire
├── server/
│   ├── src/app.js            Application Express (routes /api)
│   ├── src/index.js          Serveur local (npm start)
│   ├── src/db.js             Accès PostgreSQL / PGlite + migrations
│   ├── src/storage.js        Photos : Supabase Storage ou disque local
│   ├── src/routes/           auth, users, referentials, assets, campaigns, mobile, dashboard
│   └── test/                 Tests d'intégration de l'API
├── api/index.js              Point d'entrée serverless Vercel
├── supabase/
│   ├── config.toml           Configuration Supabase CLI (environnement local)
│   └── migrations/           Schéma SQL versionné
├── scripts/build-vercel.mjs  Assemble admin + mobile dans public/
├── vercel.json
└── .env.example              Modèle de configuration
```

## Environnements

| | Base de données | Photos | Hébergement | Usage |
|---|---|---|---|---|
| **Local — rapide** | PGlite (embarqué) | disque local | `npm run dev` / `npm start` | développement, démo hors connexion |
| **Local — Supabase** | Supabase local (Docker, `npx supabase start`) | Supabase Storage local | `npm run dev` | tester dans les conditions de production |
| **Production** | Supabase cloud | Supabase Storage | Vercel | utilisation réelle |

Prérequis local : **Node.js 22 LTS** (https://nodejs.org ; Node 20+ fonctionne aussi en local) et Git. Docker Desktop uniquement pour « Local — Supabase ».

### 1. Mise en place du poste de développement (`dev/samc-invent`)

```bash
mkdir -p ~/dev && cd ~/dev
git clone <url-du-depot> samc-invent      # ou décompresser l'archive dans ~/dev/samc-invent
cd samc-invent
npm install
cp .env.example .env                        # Windows : copy .env.example .env
```

### 2a. Local rapide (sans Supabase)

Laisser `DATABASE_URL` vide dans `.env`, puis :

```bash
npm run seed      # données de démonstration (facultatif)
npm run dev       # API :3000 · admin http://localhost:5173 · mobile http://localhost:5174/mobile/
```

Ou en mode « production locale » (un seul serveur) : `npm run build && npm start` → http://localhost:3000.

### 2b. Local avec Supabase (Docker)

```bash
npx supabase start            # démarre PostgreSQL, Storage, Studio… et applique supabase/migrations
npx supabase status           # affiche les URL et la clé service_role
```

Dans `.env` :

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<clé service_role affichée par supabase status>
```

Puis `npm run seed` et `npm run dev`. Supabase Studio (interface d'administration de la base) : http://127.0.0.1:54323. Arrêt : `npx supabase stop`.

### 3. Production : Supabase + Vercel

**Supabase**
1. Créer un projet sur https://supabase.com (région Europe, ex. Paris `eu-west-3` ou Francfort).
2. Appliquer le schéma, au choix :
   - `npx supabase link --project-ref <ref>` puis `npx supabase db push` (recommandé) ;
   - ou coller le contenu de `supabase/migrations/*.sql` dans *SQL Editor* ;
   - ou laisser l'API l'appliquer automatiquement au premier démarrage.
3. Relever :
   - *Project Settings › Database › Connection string › **Transaction pooler*** (port 6543) → `DATABASE_URL` ;
   - *Project Settings › API* → `SUPABASE_URL` et la clé **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (secrète, uniquement côté serveur).

**Vercel**
1. Pousser le projet sur GitHub, puis *Add New › Project* sur https://vercel.com et importer le dépôt (les réglages de build sont lus dans `vercel.json`, aucun à saisir).
2. *Settings › Environment Variables* : `DATABASE_URL`, `SUPABASE_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (obligatoire sur Vercel pour créer le premier administrateur), `JWT_SECRET` (facultatif : sinon généré et conservé dans la base).
3. *Deploy*. Administration : `https://<projet>.vercel.app/` — mobile : `https://<projet>.vercel.app/mobile/` (HTTPS fourni par Vercel : caméra et installation PWA fonctionnent).
4. Se connecter avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` et changer le mot de passe.

Chaque `git push` redéploie automatiquement ; les branches obtiennent une URL de prévisualisation.

Vérification locale du build Vercel : `npm run build:vercel` (produit `public/`).

### Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | API + admin + mobile avec rechargement à chaud |
| `npm run build` / `npm start` | compiler puis servir le tout sur http://localhost:3000 |
| `npm run build:vercel` | build tel qu'exécuté par Vercel |
| `npm run seed` | données de démonstration (si la base est vide) |
| `npm run db:migrate` | appliquer les migrations sur la base de `DATABASE_URL` |
| `npm test` | tests d'intégration (PGlite ; ou PostgreSQL si `DATABASE_URL` est défini) |

Comptes de démonstration (après `npm run seed`) : `admin@samc.local` / `admin1234`, `gestion@samc.local` / `gestion1234`, `agent@samc.local` / `agent1234`.

### Évolution du schéma

Ajouter un fichier `supabase/migrations/AAAAMMJJHHMMSS_description.sql` (SQL PostgreSQL idempotent de préférence), puis `npx supabase db push` (production) — en local, l'API l'applique automatiquement au démarrage (suivi dans la table `app_migrations`).

### En cas de problème

| Symptôme | Solution |
|---|---|
| `Node.js … la version 20 ou supérieure est requise` | Installer Node.js LTS, fermer puis rouvrir le terminal |
| `Le port 3000 est déjà utilisé` | Modifier `PORT` dans `.env` |
| Page blanche ou « Cannot GET / » en `npm start` | Lancer `npm run build` avant |
| `password authentication failed` / délai de connexion à Supabase | Vérifier `DATABASE_URL` (pooler « Transaction », port 6543, mot de passe de la base) |
| Photos non enregistrées en production | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` manquants dans Vercel |
| Scripts bloqués dans PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, ou utiliser l'invite de commandes |

### Limites Vercel à connaître

- Taille des requêtes limitée à 4,5 Mo : la PWA découpe automatiquement la synchronisation en lots ; les photos sont compressées (~200 Ko) avant envoi, la photo d'un équipement côté administration est limitée à 4 Mo.
- Durée d'exécution des fonctions : 30 s (configurée dans `vercel.json`), largement suffisante pour l'import de quelques milliers de lignes CSV.

## Déroulé type d'un inventaire

1. Créer les sites et salles, imprimer les **étiquettes de salles** (QR à l'entrée de chaque salle).
2. Importer ou saisir le parc, imprimer les **étiquettes d'équipements**.
3. Créer une campagne, choisir le périmètre, la **lancer**.
4. Les agents ouvrent `/mobile/` (ou scannent le QR affiché sur la page de la campagne), choisissent la salle et scannent les équipements.
5. Le gestionnaire suit l'avancement, traite les inconnus, puis **clôture** : les localisations et états sont mis à jour dans le parc.

### Format d'import CSV

Séparateur `;` (ou `,`), encodage UTF-8. Colonnes : `code; designation; categorie; marque; modele; numero_serie; site; batiment; etage; salle; affecte_a; statut; etat; date_achat; prix_achat; fournisseur; fin_garantie; notes` (modèle téléchargeable depuis la page Import / Export).

- `statut` : `en_service`, `en_stock`, `en_reparation`, `reforme`, `perdu`
- `etat` : `neuf`, `bon`, `moyen`, `mauvais`, `hs`
- Dates au format `AAAA-MM-JJ`.

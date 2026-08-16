# Kiwiture

Web app mobile-first pour trouver **la meilleure borne de recharge** pour son véhicule électrique :
prix, détour réel, temps de trajet et coût estimé — à partir des données publiques IRVE.

Ce n'est pas un annuaire de bornes. La proposition de valeur est la **comparaison immédiate** :
combien ça coûte, quel détour ça représente, et à quel point on peut faire confiance à la donnée.

**100 % frontend.** Aucun backend applicatif, aucune base de données serveur, aucun compte
utilisateur, aucun secret. Le seul serveur nécessaire en production est un hébergeur de fichiers
statiques.

---

## Démarrage

```bash
npm install
npm run dev
```

L'application démarre sur http://localhost:5173/kiwiture/ et **fonctionne sans aucune clé d'API**.

Build de production :

```bash
npm run build     # produit dist/
npm run preview   # sert dist/ localement
```

### Scripts

| Commande            | Rôle                                                  |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | serveur de développement Vite                         |
| `npm run build`     | typecheck puis build statique dans `dist/`            |
| `npm run preview`   | prévisualise le build                                  |
| `npm run typecheck` | TypeScript strict, sans émission                       |
| `npm run lint`      | ESLint                                                 |
| `npm test`          | tests unitaires Vitest                                 |
| `npm run test:e2e`  | tests end-to-end Playwright                            |
| `npm run format`    | Prettier                                               |

---

## Configuration

Copiez `.env.example` vers `.env` si vous voulez changer les valeurs par défaut. **Toutes les
variables sont facultatives.**

```env
VITE_MAPBOX_PUBLIC_TOKEN=
VITE_APP_ENV=development
# VITE_BASE=/
```

### `VITE_MAPBOX_PUBLIC_TOKEN` — facultatif, et **ce n'est pas un secret**

Sans ce jeton, l'application utilise sa pile open source par défaut :

| Fonction    | Fournisseur par défaut                        | Avec un jeton Mapbox |
| ----------- | --------------------------------------------- | -------------------- |
| Carte       | MapLibre GL + tuiles CARTO (OpenStreetMap)    | Mapbox GL styles     |
| Géocodage   | Base Adresse Nationale (data.gouv.fr)         | Mapbox Geocoding     |
| Itinéraires | OSRM (données OpenStreetMap)                  | Mapbox Directions    |

Si vous renseignez ce jeton :

- il doit **impérativement** être un jeton **public** de type `pk.*` ;
- il ne doit **jamais** être un jeton secret `sk.*` — l'application refuse de l'utiliser et
  affiche un avertissement en développement ;
- restreignez-le à vos domaines autorisés (localhost + domaine de production) dans le tableau de
  bord Mapbox.

Règle d'architecture : **si une API exige une clé secrète, elle est incompatible avec ce projet.**
Aucune variable `VITE_*` ne doit contenir de secret : le contenu du bundle est public.

---

## Architecture

```text
Navigateur
  ├── Application React (SPA statique)
  ├── APIs publiques (data.gouv.fr, BAN, OSRM / Mapbox)
  ├── IndexedDB (Dexie)      — cache stations, itinéraires, géocodage
  ├── localStorage           — préférences, véhicules
  └── Cache Storage + Service Worker — shell hors ligne
```

Il n'existe **aucune** route API interne, Server Action, fonction serverless ou proxy maison.

### Arborescence

```text
src/
  app/            App, router, providers, thème
  components/     primitives UI, bottom sheet, bandeau hors ligne
  config/         env (jetons publics, feature flags), constantes de réglage
  features/
    charging-data/irve/   schéma, normalisation, regroupement, repository, API tabulaire
    geocoding/            provider BAN / Mapbox + autocomplete
    geolocation/          hook navigator.geolocation
    map/                  MapLibre, clustering, pins prix
    navigation/           deep links Google Maps / Apple Plans / Waze
    pricing/              parseur de tarif, calcul de coût, affichage honnête du prix
    routing/              providers OSRM / Mapbox, cache, détour, shortlist
    settings/             préférences et véhicules locaux
    stations/             liste, carte station, détail, filtres, scoring
  lib/            geo, network (http + erreurs typées), storage, format, hooks
  pages/          Home, Station, Réglages, Véhicule, Données, Confidentialité
  workers/        worker IRVE (parsing et calculs lourds hors main thread)
```

### Providers interchangeables

Le code métier ne dépend jamais directement d'un fournisseur. Trois interfaces le garantissent :

```ts
interface ChargingStationRepository { getNearby, getById, refresh }
interface GeocodingProvider        { search, reverse }
interface RoutingProvider          { getRoute, getRouteWithWaypoint, getMatrix? }
```

L'UI n'appelle jamais `fetch()` directement vers data.gouv ou Mapbox.

---

## Source des données : Base nationale IRVE

- Page transport : https://transport.data.gouv.fr/datasets/base-nationale-des-irve-infrastructures-de-recharge-pour-vehicules-electriques
- Jeu de données : https://www.data.gouv.fr/datasets/base-nationale-des-irve-infrastructures-de-recharge-pour-vehicules-electriques
- Schéma statique : https://schema.data.gouv.fr/etalab/schema-irve-statique/latest/documentation.html

**Aucune URL de fichier datée n'est codée en dur.** Au démarrage (ou à l'expiration du cache),
l'application interroge l'API data.gouv.fr, sélectionne la ressource consolidée la plus adaptée,
valide la réponse avec Zod, puis met en cache l'identifiant de ressource résolu.

Les lignes sont ensuite lues via l'**API tabulaire data.gouv.fr** (bêta, lecture seule, CORS
ouvert), filtrées sur la zone géographique affichée. Le fichier national fait ~150 Mo : le
télécharger entièrement dans le navigateur serait inacceptable. La zone est sondée avant d'être
chargée, et le rayon est réduit automatiquement dans les secteurs très denses.

Une ligne IRVE = un point de charge. Les lignes partageant `id_station_itinerance` sont regroupées
en une station : puissance = maximum des points, connecteurs = union des points.

---

## Le prix : ce que l'application promet et ce qu'elle ne promet pas

Dans le schéma IRVE, `tarification` est un **champ de texte libre**, pas un modèle tarifaire
structuré. On y trouve aussi bien `0,40 €/kWh pour les non abonnés` que
`Tarification selon abonnement opérateur.` ou rien du tout.

L'application distingue donc quatre états, et ne les mélange jamais :

| État                   | Signification                                                        |
| ---------------------- | -------------------------------------------------------------------- |
| **Prix vérifié**       | garanti par une source structurée fiable. *Aucune source de ce type n'existe aujourd'hui : cette mention n'apparaît pas.* |
| **Prix publié**        | valeur lue dans le texte IRVE et interprétée automatiquement          |
| **Prix estimé**        | valeur déduite d'une donnée partielle (par exemple un nombre sans unité) |
| **Prix non disponible**| texte absent, ambigu ou conditionnel                                  |

Conséquences assumées :

- le parseur **n'invente jamais** de valeur : un texte ambigu reste « prix non disponible » ;
- le **texte tarifaire brut est toujours conservé et affiché** sur la fiche station, même quand un
  prix a été interprété ;
- un montant calculé est toujours présenté comme une estimation : `≈ 14,73 €`, jamais
  « cette recharge coûtera 14,73 € » ;
- les bornes sans prix connu sont exclues d'un filtre « ≤ X €/kWh », sauf option explicite
  « inclure les prix inconnus » ;
- une donnée externe n'est jamais injectée en HTML (`dangerouslySetInnerHTML` est proscrit).

### Disponibilité temps réel

Non affichée. Aucune source fiable et exhaustive n'est accessible depuis le navigateur sans
backend. Le modèle `EVSEStatus` existe pour l'avenir, mais tous les points restent `UNKNOWN`.
Le nombre de points de charge n'est **pas** le nombre de bornes libres à cet instant.

---

## Distances : trois notions distinctes

| Notion               | Calcul                                  | Usage                                        |
| -------------------- | --------------------------------------- | -------------------------------------------- |
| Vol d'oiseau         | Haversine, local, gratuit               | pré-filtrage uniquement, jamais présenté comme routier |
| Distance routière    | API d'itinéraire                        | affichée sur une *shortlist* de bornes        |
| Détour               | `A→S→B` moins `A→B`                     | quand une destination est renseignée          |

Le routing n'est **jamais** appelé pour toutes les bornes visibles : au plus 20 candidats, 4 appels
concurrents, avec une requête matricielle quand le fournisseur la supporte. Les autres bornes
affichent `~ 4,2 km à vol d'oiseau` en toute transparence. Les détours sont bornés à 0 à
l'affichage.

---

## Cache local et mode hors ligne

| Donnée                          | Durée de vie |
| ------------------------------- | ------------ |
| métadonnées du jeu de données   | 6 h          |
| stations IRVE                   | 24 h         |
| géocodage                       | 7 jours      |
| itinéraire court                | 30 min       |
| itinéraire statique             | 24 h         |
| préférences et véhicules        | pas d'expiration |

Hors ligne, l'application conserve son shell, ses préférences, les stations en cache et les
distances déjà calculées ; un bandeau explicite indique que les informations peuvent être
anciennes. Les réponses d'itinéraire et de données ne sont **jamais** mises en cache par le service
worker : leur fraîcheur est pilotée par l'application, avec des TTL explicites.

Le cache local se vide depuis **Réglages → Données locales**.

---

## Tests

```bash
npm test          # 115 tests unitaires
npm run test:e2e  # 15 tests end-to-end × 2 profils (mobile + desktop)
```

Les tests unitaires couvrent le parsing des tarifs (y compris des formats réellement présents dans
la base nationale), la géométrie, le calcul de coût, le regroupement des stations, les filtres, le
scoring et la couche réseau.

Les scénarios E2E couvrent la géolocalisation, le repli sur la recherche d'adresse, les filtres,
l'estimation de coût, la panne de routing, le mode hors ligne et l'absence de secret dans le
bundle — toutes les APIs externes étant simulées. Une suite `axe-core` vérifie en plus la
conformité WCAG 2.1 AA de l'écran principal, des filtres, de la fiche station, des pages statiques
et du thème sombre.

Un test de contrat optionnel interroge les vraies APIs :

```bash
LIVE_IRVE=1 npm test -- live
```

---

## Déploiement statique

Le build ne produit que des fichiers statiques dans `dist/`. Aucune fonction backend.

### GitHub Pages (configuré)

`.github/workflows/deploy-pages.yml` construit et publie le site à chaque push. Le chemin de base
`/kiwiture/` correspond à un site de projet GitHub Pages ; un fichier `404.html` identique à
`index.html` est généré pour que les liens profonds fonctionnent malgré l'absence de règle de
réécriture.

**Étape manuelle unique.** GitHub Pages doit être activé une fois dans les réglages du dépôt : le
jeton d'un workflow n'a pas le droit de créer le site lui-même. Dans
**Settings → Pages**, choisissez **Source : GitHub Actions**. Ensuite, relancez le workflow
*Deploy to GitHub Pages* (onglet Actions → *Run workflow*) ou poussez un commit : le site est publié
sur `https://<utilisateur>.github.io/kiwiture/`.

Pour utiliser Mapbox en production, ajoutez une **variable** de dépôt (pas un secret, puisque la
valeur est publique) nommée `VITE_MAPBOX_PUBLIC_TOKEN` dans
**Settings → Secrets and variables → Actions → Variables**.

### Autres hébergeurs

Netlify, Vercel, Cloudflare Pages ou S3 + CDN servent depuis la racine du domaine :

```bash
VITE_BASE=/ npm run build
```

---

## Confidentialité

L'application n'envoie votre position à **aucun serveur du projet** — il n'en existe aucun. Elle est
en revanche transmise aux fournisseurs de carte, de géocodage et d'itinéraire lorsque ces fonctions
sont utilisées ; la page *Confidentialité* de l'app détaille précisément quoi va où. Aucun
analytics, aucun traceur, aucun cookie tiers.

---

## Licence des données

Les données de bornes proviennent de la Base nationale des IRVE, publiée en open data sur
data.gouv.fr. Les fonds de carte par défaut reposent sur OpenStreetMap (© contributeurs
OpenStreetMap) via CARTO.

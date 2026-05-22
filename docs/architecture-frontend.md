# Architecture du frontend — Olthem

## Vue d'ensemble

Le frontend d'Olthem est une **Single Page Application (SPA) vanilla** qui consomme un backend **WordPress headless** exposé via l'API REST WordPress. Aucun framework JavaScript (React, Vue…) n'est utilisé : l'application repose sur les **ES Modules natifs** du navigateur, sans bundler (Webpack, Vite, etc.).

```
WordPress (headless)          Navigateur
┌─────────────────────┐       ┌───────────────────────────────────┐
│  REST API WP        │ ←───→ │  index.html                       │
│  Custom endpoints   │       │   └── src/js/   (ES Modules)      │
│  ACF, CPT           │       │   └── src/scss/ (compilé → CSS)   │
│  JWT Auth (mu-plug) │       └───────────────────────────────────┘
└─────────────────────┘
```

Le fichier `index.html` est unique et sert de **shell** : la navigation et le rendu des contenus se font dynamiquement via JavaScript, sans rechargement de page.

---

## Structure des dossiers

```
src/js/
├── main.js                        ← point d'entrée principal
├── core/                          ← utilitaires transversaux
│   ├── config.js
│   ├── utils.js
│   ├── rest-client.js
│   └── scroll-lock.js
├── api/                           ← couche d'accès aux données
│   ├── api.js
│   ├── api-mapbox.js
│   └── auth.js
├── components/                    ← composants UI réutilisables
│   ├── burger-menu.js
│   ├── popup.js
│   ├── img-carousel.js
│   ├── scroll.js
│   └── secondary-scroll.js
├── features/                      ← fonctionnalités métier
│   ├── thematiques.js
│   ├── section-builder.js
│   ├── page-overlay.js
│   ├── ateliers-map.js
│   ├── route-overlay.js
│   └── forms/
│       ├── form-builder.js
│       ├── form-validator.js
│       └── form-submit.js
├── admin/                         ← interface d'administration custom
│   ├── admin-tool.js
│   ├── admin-users.js
│   └── admin-ateliers.js
└── helpers/
    └── acf-helpers.js
```

---

## Description des couches

### `core/` — Utilitaires transversaux

Contient les modules sans dépendances vers le reste de l'application. Ils peuvent être importés par n'importe quelle couche.

| Fichier | Rôle |
|---|---|
| `config.js` | URL de base de l'API, constantes globales |
| `utils.js` | Fonctions pures : `esc()` (échappement HTML), `slugify()`, formatage de dates, etc. |
| `rest-client.js` | Wrapper autour de `fetch` : gestion des en-têtes, erreurs HTTP, JSON |
| `scroll-lock.js` | Verrouillage/déverrouillage du scroll page (overlay ouverts) |

> **Sécurité** : la fonction `esc()` de `utils.js` est utilisée systématiquement pour échapper tout contenu HTML dynamique et prévenir les injections XSS.

---

### `api/` — Couche d'accès aux données (Service Layer)

Isole toute la logique de communication réseau. Aucun `fetch` direct n'est effectué en dehors de `rest-client.js`.

| Fichier | Rôle |
|---|---|
| `api.js` | Toutes les requêtes vers l'API REST WordPress : sections, thématiques, utilisateurs, ateliers, formulaires |
| `auth.js` | Authentification JWT : login, inscription, persistance de session, token stocké en `localStorage` |
| `api-mapbox.js` | Requêtes vers l'API Mapbox (géocodage, itinéraires) — adaptateur dédié |

**Patron utilisé : Service Layer.** Les modules métier (`features/`) n'ont jamais connaissance de l'URL de l'API ni du protocole : ils appellent des fonctions nommées (`fetchThematiques`, `updateUserProfile`…).

---

### `components/` — Composants UI réutilisables

Composants indépendants, sans logique métier. Chacun expose une interface simple (initialisation ou fonction de montage).

| Fichier | Rôle |
|---|---|
| `burger-menu.js` | Menu hamburger mobile |
| `popup.js` | Boîtes de dialogue (confirmation, alertes) |
| `img-carousel.js` | Carrousel d'images (galeries thématiques) |
| `scroll.js` | Effets de scroll sur le header principal |
| `secondary-scroll.js` | Comportement de scroll pour les overlays/panels secondaires |

---

### `features/` — Fonctionnalités métier (Feature Folder)

Chaque fichier encapsule une fonctionnalité complète de l'application. C'est la couche la plus "dense" : elle orchestre les données (`api/`), la UI (`components/`) et les utilitaires (`core/`).

| Fichier | Rôle |
|---|---|
| `thematiques.js` | Affichage et navigation dans les thématiques (onglets, filtres) |
| `section-builder.js` | Construction dynamique des sections de page depuis les données ACF |
| `page-overlay.js` | Overlay de navigation principale (pages, fiches, profil utilisateur) |
| `ateliers-map.js` | Carte interactive des ateliers (intégration Mapbox GL JS) |
| `route-overlay.js` | Overlay d'affichage des itinéraires sur la carte |

#### `features/forms/` — Sous-module formulaires

Les formulaires constituent une fonctionnalité suffisamment complexe pour justifier leur propre sous-dossier. La responsabilité est divisée en trois fichiers distincts :

| Fichier | Rôle |
|---|---|
| `form-builder.js` | Construction du DOM du formulaire à partir d'une configuration ACF ; point d'entrée public (`setFormBuilderDependencies`, `bindFormBuilderSubmissions`) |
| `form-validator.js` | Validation des champs, collecte du payload, feedback visuel — aucune dépendance externe |
| `form-submit.js` | Envoi des données selon le type de formulaire (inscription, profil, atelier, formulaire builder) |

**Patron utilisé : Injection de dépendances.** `form-builder.js` reçoit via `setFormBuilderDependencies()` les références aux fonctions `openOverlay` / `closeOverlay` de `page-overlay.js`. Cela évite une dépendance circulaire et permet de tester chaque module isolément.

---

### `admin/` — Interface d'administration personnalisée (AdminTool)

L'AdminTool est une interface d'administration JavaScript chargée dynamiquement pour les utilisateurs ayant le flag `is_admin` dans la base de données WordPress personnalisée. Elle ne fait pas partie de l'admin WordPress standard.

| Fichier | Rôle |
|---|---|
| `admin-tool.js` | Contrôleur principal : détection du rôle admin, initialisation des panneaux |
| `admin-users.js` | Panneau de gestion des utilisateurs Olthem (affichage, édition, suppression) |
| `admin-ateliers.js` | Panneau de gestion des ateliers (statut, édition, suppression) |

**Patron utilisé : Factory Function avec injection.** `admin-users.js` et `admin-ateliers.js` n'ont aucune dépendance directe (`import`) : ils exposent des fonctions factory qui reçoivent toutes les dépendances nécessaires (fonctions API, utilitaires) en paramètre. Cela renforce la séparation des responsabilités et la testabilité.

---

### `helpers/` — Aides spécifiques au domaine

| Fichier | Rôle |
|---|---|
| `acf-helpers.js` | Extraction et normalisation des données ACF (Advanced Custom Fields) reçues depuis l'API WordPress |

---

### `main.js` — Point d'entrée

`main.js` est le seul module chargé directement par `index.html` via `<script type="module">`. Il joue le rôle de **composition root** :

1. Lance les requêtes de données initiales en parallèle (`fetchThematiques`, `fetchSections`)
2. Injecte les dépendances croisées entre features (`setFormBuilderDependencies`, `setPageOverlayDependencies`, `setSectionsPromise`)
3. Lie les interactions utilisateur aux handlers appropriés

Les 4 autres `<script type="module">` dans `index.html` chargent des composants autonomes (`scroll.js`, `secondary-scroll.js`, `burger-menu.js`, `thematiques.js`) qui n'ont pas besoin de la composition root.

---

## Patrons de conception utilisés

| Patron | Où | Pourquoi |
|---|---|---|
| **Service Layer** | `api/` | Isoler la couche réseau des fonctionnalités métier |
| **Feature Folder** | `features/` | Regrouper par domaine fonctionnel plutôt que par type de fichier |
| **Dependency Injection** | `form-builder.js`, `page-overlay.js`, `main.js` | Éviter les dépendances circulaires, faciliter les tests |
| **Factory Function** | `admin-users.js`, `admin-ateliers.js` | Séparation des responsabilités, pas d'état global |
| **Adapter** | `api-mapbox.js` | Encapsuler l'API tierce Mapbox derrière une interface interne |
| **Module Pattern (ES)** | Tous les fichiers | Encapsulation native, pas de bundler nécessaire |

---

## Flux de données type

```
index.html
   │
   ├── main.js (composition root)
   │     ├── api/api.js → REST API WP → données
   │     ├── features/section-builder.js → construit le DOM
   │     ├── features/page-overlay.js → navigation SPA
   │     └── features/forms/form-builder.js → formulaires dynamiques
   │
   ├── components/scroll.js
   ├── components/secondary-scroll.js
   ├── components/burger-menu.js
   └── features/thematiques.js
```

---

## Choix techniques notables

### Pas de bundler
Les imports ES Modules sont résolus directement par le navigateur à l'exécution. Ce choix simplifie le workflow de développement (pas de compilation JS) mais impose des chemins d'import exacts.

### WordPress headless avec endpoints personnalisés
Les données métier (ateliers, thématiques, formulaires builder) transitent par des endpoints REST personnalisés enregistrés dans des mu-plugins WordPress (`/wp-content/mu-plugins/`). L'API officielle WordPress (`/wp-json/wp/v2/`) est utilisée pour les contenus standards.

### Authentification JWT
L'authentification utilise des JWT (JSON Web Tokens) stockés en `localStorage`. Le token est joint à chaque requête sensible via l'en-tête `Authorization: Bearer <token>`.

### Sécurité XSS
Tout le contenu HTML généré dynamiquement passe par la fonction `esc()` (`core/utils.js`) qui échappe les caractères spéciaux HTML avant insertion dans le DOM. Aucune interpolation directe dans `innerHTML` n'est faite sur des données non échappées.

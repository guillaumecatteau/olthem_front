# Olthem — Frontend

Site one-page en HTML/SCSS/JS vanilla, consommant un backend **WordPress headless** via l'API REST WP.

---

## Architecture générale

```
Frontend (ce repo)          Backend (WordPress headless)
─────────────────           ────────────────────────────
index.html                  mu-plugins/olthem-headless.php   → CPT, REST fields, CORS
src/js/                     mu-plugins/olthem-admin.php      → back-office custom
src/scss/  ──build──▶  assets/css/main.css
```

Le frontend est entièrement découplé : aucun PHP, aucun bundler JS. Le SCSS est la seule étape de compilation.

---

## Structure des fichiers

```
olthem_front/
├── index.html                  Point d'entrée unique (SPA one-page)
├── .htaccess                   Réécriture d'URL Apache
├── package.json                Scripts npm (build/watch SCSS uniquement)
├── assets/
│   ├── css/
│   │   └── main.css            CSS compilé (ne pas éditer manuellement)
│   ├── images/
│   │   ├── logos/
│   │   ├── icons/
│   │   ├── patterns/
│   │   ├── themes/
│   │   └── galleries/
│   └── medias/
└── src/
    ├── scss/
    │   ├── style.scss           Point d'entrée SCSS
    │   ├── base/                Variables, reset, styles de base
    │   ├── layout/              Header, sections, page
    │   └── components/          Composants UI (overlay, cards, popup, etc.)
    └── js/
        ├── main.js              Point d'entrée JS (initialisation)
        ├── core/
        │   ├── config.js        Racines API (multi-root fallback)
        │   ├── rest-client.js   Client HTTP avec fallback multi-root
        │   ├── utils.js         Utilitaires généraux
        │   └── scroll-lock.js   Blocage du scroll body
        ├── api/
        │   ├── api.js           Appels REST WP (sections, thématiques, ateliers…)
        │   ├── auth.js          Authentification JWT
        │   └── api-mapbox.js    Géocodage Mapbox
        ├── features/
        │   ├── section-builder.js   Hydratation des sections depuis l'API
        │   ├── thematiques.js       Rendu des cards thématiques (accueil)
        │   ├── page-overlay.js      Overlay pleine page (thématiques, compte…)
        │   ├── route-overlay.js     Ouverture d'overlay depuis l'URL
        │   ├── ateliers-map.js      Carte interactive des ateliers
        │   └── forms/
        │       ├── form-builder.js      Rendu dynamique des formulaires ACF
        │       ├── form-submit.js       Soumission et retour API
        │       └── form-validator.js    Validation côté client
        ├── components/
        │   ├── burger-menu.js       Menu hamburger mobile
        │   ├── img-carousel.js      Carousel d'images
        │   ├── popup.js             Modale de confirmation (Promise-based)
        │   ├── scroll.js            Scroll snap des sections
        │   └── secondary-scroll.js  Scrollbar custom dans les overlays
        ├── admin/
        │   ├── admin-tool.js        Panneau admin front (gestion utilisateurs/ateliers)
        │   ├── admin-users.js       CRUD utilisateurs via API REST
        │   └── admin-ateliers.js    CRUD ateliers via API REST
        └── helpers/
            └── acf-helpers.js       Normalisation des champs ACF
```

---

## Compilation SCSS

```bash
npm install           # une seule fois (installe Dart Sass)
npm run scss:build    # compile src/scss/style.scss → assets/css/main.css
npm run scss:watch    # recompile automatiquement à chaque modification
```

---

## Configuration API

Le client HTTP essaie les racines API dans l'ordre jusqu'à la première qui répond (`src/js/core/config.js`) :

1. `http://127.0.0.1:10010/wp-json` (Local by Flywheel)
2. `http://localhost:10010/wp-json`
3. `https://olthem.local/wp-json`
4. `http://olthem.local/wp-json`
5. `https://is9q21ccmpl.preview.infomaniak.website/wp-json` (production)

**Override runtime** : `?apiRoot=<url>` en query string, ou `localStorage.setItem('apiRoot', '<url>')`.

---

## Endpoints WordPress utilisés

| Endpoint | Usage |
|---|---|
| `GET /wp-json` | URL du site (logo cliquable) |
| `GET /wp/v2/sections` | Sections de la homepage |
| `GET /wp/v2/thematiques` | Contenus overlay thématiques |
| `GET /wp/v2/ateliers` | Liste des ateliers |
| `GET /wp/v2/pages` | Pages légales |
| `POST /wp/v2/users/me` | Mise à jour profil |
| `POST /jwt-auth/v1/token` | Connexion JWT |

---

## Environnements

| Environnement | URL frontend | API WP |
|---|---|---|
| Local (Flywheel) | `http://localhost` (WAMP) | `http://127.0.0.1:10010/wp-json` |
| Production | domaine définitif | `https://is9q21ccmpl.preview.infomaniak.website/wp-json` |

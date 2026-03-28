# Olthem

Structure headless minimaliste: WordPress sert uniquement de back-office/API (dans LocalWP), et le frontend est independant.

## Architecture retenue

- `app/public/wp-content/mu-plugins/olthem-headless.php`: logique headless (CPT, REST fields, CORS).
- `app/public/wp-content/themes/olthem-headless/`: theme technique minimal.
- `frontend/`: one-page HTML/SCSS/JS.

Le repo ne contient plus le core WordPress (`wp-admin`, `wp-includes`, etc.).

## Structure de contenu WordPress

- `Sections` (`olthem_section`): blocs de la homepage (ordonnes par `menu_order`).
- `Thematiques` (`olthem_thematique`): contenus overlay (ordonnes par `menu_order`).
- `Pages` (`page`): contenus legaux et pages classiques.

Endpoints utiles:

- `GET /wp-json/wp/v2/sections?orderby=menu_order&order=asc`
- `GET /wp-json/wp/v2/thematiques?orderby=menu_order&order=asc`
- `GET /wp-json/wp/v2/pages`

## Environnement LocalWP (actuel)

Le site tourne en mode router `localhost`.

- Site: `http://localhost:10010`
- Admin: `http://localhost:10010/wp-admin`
- API: `http://localhost:10010/wp-json`

Dans ce setup, le runtime WordPress complet reste uniquement dans LocalWP.

## Frontend

Depuis `frontend/`:

```bash
npm.cmd install
npm.cmd run scss:build
npm.cmd run scss:watch
```

Point d'entree:

- `frontend/index.html`

Configuration API frontend:

- `frontend/src/js/config.js` (`apiRoot`)

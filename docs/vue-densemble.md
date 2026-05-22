# Vue d'ensemble — Architecture du projet Olthem

> Document produit pour le Travail de Fin d'Études (TFE)  
> Date : mai 2026

---

## Présentation du projet

**Olthem** est une application web pédagogique destinée aux enseignants et animateurs. Elle permet de :
- Découvrir et parcourir des **thématiques pédagogiques** (médias, citoyenneté numérique…) enrichies de textes, images, vidéos, galeries et documents
- **Réserver des ateliers** d'intervention (en classe ou au Mundaneum) et les géolocaliser sur une carte
- Gérer son **compte utilisateur** (profil, historique d'ateliers)
- Administrer l'ensemble du contenu et des utilisateurs depuis une **interface d'administration JavaScript** intégrée

---

## Architecture globale : WordPress headless + SPA vanilla

Le projet repose sur une **séparation stricte entre le backend et le frontend**, selon le modèle dit *headless* :

```
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND — WordPress headless (PHP · MySQL)                     │
│                                                                 │
│  /wp-admin  →  éditeurs de contenu (thématiques, médias, ACF)  │
│  /wp-json/  →  API REST consommée par le frontend              │
│                                                                 │
│  Logique applicative : 5 mu-plugins PHP                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / REST API (JSON)
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  FRONTEND — SPA Vanilla JS + SCSS                               │
│                                                                 │
│  index.html  →  shell unique, jamais rechargé                  │
│  src/js/     →  ES Modules natifs (pas de bundler)             │
│  src/scss/   →  compilé en CSS via sass                        │
└─────────────────────────────────────────────────────────────────┘
```

**WordPress n'envoie jamais de HTML à l'utilisateur final.** Il est utilisé uniquement comme :
- **CMS** : interface d'édition de contenu pour l'équipe Olthem
- **Serveur d'API** : toutes les données transitent par des endpoints REST JSON

Le frontend est une **Single Page Application (SPA) en JavaScript vanilla**. Une seule page HTML (`index.html`) est chargée ; toute la navigation, le rendu des contenus et les interactions sont gérés dynamiquement par JavaScript, sans rechargement de page ni framework (React, Vue…).

---

## Justification des choix d'architecture

### Pourquoi WordPress ?

WordPress offre une interface d'édition de contenu mature et accessible à des non-développeurs. La gestion des médias, des révisions, des types de contenu personnalisés (CPTs) et des champs avancés (ACF) en font une plateforme CMS complète. En mode headless, on conserve ces avantages sans subir les contraintes du système de thèmes traditionnel.

### Pourquoi headless ?

Le modèle headless permet de **découpler entièrement l'expérience utilisateur de la technologie backend**. Le frontend bénéficie d'une liberté totale sur l'interface, les animations, la navigation et la performance — sans les contraintes imposées par le système de templates PHP de WordPress.

### Pourquoi JavaScript vanilla sans bundler ?

L'utilisation des **ES Modules natifs** du navigateur (sans Webpack, Vite ou autre bundler) simplifie le workflow de développement : aucune étape de compilation JS, les fichiers sont lisibles et déboguables directement dans les DevTools. Ce choix est viable sur un projet de cette taille et renforce la compréhension des mécanismes fondamentaux du web.

### Pourquoi SCSS ?

SCSS apporte la puissance des variables, nesting, mixins et imports partiels sans dépendance à un framework CSS. Il est compilé en un fichier CSS standard via `sass` (script npm), ce qui reste cohérent avec l'absence de bundler JS.

---

## Les quatre couches du système

### 1. Base de données

WordPress (MySQL) avec deux niveaux de tables :
- Les **tables standard WordPress** pour le contenu CMS (`wp_posts`, `wp_postmeta`, `wp_options`…)
- Les **5 tables custom** `wp_olthem_*` pour la logique applicative propre au projet (utilisateurs publics, ateliers, tracking, e-mails, newsletters)

→ Détail complet dans [`analyse-base-de-donnees.md`](analyse-base-de-donnees.md)

### 2. Backend PHP (mu-plugins)

Cinq mu-plugins WordPress constituant toute la logique applicative backend :

| Plugin | Rôle résumé |
|--------|-------------|
| `olthem-db.php` | Migrations des tables custom |
| `olthem-auth.php` | Tokens Bearer · endpoints `/auth/*` |
| `olthem-api-rest.php` | Endpoints admin + formulaires |
| `olthem-headless.php` | CPTs · ACF en PHP · CORS · REST |
| `olthem-admin.php` | Extensions de `/wp-admin` |

→ Détail complet dans [`architecture-backend.md`](architecture-backend.md)

### 3. API REST

Interface de communication entre les deux parties. Deux namespaces :
- `/wp-json/wp/v2/` — API WP native pour les contenus (thématiques, sections, pages, médias)
- `/wp-json/olthem/v1/` — API custom pour l'auth, l'admin et les formulaires

### 4. Frontend JavaScript

SPA vanilla organisée en couches fonctionnelles (`core/`, `api/`, `components/`, `features/`, `admin/`, `helpers/`). Aucune dépendance externe côté JS.

→ Détail complet dans [`architecture-frontend.md`](architecture-frontend.md)

---

## Flux de données type

```
Éditeur de contenu
       │
       ▼ /wp-admin (interface WordPress)
  ACF + CPT → wp_posts + wp_postmeta
       │
       ▼ /wp-json/wp/v2/olthem_thematique
  olthem-headless.php sérialise les champs ACF
       │
       ▼ api/api.js → fetchThematiques()
  features/thematiques.js construit le DOM
       │
       ▼ Navigateur de l'utilisateur final
```

```
Utilisateur final (inscription)
       │
       ▼ features/forms/form-submit.js → POST /auth/register
  olthem-auth.php crée un compte wp_users + wp_olthem_users
  Émission d'un token Bearer (64 chars, bcrypt en BDD)
       │
       ▼ Stockage localStorage (token plain-text)
  Requêtes authentifiées suivantes : Authorization: Bearer <token>
```

---

## Synthèse des technologies

| Couche | Technologies |
|--------|-------------|
| Base de données | MySQL · InnoDB · WordPress schema |
| Backend | PHP 8 · WordPress core · ACF Pro · mu-plugins |
| API | WP REST API · endpoints custom (`register_rest_route`) |
| Authentification | Tokens Bearer opaques · bcrypt · localStorage |
| Frontend JS | Vanilla ES Modules · pas de framework · pas de bundler |
| Styles | SCSS → CSS (compilé via `sass`) |
| Cartographie | Mapbox GL JS (géocodage + itinéraires) |
| Hébergement dev | Local by Flywheel (WAMP64 + Nginx + PHP-FPM) |

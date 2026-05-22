# Analyse de la base de données — Olthem

> Document produit pour le Travail de Fin d'Études (TFE)  
> Date : mai 2026  
> Base de données : MySQL / InnoDB — préfixe `wp_`  
> Moteur : WordPress headless + tables custom

---

## 1. Vue d'ensemble

La base de données repose sur le noyau WordPress (7 tables standard) augmenté de **5 tables métier custom** préfixées `wp_olthem_`.

| Groupe | Tables | Rôle |
|--------|--------|------|
| Core WordPress | `wp_users`, `wp_usermeta`, `wp_posts`, `wp_postmeta`, `wp_options`, `wp_terms / term_taxonomy / term_relationships` | Gestion du contenu CMS, utilisateurs WP, options, médias |
| Tables métier custom | `wp_olthem_users`, `wp_olthem_ateliers`, `wp_olthem_tracking`, `wp_olthem_email_templates`, `wp_olthem_newsletters` | Logique applicative propre au projet |

**Volumes observés (dump de référence, mai 2026) :**

| Table | Enregistrements |
|-------|-----------------|
| `wp_olthem_users` | ~39 |
| `wp_olthem_ateliers` | ~20 |
| `wp_olthem_tracking` | ~80 |
| `wp_posts` | ~282 (toutes versions et types confondus) |
| `wp_users` | ~28 (utilisateurs WP admin / éditeurs) |

---

## 2. Tables WordPress standard (utilisées)

### 2.1 `wp_posts` — Contenu éditorial

Table centrale du CMS. Elle stocke tous les types de contenu via le champ `post_type`.

| Colonne | Type | Description |
|---------|------|-------------|
| `ID` | BIGINT UNSIGNED PK | Identifiant unique |
| `post_author` | BIGINT UNSIGNED | FK → `wp_users.ID` |
| `post_date` | DATETIME | Date de création |
| `post_content` | LONGTEXT | Corps du contenu |
| `post_title` | TEXT | Titre |
| `post_status` | VARCHAR(20) | `publish`, `draft`, `revision`… |
| `post_type` | VARCHAR(20) | Type d'objet (voir ci-dessous) |
| `post_name` | VARCHAR(200) | Slug URL |
| `post_parent` | BIGINT UNSIGNED | Hiérarchie de contenu |

**Types de contenu (`post_type`) actifs dans le projet :**

| post_type | Nb | Rôle |
|-----------|----|------|
| `page` | ~16 | Pages frontend de l'application (overlay, formulaires, compte…) |
| `olthem_thematique` | ~6 | Thématiques pédagogiques (contenu éditorial riche) |
| `olthem_section` | ~6 | Sections composant les thématiques |
| `olthem_ateliers` (option) | ~9 | Ateliers référencés par ACF (option page) |
| `acf-field-group` | 2 | Groupes de champs ACF |
| `acf-field` | ~92 | Définition de chaque champ ACF |
| `attachment` | ~71 | Médias uploadés (images, PDF, audio) |
| `revision` | ~73 | Révisions automatiques WordPress |

**Pages applicatives notables :**

| ID | Titre | Rôle |
|----|-------|------|
| 216 | Récupération de mot de passe | Formulaire reset password |
| 218 | Inscription | Formulaire d'inscription |
| 220 / 339 | Compte utilisateur | Profil connecté |
| 222 | AdminTool | Interface d'administration custom |
| 293 | Connexion | Formulaire de connexion |
| 312 | Atelier programmé | Confirmation de réservation |
| 334 | Recherche | Résultats de recherche |
| 349 | Modification atelier | Formulaire édition atelier (utilisateur) |
| 350 | Modification atelier Admin | Formulaire édition atelier (administrateur) |

---

### 2.2 `wp_postmeta` — Métadonnées des posts

Stockage EAV (Entity–Attribute–Value) des champs ACF et métadonnées WP.

| Colonne | Type | Description |
|---------|------|-------------|
| `meta_id` | BIGINT UNSIGNED PK | |
| `post_id` | BIGINT UNSIGNED | FK → `wp_posts.ID` |
| `meta_key` | VARCHAR(255) | Nom du champ |
| `meta_value` | LONGTEXT | Valeur sérialisée ou brute |

> **Note :** Tous les champs ACF (thématiques, sections, options globales) sont persistés ici. ~4 891 entrées au moment du dump.

---

### 2.3 `wp_users` / `wp_usermeta` — Comptes WordPress

Utilisateurs administrateurs et éditeurs de contenu (back-office WP).  
**À ne pas confondre** avec `wp_olthem_users` qui gère les utilisateurs applicatifs du site public.

---

### 2.4 `wp_options` — Configuration globale

Paramètres WordPress, options ACF (groupes `Informations générales`, `Constructeur`), clés API, permaliens, etc. (~1 638 entrées).

---

## 3. Tables métier custom (`wp_olthem_*`)

Ces tables sont créées et gérées par le mu-plugin `olthem-db.php`.

---

### 3.1 `wp_olthem_users` — Utilisateurs applicatifs

Gestion des comptes du site public, indépendante de la table WP native.

```sql
CREATE TABLE `wp_olthem_users` (
  `id`                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username`             VARCHAR(60)  NOT NULL UNIQUE,
  `last_name`            VARCHAR(100) NOT NULL,
  `first_name`           VARCHAR(100) NOT NULL,
  `email`                VARCHAR(254) NOT NULL UNIQUE,
  `password`             VARCHAR(255) NOT NULL,          -- hash bcrypt
  `remember`             TINYINT(1)   DEFAULT 0,
  `newsletter`           TINYINT(1)   DEFAULT 0,
  `is_admin`             TINYINT(1)   DEFAULT 0,
  `created_at`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `reset_token`          VARCHAR(64)  DEFAULT NULL,       -- token reset mot de passe
  `reset_token_expires`  DATETIME     DEFAULT NULL
);
```

| Champ | Détail |
|-------|--------|
| `password` | Hash bcrypt (jamais stocké en clair) |
| `reset_token` | Token SHA-256 à usage unique pour reset de mot de passe |
| `reset_token_expires` | Expiration du token (durée courte) |
| `newsletter` | Consentement newsletter (opt-in/opt-out) |
| `is_admin` | Flag accès à l'AdminTool |

**Volumes :** ~39 utilisateurs inscrits.

---

### 3.2 `wp_olthem_ateliers` — Réservations d'ateliers

Enregistrement des demandes d'intervention pédagogique.

```sql
CREATE TABLE `wp_olthem_ateliers` (
  `id`                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`              BIGINT UNSIGNED DEFAULT NULL,        -- FK olthem_users (nullable)
  `thematic_id`          BIGINT UNSIGNED DEFAULT NULL,        -- FK wp_posts.ID (ON DELETE SET NULL)
  `mundaneum`            TINYINT(1)   DEFAULT 0,              -- passage au Mundaneum
  `displayEvent`         TINYINT(1)   DEFAULT 0,              -- publié sur agenda
  `displayContact`       TINYINT(1)   DEFAULT 0,              -- contact visible
  `institution`          VARCHAR(255) DEFAULT NULL,
  `address`              VARCHAR(255) DEFAULT NULL,
  `city`                 VARCHAR(100) DEFAULT NULL,
  `postal_code`          VARCHAR(10)  DEFAULT NULL,
  `last_name`            VARCHAR(100) DEFAULT NULL,
  `first_name`           VARCHAR(100) DEFAULT NULL,
  `email`                VARCHAR(254) DEFAULT NULL,
  `phone`                VARCHAR(30)  DEFAULT NULL,
  `start_date`           DATE         DEFAULT NULL,
  `end_date`             DATE         DEFAULT NULL,
  `valid_date`           DATE         DEFAULT NULL,
  `participants_count`   INT          DEFAULT NULL,
  `created_at`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `is_registered_user`   TINYINT(1)   DEFAULT 0,
  `share_contact`        TINYINT(1)   DEFAULT 0,
  `latitude`             DECIMAL(10,7) DEFAULT NULL,
  `longitude`            DECIMAL(10,7) DEFAULT NULL,
  CONSTRAINT `fk_olthem_ateliers_thematique`
    FOREIGN KEY (`thematic_id`) REFERENCES `wp_posts`(`ID`)
    ON DELETE SET NULL ON UPDATE CASCADE
);
```

| Champ | Détail |
|-------|--------|
| `user_id` | Nullable → un atelier peut être soumis sans compte |
| `thematic_id` | Lie l'atelier à un CPT `olthem_thematique` |
| `mundaneum` | L'atelier a lieu au Mundaneum (déplacement) |
| `start_date` / `end_date` | Période souhaitée |
| `valid_date` | Date de validation par l'équipe Olthem |
| `latitude` / `longitude` | Géolocalisation de l'établissement (Mapbox) |
| `is_registered_user` | Soumission faite via compte connecté |
| `share_contact` | Consentement partage de coordonnées |

**Volumes :** ~20 ateliers enregistrés.

---

### 3.3 `wp_olthem_tracking` — Traçabilité des actions

Journal d'audit des actions utilisateurs (analytics interne).

```sql
CREATE TABLE `wp_olthem_tracking` (
  `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    BIGINT UNSIGNED DEFAULT NULL,
  `action`     VARCHAR(100) NOT NULL,     -- ex: 'login', 'atelier_submit', 'page_view'
  `metadata`   LONGTEXT DEFAULT NULL,     -- JSON contextuel
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY `action` (`action`),
  KEY `created_at` (`created_at`)
);
```

**Actions tracées :**

| action | Description |
|--------|-------------|
| `login` | Connexion utilisateur |
| `atelier_submit` | Soumission d'un atelier |
| `atelier_update` | Modification d'un atelier |
| `overlay_open` | Ouverture d'une fiche thématique |
| `page_view` | Navigation sur une page |
| `search` | Requête de recherche |

**Volumes :** ~80 entrées (environnement de test/dev).

---

### 3.4 `wp_olthem_email_templates` — Modèles d'e-mail

Templates d'e-mails transactionnels configurables depuis l'AdminTool.

```sql
CREATE TABLE `wp_olthem_email_templates` (
  `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(100) NOT NULL,
  `event_key`  VARCHAR(50)  NOT NULL DEFAULT '',  -- ex: 'inscription', 'atelier_confirm'
  `subject`    VARCHAR(255) NOT NULL DEFAULT '',
  `body`       LONGTEXT     NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

| Champ | Détail |
|-------|--------|
| `event_key` | Identifiant de l'événement déclencheur (code) |
| `body` | Contenu HTML du mail, peut contenir des placeholders |

**Volumes :** 2 templates actifs.

---

### 3.5 `wp_olthem_newsletters` — Historique des newsletters

Archivage des campagnes newsletter envoyées.

```sql
CREATE TABLE `wp_olthem_newsletters` (
  `id`               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `subject`          VARCHAR(255) NOT NULL DEFAULT '',
  `body`             LONGTEXT     NOT NULL,
  `recipients_count` INT          NOT NULL DEFAULT 0,
  `sent_at`          DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Groupes de champs ACF

Advanced Custom Fields est utilisé pour enrichir les CPTs avec du contenu éditorial structuré.

### Groupe 1 — `Informations générales`
> Attaché à la **page Options** (configuration globale du site)

| Champ | Type | Description |
|-------|------|-------------|
| `informations_generales` | group | Conteneur principal |
| `mundaneum` | url | Lien vers mundaneum.org |
| `facebook` | url | Lien réseaux sociaux |
| `x` | url | |
| `instagram` | url | |

---

### Groupe 2 — `Constructeur`
> Attaché à : `olthem_section`, `olthem_thematique`, `page`

Ce groupe pilote le **Section Builder** — le constructeur de contenu visuel du site.

**Blocs de contenu disponibles :**

| Champ | Type ACF | Description |
|-------|----------|-------------|
| `Builder` | flexible_content | Conteneur principal du constructeur |
| `title` / `subtitle` | text | Titre et sous-titre de section |
| `subsection` | group | Sous-section imbriquée |
| `videolink` | url | Lien vidéo externe |
| `displaytile` / `displaysubtitle` / `displayvideotitle` | boolean | Affichage conditionnel |
| `videotitle` | text | Titre d'une vidéo |
| `text` / `persotext` / `paragraphename` | textarea/text | Blocs texte |
| `audiotitle` / `audiofile` | text/file | Composant audio |
| `iframe` | text | Embed externe |
| `image` / `imagescale` / `xoffset` / `yoffset` | image/number | Composant image |
| `gallerie` | gallery | Galerie d'images |
| `affichagecaroussel` / `affichagecanvas` | boolean | Mode affichage galerie |
| `ignorespacing` | boolean | Option de mise en page |
| `pdf_file` / `pdf_label` | file/text | Document PDF téléchargeable |
| `logocategory` / `logoline` / `logo` / `logoscale` | select/image | Composant logo |
| `innertitle` / `title_logo` | text | Variantes de titres |
| `formconstructor` | group | Formulaire dynamique intégré |
| `form_type` / `form_button_label` / `form_process` | select/text | Config formulaire |
| `form_group` | repeater | Groupes de champs du formulaire |
| `taille` / `label` / `champ_type` / `champ_title` | text/select | Définition d'un champ de formulaire |
| `linked_column` / `linked_table` | text | Liaison BDD pour soumission |
| `text_bloc` / `orientation` | textarea/select | Bloc texte orienté |
| `admintab` | text | Onglet AdminTool |
| `carroussel_title` / `videos_links` / `video_link` | text/repeater/url | Carrousel vidéo |

---

## 6. Relations entre entités

```
wp_posts (olthem_thematique)
    ↑ FK thematic_id
wp_olthem_ateliers
    ↑ FK user_id (nullable)
wp_olthem_users

wp_posts (page / olthem_section / olthem_thematique)
    → ACF fields → wp_postmeta
    → Section Builder (flexible_content)
        → blocs: texte, image, vidéo, audio, PDF, galerie, formulaire, logo...

wp_olthem_tracking
    → user_id → wp_olthem_users (nullable)
    → action + metadata JSON

```

---

## 7. Choix de conception notables

### Deux tables utilisateurs sans rapport l'une avec l'autre
`wp_users` est la table native de WordPress — elle est nécessaire au fonctionnement du back-office CMS (`/wp-admin`) où les éditeurs de contenu gèrent les thématiques, les médias et les champs ACF. Elle n'a aucun rôle dans l'application publique.

`wp_olthem_users` est la table des utilisateurs du site public (enseignants, animateurs). Le champ `is_admin` y accorde l'accès à l'AdminTool custom (l'interface d'administration en JavaScript), indépendamment du back-office WordPress.

Les deux coexistent parce que **le projet est headless** : WordPress est utilisé uniquement comme CMS. Sa table `wp_users` est une contrainte technique imposée par WordPress, pas un choix de conception.

### Authentification custom
`wp_olthem_users` embarque son propre système d'authentification avec JWT-like tokens (gérés côté REST API dans `olthem-auth.php`), stockage de sessions côté client (localStorage) et reset de mot de passe par token temporaire.

### Tracking applicatif intégré
`wp_olthem_tracking` joue le rôle d'un outil d'analytics léger et 100% RGPD-maîtrisé, sans dépendance externe (pas de Google Analytics). Le champ `metadata` en JSON permet d'enrichir chaque événement selon son contexte.

### Section Builder ACF
Le groupe ACF `Constructeur` implémente un constructeur de page **flexible_content** permettant à l'équipe éditoriale de composer des pages richement structurées sans coder : textes, médias, galeries, formulaires dynamiques, carrousels et PDFs sont tous pilotés depuis l'interface WP admin.

### Géolocalisation des ateliers
Les champs `latitude` / `longitude` dans `wp_olthem_ateliers` permettent l'affichage cartographique (Mapbox GL JS) depuis le frontend, sans stocker de données de déplacement tierces.

---

## 8. Résumé des contraintes d'intégrité

| Contrainte | Table | Comportement |
|------------|-------|-------------|
| FK `thematic_id` → `wp_posts.ID` | `wp_olthem_ateliers` | `ON DELETE SET NULL` — l'atelier survit à la suppression d'une thématique |
| UNIQUE `email` | `wp_olthem_users` | Un email ne peut être utilisé qu'une fois |
| UNIQUE `username` | `wp_olthem_users` | Pseudonyme unique |
| INDEX `action`, `created_at` | `wp_olthem_tracking` | Requêtes analytiques filtrées par action et période |
| INDEX `user_id` | `wp_olthem_ateliers`, `wp_olthem_tracking` | Accès rapide aux données par utilisateur |

---

*Fin du document — Analyse générée à partir du dump SQL de référence (`local.sql`, 14/05/2026)*

# Architecture du backend — Olthem

> Document produit pour le Travail de Fin d'Études (TFE)  
> Date : mai 2026  
> Stack : WordPress headless · PHP 8 · MySQL · REST API · mu-plugins

---

## Vue d'ensemble

Le backend d'Olthem est un **WordPress utilisé en mode headless** : il n'assure aucun rendu HTML pour l'utilisateur final. Son rôle est exclusivement de :

1. Fournir une **API REST** consommée par le frontend JavaScript
2. Offrir une **interface d'administration CMS** (`/wp-admin`) aux éditeurs de contenu
3. Gérer la **persistance des données** (contenus éditoriaux, utilisateurs, ateliers)

Tout le code métier propre au projet est concentré dans **5 mu-plugins** (`/wp-content/mu-plugins/`). Les mu-plugins (*must-use plugins*) sont chargés automatiquement par WordPress à chaque requête, sans activation manuelle, ce qui garantit que la logique applicative ne peut pas être désactivée accidentellement depuis l'interface WP.

```
/wp-content/mu-plugins/
├── olthem-db.php          ← structure de la base de données (migrations)
├── olthem-auth.php        ← authentification · tokens Bearer · endpoints /auth/*
├── olthem-api-rest.php    ← endpoints REST admin · formulaires
├── olthem-headless.php    ← CPTs · ACF · CORS · sérialisation REST
└── olthem-admin.php       ← extensions de l'interface /wp-admin
```

---

## Description des mu-plugins

### `olthem-db.php` — Migrations de la base de données

Responsabilité unique : déclarer et maintenir la structure des tables custom.

- Définit la constante `OLTHEM_DB_VERSION` (actuellement `1.4.0`)
- Utilise `dbDelta()` (API WordPress) pour appliquer les migrations de manière **idempotente** : la fonction crée les tables si elles n'existent pas, ou les met à jour si leur structure a changé, sans jamais supprimer de données
- Ne contient aucun seeding, aucune logique applicative

Les 5 tables gérées sont décrites en détail dans le document `analyse-base-de-donnees.md`.

---

### `olthem-auth.php` — Authentification et tokens

Responsabilité : tout ce qui concerne l'identité d'un utilisateur public.

#### Tokens Bearer (API key pattern)

L'authentification n'utilise pas JWT au sens strict. Elle repose sur un système de **tokens opaques** gérés côté serveur :

| Étape | Mécanique |
|---|---|
| **Émission** | `olthem_issue_api_token()` génère un token aléatoire de 64 caractères via `wp_generate_password()`, le hache avec `wp_hash_password()` (bcrypt), et le stocke dans `wp_usermeta` sous la clé `olthem_api_tokens` |
| **Validation** | `olthem_get_user_from_bearer_token()` parcourt les tokens stockés, vérifie la date d'expiration (30 jours), puis compare avec `wp_check_password()` |
| **Transport** | Le token plain-text est transmis dans l'en-tête HTTP `Authorization: Bearer <token>` |
| **Stockage client** | Le frontend stocke le token en `localStorage` (voir `api/auth.js`) |

Un maximum de 10 tokens actifs sont conservés par utilisateur (rotation automatique).

#### Lien entre `wp_users` et `wp_olthem_users`

Les utilisateurs du site public sont créés **simultanément** dans les deux tables lors de l'inscription : un compte `wp_users` (nécessaire pour émettre des tokens via `wp_usermeta`) et une ligne `wp_olthem_users` (données applicatives). La fonction `olthem_upsert_custom_user_row()` maintient la synchronisation.

#### Endpoints REST enregistrés

Namespace : `/wp-json/olthem/v1/auth/`

| Méthode | Route | Rôle | Auth |
|---------|-------|------|------|
| POST | `/auth/register` | Inscription | Public |
| POST | `/auth/login` | Connexion, émission du token | Public |
| GET | `/auth/me` | Profil de l'utilisateur connecté | Token requis |
| PUT | `/auth/me` | Mise à jour du profil | Token requis |
| POST | `/auth/logout` | Révocation du token | Token requis |
| GET | `/auth/me/ateliers` | Ateliers de l'utilisateur | Token requis |
| GET | `/auth/check-username` | Disponibilité d'un username | Public |
| POST | `/auth/forgot-password` | Envoi de l'email de réinitialisation | Public |
| POST | `/auth/reset-password` | Mise à jour du mot de passe | Token temporaire |

---

### `olthem-api-rest.php` — API REST métier

Endpoints pour l'**AdminTool** (interface JS côté frontend) et la **soumission de formulaires**.

Namespace : `/wp-json/olthem/v1/`

#### Routes admin (token `is_admin` requis)

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/admin/overview` | Tableau de bord : compteurs + dernières entrées |
| GET | `/admin/users` | Liste paginée/filtrée des utilisateurs |
| PUT | `/admin/users/{id}` | Modifier un utilisateur |
| DELETE | `/admin/users/{id}` | Supprimer un utilisateur (+ `wp_users` en miroir) |
| GET | `/admin/ateliers` | Liste paginée/filtrée des ateliers |
| PUT | `/admin/ateliers/{id}` | Modifier un atelier |
| DELETE | `/admin/ateliers/{id}` | Supprimer un atelier |

#### Middleware d'autorisation admin

```php
function olthem_admin_permission_callback(): bool {
    $token = olthem_get_bearer_token();
    $user  = olthem_get_user_from_bearer_token( $token );
    return $user && (int) get_user_meta( $user->ID, 'is_admin', true ) === 1;
}
```

Toutes les routes admin passent par ce callback avant d'exécuter leur handler.

#### Route formulaire

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/forms/submit` | Soumission d'un formulaire dynamique (Form Builder) |

Cette route reçoit le payload assemblé par `form-submit.js` et l'insère dans la table désignée par les champs `linked_table` / `linked_column` définis dans ACF.

---

### `olthem-headless.php` — Configuration headless

Ce plugin configure WordPress pour fonctionner en mode headless. Il regroupe trois responsabilités :

#### 1. Custom Post Types (CPTs)

| CPT | Label | Description |
|-----|-------|-------------|
| `olthem_thematique` | Thématique | Unité pédagogique principale (6 actives) |
| `olthem_section` | Section | Sous-contenus d'une thématique |
| `olthem_ateliers` | Ateliers (option) | Ateliers configurés via page Options ACF |

Les CPTs ont `show_in_rest = true` pour être exposés via l'API REST WordPress standard (`/wp/v2/`).

#### 2. Groupes de champs ACF (Local Field Groups)

Les groupes ACF sont déclarés **en PHP** via `acf_add_local_field_group()` plutôt que stockés en base de données. Avantages : versionnement Git, pas de risque de perte lors d'une migration BDD.

Deux groupes sont déclarés :
- **`Informations de la thématique`** — métadonnées d'une `olthem_thematique` : titre, descriptif, personnage, position header, couleurs, images…
- **`Constructeur`** — flexible_content attaché aux sections, thématiques et pages : pilote le Section Builder frontend (détaillé dans `analyse-base-de-donnees.md`)

#### 3. CORS et sérialisation REST

- Les en-têtes CORS autorisent les requêtes cross-origin depuis le frontend (localhost en développement)
- La sérialisation des réponses REST est étendue pour inclure les champs ACF dans les réponses `/wp/v2/olthem_thematique` et `/wp/v2/olthem_section`

---

### `olthem-admin.php` — Extensions du back-office

Enrichit l'interface `/wp-admin` pour les éditeurs :

- **Colonnes personnalisées** dans la liste des utilisateurs WP : ID, username Olthem, prénom, nom, flags `remember` / `newsletter` / `isAdmin`, hash du mot de passe
- **Champs de profil** personnalisés sur la fiche utilisateur WP (synchronisés avec `wp_olthem_users`)
- **Page de gestion des ateliers** dans le menu WP : création et listage

Ce plugin n'a aucun impact sur le frontend public.

---

## Routes REST — Vue complète

```
/wp-json/
├── wp/v2/                        ← API WP native
│   ├── olthem_thematique         ← CPT thématiques (+ champs ACF)
│   ├── olthem_section            ← CPT sections (+ champs ACF)
│   ├── pages                     ← pages WP (content, ACF)
│   └── media                     ← médias
│
└── olthem/v1/                    ← API custom
    ├── auth/
    │   ├── register              POST  — inscription
    │   ├── login                 POST  — connexion
    │   ├── logout                POST  — révocation token
    │   ├── me                    GET   — profil
    │   ├── me                    PUT   — mise à jour profil
    │   ├── me/ateliers           GET   — ateliers utilisateur
    │   ├── check-username        GET   — disponibilité username
    │   ├── forgot-password       POST  — demande reset
    │   └── reset-password        POST  — reset effectif
    ├── admin/
    │   ├── overview              GET   — tableau de bord (admin)
    │   ├── users                 GET   — liste utilisateurs (admin)
    │   ├── users/{id}            PUT   — modifier utilisateur (admin)
    │   ├── users/{id}            DELETE — supprimer utilisateur (admin)
    │   ├── ateliers              GET   — liste ateliers (admin)
    │   ├── ateliers/{id}         PUT   — modifier atelier (admin)
    │   └── ateliers/{id}         DELETE — supprimer atelier (admin)
    └── forms/
        └── submit                POST  — soumission form builder
```

---

## Flux d'authentification

```
Frontend                               Backend
─────────                              ───────
POST /auth/login ──────────────────→  Vérifie email + bcrypt(password)
  { email, password }                  Crée un token (64 chars)
                                       Hash + stocke dans wp_usermeta
← token plain-text ────────────────── Retourne le token
localStorage.setItem(token)

GET /api/resource ─────────────────→  Lit Authorization: Bearer <token>
  Authorization: Bearer <token>        olthem_get_user_from_bearer_token()
                                       Vérifie hash + expiration (30j)
← données ─────────────────────────── Retourne la réponse
```

---

## Choix de conception notables

### mu-plugins plutôt que plugin activable
Les mu-plugins sont chargés inconditionnellement par WordPress. Cela évite qu'un éditeur désactive accidentellement la logique applicative depuis `Plugins > Plugins installés`. C'est le pattern recommandé pour la logique critique d'une application WordPress.

### Séparation stricte des responsabilités
Chaque fichier a une responsabilité unique et documentée en tête de fichier (`@see` vers les autres plugins). Cette organisation facilite la navigation et la maintenabilité.

### ACF Local Field Groups (PHP)
Définir les groupes ACF en PHP (plutôt qu'en base) les rend versionnables via Git et évite leur perte lors d'une migration de base de données. C'est la pratique recommandée pour les environnements professionnels.

### Synchronisation `wp_users` ↔ `wp_olthem_users`
La double table est une contrainte de l'architecture headless (WordPress exige `wp_users` pour son système de métadonnées/tokens). La fonction `olthem_upsert_custom_user_row()` maintient la cohérence entre les deux à chaque modification.

### Sécurité
- Mots de passe hachés avec bcrypt (`password_hash` via WordPress)
- Tokens opaques hachés (non réversibles) en base de données
- Toutes les requêtes SQL passent par les méthodes préparées de `$wpdb` (`prepare`, `get_var`, `get_results`)
- Les inputs sont systématiquement sanitisés (`sanitize_text_field`, `absint`, validation regex)
- La connexion au back-office WP est restreinte à l'email uniquement (pas de username)

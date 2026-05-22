# Architecture SCSS — Olthem

> Document produit pour le Travail de Fin d'Études (TFE)  
> Date : mai 2026  
> Compilateur : Dart Sass 1.93.x  
> Sortie : `assets/css/main.css` (compressed, sans source map)

---

## 1. Vue d'ensemble

Le styling d'Olthem repose sur **SCSS (Sass)** compilé vers un fichier CSS unique. Aucun framework CSS (Bootstrap, Tailwind…) n'est utilisé : l'intégralité des styles est écrite sur mesure.

```
src/scss/
├── style.scss              ← point d'entrée unique (@use de tout)
├── base/                   ← fondations : reset, variables, styles globaux
│   ├── _variables.scss
│   ├── _reset.scss
│   └── _base.scss
├── layout/                 ← squelette structurel de la page
│   ├── _header.scss
│   ├── _sections.scss
│   └── _page.scss
└── components/             ← composants UI indépendants
    ├── _button.scss
    ├── _cards.scss
    ├── _carousel.scss
    ├── _overlay.scss
    ├── _thm-overlay.scss
    ├── _icon-link.scss
    ├── _loader.scss
    ├── _popup.scss
    ├── _section-builder.scss
    ├── _form-builder.scss
    ├── _layouts.scss
    ├── _compte.scss
    ├── _ateliers-map.scss
    ├── _secondary-scroll.scss
    └── _admin-tool.scss
```

**Pipeline de compilation :**

```
src/scss/style.scss
    └── @use (base + layout + components)
              ↓
    sass --style=compressed --no-source-map
              ↓
    assets/css/main.css   (inclus dans index.html)
```

**Commandes disponibles :**

| Commande | Effet |
|----------|-------|
| `npm run scss:build` | Compilation unique, mode compressed |
| `npm run scss:watch` | Surveillance continue avec recompilation à chaque sauvegarde |

---

## 2. Couche `base/` — Fondations

### 2.1 `_variables.scss` — Système de design tokens

Fichier central importé par **tous** les autres partials via `@use "../base/variables" as *`. Il définit l'intégralité des constantes de design.

#### Layout

| Variable | Valeur | Rôle |
|----------|--------|------|
| `$header-height` | `140px` | Hauteur fixe du header |
| `$container-max-width` | `960px` | Largeur max du contenu standard (`contentContainer`) |
| `$large-container-max-width` | `1200px` | Largeur max du contenu élargi (`largeContainer`, AdminTool) |

#### Breakpoints

| Variable | Valeur | Usage |
|----------|--------|-------|
| `$bp-sm` | `480px` | Petit mobile |
| `$bp-md` | `768px` | Tablette portrait |
| `$bp-lg` | `1024px` | Tablette paysage |
| `$bp-xl` | `1280px` | **Pivot principal mobile ↔ desktop** |

> `$bp-xl` est le seuil le plus critique : il conditionne le passage au scroll magnétique, la disparition du menu burger, et la réorganisation complète du header.

#### Mixins responsive

```scss
@mixin below($bp) {
  @media (max-width: #{$bp - 1px}) { @content; }
}
@mixin above($bp) {
  @media (min-width: #{$bp}) { @content; }
}
```

Utilisés systématiquement pour éviter les `@media` en dur dans les partials.

#### Palette de couleurs

| Variable | Valeur hex | Usage |
|----------|------------|-------|
| `$dark` | `#00000C` | Fond principal, couleur de base |
| `$grey-dark` | `#20202A` | Séparateurs, fonds secondaires |
| `$grey` | `#3F3F48` | Éléments intermédiaires |
| `$grey-light` | `#7F7F85` | Texte secondaire, icônes, borders |
| `$white` | `#FFFFFF` | Texte principal, éléments actifs |
| `$validGreen` | `#5DBB63` | Indicateur de validation (statut atelier) |

Le design est intégralement en **dark mode natif** (fond quasi-noir, texte blanc).

#### Typographie

| Variable | Valeur |
|----------|--------|
| `$font-family` | `'Geologica', sans-serif` |
| `$font-weight-thin` … `$font-weight-black` | `100` à `900` |
| `$font-size-body` | `16px` |
| `$font-size-h1` | `48px` |
| `$font-size-h2` | `16px` (uppercase + letter-spacing) |

---

### 2.2 `_reset.scss` — Normalisation

Reset minimaliste appliqué globalement avant tout style projet.

**Règles clés :**

| Règle | Justification |
|-------|---------------|
| `box-sizing: border-box` (universel) | Prévisibilité des largeurs avec padding inclus |
| `user-select: none` (universel) | Supprime la sélection de texte parasite sur toute l'UI |
| `user-select: text` sur inputs/textarea | Réactive la sélection là où elle est nécessaire |
| `scroll-behavior: smooth` sur `html` | Overridé sur mobile (`scroll-behavior: auto`) pour que `scrollTo(0,0)` soit instantané |
| `margin: 0` sur body, h1–h3, p, ul | Supprime les marges navigateur par défaut |
| `[hidden] { display: none !important }` | Empêche qu'une règle `display: flex` sur un composant ne masque l'attribut `hidden` natif |
| `font: inherit` sur inputs/buttons | Assure l'héritage de `$font-family` sur tous les contrôles de formulaire |

---

### 2.3 `_base.scss` — Styles globaux et CSS custom properties

Définit les styles de base du document et expose les **CSS custom properties** (variables CSS runtime).

#### Variables CSS (`:root`)

```scss
:root {
  --color-dark, --color-grey-dark, --color-grey, --color-grey-light, --color-white
  --header-height: 140px
  --container: 960px
  --radius-lg: 20px
  --radius-md: 12px
  --space-section: clamp(2rem, 4vw, 4rem)
}
```

> Les couleurs sont dupliquées en CSS variables pour permettre leur accès depuis JavaScript (ex : `document.documentElement.style.getPropertyValue('--color-dark')`).

#### Scroll desktop vs mobile

Le comportement de scroll est radicalement différent selon la taille d'écran :

| Contexte | `html` | `body` | Mécanisme |
|----------|--------|--------|-----------|
| **Desktop** (`above($bp-xl)`) | `overflow-y: scroll` (scrollbar fixe) | `overflow: hidden` (pas de scroll natif) | Scroll magnétique JS via `translateY` sur `#scroll-track` |
| **Mobile** (`below($bp-xl)`) | `overflow: hidden`, `height: 100dvh` | `overflow: hidden`, `height: 100dvh` | Scroll natif CSS `snap` dans `#scroll-viewport` |

> **`dvh` (dynamic viewport height)** : utilisé sur mobile pour éviter les décalages causés par la barre d'URL du navigateur qui apparaît/disparaît.

#### Styles de base du document

| Sélecteur | Rendu |
|-----------|-------|
| `body` | Geologica, fond `$dark`, texte `$white` |
| `h1` | 48px, bold, line-height 1.1 |
| `h2` | 16px, uppercase, `$grey-light`, letter-spacing 0.08em |
| `p` | 16px, light, line-height 1.6 |
| `.section` | Centré, `max-width: 960px`, padding vertical via `--space-section` |

---

## 3. Couche `layout/` — Squelette structurel

### 3.1 `_header.scss` — En-tête fixe

Le header est un composant fixe (`position: fixed; top: 0; z-index: 1000`) de hauteur `140px` structuré en trois colonnes égales :

```
┌──────────────────────────────────────────────────────────────┐
│  .site-header__left (500px)                                  │
│    └── .site-logo (img + tagline)                            │
│  .site-header__center (flex: 1)                              │
│    └── .site-nav (liens de navigation)                       │
│  .site-header__right (500px)                                 │
│    └── .header-actions (recherche + auth)                    │
└──────────────────────────────────────────────────────────────┘
```

**Éléments notables :**

| Classe | Description |
|--------|-------------|
| `.site-header::after` | Séparateur bas (1px `$grey-dark`), apparu uniquement via `.is-away-from-home` |
| `.site-logo__img` | `filter: brightness(0) invert(1)` — force le rendu blanc du SVG |
| `.site-nav__link` | Transition de taille (`font-size: 18px → 21px`) sur l'état `.is-active` |
| `.site-search` | Champ caché, révélé par `.site-header__right.is-search-open` |
| `.is-authenticated` | Classe d'état injectée par JS — masque/révèle les actions de connexion vs profil |

**Z-index du header :** `1000` au repos, `1100` pour le menu burger et le menu mobile (au-dessus de tout, sauf le loader).

---

### 3.2 `_sections.scss` — Système de scroll pleine page

Implémente le conteneur du scroll magnétique desktop et le scroll snap mobile.

#### Architecture DOM

```
#scroll-viewport   (position: fixed, top: --header-height, overflow: hidden)
  └── #scroll-track   (will-change: transform, translateY piloté par JS)
        ├── .full-section   (100vw × calc(100vh - header))
        ├── .full-section
        └── ...
```

#### Différences desktop / mobile

| Propriété | Desktop | Mobile |
|-----------|---------|--------|
| `#scroll-viewport` | `position: fixed` | `position: absolute` (évite l'overflow lié à la scrollbar Windows) |
| `#scroll-viewport` overflow | `hidden` (JS gère tout) | `overflow-y: auto` + `scroll-snap-type: y mandatory` |
| `#scroll-track` transform | `translateY(valeur JS)` | `none !important` (ignoré sur mobile) |
| `.full-section` hauteur | `calc(100vh - header-height)` | `auto; min-height: 100dvh` |
| `.full-section` snap | — | `scroll-snap-align: start; scroll-snap-stop: always` |

> **Note critique :** `position: absolute` sur `#scroll-viewport` en mobile est intentionnel. Sur Windows/Chrome, `window.innerWidth` inclut la largeur de la scrollbar système (~15px), ce qui génère un overflow horizontal avec `position: fixed`. Avec `position: absolute`, le containing block est `body.clientWidth` (sans scrollbar) → pas d'overflow.

**`.section-inner`** : wrapper de contenu centré (`max-width: 960px`, padding `clamp(2rem, 4vw, 4rem) 22px`).

---

### 3.3 `_page.scss` — Layouts spécifiques aux pages

Fichier réservé aux styles propres à des pages uniques. Actuellement vide (en attente de spécifications page par page).

---

## 4. Couche `components/` — Composants UI

### 4.1 `_button.scss` — Système de boutons unifié

Tous les boutons du projet héritent de `.buttonRound` via `@extend`. Il n'y a **pas de redéfinition** des propriétés communes, uniquement des surcharges de différenciation.

| Classe | Usage | Différence |
|--------|-------|------------|
| `.buttonRound` | CTA principal | Fond `$dark`, bordure `$white`, hover inverse |
| `.buttonRound--ghost` | Action secondaire | Bordure et texte semi-transparents (35% / 55%) |
| `.buttonRoundNav` | Navigation | Bordure et texte `$grey-light` |
| `.buttonRoundAct` | Actions UI (save, delete…) | Fond `$grey-light`, texte `$dark` — bouton "actionnable" |

Tous partagent : hauteur 48px, `border-radius: 100px`, police Geologica uppercase, `cursor: pointer`, transition `0.25s ease`.

> **Contexte thématique :** Dans `.thm-card`, le fond de `.buttonRound` prend la couleur `var(--thm-color)` (variable CSS injectée par JS par thématique).

---

### 4.2 `_cards.scss` — Cartes thématiques

Composant visuel principal de la section d'accueil. La carte (`.thm-card`) est une image plein-cadre avec un bandeau blanc en bas contenant le nom de la thématique.

**Variables CSS internes :**

| Variable | Valeur | Usage |
|----------|--------|-------|
| `--banner-h` | `90px` | Hauteur du bandeau blanc bas |
| `--ep-info-h` | `22px` | Hauteur ligne épisode/numéro |

**Technique des icônes SVG :** `.thm-arrow` utilise `mask-image` pour coloriser un SVG monochrome avec n'importe quelle couleur via `background-color: var(--arrow-color, currentColor)`. Cette technique est réutilisée dans tout le projet pour les icônes.

---

### 4.3 `_carousel.scss` — Carrousel thématiques

Le carrousel (`.thm-carousel`) est un viewport `overflow-x: clip` (non `hidden`, pour ne pas créer de scroll container) qui laisse les cards déborder verticalement (la card active est agrandie à 110%).

**Effet de fondu latéral :** Un seul pseudo-élément `::before` avec un dégradé CSS crée une zone transparente centrale de ±270px et fond opaque sur les bords — sans masquer le contenu actif :

```scss
background: linear-gradient(
  to right,
  rgba($dark, 1.0)  0%,
  transparent       calc(50% - 270px),
  transparent       calc(50% + 270px),
  rgba($dark, 1.0)  100%
);
```

---

### 4.4 `_overlay.scss` — Overlay de navigation principale

`.page-overlay` est l'overlay fullscreen qui s'ouvre lorsqu'on navigue vers une page (compte, thématique, formulaire, admin…).

**Comportement de z-index :**

| État | z-index | Raison |
|------|---------|--------|
| `.page-overlay` (repos) | `998` | Invisible, derrière tout |
| `.page-overlay.is-visible` | `1060` | Au-dessus du burger menu (`1050`) |

**Variante :** `.page-overlay--fullscreen` commence à `top: 0` (couvre aussi le header).

**`.page-overlay__inner`** : `position: absolute; inset: 0; overflow-y: auto` — zone de scroll interne de l'overlay.

**`.page-overlay__content--admin-tool`** : variante qui élargit le `max-width` à `$large-container-max-width` (1200px) pour l'AdminTool.

---

### 4.5 `_thm-overlay.scss` — Overlay thématique

Overlay secondaire (`.thm-overlay`) qui s'affiche à l'intérieur d'une section thématique, superposé au carrousel. Il est `position: absolute` (pas `fixed`) car il est contenu dans `.full-section`.

**Architecture en calques (de bas en haut) :**

| Calque | Élément | Description |
|--------|---------|-------------|
| 1 | background `$dark` | Couleur de base solide |
| 2 | `__bg-image` | Visual thématique, `opacity: 0.15`, `blur(40px)` |
| 3 | `__bg-pattern` | Pattern SVG diagonal tilé 16×16px |
| 4 | `__inner` | Zone de contenu scrollable |

`--thm-color` est une variable CSS injectée par JS lors de l'ouverture de l'overlay. Elle pilote la couleur du titre (`.layout-title__title`) et d'autres accents visuels.

---

### 4.6 `_icon-link.scss` — Lien avec icône

Composant réutilisable (`.icon-link`) pour les paires icône + label. La coloration de l'icône SVG (toujours blanche dans les fichiers) est gérée par `filter: brightness(0) invert(1) opacity(0.5)`, passant à `opacity(1)` au survol.

---

### 4.8 `_loader.scss` — Écran de chargement initial

`.site-loader` est un écran noir pleine page (`z-index: 9999`) qui affiche le logo centré avec une barre de progression. Il se masque via la classe `.is-hiding` (`opacity: 0; visibility: hidden`) dès que la page d'accueil est hydratée par JavaScript.

C'est le z-index le plus élevé de l'application — au-dessus de tout.

---

### 4.9 `_popup.scss` — Boîte de dialogue de confirmation

`.popup-overlay` est une modale centrée (`position: fixed; z-index: 1200`) utilisée pour les confirmations (suppression d'utilisateur, suppression d'atelier).

> **z-index : 1200** — volontairement supérieur à `.page-overlay.is-visible` (1060) pour s'afficher correctement par-dessus l'AdminTool quand celui-ci est ouvert dans un overlay.

La boîte affiche un message, un bouton "Annuler" et un bouton "Confirmer". Elle retourne une `Promise<boolean>` via `showConfirm()` dans `popup.js`.

---

### 4.10 `_section-builder.scss` — Constructeur de sections

Styles des blocs de contenu générés par le Section Builder ACF.

**`.layout-button-overlay`** : wrapper centré du bouton d'accès à un overlay depuis une section.

**`.section-subsections`** : layout à sous-navigation interne (barre de 48px + zone de contenu scrollable en dessous).

**`.section-builder-stack`** : conteneur flex-column `justify-content: center` pour verticaliser le contenu dans une `.full-section`.

---

### 4.11 `_layouts.scss` — Blocs de contenu ACF

Styles de tous les types de blocs disponibles dans le Section Builder :

| Classe | Bloc | Description |
|--------|------|-------------|
| `.layout-video` | Vidéo | Ratio 16:9 (`padding-top: 56.25%`), façade avec bouton play CSS |
| `.layout-text` | Texte | Bloc de paragraphes avec formatage éditorial |
| `.layout-image` | Image | Positionnement avec décalages `xoffset`/`yoffset` |
| `.layout-gallery` | Galerie | Grille d'images avec mode carrousel ou canvas |
| `.layout-audio` | Audio | Composant lecteur audio custom |
| `.layout-pdf` | PDF | Lien de téléchargement stylisé |
| `.layout-logo` | Logo | Affichage de logo avec échelle |
| `.layout-formbuilder` | Formulaire | Voir §4.12 |

---

### 4.12 `_form-builder.scss` — Formulaires dynamiques

`.layout-formbuilder` est le composant formulaire généré dynamiquement depuis les données ACF. Il supporte deux modes de mise en page :

| Modificateur | Colonnes champs | Max-width | Usage |
|-------------|-----------------|-----------|-------|
| `.layout-formbuilder--simple` | 2 colonnes | 600px | Formulaires courts (login, inscription) |
| `.layout-formbuilder--double` | 2×2 colonnes | 1200px | Formulaires longs avec deux colonnes |

**Variables CSS internes :**

| Variable | Valeur |
|----------|--------|
| `--field-column-gap` | `24px` |
| `--validation-icon-size` | `14px` |

Les champs de formulaire (`__field`) ont des états visuels pour la validation : `.is-valid` (bordure verte), `.is-error` (bordure rouge + message `__field-error`).

---

### 4.13 `_compte.scss` — Page compte utilisateur

Styles spécifiques à la page de profil utilisateur connecté.

| Classe | Description |
|--------|-------------|
| `.compte-readonly` | Mode lecture : liste label/valeur avec séparateurs horizontaux |
| `.compte-readonly__label` | 150px min-width, 12px light, `$grey-light` |
| `.compte-readonly__value` | flex: 1, 14px, `$white`, overflow ellipsis |
| `.compte-edit-actions` | Surcharge de `.layout-formbuilder__actions` pour disposer les boutons horizontalement |

---

### 4.14 `_ateliers-map.scss` — Carte des ateliers

Styles du bloc carte + liste des ateliers à venir.

**Architecture du composant :**

```
.ateliers-map-block  (flex-column)
  ├── .ateliers-map         (carte Mapbox)
  └── .ateliers-list-wrap   (scope anchor pour la scrollbar custom)
        └── .ateliers-list-col   (overflow-y: auto, scrollbar masquée)
              └── .ateliers-list   (liste des items)
                    └── .atelier-item   (1 atelier)
                          ├── .atelier-date-badge
                          └── .atelier-info
```

`.atelier-item--highlighted` : état actif (correspondance avec le marqueur survolé sur la carte), signalé par `border-left: 2px solid $grey-light`.

---

### 4.15 `_secondary-scroll.scss` — Scrollbar custom CSS

Composant technique qui implémente une **scrollbar custom animée** pour les zones de contenu internes (liste des ateliers, overlays).

**Technique :** Utilise `@property` (Houdini CSS) pour animer les valeurs des fades en entrée/sortie :

```scss
@property --secondary-fade-top    { syntax: '<length>'; }
@property --secondary-fade-bottom { syntax: '<length>'; }
```

Le masquage en fondu est réalisé par `mask-image: linear-gradient(...)` interpolant les valeurs animables `--secondary-fade-top` et `--secondary-fade-bottom`.

La scrollbar visuelle (`.secondary-scrollbar`) est un élément DOM absolu avec un rail et un thumb — gérés par `secondary-scroll.js`.

---

### 4.16 `_admin-tool.scss` — Interface d'administration JS

Styles de l'AdminTool custom (onglets, liste d'entrées accordéon, filtres, formulaire d'édition inline).

**Variables CSS internes (grille des entrées) :**

```scss
.admin-tool {
  --admin-entry-id-col:   56px;
  --admin-entry-date-col: minmax(145px, 0.9fr);
  --admin-entry-user-col: minmax(170px, 1.2fr);
  --admin-entry-mail-col: minmax(230px, 1.4fr);
  --admin-entry-grid:     /* combinaison des 4 colonnes */;
}
```

**Organisation en onglets :**

```
.admin-tool__tabs
  ├── .admin-tool__tabs-nav  (boutons onglets)
  └── .admin-tool__tabs-line (ligne de séparation extensible)
```

Chaque entrée (`.admin-tool__entry`) est un accordéon :
- **tête** : grille CSS avec ID, info principale, statut, bouton toggle
- **corps** : formulaire d'édition inline masqué (`hidden`) — révélé au clic

**Animation d'apparition des entrées :** `@keyframes admin-entry-appear` — fondu + `translateY(6px)` appliqué à chaque item de liste au chargement.

---

## 5. Conventions et patterns récurrents

### BEM (Block Element Modifier)

Tous les composants suivent la convention BEM :

```scss
.block { }
.block__element { }
.block__element--modifier { }
```

Exemples : `.admin-tool__entry`, `.admin-tool__entry--highlighted`, `.thm-card__visual`, `.site-header__left`.

### Nommage des états JS

Les états injectés par JavaScript suivent la convention `.is-[état]` :

| Classe | Composant | Déclencheur |
|--------|-----------|-------------|
| `.is-visible` | overlay, thm-overlay | Ouverture via JS |
| `.is-active` | nav links, tabs, subsection items | Navigation |
| `.is-expanded` | accordéons admin-tool | Toggle formulaire |
| `.is-search-open` | header right | Clic icône recherche |
| `.is-authenticated` | header right | Session JWT active |
| `.is-away-from-home` | site-header | Scroll hors section accueil |
| `.is-hiding` | site-loader | Fin du chargement initial |

### CSS custom properties pour les valeurs dynamiques JS→CSS

Plusieurs valeurs ne peuvent être connues qu'à l'exécution et sont passées de JavaScript à CSS via des custom properties :

| Variable | Injectée par | Usage |
|----------|-------------|-------|
| `--thm-color` | JS (thématique active) | Couleur d'accent des overlays thématiques |
| `--header-height` | CSS (`:root`) | Toutes les hauteurs `calc(100vh - var(--header-height))` |
| `--secondary-fade-top/bottom` | `@property` + JS | Fades de la scrollbar custom |
| `--secondary-pad-top/bottom` | JS | Zones de padding animées |

### Technique de colorisation SVG par `filter`

Les icônes SVG du projet sont originellement noires ou blanches. La colorisation se fait entièrement via CSS :

```scss
// Blanc à 50% d'opacité (état repos)
filter: brightness(0) invert(1) opacity(0.5);

// Blanc à 100% (état hover/actif)
filter: brightness(0) invert(1) opacity(1);
```

Alternative via `mask-image` (pour les icônes du `.thm-arrow`) :

```scss
background-color: var(--arrow-color, currentColor);
mask-image: url('../images/icons/icon_ArrowRight.svg');
mask-size: contain;
```

---

## 6. Hiérarchie des z-index

| Valeur | Élément | Description |
|--------|---------|-------------|
| `1` | éléments internes `.admin-tool` | Positionnement relatif interne |
| `998` | `.page-overlay` (repos) / `.thm-overlay` | Overlays invisibles |
| `1000` | `.site-header` | Header fixe |
| `1001` | `.page-overlay__retour` / `.thm-overlay__inner` | Bouton retour / contenu overlay |
| `1050` | Burger menu (mobile) | Menu hamburger ouvert |
| `1060` | `.page-overlay.is-visible` | Overlay actif (au-dessus du burger) |
| `1100` | Header burger icon / mobile nav | Icône et navigation mobile active |
| `1200` | `.popup-overlay` | Modale de confirmation (au-dessus de tout sauf loader) |
| `9999` | `.site-loader` | Écran de chargement initial |

---

## 7. Point d'entrée — `style.scss`

Le fichier racine ne contient **aucun style** : il orchestre uniquement les `@use` dans l'ordre de dépendance.

```scss
// 1. Variables (importées en premier — `as *` pour namespace global)
@use "base/variables" as *;

// 2. Reset (pas de dépendance aux variables)
@use "base/reset";

// 3. Base (dépend des variables)
@use "base/base";

// 4. Layout (dépendent des variables)
@use "layout/header";
@use "layout/sections";
@use "layout/page";

// 5. Composants (dépendent des variables)
@use "components/icon-link";
@use "components/button";
// ... (14 autres composants)
@use "components/loader";
```

> L'ordre des `@use` dans `style.scss` détermine l'ordre de cascade dans le CSS compilé. Les styles de base doivent précéder les composants pour que les surcharges fonctionnent correctement.

---

*Fin du document — Analyse générée à partir du code source SCSS du projet Olthem (mai 2026)*

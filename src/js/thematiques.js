import { fetchThematiques } from './api.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

const HEADER_ORDER = { premier: 1, deuxieme: 2, troisieme: 3 };

// ─── Store global des thématiques (pour l'overlay) ───────────────────────────

let _thematiquesStore = [];

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function arrowSpan(dir) {
  return `<span class="thm-arrow thm-arrow--${dir}" aria-hidden="true"></span>`;
}

// ─── Ajustement du visuel : contain si l'image est assez large, cover sinon ──
//
// Si la hauteur de l'image est contrainte à (card H - bandeau H),
// on calcule la largeur rendue : si elle couvre toute la card → contain.
// Sinon l'image serait trop étroite et laisserait des espaces vides → cover.

// ─── Overlay thématique + sous-menu ─────────────────────────────────────────

function _hexToRgba(hex, alpha) {
  const h = (hex || '#3F3F48').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Parse + rendu des subSections depuis le builder ACF ──────────────────
// Structure : builder = repeater rows, chaque row contient :
//   subsection (flexible content) avec layouts :
//     - subsectiontitle : { title, subtitle, displaytile, displaysubtitle }
//     - videosolo       : { videolink, videotitle, videotext, displayvideotitle, displayvideotext }
//     - textbloc        : { text, persotext }

function _parseSubSections(builder) {
  if (!Array.isArray(builder)) return [];
  return builder.map(row => {
    const layouts = Array.isArray(row.subsection) ? row.subsection : [];
    const header  = layouts.find(l => l.acf_fc_layout === 'subsectiontitle');
    const content = layouts.filter(l => l.acf_fc_layout !== 'subsectiontitle');
    return {
      title:       header?.title    ?? '',
      subtitle:    header?.subtitle ?? '',
      showSubtitle: !!(header?.displaysubtitle && header?.subtitle),
      layouts:     content,
    };
  }).filter(ss => ss.title);
}

function _youtubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&\s]{11})/);
  return m ? m[1] : null;
}

// Extrait une URL propre depuis un champ ACF qui peut contenir du HTML ou src=”...”
function _extractIframeSrc(raw) {
  if (!raw) return null;
  // 1. Parser le HTML pour obtenir le texte brut (gère les entités &amp; etc.)
  const tmp = document.createElement('div');
  tmp.innerHTML = raw;
  const text = (tmp.querySelector('a')?.href ?? tmp.textContent ?? '').trim();
  // 2. Supprimer le préfixe parasite "http://src=" ou "src="
  const cleaned = text.replace(/^(?:https?:\/\/)?src=["’]?/i, '').replace(/["’]$/, '');
  // 3. Normaliser : s'assurer que l'URL commence par // ou https://
  if (!cleaned || (!cleaned.startsWith('//') && !cleaned.startsWith('http'))) return null;
  return cleaned;
}

function _renderLayout(layout) {
  switch (layout.acf_fc_layout) {
    case 'videosolo': {
      const ytId = _youtubeId(layout.videolink);
      const embed = ytId ? `
        <div class="layout-video__wrapper">
          <div class="layout-video__facade" data-yt-id="${esc(ytId)}">
            <img
              class="layout-video__thumb"
              src="https://img.youtube.com/vi/${esc(ytId)}/maxresdefault.jpg"
              onerror="this.src='https://img.youtube.com/vi/${esc(ytId)}/hqdefault.jpg'"
              alt=""
              loading="lazy"
            />
            <button class="layout-video__play" type="button" aria-label="Lire la vidéo"></button>
          </div>
        </div>` : '';
      const title = layout.displayvideotitle && layout.videotitle
        ? `<p class="layout-video__title">${esc(layout.videotitle)}</p>` : '';
      const text  = layout.displayvideotext && layout.videotext
        ? `<p class="layout-video__text">${esc(layout.videotext)}</p>`  : '';
      return `<div class="layout-video">${embed}${title}${text}</div>`;
    }
    case 'textbloc': {
      const cls = layout.persotext == '1' || layout.persotext === true || layout.persotext === 1 || layout.persotext === 'true'
        ? 'layout-text layout-text--perso'
        : 'layout-text';
      return `<div class="${cls}">${layout.text ?? ''}</div>`;
    }
    case 'paragraphetitle': {
      if (!layout.paragraphename) return '';
      return `<div class="layout-paragraph-title">${esc(layout.paragraphename)}</div>`;
    }
    case 'audiofile': {
      if (!layout.audiofile) return '';
      const title = layout.audiotitle
        ? `<p class="layout-audio__title">${esc(layout.audiotitle)}</p>` : '';
      return `
        <div class="layout-audio">
          ${title}
          <audio class="layout-audio__player" controls preload="metadata">
            <source src="${esc(layout.audiofile)}" type="audio/mpeg">
          </audio>
        </div>`;
    }
    case 'iframe': {
      const src = _extractIframeSrc(layout.iframe);
      if (!src) return '';
      // Extraire le bkcode pour les liens d'attribution Calameo
      const bkcodeMatch = src.match(/[?&]bkcode=([^&]+)/);
      const bkcode = bkcodeMatch ? bkcodeMatch[1] : null;
      const linkTop = bkcode
        ? `<p class="layout-iframe__attr layout-iframe__attr--top"><a href="//www.calameo.com/books/${esc(bkcode)}" target="_blank" rel="noopener">View this publication on Calaméo</a></p>`
        : '';
      const linkBottom = bkcode
        ? `<p class="layout-iframe__attr layout-iframe__attr--bottom"><a href="//www.calameo.com/" target="_blank" rel="noopener">Publish at Calaméo</a> or <a href="//www.calameo.com/library/" target="_blank" rel="noopener">browse the library</a>.</p>`
        : '';
      return `
        <div class="layout-iframe">
          ${linkTop}
          <div class="layout-iframe__wrapper">
            <iframe
              src="${esc(src)}"
              allowfullscreen
              scrolling="no"
              loading="lazy"
            ></iframe>
          </div>
          ${linkBottom}
        </div>`;
    }
    default:
      return '';
  }
}

function _renderSubsectionContent(container, subSection, color) {
  if (!container) return;
  const thmColor = esc(color || '#3F3F48');

  // Propager la couleur sur le container pour que tous les enfants y aient accès
  container.style.setProperty('--thm-color', thmColor);

  const subtitleHtml = subSection.showSubtitle
    ? `<p class="thm-overlay__section-subtitle">${esc(subSection.subtitle)}</p>`
    : '';

  const titleBlock = `
    <div class="thm-overlay__section-title-block">
      <div class="thm-overlay__title-wrap">
        ${arrowSpan('right')}
        <h2 class="thm-overlay__section-title">${esc(subSection.title)}</h2>
        ${arrowSpan('left')}
      </div>
      ${subtitleHtml}
    </div>`;

  container.innerHTML = titleBlock + subSection.layouts.map(_renderLayout).join('');

  // 32px entre un textbloc et l'élément qui suit (quel qu'il soit)
  const texts = [...container.querySelectorAll('.layout-text')];
  texts.forEach(el => {
    el.style.marginBottom = el.nextElementSibling ? '32px' : '';
  });

  // L'élément précédant un paragraphetitle cède sa marge : seul le margin-top du titre compte (72px)
  container.querySelectorAll('.layout-paragraph-title').forEach(el => {
    if (el.previousElementSibling) {
      el.previousElementSibling.style.marginBottom = '0';
    }
  });
}

// ─── Header thématique pour le mode subSection unique ───────────────────────
// Miroir du buildCard : épisode = [flèche] personnage [flèche] + titre en dessous,
// neutre = [flèche] titre [flèche].

function _buildThmOverlayHeader(thm) {
  const isEpisode = thm.episode && thm.personnage;

  if (isEpisode) {
    return `
      <div class="thm-overlay__thm-header thm-overlay__thm-header--episode">
        <div class="thm-overlay__title-wrap">
          ${arrowSpan('right')}
          <span class="thm-overlay__thm-personnage">${esc(thm.personnage)}</span>
          ${arrowSpan('left')}
        </div>
        <span class="thm-overlay__thm-episode">Épisode ${esc(thm.episode_numero ?? '')}</span>
        <span class="thm-overlay__thm-titre">${esc(thm.titre)}</span>
      </div>`;
  }

  return `
    <div class="thm-overlay__thm-header">
      <div class="thm-overlay__title-wrap">
        ${arrowSpan('right')}
        <span class="thm-overlay__thm-titre">${esc(thm.titre)}</span>
        ${arrowSpan('left')}
      </div>
    </div>`;
}

// Collecte tous les layouts de contenu du builder (hors subsectiontitle),
// utilisé quand aucune subSection titrée n'est définie.

function _allLayouts(builder) {
  if (!Array.isArray(builder)) return [];
  return builder.flatMap(row => {
    const layouts = Array.isArray(row.subsection) ? row.subsection : [];
    return layouts.filter(l => l.acf_fc_layout !== 'subsectiontitle');
  });
}

// Rendu du contenu pour le cas subSection unique : header thématique + layouts.

function _renderSingleSubSection(container, subSection, thm) {
  if (!container) return;
  container.style.setProperty('--thm-color', esc(thm.couleur || '#3F3F48'));
  container.innerHTML = _buildThmOverlayHeader(thm) + subSection.layouts.map(_renderLayout).join('');

  const texts = [...container.querySelectorAll('.layout-text')];
  texts.forEach(el => {
    el.style.marginBottom = el.nextElementSibling ? '32px' : '';
  });
  container.querySelectorAll('.layout-paragraph-title').forEach(el => {
    if (el.previousElementSibling) el.previousElementSibling.style.marginBottom = '0';
  });
}

function openOverlay(thm) {
  const submenu       = document.getElementById('site-submenu');
  const overlay       = document.getElementById('thm-overlay');
  const nav           = document.getElementById('site-submenu-nav');
  const inner         = document.getElementById('thm-overlay-inner');
  const retour        = document.getElementById('site-submenu-retour');
  const overlayRetour = document.getElementById('thm-overlay-retour');
  if (!submenu || !overlay || !nav) return;

  // Naviguer silencieusement vers la section thématiques (sans animation ni
  // transition sur le menu principal) quelle que soit la section d'origine.
  window.dispatchEvent(new CustomEvent('scroll:goto', {
    detail: { section: 'thematiques', animate: false }
  }));

  // Couleur du sous-menu : thématique à 50% opacité
  submenu.style.setProperty('--submenu-bg', _hexToRgba(thm.couleur, 0.5));

  // Visuel de fond de l'overlay (image thématique floue)
  const bgImg = document.getElementById('thm-overlay-bg-image');
  if (bgImg) {
    const imgUrl = thm.visuel?.sizes?.large ?? thm.visuel?.url ?? null;
    bgImg.style.backgroundImage = imgUrl ? `url('${imgUrl}')` : 'none';
  }

  // ── SubSections issues du builder ACF ─────────────────────────────────
  const subSections = _parseSubSections(thm.builder);
  const isSingle    = subSections.length <= 1;

  if (isSingle) {
    // Cas 0 ou 1 subSection : masquer le sous-menu, afficher le header thématique
    // Dans les deux cas on utilise _allLayouts pour ramasser tout le contenu
    // de tous les rows du builder, peu importe dans quel row se trouve le titre.
    const ss = {
      ...(subSections[0] ?? { title: '', subtitle: '', showSubtitle: false }),
      layouts: _allLayouts(thm.builder),
    };
    overlay.classList.add('thm-overlay--no-submenu');
    // --thm-color sur l'overlay entier (pas seulement inner) pour le bouton retour
    overlay.style.setProperty('--thm-color', esc(thm.couleur || '#3F3F48'));
    _renderSingleSubSection(inner, ss, thm);
    overlayRetour?.addEventListener('click', closeOverlay, { once: true });
  } else {
    overlay.classList.remove('thm-overlay--no-submenu');

    // Construire les items du sous-menu
    if (subSections.length) {
      nav.innerHTML = subSections
        .map((ss, i) =>
          `<button class="site-submenu__item${i === 0 ? ' is-active' : ''}" type="button" data-ss-index="${i}">${esc(ss.title)}</button>`
        ).join('');
    } else {
      // Pas de subSections définies : afficher le titre de la thématique seul
      nav.innerHTML = `<button class="site-submenu__item is-active" type="button">${esc(thm.titre)}</button>`;
    }

    // Afficher la première subSection
    if (subSections.length) {
      _renderSubsectionContent(inner, subSections[0], thm.couleur);
    }

    // Switch de subSection au clic dans le sous-menu
    nav.querySelectorAll('.site-submenu__item').forEach(btn => {
      btn.addEventListener('click', () => {
        nav.querySelectorAll('.site-submenu__item').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const idx = parseInt(btn.dataset.ssIndex ?? '0', 10);
        if (subSections[idx]) _renderSubsectionContent(inner, subSections[idx], thm.couleur);
      });
    });

    submenu.classList.add('is-visible');
    submenu.setAttribute('aria-hidden', 'false');
    retour?.addEventListener('click', closeOverlay, { once: true });
  }

  overlay.classList.add('is-visible');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeOverlay() {
  const submenu = document.getElementById('site-submenu');
  const overlay = document.getElementById('thm-overlay');
  submenu?.classList.remove('is-visible');
  submenu?.setAttribute('aria-hidden', 'true');
  overlay?.classList.remove('is-visible');
  overlay?.setAttribute('aria-hidden', 'true');
  // Retirer --no-submenu après la fin du fade (0.35s) pour éviter le saut de __inner
  setTimeout(() => overlay?.classList.remove('thm-overlay--no-submenu'), 350);
}
// ─── Facade vidéo : charge l'iframe au clic ─────────────────────────────────────────

document.addEventListener('click', e => {
  const facade = e.target.closest('.layout-video__facade');
  if (!facade) return;
  const ytId = facade.dataset.ytId;
  if (!ytId) return;
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1`;
  iframe.allow = 'autoplay; encrypted-media';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;display:block;';
  facade.replaceWith(iframe);
});
// ─── Délégation globale : click sur bouton "Voir la thématique" ───────────────
// Couvre les cards du header ET du carrousel

document.addEventListener('click', e => {
  const btn = e.target.closest('.buttonRound');
  if (!btn) return;
  const card = btn.closest('.thm-card');
  if (!card || !card.dataset.id) return;
  const id = parseInt(card.dataset.id, 10);
  const thm = _thematiquesStore.find(t => t.id === id);
  if (thm) openOverlay(thm);
});

// ─── Ajustement du visuel ─────────────────────────────────────────────────────

function applyVisualFit(img) {
  if (!img.naturalWidth || !img.naturalHeight) return;
  const card = img.closest('.thm-card');
  if (!card) return;

  const cardW   = card.offsetWidth;
  const cardH   = card.offsetHeight;
  if (!cardW || !cardH) return;

  const bannerH   = parseFloat(getComputedStyle(card).getPropertyValue('--banner-h')) || 90;
  const availH    = cardH - bannerH;
  const renderedW = availH * (img.naturalWidth / img.naturalHeight);

  const visual = img.closest('.thm-card__visual');
  if (visual) visual.classList.toggle('is-fit-contain', renderedW >= cardW);
}

function bindVisualFits(container) {
  container.querySelectorAll('.thm-card__visual img').forEach(img => {
    if (img.complete && img.naturalWidth) {
      applyVisualFit(img);
    } else {
      img.addEventListener('load', () => applyVisualFit(img), { once: true });
    }
  });
}

// ─── Constructeur HTML d'une card ─────────────────────────────────────────────
// context : 'header' | 'carousel'

function buildCard(thm, context) {
  const isEpisode = thm.episode && thm.personnage;
  const color     = esc(thm.couleur || '#3F3F48');

  const visualSrc = thm.visuel?.sizes?.large ?? thm.visuel?.url ?? null;
  const visualEl  = visualSrc
    ? `<img src="${esc(visualSrc)}" alt="${esc(thm.titre)}" loading="lazy">`
    : '';

  // ── Floating episode box (visible uniquement si épisode) ──
  const episodeBox = isEpisode ? `
    <div class="thm-card__episode-box">
      <div class="thm-card__title-wrap thm-card__title-wrap--episode">
        ${arrowSpan('right')}
        <span class="thm-card__personnage">${esc(thm.personnage)}</span>
        ${arrowSpan('left')}
      </div>
      <span class="thm-card__episode-info">Épisode ${esc(thm.episode_numero ?? '')}</span>
    </div>` : '';

  // ── Bandeau bas ──
  // Épisode : sous-titre (nom thématique) sans flèches
  // Neutre  : titre encapsulé par les flèches
  const banner = isEpisode
    ? `<div class="thm-card__banner">
        <span class="thm-card__subtitle">${esc(thm.titre)}</span>
      </div>`
    : `<div class="thm-card__banner">
        <div class="thm-card__title-wrap">
          ${arrowSpan('right')}
          <span class="thm-card__title">${esc(thm.titre)}</span>
          ${arrowSpan('left')}
        </div>
      </div>`;

  const rawDescriptif = thm.descriptif_desktop ?? '';
  // 1. Replace <br> par \n, 2. strip les autres tags, 3. esc() le texte, 4. remet les <br>
  const descriptif = esc(
    rawDescriptif
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()
  ).replace(/\n/g, '<br>');

  return `
    <article
      class="thm-card thm-card--${context} ${isEpisode ? 'thm-card--episode' : 'thm-card--neutral'}"
      style="--thm-color: ${color}"
      data-id="${thm.id}"
      aria-label="${esc(thm.titre)}"
    >
      <div class="thm-card__visual">${visualEl}</div>
      <div class="thm-card__overlay-bg"></div>
      <div class="thm-card__overlay-pattern"></div>
      <p class="thm-card__descriptif">${descriptif}</p>
      ${episodeBox}
      ${banner}
      <div class="thm-card__action">
        <button class="buttonRound" type="button">Voir la thématique</button>
      </div>
    </article>`;
}

// ─── Cards header (section Accueil) ───────────────────────────────────────────
// Affiche uniquement les épisodes marqués "header", triés par header_position.

function renderHeaderCards(thematiques) {
  const container = document.getElementById('accueil-header-cards');
  if (!container) return;

  const items = thematiques
    .filter(t => t.header && t.episode)
    .sort((a, b) =>
      (HEADER_ORDER[a.header_position] ?? 99) - (HEADER_ORDER[b.header_position] ?? 99)
    );

  container.innerHTML = items.length
    ? items.map(t => buildCard(t, 'header')).join('')
    : '';

  bindVisualFits(container);
}

// ─── Carousel (section Thématiques) ──────────────────────────────────────────
//
// Architecture : fenêtre glissante de SLOT_TOTAL éléments DOM.
// Chaque élément a un "slot" entier (position relative au centre).
// Sur navigate, tous les slots décalent ; les éléments hors de [-EXTRA, +EXTRA]
// sont recyclés de l'autre côté avec un nouveau contenu.
// → Remplit l'écran en répétant les cards si nécessaire, sans disparition brusque.

const SLOT_EXTRA = 8;                    // cards rendues de chaque côté
const SLOT_TOTAL = SLOT_EXTRA * 2 + 1;  // 17 éléments au total
const CARD_W     = 480;                  // doit correspondre au CSS
const SLOT_GAP   = 32;                   // gap visuel constant entre toutes les cards

// Scale selon distance au centre
function _carouselScale(abs) {
  return abs === 0 ? 1.1 : abs === 1 ? 0.9 : abs === 2 ? 0.8 : 0.7;
}

// Offset X cumulatif du centre de la card (gap visuel réel = SLOT_GAP entre arêtes)
function _carouselOffset(slot) {
  if (slot === 0) return 0;
  const sign = slot > 0 ? 1 : -1;
  const abs  = Math.abs(slot);
  let offset = 0;
  for (let k = 1; k <= abs; k++) {
    const halfPrev = CARD_W * _carouselScale(k - 1) / 2;
    const halfCurr = CARD_W * _carouselScale(k)     / 2;
    offset += halfPrev + SLOT_GAP + halfCurr;
  }
  return sign * offset;
}

class ThmCarousel {
  constructor(track, dotsEl, items) {
    this.track   = track;
    this.dotsEl  = dotsEl;
    this.items   = items;
    this.n       = items.length;
    this.current = 0;

    this._dragging          = false;
    this._dragStartX       = 0;
    this._pointerDownTarget = null;

    this._build();
    this._bindDrag();
    this._bindButtons();
    this._update();
  }

  // ── Index de l'item pour un décalage de slot donné depuis current ──

  _itemAt(slotOffset) {
    return ((this.current + slotOffset) % this.n + this.n) % this.n;
  }

  // ── Rendu initial : SLOT_TOTAL éléments ──

  _build() {
    this.track.innerHTML = '';
    this._elems = [];

    for (let s = -SLOT_EXTRA; s <= SLOT_EXTRA; s++) {
      const thm  = this.items[this._itemAt(s)];
      const tmp  = document.createElement('div');
      tmp.innerHTML = buildCard(thm, 'carousel').trim();
      const el   = tmp.firstElementChild;
      this.track.appendChild(el);
      this._elems.push({ el, slot: s });
    }

    bindVisualFits(this.track);
    this._bindCardClick();

    // Dots
    this.dotsEl.innerHTML = this.items
      .map((_, i) => `<button class="thm-carousel-dots__dot" aria-label="Thématique ${i + 1}"></button>`)
      .join('');
    this.dots = Array.from(this.dotsEl.querySelectorAll('.thm-carousel-dots__dot'));
    this.dots.forEach((dot, i) => dot.addEventListener('click', () => this.goTo(i)));
  }

  // ── Lie le click sur la card (inactive → navigation, bouton → délégué globalement) ──

  _bindCardClick() {
    // Géré par délégation globale pour les boutons (.buttonRound)
    // Ici on expose pointer-events sur toutes les cards pour capter les clics
  }

  // ── Remplace le contenu d'un élément recyclé (même nœud DOM) ──

  _replaceElemContent(item, thm) {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildCard(thm, 'carousel').trim();
    const newEl = tmp.firstElementChild;

    // Désactiver la transition uniquement — les propriétés de positionnement
    // (transform, opacity, z-index…) seront appliquées par _update() juste après.
    // On ne copie PAS style.cssText de l'ancien élément : ça écraserait --thm-color.
    newEl.style.transition = 'none';

    item.el.replaceWith(newEl);
    item.el = newEl;

    // Appliquer le fit visuel sur le nouvel élément
    newEl.querySelectorAll('.thm-card__visual img').forEach(img => {
      if (img.complete && img.naturalWidth) applyVisualFit(img);
      else img.addEventListener('load', () => applyVisualFit(img), { once: true });
    });
  }

  // ── Mise à jour des transforms ──

  _update() {
    this._elems.forEach(({ el, slot }) => {
      const abs    = Math.abs(slot);
      const offset = _carouselOffset(slot);
      const scale  = _carouselScale(abs);
      const opac   = abs === 0 ? '1' : '0.5';

      el.style.opacity       = opac;
      el.style.transform     = `translate(-50%, 0) translateX(${offset}px) scale(${scale})`;
      el.style.zIndex        = String(Math.max(0, 10 - abs));
      el.classList.toggle('is-active', abs === 0);
    });

    this.dots.forEach((dot, i) =>
      dot.classList.toggle('is-active', i === this.current)
    );
  }

  goTo(index) {
    // Chemin le plus court (sens du défilement)
    let delta = ((index - this.current) % this.n + this.n) % this.n;
    if (delta > Math.floor(this.n / 2)) delta -= this.n;
    if (delta === 0) return;

    // Bloquer le hover pendant l'animation
    const carousel = this.track.closest('.thm-carousel');
    carousel?.classList.add('is-transitioning');
    clearTimeout(this._transitionTimer);
    this._transitionTimer = setTimeout(() => carousel?.classList.remove('is-transitioning'), 500);

    this.current = ((index % this.n) + this.n) % this.n;

    // Décaler tous les slots
    for (const item of this._elems) item.slot -= delta;

    // Recycler les éléments sortis de [-EXTRA, +EXTRA]
    const recycled = [];
    for (const item of this._elems) {
      if (item.slot < -SLOT_EXTRA) {
        item.slot += SLOT_TOTAL;
        this._replaceElemContent(item, this.items[this._itemAt(item.slot)]);
        recycled.push(item);
      } else if (item.slot > SLOT_EXTRA) {
        item.slot -= SLOT_TOTAL;
        this._replaceElemContent(item, this.items[this._itemAt(item.slot)]);
        recycled.push(item);
      }
    }

    this._update();

    // Restaurer la transition CSS des éléments recyclés après le repositionnement
    requestAnimationFrame(() => {
      recycled.forEach(({ el }) => el.style.removeProperty('transition'));
    });
  }

  next() { this.goTo(this.current + 1); }
  prev() { this.goTo(this.current - 1); }

  // ── Drag (pointer events — souris + tactile) ──
  // On écoute sur le wrapper .thm-carousel (parent du track) pour capturer
  // les événements même si le pointeur est sur une card enfant.

  _bindDrag() {
    const container = this.track.closest('.thm-carousel') ?? this.track;

    container.addEventListener('pointerdown', e => {
      // Ignorer les clics sur les boutons nav et les boutons de card
      if (e.target.closest('.thm-carousel__btn, .buttonRound')) return;
      this._dragging          = true;
      this._dragStartX       = e.clientX;
      this._pointerDownTarget = e.target;
      container.setPointerCapture(e.pointerId);
      container.style.cursor = 'grabbing';
    });

    container.addEventListener('pointerup', e => {
      if (!this._dragging) return;
      this._dragging = false;
      container.style.cursor = '';

      const delta  = e.clientX - this._dragStartX;
      const target = this._pointerDownTarget;
      this._pointerDownTarget = null;

      if (Math.abs(delta) > 60) {
        delta < 0 ? this.next() : this.prev();
      } else {
        // Clic propre : naviguer vers la card inactive cliquée
        const clickedCard = target?.closest('.thm-card--carousel');
        if (clickedCard && !clickedCard.classList.contains('is-active')) {
          const item = this._elems.find(it => it.el === clickedCard);
          if (item) {
            const targetIndex = ((this.current + item.slot) % this.n + this.n) % this.n;
            this.goTo(targetIndex);
          }
        }
      }
    });

    container.addEventListener('pointercancel', () => {
      this._dragging = false;
      container.style.cursor = '';
    });
  }

  // ── Boutons prev / next ──

  _bindButtons() {
    const wrapper = this.track.closest('.thm-carousel');
    if (!wrapper) return;
    wrapper.querySelector('.thm-carousel__btn--prev')
      ?.addEventListener('click', () => this.prev());
    wrapper.querySelector('.thm-carousel__btn--next')
      ?.addEventListener('click', () => this.next());
  }
}

function renderCarousel(thematiques) {
  const track  = document.getElementById('thm-carousel-track');
  const dotsEl = document.getElementById('thm-carousel-dots');
  if (!track || !dotsEl || !thematiques.length) return;

  new ThmCarousel(track, dotsEl, thematiques);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const thematiques = await fetchThematiques();
    _thematiquesStore = thematiques;
    renderHeaderCards(thematiques);
    renderCarousel(thematiques);
  } catch (err) {
    console.error('[thematiques]', err);
    const container = document.getElementById('accueil-header-cards');
    if (container) {
      container.innerHTML = `
        <p style="padding:16px;max-width:720px;margin:24px auto;font:600 14px/1.5 Geologica,sans-serif;color:#fff;background:#8c1d40;border-radius:8px;">
          Impossible de charger les thématiques depuis l'API WordPress. Vérifiez que votre backend local est démarré
          et, si besoin, forcez l'URL avec ?apiRoot=http://localhost:10010/wp-json
        </p>`;
    }
  }
}

init();

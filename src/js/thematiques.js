import { fetchThematiques } from './api.js';
import { esc, normKey as _normKey } from './utils.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

const HEADER_ORDER = { premier: 1, deuxieme: 2, troisieme: 3 };

// ─── Store global des thématiques (pour l'overlay) ───────────────────────────

let _thematiquesStore = [];

function _mountThematicLayersInSection() {
  const section = document.getElementById('thematiques');
  if (!section) return;

  const submenu = document.getElementById('site-submenu');
  const overlay = document.getElementById('thm-overlay');

  if (submenu && submenu.parentElement !== section) {
    section.appendChild(submenu);
  }

  if (overlay && overlay.parentElement !== section) {
    section.appendChild(overlay);
  }
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function arrowSpan(dir) {
  return `<span class="thm-arrow thm-arrow--${dir}" aria-hidden="true"></span>`;
}

// ─── Ajustement du visuel : contain si l'image est assez large, cover sinon ──
//
// Si la hauteur de l'image est contrainte à (card H - bandeau H),
// on calcule la largeur rendue : si elle couvre toute la card → contain.
// Sinon l'image serait trop étroite et laisserait des espaces vides → cover.

// ─── Overlay thématique + sous-menu ─────────────────────────────────────────

// Retourne la couleur à utiliser sur les backgrounds sombres (overlay).
// Si couleur_sombre est définie, elle a priorité ; sinon, on retombe sur couleur.
function _overlayColor(thm) {
  return thm.couleur_sombre || thm.couleur || '#3F3F48';
}

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
//     - imagesolo       : { imagesolo, imagescale, xoffset, yoffset, aligntop, alignbottom }

function _parseSubSections(builder) {
  if (!Array.isArray(builder)) return [];
  return builder.map(row => {
    const layouts = _getSubsectionLayouts(row);
    const header  = layouts.find(l => _isLayout(l, 'subsectiontitle'));
    const content = layouts.filter(l => !_isLayout(l, 'subsectiontitle'));
    const imageSolo = _extractImageSoloConfig(header) ?? _extractImageSoloConfig(row);
    const showTitle = _boolLike(_pickField(header, ['displaytitle', 'displaytile', 'displayTitle', 'displayTile']));
    const showSubtitle = _boolLike(_pickField(header, ['displaysubtitle', 'displaySubtitle']));
    const showLogo = _boolLike(_pickField(header, ['logo', 'Logo']));
    const logoRaw = _pickField(header, ['title logo', 'title_logo', 'titleLogo', 'TitleLogo', 'titlelogo', 'Title Logo']);
    return {
      title:       header?.title    ?? '',
      subtitle:    header?.subtitle ?? '',
      showTitle,
      showSubtitle,
      titleLogo: showLogo ? _titleLogoUrl(logoRaw) : null,
      imageSolo,
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

function _num(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function _bool(raw) {
  return raw === true || raw === 1 || raw === '1' || raw === 'true';
}

function _boolLike(raw) {
  return raw === true || raw === 1 || raw === '1' || String(raw ?? '').toLowerCase() === 'true';
}

function _pickField(obj, names) {
  if (!obj) return undefined;
  // 1) Tentative exacte (rapide)
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== '') {
      return obj[name];
    }
  }

  // 2) Fallback insensible à la casse / underscore / tirets
  const keyByNorm = new Map();
  Object.keys(obj).forEach((key) => {
    const nk = _normKey(key);
    if (nk && !keyByNorm.has(nk)) keyByNorm.set(nk, key);
  });

  for (const name of names) {
    const matchKey = keyByNorm.get(_normKey(name));
    if (!matchKey) continue;
    const value = obj[matchKey];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function _getSubsectionLayouts(row) {
  const layouts = _pickField(row, ['subsection', 'subSection', 'SubSection', 'layouts', 'layout']);
  return Array.isArray(layouts) ? layouts : [];
}

function _isLayout(layout, name) {
  return _normKey(layout?.acf_fc_layout) === _normKey(name);
}

function _imageUrl(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    return raw.url ?? raw.sizes?.large ?? raw.sizes?.medium_large ?? raw.sizes?.medium ?? raw.src ?? null;
  }
  return null;
}

function _fileUrl(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    return raw.url ?? raw.link ?? raw.guid?.rendered ?? null;
  }
  return null;
}

function _linkHref(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    return raw.url ?? raw.link ?? raw.permalink ?? raw.href ?? raw.guid?.rendered ?? null;
  }
  return null;
}

function _fileName(raw, fallbackUrl) {
  if (raw && typeof raw === 'object') {
    if (raw.filename) return String(raw.filename);
    if (raw.title) return String(raw.title);
  }

  if (fallbackUrl) {
    try {
      const pathname = new URL(fallbackUrl, window.location.origin).pathname;
      const last = pathname.split('/').filter(Boolean).pop();
      if (last) return decodeURIComponent(last);
    } catch {
      // ignore
    }
  }

  return 'document.pdf';
}

function _slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function _pageSlugFromHref(rawHref) {
  if (!rawHref) return null;

  try {
    const url = new URL(String(rawHref), window.location.origin);
    const segments = url.pathname.split('/').filter(Boolean);
    if (!segments.length) return null;
    const last = segments[segments.length - 1];
    const slug = _slugify(last);
    return slug || null;
  } catch {
    return null;
  }
}

function _titleLogoUrl(raw) {
  if (raw && typeof raw === 'object') {
    const objectUrl = _imageUrl(raw);
    if (objectUrl) return objectUrl;
  }

  const value = String(raw ?? '').trim();
  if (!value) return null;

  if (/^(https?:)?\/\//i.test(value) || value.startsWith('./') || value.startsWith('../') || value.startsWith('/')) {
    return value;
  }

  const normalized = value.replace(/^\/+/, '');
  const hasExtension = /\.[a-z0-9]+$/i.test(normalized);
  const fileName = hasExtension ? normalized : `${normalized}.svg`;

  if (/^icon_name(\.svg)?$/i.test(fileName)) {
    return null;
  }

  if (/^(icon_|logo_)/i.test(normalized)) {
    return `./assets/images/icons/${fileName}`;
  }

  return `./assets/images/themes/${fileName}`;
}

function _buildPageOverlayDescriptor(layout, options = {}) {
  const pageField = _pickField(layout, [
    'page',
    'Page',
    'page_link',
    'pageLink',
    'PageLink',
    'link',
    'Link',
    'button_link',
    'buttonLink',
    'ButtonLink',
    'linked_page',
    'linkedPage',
    'LinkedPage',
    'overlay_page',
    'overlayPage',
    'OverlayPage',
    'page_target',
    'pageTarget',
    'PageTarget',
    'button_overlay_page',
    'buttonOverlayPage',
    'ButtonOverlayPage',
    'target_page',
    'targetPage',
    'TargetPage'
  ]);

  const objectCandidate = Object.values(layout || {}).find((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return value.id != null
      || value.ID != null
      || value.url
      || value.link
      || value.permalink
      || value.post_title
      || value.title
      || value.name;
  });

  const target = pageField || objectCandidate || layout;

  const rawTitle = _pickField(target, ['title', 'Title', 'post_title', 'postTitle', 'name', 'Name', 'label', 'Label']);
  const rawHref = _linkHref(target) || _pickField(layout, ['url', 'URL', 'href', 'Href']);
  const rawSearch = _pickField(layout, ['search', 'Search', 'page_search', 'pageSearch', 'overlay_search', 'overlaySearch']);
  const rawId = _pickField(target, ['id', 'ID', 'page_id', 'pageId', 'object_id', 'objectId'])
    ?? _pickField(layout, ['page_id', 'pageId', 'id', 'ID']);
  const id = Number(rawId);
  const title = String(rawTitle ?? '').trim();
  const slug = _pageSlugFromHref(rawHref);
  const search = String(rawSearch ?? '').trim();
  const backLabel = String(_pickField(layout, ['back_label', 'backLabel', 'back', 'Back']) ?? '').trim() || 'Retour au site';

  const parts = [];
  if (Number.isFinite(id) && id > 0) parts.push(`id:${id}`);
  if (!parts.length && slug) parts.push(`slug:${slug}`);
  if (!parts.length && title) parts.push(`title:${title}`);
  if (!parts.length && search) parts.push(`search:${search}`);
  parts.push(`back:${backLabel}`);

  if (options.forceOverlayTotal) {
    parts.push('overlay:overlayTotal');
  }

  return {
    descriptor: parts.join('|'),
    isValid: parts.some((part) => part.startsWith('id:') || part.startsWith('slug:') || part.startsWith('title:')),
  };
}

function _cardDescriptifHtml(raw) {
  if (!raw) return '';

  const tmp = document.createElement('div');
  tmp.innerHTML = raw;

  const paragraphs = Array.from(tmp.querySelectorAll('p'))
    .map((p) => p.textContent?.trim() ?? '')
    .filter(Boolean);

  if (paragraphs.length) {
    return paragraphs.map((text) => `<p>${esc(text)}</p>`).join('');
  }

  const brLines = String(raw)
    .split(/<br\s*\/?>/i)
    .map((text) => text.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

  if (brLines.length > 1) {
    return brLines.map((text) => `<p>${esc(text)}</p>`).join('');
  }

  const fallback = String(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean);

  return fallback.map((text) => `<p>${esc(text).replace(/\n/g, '<br>')}</p>`).join('');
}

function _extractImageSoloConfig(source) {
  if (!source || typeof source !== 'object') return null;

  const groupOrImage = _pickField(source, ['imagesolo', 'imageSolo', 'ImageSolo', 'image_solo', 'image']);
  const groupedValues = (groupOrImage && typeof groupOrImage === 'object' && !_imageUrl(groupOrImage))
    ? groupOrImage
    : source;

  const imageRaw = _pickField(groupedValues, ['imagesolo', 'imageSolo', 'ImageSolo', 'image_solo', 'image', 'url', 'src']) ?? groupOrImage;
  const imageUrl = _imageUrl(imageRaw);
  if (!imageUrl) return null;

  const imageScale = Math.max(1, _num(_pickField(groupedValues, ['imagescale', 'imageScale', 'ImageScale', 'image_scale']), 1));
  const xOffset = _num(_pickField(groupedValues, ['xoffset', 'xOffset', 'Xoffset', 'x_offset']), 0);
  const yOffset = _num(_pickField(groupedValues, ['yoffset', 'yOffset', 'Yoffset', 'y_offset']), 0);
  const alignTop = _bool(_pickField(groupedValues, ['aligntop', 'alignTop', 'AlignTop', 'align_top']));
  const alignBottom = _bool(_pickField(groupedValues, ['alignbottom', 'alignBottom', 'AlignBottom', 'align_bottom']));

  return {
    imageUrl,
    imageScale,
    xOffset,
    yOffset,
    useAlignTop: alignTop,
    useAlignBottom: !alignTop && alignBottom,
  };
}

function _renderImageSolo(config) {
  if (!config?.imageUrl) return '';

  // Les offsets sont saisis sur la maquette desktop (content 960px, ratio 16/9 => 540px de haut).
  const xPct = (config.xOffset / 960) * 100;
  const yPct = (config.yOffset / 540) * 100;
  const xPos = 50 + xPct;
  const yBase = config.useAlignTop ? 0 : (config.useAlignBottom ? 100 : 50);
  const yPos = yBase + yPct;

  return `
    <div
      class="layout-image-solo"
      style="--img-scale:${config.imageScale}; --img-x-pos:${xPos}%; --img-y-pos:${yPos}%;"
    >
      <div class="layout-image-solo__wrapper">
        <img class="layout-image-solo__img" src="${esc(config.imageUrl)}" alt="" loading="lazy" />
      </div>
    </div>`;
}

// ─── ImageGallerie layout ────────────────────────────────────────────────

function _extractImageGallerieConfig(source) {
  if (!source || typeof source !== 'object') return null;

  const gallerie = _pickField(source, ['gallerie', 'Gallerie', 'galerie', 'Galerie']);
  if (!Array.isArray(gallerie) || gallerie.length === 0) return null;

  // Extraire les URLs des images
  const images = gallerie.map(img => {
    if (typeof img === 'object') {
      return _imageUrl(_pickField(img, ['image', 'Image', 'url', 'URL', 'src']));
    }
    return _imageUrl(img);
  }).filter(Boolean);

  if (images.length === 0) return null;

  const affichageCaroussel = _bool(_pickField(source, ['affichagecaroussel', 'AffichageCaroussel', 'affichage_carousel', 'AffichageCarousel']));
  const affichageCanvas = _bool(_pickField(source, ['affichagecanvas', 'AffichageCanvas', 'affichage_canvas', 'AffichageCanvas']));

  // Les deux modes sont mutuellement exclusifs : le caroussel a priorité
  const showCarousel = affichageCaroussel;
  const showCanvas = !affichageCaroussel && affichageCanvas;

  return {
    images,
    showCarousel,
    showCanvas,
  };
}

function _renderImageGallerieCarousel(config) {
  if (!config?.images || config.images.length === 0) return '';

  const trackId = `img-carousel-track-${Math.random().toString(36).substr(2, 9)}`;
  const dotsId = `img-carousel-dots-${Math.random().toString(36).substr(2, 9)}`;
  const controllerId = `img-carousel-${Math.random().toString(36).substr(2, 9)}`;

  const imagesHtml = config.images
    .map((imgUrl, idx) => `
      <div class="img-gallerie-carousel__slide" data-idx="${idx}">
        <img class="img-gallerie-carousel__img" src="${esc(imgUrl)}" alt="Image ${idx + 1}" loading="lazy" />
      </div>`)
    .join('');

  const dotsHtml = config.images
    .map((_, idx) => `<button class="img-gallerie-dots__dot" aria-label="Image ${idx + 1}"></button>`)
    .join('');

  const html = `
    <div class="layout-image-gallerie layout-image-gallerie--carousel" id="${controllerId}">
      <div class="img-gallerie-carousel">
        <button class="img-gallerie-carousel__btn img-gallerie-carousel__btn--prev" type="button" aria-label="Image précédente">${arrowSpan('left')}</button>
        <div class="img-gallerie-carousel__viewport">
          <div class="img-gallerie-carousel__track" id="${trackId}">
            ${imagesHtml}
          </div>
        </div>
        <button class="img-gallerie-carousel__btn img-gallerie-carousel__btn--next" type="button" aria-label="Image suivante">${arrowSpan('right')}</button>
      </div>
      <div class="img-gallerie-dots" id="${dotsId}">
        ${dotsHtml}
      </div>
    </div>`;

  // Initialiser le caroussel après le rendu
  setTimeout(() => {
    const track = document.getElementById(trackId);
    const dotsContainer = document.getElementById(dotsId);
    const controller = document.getElementById(controllerId);
    if (track && dotsContainer && controller) {
      new ImgGallerieCarousel(track, dotsContainer, controller, config.images.length);
    }
  }, 0);

  return html;
}

function _renderImageGallerieCanvas(config) {
  if (!config?.images || config.images.length === 0) return '';

  const shouldBalanceCanvas = config.images.length > 1 && (config.images.length % 2 === 1);
  const canvasClass = shouldBalanceCanvas ? ' img-gallerie-canvas--balanced' : '';

  const gridHtml = config.images
    .map((imgUrl, idx) => `
      <div class="img-gallerie-canvas__item${idx === 0 ? ' img-gallerie-canvas__item--featured' : ''}" data-idx="${idx}">
        <img src="${esc(imgUrl)}" alt="Image ${idx + 1}" loading="lazy" />
      </div>`)
    .join('');

  return `
    <div class="layout-image-gallerie layout-image-gallerie--canvas">
      <div class="img-gallerie-canvas${canvasClass}">
        ${gridHtml}
      </div>
    </div>`;
}

function _renderImageGallerie(config) {
  if (!config?.images || config.images.length === 0) return '';

  if (config.showCarousel) {
    return _renderImageGallerieCarousel(config);
  } else if (config.showCanvas) {
    return _renderImageGallerieCanvas(config);
  }

  // Fallback sur le canvas si aucun mode n'est explicitement activé
  return _renderImageGallerieCanvas(config);
}

// ─── Classe pour gérer le caroussel d'images ──────────────────────────────

class ImgGallerieCarousel {
  constructor(track, dotsContainer, controller, totalImages) {
    this.track = track;
    this.dotsContainer = dotsContainer;
    this.controller = controller;
    this.totalOriginal = totalImages;
    this.current = 1; // index interne (apres le clone de debut)
    this._animMs = 500;

    this.dots = Array.from(dotsContainer.querySelectorAll('.img-gallerie-dots__dot'));
    this._setupInfiniteTrack();
    this._bindButtons();
    this._bindDots();
    this._bindTransitionEnd();
    this._jumpTo(this.current);
    this._syncDots();
  }

  _setupInfiniteTrack() {
    const slides = Array.from(this.track.querySelectorAll('.img-gallerie-carousel__slide'));
    if (slides.length <= 1) return;

    const firstClone = slides[0].cloneNode(true);
    const lastClone = slides[slides.length - 1].cloneNode(true);

    firstClone.dataset.clone = 'first';
    lastClone.dataset.clone = 'last';

    this.track.insertBefore(lastClone, slides[0]);
    this.track.appendChild(firstClone);
  }

  _bindDots() {
    this.dots.forEach((dot, i) => {
      dot.addEventListener('click', () => this.goTo(i + 1));
    });
  }

  _bindButtons() {
    const prevBtn = this.controller.querySelector('.img-gallerie-carousel__btn--prev');
    const nextBtn = this.controller.querySelector('.img-gallerie-carousel__btn--next');
    if (prevBtn) prevBtn.addEventListener('click', () => this.prev());
    if (nextBtn) nextBtn.addEventListener('click', () => this.next());
  }

  _bindTransitionEnd() {
    this.track.addEventListener('transitionend', () => {
      if (this.totalOriginal <= 1) return;

      // 0 = clone de la derniere image, total+1 = clone de la premiere
      if (this.current === 0) {
        this.current = this.totalOriginal;
        this._jumpTo(this.current);
      } else if (this.current === this.totalOriginal + 1) {
        this.current = 1;
        this._jumpTo(this.current);
      }

      this._syncDots();
    });
  }

  _jumpTo(index) {
    this.track.style.transition = 'none';
    this.track.style.transform = `translateX(-${index * 100}%)`;
    void this.track.offsetHeight;
    this.track.style.transition = `transform ${this._animMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  }

  _syncDots() {
    const dotIndex = ((this.current - 1) % this.totalOriginal + this.totalOriginal) % this.totalOriginal;
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === dotIndex);
    });
  }

  goTo(index) {
    if (this.totalOriginal <= 1) return;
    this.current = index;
    this.track.style.transform = `translateX(-${this.current * 100}%)`;
    this._syncDots();
  }

  next() {
    if (this.totalOriginal <= 1) return;
    this.goTo(this.current + 1);
  }

  prev() {
    if (this.totalOriginal <= 1) return;
    this.goTo(this.current - 1);
  }
}

// ─── videocaroussel ─────────────────────────────────────────────────────────

function _extractVideoCarousselConfig(source) {
  if (!source || typeof source !== 'object') return null;

  const videos = _pickField(source, ['videos_links', 'videos', 'Videos']);
  if (!Array.isArray(videos) || videos.length === 0) return null;

  const items = videos.map(item => {
    const link = _pickField(item, ['video_link', 'videolink', 'VideoLink', 'url', 'URL']);
    const ytId = _youtubeId(link);
    const title = _pickField(item, ['videotitle', 'video_title', 'VideoTitle', 'title', 'Title']);
    return ytId ? { ytId, title } : null;
  }).filter(Boolean);

  if (items.length === 0) return null;

  const carousselTitle = _pickField(source, ['carroussel_title', 'caroussel_title', 'carousel_title']);

  return { items, carousselTitle };
}

function _renderVideoCaroussel(config) {
  if (!config?.items || config.items.length === 0) return '';

  const trackId      = `vid-carousel-track-${Math.random().toString(36).substr(2, 9)}`;
  const dotsId       = `vid-carousel-dots-${Math.random().toString(36).substr(2, 9)}`;
  const controllerId = `vid-carousel-${Math.random().toString(36).substr(2, 9)}`;

  const slidesHtml = config.items
    .map(({ ytId, title }, idx) => `
      <div class="img-gallerie-carousel__slide" data-idx="${idx}">
        <div class="layout-video__facade" data-yt-id="${esc(ytId)}">
          <img
            class="layout-video__thumb"
            data-yt-id="${esc(ytId)}"
            src="https://img.youtube.com/vi/${esc(ytId)}/sddefault.jpg"
            alt="${title ? esc(title) : `Vidéo ${idx + 1}`}"
            loading="lazy"
          />
          <button class="layout-video__play" type="button" aria-label="Lire ${title ? esc(title) : `la vidéo ${idx + 1}`}"></button>
        </div>
      </div>`)
    .join('');

  const dotsHtml = config.items
    .map((_, idx) => `<button class="img-gallerie-dots__dot" aria-label="Vidéo ${idx + 1}"></button>`)
    .join('');

  const titleHtml = config.carousselTitle
    ? `<p class="layout-paragraph-title layout-paragraph-title--video">${esc(config.carousselTitle)}</p>`
    : '';

  const html = `
    ${titleHtml}
    <div class="layout-image-gallerie layout-image-gallerie--carousel" id="${controllerId}">
      <div class="img-gallerie-carousel">
        <button class="img-gallerie-carousel__btn img-gallerie-carousel__btn--prev" type="button" aria-label="Vidéo précédente">${arrowSpan('left')}</button>
        <div class="img-gallerie-carousel__viewport">
          <div class="img-gallerie-carousel__track" id="${trackId}">
            ${slidesHtml}
          </div>
        </div>
        <button class="img-gallerie-carousel__btn img-gallerie-carousel__btn--next" type="button" aria-label="Vidéo suivante">${arrowSpan('right')}</button>
      </div>
      <div class="img-gallerie-dots" id="${dotsId}">
        ${dotsHtml}
      </div>
    </div>`;

  setTimeout(() => {
    const track = document.getElementById(trackId);
    const dotsContainer = document.getElementById(dotsId);
    const controller = document.getElementById(controllerId);
    if (track && dotsContainer && controller) {
      new ImgGallerieCarousel(track, dotsContainer, controller, config.items.length);
    }
  }, 0);

  return html;
}

function _renderLayout(layout) {
  switch (layout.acf_fc_layout) {
    case 'title':
    case 'Title': {
      const title = _pickField(layout, ['title', 'Title']);
      const subtitle = _pickField(layout, ['subtitle', 'subTitle', 'SubTitle']);
      if (!title && !subtitle) return '';

      const titleHtml = title ? `<p class="layout-title__title">${esc(title)}</p>` : '';
      const subtitleHtml = subtitle ? `<p class="layout-title__subtitle">${esc(subtitle)}</p>` : '';

      return `
        <div class="layout-title">
          ${titleHtml}
          ${subtitleHtml}
        </div>`;
    }
    case 'videosolo': {
      const ytId = _youtubeId(layout.videolink);
      const embed = ytId ? `
        <div class="layout-video__wrapper">
          <div class="layout-video__facade" data-yt-id="${esc(ytId)}">
            <img
              class="layout-video__thumb"
              data-yt-id="${esc(ytId)}"
              src="https://img.youtube.com/vi/${esc(ytId)}/sddefault.jpg"
              alt=""
              loading="lazy"
            />
            <button class="layout-video__play" type="button" aria-label="Lire la vidéo"></button>
          </div>
        </div>` : '';
      const title = layout.displayvideotitle && layout.videotitle
        ? `<p class="layout-video__heading">${esc(layout.videotitle)}</p>` : '';
      const text  = layout.displayvideotext && layout.videotext
        ? `<p class="layout-video__text">${esc(layout.videotext)}</p>`  : '';
      return `<div class="layout-video">${title}${embed}${text}</div>`;
    }
    case 'textbloc': {
      const isPerso = layout.persotext == '1' || layout.persotext === true || layout.persotext === 1 || layout.persotext === 'true';
      const ignoreSpacing = _bool(_pickField(layout, ['ignorespacing', 'IgnoreSpacing', 'ignore_spacing']));
      const cls = ['layout-text', isPerso ? 'layout-text--perso' : '', ignoreSpacing ? 'layout-text--no-spacing' : ''].filter(Boolean).join(' ');
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
    case 'buttonpdf':
    case 'ButtonPDF': {
      const pdfRaw = _pickField(layout, ['pdf_file', 'pdfFile', 'PdfFile']);
      const url = _fileUrl(pdfRaw);
      if (!url) return '';

      const label = _pickField(layout, ['pdf_label', 'pdfLabel', 'PdfLabel']) || 'Telecharger le PDF';
      const fileName = _fileName(pdfRaw, url);

      return `
        <div class="layout-pdf-button">
          <button
            class="buttonRound layout-pdf-button__action"
            type="button"
            data-pdf-url="${esc(url)}"
            data-pdf-filename="${esc(fileName)}"
            aria-label="${esc(label)}"
          >${esc(label)}</button>
        </div>`;
    }
    case 'imagesolo':
    case 'ImageSolo': {
      return _renderImageSolo(_extractImageSoloConfig(layout));
    }
    case 'image_solo': {
      return _renderLayout({ ...layout, acf_fc_layout: 'imagesolo' });
    }
    case 'imagegallerie':
    case 'ImageGallerie': {
      return _renderImageGallerie(_extractImageGallerieConfig(layout));
    }
    case 'image_gallerie': {
      return _renderLayout({ ...layout, acf_fc_layout: 'imagegallerie' });
    }
    case 'videocaroussel':
    case 'VideoCaroussel':
    case 'video_caroussel': {
      return _renderVideoCaroussel(_extractVideoCarousselConfig(layout));
    }
    case 'buttonoverlay':
    case 'ButtonOverlay': {
      const label = _pickField(layout, ['button_label', 'buttonLabel', 'label', 'Label', 'title', 'Title']) || 'Ouvrir';
      const request = _buildPageOverlayDescriptor(layout, { forceOverlayTotal: true });
      const fallbackSearch = _pickField(layout, ['search', 'Search', 'page_search', 'pageSearch']) || label;
      const descriptor = request.isValid
        ? request.descriptor
        : `search:${fallbackSearch}|back:Retour au site|overlay:overlayTotal`;

      return `
        <div class="layout-button-overlay">
          <button
            class="buttonRound layout-button-overlay__action"
            type="button"
            data-page-overlay="${esc(descriptor)}"
            aria-label="${esc(label)}"
          >${esc(label)}</button>
        </div>`;
    }
    default:
      return '';
  }
}

function _hasImageSoloLayout(layouts) {
  if (!Array.isArray(layouts)) return false;
  return layouts.some((layout) => _isLayout(layout, 'imagesolo') || _isLayout(layout, 'image_solo'));
}

function _applyWysiwygSpacing(container) {
  if (!container) return;

  const blockTags = new Set(['P', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FIGURE', 'TABLE', 'PRE']);
  const listTags = new Set(['UL', 'OL']);
  const textBlocks = container.querySelectorAll('.layout-text');

  textBlocks.forEach((block) => {
    if (block.classList.contains('layout-text--no-spacing')) return;

    const parents = [block, ...block.querySelectorAll('*')];

    parents.forEach((parent) => {
      let prevBlockTag = null;
      [...parent.children].forEach((child) => {
        const isBlock = blockTags.has(child.tagName);
        if (isBlock) {
          if (!prevBlockTag) {
            child.style.marginTop = '';
          } else {
            const aroundList = listTags.has(prevBlockTag) || listTags.has(child.tagName);
            child.style.marginTop = aroundList ? '32px' : '16px';
          }

          if (listTags.has(child.tagName)) {
            child.style.paddingLeft = '64px';
          }

          prevBlockTag = child.tagName;
        } else {
          prevBlockTag = null;
        }
      });
    });
  });
}

function _setupVideoThumbFallback(container) {
  if (!container) return;

  const candidates = ['sddefault', 'hqdefault', 'mqdefault', 'default'];

  container.querySelectorAll('.layout-video__thumb[data-yt-id]').forEach((img) => {
    const ytId = img.dataset.ytId;
    if (!ytId) return;

    let idx = 0;

    const setSrc = (nextIdx) => {
      idx = nextIdx;
      img.src = `https://img.youtube.com/vi/${ytId}/${candidates[idx]}.jpg`;
    };

    const goNext = () => {
      if (idx >= candidates.length - 1) {
        img.onerror = null;
        img.onload = null;
        return;
      }
      setSrc(idx + 1);
    };

    img.onerror = goNext;
    img.onload = () => {
      // Certaines réponses YouTube peuvent renvoyer une miniature générique petite.
      // Si la vignette est trop petite, on essaie la suivante.
      if ((img.naturalWidth <= 120 || img.naturalHeight <= 90) && idx < candidates.length - 1) {
        goNext();
      }
    };

    // Garantit que l'ordre des fallbacks est toujours celui attendu.
    setSrc(0);
  });
}

function _renderSubsectionContent(container, subSection, color) {
  if (!container) return;
  const thmColor = esc(color || '#3F3F48');

  // Propager la couleur sur le container pour que tous les enfants y aient accès
  container.style.setProperty('--thm-color', thmColor);

  const subtitleHtml = subSection.showSubtitle
    ? `<p class="thm-overlay__section-subtitle">${esc(subSection.subtitle)}</p>`
    : '';

  const logoHtml = subSection.titleLogo
    ? `<div class="thm-overlay__section-logo-wrap"><img class="thm-overlay__section-title-logo" src="${esc(subSection.titleLogo)}" alt="" loading="lazy" aria-hidden="true" /></div>`
    : '';

  const titleText = subSection.showTitle === false ? '' : esc(subSection.title);

  const titleBlock = `
    <div class="thm-overlay__section-title-block">
      ${logoHtml}
      <div class="thm-overlay__title-wrap">
        ${arrowSpan('right')}
        <h2 class="thm-overlay__section-title">${titleText}</h2>
        ${arrowSpan('left')}
      </div>
      ${subtitleHtml}
    </div>`;

  const imageSoloBlock = _hasImageSoloLayout(subSection.layouts) ? '' : _renderImageSolo(subSection.imageSolo);
  container.innerHTML = titleBlock + imageSoloBlock + subSection.layouts.map(_renderLayout).join('');
  _setupVideoThumbFallback(container);

  _applyWysiwygSpacing(container);

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
    const layouts = _getSubsectionLayouts(row);
    return layouts.filter(l => !_isLayout(l, 'subsectiontitle'));
  });
}

function _firstImageSoloFromBuilder(builder) {
  if (!Array.isArray(builder)) return null;

  for (const row of builder) {
    const layouts = _getSubsectionLayouts(row);
    const header = layouts.find(l => _isLayout(l, 'subsectiontitle'));

    const fromHeaderOrRow = _extractImageSoloConfig(header) ?? _extractImageSoloConfig(row);
    if (fromHeaderOrRow) return fromHeaderOrRow;

    for (const layout of layouts) {
      const fromLayout = _extractImageSoloConfig(layout);
      if (fromLayout) return fromLayout;
    }
  }

  return null;
}

// Rendu du contenu pour le cas subSection unique : header thématique + layouts.

function _renderSingleSubSection(container, subSection, thm) {
  if (!container) return;
  container.style.setProperty('--thm-color', esc(_overlayColor(thm)));
  const imageSoloBlock = _hasImageSoloLayout(subSection.layouts) ? '' : _renderImageSolo(subSection.imageSolo);
  container.innerHTML = _buildThmOverlayHeader(thm) + imageSoloBlock + subSection.layouts.map(_renderLayout).join('');
  _setupVideoThumbFallback(container);

  _applyWysiwygSpacing(container);

  const texts = [...container.querySelectorAll('.layout-text')];
  texts.forEach(el => {
    el.style.marginBottom = el.nextElementSibling ? '32px' : '';
  });
  container.querySelectorAll('.layout-paragraph-title').forEach(el => {
    if (el.previousElementSibling) el.previousElementSibling.style.marginBottom = '0';
  });
}

function openOverlay(thm) {
  _mountThematicLayersInSection();

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

  // Mettre à jour l'URL avec le slug personnalisé de la thématique.
  // scroll:goto a fait un pushState vers #thematiques — on remplace par #thematique/{slug}.
  if (thm.slug) {
    history.replaceState(
      { ...(history.state ?? {}), thmOverlay: { id: thm.id, slug: thm.slug } },
      '',
      `${window.location.pathname}${window.location.search}#thematique/${thm.slug}`
    );
  }

  // Couleur du sous-menu : thématique à 50% opacité (couleur sombre si définie)
  submenu.style.setProperty('--submenu-bg', _hexToRgba(_overlayColor(thm), 0.5));

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
      imageSolo: subSections[0]?.imageSolo ?? _firstImageSoloFromBuilder(thm.builder),
      layouts: _allLayouts(thm.builder),
    };
    overlay.classList.add('thm-overlay--no-submenu');
    // --thm-color sur l'overlay entier (pas seulement inner) pour le bouton retour
    overlay.style.setProperty('--thm-color', esc(_overlayColor(thm)));
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
      _renderSubsectionContent(inner, subSections[0], _overlayColor(thm));
    }

    // Switch de subSection au clic dans le sous-menu
    nav.querySelectorAll('.site-submenu__item').forEach(btn => {
      btn.addEventListener('click', () => {
        nav.querySelectorAll('.site-submenu__item').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const idx = parseInt(btn.dataset.ssIndex ?? '0', 10);
        if (subSections[idx]) _renderSubsectionContent(inner, subSections[idx], _overlayColor(thm));
      });
    });

    submenu.classList.add('is-visible');
    submenu.setAttribute('aria-hidden', 'false');
    retour?.addEventListener('click', closeOverlay, { once: true });
  }

  overlay.classList.add('is-visible');
  overlay.setAttribute('aria-hidden', 'false');
  window.dispatchEvent(new CustomEvent('secondary-scroll:refresh'));
}

function closeOverlay() {
  const submenu = document.getElementById('site-submenu');
  const overlay = document.getElementById('thm-overlay');
  // Move focus out before aria-hidden to avoid accessibility warning
  if (overlay?.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  submenu?.classList.remove('is-visible');
  submenu?.setAttribute('aria-hidden', 'true');
  overlay?.classList.remove('is-visible');
  overlay?.setAttribute('aria-hidden', 'true');
  // Retirer --no-submenu après la fin du fade (0.35s) pour éviter le saut de __inner
  setTimeout(() => overlay?.classList.remove('thm-overlay--no-submenu'), 350);
  // Restaurer l'URL : si on était sur un slug thématique personnalisé, revenir à #thematiques
  if (window.location.hash.startsWith('#thematique/')) {
    history.replaceState(
      { ...(history.state ?? {}), thmOverlay: null },
      '',
      `${window.location.pathname}${window.location.search}#thematiques`
    );
  }
  window.dispatchEvent(new CustomEvent('secondary-scroll:refresh'));
}

window.addEventListener('thm:close', () => closeOverlay());
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

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.layout-pdf-button__action');
  if (!btn) return;

  e.preventDefault();

  const url = btn.dataset.pdfUrl;
  const fileName = btn.dataset.pdfFilename || 'document.pdf';
  if (!url) return;

  const previous = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Telechargement...';

  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback si fetch/blob est bloque : tentative de download direct.
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    btn.disabled = false;
    btn.textContent = previous;
  }
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

// ─── Ouverture par ID depuis un event externe (ex: overlay recherche) ─────────

window.addEventListener('thm:open-by-id', (e) => {
  const id = parseInt(e.detail?.id ?? 0, 10);
  if (!id) return;
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
  const descriptif = _cardDescriptifHtml(rawDescriptif);

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
      <div class="thm-card__descriptif">${descriptif}</div>
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

/**
 * scroll.js — Magnetic full-page scroll with per-section URL slugs
 *
 * Sections: accueil, le-projet, thematiques, ateliers, partenaires
 * Scroll with enough force (DELTA_THRESHOLD) to navigate between sections.
 * Insufficient force snaps back to the current section.
 * Arrow keys, Page Up/Down and touch swipe are also supported.
 */

const SECTIONS = [
  'accueil',
  'le-projet',
  'thematiques',
  'ateliers',
  'partenaires',
];

// ─── Mobile detection ─────────────────────────────────────────────────────────
// $bp-xl = 1280px — keep in sync with $bp-xl in _variables.scss
const MOBILE_MQ = window.matchMedia('(max-width: 1279px)');
function isMobileLayout() { return MOBILE_MQ.matches; }

// ─── Scroll restoration ───────────────────────────────────────────────────────
// Sur mobile : #scroll-viewport est position:absolute (top:0 de body).
// Si le navigateur restaure window.scrollY > 0 (historique de navigation),
// le viewport apparaît au-dessus de l'écran. On désactive la restauration
// automatique pour que notre scrollTo(0,0) soit définitif.
if (isMobileLayout()) {
  history.scrollRestoration = 'manual';
}

const HEADER_HEIGHT  = 140;   // px — keep in sync with $header-height in _variables.scss
const DELTA_THRESHOLD = 80;   // accumulated wheel delta needed to trigger section change
const SUBSECTION_ZONE_THRESHOLD_MULTIPLIER = 1.15;
const ANIM_DURATION   = 800;  // ms — section-change animation
const SNAP_DURATION   = 400;  // ms — snap-back animation (softer)
const SNAP_DELAY      = 350;  // ms — idle time before snap-back fires

const navLinks = [...document.querySelectorAll('.site-nav__link[data-section]')];
const siteHeader = document.getElementById('site-header');
const track    = document.getElementById('scroll-track');

let currentIndex    = 0;
let isAnimating     = false;
let accumulatedDelta = 0;
let snapTimer       = null;

// Keep a native scrollbar thumb in sync with magnetic sections without
// delegating navigation to native page scroll.
const scrollSpacer = (() => {
  if (isMobileLayout()) return null; // mobile : scroll natif, pas besoin du spacer
  const existing = document.getElementById('scroll-height-spacer');
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = 'scroll-height-spacer';
  el.style.cssText = 'display:block;position:static;width:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;overflow:hidden;';
  document.body.appendChild(el);
  return el;
})();

function updateNativeScrollbarRange() {
  if (!scrollSpacer) return;
  const totalHeight = (SECTIONS.length - 1) * sectionH() + window.innerHeight;
  scrollSpacer.style.height = `${Math.max(window.innerHeight, totalHeight)}px`;
}

function syncNativeScrollbarPosition(idx) {
  if (isMobileLayout()) return; // mobile : pas de scroll document, #scroll-viewport gère tout
  const y = Math.max(0, idx * sectionH());
  if (Math.abs(window.scrollY - y) <= 1) return;
  window.scrollTo({ top: y, behavior: 'auto' });
}

function sectionH() {
  return window.innerHeight - HEADER_HEIGHT;
}

function lockNativeScrollToCurrentSection() {
  if (isMobileLayout()) return;
  if (!isOverlayOpen()) return;
  const targetY = Math.max(0, currentIndex * sectionH());
  if (Math.abs(window.scrollY - targetY) <= 1) return;
  window.scrollTo({ top: targetY, behavior: 'auto' });
}

function isOverlayOpen() {
  return !!document.getElementById('thm-overlay')?.classList.contains('is-visible')
    || !!document.getElementById('page-overlay')?.classList.contains('is-visible');
}

function isMainOverlayLockActive() {
  return document.body.classList.contains('is-main-overlay-open');
}

function applyTransform(idx, easing) {
  track.style.transition = easing;
  track.style.transform  = `translateY(${-idx * sectionH()}px)`;
}

function updateNav(idx) {
  navLinks.forEach((link) => {
    link.classList.toggle('is-active', link.dataset.section === SECTIONS[idx]);
  });
}

function updateHeaderState(idx) {
  siteHeader?.classList.toggle('is-away-from-home', idx !== 0);
}

function updateURL(idx) {
  const slug = SECTIONS[idx];
  const hash = slug === 'accueil' ? '' : '#' + slug;
  history.pushState({ sectionIndex: idx }, '', window.location.pathname + hash);
}

function indexFromHash() {
  const hash = window.location.hash.replace('#', '');
  const idx = SECTIONS.indexOf(hash);
  return idx >= 0 ? idx : 0;
}

function goTo(idx, { pushState = true, animate = true } = {}) {
  if (idx < 0 || idx >= SECTIONS.length) return;
  if (!isMobileLayout() && isAnimating && animate) return;

  currentIndex = idx;
  accumulatedDelta = 0;
  clearTimeout(snapTimer);

  if (!isMobileLayout()) {
    if (animate) {
      isAnimating = true;
      applyTransform(idx, `transform ${ANIM_DURATION}ms cubic-bezier(0.77, 0, 0.175, 1)`);
      setTimeout(() => { isAnimating = false; }, ANIM_DURATION);
    } else {
      applyTransform(idx, 'none');
    }
    syncNativeScrollbarPosition(idx);
  } else {
    // Mobile : scrollTo direct sur #scroll-viewport vers la section cible.
    // scrollTo programmatique ignore scroll-snap-stop intermédiaires (spec CSS).
    const sectionEl = document.getElementById(SECTIONS[idx]);
    const vp = document.getElementById('scroll-viewport');
    if (sectionEl && vp) {
      vp.scrollTo({ top: sectionEl.offsetTop, behavior: 'smooth' });
    }
  }

  updateNav(idx);
  updateHeaderState(idx);
  if (pushState) updateURL(idx);
  syncNativeScrollbarPosition(idx);
}

function snapBack() {
  if (isAnimating) return;
  accumulatedDelta = 0;
  isAnimating = true;
  applyTransform(currentIndex, `transform ${SNAP_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`);
  setTimeout(() => { isAnimating = false; }, SNAP_DURATION);
}

function closeOverlayIfOpen() {
  const overlay = document.getElementById('thm-overlay');
  const pageOverlay = document.getElementById('page-overlay');
  let wasOpen = false;

  if (overlay?.classList.contains('is-visible')) {
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    wasOpen = true;
  }

  if (pageOverlay?.classList.contains('is-visible')) {
    if (typeof window.__closePageOverlay === 'function') {
      window.__closePageOverlay();
    } else {
      pageOverlay.classList.remove('is-visible');
      pageOverlay.setAttribute('aria-hidden', 'true');
    }
    wasOpen = true;
  }

  if (wasOpen) {
    window.dispatchEvent(new CustomEvent('secondary-scroll:refresh'));
  }

  return wasOpen;
}

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();

    const idx = SECTIONS.indexOf(link.dataset.section);
    if (idx === -1) return;

    const wasOpen = closeOverlayIfOpen();
    if (wasOpen && idx === currentIndex) return;

    goTo(idx);
  });
});

window.addEventListener('scroll:goto', (e) => {
  const { section, animate = true } = e.detail ?? {};
  const idx = SECTIONS.indexOf(section);
  if (idx === -1) return;
  // Figer la transition nav le temps du changement
  navLinks.forEach(l => { l.style.transition = 'none'; });
  goTo(idx, { animate });
  requestAnimationFrame(() => {
    navLinks.forEach(l => { l.style.transition = ''; });
  });
});

window.addEventListener('wheel', (e) => {
  // On mobile : laisser le scroll natif gérer
  if (isMobileLayout()) return;
  if (isMainOverlayLockActive()) {
    e.preventDefault();
    accumulatedDelta = 0;
    clearTimeout(snapTimer);
    return;
  }

  const routedToSecondary = typeof window.__routeWheelToSecondaryScroll === 'function'
    ? window.__routeWheelToSecondaryScroll(e)
    : false;

  if (routedToSecondary) {
    accumulatedDelta = 0;
    clearTimeout(snapTimer);
    return;
  }

  // Overlay ouvert hors zone de contenu : garder le magnétique principal.
  if (isOverlayOpen()) {
    lockNativeScrollToCurrentSection();
  }

  e.preventDefault();
  if (isAnimating) return;

  accumulatedDelta += e.deltaY;
  clearTimeout(snapTimer);

  const isInSubsectionContentZone = typeof window.__isWheelInsideSubsectionContentZone === 'function'
    ? window.__isWheelInsideSubsectionContentZone(e)
    : false;
  const effectiveThreshold = isInSubsectionContentZone
    ? DELTA_THRESHOLD * SUBSECTION_ZONE_THRESHOLD_MULTIPLIER
    : DELTA_THRESHOLD;

  if (Math.abs(accumulatedDelta) >= effectiveThreshold) {
    const dir  = accumulatedDelta > 0 ? 1 : -1;
    const next = currentIndex + dir;

    if (next >= 0 && next < SECTIONS.length) {
      goTo(next);
    } else {
      snapBack(); // already at first or last section
    }
  } else {
    // Not enough force — snap back to current section after idle pause
    snapTimer = setTimeout(snapBack, SNAP_DELAY);
  }
}, { passive: false });

let touchStartY = 0;

window.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
  // On mobile : le scroll natif gère la navigation
  if (isMobileLayout()) return;
  if (isAnimating || isOverlayOpen() || isMainOverlayLockActive()) return;
  const delta = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(delta) >= 50) {
    goTo(currentIndex + (delta > 0 ? 1 : -1));
  }
}, { passive: true });

window.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  const isTyping = activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable;

  if (isMainOverlayLockActive()) {
    if (!isTyping && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End' || e.key === ' ')) {
      e.preventDefault();
    }
    return;
  }

  if (isOverlayOpen()) {
    if (!isTyping && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End' || e.key === ' ')) {
      e.preventDefault();
    }
    return;
  }
  if (isAnimating) return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    goTo(currentIndex + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    goTo(currentIndex - 1);
  }
});

window.addEventListener('popstate', (e) => {
  const idx = e.state?.sectionIndex ?? indexFromHash();
  goTo(idx, { pushState: false });
});

window.addEventListener('resize', () => {
  if (isMobileLayout()) {
    // Réinitialiser le transform — le CSS prend le relais
    track.style.transition = 'none';
    track.style.transform  = '';
    // Zeroing du spacer desktop : s'il a été créé (page chargée en desktop puis
    // redimensionnée en mobile), sa hauteur gonflerait body.scrollHeight et
    // permettrait au body de scroller de quelques pixels → décalage visible.
    if (scrollSpacer) scrollSpacer.style.height = '0';
    // Réinitialiser le scroll du document (même logique que dans init()).
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return;
  }
  updateNativeScrollbarRange();
  applyTransform(currentIndex, 'none');
  syncNativeScrollbarPosition(currentIndex);
});

window.addEventListener('scroll', () => {
  if (isMobileLayout()) return;
  lockNativeScrollToCurrentSection();
}, { passive: true });

(function init() {
  if (isMobileLayout()) {
    // Sur mobile : juste mettre à jour l'état nav selon le hash
    const idx = indexFromHash();
    currentIndex = idx;
    updateNav(idx);
    updateHeaderState(idx);
    // #scroll-viewport est position:absolute (top:0 de body). Si window.scrollY
    // est non nul (restauration de session ou redimensionnement desktop→mobile),
    // le viewport disparaît hors écran. behavior:'instant' bypass scroll-behavior:smooth.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    history.replaceState({ sectionIndex: idx }, '', window.location.href);
    return;
  }
  updateNativeScrollbarRange();
  const idx = indexFromHash();
  applyTransform(idx, 'none');
  currentIndex = idx;
  updateNav(idx);
  updateHeaderState(idx);
  syncNativeScrollbarPosition(idx);
  // Seed history state so popstate works reliably on first back press
  history.replaceState({ sectionIndex: idx }, '', window.location.href);
})();

/**
 * scroll.js — Magnetic full-page scroll with per-section URL slugs
 *
 * Sections: accueil, initiative, thematiques, ressources, ateliers, partenaires
 * Scroll with enough force (DELTA_THRESHOLD) to navigate between sections.
 * Insufficient force snaps back to the current section.
 * Arrow keys, Page Up/Down and touch swipe are also supported.
 */

const SECTIONS = [
  'accueil',
  'initiative',
  'thematiques',
  'ressources',
  'ateliers',
  'partenaires',
];

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
  const existing = document.getElementById('scroll-height-spacer');
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = 'scroll-height-spacer';
  el.style.cssText = 'display:block;position:static;width:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;overflow:hidden;';
  document.body.appendChild(el);
  return el;
})();

function updateNativeScrollbarRange() {
  const totalHeight = (SECTIONS.length - 1) * sectionH() + window.innerHeight;
  scrollSpacer.style.height = `${Math.max(window.innerHeight, totalHeight)}px`;
}

function syncNativeScrollbarPosition(idx) {
  const y = Math.max(0, idx * sectionH());
  if (Math.abs(window.scrollY - y) <= 1) return;
  window.scrollTo({ top: y, behavior: 'auto' });
}

function sectionH() {
  return window.innerHeight - HEADER_HEIGHT;
}

function lockNativeScrollToCurrentSection() {
  if (!isOverlayOpen()) return;
  const targetY = Math.max(0, currentIndex * sectionH());
  if (Math.abs(window.scrollY - targetY) <= 1) return;
  window.scrollTo({ top: targetY, behavior: 'auto' });
}

function isOverlayOpen() {
  return !!document.getElementById('thm-overlay')?.classList.contains('is-visible')
    || !!document.getElementById('page-overlay')?.classList.contains('is-visible');
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
  if (isAnimating && animate) return;

  currentIndex = idx;
  accumulatedDelta = 0;
  clearTimeout(snapTimer);

  if (animate) {
    isAnimating = true;
    applyTransform(idx, `transform ${ANIM_DURATION}ms cubic-bezier(0.77, 0, 0.175, 1)`);
    setTimeout(() => { isAnimating = false; }, ANIM_DURATION);
  } else {
    applyTransform(idx, 'none');
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
    const submenu = document.getElementById('site-submenu');
    submenu?.classList.remove('is-visible');
    submenu?.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    setTimeout(() => overlay.classList.remove('thm-overlay--no-submenu'), 350);
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
  if (isAnimating || isOverlayOpen()) return;
  const delta = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(delta) >= 50) {
    goTo(currentIndex + (delta > 0 ? 1 : -1));
  }
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (isOverlayOpen()) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End' || e.key === ' ') {
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
  updateNativeScrollbarRange();
  applyTransform(currentIndex, 'none');
  syncNativeScrollbarPosition(currentIndex);
});

window.addEventListener('scroll', () => {
  lockNativeScrollToCurrentSection();
}, { passive: true });

(function init() {
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

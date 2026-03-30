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
const ANIM_DURATION   = 800;  // ms — section-change animation
const SNAP_DURATION   = 400;  // ms — snap-back animation (softer)
const SNAP_DELAY      = 350;  // ms — idle time before snap-back fires

// ── DOM refs ──────────────────────────────────────────────────────────────────

const track    = document.getElementById('scroll-track');
const navLinks = [...document.querySelectorAll('.site-nav__link[data-section]')];

// ── State ─────────────────────────────────────────────────────────────────────

let currentIndex    = 0;
let isAnimating     = false;
let accumulatedDelta = 0;
let snapTimer       = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sectionH() {
  return window.innerHeight - HEADER_HEIGHT;
}

function isOverlayOpen() {
  return !!document.getElementById('thm-overlay')?.classList.contains('is-visible');
}

function updateNav(idx) {
  navLinks.forEach((link) =>
    link.classList.toggle('is-active', link.dataset.section === SECTIONS[idx])
  );
}

function updateURL(idx) {
  const slug = SECTIONS[idx];
  const hash = slug === 'accueil' ? '' : '#' + slug;
  history.pushState({ sectionIndex: idx }, '', window.location.pathname + hash);
}

function indexFromHash() {
  const hash = window.location.hash.replace('#', '');
  const idx  = SECTIONS.indexOf(hash);
  return idx !== -1 ? idx : 0;
}

// ── Core navigation ───────────────────────────────────────────────────────────

function applyTransform(idx, easing) {
  track.style.transition = easing;
  track.style.transform  = `translateY(${-idx * sectionH()}px)`;
}

function goTo(idx, { pushState = true, animate = true } = {}) {
  if (idx < 0 || idx >= SECTIONS.length) return;
  if (isAnimating && animate) return;

  currentIndex    = idx;
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
  if (pushState) updateURL(idx);
}

function snapBack() {
  if (isAnimating) return;
  accumulatedDelta = 0;
  isAnimating = true;
  applyTransform(currentIndex, `transform ${SNAP_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`);
  setTimeout(() => { isAnimating = false; }, SNAP_DURATION);
}

// ── Wheel handler ─────────────────────────────────────────────────────────────

window.addEventListener('wheel', (e) => {
  // Overlay ouvert : laisser le scroll natif gérer le contenu de l'overlay
  if (isOverlayOpen()) return;
  e.preventDefault();
  if (isAnimating) return;

  accumulatedDelta += e.deltaY;
  clearTimeout(snapTimer);

  if (Math.abs(accumulatedDelta) >= DELTA_THRESHOLD) {
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

// ── Touch support ─────────────────────────────────────────────────────────────

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

// ── Keyboard support ──────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (isOverlayOpen()) return;
  if (isAnimating) return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    goTo(currentIndex + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    goTo(currentIndex - 1);
  }
});

// ── Ferme l'overlay thématique si ouvert, retourne true si c'était le cas ────

function closeOverlayIfOpen() {
  const overlay = document.getElementById('thm-overlay');
  if (!overlay?.classList.contains('is-visible')) return false;
  const submenu = document.getElementById('site-submenu');
  submenu?.classList.remove('is-visible');
  submenu?.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('is-visible');
  overlay.setAttribute('aria-hidden', 'true');
  // Retirer --no-submenu après la fin du fade (0.35s) pour éviter le saut de __inner
  setTimeout(() => overlay.classList.remove('thm-overlay--no-submenu'), 350);
  return true;
}

// ── Nav link clicks ───────────────────────────────────────────────────────────

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const idx = SECTIONS.indexOf(link.dataset.section);
    if (idx === -1) return;
    const wasOpen = closeOverlayIfOpen();
    // Si l'overlay était ouvert et qu'on est déjà sur la bonne section → juste fermer
    if (wasOpen && idx === currentIndex) return;
    goTo(idx);
  });
});

// ── Navigation silencieuse depuis un autre module (ex: overlay thématique) ──
// Reçoit { section: string, animate: boolean }
// Supprime la transition CSS du menu principal pour ne pas montrer le glissement.

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

// ── Resize — re-snap instantly so transforms stay correct ─────────────────────

window.addEventListener('resize', () => {
  applyTransform(currentIndex, 'none');
});

// ── Browser back / forward ────────────────────────────────────────────────────

window.addEventListener('popstate', (e) => {
  const idx = e.state?.sectionIndex ?? indexFromHash();
  goTo(idx, { pushState: false });
});

// ── Init ──────────────────────────────────────────────────────────────────────

(function init() {
  const idx = indexFromHash();
  applyTransform(idx, 'none');
  currentIndex = idx;
  updateNav(idx);
  // Seed history state so popstate works reliably on first back press
  history.replaceState({ sectionIndex: idx }, '', window.location.href);
})();

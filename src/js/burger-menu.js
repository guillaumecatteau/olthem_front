/**
 * burger-menu.js — Menu burger mobile (plein ecran)
 *
 * Gere l'ouverture/fermeture du menu, la recherche integree,
 * et la navigation par scroll natif sur mobile.
 * L'etat actif des liens est synchronise via IntersectionObserver.
 */

const burgerBtn   = document.getElementById('burger-btn');
const burgerMenu  = document.getElementById('burger-menu');

if (burgerBtn && burgerMenu) {
  // --- Ouverture / fermeture ---

  burgerBtn.addEventListener('click', () => {
    const isOpen = !burgerMenu.classList.contains('is-open');
    if (isOpen) {
      burgerMenu.classList.add('is-open');
      burgerBtn.setAttribute('aria-expanded', 'true');
      burgerMenu.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('burger-open');
    } else {
      closeMenu();
    }
  });

  // Fermer avec Echap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && burgerMenu.classList.contains('is-open')) closeMenu();
  });

  // --- Recherche integree ---

  const searchToggle = document.getElementById('burger-search-toggle');
  const searchWrap   = document.getElementById('burger-search-wrap');
  const searchInput  = document.getElementById('burger-search-input');
  const searchForm   = document.getElementById('burger-search-form');

  if (searchToggle && searchWrap) {
    searchToggle.addEventListener('click', () => {
      const isOpen = searchWrap.classList.toggle('is-open');
      searchToggle.setAttribute('aria-expanded', String(isOpen));
      searchWrap.setAttribute('aria-hidden', String(!isOpen));
      searchToggle.classList.toggle('is-active', isOpen);
      if (isOpen && searchInput) {
        setTimeout(() => searchInput.focus(), 320);
      }
    });
  }

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = (searchInput?.value ?? '').trim();
      if (!query) return;
      // Ne pas appeler closeMenu() ici : openSearchOverlay gère la fermeture
      // du burger et le masquage du bouton burger via la détection is-open.
      window.dispatchEvent(new CustomEvent('search:query', { detail: { query } }));
    });
  }

  // --- Navigation ---

  const burgerLinks = burgerMenu.querySelectorAll('.burger-menu__link[data-section]');

  burgerLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = link.dataset.section;
      closeMenu();

      const target = document.getElementById(sectionId);
      if (target) {
        // scrollTo explicite sur #scroll-viewport plutôt que scrollIntoView :
        // évite les conflits avec scroll-snap-stop intermédiaires.
        const vp = document.getElementById('scroll-viewport');
        if (vp) {
          vp.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      const hash = sectionId === 'accueil' ? window.location.pathname : '#' + sectionId;
      history.pushState({}, '', hash);

      setActiveSection(sectionId);
    });
  });

  // --- Synchronisation etat actif via IntersectionObserver ---

  const MOBILE_MQ = window.matchMedia('(max-width: 1279px)');

  if ('IntersectionObserver' in window) {
    const sections = document.querySelectorAll('.full-section[id]');
    // Sur mobile, #scroll-viewport est le scroll container (pas window).
    // L'IntersectionObserver doit utiliser ce conteneur comme root pour
    // détecter correctement quelle section est visible.
    const scrollViewport = document.getElementById('scroll-viewport');

    const observer = new IntersectionObserver(
      (entries) => {
        if (!MOBILE_MQ.matches) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.5, root: MOBILE_MQ.matches ? scrollViewport : null }
    );

    sections.forEach((section) => observer.observe(section));
  }

  // --- Bloquer tout scroll sous le menu quand il est ouvert ---
  // Chrome route wheel vers le prochain élément scrollable même si overflow:hidden.
  // preventDefault() coupe la chaîne de scroll à la source.
  burgerMenu.addEventListener('wheel',     (e) => e.preventDefault(), { passive: false });
  burgerMenu.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // --- Helpers ---

  function closeMenu() {
    burgerMenu.classList.remove('is-open');
    burgerBtn.setAttribute('aria-expanded', 'false');
    burgerMenu.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('burger-open');
    // Refermer la recherche intégrée si elle était ouverte
    if (searchWrap && searchWrap.classList.contains('is-open')) {
      searchWrap.classList.remove('is-open');
      searchWrap.setAttribute('aria-hidden', 'true');
      if (searchToggle) {
        searchToggle.setAttribute('aria-expanded', 'false');
        searchToggle.classList.remove('is-active');
      }
      if (searchInput) searchInput.value = '';
    }
  }

  function setActiveSection(sectionId) {
    burgerLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.section === sectionId);
    });
    document.querySelectorAll('.site-nav__link[data-section]').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.section === sectionId);
    });
  }
}

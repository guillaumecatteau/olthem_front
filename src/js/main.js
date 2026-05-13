import { fetchSections, fetchThematiques } from "./api.js";
import { initHeaderAuth } from "./auth.js";
import { setFormBuilderDependencies, bindFormBuilderSubmissions } from "./form-builder.js";
import { setSectionsPromise, hydrateMainSections, bindSectionScrollLinks } from "./section-builder.js";
import { initAteliersMap } from "./ateliers-map.js";
import {
  openPageOverlayWithRequest,
  openPageOverlay,
  closePageOverlay,
  bindPageOverlay,
  bindSearchOverlay,
  hydrateSocialLinks,
  setPageOverlayDependencies,
  getPageOverlayCurrentRequest
} from "./page-overlay.js";

const thematiquesPromise = fetchThematiques().catch(() => []);
const sectionsPromise    = fetchSections().catch(() => []);

setFormBuilderDependencies({ openOverlay: openPageOverlayWithRequest, closeOverlay: closePageOverlay, getOverlayCurrentRequest: getPageOverlayCurrentRequest, thematiquesPromise });
setSectionsPromise(sectionsPromise);
setPageOverlayDependencies({ thematiquesPromise, sectionsPromise });

function setCurrentYear() {
  const yearNode = document.getElementById("current-year");
  if (yearNode) yearNode.textContent = new Date().getFullYear();
}

setCurrentYear();

// ─── Loader : masquage + animations d'entrée de l'accueil ────────────────────
// Signal unique : accueil:cards-ready (thematiques.js, après renderHeaderCards)
// On n'attend plus section:hydrated — cet event dépend de l'API sections WP
// et peut ne jamais arriver si la section accueil n'existe pas côté API.

function _hideLoader() {
  const loader = document.getElementById("site-loader");
  const bar    = document.getElementById("site-loader-bar");
  if (!loader) return;

  if (bar) {
    bar.style.transition = "width 0.25s ease";
    bar.style.width = "100%";
  }

  setTimeout(() => {
    loader.classList.add("is-hiding");
    loader.addEventListener("transitionend", () => loader.remove(), { once: true });
  }, 250);
}

function _animateAccueilIn() {
  const header = document.getElementById("site-header");
  if (header) {
    header.classList.remove("will-animate");
    header.classList.add("animate-in");
  }

  const cardsWrap = document.getElementById("accueil-header-cards");
  if (cardsWrap) {
    const cards = [...cardsWrap.querySelectorAll(".thm-card")];
    // Forcer opacity:0 d'abord (sans transition), puis démarrer la transition
    // après un frame — évite le bug où remove(will-animate)+add(animate-in)
    // dans la même frame fait sauter l'animation par certains navigateurs.
    cards.forEach((card) => {
      card.style.transition = "none";
      card.style.opacity    = "0";
      card.style.transform  = "translateY(20px)";
    });
    requestAnimationFrame(() => {
      cards.forEach((card, i) => {
        const delay = `${(i * 0.12).toFixed(2)}s`;
        card.style.transition = `opacity 0.5s ease ${delay}, transform 0.5s ease ${delay}`;
        card.style.opacity    = "1";
        card.style.transform  = "translateY(0)";
      });
    });
  }
}

let _loaderTriggered = false;
function _revealAccueil() {
  if (_loaderTriggered) return;
  _loaderTriggered = true;
  _animateAccueilIn();
  _hideLoader();
}

window.addEventListener("accueil:cards-ready", () => _revealAccueil(), { once: true });

// Sécurité absolue uniquement : thematiques.js dispatch toujours accueil:cards-ready
// (même en cas d'erreur API), ce timeout ne se déclenche que si le module crashe
// complètement sans atteindre son try/catch.
setTimeout(() => _revealAccueil(), 20000);

// Init ateliers dès que la section est rendue (sans attendre les sections suivantes)
function _onSectionHydrated({ detail }) {
  if (detail.slug !== "ateliers") return;
  window.removeEventListener("section:hydrated", _onSectionHydrated);
  const ateliersSection = document.getElementById("ateliers");
  if (ateliersSection) initAteliersMap(ateliersSection).catch(() => {});
}
window.addEventListener("section:hydrated", _onSectionHydrated);

hydrateMainSections().then(() => {
  window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));
}).catch(() => {});
hydrateSocialLinks().catch(() => {});
bindPageOverlay();
bindSectionScrollLinks();
initHeaderAuth();
bindFormBuilderSubmissions();
bindSearchOverlay();

(function autoOpenResetOverlay() {
  const params = new URLSearchParams(window.location.search);
  const hasNew = params.get('action') === 'reset-password' && params.has('key') && params.has('login');
  const hasLegacy = params.has('reset_token');
  if (!hasNew && !hasLegacy) return;
  openPageOverlayWithRequest({ id: 327, exactTitle: 'Nouveau mot de passe', backLabel: 'Retour au site', overlayMode: 'overlayTotal' }, 'Nouveau mot de passe');
})();
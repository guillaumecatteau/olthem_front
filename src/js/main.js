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
hydrateMainSections().then(() => {
  window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));
  const ateliersSection = document.getElementById("ateliers");
  if (ateliersSection) initAteliersMap(ateliersSection).catch(() => {});
}).catch(() => {});
hydrateSocialLinks().catch(() => {});
bindPageOverlay();
bindSectionScrollLinks();
initHeaderAuth();
bindFormBuilderSubmissions();
bindSearchOverlay();

(function autoOpenResetOverlay() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("reset_token")) return;
  openPageOverlayWithRequest({ id: 327, exactTitle: "Nouveau mot de passe", backLabel: "Retour au site", overlayMode: "overlayTotal" }, "Nouveau mot de passe");
})();
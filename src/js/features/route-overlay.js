// route-overlay.js — Overlay plein écran d'itinéraire Mapbox.
//
// Responsabilité : construire, afficher et fermer l'overlay d'itinéraire
// qui s'ouvre quand l'utilisateur clique sur "Voir le trajet" dans la carte
// des ateliers. L'overlay contient une mini-carte Mapbox + le résumé
// durée/distance + les étapes de navigation tour-par-tour.
//
// Flux :
//   1. openRouteOverlay() construit le DOM, initialise la carte Mapbox.
//   2. loadProfile() appelle fetchMapboxDirections() et rend l'itinéraire.
//   3. L'utilisateur peut changer de profil (voiture/vélo/marche).
//   4. closeRouteOverlay() retire le DOM et libère le scroll.

import { lockMainScroll, unlockMainScroll } from "../core/scroll-lock.js";
import { fetchMapboxDirections } from "../api/api-mapbox.js";

// ─── Profils de transport ─────────────────────────────────────────────────────

export const ROUTE_PROFILES = [
  { id: "driving", label: "Voiture" },
  { id: "cycling", label: "Vélo"    },
  { id: "walking", label: "Marche"  },
];

// ─── Formatage durée / distance ───────────────────────────────────────────────

export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function formatDistance(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1).replace(".", ",")} km`
    : `${Math.round(meters)} m`;
}

// ─── État du module ───────────────────────────────────────────────────────────

// Une seule instance d'overlay à la fois.
let _routeOverlayInstance = null;

// ─── Icône marqueur destination ───────────────────────────────────────────────

const ICON_MARKER_DEFAULT = `<img src="./assets/images/icons/icon_InfoHead.svg" alt="" aria-hidden="true" class="atelier-marker__icon">`;

// ─── Construction du DOM de l'overlay ────────────────────────────────────────

function _buildRouteOverlayEl(destName, destRue, destPostal, destLocalite) {
  const el = document.createElement("div");
  el.className = "route-overlay";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", `Itinéraire vers ${destName}`);

  const addressParts = [
    destRue,
    [destPostal, destLocalite].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");

  el.innerHTML = `
    <div class="route-overlay__inner">
      <div class="route-overlay__content">
        <div class="route-overlay__double">

          <div class="route-overlay__panel">
            <div class="route-overlay__header">
              <div class="route-overlay__dest-group">
                <span class="route-overlay__dest">${destName}</span>
                ${addressParts ? `<span class="route-overlay__address">${addressParts}</span>` : ""}
              </div>
              <div class="route-profiles">
                ${ROUTE_PROFILES.map((p, i) => `
                  <button
                    type="button"
                    class="route-profile-btn${i === 0 ? " route-profile-btn--active" : ""}"
                    data-profile="${p.id}"
                  >${p.label}</button>
                `).join("")}
              </div>
              <div class="route-summary">
                <span class="route-summary__duration">—</span>
                <span class="route-summary__sep">·</span>
                <span class="route-summary__distance">—</span>
              </div>
            </div>
            <div class="route-steps-wrap">
              <ul class="route-steps" role="list"></ul>
            </div>
          </div>

          <div class="route-overlay__map-col">
            <div class="route-overlay__map-container"></div>
          </div>

        </div>
        <button type="button" class="icon-link route-overlay__close" aria-label="Fermer l'itinéraire">
          <img class="icon-link__icon" src="./assets/images/icons/icon_Retour.svg" alt="" aria-hidden="true" />
          <span class="icon-link__label">Retour au site</span>
        </button>
      </div>
    </div>
  `;
  return el;
}

// ─── Rendu de l'itinéraire dans l'overlay ─────────────────────────────────────

function _renderRouteInOverlay(overlayEl, overlayMap, routeData, profile) {
  const route   = routeData.routes[0];
  const durEl   = overlayEl.querySelector(".route-summary__duration");
  const distEl  = overlayEl.querySelector(".route-summary__distance");
  const stepsEl = overlayEl.querySelector(".route-steps");

  durEl.textContent  = formatDuration(route.duration);
  distEl.textContent = formatDistance(route.distance);

  // Mettre en surbrillance le profil actif
  overlayEl.querySelectorAll(".route-profile-btn").forEach(btn => {
    btn.classList.toggle("route-profile-btn--active", btn.dataset.profile === profile);
  });

  // Étapes de navigation
  const steps = route.legs[0]?.steps ?? [];
  stepsEl.innerHTML = steps.map((step, i) => `
    <li class="route-step">
      <span class="route-step__num">${i + 1}</span>
      <span class="route-step__instruction">${step.maneuver.instruction}</span>
      <span class="route-step__dist">${formatDistance(step.distance)}</span>
    </li>
  `).join("");

  // Tracé sur la mini-carte
  function drawLine() {
    try {
      if (overlayMap.getSource("overlay-route")) {
        overlayMap.getSource("overlay-route").setData({ type: "Feature", geometry: route.geometry });
      } else {
        overlayMap.addSource("overlay-route", {
          type: "geojson",
          data: { type: "Feature", geometry: route.geometry }
        });
        overlayMap.addLayer({
          id:     "overlay-route",
          type:   "line",
          source: "overlay-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint:  { "line-color": "#4a90d9", "line-width": 5, "line-opacity": 0.9 }
        });
      }
    } catch { /* carte non prête ou layer déjà absent */ }

    const coords = route.geometry.coordinates;
    if (coords.length > 1) {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new window.mapboxgl.LngLatBounds(coords[0], coords[0])
      );
      overlayMap.fitBounds(bounds, { padding: 60, duration: 600 });
    }
  }

  if (overlayMap.isStyleLoaded()) drawLine();
  else overlayMap.once("load", drawLine);
}

// ─── Ouverture de l'overlay ───────────────────────────────────────────────────

export function openRouteOverlay(destName, destRue, destPostal, destLocalite, destLng, destLat, userLng, userLat, token) {
  if (_routeOverlayInstance) closeRouteOverlay();

  const overlayEl = _buildRouteOverlayEl(destName, destRue, destPostal, destLocalite);
  document.body.appendChild(overlayEl);
  lockMainScroll();

  // Bouton retour sticky mobile
  const retourBtn = document.getElementById("overlay-retour-btn");
  if (retourBtn) {
    retourBtn.setAttribute("aria-hidden", "false");
    retourBtn.classList.add("is-visible");
    retourBtn.addEventListener("click", closeRouteOverlay, { once: true });
  }

  // Initialisation de la mini-carte Mapbox
  const mapContainerEl = overlayEl.querySelector(".route-overlay__map-container");
  const overlayMap = new window.mapboxgl.Map({
    container:          mapContainerEl,
    style:              "mapbox://styles/mapbox/light-v11",
    scrollZoom:         true,
    attributionControl: true,
  });

  // Fade-in + redimensionnement Mapbox après la transition CSS
  requestAnimationFrame(() => {
    overlayEl.classList.add("route-overlay--visible");
    overlayEl.addEventListener("transitionend", () => overlayMap.resize(), { once: true });
  });

  overlayMap.addControl(new window.mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");
  overlayMap.addControl(new window.mapboxgl.GeolocateControl({
    positionOptions:    { enableHighAccuracy: true },
    trackUserLocation:  true,
    showUserHeading:    true,
    showAccuracyCircle: true,
  }), "top-right");

  // Marqueur de destination
  overlayMap.on("load", () => {
    const destMarkerEl = document.createElement("div");
    destMarkerEl.className = "atelier-marker";
    destMarkerEl.innerHTML = ICON_MARKER_DEFAULT;
    new window.mapboxgl.Marker({ element: destMarkerEl })
      .setLngLat([destLng, destLat])
      .addTo(overlayMap);
  });

  let currentProfile = "driving";

  async function loadProfile(profile) {
    try {
      const data = await fetchMapboxDirections(profile, userLng, userLat, destLng, destLat, token);
      if (!data.routes?.[0]) return;
      currentProfile = profile;
      _renderRouteInOverlay(overlayEl, overlayMap, data, profile);
    } catch { /* ignorer les erreurs réseau silencieusement */ }
  }

  // Chargement initial en mode conduite
  loadProfile("driving");

  // Sélecteur de profil
  overlayEl.querySelector(".route-profiles").addEventListener("click", (e) => {
    const btn = e.target.closest(".route-profile-btn");
    if (!btn || btn.dataset.profile === currentProfile) return;
    loadProfile(btn.dataset.profile);
  });

  // Fermeture par touche Échap
  const onKeydown = (e) => { if (e.key === "Escape") closeRouteOverlay(); };
  overlayEl.querySelector(".route-overlay__close").addEventListener("click", closeRouteOverlay);
  document.addEventListener("keydown", onKeydown);

  _routeOverlayInstance = { el: overlayEl, map: overlayMap, onKeydown };
}

// ─── Fermeture de l'overlay ───────────────────────────────────────────────────

export function closeRouteOverlay() {
  if (!_routeOverlayInstance) return;

  const retourBtn = document.getElementById("overlay-retour-btn");
  if (retourBtn) {
    retourBtn.classList.remove("is-visible");
    retourBtn.setAttribute("aria-hidden", "true");
  }

  const { el, map, onKeydown } = _routeOverlayInstance;
  el.classList.remove("route-overlay--visible");
  document.removeEventListener("keydown", onKeydown);
  unlockMainScroll();
  // Laisser la transition CSS se terminer avant de supprimer le DOM
  setTimeout(() => { map.remove(); el.remove(); }, 300);
  _routeOverlayInstance = null;
}

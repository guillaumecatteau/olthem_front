import { fetchOptions, fetchUpcomingAteliers } from "../api/api.js";
import { lockMainScroll, unlockMainScroll } from "../core/scroll-lock.js";
import { fetchMapboxRoute } from "../api/api-mapbox.js";
import { openRouteOverlay, closeRouteOverlay } from "./route-overlay.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const MUNDANEUM_LNG     = 3.9518;
const MUNDANEUM_LAT     = 50.4553;
const MUNDANEUM_ADDRESS = "Rue de Nimy 76, 7000 Mons";
const MAPBOX_VERSION    = "v3.3.0";

// Wallonia + Brussels max extent [SW, NE]
const WALLONIA_BOUNDS = [[2.5, 49.4], [6.5, 51.6]];

// ─── Mapbox GL JS loader ──────────────────────────────────────────────────────

function loadMapboxGL() {
  return new Promise((resolve, reject) => {
    if (window.mapboxgl) { resolve(); return; }

    const link  = document.createElement("link");
    link.rel    = "stylesheet";
    link.href   = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_VERSION}/mapbox-gl.css`;
    document.head.appendChild(link);

    const script    = document.createElement("script");
    script.src      = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_VERSION}/mapbox-gl.js`;
    script.onload   = resolve;
    script.onerror  = reject;
    document.head.appendChild(script);
  });
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDateParts(isoDate) {
  if (!isoDate) return null;
  const parts = isoDate.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;
  const date      = new Date(year, month - 1, day);
  const dayStr    = String(day);
  const monthStr  = new Intl.DateTimeFormat("fr-BE", { month: "short" }).format(date)
    .replace(/\.$/, ""); // remove trailing dot some locales add
  const yearStr   = String(year);
  return { day: dayStr, month: monthStr, year: yearStr };
}

function dateBadgeHTML(isoDate, small = false) {
  const dp = parseDateParts(isoDate);
  if (!dp) return "";
  const cls = small ? "atelier-date-badge atelier-date-badge--small" : "atelier-date-badge";
  return `<div class="${cls}" aria-label="${isoDate}">
    <span class="atelier-date-badge__day">${dp.day}</span>
    <span class="atelier-date-badge__month">${dp.month}</span>
    <span class="atelier-date-badge__year">${dp.year}</span>
  </div>`;
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

const ICON_CONTACT    = `<img src="./assets/images/icons/icon_Contact.svg"    alt="" aria-hidden="true" class="atelier-icon-img">`;
const ICON_DIRECTION  = `<img src="./assets/images/icons/icon_Direction.svg"  alt="" aria-hidden="true" class="atelier-icon-img">`;
// Marker inner icons (inverted to appear white on dark background)
const ICON_MARKER_DEFAULT   = `<img src="./assets/images/icons/icon_InfoHead.svg"   alt="" aria-hidden="true" class="atelier-marker__icon">`;
const ICON_MARKER_MUNDANEUM = `<img src="./assets/images/icons/icon_Mundaneum.svg"  alt="" aria-hidden="true" class="atelier-marker__icon atelier-marker__icon--mundaneum">`;

// ─── Layout builder ───────────────────────────────────────────────────────────

function buildBlockHTML() {
  return `
    <div class="ateliers-map-block">
      <div class="ateliers-list-wrap">
        <div class="ateliers-list-col">
          <ul class="ateliers-list" role="list"></ul>
          <div class="ateliers-empty-state" hidden>
            <div class="ateliers-mundaneum-card">
              <img src="./assets/images/icons/icon_POI.svg" alt="" aria-hidden="true" class="ateliers-mundaneum-card__icon">
              <div>
                <strong class="ateliers-mundaneum-card__name">Le Mundaneum</strong>
                <span class="ateliers-mundaneum-card__address">${MUNDANEUM_ADDRESS}</span>
              </div>
            </div>
            <p class="ateliers-empty-state__msg">Aucun atelier n'est programmé pour le moment.</p>
          </div>
        </div>
      </div>
      <div class="ateliers-map-col">
        <div class="ateliers-mapbox-container"></div>
        <button type="button" class="ateliers-trajet-btn" hidden>Voir le trajet</button>
      </div>
    </div>
  `;
}

// ─── List rendering ───────────────────────────────────────────────────────────

function buildListItemHTML(atelier) {
  const displayName = atelier.mundaneum ? "Mundaneum" : (atelier.institution || "\u2014");
  const localite    = [atelier.city, atelier.postal_code ? `(${atelier.postal_code})` : ""]
    .filter(Boolean).join(" ");

  const destLat = atelier.mundaneum ? MUNDANEUM_LAT : atelier.latitude;
  const destLng = atelier.mundaneum ? MUNDANEUM_LNG : atelier.longitude;

  let iconsHTML = "";
  if (atelier.share_contact && atelier.contact_email) {
    // Sanitize: contact_email comes from the API we control, still validate basic shape
    const safeEmail = String(atelier.contact_email).replace(/[^a-zA-Z0-9._%+\-@]/g, "");
    iconsHTML += `<a
        href="mailto:${safeEmail}"
        class="atelier-icon-link atelier-icon-link--mail"
        title="Contacter par e-mail"
        aria-label="Contacter ${displayName} par e-mail"
      >${ICON_CONTACT}</a>`;
  }
  if (destLat != null && destLng != null) {
    iconsHTML += `<button
        type="button"
        class="atelier-icon-link atelier-icon-link--directions"
        data-dest-lat="${destLat}"
        data-dest-lng="${destLng}"
        data-dest-name="${displayName}"
        data-dest-rue="${atelier.mundaneum ? "Rue de Nimy 76" : (atelier.rue || "")}"
        data-dest-postal="${atelier.mundaneum ? "7000" : (atelier.postal_code || "")}"
        data-dest-localite="${atelier.mundaneum ? "Mons" : (atelier.city || "")}"
        title="Afficher l'itinéraire sur la carte"
        aria-label="Itinéraire vers ${displayName} sur la carte"
        aria-pressed="false"
      >${ICON_DIRECTION}</button>`;
  }

  return `
    ${dateBadgeHTML(atelier.valid_date)}
    <div class="atelier-info">
      ${atelier.thematique_titre ? `<span class="atelier-info__thematique">${atelier.thematique_titre}</span>` : ""}
      <span class="atelier-info__etablissement">${displayName}</span>
      ${localite ? `<span class="atelier-info__localite">${localite}</span>` : ""}
    </div>
    ${iconsHTML ? `<div class="atelier-icons">${iconsHTML}</div>` : ""}
  `;
}

function renderList(listEl, ateliers, onItemClick) {
  listEl.innerHTML = "";
  const emptyState = listEl.closest(".ateliers-list-col").querySelector(".ateliers-empty-state");

  if (!ateliers.length) {
    if (emptyState) emptyState.removeAttribute("hidden");
    return;
  }

  if (emptyState) emptyState.setAttribute("hidden", "");

  ateliers.forEach((atelier) => {
    const li = document.createElement("li");
    li.className          = "atelier-item";
    li.dataset.atelierId  = atelier.id;
    li.innerHTML          = buildListItemHTML(atelier);

    li.addEventListener("click", (e) => {
      // Don't trigger item-click when an icon link is clicked
      if (e.target.closest(".atelier-icon-link")) return;
      onItemClick(atelier);
    });

    listEl.appendChild(li);
  });
}

// ─── Highlight + active-marker helpers ─────────────────────────────────────────

function setActiveMarker(markersByGroup, activeKey) {
  markersByGroup.forEach(({ el }, key) => {
    const isActive = key === activeKey;
    el.classList.toggle("atelier-marker--active", isActive);
  });
}

function clearHighlights(listEl) {
  listEl.querySelectorAll(".atelier-item--highlighted")
    .forEach(el => el.classList.remove("atelier-item--highlighted"));
}

function highlightItems(listEl, atelierIds) {
  clearHighlights(listEl);
  let firstEl = null;
  atelierIds.forEach((id) => {
    const el = listEl.querySelector(`[data-atelier-id="${id}"]`);
    if (!el) return;
    el.classList.add("atelier-item--highlighted");
    if (!firstEl) firstEl = el;
  });
  if (firstEl) firstEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ─── Location grouping ────────────────────────────────────────────────────────

/**
 * Groups ateliers by location.
 * Returns Map<key, { coords: [lng, lat], items: atelier[], isMundaneum: boolean }>
 * The Mundaneum group always exists so its marker is always visible.
 */
function groupByLocation(ateliers) {
  const groups = new Map();

  // Mundaneum always present
  groups.set("mundaneum", {
    coords:      [MUNDANEUM_LNG, MUNDANEUM_LAT],
    items:       [],
    isMundaneum: true
  });

  ateliers.forEach((atelier) => {
    if (atelier.mundaneum) {
      groups.get("mundaneum").items.push(atelier);
      return;
    }

    if (atelier.latitude == null || atelier.longitude == null) return;

    const key = `${atelier.latitude.toFixed(5)},${atelier.longitude.toFixed(5)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        coords:      [atelier.longitude, atelier.latitude],
        items:       [],
        isMundaneum: false
      });
    }
    groups.get(key).items.push(atelier);
  });

  return groups;
}

// ─── Popup HTML ───────────────────────────────────────────────────────────────

function buildPopupHTML(group) {
  const { items, isMundaneum } = group;

  if (isMundaneum && !items.length) {
    return `<div class="atelier-popup atelier-popup--mundaneum">
      <strong class="atelier-popup__name">Mundaneum</strong>
      <span class="atelier-popup__address">${MUNDANEUM_ADDRESS}</span>
    </div>`;
  }

  const rows = items.map((item) => `
    <div class="atelier-popup-item">
      ${dateBadgeHTML(item.valid_date, true)}
      <div class="atelier-popup-item__info">
        ${item.thematique_titre ? `<strong>${item.thematique_titre}</strong>` : ""}
        <span>${isMundaneum ? "Mundaneum" : (item.institution || "")}</span>
      </div>
    </div>
  `).join("");

  return `<div class="atelier-popup">${rows}</div>`;
}

// ─── Markers + interactions ───────────────────────────────────────────────────

function addMarkersAndInteractions(map, groups, listEl, markersByGroup) {
  groups.forEach((group, key) => {
    const { coords, items, isMundaneum } = group;

    // Marker element
    const el       = document.createElement("div");
    el.className   = `atelier-marker${isMundaneum ? " atelier-marker--mundaneum" : ""}`;
    el.innerHTML   = isMundaneum ? ICON_MARKER_MUNDANEUM : ICON_MARKER_DEFAULT;
    // Mundaneum always on top of other markers
    if (isMundaneum) el.style.zIndex = "10";

    // Popup
    const popup = new window.mapboxgl.Popup({
      closeButton:  false,
      closeOnClick: false,
      offset:       20,
      className:    "atelier-mapbox-popup"
    }).setHTML(buildPopupHTML(group));

    const marker = new window.mapboxgl.Marker({ element: el })
      .setLngLat(coords)
      .addTo(map);

    markersByGroup.set(key, { marker, el });

    // Hover
    el.addEventListener("mouseenter", () => popup.addTo(map).setLngLat(coords));
    el.addEventListener("mouseleave", () => popup.remove());

    // Click → highlight list items + enlarge this marker
    el.addEventListener("click", () => {
      if (!items.length) return;
      setActiveMarker(markersByGroup, key);
      highlightItems(listEl, [items[0].id]);
    });
  });
}

// ─── Map fit ──────────────────────────────────────────────────────────────────

function fitMapToPOIs(map, groups) {
  const allCoords = [...groups.values()]
    .filter(g => g.items.length > 0 || g.isMundaneum)
    .map(g => g.coords);

  if (!allCoords.length) return;

  if (allCoords.length === 1) {
    map.setCenter(allCoords[0]);
    map.setZoom(9);
    return;
  }

  const bounds = allCoords.reduce(
    (b, c) => b.extend(c),
    new window.mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
  );
  map.fitBounds(bounds, { padding: 80, maxZoom: 12 });
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function initAteliersMap(sectionEl) {
  // Target the right double-panel if the section uses that layout,
  // then the left panel, then .section-inner as a final fallback.
  const host =
    sectionEl.querySelector(".section-subsections-double__panel--right") ||
    sectionEl.querySelector(".section-subsections-double__panel--left")  ||
    sectionEl.querySelector(".section-inner");

  if (!host) return;

  // Inject block structure
  const wrapper   = document.createElement("div");
  wrapper.innerHTML = buildBlockHTML();
  const blockEl   = wrapper.firstElementChild;
  host.appendChild(blockEl);

  const listEl         = blockEl.querySelector(".ateliers-list");
  const listColEl      = blockEl.querySelector(".ateliers-list-col");
  const mapContainerEl = blockEl.querySelector(".ateliers-mapbox-container");
  const mapColEl       = blockEl.querySelector(".ateliers-map-col");
  const trajetBtn      = blockEl.querySelector(".ateliers-trajet-btn");

  // Fetch data
  const [options, ateliers] = await Promise.all([
    fetchOptions().catch(() => ({})),
    fetchUpcomingAteliers().catch(() => [])
  ]);

  // Sort by date ASC
  const sorted = [...ateliers].sort((a, b) => {
    if (!a.valid_date) return 1;
    if (!b.valid_date) return -1;
    return a.valid_date.localeCompare(b.valid_date);
  });

  const groups       = groupByLocation(sorted);
  const markersByGroup = new Map();

  // Render list (callback: fly map to group POI + enlarge it on item click)
  renderList(listEl, sorted, (atelier) => {
    const groupKey = atelier.mundaneum
      ? "mundaneum"
      : `${atelier.latitude?.toFixed(5)},${atelier.longitude?.toFixed(5)}`;

    const groupData = markersByGroup.get(groupKey);
    if (groupData) {
      setActiveMarker(markersByGroup, groupKey);
      const lngLat = groupData.marker.getLngLat?.();
      if (lngLat && window._ateliersMap) {
        window._ateliersMap.flyTo({ center: lngLat, zoom: 12, duration: 800 });
      }
    }
    highlightItems(listEl, [atelier.id]);
  });

  // Sur mobile : bloquer les interactions avec la map tant que le panel n'est
  // pas positionné (bas du panel = bas du viewport).
  // Le snap lui-même est géré par CSS (scroll-snap-align: end) pour ne pas
  // interférer avec la navigation programmatique vers d'autres sections.
  const panelRight = sectionEl.querySelector('.section-subsections-double__panel--right');
  const scrollViewport = document.getElementById('scroll-viewport');

  if (panelRight && scrollViewport && window.innerWidth < 1280) {
    function isPanelSnapped() {
      const pr = panelRight.getBoundingClientRect();
      const vr = scrollViewport.getBoundingClientRect();
      return Math.abs(pr.bottom - vr.bottom) < 10;
    }

    function updateMapInteractivity() {
      mapColEl.style.pointerEvents = isPanelSnapped() ? '' : 'none';
    }

    updateMapInteractivity();
    scrollViewport.addEventListener('scroll', updateMapInteractivity, { passive: true });
  }

  // The list column uses the secondary-scroll system.
  // Notify it so it calibrates the custom scrollbar.
  window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));

  // Sur mobile : afficher la scrollbar uniquement pendant le défilement de la liste.
  if (listColEl) {
    const listWrapEl = listColEl.closest(".ateliers-list-wrap");
    let scrollHideTimer = null;
    listColEl.addEventListener("scroll", () => {
      if (!listWrapEl) return;
      listWrapEl.classList.add("is-scrolling");
      clearTimeout(scrollHideTimer);
      scrollHideTimer = setTimeout(() => listWrapEl.classList.remove("is-scrolling"), 800);
    }, { passive: true });
  }

  // Intercept wheel on the list column → scroll the list, not the section.
  if (listColEl) {
    listColEl.addEventListener("wheel", (e) => {
      const el = listColEl;
      const atTop    = el.scrollTop <= 1;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const goingUp   = e.deltaY < 0;
      const goingDown = e.deltaY > 0;
      // Only absorb the event when the list can actually scroll in that direction
      if ((goingDown && !atBottom) || (goingUp && !atTop)) {
        e.stopPropagation();
        el.scrollTop += e.deltaY;
      }
    }, { passive: true });
  }

  // Init Mapbox
  const token = (typeof options.mapbox_token === "string" ? options.mapbox_token : "").trim();
  if (!token) {
    mapColEl.classList.add("ateliers-map-col--unavailable");
    mapColEl.textContent = "Token Mapbox manquant — à configurer dans WP Admin > Informations générales.";
    console.warn("[ateliers-map] mapbox_token absent de /wp/v2/options");
    return;
  }

  try {
    await loadMapboxGL();
  } catch {
    mapColEl.classList.add("ateliers-map-col--unavailable");
    return;
  }

  window.mapboxgl.accessToken = token;

  const map = new window.mapboxgl.Map({
    container:        mapContainerEl,
    style:            "mapbox://styles/mapbox/light-v11",
    maxBounds:        WALLONIA_BOUNDS,
    scrollZoom:       false,
    attributionControl: true
  });

  // Store ref for item-click pan
  window._ateliersMap = map;

  map.addControl(new window.mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");

  // Intercept wheel on map container → never propagate to section scroll
  mapContainerEl.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: true });

  mapContainerEl.addEventListener("mouseenter", () => map.scrollZoom.enable());
  mapContainerEl.addEventListener("mouseleave", () => map.scrollZoom.disable());

  // ─── Mapbox Directions itinerary ─────────────────────────────────────────────

  let activeRouteBtn = null;
  let overlayParams  = null;

  function clearRoute() {
    try {
      if (map.getLayer("ateliers-route")) map.removeLayer("ateliers-route");
      if (map.getSource("ateliers-route")) map.removeSource("ateliers-route");
    } catch { /* map not ready or layer already gone */ }
    trajetBtn.setAttribute("hidden", "");
    overlayParams = null;
  }

  async function fetchAndDrawRoute(userLng, userLat, destLng, destLat, btn, destName, destRue, destPostal, destLocalite) {
    try {
      const data = await fetchMapboxRoute(userLng, userLat, destLng, destLat, token);
      if (!data.routes?.[0]) return;
      clearRoute();
      map.addSource("ateliers-route", {
        type: "geojson",
        data: { type: "Feature", geometry: data.routes[0].geometry }
      });
      map.addLayer({
        id:     "ateliers-route",
        type:   "line",
        source: "ateliers-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint:  { "line-color": "#4a90d9", "line-width": 4, "line-opacity": 0.85 }
      });
      btn.classList.add("atelier-icon-link--active");
      btn.setAttribute("aria-pressed", "true");
      activeRouteBtn = btn;

      // Reveal “Voir le trajet” button — clicking opens the full-screen overlay
      overlayParams = { userLng, userLat, destLng, destLat, destName, destRue, destPostal, destLocalite };
      trajetBtn.removeAttribute("hidden");
      // Fit map to show the full route
      const coords = data.routes[0].geometry.coordinates;
      if (coords.length > 1) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new window.mapboxgl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 60, duration: 800 });
      }
    } catch { /* silently fail (network error, map not ready) */ }
  }

  listEl.addEventListener("click", (e) => {
    const dirBtn = e.target.closest(".atelier-icon-link--directions");
    if (!dirBtn) return;
    e.stopPropagation();

    // Toggle off if same button is clicked again
    if (activeRouteBtn === dirBtn) {
      clearRoute();
      dirBtn.classList.remove("atelier-icon-link--active");
      dirBtn.setAttribute("aria-pressed", "false");
      activeRouteBtn = null;
      return;
    }

    // Deactivate previous button
    if (activeRouteBtn) {
      activeRouteBtn.classList.remove("atelier-icon-link--active");
      activeRouteBtn.setAttribute("aria-pressed", "false");
      activeRouteBtn = null;
    }
    clearRoute();

    const destLng      = parseFloat(dirBtn.dataset.destLng);
    const destLat      = parseFloat(dirBtn.dataset.destLat);
    const destName     = dirBtn.dataset.destName     || "";
    const destRue      = dirBtn.dataset.destRue      || "";
    const destPostal   = dirBtn.dataset.destPostal   || "";
    const destLocalite = dirBtn.dataset.destLocalite || "";

    if (!navigator.geolocation) {
      const c = map.getCenter();
      fetchAndDrawRoute(c.lng, c.lat, destLng, destLat, dirBtn, destName, destRue, destPostal, destLocalite);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => fetchAndDrawRoute(pos.coords.longitude, pos.coords.latitude, destLng, destLat, dirBtn, destName, destRue, destPostal, destLocalite),
      ()    => { const c = map.getCenter(); fetchAndDrawRoute(c.lng, c.lat, destLng, destLat, dirBtn, destName, destRue, destPostal, destLocalite); },
      { timeout: 5000 }
    );
  });

  // “Voir le trajet” → open full-screen route overlay
  trajetBtn.addEventListener("click", () => {
    if (overlayParams) {
      openRouteOverlay(
        overlayParams.destName,
        overlayParams.destRue,
        overlayParams.destPostal,
        overlayParams.destLocalite,
        overlayParams.destLng, overlayParams.destLat,
        overlayParams.userLng, overlayParams.userLat,
        token
      );
    }
  });

  let markersAdded = false;
  function addMarkersOnce() {
    if (markersAdded) return;
    markersAdded = true;
    addMarkersAndInteractions(map, groups, listEl, markersByGroup);
    fitMapToPOIs(map, groups);
  }

  map.on("load", addMarkersOnce);

  // Fallback: style already loaded before listener attached
  if (map.isStyleLoaded()) addMarkersOnce();
}

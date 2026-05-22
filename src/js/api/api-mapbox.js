// api-mapbox.js — Appels à l'API Mapbox Directions.
//
// Responsabilité : encapsuler les requêtes HTTP vers l'API Directions de Mapbox.
// Toutes les communications avec les serveurs Mapbox passent par ce module.
//
//   fetchMapboxRoute      → tracé rapide (profil conduite, sans étapes détaillées)
//   fetchMapboxDirections → itinéraire complet avec étapes et instructions FR
//
// Utilisé par :
//   ateliers-map.js  → fetchMapboxRoute (prévisualisation sur la carte principale)
//   route-overlay.js → fetchMapboxDirections (overlay itinéraire plein écran)

const MAPBOX_DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox";

/**
 * Récupère un itinéraire de prévisualisation (profil conduite, sans étapes).
 * Retourne la géométrie GeoJSON de l'itinéraire le plus court.
 */
export async function fetchMapboxRoute(originLng, originLat, destLng, destLat, token) {
  const url = `${MAPBOX_DIRECTIONS_BASE}/driving/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Directions HTTP ${res.status}`);
  return res.json();
}

/**
 * Récupère un itinéraire complet avec étapes de navigation (language=fr).
 * Supporte les profils driving, cycling et walking.
 */
export async function fetchMapboxDirections(profile, originLng, originLat, destLng, destLat, token) {
  const url = `${MAPBOX_DIRECTIONS_BASE}/${profile}/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&steps=true&language=fr&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox Directions HTTP ${res.status}`);
  return res.json();
}

// ── API WordPress ────────────────────────────────────────────────────────────
// Racines candidates tentées dans l'ordre jusqu'à la première qui répond.
// L'override runtime (query string ?apiRoot= ou localStorage) est inséré en tête.

const WP_API_ROOTS_DEFAULT = [
  "http://localhost:10010/wp-json",
  "http://localhost/wp-json",
  "https://olthem.local/wp-json",
  "http://olthem.local/wp-json"
];

function getRuntimeApiRoot() {
  if (typeof window === "undefined") return null;

  const fromQuery = new URLSearchParams(window.location.search).get("apiRoot");
  if (fromQuery) return fromQuery;

  try {
    return window.localStorage.getItem("apiRoot");
  } catch {
    return null;
  }
}

const runtimeApiRoot = getRuntimeApiRoot();
const wpApiRoots = runtimeApiRoot
  ? [runtimeApiRoot, ...WP_API_ROOTS_DEFAULT]
  : WP_API_ROOTS_DEFAULT;

export const wpConfig = {
  apiRoots:    [...new Set(wpApiRoots)],
  postsPerPage: 3
};

// ── API externe (à venir) ────────────────────────────────────────────────────
// Décommenter et compléter lors de l'intégration d'une deuxième API.
//
// export const externalApiConfig = {
//   baseUrl: "https://api.example.com/v1",
//   apiKey:  import.meta?.env?.VITE_EXTERNAL_API_KEY ?? ""
// };

// ── Rétrocompatibilité ────────────────────────────────────────────────────────
// rest-client.js et les anciens appelants utilisent toujours `config.apiRoots`.

export const config = {
  apiRoot:     wpConfig.apiRoots[0],
  apiRoots:    wpConfig.apiRoots,
  postsPerPage: wpConfig.postsPerPage
};

const DEFAULT_API_ROOTS = [
  "https://olthem.local/wp-json",
  "http://olthem.local/wp-json",
  "http://localhost:10010/wp-json",
  "http://localhost/wp-json"
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

const apiRoots = runtimeApiRoot
  ? [runtimeApiRoot, ...DEFAULT_API_ROOTS]
  : DEFAULT_API_ROOTS;

export const config = {
  // Backward compatibility for legacy callers.
  apiRoot: apiRoots[0],
  apiRoots: [...new Set(apiRoots)],
  postsPerPage: 3
};

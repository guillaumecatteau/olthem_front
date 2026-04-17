import { config } from "./config.js";

function getApiRoots() {
  const roots = Array.isArray(config.apiRoots) && config.apiRoots.length
    ? config.apiRoots
    : [config.apiRoot];

  return [...new Set(roots.filter(Boolean))].map((root) => String(root).replace(/\/+$/, ""));
}

export class RestApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "RestApiError";
    this.status = options.status ?? null;
    this.payload = options.payload ?? null;
    this.url = options.url ?? null;
  }
}

export async function requestJsonAcrossRoots(pathname, options = {}) {
  const {
    params = {},
    method = "GET",
    body = null,
    headers = {},
    token = null,
    failFastOnClientError = false,
    failFastOn404 = false
  } = options;

  const roots = getApiRoots();
  const failures = [];

  for (const root of roots) {
    const url = new URL(`${root}${pathname}`);

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = payload?.message || `HTTP ${response.status}`;

        const isFastFail =
          (failFastOn404 && response.status === 404) ||
          (failFastOnClientError && response.status >= 400 && response.status < 500 && response.status !== 404);

        if (isFastFail) {
          throw new RestApiError(message, {
            status: response.status,
            payload,
            url: url.toString()
          });
        }

        failures.push(`${url.origin} -> ${message}`);
        continue;
      }

      return payload;
    } catch (error) {
      if (error instanceof RestApiError) {
        throw error;
      }

      const reason = error instanceof Error ? error.message : "Network error";
      failures.push(`${url.origin} -> ${reason}`);
    }
  }

  throw new RestApiError(
    `Unable to reach API. Tried: ${failures.join(" | ") || roots.join(", ")}`
  );
}

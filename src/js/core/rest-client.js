import { config } from "./config.js";

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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

    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
          const text = await response.text();
          const cleanText = text.replace(/^\uFEFF+/, "");
          payload = cleanText ? JSON.parse(cleanText) : null;
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message = payload?.message || `HTTP ${response.status}`;
          const isTransientServerError = response.status === 502 || response.status === 503 || response.status === 504;

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

          if (isTransientServerError && attempt < maxAttempts) {
            await delay(250);
            continue;
          }

          failures.push(`${url.origin} -> ${message}`);
          break;
        }

        if (payload === null || payload === undefined) {
          failures.push(`${url.origin} -> empty response body`);
          break;
        }

        return payload;
      } catch (error) {
        if (error instanceof RestApiError) {
          throw error;
        }

        const reason = error instanceof Error ? error.message : "Network error";
        const isLastAttempt = attempt === maxAttempts;
        if (!isLastAttempt) {
          await delay(250);
          continue;
        }
        failures.push(`${url.origin} -> ${reason}`);
      }
    }
  }

  throw new RestApiError(
    `Unable to reach API. Tried: ${failures.join(" | ") || roots.join(", ")}`
  );
}

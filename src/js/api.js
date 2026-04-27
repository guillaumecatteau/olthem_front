import { config } from "./config.js";
import { RestApiError, requestJsonAcrossRoots } from "./rest-client.js";
import { getStoredToken } from "./auth.js";
import { stripHtml } from "./utils.js";

export async function fetchThematiques() {
  const items = await requestJsonAcrossRoots("/wp/v2/thematiques", {
    params: {
      per_page: 100,
      orderby: "menu_order",
      order: "asc"
    }
  });

  if (!Array.isArray(items)) return [];

  return items.map(item => ({
    id:                  item.id,
    slug:                item.slug               || "",
    titre:               item.titre              ?? stripHtml(item.title?.rendered ?? ""),
    descriptif_desktop:  item.descriptif_desktop ?? "",
    descriptif_mobile:   item.descriptif_mobile  ?? "",
    episode:             !!item.episode,
    episode_numero:      item.episode_numero     ?? null,
    personnage:          item.personnage         ?? "",
    header:              !!item.header,
    header_position:     item.header_position    ?? "premier",
    visuel:              item.visuel             ?? null,
    couleur:             item.couleur            ?? "#3F3F48",
    couleur_sombre:      item.couleur_sombre      ?? null,
    builder:             Array.isArray(item.builder) ? item.builder : []
  }));
}

export async function fetchLatestPosts() {
  const posts = await requestJsonAcrossRoots("/wp/v2/posts", {
    params: {
      per_page: config.postsPerPage,
      _embed: 1
    }
  });

  return posts.map((post) => ({
    id: post.id,
    title: stripHtml(post.title.rendered),
    excerpt: stripHtml(post.excerpt.rendered),
    link: post.link,
    image:
      post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
      post.featured_image_url ||
      null
  }));
}

export async function fetchSections() {
  const items = await requestJsonAcrossRoots("/wp/v2/sections", {
    params: {
      per_page: 100,
      orderby: "menu_order",
      order: "asc"
    }
  });

  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: item.id,
    slug: item.slug || "",
    title: stripHtml(item.title?.rendered ?? ""),
    builder: Array.isArray(item.builder) ? item.builder : []
  }));
}

export async function fetchPage(options = {}) {
  const {
    id = null,
    slug = null,
    search = null,
    exactTitle = null,
    postType = null
  } = options;

  if (id) {
    // Build ordered list of endpoints to try for this ID
    let idEndpoints;
    if (postType === "post") {
      idEndpoints = ["/wp/v2/posts/${id}", "/wp/v2/pages/${id}"];
    } else if (postType && postType !== "page") {
      idEndpoints = [`/wp/v2/${postType}/${id}`, `/wp/v2/pages/${id}`, `/wp/v2/posts/${id}`];
    } else {
      idEndpoints = [`/wp/v2/pages/${id}`, `/wp/v2/posts/${id}`];
    }
    // Template literal fix: reassign using actual id value
    idEndpoints = idEndpoints.map(e => e.replace("${id}", id));

    let item = null;
    for (const endpoint of idEndpoints) {
      try {
        // failFastOn404: if the primary server returns 404, don't try other roots
        item = await requestJsonAcrossRoots(endpoint, { failFastOn404: true, token: getStoredToken() });
        if (item) break;
      } catch (err) {
        if (err instanceof RestApiError) {
          console.warn(`[fetchPage] ${endpoint} -> HTTP ${err.status}: ${err.message}`);
        }
        item = null;
      }
    }

    if (item) {
      return {
        id: item.id,
        slug: item.slug || "",
        title: stripHtml(item.title?.rendered ?? ""),
        content: item.content?.rendered ?? "",
        builder: Array.isArray(item.builder)
          ? item.builder
          : (Array.isArray(item.acf?.builder) ? item.acf.builder : [])
      };
    }
    // ID lookup failed â€” fall through to slug-based lookup if possible
    if (!slug && !search && !exactTitle) return null;
  }

  const params = { per_page: 20 };
  if (slug) params.slug = slug;
  if (search) params.search = search;

  // Choose endpoint(s) based on postType
  const slugEndpoints = postType === "post"
    ? ["/wp/v2/posts"]
    : (postType && postType !== "page")
      ? [`/wp/v2/${postType}`, "/wp/v2/pages"]
      : ["/wp/v2/pages"];

  const norm = (value) => stripHtml(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const target = exactTitle ? norm(exactTitle) : null;

  for (const endpoint of slugEndpoints) {
    let items;
    try {
      items = await requestJsonAcrossRoots(endpoint, { params, token: getStoredToken() });
    } catch {
      continue;
    }
    if (!Array.isArray(items) || items.length === 0) continue;

    const match = target
      ? items.find((item) => norm(item.title?.rendered) === target)
      : items[0];
    if (!match) continue;

    return {
      id: match.id,
      slug: match.slug || "",
      title: stripHtml(match.title?.rendered ?? ""),
      content: match.content?.rendered ?? "",
      builder: Array.isArray(match.builder)
        ? match.builder
        : (Array.isArray(match.acf?.builder) ? match.acf.builder : [])
    };
  }

  if (id || slug) {
    console.warn(`[fetchPage] Content not found. id=${id} slug=${slug} postType=${postType}`);
  }
  return null;
}

export async function fetchOptions() {
  const fallback = {
    facebook_url: "https://www.facebook.com/Mundaneum.officiel/",
    X_url: "https://x.com/mundaneumasbl?lang=fr",
    instagram_url: "https://www.instagram.com/mundaneumasbl/?hl=fr",
    mapbox_token: ""
  };
  try {
    const data = await requestJsonAcrossRoots("/wp/v2/options");
    if (!data || typeof data !== "object") return fallback;
    return {
      facebook_url:  data.facebook_url  || fallback.facebook_url,
      X_url:         data.X_url         || fallback.X_url,
      instagram_url: data.instagram_url || fallback.instagram_url,
      mapbox_token:  data.mapbox_token  || ""
    };
  } catch {
    return fallback;
  }
}

export async function fetchUpcomingAteliers() {
  try {
    const items = await requestJsonAcrossRoots("/olthem/v1/ateliers/upcoming");
    if (!Array.isArray(items)) return [];
    return items.map(item => ({
      id:               item.id,
      mundaneum:        !!item.mundaneum,
      etablissement:    item.etablissement    || "",
      localite:         item.localite         || "",
      code_postal:      item.code_postal      || "",
      valid_date:       item.valid_date        || null,
      share_contact:    !!item.share_contact,
      contact_email:    item.contact_email     || null,
      latitude:         item.latitude  != null ? parseFloat(item.latitude)  : null,
      longitude:        item.longitude != null ? parseFloat(item.longitude) : null,
      thematique_id:    item.thematique_id    || null,
      thematique_titre: item.thematique_titre || ""
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Local full-content search across sections and thematiques (searches ACF
// builder fields that are invisible to the WP REST search endpoint).
// Returns results in the same shape as WP /wp/v2/search items.
// ---------------------------------------------------------------------------

function extractAllText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractAllText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(extractAllText).join(" ");
  return "";
}

export function searchLocalContent(query, sections = [], thematiques = []) {
  const terms = String(query)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (!terms.length) return [];

  function matches(item) {
    const haystack = extractAllText(item).toLowerCase();
    return terms.every(term => haystack.includes(term));
  }

  const results = [];

  for (const section of sections) {
    if (matches({ title: section.title, builder: section.builder })) {
      results.push({
        id:      section.id,
        slug:    section.slug,
        title:   section.title,
        url:     "",
        type:    "post",
        subtype: "sections"
      });
    }
  }

  for (const thm of thematiques) {
    const searchable = {
      titre:               thm.titre,
      descriptif_desktop:  thm.descriptif_desktop,
      descriptif_mobile:   thm.descriptif_mobile,
      builder:             thm.builder
    };
    if (matches(searchable)) {
      results.push({
        id:      thm.id,
        title:   thm.titre,
        url:     "",
        type:    "post",
        subtype: "thematiques"
      });
    }
  }

  return results;
}

export async function checkUsernameAvailable(username, currentUserId = null) {
  const params = { username };
  if (currentUserId != null) params.current_user_id = String(currentUserId);
  try {
    const data = await requestJsonAcrossRoots("/olthem/v1/auth/check-username", { params });
    return !!data?.available;
  } catch {
    return true; // fail open: don't block submission on network errors
  }
}

export async function fetchMyAteliers(token) {
  return requestJsonAcrossRoots("/olthem/v1/auth/me/ateliers", { token });
}

export async function updateUserProfile(values, token) {
  return requestJsonAcrossRoots("/olthem/v1/auth/me", {
    method: "PUT",
    body: values,
    token,
    failFastOnClientError: true
  });
}

export async function updateMyAtelier(id, values, token) {
  return requestJsonAcrossRoots(`/olthem/v1/auth/me/ateliers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { values },
    token,
    failFastOnClientError: true
  });
}

function adminRequest(pathname, options = {}) {
  const token = options.token || getStoredToken();
  return requestJsonAcrossRoots(`/olthem/v1/admin/${pathname}`, {
    ...options,
    token,
    failFastOnClientError: true
  });
}

export async function fetchAdminOverview(token) {
  return adminRequest("overview", { token });
}

export async function fetchAdminUsers(params = {}, token) {
  return adminRequest("users", {
    params,
    token
  });
}

export async function updateAdminUser(id, values, token) {
  return adminRequest(`users/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: values,
    token
  });
}

export async function deleteAdminUser(id, token) {
  return adminRequest(`users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token
  });
}

export async function fetchAdminAteliers(params = {}, token) {
  return adminRequest("ateliers", {
    params,
    token
  });
}

export async function updateAdminAtelier(id, values, token) {
  return adminRequest(`ateliers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { values },
    token
  });
}

export async function deleteAdminAtelier(id, token) {
  return adminRequest(`ateliers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token
  });
}

export async function fetchSearchResults(query, page = 1) {
  const roots = (Array.isArray(config.apiRoots) && config.apiRoots.length)
    ? config.apiRoots
    : [config.apiRoot];

  for (const root of roots) {
    const url = new URL(`${String(root).replace(/\/+$/, "")}/wp/v2/search`);
    url.searchParams.set("search", query);
    url.searchParams.set("per_page", "20");
    url.searchParams.set("page", String(page));
    url.searchParams.set("_embed", "1");

    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) continue;
      const data = await response.json();
      const total = parseInt(response.headers.get("X-WP-Total") || "0", 10);
      const totalPages = parseInt(response.headers.get("X-WP-TotalPages") || "1", 10);
      return { results: Array.isArray(data) ? data : [], total, totalPages };
    } catch {
      continue;
    }
  }
  return { results: [], total: 0, totalPages: 0 };
}

import { config } from "./config.js";

function stripHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent?.trim() || "";
}

function getApiRoots() {
  const roots = Array.isArray(config.apiRoots) && config.apiRoots.length
    ? config.apiRoots
    : [config.apiRoot];

  return [...new Set(roots.filter(Boolean))];
}

async function requestJson(pathname, params = {}) {
  const roots = getApiRoots();
  const failures = [];

  for (const root of roots) {
    const url = new URL(`${root}${pathname}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        failures.push(`${url.origin} -> HTTP ${response.status}`);
        continue;
      }

      return response.json();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Network error";
      failures.push(`${url.origin} -> ${reason}`);
    }
  }

  throw new Error(
    `Unable to reach WordPress API. Tried: ${failures.join(" | ") || roots.join(", ")}`
  );
}

export async function fetchThematiques() {
  const items = await requestJson("/wp/v2/thematiques", {
    per_page: 100,
    orderby: "menu_order",
    order: "asc"
  });

  return items.map(item => ({
    id:                  item.id,
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
    builder:             Array.isArray(item.builder) ? item.builder : []
  }));
}

export async function fetchLatestPosts() {
  const posts = await requestJson("/wp/v2/posts", {
    per_page: config.postsPerPage,
    _embed: 1
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

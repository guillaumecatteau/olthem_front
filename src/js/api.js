import { config } from "./config.js";

function stripHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent?.trim() || "";
}

export async function fetchThematiques() {
  const url = new URL(`${config.apiRoot}/wp/v2/thematiques`);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("orderby", "menu_order");
  url.searchParams.set("order", "asc");

  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const items = await response.json();

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
  const url = new URL(`${config.apiRoot}/wp/v2/posts`);
  url.searchParams.set("per_page", String(config.postsPerPage));
  url.searchParams.set("_embed", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const posts = await response.json();

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

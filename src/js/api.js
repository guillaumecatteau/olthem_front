import { config } from "./config.js";
import { requestJsonAcrossRoots } from "./rest-client.js";

function stripHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent?.trim() || "";
}

export async function fetchThematiques() {
  const items = await requestJsonAcrossRoots("/wp/v2/thematiques", {
    params: {
      per_page: 100,
      orderby: "menu_order",
      order: "asc"
    }
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
    exactTitle = null
  } = options;

  if (id) {
    const item = await requestJsonAcrossRoots(`/wp/v2/pages/${id}`);

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

  const params = { per_page: 20 };
  if (slug) params.slug = slug;
  if (search) params.search = search;

  const items = await requestJsonAcrossRoots("/wp/v2/pages", { params });

  const norm = (value) => stripHtml(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const target = exactTitle ? norm(exactTitle) : null;
  const match = target
    ? items.find((item) => norm(item.title?.rendered) === target)
    : items[0];

  if (!match) return null;

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

export async function fetchOptions() {
  try {
    const data = await requestJsonAcrossRoots("/wp/v2/options");
    return {
      facebook_url: data.facebook_url || "https://www.facebook.com/Mundaneum.officiel/",
      X_url: data.X_url || "https://x.com/mundaneumasbl?lang=fr",
      instagram_url: data.instagram_url || "https://www.instagram.com/mundaneumasbl/?hl=fr"
    };
  } catch (error) {
    console.warn("Impossible de charger les informations générales", error);
    return {
      facebook_url: "https://www.facebook.com/Mundaneum.officiel/",
      X_url: "https://x.com/mundaneumasbl?lang=fr",
      instagram_url: "https://www.instagram.com/mundaneumasbl/?hl=fr"
    };
  }
}

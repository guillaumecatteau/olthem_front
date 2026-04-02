import { fetchPage, fetchSections, fetchOptions } from "./api.js";

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function plainText(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  return template.content.textContent?.trim() || "";
}

function normKey(raw) {
  return String(raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function arrowSpan(dir) {
  return `<span class="thm-arrow thm-arrow--${dir}" aria-hidden="true"></span>`;
}

function pickField(obj, names) {
  if (!obj) return undefined;

  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== "") {
      return obj[name];
    }
  }

  const keys = new Map();
  Object.keys(obj).forEach((key) => {
    const nk = normKey(key);
    if (nk && !keys.has(nk)) keys.set(nk, key);
  });

  for (const name of names) {
    const match = keys.get(normKey(name));
    if (!match) continue;
    const value = obj[match];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function num(raw, fallback = 1) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function imageUrl(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return raw.url ?? raw.sizes?.large ?? raw.sizes?.medium_large ?? raw.sizes?.medium ?? raw.src ?? null;
  }
  return null;
}

function linkHref(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return raw.url ?? raw.link ?? raw.permalink ?? raw.href ?? raw.guid?.rendered ?? null;
  }
  return null;
}

function linkTarget(raw) {
  if (!raw || typeof raw !== "object") return null;
  return typeof raw.target === "string" && raw.target ? raw.target : null;
}

function getRowLayouts(row) {
  const sub = pickField(row, ["subsection", "subSection", "SubSection", "layouts", "layout"]);
  if (Array.isArray(sub)) return sub;

  if (row && typeof row === "object" && row.acf_fc_layout) {
    return [row];
  }

  return [];
}

function flattenLayouts(builder) {
  if (!Array.isArray(builder)) return [];
  return builder.flatMap((row) => getRowLayouts(row));
}

const pageOverlayCache = new Map();
let pageOverlayPreviousUrl = null;
let pageOverlayPreviousState = null;
const SCROLL_SECTIONS = new Set([
  "accueil",
  "initiative",
  "thematiques",
  "ressources",
  "ateliers",
  "partenaires"
]);

function pageOverlayCacheKey(options) {
  return JSON.stringify({
    id: options.id ?? null,
    slug: options.slug ?? null,
    search: options.search ?? null,
    exactTitle: options.exactTitle ?? null
  });
}

function slugify(value) {
  return plainText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sectionSlugFromWpUrl(rawHref) {
  if (!rawHref) return null;

  try {
    const url = new URL(String(rawHref), window.location.origin);
    const match = url.pathname.match(/\/sections\/([^/]+)\/?$/i);
    if (!match?.[1]) return null;

    const slug = slugify(match[1]);
    return SCROLL_SECTIONS.has(slug) ? slug : null;
  } catch {
    return null;
  }
}

function parsePageOverlayDescriptor(raw) {
  const descriptor = {
    id: null,
    slug: null,
    search: null,
    exactTitle: null,
    backLabel: null
  };

  String(raw ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separatorIndex = part.indexOf(":");
      if (separatorIndex === -1) return;

      const key = part.slice(0, separatorIndex).trim().toLowerCase();
      const value = part.slice(separatorIndex + 1).trim();
      if (!value) return;

      if (key === "id") descriptor.id = Number(value);
      if (key === "slug") descriptor.slug = value;
      if (key === "search") descriptor.search = value;
      if (key === "title") descriptor.exactTitle = value;
      if (key === "back") descriptor.backLabel = value;
    });

  return descriptor;
}

function overlayUrlForRequest(request) {
  const token = request.slug
    || request.exactTitle
    || request.search
    || (request.id ? String(request.id) : "page");
  const hash = `#overlay/${slugify(token) || "page"}`;
  return `${window.location.pathname}${window.location.search}${hash}`;
}

function syncPageOverlayUrl(request) {
  pageOverlayPreviousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  pageOverlayPreviousState = history.state ? { ...history.state } : null;

  history.replaceState(
    {
      ...(history.state ?? {}),
      pageOverlay: request
    },
    "",
    overlayUrlForRequest(request)
  );
}

function restorePageOverlayUrl() {
  if (!pageOverlayPreviousUrl) return;

  history.replaceState(pageOverlayPreviousState ?? history.state ?? {}, "", pageOverlayPreviousUrl);
  pageOverlayPreviousUrl = null;
  pageOverlayPreviousState = null;
}

async function getOverlayPage(options) {
  const key = pageOverlayCacheKey(options);
  if (!pageOverlayCache.has(key)) {
    pageOverlayCache.set(key, fetchPage(options));
  }

  return pageOverlayCache.get(key);
}

function renderSectionLayout(layout) {
  const key = normKey(layout?.acf_fc_layout);

  if (key === "title") {
    const title = plainText(pickField(layout, ["title", "Title"]));
    const subtitle = plainText(pickField(layout, ["subtitle", "subTitle", "SubTitle"]));
    if (!title && !subtitle) return "";

    const titleHtml = title
      ? `<div class="section-builder-title__title-wrap">${arrowSpan("right")}<h2 class="section-builder-title__title">${esc(title)}</h2>${arrowSpan("left")}</div>`
      : "";
    const subtitleHtml = subtitle ? `<p class="section-builder-title__subtitle">${esc(subtitle)}</p>` : "";

    return `<div class="section-builder-title">${titleHtml}${subtitleHtml}</div>`;
  }

  if (key === "logosection") {
    const category = plainText(pickField(layout, ["logoCategory", "logocategory", "LogoCategory"]));
    const logoLine = pickField(layout, ["logoLine", "logoline", "LogoLine"]);
    const logos = Array.isArray(logoLine) ? logoLine : [];

    const categoryHtml = category
      ? `<p class="section-builder-logos__category">${esc(category)}</p>`
      : "";

    const logosHtml = logos
      .map((item) => {
        const logo = imageUrl(pickField(item, ["logo", "Logo", "image", "Image"]));
        if (!logo) return "";

        const logoScale = Math.min(1, Math.max(0, num(pickField(item, ["logoScale", "logoscale", "LogoScale"]), 1)));

        return `
          <div class="section-builder-logos__item">
            <img class="section-builder-logos__img" src="${esc(logo)}" alt="" loading="lazy" style="--logo-scale:${logoScale};" />
          </div>`;
      })
      .join("");

    if (!categoryHtml && !logosHtml) return "";

    return `
      <div class="section-builder-logos">
        ${categoryHtml}
        <div class="section-builder-logos__line">${logosHtml}</div>
      </div>`;
  }

  if (key === "cta") {
    const image = imageUrl(pickField(layout, ["image", "Image", "ctaImage", "CTAImage", "visuel", "Visuel"]));
    const title = plainText(pickField(layout, ["title", "Title", "ctaTitle", "CTATitle"]));
    const text = plainText(pickField(layout, ["text", "Text", "description", "Description", "content", "Content"]));
    const linkValue = pickField(layout, ["lien", "Lien", "link", "Link", "ctaLink", "CTALink", "buttonLink", "ButtonLink", "url", "URL", "pageLink", "PageLink"]);
    const href = linkHref(linkValue);
    const target = linkTarget(linkValue);
    const sectionTarget = sectionSlugFromWpUrl(href);

    if (!image && !title && !text && !href) return "";

    const imageHtml = image
      ? `<img class="section-builder-cta__image" src="${esc(image)}" alt="" loading="lazy" />`
      : "";
    const titleHtml = title ? `<h3 class="section-builder-cta__title">${esc(title)}</h3>` : "";
    const textHtml = text ? `<p class="section-builder-cta__text">${esc(text)}</p>` : "";
    const targetAttr = !sectionTarget && target ? ` target="${esc(target)}" rel="noopener noreferrer"` : "";
    const buttonHtml = href
      ? `<a class="buttonRound section-builder-cta__button" href="${sectionTarget ? `#${esc(sectionTarget)}` : esc(href)}"${sectionTarget ? ` data-scroll-section="${esc(sectionTarget)}"` : ""}${targetAttr}>En savoir plus...</a>`
      : `<span class="buttonRound section-builder-cta__button">En savoir plus...</span>`;

    return `
      <section class="section-builder-cta">
        <div class="section-builder-cta__inner">
          <div class="section-builder-cta__content">
            <div class="section-builder-cta__media">${imageHtml}</div>
            <div class="section-builder-cta__copy">${titleHtml}${textHtml}</div>
          </div>
          <div class="section-builder-cta__action">${buttonHtml}</div>
        </div>
      </section>`;
  }

  return "";
}

function bindSectionScrollLinks() {
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element
      ? event.target.closest("a[data-scroll-section]")
      : null;

    if (!link) return;

    const section = link.getAttribute("data-scroll-section");
    if (!section || !SCROLL_SECTIONS.has(section)) return;

    event.preventDefault();
    window.dispatchEvent(new CustomEvent("scroll:goto", {
      detail: { section, animate: true }
    }));
  });
}

async function hydrateMainSections() {
  const sections = await fetchSections();

  sections.forEach((section) => {
    if (!section?.slug) return;

    let host = document.querySelector(`.full-section[data-slug=\"${section.slug}\"] .section-inner`);

    if (!host && section.slug === "accueil") {
      const accueil = document.getElementById("accueil");
      if (accueil) {
        host = accueil.querySelector(".section-builder-slot--accueil");
        if (!host) {
          host = document.createElement("div");
          host.className = "section-builder-slot section-builder-slot--accueil";
          accueil.append(host);
        }
      }
    }

    if (!host && section.slug === "thematiques") {
      const wrapper = document.querySelector("#thematiques .thm-carousel-wrapper");
      if (wrapper) {
        host = wrapper.querySelector(".section-builder-slot");
        if (!host) {
          host = document.createElement("div");
          host.className = "section-builder-slot";
          wrapper.prepend(host);
        }
      }
    }

    if (!host) return;

    const html = flattenLayouts(section.builder).map(renderSectionLayout).join("");
    if (html) host.innerHTML = `<div class="section-builder-stack">${html}</div>`;
  });
}

function setPageOverlayContent(page, fallbackTitle = "Page") {
  const content = document.getElementById("page-overlay-content");
  if (!content) return;

  if (!page) {
    content.innerHTML = `
      <h1 class="page-overlay__title">${esc(fallbackTitle)}</h1>
      <p>Le contenu de la page n'a pas pu être chargé.</p>`;
    return;
  }

  content.innerHTML = `
    <h1 class="page-overlay__title">${esc(page.title || fallbackTitle)}</h1>
    <div class="page-overlay__body">${page.content || ""}</div>`;
}

function setPageOverlayLoading(fallbackTitle = "Chargement") {
  const content = document.getElementById("page-overlay-content");
  if (!content) return;

  content.innerHTML = `
    <h1 class="page-overlay__title">${esc(fallbackTitle)}</h1>
    <p>Chargement en cours...</p>`;
}

function pageOverlayRequestFromTrigger(trigger) {
  const descriptor = parsePageOverlayDescriptor(trigger.dataset.pageOverlay);

  return {
    id: descriptor.id ?? (trigger.dataset.pageId ? Number(trigger.dataset.pageId) : null),
    slug: descriptor.slug || trigger.dataset.pageSlug || null,
    search: descriptor.search || trigger.dataset.pageSearch || null,
    exactTitle: descriptor.exactTitle || trigger.dataset.pageTitle || null,
    backLabel: descriptor.backLabel || trigger.dataset.overlayBackLabel || null
  };
}

function openPageOverlay(trigger) {
  const overlay = document.getElementById("page-overlay");
  const closeLabel = document.getElementById("page-overlay-close-label");
  if (!overlay) return;

  const request = pageOverlayRequestFromTrigger(trigger);
  const fallbackTitle = request.exactTitle || trigger.textContent?.trim() || "Page";
  const backLabel = request.backLabel || "Retour au site";

  if (closeLabel) {
    closeLabel.textContent = backLabel;
  }

  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  setPageOverlayLoading(fallbackTitle);
  syncPageOverlayUrl(request);

  getOverlayPage(request)
    .then((page) => setPageOverlayContent(page, fallbackTitle))
    .catch(() => setPageOverlayContent(null, fallbackTitle));
}

function closePageOverlay() {
  const overlay = document.getElementById("page-overlay");
  if (!overlay) return;

  overlay.classList.remove("is-visible");
  overlay.setAttribute("aria-hidden", "true");
  restorePageOverlayUrl();
}

function bindPageOverlay() {
  const closeButton = document.getElementById("page-overlay-close");
  const overlay = document.getElementById("page-overlay");

  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest("[data-page-overlay]")
      : null;

    if (!trigger) return;

    event.preventDefault();
    openPageOverlay(trigger);
  });

  closeButton?.addEventListener("click", () => {
    closePageOverlay();
  });

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closePageOverlay();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay?.classList.contains("is-visible")) {
      closePageOverlay();
    }
  });
}

window.__closePageOverlay = closePageOverlay;

async function hydrateSocialLinks() {
  const container = document.getElementById("social-links");
  if (!container) return;

  try {
    const options = await fetchOptions();
    if (!options) return;

    const links = [];
    const iconBasePath = "./assets/images/icons";

    if (options.facebook_url) {
      const href = esc(options.facebook_url);
      links.push(`<p><a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${iconBasePath}/icon_facebook.svg" alt="Facebook" loading="lazy" /></a></p>`);
    }

    if (options.X_url) {
      const href = esc(options.X_url);
      links.push(`<p><a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${iconBasePath}/icons_X.svg" alt="X" loading="lazy" /></a></p>`);
    }

    if (options.instagram_url) {
      const href = esc(options.instagram_url);
      links.push(`<p><a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${iconBasePath}/icon_instagram.svg" alt="Instagram" loading="lazy" /></a></p>`);
    }

    if (links.length > 0) {
      container.innerHTML = links.join("");
    }
  } catch (error) {
    console.warn("Erreur lors du chargement des liens sociaux", error);
  }
}

function setCurrentYear() {
  const yearNode = document.getElementById("current-year");

  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }
}

setCurrentYear();
hydrateMainSections().catch(() => {});
hydrateSocialLinks().catch(() => {});
bindPageOverlay();
bindSectionScrollLinks();

import { esc, plainText, normKey, slugify } from "./utils.js";
import {
  arrowSpan,
  pickField,
  num,
  imageUrl,
  linkHref,
  linkTarget,
  boolValue,
  buildPageOverlayDescriptor,
  titleLogoUrl
} from "./acf-helpers.js";
import { renderFormBuilderLayout } from './form-builder.js';

let _sectionsPromise = Promise.resolve([]);
export function setSectionsPromise(p) { _sectionsPromise = p; }

const SCROLL_SECTIONS = new Set([
  "accueil",
  "initiative",
  "thematiques",
  "ressources",
  "ateliers",
  "partenaires"
]);


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

function getRowLayouts(row) {
  const sub = pickField(row, ["subsection", "subSection", "SubSection", "layouts", "layout"]);
  if (Array.isArray(sub)) return sub;

  if (row && typeof row === "object" && row.acf_fc_layout) {
    return [row];
  }

  return [];
}

function isSubsectionRow(row) {
  return normKey(row?.acf_fc_layout) === "subsection"
    || Array.isArray(pickField(row, ["subsection", "subSection", "SubSection"]));
}

function parseSectionSubsections(builder) {
  if (!Array.isArray(builder)) return [];

  return builder
    .filter((row) => isSubsectionRow(row))
    .map((row, index) => {
      const layouts = getRowLayouts(row);
      const titleLayout = layouts.find((layout) => normKey(layout?.acf_fc_layout) === "subsectiontitle");
      const contentLayouts = layouts.filter((layout) => normKey(layout?.acf_fc_layout) !== "subsectiontitle");

      const title = plainText(pickField(titleLayout, ["title", "Title"]));
      const subtitle = plainText(pickField(titleLayout, ["subtitle", "subTitle", "SubTitle"]));
      const showTitle = boolValue(pickField(titleLayout, ["displaytitle", "displaytile", "displayTitle", "displayTile"]));
      const showSubtitle = boolValue(pickField(titleLayout, ["displaysubtitle", "displaySubtitle"]));
      const showLogo = boolValue(pickField(titleLayout, ["logo", "Logo"]));
      const logoRaw = pickField(titleLayout, ["title logo", "title_logo", "titleLogo", "TitleLogo", "titlelogo", "Title Logo"]);
      const titleLogo = showLogo ? titleLogoUrl(logoRaw) : null;

      const rowLabel = title || subtitle || `Sous-section ${index + 1}`;

      return {
        title: rowLabel,
        subtitle,
        showTitle,
        showSubtitle,
        titleLogo,
        layouts: contentLayouts
      };
    })
    .filter((sub) => sub.layouts.length > 0);
}

function parseDoubleSectionConfig(builder) {
  if (!Array.isArray(builder)) return { enabled: false, dominant: "left" };

  const doubleLayout = builder.find((row) => {
    const key = normKey(row?.acf_fc_layout);
    return key === "doublesection" || key === "double";
  });

  if (!doubleLayout) return { enabled: false, dominant: "left" };

  const orientationRaw = plainText(pickField(doubleLayout, ["orientation", "Orientation", "dominant", "Dominant"]));
  const orientationKey = normKey(orientationRaw);
  const dominant = /right|droite|second|deux|2/.test(orientationKey) ? "right" : "left";

  return { enabled: true, dominant };
}

function extractIframeSrc(raw) {
  if (!raw) return null;

  const tmp = document.createElement("div");
  tmp.innerHTML = String(raw);
  const text = (tmp.querySelector("a")?.href ?? tmp.textContent ?? "").trim();
  const cleaned = text.replace(/^(?:https?:\/\/)?src=["'’]?/i, "").replace(/["'’]$/, "");

  if (!cleaned) return null;
  if (cleaned.startsWith("//")) return cleaned;
  if (cleaned.startsWith("http")) return cleaned;
  return null;
}

function youtubeId(raw) {
  if (!raw) return null;
  const content = String(raw);
  const match = content.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&\s"']{11})/);
  return match ? match[1] : null;
}

function flattenLayouts(builder) {
  if (!Array.isArray(builder)) return [];
  return builder.flatMap((row) => getRowLayouts(row));
}

function renderSectionLayout(layout) {
  const key = normKey(layout?.acf_fc_layout);

  if (key === "innertitle") {
    const text = plainText(pickField(layout, ["innertitle", "innerTitle", "inner_title", "title", "Title"]));
    if (!text) return "";

    return `
      <div class="section-builder-inner-title">
        <div class="section-builder-inner-title__wrap">
          ${arrowSpan("right")}
          <h3 class="section-builder-inner-title__text">${esc(text)}</h3>
          ${arrowSpan("left")}
        </div>
      </div>`;
  }

  if (key === "title") {
    const title = plainText(pickField(layout, ["title", "Title"]));
    const subtitle = plainText(pickField(layout, ["subtitle", "subTitle", "SubTitle"]));
    const showLogo = boolValue(pickField(layout, ["logo", "Logo"]));
    const logoRaw = pickField(layout, ["title logo", "title_logo", "titleLogo", "TitleLogo", "Title Logo"]);
    const logo = showLogo ? titleLogoUrl(logoRaw) : null;
    if (!title && !subtitle) return "";

    const logoHtml = logo
      ? `<div class="section-builder-title__logo-wrap"><img class="section-builder-title__title-logo" src="${esc(logo)}" alt="" loading="lazy" aria-hidden="true" /></div>`
      : "";
    const titleHtml = title
      ? `<div class="section-builder-title__title-wrap">${arrowSpan("right")}<h2 class="section-builder-title__title">${esc(title)}</h2>${arrowSpan("left")}</div>`
      : "";
    const subtitleHtml = subtitle ? `<p class="section-builder-title__subtitle">${esc(subtitle)}</p>` : "";

    return `<div class="section-builder-title">${logoHtml}${titleHtml}${subtitleHtml}</div>`;
  }

  if (key === "buttonoverlay") {
    const label = plainText(pickField(layout, ["button_label", "buttonLabel", "label", "Label", "title", "Title"])) || "Ouvrir";
    const request = buildPageOverlayDescriptor(layout, { forceOverlayTotal: true });
    const fallbackSearch = plainText(pickField(layout, ["search", "Search", "page_search", "pageSearch"])) || label;
    const descriptor = request.isValid
      ? request.descriptor
      : `search:${fallbackSearch}|back:Retour au site|overlay:overlayTotal`;

    return `
      <div class="layout-button-overlay">
        <button
          class="buttonRound layout-button-overlay__action"
          type="button"
          data-page-overlay="${esc(descriptor)}"
          aria-label="${esc(label)}"
        >${esc(label)}</button>
      </div>`;
  }

  if (key === "formbuilder") {
    return renderFormBuilderLayout(layout);
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

  if (key === "textbloc") {
    const html = String(layout.text ?? "");
    if (!html) return "";
    const cls = layout.persotext ? "layout-text layout-text--perso" : "layout-text";
    return `<div class="${cls}">${html}</div>`;
  }

  if (key === "simpletext") {
    const html = String(pickField(layout, ["text_bloc", "textBloc", "textbloc", "simple_text", "simpleText", "simpletext", "text", "Text", "content", "Content"]) || "");
    if (!plainText(html)) return "";
    return `<div class="page-overlay__body page-overlay__body--simpletext">${html}</div>`;
  }

  if (key === "paragraphetitle") {
    const name = plainText(pickField(layout, ["paragraphename", "paragrapheName", "paragraphName"]));
    return name ? `<div class="layout-paragraph-title">${esc(name)}</div>` : "";
  }

  if (key === "videosolo") {
    const ytId = youtubeId(layout.videolink);
    const embed = ytId
      ? `
        <div class="layout-video__wrapper">
          <div class="layout-video__facade" data-yt-id="${esc(ytId)}">
            <img
              class="layout-video__thumb"
              data-yt-id="${esc(ytId)}"
              src="https://img.youtube.com/vi/${esc(ytId)}/sddefault.jpg"
              alt=""
              loading="lazy"
            />
            <button class="layout-video__play" type="button" aria-label="Lire la vidéo"></button>
          </div>
        </div>`
      : "";
    const title = layout.displayvideotitle && layout.videotitle
      ? `<p class="layout-video__heading">${esc(layout.videotitle)}</p>`
      : "";
    const text = layout.displayvideotext && layout.videotext
      ? `<p class="layout-video__text">${esc(layout.videotext)}</p>`
      : "";

    return `<div class="layout-video">${title}${embed}${text}</div>`;
  }

  if (key === "imagegallerie") {
    const gallery = pickField(layout, ["gallerie", "galerie", "Gallerie", "Galerie"]);
    const items = Array.isArray(gallery) ? gallery : [];
    const shouldBalanceCanvas = items.length > 1 && (items.length % 2 === 1);
    const canvasClass = shouldBalanceCanvas ? " img-gallerie-canvas--balanced" : "";
    const imagesHtml = items
      .map((item, idx) => {
        const url = imageUrl(item);
        if (!url) return "";
        return `<div class="img-gallerie-canvas__item${idx === 0 ? " img-gallerie-canvas__item--featured" : ""}" data-idx="${idx}"><img src="${esc(url)}" alt="Image ${idx + 1}" loading="lazy" /></div>`;
      })
      .join("");

    if (!imagesHtml) return "";

    return `
      <div class="layout-image-gallerie layout-image-gallerie--canvas">
        <div class="img-gallerie-canvas${canvasClass}">${imagesHtml}</div>
      </div>`;
  }

  if (key === "audiofile") {
    if (!layout.audiofile) return "";
    const title = layout.audiotitle ? `<p class="layout-audio__title">${esc(layout.audiotitle)}</p>` : "";
    return `
      <div class="layout-audio">
        ${title}
        <audio class="layout-audio__player" controls preload="metadata">
          <source src="${esc(layout.audiofile)}" type="audio/mpeg">
        </audio>
      </div>`;
  }

  if (key === "iframe") {
    const src = extractIframeSrc(layout.iframe);
    if (!src) return "";
    return `
      <div class="layout-iframe">
        <div class="layout-iframe__wrapper">
          <iframe src="${esc(src)}" allowfullscreen scrolling="no" loading="lazy"></iframe>
        </div>
      </div>`;
  }

  return "";
}

function renderSectionSubsections(host, subsections, options = {}) {
  if (!host || !Array.isArray(subsections) || !subsections.length) return;

  host.classList.add("section-inner--subsections");

  const isDoubleSection = !!options.doubleSection && subsections.length >= 2;

  const titleBlockHtml = (subsection) => {
    const showTitle = subsection.showTitle !== false;
    const titleText = subsection.title || "";
    if (!showTitle || !titleText) return "";

    const logoHtml = subsection.titleLogo
      ? `<div class="section-subsections__title-logo-wrap"><img class="section-subsections__title-logo" src="${esc(subsection.titleLogo)}" alt="" loading="lazy" aria-hidden="true" /></div>`
      : "";

    return `<div class="section-subsections__title-block">${logoHtml}<div class="section-subsections__title-wrap">${arrowSpan("right")}<h2 class="section-subsections__title">${esc(titleText)}</h2>${arrowSpan("left")}</div>${subsection.showSubtitle && subsection.subtitle ? `<p class="section-subsections__subtitle">${esc(subsection.subtitle)}</p>` : ""}</div>`;
  };

  const normalizeSubsectionSpacing = (container) => {
    container.querySelectorAll(".layout-paragraph-title, .section-builder-inner-title").forEach((el) => {
      if (el.previousElementSibling) {
        el.previousElementSibling.style.marginBottom = "0";
      }
    });
  };

  if (isDoubleSection) {
    const dominantSide = options.dominantSide === "right" ? "right" : "left";
    const [leftSub, rightSub] = subsections;

    host.innerHTML = `
      <div class="section-subsections section-subsections--double">
        <div class="section-subsections__content js-section-subsections-scroll">
          <div class="section-subsections-double section-subsections-double--dominant-${dominantSide}">
            <article class="section-subsections-double__panel section-subsections-double__panel--left">
              ${titleBlockHtml(leftSub)}
              ${leftSub.layouts.map(renderSectionLayout).join("")}
            </article>
            <article class="section-subsections-double__panel section-subsections-double__panel--right">
              ${titleBlockHtml(rightSub)}
              ${rightSub.layouts.map(renderSectionLayout).join("")}
            </article>
          </div>
        </div>
      </div>`;

    const content = host.querySelector(".section-subsections__content");
    if (content) {
      normalizeSubsectionSpacing(content);
    }

    window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));
    return;
  }

  const hasNav = subsections.length > 1;
  const navHtml = hasNav
    ? `<nav class="section-subsections__nav" aria-label="Sous-sections">${subsections.map((sub, idx) => `<button class="section-subsections__item${idx === 0 ? " is-active" : ""}" type="button" data-subsection-index="${idx}">${esc(sub.title)}</button>`).join("")}</nav>`
    : "";

  host.innerHTML = `
    <div class="section-subsections${hasNav ? " has-nav" : ""}">
      ${navHtml}
      <div class="section-subsections__content js-section-subsections-scroll"></div>
    </div>`;

  const content = host.querySelector(".section-subsections__content");
  const buttons = host.querySelectorAll(".section-subsections__item");

  const renderSubsectionAt = (index) => {
    const current = subsections[index];
    if (!content || !current) return;

    const titleHtml = titleBlockHtml(current);
    content.innerHTML = titleHtml + current.layouts.map(renderSectionLayout).join("");

    normalizeSubsectionSpacing(content);

    window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.subsectionIndex ?? 0);
      buttons.forEach((btn) => btn.classList.remove("is-active"));
      button.classList.add("is-active");
      renderSubsectionAt(index);
    });
  });

  renderSubsectionAt(0);
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
  const sections = await _sectionsPromise;

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

    const sectionSubsections = parseSectionSubsections(section.builder);
    const doubleSectionConfig = parseDoubleSectionConfig(section.builder);

    if (sectionSubsections.length > 0) {
      renderSectionSubsections(host, sectionSubsections, {
        doubleSection: doubleSectionConfig.enabled,
        dominantSide: doubleSectionConfig.dominant
      });
      return;
    }

    const html = flattenLayouts(section.builder).map(renderSectionLayout).join("");
    if (html) host.innerHTML = `<div class="section-builder-stack">${html}</div>`;
  });
}

export {
  SCROLL_SECTIONS,
  sectionSlugFromWpUrl,
  getRowLayouts,
  isSubsectionRow,
  flattenLayouts,
  extractIframeSrc,
  youtubeId,
  parseSectionSubsections,
  parseDoubleSectionConfig,
  renderSectionLayout,
  renderSectionSubsections,
  bindSectionScrollLinks,
  hydrateMainSections
};

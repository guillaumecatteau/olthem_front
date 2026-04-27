import { esc, plainText, normKey, slugify } from './utils.js';
import { fetchPage, fetchOptions, fetchMyAteliers, searchLocalContent } from './api.js';
import { lockMainScroll, unlockMainScroll } from './scroll-lock.js';
import { getStoredToken, getStoredUser, persistAuthSession } from './auth.js';
import { bindAdminToolOverlay, isAdminToolRequest } from './admin-tool.js?v=20260422-06';
import { arrowSpan, pickField, boolValue, titleLogoUrl, buildPageOverlayDescriptor } from './acf-helpers.js';
import {
  sectionSlugFromWpUrl, SCROLL_SECTIONS, flattenLayouts, renderSectionLayout
} from './section-builder.js';
import { renderFormBuilderLayout, bindFormBuilderSubmissions } from './form-builder.js';

// Injected by main.js to avoid circular dependencies
let _thematiquesPromise = Promise.resolve([]);
let _sectionsPromise = Promise.resolve([]);
export function setPageOverlayDependencies(deps) {
  if (deps.thematiquesPromise) _thematiquesPromise = deps.thematiquesPromise;
  if (deps.sectionsPromise) _sectionsPromise = deps.sectionsPromise;
}

const pageOverlayCache = new Map();
let pageOverlayPreviousUrl = null;
let pageOverlayPreviousState = null;
let pageOverlayCurrentRequest = null;
let pageOverlayBackLabel = "Retour au site";
let atelierEditContext = null; // set before opening creation overlay in edit mode
let searchOverlayCurrentQuery = "";
let _searchFormBuilderHtml = null; // null = not fetched yet, false = unavailable
let _searchHeadingHtml = null;     // null = not fetched yet, false = unavailable
let pageOverlayLastRegisteredUsername = "";
let pageOverlayLastAlertMessage = "";

function pageOverlayCacheKey(options) {
  return JSON.stringify({
    id: options.id ?? null,
    slug: options.slug ?? null,
    search: options.search ?? null,
    exactTitle: options.exactTitle ?? null
  });
}

function parsePageOverlayDescriptor(raw) {
  const descriptor = {
    id: null,
    slug: null,
    search: null,
    exactTitle: null,
    backLabel: null,
    logo: null,
    overlayMode: null
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
      if (key === "logo") descriptor.logo = value;
      if (key === "overlay" || key === "mode" || key === "type") descriptor.overlayMode = value;
    });

  return descriptor;
}

function defaultOverlayLogo(request) {
  const slug = slugify(request?.slug || "");
  const title = slugify(request?.exactTitle || "");
  const search = slugify(request?.search || "");

  if (
    slug === "inscription"
    || title === "inscription"
    || search === "inscription"
    || slug === "inscription-reussie"
    || title === "inscription-reussie"
    || search === "inscription-reussie"
    || slug === "inscriptionreussie"
    || title === "inscriptionreussie"
    || search === "inscriptionreussie"
  ) {
    return titleLogoUrl("icon_InfoHead_white");
  }

  return null;
}

function isOverlayTotalRequest(request = {}) {
  const explicitMode = String(request.overlayMode || "").trim().toLowerCase();
  if (explicitMode === "overlaytotal") return true;

  const slug = slugify(request.slug || "");
  const title = slugify(request.exactTitle || "");
  const search = slugify(request.search || "");
  return slug === "inscription"
    || title === "inscription"
    || search === "inscription"
    || slug === "inscription-reussie"
    || title === "inscription-reussie"
    || search === "inscription-reussie"
    || slug === "inscriptionreussie"
    || title === "inscriptionreussie"
    || search === "inscriptionreussie";
}

function applyPageOverlayMode(request) {
  const overlay = document.getElementById("page-overlay");
  if (!overlay) return;

  const isFullscreen = isOverlayTotalRequest(request);
  overlay.classList.toggle("page-overlay--fullscreen", isFullscreen);
  // is-main-overlay-open is now managed by lockMainScroll / unlockMainScroll (scroll-lock.js)
}

function overlayUsernameFromRequest(request = {}) {
  if (request && typeof request.username === "string" && request.username.trim()) {
    return request.username.trim();
  }
  return pageOverlayLastRegisteredUsername || "";
}

function overlayAlertFromRequest(request = {}) {
  if (request && typeof request.alert === "string" && request.alert.trim()) {
    return request.alert.trim();
  }
  return pageOverlayLastAlertMessage || "";
}

// Find index of first ':' in a string that is NOT inside an HTML tag.
function applyOverlayDynamicTokens(rawHtml, request = {}) {
  let html = String(rawHtml ?? "");
  const username = overlayUsernameFromRequest(request);
  const alert = overlayAlertFromRequest(request);
  const atelier = (request && typeof request.atelierData === "object" && request.atelierData) ? request.atelierData : null;

  const bold = (v) => `<strong class="page-overlay__token-value">${esc(String(v ?? ""))}</strong>`;

  const apostrophe = "(?:'|\u2019|&#39;|&#x27;|&apos;|&rsquo;|&#8217;)";
  const space = "(?:\\s|&nbsp;|\\u00A0)+";
  const brandPattern = new RegExp(
    `on${space}n${apostrophe}a${space}que${space}l${apostrophe}info${space}qu${apostrophe}on${space}se${space}donne`,
    "gi"
  );

  if (username) {
    html = html.replace(/\[USERNAME\]/g, bold(username));
  }

  if (alert) {
    html = html.replace(/\[ALERT\]/g, `<strong class="page-overlay__token-alert">${esc(alert)}</strong>`);
  }

  if (atelier) {
    const tokenRe = (name) =>
      new RegExp(`\\[(?:<[^>]+>)*${name}(?:<\/[a-z0-9]+>)*\\]`, "gi");

    html = html.replace(tokenRe("USERNAME"), bold(atelier.username || username));
    html = html.replace(tokenRe("prenom"), bold(atelier.prenom));
    html = html.replace(tokenRe("nom"), bold(atelier.nom));
    html = html.replace(tokenRe("start_date"), bold(atelier.start_date));
    html = html.replace(tokenRe("end_date"), bold(atelier.end_date));
    html = html.replace(tokenRe("nb_participants"), bold(atelier.nb_participants));
    html = html.replace(tokenRe("email"), bold(atelier.email));
    html = html.replace(tokenRe("telephone"), bold(atelier.telephone));
    html = html.replace(tokenRe("etablissement"), bold(atelier.etablissement));
    html = html.replace(tokenRe("adresse"), bold(atelier.adresse));
    html = html.replace(tokenRe("code_postal"), bold(atelier.code_postal));
    html = html.replace(tokenRe("localite"), bold(atelier.localite));
    html = html.replace(tokenRe("THEMATIQUE"), bold(atelier.thematique));
    html = html.replace(tokenRe("displayEvent"), bold(atelier.displayEvent));
    html = html.replace(tokenRe("displayContact"), bold(atelier.displayContact));

    html = html.replace(tokenRe("LIEU"), () => {
      if (atelier.mundaneum) return bold("MUNDANEUM, Rue de Nimy, 76 - 7000 Mons");
      const line = [
        atelier.etablissement,
        [atelier.adresse, [atelier.code_postal, atelier.localite].filter(Boolean).join(" ")].filter(Boolean).join(" \u2013 ")
      ].filter(Boolean).join(", ");
      return bold(line);
    });

    // §...§ delimiters -> white span
    html = html.replace(/\u00a7([^\u00a7]+?)\u00a7/g, (m, inner) =>
      `<span class="page-overlay__line-value">${inner}</span>`
    );
  }

  html = html.replace(brandPattern, (match) => {
    return `<strong class="page-overlay__token-brand">${match}</strong>`;
  });

  return html;
}

function pageOverlayInlineCloseHtml(label = "Retour au site", options = {}) {
  const attrs = [];
  if (options.openRequest && typeof options.openRequest === "object") {
    const openRequest = options.openRequest;
    if (openRequest.slug) attrs.push(`data-overlay-open-slug="${esc(openRequest.slug)}"`);
    if (openRequest.search) attrs.push(`data-overlay-open-search="${esc(openRequest.search)}"`);
    if (openRequest.exactTitle) attrs.push(`data-overlay-open-title="${esc(openRequest.exactTitle)}"`);
    if (openRequest.overlayMode) attrs.push(`data-overlay-open-mode="${esc(openRequest.overlayMode)}"`);
    if (openRequest.backLabel) attrs.push(`data-overlay-open-back="${esc(openRequest.backLabel)}"`);
    if (openRequest.logo) attrs.push(`data-overlay-open-logo="${esc(openRequest.logo)}"`);
  }

  const extraAttrs = attrs.length ? ` ${attrs.join(" ")}` : "";
  return `
    <button class="icon-link page-overlay__retour-inline" type="button" aria-label="${esc(label)}"${extraAttrs}>
      <img class="icon-link__icon" src="./assets/images/icons/icon_Retour.svg" alt="" aria-hidden="true" />
      <span class="icon-link__label">${esc(label)}</span>
    </button>`;
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

  const stateMethod = request.fromSearch ? "pushState" : "replaceState";
  history[stateMethod](
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
    const promise = fetchPage(options);
    pageOverlayCache.set(key, promise);
    // Don't keep null or rejected results in the cache so transient
    // failures (server briefly unreachable) don't get stuck permanently.
    promise.then((page) => {
      if (!page) pageOverlayCache.delete(key);
    }).catch(() => {
      pageOverlayCache.delete(key);
    });
  }

  return pageOverlayCache.get(key);
}

async function setPageOverlayContent(page, fallbackTitle = "", fallbackLogo = null, { preloadedAteliers = null } = {}) {
  const content = document.getElementById("page-overlay-content");
  if (!content) return;

  const isAdminOverlay = isAdminToolRequest(page, pageOverlayCurrentRequest || {});
  content.classList.toggle("page-overlay__content--admin-tool", isAdminOverlay);
  content.classList.add("page-overlay__content--hydrating");

  const overlayHeading = (title, logo = null, subtitleHtml = "") => {
    const safeTitle = plainText(title || "");
    if (!safeTitle && !logo) return "";

    const logoHtml = logo
      ? `<div class="section-builder-title__logo-wrap"><img class="section-builder-title__title-logo" src="${esc(logo)}" alt="" loading="lazy" aria-hidden="true" /></div>`
      : "";

    const titleWrapHtml = safeTitle
      ? `<div class="section-builder-title__title-wrap">${arrowSpan("right")}<h1 class="section-builder-title__title">${esc(safeTitle)}</h1>${arrowSpan("left")}</div>`
      : "";

    const subtitleBlock = subtitleHtml
      ? `<p class="section-builder-title__subtitle">${subtitleHtml}</p>`
      : "";

    return `
      <div class="section-builder-title section-builder-title--overlay">
        ${logoHtml}
        ${titleWrapHtml}
        ${subtitleBlock}
      </div>`;
  };

  const overlayTitleFromBuilder = (builder, defaultTitle, defaultLogo = null) => {
    if (!Array.isArray(builder) || builder.length === 0) {
      return { title: defaultTitle, logo: defaultLogo };
    }

    const titleLayout = flattenLayouts(builder).find((layout) => normKey(layout?.acf_fc_layout) === "title");
    if (!titleLayout) {
      return { title: defaultTitle, logo: defaultLogo };
    }

    const title = plainText(pickField(titleLayout, ["title", "Title"])) || defaultTitle;
    const logoFlagRaw = pickField(titleLayout, ["logo", "Logo"]);
    const showLogo = logoFlagRaw === true
      || logoFlagRaw === 1
      || String(logoFlagRaw ?? "").toLowerCase() === "1"
      || String(logoFlagRaw ?? "").toLowerCase() === "true";
    const logoRaw = pickField(titleLayout, ["title logo", "title_logo", "titleLogo", "TitleLogo", "titlelogo", "Title Logo"]);
    const resolvedLogo = titleLogoUrl(logoRaw);

    const subtitle = plainText(pickField(titleLayout, ["subtitle", "Subtitle"])) || "";
    return {
      title,
      subtitle,
      logo: (showLogo || !!resolvedLogo) ? (resolvedLogo || defaultLogo) : defaultLogo
    };
  };

  if (!page) {
    const heading = overlayHeading("", fallbackLogo);
    const inlineOptions = (pageOverlayCurrentRequest || {}).inlineReturnToInscription
      ? {
          openRequest: {
            exactTitle: "Inscription",
            search: "Inscription",
            overlayMode: "overlayTotal",
            backLabel: "Retour au site",
            logo: defaultOverlayLogo({ exactTitle: "Inscription" })
          }
        }
      : (pageOverlayCurrentRequest || {}).inlineReturnToCompte
        ? { openRequest: { search: "compte utilisateur", overlayMode: "overlayTotal", backLabel: "Retour au site" } }
        : {};
    const inlineCloseHtml = isOverlayTotalRequest(pageOverlayCurrentRequest || {})
      ? pageOverlayInlineCloseHtml(pageOverlayBackLabel, inlineOptions)
      : "";
    content.innerHTML = `
      ${heading}
      <p>Le contenu de la page n'a pas pu être chargé.</p>
      ${inlineCloseHtml}`;
    applyPageOverlayMode(pageOverlayCurrentRequest || {});
    content.classList.remove("page-overlay__content--hydrating");
    return;
  }

  const headingData = overlayTitleFromBuilder(page.builder, fallbackTitle, fallbackLogo);
  const subtitleHtml = (() => {
    if (!headingData.subtitle) return "";
    const subtitleUser = getStoredUser();
    return headingData.subtitle.replace(/\[USERNAME\]/g, subtitleUser?.username
      ? `<strong class="page-overlay__token-value">${esc(String(subtitleUser.username))}</strong>`
      : "");
  })();
  const heading = overlayHeading(headingData.title, headingData.logo, subtitleHtml);
  const builderHtml = applyOverlayDynamicTokens(flattenLayouts(page.builder)
    .filter((layout) => normKey(layout?.acf_fc_layout) !== "title")
    .map(renderSectionLayout)
    .join(""), pageOverlayCurrentRequest || {});
  const builderSection = builderHtml
    ? `<div class="section-builder-stack section-builder-stack--overlay">${builderHtml}</div>`
    : "";
  const inlineOptions = (pageOverlayCurrentRequest || {}).inlineReturnToInscription
    ? {
        openRequest: {
          exactTitle: "Inscription",
          search: "Inscription",
          overlayMode: "overlayTotal",
          backLabel: "Retour au site",
          logo: defaultOverlayLogo({ exactTitle: "Inscription" })
        }
      }
    : (pageOverlayCurrentRequest || {}).inlineReturnToCompte
      ? { openRequest: { search: "compte utilisateur", overlayMode: "overlayTotal", backLabel: "Retour au site" } }
      : {};
  const inlineCloseHtml = isOverlayTotalRequest(pageOverlayCurrentRequest || {})
    ? pageOverlayInlineCloseHtml(pageOverlayBackLabel, inlineOptions)
    : "";
  const bodyHtml = applyOverlayDynamicTokens(page.content || "", pageOverlayCurrentRequest || {});
  const hasBodyHtml = !!plainText(bodyHtml);
  const bodySection = hasBodyHtml
    ? `<div class="page-overlay__body">${bodyHtml}</div>`
    : "";

  content.innerHTML = `
    ${heading}
    ${builderSection}
    ${bodySection}
    ${inlineCloseHtml}`;

  if (isOverlayTotalRequest(pageOverlayCurrentRequest || {})) {
    const inlineClose = content.querySelector(".page-overlay__retour-inline");
    const form = content.querySelector(".layout-formbuilder");
    if (inlineClose) {
      if (form) {
        const actions = form.querySelector(".layout-formbuilder__actions");
        if (actions && actions.parentElement === form) {
          actions.insertAdjacentElement("afterend", inlineClose);
        } else {
          form.appendChild(inlineClose);
        }
      } else {
        const bodies = [...content.querySelectorAll(".page-overlay__body")];
        const stack = content.querySelector(".section-builder-stack--overlay");

        if (stack) {
          stack.appendChild(inlineClose);
        } else if (bodies.length) {
          const targetBody = bodies[bodies.length - 1];
          targetBody.insertAdjacentElement("afterend", inlineClose);
        }
      }
    }
  }

  applyPageOverlayMode(pageOverlayCurrentRequest || {});
  bindFormBuilderSubmissions();

  if (page.slug === "compte-utilisateur") {
    bindCompteUtilisateurOverlay(content, preloadedAteliers);
  }

  if (isAdminToolRequest(page, pageOverlayCurrentRequest || {})) {
    await bindAdminToolOverlay(content, page, {
      request: pageOverlayCurrentRequest || {}
    });
  }

  if ((page.slug === "creation-datelier" || page.slug === "modification-atelier") && atelierEditContext) {
    prefillAtelierEditForm(content, atelierEditContext);
    atelierEditContext = null;
  }

  content.classList.remove("page-overlay__content--hydrating");
}

function prefillAtelierEditForm(content, ctx) {
  const form = content.querySelector(".layout-formbuilder");
  if (!form) return;

  const fill = (col, val) => {
    const holder = form.querySelector(`[data-linked-column="${col}"]`);
    if (!holder) return;

    if (holder.classList.contains("layout-formbuilder__checks")) {
      const cb = holder.querySelector("input[type='checkbox']");
      if (cb) {
        cb.checked = !!val;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    const fieldType = String(holder.getAttribute("data-field-type") || "").trim().toLowerCase();
    if (fieldType === "category") {
      const dropdown = holder.querySelector(".layout-formbuilder__dropdown");
      const hiddenInput = dropdown?.querySelector(".layout-formbuilder__dropdown-value");
      const labelSpan  = dropdown?.querySelector(".layout-formbuilder__dropdown-label");
      if (hiddenInput) hiddenInput.value = String(val ?? "");
      if (labelSpan && ctx.thematique) labelSpan.textContent = ctx.thematique;
      if (dropdown && val) dropdown.classList.add("has-value");
      return;
    }

    const input = holder.querySelector("input, select, textarea");
    if (input && input.type !== "password") {
      input.value = String(val ?? "");
      if (val != null && val !== "") {
        input.classList.add("has-value");
        holder.setAttribute("data-touched", "1");
      }
    }
  };

  // Fill all editable fields (mundaneum last so toggle() runs after address fields exist)
  const cols = ["nom", "prenom", "email", "telephone", "start_date", "end_date", "valid_date", "nb_participants", "thematique_id", "displayEvent", "displayContact"];
  cols.forEach((col) => { if (col in ctx) fill(col, ctx[col]); });
  // Address fields (may be overridden by mundaneum toggle)
  ["etablissement", "adresse", "localite", "code_postal"].forEach((col) => { if (col in ctx) fill(col, ctx[col]); });
  // Mundaneum last – triggers toggle() which may disable & fill address fields
  if ("mundaneum" in ctx) fill("mundaneum", ctx.mundaneum);

  // Mark form in edit mode so the submit handler knows to call updateMyAtelier
  form.dataset.atelierEditId = String(ctx.id);
  form.dataset.atelierEditMode = "1";
  form.dataset.adminAtelierEditMode = ctx.adminMode ? "1" : "0";

  // Update page title to reflect edit mode
  const titleEl = content.querySelector(".section-builder-title__title, h2.section-builder-title__title");
  if (titleEl) titleEl.textContent = "Modifier l\u2019atelier";

  // Disable submit until a field is actually changed
  const editSubmitBtn = form.querySelector(".layout-formbuilder__submit");
  if (editSubmitBtn) {
    editSubmitBtn.disabled = true;
    const editSnapshot = {};
    form.querySelectorAll("[data-linked-column]").forEach((holder) => {
      const col = String(holder.getAttribute("data-linked-column") || "").trim();
      if (!col) return;
      if (holder.classList.contains("layout-formbuilder__checks")) {
        const cb = holder.querySelector("input[type='checkbox']");
        editSnapshot[col] = cb ? cb.checked : false;
      } else {
        const inp = holder.querySelector("input, select, textarea");
        if (inp) editSnapshot[col] = inp.value;
      }
    });
    const checkEditChanges = () => {
      const changed = [...form.querySelectorAll("[data-linked-column]")].some((holder) => {
        const col = String(holder.getAttribute("data-linked-column") || "").trim();
        if (!col) return false;
        if (holder.classList.contains("layout-formbuilder__checks")) {
          const cb = holder.querySelector("input[type='checkbox']");
          return (cb ? cb.checked : false) !== !!(editSnapshot[col]);
        }
        const inp = holder.querySelector("input, select, textarea");
        return inp ? inp.value !== (editSnapshot[col] ?? "") : false;
      });
      editSubmitBtn.disabled = !changed;
    };
    form.addEventListener("input", checkEditChanges);
    form.addEventListener("change", checkEditChanges);
  }
}

function bindCompteUtilisateurOverlay(content, preloadedAteliers = null) {
  const form = content.querySelector(".layout-formbuilder");
  if (!form) return;

  // Pre-fill form inputs from a user object
  const prefillForm = (user) => {
    if (!user) return;
    form.querySelectorAll("[data-linked-column]").forEach((holder) => {
      const col = String(holder.getAttribute("data-linked-column") || "").trim();
      if (!col) return;
      if (holder.classList.contains("layout-formbuilder__checks")) {
        const cb = holder.querySelector("input[type='checkbox']");
        if (cb) cb.checked = !!(user[col]);
        return;
      }
      const input = holder.querySelector("input, select, textarea");
      if (input && input.type !== "password" && col in user) {
        input.value = String(user[col] ?? "");
      }
    });
  };

  // Build label/value rows from current stored user
  const renderReadRows = () => {
    const user = getStoredUser();
    const rows = [];
    form.querySelectorAll("[data-linked-column]").forEach((holder) => {
      const col = String(holder.getAttribute("data-linked-column") || "").trim();
      const fieldType = String(holder.getAttribute("data-field-type") || "").trim().toLowerCase();
      if (!col || fieldType === "password") return;
      const labelEl = holder.querySelector(".layout-formbuilder__field-title")
        || holder.querySelector(".layout-formbuilder__check-option span");
      const label = (labelEl ? labelEl.textContent.trim() : col).replace(/:$/u, "").trim();
      let displayValue = "";
      if (holder.classList.contains("layout-formbuilder__checks")) {
        displayValue = (user && user[col]) ? "Oui" : "Non";
      } else {
        displayValue = (user && user[col] != null && user[col] !== "") ? String(user[col]) : "\u2013";
      }
      rows.push(`<div class="compte-readonly__row"><dt class="compte-readonly__label">${esc(label)}</dt><dd class="compte-readonly__value">${esc(displayValue)}</dd></div>`);
    });
    return rows.join("");
  };

  // Pre-fill then start in read mode
  prefillForm(getStoredUser());

  const formWrapper = form.closest(".section-builder-stack--overlay");
  const hideEdit = () => { if (formWrapper) formWrapper.style.display = "none"; else form.style.display = "none"; };
  const showEdit = () => { if (formWrapper) formWrapper.style.display = ""; else form.style.display = ""; };

  // Snapshot of original user values — used for change detection & cancel
  let originalSnapshot = {};
  const takeSnapshot = () => {
    const snap = {};
    form.querySelectorAll("[data-linked-column]").forEach((holder) => {
      const col = String(holder.getAttribute("data-linked-column") || "").trim();
      if (!col) return;
      if (holder.classList.contains("layout-formbuilder__checks")) {
        const cb = holder.querySelector("input[type='checkbox']");
        snap[col] = cb ? cb.checked : false;
      } else {
        const input = holder.querySelector("input, select, textarea");
        if (input && input.type !== "password") snap[col] = input.value;
      }
    });
    return snap;
  };
  const hasChanges = () => {
    return form.querySelectorAll("[data-linked-column]").length > 0 &&
      [...form.querySelectorAll("[data-linked-column]")].some((holder) => {
        const col = String(holder.getAttribute("data-linked-column") || "").trim();
        if (!col) return false;
        if (holder.classList.contains("layout-formbuilder__checks")) {
          const cb = holder.querySelector("input[type='checkbox']");
          return (cb ? cb.checked : false) !== !!(originalSnapshot[col]);
        } else {
          const input = holder.querySelector("input, select, textarea");
          if (!input || input.type === "password") return false;
          return input.value !== (originalSnapshot[col] ?? "");
        }
      });
  };

  // Build read-only display block
  const userEmail = getStoredUser()?.email || "";
  const readView = document.createElement("div");
  readView.className = "compte-readonly";
  readView.innerHTML = `
    <dl class="compte-readonly__list">${renderReadRows()}</dl>
    <div class="compte-readonly__actions">
      <button type="button" class="compte-edit-btn buttonRound">Modifier</button>
    </div>
    ${userEmail ? `<p class="compte-reset-password-link"><a href="#" class="compte-reset-password-anchor">R\u00e9initialiser le mot de passe</a></p>` : ""}`;

  (formWrapper || form).insertAdjacentElement("beforebegin", readView);
  hideEdit();

  // "Modifier" : switch to edit mode
  readView.querySelector(".compte-edit-btn").addEventListener("click", () => {
    readView.style.display = "none";
    showEdit();
    originalSnapshot = takeSnapshot();
    if (submitBtn) submitBtn.disabled = true;
  });

  // Reset password link
  if (userEmail) {
    readView.querySelector(".compte-reset-password-anchor")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const anchor = e.currentTarget;
      anchor.textContent = "Envoi en cours\u2026";
      anchor.style.pointerEvents = "none";
      try {
        await forgotPasswordRequest(userEmail);
        anchor.textContent = "Lien envoy\u00e9 \u00e0 votre adresse email.";
      } catch {
        anchor.textContent = "Erreur. Veuillez r\u00e9essayer.";
        anchor.style.pointerEvents = "";
      }
    });
  }

  // Inject "Annuler" in form actions (to the right of the submit button)
  const actions = form.querySelector(".layout-formbuilder__actions");
  const submitBtn = actions?.querySelector(".layout-formbuilder__submit") || null;
  if (actions) {
    actions.classList.add("compte-edit-actions");
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "compte-cancel-btn buttonRound--ghost";
    cancelBtn.textContent = "Annuler";
    // Insert AFTER submit button (Annuler to the right)
    if (submitBtn) {
      submitBtn.insertAdjacentElement("afterend", cancelBtn);
    } else {
      actions.appendChild(cancelBtn);
    }

    // Change detection: re-evaluate submit enabled state on every input/change
    const updateSaveBtn = () => { if (submitBtn) submitBtn.disabled = !hasChanges(); };
    form.addEventListener("input",  updateSaveBtn);
    form.addEventListener("change", updateSaveBtn);

    const goBackToReadMode = () => {
      const listEl = readView.querySelector(".compte-readonly__list");
      if (listEl) listEl.innerHTML = renderReadRows();
      form.querySelectorAll("[data-linked-column]").forEach((holder) => {
        holder.removeAttribute("data-touched");
        holder.removeAttribute("data-username-taken");
        holder.classList.remove("is-invalid", "is-valid");
        const inputEl = holder.querySelector("input, select, textarea");
        if (inputEl) inputEl.classList.remove("is-invalid");
        const errorNode = holder.querySelector(".layout-formbuilder__error");
        if (errorNode) errorNode.textContent = "";
      });
      const msgEl = form.querySelector(".layout-formbuilder__message");
      if (msgEl) msgEl.textContent = "";
      prefillForm(getStoredUser());
      hideEdit();
      readView.style.display = "";
    };

    cancelBtn.addEventListener("click", goBackToReadMode);
    content.addEventListener("compte:saved", () => setTimeout(goBackToReadMode, 1200));
  }

  // Ateliers section — always AFTER the formWrapper so it stays below in both modes
  const token = getStoredToken();
  if (token) {
    const ateliersSection = document.createElement("section");
    ateliersSection.className = "compte-ateliers";
    (formWrapper || form).insertAdjacentElement("afterend", ateliersSection);

    const renderAteliers = (ateliers) => {
      if (!Array.isArray(ateliers) || ateliers.length === 0) {
        ateliersSection.innerHTML = `<h3 class="compte-ateliers__title">Mes ateliers</h3><p class="compte-ateliers__empty">Aucun atelier enregistré.</p>`;
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const rows = ateliers.map((a) => {
        const isTermine = !!a.valid_date
          ? (a.valid_date < today)
          : (a.start_date && a.start_date < today);
        const isConfirme = !!a.valid_date && !isTermine;
        const isAttente  = !isConfirme && !isTermine;
        const statusLabel = isTermine ? "Terminé" : (isConfirme ? "Confirmé" : "En attente");
        const statusClass = isTermine ? "compte-ateliers__status--termine" : (isConfirme ? "compte-ateliers__status--confirme" : "compte-ateliers__status--attente");

        const formatDate = (d) => {
          if (!d) return "–";
          const [y, m, day] = d.split("-");
          return `${day}/${m}/${y}`;
        };

        let datesHtml = "";
        if (isConfirme) {
          datesHtml = `<div class="compte-ateliers__item-dates compte-ateliers__item-dates--confirmed"><span>Le ${esc(formatDate(a.valid_date))}</span></div>`;
        } else {
          datesHtml = `<div class="compte-ateliers__item-dates"><span>${esc(formatDate(a.start_date))}</span>${a.end_date ? `<span> – ${esc(formatDate(a.end_date))}</span>` : ""}</div>`;
        }

        return `<li class="compte-ateliers__item${isTermine ? " compte-ateliers__item--termine" : ""}" data-atelier-id="${esc(String(a.id))}">
          <div class="compte-ateliers__item-head">
            <span class="compte-ateliers__thematique">${esc(a.thematique || "")}</span>
            <span class="compte-ateliers__status ${statusClass}">${esc(statusLabel)}</span>
          </div>
          ${datesHtml}
          <div class="compte-ateliers__item-lieu">${esc(a.lieu || "")}, ${esc(a.localite || "")}</div>
          ${isConfirme ? `<p class="compte-ateliers__item-note">Pour toute modification, veuillez contacter un organisateur.</p>` : ""}
          ${isAttente ? `<div class="compte-ateliers__item-actions"><button type="button" class="compte-ateliers__edit-btn buttonRound--ghost" data-atelier-id="${esc(String(a.id))}">Modifier</button></div>` : ""}
        </li>`;
      }).join("");

      ateliersSection.innerHTML = `<h3 class="compte-ateliers__title">Mes ateliers</h3><ul class="compte-ateliers__list">${rows}</ul>`;

      // "Modifier" button on pending ateliers → open creation overlay in edit mode
      ateliersSection.addEventListener("click", (e) => {
        const btn = e.target.closest(".compte-ateliers__edit-btn");
        if (!btn) return;
        const id = Number(btn.dataset.atelierId);
        const target = ateliers.find((a) => a.id === id);
        if (!target) return;
        atelierEditContext = target;
        openPageOverlayWithRequest({
          slug: "modification-atelier",
          search: "modification atelier",
          backLabel: "Compte utilisateur",
          overlayMode: "overlayTotal",
          logo: defaultOverlayLogo({ exactTitle: "Modification atelier" }),
          inlineReturnToCompte: true,
        }, "Modifier l'atelier");
      });
    };

    if (preloadedAteliers !== null) {
      renderAteliers(preloadedAteliers);
    } else {
      ateliersSection.innerHTML = `<h3 class="compte-ateliers__title">Mes ateliers</h3><p class="compte-ateliers__loading">Chargement\u2026</p>`;
      fetchMyAteliers(token).then(renderAteliers).catch(() => {
        ateliersSection.innerHTML = `<h3 class="compte-ateliers__title">Mes ateliers</h3><p class="compte-ateliers__error">Impossible de charger les ateliers.</p>`;
      });
    }
  }

  // Move "Retour au site" out of formWrapper (which is hidden in read mode)
  // so it stays visible below the content at all times
  const inlineClose = content.querySelector(".page-overlay__retour-inline");
  if (inlineClose) {
    const lastBlock = content.querySelector(".compte-ateliers") || readView;
    lastBlock.insertAdjacentElement("afterend", inlineClose);
  }
}

function setPageOverlayLoading(fallbackTitle = "", fallbackLogo = null) {
  const content = document.getElementById("page-overlay-content");
  if (!content) return;

  content.classList.remove("page-overlay__content--hydrating");

  const logoHtml = fallbackLogo
    ? `<div class="section-builder-title section-builder-title--overlay"><div class="section-builder-title__logo-wrap"><img class="section-builder-title__title-logo" src="${esc(fallbackLogo)}" alt="" loading="lazy" aria-hidden="true" /></div></div>`
    : "";

  content.innerHTML = `${logoHtml}<p>Chargement en cours...</p>`;

  applyPageOverlayMode(pageOverlayCurrentRequest || {});
}

function pageOverlayRequestFromTrigger(trigger) {
  const descriptor = parsePageOverlayDescriptor(trigger.dataset.pageOverlay);

  return {
    id: descriptor.id ?? (trigger.dataset.pageId ? Number(trigger.dataset.pageId) : null),
    slug: descriptor.slug || trigger.dataset.pageSlug || null,
    search: descriptor.search || trigger.dataset.pageSearch || null,
    exactTitle: descriptor.exactTitle || trigger.dataset.pageTitle || null,
    backLabel: descriptor.backLabel || trigger.dataset.overlayBackLabel || null,
    logo: titleLogoUrl(descriptor.logo || trigger.dataset.pageLogo || null),
    overlayMode: descriptor.overlayMode || trigger.dataset.pageOverlayMode || null,
    username: trigger.dataset.pageOverlayUsername || null
  };
}

function openErrorOverlay() {
  openPageOverlayWithRequest({
    exactTitle: "Erreur 404",
    search: "Erreur 404",
    backLabel: "Retour au site",
    overlayMode: "overlayTotal"
  }, "Erreur 404");
}

// ─── Search overlay ────────────────────────────────────────────────────────────

async function openSearchOverlay(query, page = 1, { fromPopstate = false } = {}) {
  query = String(query ?? "").trim();
  if (!query) return;

  searchOverlayCurrentQuery = query;

  const overlay = document.getElementById("page-overlay");
  const closeLabel = document.getElementById("page-overlay-close-label");
  if (!overlay) return;

  const request = {
    exactTitle: "Recherche",
    overlayMode: "overlayTotal",
    backLabel: "Retour au site"
  };

  pageOverlayCurrentRequest = request;
  pageOverlayBackLabel = "Retour au site";
  if (closeLabel) closeLabel.textContent = "Retour au site";

  applyPageOverlayMode(request);
  lockMainScroll();
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  setPageOverlayLoading("Recherche");

  // Nouvelle recherche → pushState pour que le bouton Précédent revienne ici.
  // Retour depuis popstate → replaceState seulement pour ne pas créer une boucle.
  const searchHash = "#overlay/recherche";
  const searchState = { ...(history.state ?? {}), searchOverlay: { query, page } };
  if (fromPopstate) {
    history.replaceState(searchState, "", `${window.location.pathname}${window.location.search}${searchHash}`);
  } else {
    pageOverlayPreviousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    pageOverlayPreviousState = history.state ? { ...history.state } : null;
    history.pushState(searchState, "", `${window.location.pathname}${window.location.search}${searchHash}`);
  }

  window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));

  try {
    const [allThematiques, allSections] = await Promise.all([
      _thematiquesPromise,
      _sectionsPromise
    ]);
    const results = searchLocalContent(query, allSections, allThematiques);
    setSearchOverlayContent(query, results, results.length, 1, 1);
  } catch {
    openErrorOverlay();
  }
}

function setSearchOverlayContent(query, results, total, totalPages, page) {
  const content = document.getElementById("page-overlay-content");
  if (!content) return;

  // Use cached heading from the WP page (includes title icon if configured)
  const heading = _searchHeadingHtml || `
    <div class="section-builder-title section-builder-title--overlay">
      <div class="section-builder-title__title-wrap">
        ${arrowSpan("right")}
        <h1 class="section-builder-title__title">Recherche</h1>
        ${arrowSpan("left")}
      </div>
    </div>`;

  // Use the formBuilder fetched from the Recherche WP page if available,
  // otherwise fall back to the built-in search form.
  const useFormBuilder = !!_searchFormBuilderHtml;
  const searchForm = useFormBuilder
    ? _searchFormBuilderHtml
    : `
    <form class="overlay-search__form" id="overlay-search-form" autocomplete="off">
      <input
        class="overlay-search__input"
        type="search"
        name="q"
        value="${esc(query)}"
        placeholder="Rechercher\u2026"
        aria-label="Rechercher dans le site"
      />
      <button class="overlay-search__submit" type="submit" aria-label="Lancer la recherche">
        <img src="./assets/images/icons/icon_Recherche.svg" alt="" aria-hidden="true" />
      </button>
    </form>`;

  const countHtml = total > 0
    ? `<p class="overlay-search__count">${total}\u00a0r\u00e9sultat${total > 1 ? "s" : ""} pour \u00ab\u00a0${esc(query)}\u00a0\u00bb</p>`
    : "";

  let resultsHtml;
  if (results.length === 0) {
    resultsHtml = `<p class="overlay-search__empty">Aucun r\u00e9sultat trouv\u00e9 pour \u00ab\u00a0${esc(query)}\u00a0\u00bb.</p>`;
  } else {
    const items = results.map((item) => {
      const title = esc(plainText(item.title ?? ""));
      const rawUrl = String(item.url ?? "");
      const subtype = String(item.subtype || item.type || "page");
      const sectionSlug = sectionSlugFromWpUrl(rawUrl);

      let navType, typeLabel;
      if (sectionSlug || subtype === "sections") {
        navType = "section";
        typeLabel = "Section";
      } else if (subtype === "thematiques" || subtype === "olthem_thematique" || subtype.includes("thematique")) {
        navType = "thematique";
        typeLabel = "Th\u00e9matique";
      } else if (subtype === "page") {
        navType = "page";
        typeLabel = "Page";
      } else {
        navType = "post";
        typeLabel = subtype === "post" ? "Article" : esc(subtype);
      }

      const wpSlug = (() => {
        try {
          const u = new URL(rawUrl);
          const parts = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
          return parts[parts.length - 1] || "";
        } catch { return ""; }
      })();

      return `<li class="overlay-search__item">
        <a class="overlay-search__link" href="#"
          data-search-result-type="${navType}"
          data-search-result-id="${item.id}"
          data-search-result-subtype="${esc(subtype)}"
          data-search-result-slug="${esc(sectionSlug || (subtype === "sections" ? (item.slug || wpSlug) : ""))}"
          data-search-result-wpslug="${esc(wpSlug)}">
          <span class="overlay-search__item-title">${title}</span>
          <span class="overlay-search__item-type">${typeLabel}</span>
        </a>
      </li>`;
    }).join("");
    resultsHtml = `<ul class="overlay-search__results">${items}</ul>`;
  }

  let paginationHtml = "";
  if (totalPages > 1) {
    const buttons = [];
    for (let p = 1; p <= totalPages; p++) {
      buttons.push(
        `<button class="buttonRoundNav" type="button" data-search-page="${p}"${p === page ? ' aria-current="page"' : ""}>${p}</button>`
      );
    }
    paginationHtml = `<nav class="overlay-search__pagination" aria-label="Pages de r\u00e9sultats">${buttons.join("")}</nav>`;
  }

  const retourHtml = pageOverlayInlineCloseHtml("Retour au site");

  content.innerHTML = `
    ${heading}
    <div class="overlay-search">
      ${searchForm}
      ${countHtml}
      ${resultsHtml}
      ${paginationHtml}
    </div>
    ${retourHtml}`;

  const retour = content.querySelector(".page-overlay__retour-inline");
  if (retour) retour.style.display = "inline-flex";

  // If using the formBuilder form: mark as search mode, bind, then pre-fill
  if (useFormBuilder) {
    const form = content.querySelector(".layout-formbuilder");
    if (form instanceof HTMLFormElement) {
      form.dataset.formMode = "search";
      // Bind first (hydrateFormBuilderFromDraft will skip reset for search mode)
      bindFormBuilderSubmissions();
      // Pre-fill after binding so it isn't cleared by form.reset()
      const input = form.querySelector(".layout-formbuilder__input");
      if (input instanceof HTMLInputElement) {
        input.value = query;
        // Trigger input event to enable the submit button via updateFormBuilderSubmitState
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  applyPageOverlayMode(pageOverlayCurrentRequest || {});
}

function openPageOverlayWithRequest(request, fallbackTitle = "Page") {
  const overlay = document.getElementById("page-overlay");
  const closeLabel = document.getElementById("page-overlay-close-label");
  if (!overlay || !request) return;

  // Auth gate: atelier creation/edition pages require authentication
  const reqSlug = slugify(request.slug || "");
  const reqTitle = slugify(request.exactTitle || "");
  const reqSearch = slugify(request.search || "");
  const isAtelierProtectedPage = [reqSlug, reqTitle, reqSearch].some(
    (s) => s === "creation-datelier"
      || s === "creation-d-atelier"
      || s === "modification-atelier"
  );
  if (isAtelierProtectedPage && !getStoredToken()) {
    openPageOverlayWithRequest(
      {
        ...parsePageOverlayDescriptor("slug:connexion|back:Retour au site|overlay:overlayTotal"),
        redirectAfterLogin: request
      },
      "Connexion"
    );
    return;
  }

  if (isAdminToolRequest(null, request)) {
    const token = getStoredToken();
    const currentUser = getStoredUser();

    if (!token) {
      openPageOverlayWithRequest(
        {
          ...parsePageOverlayDescriptor("slug:connexion|back:Retour au site|overlay:overlayTotal"),
          redirectAfterLogin: parsePageOverlayDescriptor("title:AdminTool|search:admintool|back:Retour au site|overlay:overlayTotal")
        },
        "Connexion"
      );
      return;
    }

    if (!currentUser?.isAdmin) {
      openErrorOverlay();
      return;
    }
  }

  pageOverlayCurrentRequest = request;
  if (!request.logo) {
    request.logo = defaultOverlayLogo(request);
  }
  const backLabel = request.backLabel || "Retour au site";
  pageOverlayBackLabel = backLabel;

  if (closeLabel) {
    closeLabel.textContent = backLabel;
  }

  applyPageOverlayMode(request);
  lockMainScroll();

  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  setPageOverlayLoading("", request.logo);
  syncPageOverlayUrl(request);
  window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));

  const isCompteRequest = slugify(request.search || "") === "compte-utilisateur"
    || slugify(request.exactTitle || "") === "compte-utilisateur";

  if (isCompteRequest && getStoredToken()) {
    Promise.all([
      getOverlayPage(request),
      fetchMyAteliers(getStoredToken()).catch(() => [])
    ])
      .then(([page, ateliers]) => {
        if (!page) { openErrorOverlay(); return; }
        return setPageOverlayContent(page, "", request.logo, { preloadedAteliers: ateliers });
      })
      .catch(() => openErrorOverlay());
  } else {
    getOverlayPage(request)
      .then((page) => {
        if (!page) { openErrorOverlay(); return; }
        return setPageOverlayContent(page, "", request.logo);
      })
      .catch(() => openErrorOverlay());
  }
}

function openPageOverlay(trigger) {
  const request = pageOverlayRequestFromTrigger(trigger);
  const fallbackTitle = request.exactTitle || trigger.textContent?.trim() || "Page";
  openPageOverlayWithRequest(request, fallbackTitle);
}

function closePageOverlay({ keepUrl = false } = {}) {
  const overlay = document.getElementById("page-overlay");
  if (!overlay) return;

  // Move focus out before aria-hidden to avoid accessibility warning
  if (overlay.contains(document.activeElement)) {
    document.activeElement.blur();
  }

  overlay.classList.remove("is-visible");
  overlay.setAttribute("aria-hidden", "true");
  pageOverlayCurrentRequest = null;
  if (!keepUrl) restorePageOverlayUrl();

  const onTransitionEnd = (e) => {
    if (e.target !== overlay) return;
    overlay.removeEventListener("transitionend", onTransitionEnd);
    applyPageOverlayMode({});
    unlockMainScroll();
    window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));
  };
  overlay.addEventListener("transitionend", onTransitionEnd);
}

function bindPageOverlay() {
  const closeButton = document.getElementById("page-overlay-close");
  const overlay = document.getElementById("page-overlay");

  document.addEventListener("click", (event) => {
    const rawTarget = event.target;
    const target = rawTarget instanceof Element
      ? rawTarget
      : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);

    const trigger = target instanceof Element
      ? target.closest("[data-page-overlay]")
      : null;

    if (!trigger) return;

    event.preventDefault();
    openPageOverlay(trigger);
  }, true);

  closeButton?.addEventListener("click", () => {
    closePageOverlay();
  });

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest(".page-overlay__retour-inline")
      : null;
    if (!button) return;
    event.preventDefault();

    const nextRequest = {
      slug: button.getAttribute("data-overlay-open-slug") || null,
      search: button.getAttribute("data-overlay-open-search") || null,
      exactTitle: button.getAttribute("data-overlay-open-title") || null,
      overlayMode: button.getAttribute("data-overlay-open-mode") || null,
      backLabel: button.getAttribute("data-overlay-open-back") || null,
      logo: button.getAttribute("data-overlay-open-logo") || null
    };

    const shouldOpen = !!(nextRequest.slug || nextRequest.search || nextRequest.exactTitle);
    if (shouldOpen) {
      openPageOverlayWithRequest(nextRequest, nextRequest.exactTitle || nextRequest.search || "Page");
      return;
    }

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
window.__openPageOverlay = openPageOverlay;

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

function bindSearchOverlay() {
  // Pre-fetch the Recherche page formBuilder + title once at init
  fetchPage({ exactTitle: "Recherche" }).then((page) => {
    if (!page) { _searchFormBuilderHtml = false; _searchHeadingHtml = false; return; }

    // Build heading HTML from the title layout (captures icon if configured)
    const titleLayout = flattenLayouts(page.builder).find(l => normKey(l?.acf_fc_layout) === "title");
    if (titleLayout) {
      const title = plainText(pickField(titleLayout, ["title", "Title"])) || "Recherche";
      const logoFlagRaw = pickField(titleLayout, ["logo", "Logo"]);
      const logoRaw = pickField(titleLayout, ["title logo", "title_logo", "titleLogo", "TitleLogo", "Title Logo"]);
      const resolvedLogo = titleLogoUrl(logoRaw);
      const logo = (boolValue(logoFlagRaw) || !!resolvedLogo) ? (resolvedLogo || null) : null;
      const logoHtml = logo
        ? `<div class="section-builder-title__logo-wrap"><img class="section-builder-title__title-logo" src="${esc(logo)}" alt="" loading="lazy" aria-hidden="true" /></div>`
        : "";
      const titleWrapHtml = `<div class="section-builder-title__title-wrap">${arrowSpan("right")}<h1 class="section-builder-title__title">${esc(title)}</h1>${arrowSpan("left")}</div>`;
      _searchHeadingHtml = `<div class="section-builder-title section-builder-title--overlay">${logoHtml}${titleWrapHtml}</div>`;
    } else {
      _searchHeadingHtml = false;
    }

    // Extract formBuilder layout
    const layout = flattenLayouts(page.builder).find(l => normKey(l?.acf_fc_layout) === "formbuilder");
    _searchFormBuilderHtml = layout ? renderFormBuilderLayout(layout) : false;
  }).catch(() => { _searchFormBuilderHtml = false; _searchHeadingHtml = false; });

  // Listen for search:query dispatched by the header search input (auth.js) or the overlay formBuilder
  window.addEventListener("search:query", (e) => {
    const q = String(e.detail?.query ?? "").trim();
    if (q) openSearchOverlay(q);
  });

  document.addEventListener("submit", (e) => {
    const form = e.target instanceof Element ? e.target.closest("#overlay-search-form") : null;
    if (!form) return;
    e.preventDefault();
    const q = (form.querySelector(".overlay-search__input")?.value ?? "").trim();
    if (q) openSearchOverlay(q, 1);
  });

  document.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;

    // Pagination
    const btn = e.target.closest(".buttonRoundNav");
    if (btn) {
      const p = parseInt(btn.dataset.searchPage || "1", 10);
      if (!isNaN(p)) openSearchOverlay(searchOverlayCurrentQuery, p);
      return;
    }

    // Result link
    const link = e.target.closest(".overlay-search__link");
    if (!link) return;
    e.preventDefault();

    const navType   = link.dataset.searchResultType || "post";
    const navId     = parseInt(link.dataset.searchResultId || "0", 10);
    const navSlug   = link.dataset.searchResultSlug || "";
    const navWpSlug = link.dataset.searchResultWpslug || "";
    const navSubtype = link.dataset.searchResultSubtype || "";

    if (navType === "section") {
      const searchQuery = searchOverlayCurrentQuery;
      closePageOverlay({ keepUrl: true });
      window.dispatchEvent(new CustomEvent("scroll:goto", { detail: { section: navSlug, animate: true } }));
      // After the scroll animation, highlight the first occurrence of the search term
      if (searchQuery) {
        setTimeout(() => {
          const sectionEl = document.querySelector(`.full-section[data-slug="${navSlug}"]`);
          if (!sectionEl) return;
          const scroller = sectionEl.querySelector(".js-section-subsections-scroll");
          const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
          // Walk all text-bearing elements to find the first one containing all terms
          const walker = document.createTreeWalker(sectionEl, NodeFilter.SHOW_ELEMENT);
          let target = null;
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.children.length > 0) continue; // only leaf elements
            const text = (node.textContent || "").toLowerCase();
            if (terms.every(t => text.includes(t))) { target = node; break; }
          }
          if (!target) return;
          if (scroller) {
            const nodeTop = target.getBoundingClientRect().top;
            const scrollerTop = scroller.getBoundingClientRect().top;
            scroller.scrollBy({ top: nodeTop - scrollerTop - 80, behavior: "smooth" });
          } else {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 900); // slightly after ANIM_DURATION (800ms)
      }
      return;
    }

    if (navType === "thematique") {
      closePageOverlay({ keepUrl: true });
      window.dispatchEvent(new CustomEvent("thm:open-by-id", { detail: { id: navId } }));
      return;
    }

    // page ou post : ouvrir dans l'overlay standard
    if (navId || navWpSlug) {
      openPageOverlayWithRequest({
        ...(navId ? { id: navId } : {}),
        ...(navWpSlug ? { slug: navWpSlug } : {}),
        ...(navSubtype ? { postType: navSubtype } : {}),
        backLabel: "Retour au site",
        fromSearch: true
      });
    }
  });

  // Restore search overlay on back button
  window.addEventListener("popstate", (e) => {
    const state = e.state;
    if (state?.searchOverlay) {
      const { query, page } = state.searchOverlay;
      if (query) {
        // Fermer l'overlay thématique s'il est ouvert (ouvert depuis les résultats de recherche)
        window.dispatchEvent(new CustomEvent("thm:close"));
        closePageOverlay();
        openSearchOverlay(query, page || 1, { fromPopstate: true });
      }
      return;
    }
    // Navigating back to a state with no overlay → close any open overlay
    if (!state?.pageOverlay) {
      const overlay = document.getElementById("page-overlay");
      if (overlay?.classList.contains("is-visible")) closePageOverlay();
    }
  });
}

export function getPageOverlayCurrentRequest() {
  return pageOverlayCurrentRequest;
}

export {
  openPageOverlayWithRequest,
  openPageOverlay,
  closePageOverlay,
  bindPageOverlay,
  bindSearchOverlay,
  hydrateSocialLinks
};

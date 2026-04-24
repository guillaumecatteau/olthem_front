import { fetchPage, fetchSections, fetchOptions, fetchThematiques, searchLocalContent, updateUserProfile, fetchMyAteliers, updateMyAtelier, updateAdminAtelier, checkUsernameAvailable } from "./api.js";
import { initHeaderAuth, loginAuthUser, persistAuthSession, registerAuthUser, rememberAuthPreference, getStoredToken, getStoredUser, forgotPasswordRequest, resetPasswordRequest } from "./auth.js";
import { submitFormBuilderEntry } from "./forms-api.js";
import { bindAdminToolOverlay, isAdminToolRequest } from "./admin-tool.js?v=20260422-06";
import { esc, plainText, normKey, slugify } from "./utils.js";

// Prefetch thematiques and sections immediately so the data is ready before the user interacts
const thematiquesPromise = fetchThematiques().catch(() => []);
const sectionsPromise    = fetchSections().catch(() => []);

function formSettingKeyFromChoice(choice, index) {
  const rawValue = String(choice?.value ?? "").trim();
  const rawLabel = String(choice?.label ?? "").trim();
  const normalized = normKey(rawValue || rawLabel || `setting${index}`);
  const matcher = `${rawValue} ${rawLabel}`.toLowerCase();

  if (/remember|souvenir/.test(matcher)) {
    return "remember";
  }

  return normalized;
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

function boolValue(raw) {
  return raw === true || raw === 1 || raw === "1" || String(raw ?? "").toLowerCase() === "true";
}

function pageSlugFromHref(rawHref) {
  if (!rawHref) return null;

  try {
    const url = new URL(String(rawHref), window.location.origin);
    const segments = url.pathname.split("/").filter(Boolean);
    if (!segments.length) return null;

    const last = segments[segments.length - 1];
    const slug = slugify(last);
    return slug || null;
  } catch {
    return null;
  }
}

function buildPageOverlayDescriptor(layout, options = {}) {
  const pageField = pickField(layout, [
    "page",
    "Page",
    "page_link",
    "pageLink",
    "PageLink",
    "link",
    "Link",
    "button_link",
    "buttonLink",
    "ButtonLink",
    "linked_page",
    "linkedPage",
    "LinkedPage",
    "overlay_page",
    "overlayPage",
    "OverlayPage",
    "page_target",
    "pageTarget",
    "PageTarget",
    "button_overlay_page",
    "buttonOverlayPage",
    "ButtonOverlayPage",
    "target_page",
    "targetPage",
    "TargetPage"
  ]);

  const objectCandidate = Object.values(layout || {}).find((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return value.id != null
      || value.ID != null
      || value.url
      || value.link
      || value.permalink
      || value.post_title
      || value.title
      || value.name;
  });

  const target = pageField || objectCandidate || layout;

  const rawTitle = pickField(target, ["title", "Title", "post_title", "postTitle", "name", "Name", "label", "Label"]);
  const rawHref = linkHref(target) || pickField(layout, ["url", "URL", "href", "Href"]);
  const rawSearch = pickField(layout, ["search", "Search", "page_search", "pageSearch", "overlay_search", "overlaySearch"]);
  const rawId = pickField(target, ["id", "ID", "page_id", "pageId", "object_id", "objectId"])
    ?? pickField(layout, ["page_id", "pageId", "id", "ID"]);
  const id = Number(rawId);
  const title = plainText(rawTitle || "");
  const slug = pageSlugFromHref(rawHref);
  const search = plainText(rawSearch || "");
  const backLabel = plainText(pickField(layout, ["back_label", "backLabel", "back", "Back"])) || "Retour au site";

  const parts = [];
  if (Number.isFinite(id) && id > 0) parts.push(`id:${id}`);
  if (!parts.length && slug) parts.push(`slug:${slug}`);
  if (!parts.length && title) parts.push(`title:${title}`);
  if (!parts.length && search) parts.push(`search:${search}`);
  parts.push(`back:${backLabel}`);

  if (options.forceOverlayTotal) {
    parts.push("overlay:overlayTotal");
  }

  return {
    descriptor: parts.join("|"),
    fallbackTitle: title || slug || "Page",
    isValid: parts.some((part) => part.startsWith("id:") || part.startsWith("slug:") || part.startsWith("title:"))
  };
}

function titleLogoUrl(raw) {
  if (raw && typeof raw === "object") {
    const objectUrl = imageUrl(raw);
    if (objectUrl) return objectUrl;
  }

  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (/^(https?:)?\/\//i.test(value) || value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return value;
  }

  const normalized = value.replace(/^\/+/, "");
  const hasExtension = /\.[a-z0-9]+$/i.test(normalized);
  const fileName = hasExtension ? normalized : `${normalized}.svg`;

  if (/^icon_name(\.svg)?$/i.test(fileName)) {
    return null;
  }

  if (/^(icon_|logo_)/i.test(normalized)) {
    return `./assets/images/icons/${fileName}`;
  }

  return `./assets/images/themes/${fileName}`;
}

function formBuilderPrimitive(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = formBuilderPrimitive(entry);
      if (found) return found;
    }
    return "";
  }

  if (typeof value === "object") {
    const preferredKeys = ["label", "Label", "title", "Title", "name", "Name", "value", "Value", "text", "Text"];
    for (const key of preferredKeys) {
      if (key in value) {
        const found = formBuilderPrimitive(value[key]);
        if (found) return found;
      }
    }

    for (const nested of Object.values(value)) {
      const found = formBuilderPrimitive(nested);
      if (found) return found;
    }
  }

  return "";
}

function formBuilderChoice(value) {
  if (value && typeof value === "object") {
    const rawLabel = pickField(value, [
      "check_label", "checkLabel", "choice_label", "choiceLabel", "option_label", "optionLabel",
      "label", "Label", "title", "Title", "name", "Name", "text", "Text"
    ]);
    const label = plainText(formBuilderPrimitive(rawLabel)) || "";
    const rawValue = pickField(value, ["value", "Value", "id", "ID", "slug", "Slug", "code", "Code"]);
    const optionValue = plainText(formBuilderPrimitive(rawValue) || label) || label;

    if (label || optionValue) {
      return {
        label: label || optionValue,
        value: optionValue || label
      };
    }

    return {
      label: "",
      value: ""
    };
  }

  const text = plainText(formBuilderPrimitive(value));
  return {
    label: text,
    value: text
  };
}

function renderFormBuilderField(item, groupIndex, fieldIndex) {
  const key = normKey(item?.acf_fc_layout);
  const size = String(pickField(item, ["taille", "Taille"]) || "Petit").toLowerCase() === "grand" ? "grand" : "petit";
  const label = plainText(pickField(item, ["label", "Label", "field_label", "fieldLabel", "selector_label", "selectorLabel", "category_label", "categoryLabel"])) || "Champ";
  const title = plainText(pickField(item, ["champ_title", "champTitle", "field_title", "fieldTitle", "selector_title", "selectorTitle", "category_title", "categoryTitle", "title", "Title"])) || "";
  const fieldTitleHtml = title ? `<h3 class="layout-formbuilder__field-title">${esc(title)}</h3>` : "";
  const linkedColumn = plainText(pickField(item, ["linked_column", "linked_colomn", "linkedColumn"])) || "";
  const id = `fb-${groupIndex}-${fieldIndex}`;

  if (key === "champlarge" || key === "champ") {
    const typeRaw = String(pickField(item, ["champ_type", "champType"]) || "Text").trim().toLowerCase();
    const isEmail = typeRaw === "mail" || typeRaw === "email";
    const isPassword = typeRaw === "password" || typeRaw === "mot de passe" || typeRaw === "motdepasse";
    const isPostal = typeRaw === "code postal" || typeRaw === "codepostal" || typeRaw === "postal";
    const isPhone = typeRaw === "téléphone" || typeRaw === "telephone" || typeRaw === "tel" || typeRaw === "phone";
    const isUsername = typeRaw === "username";
    const type = isUsername ? "username" : (isEmail ? "email" : (isPassword ? "password" : (isPostal ? "postal" : (isPhone ? "tel" : "text"))));

    const inputType = isPhone ? "tel" : (isPostal ? "text" : (isUsername ? "text" : type));
    const auto = type === "password" ? "new-password" : (isPhone ? "tel" : (isPostal ? "postal-code" : (isUsername ? "username" : "off")));
    const passwordToggle = type === "password"
      ? `<button class="layout-formbuilder__password-toggle" type="button" aria-label="Afficher le mot de passe" aria-pressed="false"><img src="./assets/images/icons/icon_EyeClosed.svg" alt="" aria-hidden="true" /></button>`
      : "";

    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}${type === "password" ? " layout-formbuilder__field--password" : ""}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="${esc(type)}">
        ${fieldTitleHtml}
        <input id="${esc(id)}" class="layout-formbuilder__input" type="${esc(inputType)}" placeholder="${esc(label)}" autocomplete="${esc(auto)}" />
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        ${passwordToggle}
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
  }

  if (key === "dateselector") {
    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="date">
        ${fieldTitleHtml}
        <div class="layout-formbuilder__input-wrap">
          <input id="${esc(id)}" class="layout-formbuilder__input" type="date" autocomplete="off" />
          <span class="layout-formbuilder__date-placeholder">-- ${esc(label)} --</span>
          <span class="layout-formbuilder__icon-calendar" aria-hidden="true"></span>
        </div>
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
  }

  if (key === "numberselector") {
    const stepAttr = pickField(item, ["number_step", "numberStep"]);
    const minAttr = pickField(item, ["number_min", "numberMin"]);
    const maxAttr = pickField(item, ["number_max", "numberMax"]);
    const prefixAttr = plainText(pickField(item, ["number_prefix", "numberPrefix", "prefix"])) || "";

    // Named-column fallback defaults for known fields when ACF doesn't configure them.
    const isParticipants = linkedColumn === "nb_participants";
    const step = Number(stepAttr) > 0 ? Number(stepAttr) : (isParticipants ? 10 : 1);
    const prefix = prefixAttr || (isParticipants ? "+" : "");
    const minVal = Number(minAttr) > 0 ? Number(minAttr) : (step > 1 ? step : 1);
    const maxVal = Number(maxAttr) > 0 ? Number(maxAttr) : (isParticipants ? 100 : null);

    const useCustomStepper = prefix !== "" || step > 1;
    const inputAttrs = useCustomStepper
      ? `type="text" inputmode="numeric" readonly data-number-step="${step}" data-number-min="${minVal}"${maxVal ? ` data-number-max="${maxVal}"` : ""} data-number-prefix="${esc(prefix)}"`
      : `type="number" min="${minVal}"${maxVal ? ` max="${maxVal}"` : ""} step="${step}"`;

    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="number">
        ${fieldTitleHtml}
        <div class="layout-formbuilder__input-wrap">
          <input id="${esc(id)}" class="layout-formbuilder__input" ${inputAttrs} placeholder="-- ${esc(label)} --" autocomplete="off" />
          <div class="layout-formbuilder__number-arrows" aria-hidden="true">
            <button class="layout-formbuilder__number-arrow layout-formbuilder__number-arrow--up" type="button" tabindex="-1"></button>
            <button class="layout-formbuilder__number-arrow layout-formbuilder__number-arrow--down" type="button" tabindex="-1"></button>
          </div>
        </div>
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
  }

  if (key === "categoryselector") {
    const catTitle = title || label;
    const catPlaceholder = title ? label : "Choix";
    const catTitleHtml = catTitle ? `<h3 class="layout-formbuilder__field-title">${esc(catTitle)}</h3>` : "";

    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="category">
        ${catTitleHtml}
        <div class="layout-formbuilder__dropdown" data-placeholder="-- ${esc(catPlaceholder)} --">
          <input type="hidden" id="${esc(id)}" class="layout-formbuilder__input layout-formbuilder__dropdown-value" value="" />
          <button type="button" class="layout-formbuilder__dropdown-toggle">
            <span class="layout-formbuilder__dropdown-label">-- ${esc(catPlaceholder)} --</span>
            <span class="layout-formbuilder__icon-arrow-down" aria-hidden="true"></span>
          </button>
          <ul class="layout-formbuilder__dropdown-list"></ul>
        </div>
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
  }

  if (key === "formlink") {
    const text = plainText(pickField(item, ["text", "Text"]));
    const textLink = plainText(pickField(item, ["text_link", "textLink", "TextLink", "link_text", "linkText"]));
    const pageLink = pickField(item, ["page_link", "pageLink", "PageLink", "page", "Page", "link", "Link"]);
    const descriptor = buildPageOverlayDescriptor(
      typeof pageLink === "object" ? pageLink : { page_link: pageLink },
      { forceOverlayTotal: true }
    );
    const linkHtml = descriptor.isValid
      ? `<a class="layout-formbuilder__form-link-anchor" href="#" data-page-overlay="${esc(descriptor.descriptor)}">${esc(textLink || descriptor.fallbackTitle)}</a>`
      : `<span class="layout-formbuilder__form-link-anchor">${esc(textLink)}</span>`;

    return `<p class="layout-formbuilder__form-link">${text ? `${esc(text)} ` : ""}${linkHtml}</p>`;
  }

  if (key === "checkfield") {
    const checksRaw = pickField(item, ["check", "Check"]);
    const checks = Array.isArray(checksRaw) ? checksRaw : [];
    const optionsHtml = checks.length
      ? checks.map((entry, index) => {
          const choice = formBuilderChoice(entry);
          return `
          <label class="layout-formbuilder__check-option" for="${esc(`${id}-${index}`)}">
            <input id="${esc(`${id}-${index}`)}" type="checkbox" value="${esc(choice.value)}" />
            <span>${esc(choice.label)}</span>
          </label>`;
        }).join("")
      : `
          <label class="layout-formbuilder__check-option" for="${esc(id)}">
            <input id="${esc(id)}" type="checkbox" value="1" />
            <span>${esc(label)}</span>
          </label>`;

    return `
      <div class="layout-formbuilder__checks" data-linked-column="${esc(linkedColumn)}" data-field-type="checkbox-group">
        ${fieldTitleHtml}
        ${optionsHtml}
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </div>`;
  }

  return "";
}

function renderFormBuilderGroup(row, groupIndex) {
  const entries = Array.isArray(pickField(row, ["form_group", "formGroup"]))
    ? pickField(row, ["form_group", "formGroup"])
    : [];

  if (!entries.length) return "";

  let groupTitle = "";
  let fieldIndex = 0;

  const fieldItems = [];
  let i = 0;
  while (i < entries.length) {
    const item = entries[i];
    const key = normKey(item?.acf_fc_layout);
    if (key === "formlink") {
      // Collect consecutive form_link items into one group
      const linkItems = [];
      while (i < entries.length && normKey(entries[i]?.acf_fc_layout) === "formlink") {
        linkItems.push(entries[i]);
        i++;
      }
      fieldItems.push({ type: "formlink-group", items: linkItems });
    } else {
      fieldItems.push({ type: "field", item });
      i++;
    }
  }

  const fieldsHtml = fieldItems.map((entry) => {
    if (entry.type === "formlink-group") {
      const linksHtml = entry.items.map((linkItem) => {
        fieldIndex += 1;
        return renderFormBuilderField(linkItem, groupIndex, fieldIndex);
      }).join("");
      return `<div class="layout-formbuilder__form-link-group">${linksHtml}</div>`;
    }

    const key = normKey(entry.item?.acf_fc_layout);
    if (key === "grouptitle") {
      const rawTitle = String(pickField(entry.item, ["title", "Title"]) ?? "");
      groupTitle = rawTitle.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
      return "";
    }

    const html = renderFormBuilderField(entry.item, groupIndex, fieldIndex);
    fieldIndex += 1;
    return html;
  }).join("");

  if (!groupTitle && !fieldsHtml) return "";

  const titleHtml = groupTitle ? `<h3 class="layout-formbuilder__group-title">${esc(groupTitle).replace(/\n/g, "<br>")}</h3>` : "";

  return `
    <section class="layout-formbuilder__group">
      ${titleHtml}
      <div class="layout-formbuilder__fields">${fieldsHtml}</div>
    </section>`;
}

function renderFormBuilderLayout(layout) {
  const rows = Array.isArray(pickField(layout, ["formconstructor", "formConstructor"]))
    ? pickField(layout, ["formconstructor", "formConstructor"])
    : [];

  if (!rows.length) return "";

  let formType = "Simple";
  let buttonLabel = "Valider";
  let formProcess = "";
  let linkedTable = "";
  let formChecks = [];
  const groups = [];

  rows.forEach((row) => {
    const key = normKey(row?.acf_fc_layout);

    if (key === "formsettings") {
      formType = plainText(pickField(row, ["form_type", "formType"])) || formType;
      buttonLabel = plainText(pickField(row, ["form_button_label", "formButtonLabel"])) || buttonLabel;
      formProcess = plainText(pickField(row, ["form_process", "formProcess"])) || "";
      linkedTable = plainText(pickField(row, ["linked_table", "linkedTable"])) || "";
      const checks = pickField(row, ["form_check", "formCheck"]);
      formChecks = Array.isArray(checks) ? checks : [];
    }

    if (key === "formgroup") {
      groups.push(row);
    }
  });

  const groupsHtml = groups.map((group, index) => renderFormBuilderGroup(group, index)).join("");
  const formChecksHtml = formChecks.length
    ? `<div class="layout-formbuilder__checks layout-formbuilder__checks--settings" data-field-type="checkbox-group">${formChecks.map((entry, index) => {
        const choice = formBuilderChoice(entry);
        const rawLinkedCol = plainText(pickField(entry, ["linked_column", "linked_colomun", "linkedColumn", "linkedColomun"]));
        const settingKey = rawLinkedCol ? normKey(rawLinkedCol) : formSettingKeyFromChoice(choice, index);
        return `
        <label class="layout-formbuilder__check-option" for="fb-settings-check-${index}">
          <input id="fb-settings-check-${index}" type="checkbox" value="${esc(choice.value)}" data-setting-key="${esc(settingKey)}" />
          <span>${esc(choice.label)}</span>
        </label>`;
      }).join("")}<p class="layout-formbuilder__error" aria-live="polite"></p></div>`
    : "";
  const isDouble = String(formType).toLowerCase() === "double";
  const groupsSectionHtml = (() => {
    if (!isDouble) return groupsHtml;

    const renderedGroups = groups
      .map((group, index) => renderFormBuilderGroup(group, index))
      .filter(Boolean);

    const midpoint = Math.ceil(renderedGroups.length / 2);
    const leftColumn = renderedGroups.slice(0, midpoint).join("");
    const rightColumn = renderedGroups.slice(midpoint).join("");

    return `
      <div class="layout-formbuilder__columns">
        <div class="layout-formbuilder__column">${leftColumn}</div>
        <div class="layout-formbuilder__column">${rightColumn}</div>
      </div>`;
  })();

  const normalizedButtonLabel = buttonLabel.trim();
  const isIconLabel = /^icon_[A-Za-z0-9_]+$/.test(normalizedButtonLabel) && !/^icon_name$/i.test(normalizedButtonLabel);
  const buttonInner = isIconLabel
    ? `<img src="./assets/images/icons/${esc(normalizedButtonLabel)}.svg" alt="" aria-hidden="true" />`
    : esc(buttonLabel);
  const buttonAriaAttr = isIconLabel ? ` aria-label="${esc(normalizedButtonLabel)}"` : "";

  return `
    <form class="layout-formbuilder ${isDouble ? "layout-formbuilder--double" : "layout-formbuilder--simple"}" data-form-type="${esc(formType)}" data-form-process="${esc(formProcess)}" data-linked-table="${esc(linkedTable)}" autocomplete="off" novalidate>
      ${groupsSectionHtml}
      ${formChecksHtml}
      <div class="layout-formbuilder__actions">
        <button class="buttonRound layout-formbuilder__submit" type="submit" disabled${buttonAriaAttr}>${buttonInner}</button>
        <p class="layout-formbuilder__message" aria-live="polite"></p>
      </div>
    </form>`;
}

function formBuilderStorageKey(form) {
  const table = String(form.dataset.linkedTable || "").trim();
  const process = String(form.dataset.formProcess || "").trim();
  return `olthem.formbuilder.${table}.${process}`;
}

function isFormBuilderRetryMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("formRetry") === "1" || params.get("retry") === "1";
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidBelgianPostalCode(value) {
  return /^[1-9]\d{3}$/.test(value);
}

function isValidPhoneNumber(value) {
  const digits = value.replace(/[\s.\-()\/+]/g, "");
  return /^\d{9,12}$/.test(digits);
}

function isValidYmdDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yy, mm, dd] = value.split("-").map(Number);
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  return date.getUTCFullYear() === yy && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd;
}

function isValidStrongPassword(value) {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(value);
}

function setFormBuilderFieldState(holder, state = {}) {
  const input = holder.querySelector("input, select, textarea");
  const errorNode = holder.querySelector(".layout-formbuilder__error");
  const dropdownToggle = holder.querySelector(".layout-formbuilder__dropdown-toggle");
  const isValid = !!state.valid;
  const message = String(state.message || "");

  if (input && !isValid) {
    input.classList.add("is-invalid");
  }

  if (input && isValid) {
    input.classList.remove("is-invalid");
  }

  if (dropdownToggle) {
    dropdownToggle.classList.toggle("is-invalid", !isValid);
  }

  holder.classList.toggle("is-valid", isValid);

  if (errorNode) {
    errorNode.textContent = message;
  }
}

function collectFormBuilderPayload(form, options = {}) {
  const mutateUi = options.mutateUi !== false;
  const touchedOnly = !!options.touchedOnly;
  const table = String(form.dataset.linkedTable || "").trim();
  const process = String(form.dataset.formProcess || "").trim();
  const values = {};
  const errors = [];
  const passwordFields = [];

  if (mutateUi) {
    form.querySelectorAll("[data-linked-column], .layout-formbuilder__checks--settings").forEach((holder) => {
      const isTouched = holder.getAttribute("data-touched") === "1";
      if (touchedOnly && !isTouched) return;

      holder.classList.remove("is-invalid", "is-valid");
      const input = holder.querySelector("input, select, textarea");
      if (input) input.classList.remove("is-invalid");
      const errorNode = holder.querySelector(".layout-formbuilder__error");
      if (errorNode) errorNode.textContent = "";
    });
  }

  const holders = form.querySelectorAll("[data-linked-column]");
  holders.forEach((holder) => {
    const isTouched = holder.getAttribute("data-touched") === "1";
    if (touchedOnly && !isTouched) return;

    const column = String(holder.getAttribute("data-linked-column") || "").trim();
    const fieldType = String(holder.getAttribute("data-field-type") || "").trim().toLowerCase();
    const inputForLabel = holder.querySelector("input, select, textarea");
    if (!column) return;

    // Skip validation on disabled fields (e.g. when Mundaneum is checked) but still capture their value
    const fieldInput = holder.querySelector("input, select, textarea");
    if (fieldInput && fieldInput.disabled) {
      values[column] = fieldInput.value || null;
      if (mutateUi) {
        setFormBuilderFieldState(holder, { valid: true, message: "" });
      }
      return;
    }

    if (holder.classList.contains("layout-formbuilder__checks")) {
      const allCheckboxes = [...holder.querySelectorAll("input[type='checkbox']")];
      const checked = allCheckboxes.filter((input) => input.checked).map((input) => input.value);
      // Single-option toggle: store 1/0 (scalar) so TINYINT columns receive the correct value.
      // Multi-option groups keep the array format.
      values[column] = allCheckboxes.length === 1 ? (checked.length > 0 ? 1 : 0) : checked;
      // A single checkbox is an optional boolean toggle — no required validation.
      if (allCheckboxes.length > 1 && !checked.length) {
        if (mutateUi) {
          holder.classList.add("is-invalid");
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez sélectionner au moins une option" });
        }
        errors.push("Veuillez sélectionner au moins une option");
      } else if (mutateUi) {
        setFormBuilderFieldState(holder, { valid: true, message: "" });
      }
      return;
    }

    const input = inputForLabel;
    if (!input) return;

    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      values[column] = input.checked ? 1 : 0;
      return;
    }

    const value = input instanceof HTMLInputElement && input.type === "password"
      ? input.value
      : String(input.value ?? "").trim();

    if (fieldType === "email") {
      if (!value || !isValidEmailAddress(value)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez entrer une adresse email valide" });
        }
        errors.push("Veuillez entrer une adresse email valide");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      values[column] = value;
      return;
    }

    if (fieldType === "password") {
      const isLoginForm = process.toLowerCase() === "connexion";
      const strong = !!value && isValidStrongPassword(value);
      if (!value || (!isLoginForm && !isValidStrongPassword(value))) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: isLoginForm ? "" : "8 caractères minimum, avec 1 majuscule et 1 chiffre" });
        }
        if (!isLoginForm) errors.push("8 caractères minimum, avec 1 majuscule et 1 chiffre");
        if (!value) errors.push("Mot de passe requis");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      values[column] = value;
      passwordFields.push({ holder, value, strong, touched: holder.getAttribute("data-touched") === "1" });
      return;
    }

    if (fieldType === "number") {
      if (value === "") {
        values[column] = null;
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez saisir un nombre valide" });
        }
        errors.push("Veuillez saisir un nombre valide");
        return;
      }

      const asNumber = Number(value.replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(asNumber)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez saisir un nombre valide" });
        }
        errors.push("Veuillez saisir un nombre valide");
        return;
      }

      // Validate against data-number-min / data-number-max constraints (for custom steppers).
      const numInput = holder.querySelector("input[data-number-min]");
      if (numInput instanceof HTMLInputElement) {
        const cMin = Number(numInput.dataset.numberMin);
        const cMax = numInput.dataset.numberMax ? Number(numInput.dataset.numberMax) : null;
        if (Number.isFinite(cMin) && asNumber < cMin) {
          if (mutateUi) setFormBuilderFieldState(holder, { valid: false, message: `Valeur minimale : ${cMin}` });
          errors.push(`Valeur minimale : ${cMin}`);
          return;
        }
        if (cMax !== null && Number.isFinite(cMax) && asNumber > cMax) {
          if (mutateUi) setFormBuilderFieldState(holder, { valid: false, message: `Valeur maximale : ${cMax}` });
          errors.push(`Valeur maximale : ${cMax}`);
          return;
        }
      }

      if (mutateUi) {
        setFormBuilderFieldState(holder, { valid: true, message: "" });
      }
      values[column] = Number.isInteger(asNumber) ? asNumber : asNumber;
      return;
    }

    if (fieldType === "date") {
      const todayYmd = new Date().toISOString().slice(0, 10);
      if (!value || !isValidYmdDate(value)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez saisir une date valide" });
        }
        errors.push("Veuillez saisir une date valide");
      } else if (value < todayYmd) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "La date ne peut pas être dans le passé" });
        }
        errors.push("La date ne peut pas être dans le passé");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      values[column] = value;
      return;
    }

    values[column] = value;

    if (fieldType === "postal") {
      if (!value || !isValidBelgianPostalCode(value)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Code postal belge invalide (1000-9999)" });
        }
        errors.push("Code postal belge invalide (1000-9999)");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      return;
    }

    if (fieldType === "tel") {
      if (!value || !isValidPhoneNumber(value)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Numéro de téléphone invalide" });
        }
        errors.push("Numéro de téléphone invalide");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      return;
    }

    if (!fieldType || fieldType === "text") {
      if (value.length < 2) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez saisir au moins 2 caractères" });
        }
        errors.push("Veuillez saisir au moins 2 caractères");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      return;
    }

    if (fieldType === "username") {
      if (value.length < 2) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez saisir au moins 2 caractères" });
        }
        errors.push("Veuillez saisir au moins 2 caractères");
      } else if (holder.dataset.usernameTaken === "1") {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Ce nom est déjà pris" });
        }
        errors.push("Ce nom est déjà pris");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      return;
    }

    if (fieldType === "category") {
      if (value === "") {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez sélectionner une option" });
        }
        errors.push("Veuillez sélectionner une option");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
    }
  });

  if (passwordFields.length >= 2) {
    const first = passwordFields[0];
    const second = passwordFields[1];
    const shouldCheckMismatch = !touchedOnly || second.touched;

    if (shouldCheckMismatch && first.strong && second.strong && first.value !== second.value) {
      if (mutateUi) {
        setFormBuilderFieldState(second.holder, { valid: false, message: "Les mots de passe ne correspondent pas" });
      }
      errors.push("Les mots de passe ne correspondent pas");
    }
  }

  // Cross-validate start_date / end_date: end cannot precede start.
  const startValue = values["start_date"] || null;
  const endValue = values["end_date"] || null;
  if (startValue && endValue && isValidYmdDate(startValue) && isValidYmdDate(endValue) && endValue < startValue) {
    const endHolder = form?.querySelector('[data-linked-column="end_date"]');
    if (endHolder && (!touchedOnly || endHolder.getAttribute("data-touched") === "1")) {
      if (mutateUi) {
        setFormBuilderFieldState(endHolder, { valid: false, message: "La date de fin ne peut pas être antérieure à la date de début." });
      }
      errors.push("La date de fin ne peut pas être antérieure à la date de début.");
    }
  }

  form.querySelectorAll(".layout-formbuilder__checks--settings input[type='checkbox'][data-setting-key]").forEach((input) => {
    const key = String(input.getAttribute("data-setting-key") || "").trim();
    if (!key) return;
    values[key] = input.checked ? 1 : 0;
  });

  const rememberEntry = Object.entries(values).find(([key]) => /remember|souvenir/.test(String(key).toLowerCase()));
  if (rememberEntry) {
    const rememberRaw = rememberEntry[1];
    values.remember = rememberRaw === true || rememberRaw === 1 || rememberRaw === "1" ? 1 : 0;
  }

  return { table, process, values, errors };
}

function saveFormBuilderDraft(form) {
  const payload = collectFormBuilderPayload(form);
  try {
    window.sessionStorage.setItem(formBuilderStorageKey(form), JSON.stringify(payload.values));
  } catch {
    // Ignore session storage errors.
  }
}

function clearFormBuilderDraft(form) {
  try {
    window.sessionStorage.removeItem(formBuilderStorageKey(form));
  } catch {
    // Ignore session storage errors.
  }
}

function getFormBuilderAuthCredentials(form) {
  let email = "";
  let password = "";

  form.querySelectorAll("[data-linked-column]").forEach((holder) => {
    const fieldType = String(holder.getAttribute("data-field-type") || "").trim().toLowerCase();
    const input = holder.querySelector("input, select, textarea");
    if (!input) return;

    if (!email && fieldType === "email") {
      email = String(input.value || "").trim();
    }

    if (!password && fieldType === "password" && input instanceof HTMLInputElement) {
      password = input.value;
    }
  });

  return { email, password };
}

function getFormBuilderRememberChoice(values = {}) {
  const entry = Object.entries(values).find(([key]) => /remember|souvenir/.test(String(key).toLowerCase()));
  if (!entry) return false;
  const rawValue = entry[1];
  // Single checkbox now stores 1/0; keep array fallback for legacy drafts.
  if (Array.isArray(rawValue)) return rawValue.length > 0;
  return rawValue === true || rawValue === 1 || rawValue === "1";
}

function getFormBuilderRegistrationUsername(values = {}, fallback = "") {
  if (fallback) return String(fallback).trim();

  const entry = Object.entries(values).find(([key]) => /username|nomutilisateur|pseudo|login/.test(String(key).toLowerCase()));
  if (!entry) return "";

  return plainText(entry[1] ?? "");
}

function getRegistrationAlertMessage(error) {
  const payloadMessage = String(error?.payload?.message || "");
  const payloadCode = String(error?.payload?.code || "");
  const genericMessage = String(error?.message || "");
  const haystack = `${payloadMessage} ${payloadCode} ${genericMessage}`.toLowerCase();

  if (/(email|mail|adresse).*(deja|déjà|exist)|exist.*(email|mail|adresse)|existing_user_email|email_exists|already.*(exist|registered)/.test(haystack)) {
    return "L'adresse email existe déjà !";
  }

  return "Problème technique";
}

function hydrateFormBuilderFromDraft(form) {
  // Search overlay forms must not be reset or draft-hydrated
  if (form.dataset.formMode === "search") return;

  const shouldRestore = isFormBuilderRetryMode();

  if (!shouldRestore) {
    form.reset();
    clearFormBuilderDraft(form);
    return;
  }

  let raw = null;
  try {
    raw = window.sessionStorage.getItem(formBuilderStorageKey(form));
  } catch {
    raw = null;
  }

  if (!raw) {
    form.reset();
    return;
  }

  try {
    const draft = JSON.parse(raw);
    const holders = form.querySelectorAll("[data-linked-column]");

    holders.forEach((holder) => {
      const column = String(holder.getAttribute("data-linked-column") || "").trim();
      if (!column || !(column in draft)) return;

      if (holder.classList.contains("layout-formbuilder__checks")) {
        const selected = Array.isArray(draft[column]) ? draft[column].map(String) : [];
        holder.querySelectorAll("input[type='checkbox']").forEach((input) => {
          input.checked = selected.includes(String(input.value));
        });
        return;
      }

      const input = holder.querySelector("input, select, textarea");
      if (!input) return;
      input.value = draft[column] ?? "";
      // Re-apply prefix for custom number steppers.
      const numPrefix = input instanceof HTMLInputElement ? (input.dataset.numberPrefix || "") : "";
      if (numPrefix && input.value && !String(input.value).startsWith(numPrefix)) {
        const num = Number(String(input.value).replace(/[^0-9.]/g, ""));
        if (Number.isFinite(num) && num > 0) input.value = numPrefix + num;
      }
    });

    form.querySelectorAll(".layout-formbuilder__checks--settings input[type='checkbox'][data-setting-key]").forEach((input) => {
      const key = String(input.getAttribute("data-setting-key") || "").trim();
      if (!key) return;
      input.checked = !!draft[key];
    });
  } catch {
    form.reset();
  }
}

function updateFormBuilderSubmitState(form) {
  const submitButton = form.querySelector(".layout-formbuilder__submit");
  if (!(submitButton instanceof HTMLButtonElement)) return;

  // Search mode: button enabled when the input has a non-empty value
  if (form.dataset.formMode === "search") {
    const input = form.querySelector(".layout-formbuilder__input");
    submitButton.disabled = !String(input?.value ?? "").trim();
    return;
  }

  // Compte utilisateur mode: save button state is managed by change detection only
  if (String(form.dataset.formProcess || "").toLowerCase().replace(/[-\s]/g, "") === "miseajourcompte") {
    return;
  }

  // Atelier edit mode: save button state is managed by change detection only
  if (form.dataset.atelierEditMode === "1") {
    return;
  }

  // Admin atelier edit mode: save button state is managed by change detection only
  if (form.dataset.adminAtelierEditMode === "1") {
    return;
  }

  const payload = collectFormBuilderPayload(form, { mutateUi: false });
  const proc = payload.process.toLowerCase();
  const isTableless = proc === "connexion"
    || proc.includes("oublié")
    || proc.includes("réinitialisation");
  const canSubmit = (!!payload.table || isTableless) && payload.errors.length === 0;
  submitButton.disabled = !canSubmit;
  submitButton.classList.toggle("is-active", canSubmit);
}

function bindFormBuilderSubmissions() {
  const forms = document.querySelectorAll(".layout-formbuilder");
  forms.forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.formBuilderBound === "1") {
      updateFormBuilderSubmitState(form);
      return;
    }

    form.dataset.formBuilderBound = "1";

    // Prevent selection of past dates on all date inputs.
    const todayStr = new Date().toISOString().slice(0, 10);
    form.querySelectorAll('input[type="date"]').forEach((dateInput) => {
      dateInput.setAttribute("min", todayStr);
    });

    hydrateFormBuilderFromDraft(form);
    updateFormBuilderSubmitState(form);

    const holderForEvent = (event) => {
      if (!(event.target instanceof Element)) return null;
      return event.target.closest("[data-linked-column]");
    };

    form.addEventListener("input", (event) => {
      const holder = holderForEvent(event);
      if (holder && holder.getAttribute("data-touched") === "1") {
        collectFormBuilderPayload(form, { mutateUi: true, touchedOnly: true });
      }
      updateFormBuilderSubmitState(form);
    });

    form.addEventListener("change", (event) => {
      const holder = holderForEvent(event);
      if (holder) {
        holder.setAttribute("data-touched", "1");
        collectFormBuilderPayload(form, { mutateUi: true, touchedOnly: true });
      }
      if (event.target instanceof HTMLSelectElement) {
        event.target.classList.toggle("has-value", event.target.value !== "");
      }
      if (event.target instanceof HTMLInputElement && event.target.type === "date") {
        event.target.classList.toggle("has-value", event.target.value !== "");
      }
      updateFormBuilderSubmitState(form);
    });

    form.addEventListener("focusout", (event) => {
      const holder = holderForEvent(event);
      if (holder) {
        holder.setAttribute("data-touched", "1");
        collectFormBuilderPayload(form, { mutateUi: true, touchedOnly: true });
      }
      updateFormBuilderSubmitState(form);
    });

    // Async username uniqueness check on blur
    form.querySelectorAll('[data-field-type="username"] .layout-formbuilder__input').forEach((input) => {
      if (input.dataset.usernameBlurBound === "1") return;
      input.dataset.usernameBlurBound = "1";
      input.addEventListener("blur", async () => {
        const holder = input.closest("[data-linked-column]");
        if (!holder) return;
        const val = String(input.value ?? "").trim();
        if (val.length < 2) return; // basic validation already handled
        const currentUser = getStoredUser();
        const currentUserId = currentUser?.id ?? null;
        try {
          const available = await checkUsernameAvailable(val, currentUserId);
          holder.dataset.usernameTaken = available ? "0" : "1";
          if (!available) {
            setFormBuilderFieldState(holder, { valid: false, message: "Ce nom est déjà pris" });
          } else {
            holder.dataset.usernameTaken = "0";
            setFormBuilderFieldState(holder, { valid: true, message: "" });
          }
        } catch {
          holder.dataset.usernameTaken = "0"; // fail open
        }
        updateFormBuilderSubmitState(form);
      });
    });

    form.addEventListener("click", (event) => {
      // Number selector arrows
      const arrow = event.target instanceof Element
        ? event.target.closest(".layout-formbuilder__number-arrow")
        : null;
      if (arrow instanceof HTMLButtonElement) {
        const wrap = arrow.closest(".layout-formbuilder__input-wrap");
        const input = wrap?.querySelector('input[data-number-step], input[type="number"]');
        if (input instanceof HTMLInputElement) {
          if (input.dataset.numberStep) {
            const step = Number(input.dataset.numberStep) || 1;
            const min = Number(input.dataset.numberMin) || step;
            const max = input.dataset.numberMax ? Number(input.dataset.numberMax) : Infinity;
            const prefix = input.dataset.numberPrefix || "";
            const raw = String(input.value || "").replace(/[^0-9.]/g, "");
            const current = raw ? Number(raw) : 0;
            const isUp = arrow.classList.contains("layout-formbuilder__number-arrow--up");
            if (isUp) {
              const next = current === 0 ? min : Math.min(current + step, max);
              input.value = prefix + next;
            } else {
              const next = current - step;
              input.value = next < min ? "" : prefix + next;
            }
          } else {
            if (arrow.classList.contains("layout-formbuilder__number-arrow--up")) {
              input.stepUp();
            } else {
              input.stepDown();
            }
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }

      const toggle = event.target instanceof Element
        ? event.target.closest(".layout-formbuilder__password-toggle")
        : null;
      if (!(toggle instanceof HTMLButtonElement)) return;

      const passwordHolder = toggle.closest(".layout-formbuilder__field--password");
      const input = passwordHolder?.querySelector("input[type='password'], input[type='text']");
      const icon = toggle.querySelector("img");
      if (!(input instanceof HTMLInputElement) || !(icon instanceof HTMLImageElement)) return;

      const nextVisible = input.type === "password";
      input.type = nextVisible ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(nextVisible));
      toggle.setAttribute("aria-label", nextVisible ? "Masquer le mot de passe" : "Afficher le mot de passe");
      icon.src = nextVisible
        ? "./assets/images/icons/icon_EyeOpen.svg"
        : "./assets/images/icons/icon_EyeClosed.svg";

      const fieldHolder = toggle.closest("[data-linked-column]");
      const formHost = toggle.closest(".layout-formbuilder");
      if (fieldHolder) fieldHolder.setAttribute("data-touched", "1");
      if (formHost instanceof HTMLFormElement) {
        collectFormBuilderPayload(formHost, { mutateUi: true, touchedOnly: true });
        updateFormBuilderSubmitState(formHost);
      }
    });
  });

  // Mundaneum checkbox: disable preceding fields in the same group
  document.querySelectorAll('.layout-formbuilder__checks[data-linked-column="mundaneum"], .layout-formbuilder__checks[data-linked-column="Mundaneum"]').forEach((checkHolder) => {
    const group = checkHolder.closest(".layout-formbuilder__group");
    if (!group) return;
    const fieldsContainer = group.querySelector(".layout-formbuilder__fields");
    if (!fieldsContainer) return;

    const allHolders = [...fieldsContainer.querySelectorAll("[data-linked-column]")];
    const checkIndex = allHolders.indexOf(checkHolder);
    const preceding = checkIndex > 0 ? allHolders.slice(0, checkIndex) : [];
    if (!preceding.length) return;

    const checkbox = checkHolder.querySelector("input[type='checkbox']");
    if (!checkbox) return;

    const mundaneumFill = {
      etablissement: "Mundaneum",
      adresse: "Rue de Nimy 76",
      localite: "Mons",
      code_postal: "7000",
    };

    const toggle = () => {
      const disabled = checkbox.checked;
      preceding.forEach((holder) => {
        holder.classList.toggle("is-disabled", disabled);
        const col = String(holder.getAttribute("data-linked-column") || "").trim();
        const input = holder.querySelector("input, select, textarea");
        if (input) {
          input.disabled = disabled;
          input.value = disabled ? (mundaneumFill[col] ?? "") : "";
        }
      });
      const formHost = checkHolder.closest(".layout-formbuilder");
      if (formHost instanceof HTMLFormElement) updateFormBuilderSubmitState(formHost);
    };

    checkbox.addEventListener("change", toggle);
    toggle();
  });

  // Wire start_date <-> end_date min/max constraints.
  document.querySelectorAll(".layout-formbuilder").forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    const startHolder = form.querySelector('[data-linked-column="start_date"]');
    const endHolder = form.querySelector('[data-linked-column="end_date"]');
    if (!startHolder || !endHolder) return;

    const startInput = startHolder.querySelector('input[type="date"]');
    const endInput = endHolder.querySelector('input[type="date"]');
    if (!startInput || !endInput) return;

    startInput.addEventListener("change", () => {
      const today = new Date().toISOString().slice(0, 10);
      if (startInput.value) {
        endInput.min = startInput.value > today ? startInput.value : today;
        if (endInput.value && endInput.value < startInput.value) {
          endInput.value = "";
          endInput.classList.remove("has-value");
          endHolder.removeAttribute("data-touched");
        }
      } else {
        endInput.min = today;
      }
      updateFormBuilderSubmitState(form);
    });

    endInput.addEventListener("change", () => {
      if (endInput.value) {
        startInput.max = endInput.value;
      } else {
        startInput.removeAttribute("max");
      }
      updateFormBuilderSubmitState(form);
    });
  });

  // Populate category dropdowns with prefetched thematiques
  const dropdowns = document.querySelectorAll('.layout-formbuilder__field[data-field-type="category"] .layout-formbuilder__dropdown');
  if (dropdowns.length) {
    thematiquesPromise.then((thematiques) => {
      dropdowns.forEach((dropdown) => {
        const list = dropdown.querySelector(".layout-formbuilder__dropdown-list");
        if (!list || list.children.length) return;
        thematiques.forEach((thm) => {
          const li = document.createElement("li");
          li.className = "layout-formbuilder__dropdown-item";
          li.dataset.value = String(thm.id);
          li.textContent = thm.titre;
          list.appendChild(li);
        });
      });
    });
  }

  // Custom dropdown toggle & selection
  document.querySelectorAll(".layout-formbuilder__dropdown").forEach((dropdown) => {
    if (dropdown.dataset.dropdownBound === "1") return;
    dropdown.dataset.dropdownBound = "1";

    const toggle = dropdown.querySelector(".layout-formbuilder__dropdown-toggle");
    const list = dropdown.querySelector(".layout-formbuilder__dropdown-list");
    const hiddenInput = dropdown.querySelector(".layout-formbuilder__dropdown-value");
    const labelSpan = dropdown.querySelector(".layout-formbuilder__dropdown-label");
    const placeholder = dropdown.dataset.placeholder || "-- Choix --";

    toggle.addEventListener("click", () => {
      const isOpen = dropdown.classList.contains("is-open");
      // Close all other dropdowns first
      document.querySelectorAll(".layout-formbuilder__dropdown.is-open").forEach((d) => d.classList.remove("is-open"));
      if (!isOpen) dropdown.classList.add("is-open");
    });

    list.addEventListener("click", (e) => {
      const item = e.target.closest(".layout-formbuilder__dropdown-item");
      if (!item) return;
      const val = item.dataset.value;
      hiddenInput.value = val;
      labelSpan.textContent = item.textContent;
      dropdown.classList.remove("is-open");
      dropdown.classList.add("has-value");

      // Trigger change event for validation
      const holder = dropdown.closest("[data-linked-column]");
      const formHost = dropdown.closest(".layout-formbuilder");
      if (holder) {
        holder.setAttribute("data-touched", "1");
      }
      if (formHost instanceof HTMLFormElement) {
        collectFormBuilderPayload(formHost, { mutateUi: true, touchedOnly: true });
        updateFormBuilderSubmitState(formHost);
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("is-open");
      }
    });
  });

  if (bindFormBuilderSubmissions._submitBound) return;
  bindFormBuilderSubmissions._submitBound = true;

  document.addEventListener("submit", async (event) => {
    const form = event.target instanceof HTMLFormElement
      ? event.target.closest(".layout-formbuilder")
      : null;

    if (!form) return;

    event.preventDefault();

    // Search overlay mode: dispatch search:query instead of normal form submission
    if (form.dataset.formMode === "search") {
      const input = form.querySelector(".layout-formbuilder__input");
      const q = String(input?.value ?? "").trim();
      if (q) window.dispatchEvent(new CustomEvent("search:query", { detail: { query: q } }));
      return;
    }

    const payload = collectFormBuilderPayload(form);
    const submitButton = form.querySelector(".layout-formbuilder__submit");
    let message = form.querySelector(".layout-formbuilder__message");

    const procRaw = String(payload.process ?? "").toLowerCase();
    const isTablelessProcess = procRaw === "connexion"
      || procRaw.includes("oublié")
      || procRaw.includes("réinitialisation")
      || procRaw.replace(/[-\s]/g, "") === "miseajourcompte";

    if (!payload.table && !isTablelessProcess) {
      if (!message) {
        message = document.createElement("p");
        message.className = "layout-formbuilder__message layout-formbuilder__message--error";
        form.appendChild(message);
      }
      message.textContent = "Aucune table cible n'est définie pour ce formulaire.";
      return;
    }

    if (payload.errors.length > 0) {
      if (!message) {
        message = document.createElement("p");
        message.className = "layout-formbuilder__message layout-formbuilder__message--error";
        form.appendChild(message);
      }
      message.textContent = payload.errors[0];
      message.classList.remove("layout-formbuilder__message--success");
      message.classList.add("layout-formbuilder__message--error");
      return;
    }

    if (!message) {
      message = document.createElement("p");
      message.className = "layout-formbuilder__message";
      form.appendChild(message);
    }

    message.textContent = "Envoi en cours...";
    message.classList.remove("layout-formbuilder__message--error", "layout-formbuilder__message--success");
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;

    const isRegistration = String(payload.process ?? "").toLowerCase() === "inscription";
    const isLogin = String(payload.process ?? "").toLowerCase() === "connexion";
    const isAtelier = String(payload.process ?? "").toLowerCase().replace(/[\s'\u2019]/g, "") === "créationdatelier" ||
      String(payload.process ?? "").toLowerCase().includes("atelier");
    const isForgotPassword = String(payload.process ?? "").toLowerCase().replace(/[\s''\u2019]/g, "").includes("motdepasseoublié") ||
      String(payload.process ?? "").toLowerCase().includes("oublié");
    const isResetPassword = String(payload.process ?? "").toLowerCase().replace(/[\s''\u2019]/g, "").includes("réinitialisation") ||
      String(payload.process ?? "").toLowerCase().includes("réinitialisation");
    const isMiseAJourCompte = String(payload.process ?? "").toLowerCase().replace(/[-\s]/g, "") === "miseajourcompte";
    const atelierEditId = form.dataset.atelierEditId ? Number(form.dataset.atelierEditId) : null;
    const isAdminAtelierEditMode = form.dataset.adminAtelierEditMode === "1";

    try {
      if (isForgotPassword) {
        // Fallback: find email from the form input directly if values.email is missing
        const emailFromValues = String(payload.values.email ?? payload.values.password ?? "").trim();
        const emailInput = form.querySelector("input[type='email']");
        const email = emailFromValues || (emailInput instanceof HTMLInputElement ? emailInput.value.trim() : "");
        await forgotPasswordRequest(email);
        message.textContent = "Un lien de réinitialisation vous a été envoyé.";
        message.classList.add("layout-formbuilder__message--success");
        // Disable all inputs and submit button
        form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
        // Auto-close overlay after 3 seconds
        setTimeout(() => closePageOverlay(), 3000);
        return;
      }

      if (isResetPassword) {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get("reset_token") || "";
        const password = String(payload.values.password ?? payload.values["mot de passe"] ?? "").trim();
        if (!token) {
          message.textContent = "Lien invalide. Veuillez recommencer la procédure.";
          message.classList.add("layout-formbuilder__message--error");
          return;
        }
        await resetPasswordRequest(token, password);
        message.textContent = "Mot de passe mis à jour. Vous pouvez maintenant vous connecter.";
        message.classList.add("layout-formbuilder__message--success");
        form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
        // Clean token from URL without reload
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("reset_token");
        window.history.replaceState({}, "", newUrl.toString());
        setTimeout(() => closePageOverlay(), 3000);
        return;
      }

      if (isRegistration) {
        const remember = getFormBuilderRememberChoice(payload.values);
        const credentials = getFormBuilderAuthCredentials(form);
        const registrationPayload = await registerAuthUser(payload.values);

        if (credentials.email) {
          rememberAuthPreference(credentials.email, remember);
        }

        const authPayload = registrationPayload?.token && registrationPayload?.user
          ? registrationPayload
          : (credentials.email && credentials.password
              ? await loginAuthUser(credentials)
              : null);

        if (authPayload?.token && authPayload?.user) {
          persistAuthSession(authPayload, { email: credentials.email, remember });
          window.dispatchEvent(new CustomEvent("auth:session-updated"));
        }

        const registeredUsername = getFormBuilderRegistrationUsername(
          payload.values,
          authPayload?.user?.username || registrationPayload?.user?.username || ""
        );
        pageOverlayLastRegisteredUsername = registeredUsername;

        openPageOverlayWithRequest({
          exactTitle: "Inscription réussie",
          search: "Inscription réussie",
          backLabel: pageOverlayBackLabel || "Retour au site",
          overlayMode: "overlayTotal",
          username: registeredUsername,
          logo: defaultOverlayLogo({ exactTitle: "Inscription" })
        }, "Inscription réussie");

        return;
      } else if (isLogin) {
        const remember = getFormBuilderRememberChoice(payload.values);
        const credentials = getFormBuilderAuthCredentials(form);

        if (!credentials.email || !credentials.password) {
          throw new Error("Email et mot de passe requis.");
        }

        if (credentials.email) {
          rememberAuthPreference(credentials.email, remember);
        }

        const authPayload = await loginAuthUser({ email: credentials.email, password: credentials.password, remember });

        if (!authPayload?.token || !authPayload?.user) {
          throw new Error("Connexion échouée.");
        }

        persistAuthSession(authPayload, { email: credentials.email, remember });
        window.dispatchEvent(new CustomEvent("auth:session-updated"));

        const redirectAfterLogin = pageOverlayCurrentRequest?.redirectAfterLogin ?? null;
        closePageOverlay();
        if (redirectAfterLogin) {
          openPageOverlayWithRequest(redirectAfterLogin, "Création d'atelier");
        }

        return;
      } else if (isMiseAJourCompte) {
        const token = getStoredToken();
        if (!token) throw new Error("Vous n'êtes pas connecté.");
        const authPayload = await updateUserProfile(payload.values, token);
        if (authPayload?.token && authPayload?.user) {
          persistAuthSession(authPayload, {});
          window.dispatchEvent(new CustomEvent("auth:session-updated"));
        }
        message.textContent = "Profil mis à jour.";
        message.classList.add("layout-formbuilder__message--success");
        form.closest("#page-overlay-content")?.dispatchEvent(new CustomEvent("compte:saved"));
        return;
      } else {
        const currentUser = getStoredUser();
        const userId = currentUser?.id ? Number(currentUser.id) : null;
        if (userId) payload.values.user_id = userId;

        if (atelierEditId) {
          const editToken = getStoredToken();
          if (!editToken) throw new Error("Vous n'êtes pas connecté.");
          if (isAdminAtelierEditMode) {
            await updateAdminAtelier(atelierEditId, payload.values, editToken);
          } else {
            await updateMyAtelier(atelierEditId, payload.values, editToken);
          }
          clearFormBuilderDraft(form);
          if (isAdminAtelierEditMode) {
            openPageOverlayWithRequest(
              parsePageOverlayDescriptor("title:AdminTool|search:admintool|back:Retour au site|overlay:overlayTotal"),
              "Admin Tool"
            );
          } else {
            openPageOverlayWithRequest(
              parsePageOverlayDescriptor("title:Compte utilisateur|search:compte utilisateur|back:Retour au site|overlay:overlayTotal"),
              "Compte utilisateur"
            );
          }
          return;
        } else {
          await submitFormBuilderEntry(payload);
        }

        if (isAtelier) {
          const thematiques = await thematiquesPromise;
          const thematiqueName = (() => {
            const tid = payload.values.thematique_id;
            if (!tid) return "";
            const match = thematiques.find((t) => String(t.id) === String(tid));
            return match ? (match.titre || "") : "";
          })();

          clearFormBuilderDraft(form);
          openPageOverlayWithRequest({
            exactTitle: "Atelier programmé",
            search: "Atelier programmé",
            backLabel: pageOverlayBackLabel || "Retour au site",
            overlayMode: "overlayTotal",
            logo: defaultOverlayLogo({ exactTitle: "Atelier programmé" }),
            atelierData: {
              username: currentUser?.username || "",
              nom: String(payload.values.nom || ""),
              prenom: String(payload.values.prenom || ""),
              email: String(payload.values.email || ""),
              telephone: String(payload.values.telephone || ""),
              etablissement: String(payload.values.etablissement || ""),
              adresse: String(payload.values.adresse || ""),
              code_postal: String(payload.values.code_postal || ""),
              localite: String(payload.values.localite || ""),
              mundaneum: !!payload.values.mundaneum,
              start_date: String(payload.values.start_date || ""),
              end_date: String(payload.values.end_date || ""),
              nb_participants: payload.values.nb_participants != null ? String(payload.values.nb_participants) : "",
              thematique: thematiqueName,
              displayEvent: (payload.values.displayevent || payload.values.displayEvent) ? "Oui" : "Non",
              displayContact: (payload.values.displaycontact || payload.values.displayContact) ? "Oui" : "Non"
            }
          }, "Atelier programmé");
          return;
        }
      }

      message.textContent = payload.process || "Formulaire enregistré.";
      message.classList.add("layout-formbuilder__message--success");
      clearFormBuilderDraft(form);
      form.reset();
      form.querySelectorAll("[data-linked-column], .layout-formbuilder__checks--settings").forEach((holder) => {
        holder.removeAttribute("data-touched");
        holder.classList.remove("is-invalid", "is-valid");
        const input = holder.querySelector("input, select, textarea");
        if (input) input.classList.remove("is-invalid");
        const errorNode = holder.querySelector(".layout-formbuilder__error");
        if (errorNode) errorNode.textContent = "";
      });
      updateFormBuilderSubmitState(form);
    } catch (error) {
      saveFormBuilderDraft(form);
      const apiMessage = typeof error?.payload?.message === "string"
        ? error.payload.message
        : (error instanceof Error ? error.message : "Erreur lors de l'envoi.");

      if (isAtelier && !atelierEditId) {
        openErrorOverlay();
        return;
      }

      if (atelierEditId) {
        message.textContent = apiMessage || "Erreur lors de la modification.";
        message.classList.add("layout-formbuilder__message--error");
        return;
      }

      if (isRegistration) {
        const alertMessage = getRegistrationAlertMessage(error);
        pageOverlayLastAlertMessage = alertMessage;

        openPageOverlayWithRequest({
          exactTitle: "Inscription refusée",
          search: "Inscription refusée",
          backLabel: "Retour à l'inscription",
          overlayMode: "overlayTotal",
          username: pageOverlayLastRegisteredUsername,
          alert: alertMessage,
          inlineReturnToInscription: true,
          logo: defaultOverlayLogo({ exactTitle: "Inscription" })
        }, "Inscription refusée");

        return;
      }

      if (isLogin) {
        // Mark email and password fields as invalid.
        form.querySelectorAll("[data-linked-column]").forEach((holder) => {
          const ft = String(holder.getAttribute("data-field-type") || "").toLowerCase();
          if (ft === "email" || ft === "password") {
            setFormBuilderFieldState(holder, { valid: false, message: "" });
          }
        });
        message.textContent = "Adresse email ou mot de passe incorrectes.";
        message.classList.add("layout-formbuilder__message--error");
        return;
      }

      if (isMiseAJourCompte) {
        const payloadCode = String(error?.payload?.code || "");
        const payloadMsg = String(error?.payload?.message || "");
        if (payloadCode === "username_exists") {
          const usernameHolder = form.querySelector('[data-field-type="username"]');
          if (usernameHolder) {
            usernameHolder.dataset.usernameTaken = "1";
            setFormBuilderFieldState(usernameHolder, { valid: false, message: "Ce nom est déjà pris" });
          }
          message.textContent = "Ce nom d'utilisateur est déjà pris.";
        } else if (payloadCode === "email_exists") {
          const emailHolder = form.querySelector('[data-field-type="email"]');
          if (emailHolder) setFormBuilderFieldState(emailHolder, { valid: false, message: "Cette adresse est déjà utilisée" });
          message.textContent = "Cette adresse email est déjà utilisée.";
        } else {
          message.textContent = payloadMsg || "Erreur lors de la mise à jour.";
        }
        message.classList.add("layout-formbuilder__message--error");
        return;
      }

      openErrorOverlay();
    } finally {
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
      updateFormBuilderSubmitState(form);
    }
  });
}

bindFormBuilderSubmissions._submitBound = false;

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
  document.body.classList.toggle("is-main-overlay-open", isFullscreen);
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
    pageOverlayCache.set(key, fetchPage(options));
  }

  return pageOverlayCache.get(key);
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
  const sections = await sectionsPromise;

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

  bindFormBuilderSubmissions();
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
      thematiquesPromise,
      sectionsPromise
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
      .then(([page, ateliers]) => setPageOverlayContent(page, "", request.logo, { preloadedAteliers: ateliers }))
      .catch(() => openErrorOverlay());
  } else {
    getOverlayPage(request)
      .then((page) => setPageOverlayContent(page, "", request.logo))
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

function setCurrentYear() {
  const yearNode = document.getElementById("current-year");

  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }
}

setCurrentYear();
hydrateMainSections()
  .then(() => {
    window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));
  })
  .catch(() => {});
hydrateSocialLinks().catch(() => {});
bindPageOverlay();
bindSectionScrollLinks();
initHeaderAuth();
bindFormBuilderSubmissions();
bindSearchOverlay();

// Auto-open reset password overlay when ?reset_token= is present in URL
(function autoOpenResetOverlay() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("reset_token")) return;
  openPageOverlayWithRequest({
    id: 327,
    exactTitle: "Nouveau mot de passe",
    backLabel: "Retour au site",
    overlayMode: "overlayTotal"
  }, "Nouveau mot de passe");
})();

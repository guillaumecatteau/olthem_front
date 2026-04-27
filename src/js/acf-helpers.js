import { esc, plainText, normKey, slugify } from "./utils.js";

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


export {
  formSettingKeyFromChoice,
  arrowSpan,
  pickField,
  num,
  imageUrl,
  linkHref,
  linkTarget,
  boolValue,
  pageSlugFromHref,
  buildPageOverlayDescriptor,
  titleLogoUrl,
  formBuilderPrimitive,
  formBuilderChoice
};

import { esc, plainText, normKey } from "./utils.js";
import {
  checkUsernameAvailable,
  updateUserProfile,
  updateMyAtelier,
  updateAdminAtelier
} from "./api.js";
import {
  loginAuthUser,
  persistAuthSession,
  registerAuthUser,
  rememberAuthPreference,
  getStoredToken,
  getStoredUser,
  forgotPasswordRequest,
  resetPasswordRequest
} from "./auth.js";
import { submitFormBuilderEntry } from "./forms-api.js";
import {
  formSettingKeyFromChoice,
  arrowSpan,
  pickField,
  num,
  imageUrl,
  boolValue,
  formBuilderPrimitive,
  formBuilderChoice,
  buildPageOverlayDescriptor
} from "./acf-helpers.js";

// Injected at init by main.js via setFormBuilderDependencies()
let _openOverlay = null;
let _closeOverlay = null;
let _getOverlayCurrentRequest = () => null;
let _thematiquesPromise = Promise.resolve([]);

export function setFormBuilderDependencies(deps) {
  if (deps.openOverlay) _openOverlay = deps.openOverlay;
  if (deps.closeOverlay) _closeOverlay = deps.closeOverlay;
  if (deps.getOverlayCurrentRequest) _getOverlayCurrentRequest = deps.getOverlayCurrentRequest;
  if (deps.thematiquesPromise) _thematiquesPromise = deps.thematiquesPromise;
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
    _thematiquesPromise.then((thematiques) => {
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
        setTimeout(() => _closeOverlay(), 3000);
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
        setTimeout(() => _closeOverlay(), 3000);
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

        _openOverlay({
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

        const redirectAfterLogin = _getOverlayCurrentRequest()?.redirectAfterLogin ?? null;
        _closeOverlay();
        if (redirectAfterLogin) {
          _openOverlay(redirectAfterLogin, "Création d'atelier");
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
            _openOverlay(
              parsePageOverlayDescriptor("title:AdminTool|search:admintool|back:Retour au site|overlay:overlayTotal"),
              "Admin Tool"
            );
          } else {
            _openOverlay(
              parsePageOverlayDescriptor("title:Compte utilisateur|search:compte utilisateur|back:Retour au site|overlay:overlayTotal"),
              "Compte utilisateur"
            );
          }
          return;
        } else {
          await submitFormBuilderEntry(payload);
        }

        if (isAtelier) {
          const thematiques = await _thematiquesPromise;
          const thematiqueName = (() => {
            const tid = payload.values.thematique_id;
            if (!tid) return "";
            const match = thematiques.find((t) => String(t.id) === String(tid));
            return match ? (match.titre || "") : "";
          })();

          clearFormBuilderDraft(form);
          _openOverlay({
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

        _openOverlay({
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


export {
  renderFormBuilderField,
  renderFormBuilderGroup,
  renderFormBuilderLayout,
  updateFormBuilderSubmitState,
  bindFormBuilderSubmissions
};

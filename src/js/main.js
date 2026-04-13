import { fetchPage, fetchSections, fetchOptions } from "./api.js";
import { initHeaderAuth, loginAuthUser, persistAuthSession, registerAuthUser, rememberAuthPreference } from "./auth.js";
import { submitFormBuilderEntry } from "./forms-api.js";

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
  const label = plainText(pickField(item, ["label", "Label"])) || "Champ";
  const title = plainText(pickField(item, ["champ_title", "champTitle", "title", "Title"])) || "";
  const linkedColumn = plainText(pickField(item, ["linked_column", "linked_colomn", "linkedColumn"])) || "";
  const id = `fb-${groupIndex}-${fieldIndex}`;

  if (key === "champlarge" || key === "champ") {
    const typeRaw = String(pickField(item, ["champ_type", "champType"]) || "Text").trim().toLowerCase();
    const isEmail = typeRaw === "mail" || typeRaw === "email";
    const isPassword = typeRaw === "password" || typeRaw === "mot de passe" || typeRaw === "motdepasse";
    const type = isEmail ? "email" : (isPassword ? "password" : "text");

    const auto = type === "password" ? "new-password" : "off";
    const passwordToggle = type === "password"
      ? `<button class="layout-formbuilder__password-toggle" type="button" aria-label="Afficher le mot de passe" aria-pressed="false"><img src="./assets/images/icons/icon_EyeClosed.svg" alt="" aria-hidden="true" /></button>`
      : "";

    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}${type === "password" ? " layout-formbuilder__field--password" : ""}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="${esc(type)}">
        <input id="${esc(id)}" class="layout-formbuilder__input" type="${esc(type)}" placeholder="${esc(label)}" autocomplete="${esc(auto)}" />
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        ${passwordToggle}
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
  }

  if (key === "dateselector") {
    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="date">
        <input id="${esc(id)}" class="layout-formbuilder__input" type="date" placeholder="${esc(label)}" autocomplete="off" />
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
  }

  if (key === "numberselector") {
    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="number">
        <input id="${esc(id)}" class="layout-formbuilder__input" type="number" placeholder="${esc(label)}" autocomplete="off" />
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
  }

  if (key === "categoryselector") {
    return `
      <label class="layout-formbuilder__field layout-formbuilder__field--${size}" for="${esc(id)}" data-linked-column="${esc(linkedColumn)}" data-field-type="category">
        <select id="${esc(id)}" class="layout-formbuilder__input layout-formbuilder__select">
          <option value="">${esc(label || title || "Sélectionner")}</option>
        </select>
        <span class="layout-formbuilder__valid-icon" aria-hidden="true"><img src="./assets/images/icons/icon_check.svg" alt="" /></span>
        <p class="layout-formbuilder__error" aria-live="polite"></p>
      </label>`;
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

  const fieldsHtml = entries.map((item) => {
    const key = normKey(item?.acf_fc_layout);

    if (key === "grouptitle") {
      groupTitle = plainText(pickField(item, ["title", "Title"]));
      return "";
    }

    const html = renderFormBuilderField(item, groupIndex, fieldIndex);
    fieldIndex += 1;
    return html;
  }).join("");

  if (!groupTitle && !fieldsHtml) return "";

  const titleHtml = groupTitle ? `<h3 class="layout-formbuilder__group-title">${esc(groupTitle)}</h3>` : "";

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
        const settingKey = formSettingKeyFromChoice(choice, index);
        return `
        <label class="layout-formbuilder__check-option" for="fb-settings-check-${index}">
          <input id="fb-settings-check-${index}" type="checkbox" value="${esc(choice.value)}" data-setting-key="${esc(settingKey)}" />
          <span>${esc(choice.label)}</span>
        </label>`;
      }).join("")}<p class="layout-formbuilder__error" aria-live="polite"></p></div>`
    : "";
  const isDouble = String(formType).toLowerCase() === "double";

  return `
    <form class="layout-formbuilder ${isDouble ? "layout-formbuilder--double" : "layout-formbuilder--simple"}" data-form-type="${esc(formType)}" data-form-process="${esc(formProcess)}" data-linked-table="${esc(linkedTable)}" autocomplete="off" novalidate>
      ${groupsHtml}
      ${formChecksHtml}
      <div class="layout-formbuilder__actions">
        <button class="buttonRound layout-formbuilder__submit" type="submit" disabled>${esc(buttonLabel)}</button>
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
  const isValid = !!state.valid;
  const message = String(state.message || "");

  if (input && !isValid) {
    input.classList.add("is-invalid");
  }

  if (input && isValid) {
    input.classList.remove("is-invalid");
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

    if (holder.classList.contains("layout-formbuilder__checks")) {
      const checked = [...holder.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
      values[column] = checked;
      if (!checked.length) {
        if (mutateUi) {
          holder.classList.add("is-invalid");
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez sélectionner au moins une option" });
        }
        errors.push("Veuillez sélectionner au moins une option");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
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
      const strong = !!value && isValidStrongPassword(value);
      if (!value || !isValidStrongPassword(value)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "8 caractères minimum, avec 1 majuscule et 1 chiffre" });
        }
        errors.push("8 caractères minimum, avec 1 majuscule et 1 chiffre");
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

      const asNumber = Number(value);
      if (!Number.isFinite(asNumber)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez saisir un nombre valide" });
        }
        errors.push("Veuillez saisir un nombre valide");
        return;
      }

      if (mutateUi) {
        setFormBuilderFieldState(holder, { valid: true, message: "" });
      }
      values[column] = Number.isInteger(asNumber) ? asNumber : asNumber;
      return;
    }

    if (fieldType === "date") {
      if (!value || !isValidYmdDate(value)) {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: false, message: "Veuillez saisir une date valide" });
        }
        errors.push("Veuillez saisir une date valide");
      } else {
        if (mutateUi) {
          setFormBuilderFieldState(holder, { valid: true, message: "" });
        }
      }
      values[column] = value;
      return;
    }

    values[column] = value;

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

  const payload = collectFormBuilderPayload(form, { mutateUi: false });
  const canSubmit = !!payload.table && payload.errors.length === 0;
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

    form.addEventListener("click", (event) => {
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

  if (bindFormBuilderSubmissions._submitBound) return;
  bindFormBuilderSubmissions._submitBound = true;

  document.addEventListener("submit", async (event) => {
    const form = event.target instanceof HTMLFormElement
      ? event.target.closest(".layout-formbuilder")
      : null;

    if (!form) return;

    event.preventDefault();

    const payload = collectFormBuilderPayload(form);
    const submitButton = form.querySelector(".layout-formbuilder__submit");
    let message = form.querySelector(".layout-formbuilder__message");

    if (!payload.table) {
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

    try {
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
      } else {
        await submitFormBuilderEntry(payload);
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

      message.textContent = apiMessage;
      message.classList.add("layout-formbuilder__message--error");
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
      const showTitle = !!pickField(titleLayout, ["displaytitle", "displaytile", "displayTitle", "displayTile"]);
      const showSubtitle = !!pickField(titleLayout, ["displaysubtitle", "displaySubtitle"]);

      const rowLabel = title || subtitle || `Sous-section ${index + 1}`;

      return {
        title: rowLabel,
        subtitle,
        showTitle,
        showSubtitle,
        layouts: contentLayouts
      };
    })
    .filter((sub) => sub.layouts.length > 0);
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

function applyOverlayDynamicTokens(rawHtml, request = {}) {
  let html = String(rawHtml ?? "");
  const username = overlayUsernameFromRequest(request);
  const alert = overlayAlertFromRequest(request);
  const apostrophe = "(?:'|’|&#39;|&#x27;|&apos;|&rsquo;|&#8217;)";
  const space = "(?:\\s|&nbsp;|\\u00A0)+";
  const brandPattern = new RegExp(
    `on${space}n${apostrophe}a${space}que${space}l${apostrophe}info${space}qu${apostrophe}on${space}se${space}donne`,
    "gi"
  );

  if (username) {
    html = html.replace(/\[USERNAME\]/g, `<strong class="page-overlay__token-username">${esc(username)}</strong>`);
  }

  if (alert) {
    html = html.replace(/\[ALERT\]/g, `<strong class="page-overlay__token-alert">${esc(alert)}</strong>`);
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
    const showLogo = !!pickField(layout, ["logo", "Logo"]);
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

function renderSectionSubsections(host, subsections) {
  if (!host || !Array.isArray(subsections) || !subsections.length) return;

  host.classList.add("section-inner--subsections");

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

    const showTitle = current.showTitle !== false;
    const titleText = current.title || "";
    const titleHtml = showTitle && titleText
      ? `<div class="section-subsections__title-block"><div class="section-subsections__title-wrap">${arrowSpan("right")}<h2 class="section-subsections__title">${esc(titleText)}</h2>${arrowSpan("left")}</div>${current.showSubtitle && current.subtitle ? `<p class="section-subsections__subtitle">${esc(current.subtitle)}</p>` : ""}</div>`
      : "";

    content.innerHTML = titleHtml + current.layouts.map(renderSectionLayout).join("");

    // Align spacing behavior with paragraph titles: the element before a title
    // yields its bottom margin so only the title spacing drives the gap.
    content.querySelectorAll(".layout-paragraph-title, .section-builder-inner-title").forEach((el) => {
      if (el.previousElementSibling) {
        el.previousElementSibling.style.marginBottom = "0";
      }
    });

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

    const sectionSubsections = parseSectionSubsections(section.builder);

    if (sectionSubsections.length > 0) {
      renderSectionSubsections(host, sectionSubsections);
      return;
    }

    const html = flattenLayouts(section.builder).map(renderSectionLayout).join("");
    if (html) host.innerHTML = `<div class="section-builder-stack">${html}</div>`;
  });

  bindFormBuilderSubmissions();
}

function setPageOverlayContent(page, fallbackTitle = "Page", fallbackLogo = null) {
  const content = document.getElementById("page-overlay-content");
  if (!content) return;

  const overlayHeading = (title, logo = null) => {
    const safeTitle = plainText(title || fallbackTitle) || fallbackTitle;
    const logoHtml = logo
      ? `<div class="section-builder-title__logo-wrap"><img class="section-builder-title__title-logo" src="${esc(logo)}" alt="" loading="lazy" aria-hidden="true" /></div>`
      : "";

    return `
      <div class="section-builder-title section-builder-title--overlay">
        ${logoHtml}
        <div class="section-builder-title__title-wrap">
          ${arrowSpan("right")}
          <h1 class="section-builder-title__title">${esc(safeTitle)}</h1>
          ${arrowSpan("left")}
        </div>
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

    return {
      title,
      logo: (showLogo || !!resolvedLogo) ? (resolvedLogo || defaultLogo) : defaultLogo
    };
  };

  if (!page) {
    const heading = overlayHeading(fallbackTitle, fallbackLogo);
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
      : {};
    const inlineCloseHtml = isOverlayTotalRequest(pageOverlayCurrentRequest || {})
      ? pageOverlayInlineCloseHtml(pageOverlayBackLabel, inlineOptions)
      : "";
    content.innerHTML = `
      ${heading}
      <p>Le contenu de la page n'a pas pu être chargé.</p>
      ${inlineCloseHtml}`;
    applyPageOverlayMode(pageOverlayCurrentRequest || {});
    return;
  }

  const headingData = overlayTitleFromBuilder(page.builder, page.title || fallbackTitle, fallbackLogo);
  const heading = overlayHeading(headingData.title, headingData.logo);
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
}

function setPageOverlayLoading(fallbackTitle = "Chargement", fallbackLogo = null) {
  const content = document.getElementById("page-overlay-content");
  if (!content) return;

  const logoHtml = fallbackLogo
    ? `<div class="section-builder-title__logo-wrap"><img class="section-builder-title__title-logo" src="${esc(fallbackLogo)}" alt="" loading="lazy" aria-hidden="true" /></div>`
    : "";

  const heading = `
    <div class="section-builder-title section-builder-title--overlay">
      ${logoHtml}
      <div class="section-builder-title__title-wrap">
        ${arrowSpan("right")}
        <h1 class="section-builder-title__title">${esc(fallbackTitle)}</h1>
        ${arrowSpan("left")}
      </div>
    </div>`;

  content.innerHTML = `
    ${heading}
    <p>Chargement en cours...</p>`;

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

function openPageOverlayWithRequest(request, fallbackTitle = "Page") {
  const overlay = document.getElementById("page-overlay");
  const closeLabel = document.getElementById("page-overlay-close-label");
  if (!overlay || !request) return;

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
  setPageOverlayLoading(fallbackTitle, request.logo);
  syncPageOverlayUrl(request);
  window.dispatchEvent(new CustomEvent("secondary-scroll:refresh"));

  getOverlayPage(request)
    .then((page) => setPageOverlayContent(page, fallbackTitle, request.logo))
    .catch(() => setPageOverlayContent(null, fallbackTitle, request.logo));
}

function openPageOverlay(trigger) {
  const request = pageOverlayRequestFromTrigger(trigger);
  const fallbackTitle = request.exactTitle || trigger.textContent?.trim() || "Page";
  openPageOverlayWithRequest(request, fallbackTitle);
}

function closePageOverlay() {
  const overlay = document.getElementById("page-overlay");
  if (!overlay) return;

  overlay.classList.remove("is-visible");
  overlay.setAttribute("aria-hidden", "true");
  pageOverlayCurrentRequest = null;
  restorePageOverlayUrl();

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

// ─── Rendu du FormBuilder ──────────────────────────────────────────────────────
// Responsabilité : rendu HTML des champs, groupes et layouts de formulaire,
// état du bouton submit, et injection des dépendances overlay.
// La validation et la soumission sont dans form-validator.js / form-submit.js.
// ──────────────────────────────────────────────────────────────────────────────

import { esc, plainText, normKey } from "../../core/utils.js";
import {
  formSettingKeyFromChoice,
  arrowSpan,
  pickField,
  num,
  imageUrl,
  boolValue,
  formBuilderPrimitive,
  formBuilderChoice,
  buildPageOverlayDescriptor,
  titleLogoUrl
} from "../../helpers/acf-helpers.js";
import { collectFormBuilderPayload } from "./form-validator.js";
import {
  bindFormBuilderSubmissions,
  setFormSubmitDependencies,
  setFormSubmitUpdateFn,
  isFormBuilderRetryMode,
  hydrateFormBuilderFromDraft,
  clearFormBuilderDraft
} from "./form-submit.js";

// ─── Dépendances injectées depuis main.js ─────────────────────────────────────

let _openOverlay = null;
let _closeOverlay = null;
let _getOverlayCurrentRequest = () => null;
let _thematiquesPromise = Promise.resolve([]);

export function setFormBuilderDependencies(deps) {
  if (deps.openOverlay) _openOverlay = deps.openOverlay;
  if (deps.closeOverlay) _closeOverlay = deps.closeOverlay;
  if (deps.getOverlayCurrentRequest) _getOverlayCurrentRequest = deps.getOverlayCurrentRequest;
  if (deps.thematiquesPromise) _thematiquesPromise = deps.thematiquesPromise;
  // Propager à form-submit.js
  setFormSubmitDependencies(deps);
  // Injecter updateFormBuilderSubmitState dans form-submit.js
  setFormSubmitUpdateFn(updateFormBuilderSubmitState);
}

// ─── Rendu d'un champ ─────────────────────────────────────────────────────────

export function renderFormBuilderField(item, groupIndex, fieldIndex) {
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

    // Defaults par colonne connue (participants_count)
    const isParticipants = linkedColumn === "participants_count";
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

// ─── Rendu d'un groupe de champs ──────────────────────────────────────────────

export function renderFormBuilderGroup(row, groupIndex) {
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

// ─── Rendu d'un layout complet ────────────────────────────────────────────────

export function renderFormBuilderLayout(layout) {
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

// ─── État du bouton submit ────────────────────────────────────────────────────

export function updateFormBuilderSubmitState(form) {
  const submitButton = form.querySelector(".layout-formbuilder__submit");
  if (!(submitButton instanceof HTMLButtonElement)) return;

  // Mode recherche : activé si l'input a une valeur non vide
  if (form.dataset.formMode === "search") {
    const input = form.querySelector(".layout-formbuilder__input");
    submitButton.disabled = !String(input?.value ?? "").trim();
    return;
  }

  // Mode mise à jour du compte : géré uniquement par la détection de changements
  if (String(form.dataset.formProcess || "").toLowerCase().replace(/[-\s]/g, "") === "miseajourcompte") {
    return;
  }

  // Mode édition atelier : géré uniquement par la détection de changements
  if (form.dataset.atelierEditMode === "1") {
    return;
  }

  // Mode édition atelier admin : géré uniquement par la détection de changements
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

// ─── Re-exports pour rétrocompatibilité ──────────────────────────────────────

export { bindFormBuilderSubmissions };

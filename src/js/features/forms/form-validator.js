// ─── Validation des champs et collecte du payload de formulaire ───────────────
// Fonctions de validation par type de champ, état visuel et collecte des valeurs
// ──────────────────────────────────────────────────────────────────────────────

// ─── Validateurs de format ────────────────────────────────────────────────────

export function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidBelgianPostalCode(value) {
  return /^[1-9]\d{3}$/.test(value);
}

export function isValidPhoneNumber(value) {
  const digits = value.replace(/[\s.\-()\/+]/g, "");
  return /^\d{9,12}$/.test(digits);
}

export function isValidYmdDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yy, mm, dd] = value.split("-").map(Number);
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  return date.getUTCFullYear() === yy && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd;
}

export function isValidStrongPassword(value) {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(value);
}

// ─── État visuel d'un champ ───────────────────────────────────────────────────

/**
 * Applique ou retire l'état valide/invalide sur un champ et son message d'erreur.
 * @param {Element} holder - Le conteneur du champ (data-linked-column)
 * @param {{ valid: boolean, message?: string }} state
 */
export function setFormBuilderFieldState(holder, state = {}) {
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

// ─── Collecte du payload ──────────────────────────────────────────────────────

/**
 * Parcourt tous les champs d'un formulaire, valide chacun et retourne
 * { table, process, values, errors }.
 *
 * @param {HTMLFormElement} form
 * @param {{ mutateUi?: boolean, touchedOnly?: boolean }} options
 */
export function collectFormBuilderPayload(form, options = {}) {
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

    // Champs désactivés (ex: Mundaneum coché) : valeur capturée sans validation
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
      // Case unique → scalaire 1/0 (colonne TINYINT) ; groupe → tableau
      values[column] = allCheckboxes.length === 1 ? (checked.length > 0 ? 1 : 0) : checked;
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

      // Contraintes data-number-min / data-number-max (compteurs personnalisés)
      const numInput = holder.querySelector("input[data-number-min]");
      if (numInput instanceof HTMLInputElement) {
        const cMin = Number(numInput.dataset.numberMin);
        const cMax = numInput.dataset.numberMax ? Number(numInput.dataset.numberMax) : null;
        if (Number.isFinite(cMin) && asNumber < cMin) {
          if (mutateUi) setFormBuilderFieldState(holder, { valid: false, message: `Valeur minimale : ${cMin}` });
          errors.push(`Valeur minimale : ${cMin}`);
          return;
        }
        if (cMax !== null && Number.isFinite(cMax) && asNumber > cMax) {
          if (mutateUi) setFormBuilderFieldState(holder, { valid: false, message: `Valeur maximale : ${cMax}` });
          errors.push(`Valeur maximale : ${cMax}`);
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

  // Vérification de correspondance entre deux champs mot de passe
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

  // Validation croisée start_date / end_date
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

  // Collecte des cases à cocher de paramétrage (settings checkboxes)
  form.querySelectorAll(".layout-formbuilder__checks--settings input[type='checkbox'][data-setting-key]").forEach((input) => {
    const key = String(input.getAttribute("data-setting-key") || "").trim();
    if (!key) return;
    values[key] = input.checked ? 1 : 0;
  });

  // Normalisation du champ "remember"
  const rememberEntry = Object.entries(values).find(([key]) => /remember|souvenir/.test(String(key).toLowerCase()));
  if (rememberEntry) {
    const rememberRaw = rememberEntry[1];
    values.remember = rememberRaw === true || rememberRaw === 1 || rememberRaw === "1" ? 1 : 0;
  }

  return { table, process, values, errors };
}

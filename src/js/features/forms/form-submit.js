// ─── Soumission des formulaires FormBuilder ────────────────────────────────────
// Gestion du cycle de vie de soumission : brouillons, validation, appels API,
// redirection post-soumission. Importé et ré-exporté par form-builder.js.
// ──────────────────────────────────────────────────────────────────────────────

import {
  collectFormBuilderPayload,
  setFormBuilderFieldState
} from "./form-validator.js";
import {
  checkUsernameAvailable,
  updateUserProfile,
  updateMyAtelier,
  updateAdminAtelier,
  submitFormBuilderEntry
} from "../../api/api.js";
import {
  loginAuthUser,
  persistAuthSession,
  registerAuthUser,
  getStoredToken,
  getStoredUser,
  forgotPasswordRequest,
  resetPasswordRequest
} from "../../api/auth.js";
import { plainText } from "../../core/utils.js";
import { titleLogoUrl } from "../../helpers/acf-helpers.js";

// ─── Variables injectées depuis form-builder.js (via setFormBuilderDependencies) ─

let _openOverlay = null;
let _closeOverlay = null;
let _getOverlayCurrentRequest = () => null;
let _thematiquesPromise = Promise.resolve([]);

/**
 * Reçoit les dépendances de navigation overlay depuis form-builder.js.
 * Appelé par setFormBuilderDependencies() de form-builder.js.
 */
export function setFormSubmitDependencies(deps) {
  if (deps.openOverlay) _openOverlay = deps.openOverlay;
  if (deps.closeOverlay) _closeOverlay = deps.closeOverlay;
  if (deps.getOverlayCurrentRequest) _getOverlayCurrentRequest = deps.getOverlayCurrentRequest;
  if (deps.thematiquesPromise) _thematiquesPromise = deps.thematiquesPromise;
}

// ─── État partagé avec page-overlay.js ────────────────────────────────────────

// Accessibles depuis page-overlay.js via les getters ci-dessous
let pageOverlayLastRegisteredUsername = "";
let pageOverlayLastAlertMessage = "";

export function getLastRegisteredUsername() {
  return pageOverlayLastRegisteredUsername || "";
}

export function getLastAlertMessage() {
  return pageOverlayLastAlertMessage || "";
}

// ─── Clé de stockage de brouillon ─────────────────────────────────────────────

function formBuilderStorageKey(form) {
  const table = String(form.dataset.linkedTable || "").trim();
  const process = String(form.dataset.formProcess || "").trim();
  return `olthem.formbuilder.${table}.${process}`;
}

export function isFormBuilderRetryMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("formRetry") === "1" || params.get("retry") === "1";
}

// ─── Brouillons (session storage) ─────────────────────────────────────────────

export function saveFormBuilderDraft(form) {
  const payload = collectFormBuilderPayload(form);
  try {
    window.sessionStorage.setItem(formBuilderStorageKey(form), JSON.stringify(payload.values));
  } catch {
    // Ignore les erreurs de session storage.
  }
}

export function clearFormBuilderDraft(form) {
  try {
    window.sessionStorage.removeItem(formBuilderStorageKey(form));
  } catch {
    // Ignore les erreurs de session storage.
  }
}

export function hydrateFormBuilderFromDraft(form) {
  // Les formulaires en mode recherche ne sont pas réhydratés
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
      // Ré-applique le préfixe pour les compteurs personnalisés
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

// ─── Helpers de soumission ────────────────────────────────────────────────────

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
  // Case unique → 1/0 ; tableau → valeur par défaut (héritage)
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

// ─── Pré-remplissage du formulaire de connexion ────────────────────────────────

function prefillRememberMe(form) {
  const process = String(form.dataset.formProcess || "").trim().toLowerCase();
  if (process !== "connexion") return;

  // Corriger les attributs autocomplete pour activer le trousseau du navigateur
  const emailHolder = [...form.querySelectorAll("[data-linked-column]")].find((h) => {
    const ft = String(h.getAttribute("data-field-type") || "").trim().toLowerCase();
    return ft === "email";
  });
  const emailInput = emailHolder?.querySelector("input");
  if (emailInput) emailInput.setAttribute("autocomplete", "email");

  const passwordHolder = [...form.querySelectorAll("[data-linked-column]")].find((h) => {
    const ft = String(h.getAttribute("data-field-type") || "").trim().toLowerCase();
    return ft === "password";
  });
  const passwordInput = passwordHolder?.querySelector("input");
  if (passwordInput) passwordInput.setAttribute("autocomplete", "current-password");

  // Credential Management API : récupère email + mot de passe depuis le trousseau
  // du navigateur et injecte les deux champs (uniquement si disponible)
  if (!window.PasswordCredential || !navigator.credentials?.get) return;
  navigator.credentials.get({ password: true, mediation: "optional" })
    .then((cred) => {
      if (!(cred instanceof window.PasswordCredential)) return;
      if (emailInput)    emailInput.value    = cred.id;
      if (passwordInput) passwordInput.value = cred.password;

      const rememberHolder = [...form.querySelectorAll("[data-linked-column]")].find((h) => {
        const col = String(h.getAttribute("data-linked-column") || "").trim().toLowerCase();
        return /remember|souvenir/.test(col);
      });
      const rememberCheckbox = rememberHolder?.querySelector("input[type='checkbox']");
      if (rememberCheckbox) rememberCheckbox.checked = true;

      const formHost = emailInput?.closest(".layout-formbuilder");
      if (formHost instanceof HTMLFormElement) {
        formHost.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })
    .catch(() => {});
}

// ─── Liaison des soumissions ──────────────────────────────────────────────────

/**
 * Lie les événements submit/input/change/focusout sur tous les formulaires
 * .layout-formbuilder présents dans le DOM.
 * Doit être appelé après chaque injection de formulaire dans le DOM.
 */
export function bindFormBuilderSubmissions() {
  const { updateFormBuilderSubmitState } = _getUpdateFn();

  const forms = document.querySelectorAll(".layout-formbuilder");
  forms.forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.formBuilderBound === "1") {
      updateFormBuilderSubmitState(form);
      return;
    }

    form.dataset.formBuilderBound = "1";

    // Empêche la sélection de dates passées sur tous les champs date
    const todayStr = new Date().toISOString().slice(0, 10);
    form.querySelectorAll('input[type="date"]').forEach((dateInput) => {
      dateInput.setAttribute("min", todayStr);
    });

    hydrateFormBuilderFromDraft(form);
    prefillRememberMe(form);
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

    // Vérification asynchrone de disponibilité du pseudo (username)
    form.querySelectorAll('[data-field-type="username"] .layout-formbuilder__input').forEach((input) => {
      if (input.dataset.usernameBlurBound === "1") return;
      input.dataset.usernameBlurBound = "1";
      input.addEventListener("blur", async () => {
        const holder = input.closest("[data-linked-column]");
        if (!holder) return;
        const val = String(input.value ?? "").trim();
        if (val.length < 2) return;
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
          holder.dataset.usernameTaken = "0"; // sûr par défaut (pas de blocage)
        }
        updateFormBuilderSubmitState(form);
      });
    });

    form.addEventListener("click", (event) => {
      // Flèches du compteur numérique
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

      // Bascule de visibilité du mot de passe
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

  // Case Mundaneum : désactive les champs précédents dans le groupe
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
      institution: "Mundaneum",
      address: "Rue de Nimy 76",
      city: "Mons",
      postal_code: "7000",
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

  // Contraintes min/max entre start_date et end_date
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

  // Chargement des thématiques dans les dropdowns de catégorie
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

  // Dropdown personnalisé : ouverture/sélection/fermeture
  document.querySelectorAll(".layout-formbuilder__dropdown").forEach((dropdown) => {
    if (dropdown.dataset.dropdownBound === "1") return;
    dropdown.dataset.dropdownBound = "1";

    const toggle = dropdown.querySelector(".layout-formbuilder__dropdown-toggle");
    const list = dropdown.querySelector(".layout-formbuilder__dropdown-list");
    const hiddenInput = dropdown.querySelector(".layout-formbuilder__dropdown-value");
    const labelSpan = dropdown.querySelector(".layout-formbuilder__dropdown-label");

    toggle.addEventListener("click", () => {
      const isOpen = dropdown.classList.contains("is-open");
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

    // Mode recherche : dispatch d'un événement personnalisé
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
        const emailFromValues = String(payload.values.email ?? payload.values.password ?? "").trim();
        const emailInput = form.querySelector("input[type='email']");
        const email = emailFromValues || (emailInput instanceof HTMLInputElement ? emailInput.value.trim() : "");
        await forgotPasswordRequest(email);
        message.textContent = "Un lien de réinitialisation vous a été envoyé.";
        message.classList.add("layout-formbuilder__message--success");
        form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
        setTimeout(() => _closeOverlay(), 3000);
        return;
      }

      if (isResetPassword) {
        const urlParams = new URLSearchParams(window.location.search);
        const key   = urlParams.get('key')   || urlParams.get('reset_token') || '';
        const login = urlParams.get('login') || '';
        const password = String(payload.values.password ?? payload.values['mot de passe'] ?? '').trim();
        if (!key) {
          message.textContent = 'Lien invalide. Veuillez recommencer la procédure.';
          message.classList.add('layout-formbuilder__message--error');
          return;
        }
        await resetPasswordRequest(key, login, password);
        message.textContent = 'Mot de passe mis à jour. Vous pouvez maintenant vous connecter.';
        message.classList.add('layout-formbuilder__message--success');
        form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('key');
        newUrl.searchParams.delete('login');
        newUrl.searchParams.delete('action');
        newUrl.searchParams.delete('reset_token');
        window.history.replaceState({}, '', newUrl.toString());
        setTimeout(() => _closeOverlay(), 3000);
        return;
      }

      if (isRegistration) {
        const remember = getFormBuilderRememberChoice(payload.values);
        const credentials = getFormBuilderAuthCredentials(form);
        const registrationPayload = await registerAuthUser(payload.values);

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
          backLabel: _getOverlayCurrentRequest()?.backLabel || "Retour au site",
          overlayMode: "overlayTotal",
          username: registeredUsername,
          logo: titleLogoUrl("icon_InfoHead_white")
        }, "Inscription réussie");

        return;
      } else if (isLogin) {
        const remember = getFormBuilderRememberChoice(payload.values);
        const credentials = getFormBuilderAuthCredentials(form);

        if (!credentials.email || !credentials.password) {
          throw new Error("Email et mot de passe requis.");
        }

        const authPayload = await loginAuthUser({ email: credentials.email, password: credentials.password, remember });

        if (!authPayload?.token || !authPayload?.user) {
          throw new Error("Connexion échouée.");
        }

        persistAuthSession(authPayload, { email: credentials.email, remember });

        // Stockage sécurisé dans le trousseau du navigateur (Credential Management API)
        if (remember && window.PasswordCredential) {
          try {
            const cred = new window.PasswordCredential({ id: credentials.email, password: credentials.password });
            await navigator.credentials.store(cred);
          } catch {
            // L'API peut ne pas être disponible ou l'utilisateur peut refuser
          }
        }

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
        if (authPayload?.user) {
          persistAuthSession({ ...authPayload, token }, {});
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
              { exactTitle: "AdminTool", search: "admintool", backLabel: "Retour au site", overlayMode: "overlayTotal" },
              "Admin Tool"
            );
          } else {
            _openOverlay(
              { exactTitle: "Compte utilisateur", search: "compte utilisateur", backLabel: "Retour au site", overlayMode: "overlayTotal" },
              "Compte utilisateur"
            );
          }
          return;
        } else {
          if (isAtelier) payload.process = "atelier";
          const submitToken = getStoredToken() || null;
          await submitFormBuilderEntry({ ...payload, token: submitToken });
        }

        if (isAtelier) {
          const thematiques = await _thematiquesPromise;
          const thematiqueName = (() => {
            const tid = payload.values.thematic_id;
            if (!tid) return "";
            const match = thematiques.find((t) => String(t.id) === String(tid));
            return match ? (match.titre || "") : "";
          })();

          clearFormBuilderDraft(form);
          _openOverlay({
            exactTitle: "Atelier programmé",
            search: "Atelier programmé",
            backLabel: _getOverlayCurrentRequest()?.backLabel || "Retour au site",
            overlayMode: "overlayTotal",
            logo: null,
            atelierData: {
              username: currentUser?.username || "",
              last_name: String(payload.values.last_name || ""),
              first_name: String(payload.values.first_name || ""),
              email: String(payload.values.email || ""),
              phone: String(payload.values.phone || ""),
              institution: String(payload.values.institution || ""),
              address: String(payload.values.address || ""),
              postal_code: String(payload.values.postal_code || ""),
              city: String(payload.values.city || ""),
              mundaneum: !!payload.values.mundaneum,
              start_date: String(payload.values.start_date || ""),
              end_date: String(payload.values.end_date || ""),
              participants_count: payload.values.participants_count != null ? String(payload.values.participants_count) : "",
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
        message.textContent = apiMessage || "Erreur lors de la création de l'atelier.";
        message.classList.add("layout-formbuilder__message--error");
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
          logo: titleLogoUrl("icon_InfoHead_white")
        }, "Inscription refusée");

        return;
      }

      if (isLogin) {
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

      if (_openOverlay) _openOverlay({ exactTitle: "Erreur 404", search: "Erreur 404", backLabel: "Retour au site", overlayMode: "overlayTotal" });
    } finally {
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
      updateFormBuilderSubmitState(form);
    }
  });
}

bindFormBuilderSubmissions._submitBound = false;

// ─── Référence lazy à updateFormBuilderSubmitState (évite la dépendance circulaire) ─
// form-builder.js importe bindFormBuilderSubmissions depuis ici ; form-submit.js
// a besoin de updateFormBuilderSubmitState définie dans form-builder.js.
// Solution : injection via setFormSubmitUpdateFn(), appelé dans form-builder.js.

let _updateFormBuilderSubmitState = null;

export function setFormSubmitUpdateFn(fn) {
  _updateFormBuilderSubmitState = fn;
}

function _getUpdateFn() {
  return {
    updateFormBuilderSubmitState: (form) => {
      if (_updateFormBuilderSubmitState) _updateFormBuilderSubmitState(form);
    }
  };
}

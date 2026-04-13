import { RestApiError, requestJsonAcrossRoots } from "./rest-client.js";

const AUTH_TOKEN_KEY = "olthem.auth.token";
const AUTH_USER_KEY = "olthem.auth.user";
const AUTH_REMEMBER_PREFS_KEY = "olthem.auth.remember.preferences";
const USER_ICON_PATH = "./assets/images/icons/icon_User.svg";
const ADMIN_ICON_PATH = "./assets/images/icons/icon_Admin.svg";
const EYE_CLOSED_ICON_PATH = "./assets/images/icons/icon_EyeClosed.svg";
const EYE_OPEN_ICON_PATH = "./assets/images/icons/icon_EyeOpen.svg";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function isValidPassword(value) {
  const raw = String(value ?? "");
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(raw);
}

function normalizeUser(user) {
  if (!user || typeof user !== "object") return null;

  return {
    id: user.id ?? null,
    username: user.username ?? "",
    nom: user.nom ?? "",
    prenom: user.prenom ?? "",
    email: user.email ?? "",
    remember: !!user.remember,
    newsletter: !!user.newsletter,
    isAdmin: !!user.isAdmin,
    role: user.role ?? ""
  };
}

function userDisplayLabel(user) {
  if (!user) return "Connexion";

  const prenom = String(user.prenom ?? "").trim();
  const nom = String(user.nom ?? "").trim();
  const username = String(user.username ?? "").trim();
  const email = String(user.email ?? "").trim();

  if (username) return username;
  if (prenom || nom) return `${prenom} ${nom}`.trim();
  if (email) return email;
  return "Mon compte";
}

function getStorage(kind) {
  if (typeof window === "undefined") return null;

  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readRememberPreferences() {
  const storage = getStorage("local");
  if (!storage) return {};

  try {
    const raw = storage.getItem(AUTH_REMEMBER_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRememberPreferences(preferences) {
  const storage = getStorage("local");
  if (!storage) return;

  try {
    storage.setItem(AUTH_REMEMBER_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage failures.
  }
}

function resolveRememberPreference(payload, fallbackEmail = "", explicitRemember = null) {
  if (typeof explicitRemember === "boolean") return explicitRemember;

  const userRemember = payload?.user?.remember;
  if (typeof userRemember === "boolean") return userRemember;

  const email = String(payload?.user?.email || fallbackEmail || "").trim().toLowerCase();
  if (!email) return false;

  const preferences = readRememberPreferences();
  return !!preferences[email];
}

function saveAuthSession(payload, options = {}) {
  const token = payload?.token;
  const user = normalizeUser(payload?.user);

  if (!token || !user) return;

  const remember = resolveRememberPreference(payload, options.email, options.remember);
  const primaryStorage = remember ? getStorage("local") : getStorage("session");
  const secondaryStorage = remember ? getStorage("session") : getStorage("local");

  try {
    secondaryStorage?.removeItem(AUTH_TOKEN_KEY);
    secondaryStorage?.removeItem(AUTH_USER_KEY);
  } catch {
    // Ignore storage failures.
  }

  try {
    primaryStorage?.setItem(AUTH_TOKEN_KEY, token);
    primaryStorage?.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage can fail in private contexts; auth still works for the current page.
  }
}

function clearAuthSession() {
  [getStorage("local"), getStorage("session")].forEach((storage) => {
    try {
      storage?.removeItem(AUTH_TOKEN_KEY);
      storage?.removeItem(AUTH_USER_KEY);
    } catch {
      // Nothing else to do.
    }
  });
}

function getStoredToken() {
  try {
    return getStorage("local")?.getItem(AUTH_TOKEN_KEY)
      || getStorage("session")?.getItem(AUTH_TOKEN_KEY)
      || null;
  } catch {
    return null;
  }
}

export function rememberAuthPreference(email, remember) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return;

  const preferences = readRememberPreferences();
  preferences[normalizedEmail] = !!remember;
  writeRememberPreferences(preferences);
}

export function persistAuthSession(payload, options = {}) {
  saveAuthSession(payload, options);
}

async function requestAuth(pathname, options = {}) {
  const {
    method = "GET",
    body = null,
    token = null
  } = options;

  try {
    return await requestJsonAcrossRoots(`/olthem/v1/auth/${pathname}`, {
      method,
      body,
      token,
      failFastOnClientError: true
    });
  } catch (error) {
    if (error instanceof RestApiError && error.status) {
      error.name = "AuthApiError";
      throw error;
    }

    const err = new Error(`Impossible de joindre le service d'authentification. ${error instanceof Error ? error.message : "Erreur réseau"}`);
    err.name = "AuthRequestError";
    throw err;
  }
}

export async function registerAuthUser(payload) {
  return requestAuth("register", {
    method: "POST",
    body: payload
  });
}

export async function loginAuthUser({ email, password }) {
  return requestAuth("login", {
    method: "POST",
    body: { email, password }
  });
}

export async function fetchCurrentAuthUser(token) {
  return requestAuth("me", {
    method: "GET",
    token
  });
}

export async function logoutAuthUser(token) {
  return requestAuth("logout", {
    method: "POST",
    token
  });
}

export function initHeaderAuth() {
  const right = document.querySelector(".site-header__right");
  const trigger = document.querySelector(".header-actions__connexion-trigger");
  const triggerLabel = trigger?.querySelector(".icon-link__label");
  const userActions = document.getElementById("header-user-actions");
  const userIcon = document.getElementById("header-user-icon");
  const userLabel = document.getElementById("header-user-label");
  const logoutLink = document.getElementById("header-logout-link");
  const form = document.getElementById("header-auth");
  const emailInput = document.getElementById("header-auth-email");
  const passwordInput = document.getElementById("header-auth-password");
  const submitButton = document.getElementById("header-auth-submit");
  const passwordToggle = document.getElementById("header-auth-password-toggle");
  const passwordToggleIcon = document.getElementById("header-auth-password-toggle-icon");
  const emailError = document.getElementById("header-auth-email-error");
  const passwordError = document.getElementById("header-auth-password-error");
  const searchToggle = document.getElementById("header-search-toggle");
  const searchPanel = document.getElementById("header-search-panel");
  const searchInput = document.getElementById("header-search-input");

  if (!right || !trigger || !form || !emailInput || !passwordInput || !submitButton || !passwordToggle || !passwordToggleIcon || !emailError || !passwordError || !userActions || !userIcon || !userLabel || !logoutLink || !searchToggle || !searchPanel || !searchInput) {
    return;
  }

  function upsertAdminLink(isAdmin) {
    const current = document.getElementById("header-admin-link");

    if (!isAdmin) {
      current?.remove();
      return;
    }

    if (current) return;

    const button = document.createElement("button");
    button.className = "icon-link";
    button.id = "header-admin-link";
    button.type = "button";
    button.setAttribute("data-page-overlay", "title:AdminTool|search:admintool|back:Retour au site");
    button.setAttribute("aria-label", "Ouvrir l'outil d'administration");
    button.innerHTML = `
      <img
        class="icon-link__icon"
        src="./assets/images/icons/icon_Settings.svg"
        alt=""
        aria-hidden="true"
      />
      <span class="icon-link__label">Admin</span>`;

    userActions.insertBefore(button, logoutLink);
  }

  function setSearchOpen(isOpen) {
    right.classList.toggle("is-search-open", isOpen);
    searchToggle.setAttribute("aria-expanded", String(isOpen));
    searchPanel.setAttribute("aria-hidden", String(!isOpen));

    if (isOpen) {
      window.requestAnimationFrame(() => {
        searchInput.focus();
      });
    }
  }

  function closeSearchPanel() {
    setSearchOpen(false);
  }

  function setEmailError(message) {
    emailError.textContent = message;
  }

  function setPasswordError(message) {
    passwordError.textContent = message;
  }

  function clearErrors() {
    setEmailError("");
    setPasswordError("");
  }

  function validateEmailFormat() {
    const email = emailInput.value.trim();

    if (!email) {
      setEmailError("");
      return false;
    }

    if (!isValidEmail(email)) {
      setEmailError("Adresse invalide");
      return false;
    }

    setEmailError("");
    return true;
  }

  function validatePasswordComplexity(showMessage = false) {
    const password = passwordInput.value;

    if (!password) {
      setPasswordError("");
      return false;
    }

    if (!isValidPassword(password)) {
      if (showMessage) {
        setPasswordError("Mot de passe invalide");
      }
      return false;
    }

    setPasswordError("");
    return true;
  }

  function inferLoginError(error) {
    const payloadMessage = String(error?.payload?.message || "").toLowerCase();
    const payloadCode = String(error?.payload?.code || "").toLowerCase();
    const generic = String(error?.message || "").toLowerCase();
    const text = `${payloadMessage} ${payloadCode} ${generic}`;

    if (/(email|adresse|mail|unknown user|user not found|not found)/.test(text)) {
      return "email";
    }

    return "password";
  }

  function setPasswordVisibility(isVisible) {
    passwordInput.type = isVisible ? "text" : "password";
    passwordToggle.setAttribute("aria-pressed", String(isVisible));
    passwordToggle.setAttribute("aria-label", isVisible ? "Masquer le mot de passe" : "Afficher le mot de passe");
    passwordToggleIcon.setAttribute("src", isVisible ? EYE_OPEN_ICON_PATH : EYE_CLOSED_ICON_PATH);
  }

  function resetForm() {
    emailInput.value = "";
    passwordInput.value = "";
    clearErrors();
    setPasswordVisibility(false);
    updateSubmitState();
  }

  function updateSubmitState() {
    const ready = isValidEmail(emailInput.value) && isValidPassword(passwordInput.value);
    submitButton.disabled = !ready;
    submitButton.classList.toggle("is-active", ready);
  }

  function openAuthPanel() {
    closeSearchPanel();
    right.classList.add("is-auth-open");
    emailInput.focus();
    updateSubmitState();
  }

  function closeAuthPanel() {
    right.classList.remove("is-auth-open");
  }

  function _applyGuestState() {
    right.classList.remove("is-authenticated");
    userActions.hidden = true;
    upsertAdminLink(false);
    userIcon.setAttribute("src", USER_ICON_PATH);
    userLabel.textContent = "Compte utilisateur";
    closeSearchPanel();
    if (triggerLabel) triggerLabel.textContent = "Connexion";
    resetForm();
    closeAuthPanel();
  }

  function setGuestState(animated = false) {
    if (animated && right.classList.contains("is-authenticated")) {
      userActions.style.transition = "opacity 0.18s ease";
      userActions.style.opacity = "0";
      setTimeout(() => {
        userActions.style.transition = "";
        userActions.style.opacity = "";
        _applyGuestState();
      }, 200);
    } else {
      _applyGuestState();
    }
  }

  function setAuthenticatedState(user) {
    right.classList.add("is-authenticated");
    userActions.hidden = false;
    upsertAdminLink(!!user.isAdmin);
    userIcon.setAttribute("src", user.isAdmin ? ADMIN_ICON_PATH : USER_ICON_PATH);
    userLabel.textContent = userDisplayLabel(user);
    closeSearchPanel();
    closeAuthPanel();
    clearErrors();
    passwordInput.value = "";
    updateSubmitState();
  }

  async function hydrateCurrentUser() {
    const token = getStoredToken();
    if (!token) {
      setGuestState();
      return;
    }

    try {
      const payload = await fetchCurrentAuthUser(token);
      const user = normalizeUser(payload?.user);

      if (!user) {
        clearAuthSession();
        setGuestState();
        return;
      }

      saveAuthSession({ token, user: payload?.user || user }, { email: user.email });
      setAuthenticatedState(user);
    } catch {
      clearAuthSession();
      setGuestState();
    }
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openAuthPanel();
  });

  searchToggle.addEventListener("click", () => {
    if (right.classList.contains("is-auth-open")) return;
    const nextState = !right.classList.contains("is-search-open");
    setSearchOpen(nextState);
  });

  form.querySelectorAll("[data-page-overlay]").forEach((button) => {
    if (!(button instanceof HTMLElement)) return;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const opener = window.__openPageOverlay;
      if (typeof opener === "function") {
        opener(button);
      }
    });
  });

  logoutLink.addEventListener("click", async () => {
    const token = getStoredToken();

    try {
      if (token) {
        await logoutAuthUser(token);
      }
    } catch {
      // Fall through to local cleanup to avoid locking the UI.
    }

    clearAuthSession();
    setGuestState(true);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && right.classList.contains("is-auth-open")) {
      closeAuthPanel();
      return;
    }

    if (event.key === "Escape" && right.classList.contains("is-search-open")) {
      closeSearchPanel();
    }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const insideSearch = event.target.closest("#header-search") || event.target.closest("#header-search-panel");
    const insideAuth = event.target.closest("#header-auth") || event.target.closest(".header-actions__connexion-trigger");

    if (!insideSearch && right.classList.contains("is-search-open")) {
      closeSearchPanel();
    }

    if (!insideAuth && !event.target.closest(".site-header__right") && right.classList.contains("is-auth-open")) {
      closeAuthPanel();
    }
  });

  emailInput.addEventListener("input", () => {
    setEmailError("");
    updateSubmitState();
  });

  passwordInput.addEventListener("focus", () => {
    validateEmailFormat();
  });

  passwordInput.addEventListener("input", () => {
    validateEmailFormat();
    setPasswordError("");
    updateSubmitState();
  });

  passwordInput.addEventListener("blur", () => {
    validatePasswordComplexity(true);
    updateSubmitState();
  });

  passwordToggle.addEventListener("click", () => {
    const next = passwordInput.type === "password";
    setPasswordVisibility(next);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let hasError = false;

    if (!isValidEmail(email)) {
      setEmailError("Adresse invalide");
      hasError = true;
    }

    if (!isValidPassword(password)) {
      setPasswordError("Mot de passe invalide");
      hasError = true;
    }

    if (hasError) {
      updateSubmitState();
      return;
    }

    submitButton.disabled = true;

    try {
      const payload = await loginAuthUser({ email, password });
      const user = normalizeUser(payload?.user);

      if (!payload?.token || !user) {
        throw new Error("Réponse de connexion invalide");
      }

      saveAuthSession(payload, { email });
      setAuthenticatedState(user);
    } catch (error) {
      const type = inferLoginError(error);

      if (type === "email") {
        setEmailError("Adresse incorrecte");
        setPasswordError("");
      } else {
        setPasswordError("Mot de passe incorrect");
      }

      submitButton.disabled = false;
      updateSubmitState();
    }
  });

  setPasswordVisibility(false);
  setGuestState();
  hydrateCurrentUser().catch(() => {});

  window.addEventListener("auth:session-updated", () => {
    hydrateCurrentUser().catch(() => {});
  });
}

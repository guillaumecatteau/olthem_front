import { RestApiError, requestJsonAcrossRoots } from "./rest-client.js";

const AUTH_TOKEN_KEY = "olthem.auth.token";
const AUTH_USER_KEY = "olthem.auth.user";
const AUTH_REMEMBER_PREFS_KEY = "olthem.auth.remember.preferences";
const USER_ICON_PATH = "./assets/images/icons/icon_User.svg";
const ADMIN_ICON_PATH = "./assets/images/icons/icon_Admin.svg";

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

export function getStoredToken() {
  try {
    return getStorage("local")?.getItem(AUTH_TOKEN_KEY)
      || getStorage("session")?.getItem(AUTH_TOKEN_KEY)
      || null;
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = getStorage("local")?.getItem(AUTH_USER_KEY)
      || getStorage("session")?.getItem(AUTH_USER_KEY)
      || null;
    if (!raw) return null;
    return JSON.parse(raw);
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

export async function loginAuthUser({ email, password, remember = null }) {
  const body = { email, password };
  if (typeof remember === "boolean") body.remember = remember;
  return requestAuth("login", {
    method: "POST",
    body
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

export async function forgotPasswordRequest(email) {
  return requestAuth("forgot-password", {
    method: "POST",
    body: { email }
  });
}

export async function resetPasswordRequest(token, password) {
  return requestAuth("reset-password", {
    method: "POST",
    body: { token, password }
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
  const searchToggle = document.getElementById("header-search-toggle");
  const searchPanel = document.getElementById("header-search-panel");
  const searchInput = document.getElementById("header-search-input");

  if (!right || !trigger || !userActions || !userIcon || !userLabel || !logoutLink || !searchToggle || !searchPanel || !searchInput) {
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
    button.setAttribute("data-page-overlay", "title:AdminTool|search:admintool|back:Retour au site|overlay:overlayTotal");
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
    // Move focus out before aria-hidden to avoid accessibility warning
    if (!isOpen && searchPanel.contains(document.activeElement)) {
      document.activeElement.blur();
    }
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

  function _applyGuestState() {
    right.classList.remove("is-authenticated");
    userActions.hidden = true;
    upsertAdminLink(false);
    userIcon.setAttribute("src", USER_ICON_PATH);
    userLabel.textContent = "Compte utilisateur";
    closeSearchPanel();
    if (triggerLabel) triggerLabel.textContent = "Connexion";
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
  }

  async function hydrateCurrentUser() {
    const token = getStoredToken();
    if (!token) {
      setGuestState();
      return;
    }

    // Apply stored user data immediately so the UI reflects auth state
    // without waiting for the server round-trip.
    const cachedUser = normalizeUser(getStoredUser());
    if (cachedUser) {
      setAuthenticatedState(cachedUser);
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
    } catch (error) {
      // Only invalidate the session on explicit auth rejection (401 / 403).
      // Network failures or transient server errors must not log the user out.
      if (error?.status === 401 || error?.status === 403) {
        clearAuthSession();
        setGuestState();
      }
    }
  }

  searchToggle.addEventListener("click", () => {
    const nextState = !right.classList.contains("is-search-open");
    setSearchOpen(nextState);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    closeSearchPanel();
    searchInput.value = "";
    window.dispatchEvent(new CustomEvent("search:query", { detail: { query: q } }));
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
    if (event.key === "Escape" && right.classList.contains("is-search-open")) {
      closeSearchPanel();
    }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const insideSearch = event.target.closest("#header-search") || event.target.closest("#header-search-panel");

    if (!insideSearch && right.classList.contains("is-search-open")) {
      closeSearchPanel();
    }
  });

  setGuestState();
  hydrateCurrentUser().catch(() => {});

  window.addEventListener("auth:session-updated", () => {
    hydrateCurrentUser().catch(() => {});
  });
}

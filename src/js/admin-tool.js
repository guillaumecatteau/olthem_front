import {
  fetchAdminOverview,
  fetchAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  fetchAdminAteliers,
  updateAdminAtelier,
  deleteAdminAtelier,
  fetchThematiques
} from "./api.js";
import { getStoredToken, getStoredUser } from "./auth.js";
import { showConfirm } from "./popup.js";
import { esc, slugify, formatDateTime, formatDate } from "./utils.js";

function boolLabel(value) {
  return Number(value) ? "Oui" : "Non";
}

export function isAdminToolRequest(page = null, request = {}) {
  const candidates = [
    page?.slug,
    request?.slug,
    request?.search,
    request?.exactTitle
  ].map((entry) => slugify(entry || ""));

  return candidates.some((entry) => entry === "admintool" || entry === "admin-tool");
}

function userInputValidation(values) {
  const errors = [];
  if (String(values.username || "").trim().length < 2) {
    errors.push("Le username doit contenir au moins 2 caracteres.");
  }

  const email = String(values.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Adresse email invalide.");
  }

  return errors;
}

function createPager({ page, totalPages, onPageClick }) {
  const safeTotal = Math.max(1, Number(totalPages || 1));
  const safePage = Math.min(Math.max(1, Number(page || 1)), safeTotal);
  const pages = [];

  for (let i = 1; i <= safeTotal; i += 1) {
    pages.push(`<button type="button" class="buttonNav" data-page="${i}"${i === safePage ? ' aria-current="page"' : ""}>${i}</button>`);
  }

  const nav = document.createElement("nav");
  nav.className = "admin-tool__pager";
  nav.innerHTML = pages.join("");
  nav.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const btn = event.target.closest(".buttonNav");
    if (!btn) return;
    const nextPage = Number(btn.dataset.page || 1);
    onPageClick(nextPage);
  });
  return nav;
}

export async function bindAdminToolOverlay(content, page, options = {}) {
  if (!content || !isAdminToolRequest(page, options.request || {})) return;

  const token = getStoredToken();
  const user = getStoredUser();

  if (!token || !user?.isAdmin) {
    content.innerHTML = `
      <div class="admin-tool admin-tool--forbidden">
        <p class="admin-tool__error">Acces reserve aux administrateurs.</p>
      </div>`;
    return;
  }

  const root = document.createElement("section");
  root.className = "admin-tool";
  root.innerHTML = `
    <nav class="admin-tool__tabs" aria-label="Navigation Admin Tool">
      <div class="admin-tool__tabs-nav">
        <button type="button" class="admin-tool__tab is-active" data-admin-tab="overview">Overview</button>
        <button type="button" class="admin-tool__tab" data-admin-tab="users">Utilisateurs</button>
        <button type="button" class="admin-tool__tab" data-admin-tab="ateliers">Ateliers</button>
      </div>
      <div class="admin-tool__tabs-line" aria-hidden="true"></div>
    </nav>
    <section class="admin-tool__panel is-active" data-admin-panel="overview"></section>
    <section class="admin-tool__panel" data-admin-panel="users"></section>
    <section class="admin-tool__panel" data-admin-panel="ateliers"></section>`;

  const inlineClose = content.querySelector(".page-overlay__retour-inline");
  if (inlineClose) {
    content.insertBefore(root, inlineClose);
  } else {
    content.appendChild(root);
  }

  const state = {
    users: {
      page: 1,
      totalPages: 1,
      sortBy: "created_at",
      sortDir: "DESC",
      filters: {
        id: "",
        username: "",
        nom: "",
        prenom: "",
        email: "",
        created_at: "",
        newsletter: "",
        is_admin: ""
      },
      items: []
    },
    ateliers: {
      page: 1,
      totalPages: 1,
      sortBy: "created_at",
      sortDir: "DESC",
      filters: {
        id: "",
        username: "",
        email: "",
        telephone: "",
        thematique_id: "",
        mundaneum: "",
        status: ""
      },
      items: []
    },
    thematiquesCache: [],
    overviewLoaded: false,
    usersLoaded: false,
    ateliersLoaded: false
  };

  const panels = {
    overview: root.querySelector('[data-admin-panel="overview"]'),
    users: root.querySelector('[data-admin-panel="users"]'),
    ateliers: root.querySelector('[data-admin-panel="ateliers"]')
  };

  const atelierAtelierStatus = (atelier) => {
    const today = new Date().toISOString().slice(0, 10);
    const isTermine = atelier.valid_date
      ? String(atelier.valid_date).slice(0, 10) < today
      : !!(atelier.start_date && String(atelier.start_date).slice(0, 10) < today);
    const isConfirme = !!atelier.valid_date && !isTermine;
    if (isTermine) return { mod: "termine", label: "Terminé" };
    if (isConfirme) return { mod: "confirme", label: "Confirmé" };
    return { mod: "attente", label: "En attente" };
  };

  const atelierStatusTag = (atelier) => {
    const { mod, label } = atelierAtelierStatus(atelier);
    return `<span class="compte-ateliers__status compte-ateliers__status--${mod}">${label}</span>`;
  };

  const syncSelectWidthToContent = (select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const longest = [...select.options].reduce((max, option) => Math.max(max, String(option.textContent || "").trim().length), 0);
    select.style.width = `calc(${Math.max(longest + 2, 12)}ch + 34px)`;
  };

  const renderOverview = async (preloaded = null) => {
    if (!panels.overview) return;
    if (!preloaded) {
      panels.overview.innerHTML = '<p class="admin-tool__loading">Chargement...</p>';
    }

    try {
      const data = preloaded || await fetchAdminOverview(token);
      const counts = data?.counts || {};
      const latestUsers = Array.isArray(data?.latest_users) ? data.latest_users : [];
      const latestAteliers = Array.isArray(data?.latest_ateliers) ? data.latest_ateliers : [];

      const userRows = latestUsers
        .map((item) => `
          <li class="admin-tool__latest-item">
            <span>#${esc(String(item.id || ""))}</span>
            <strong>${esc(item.username || "-")}</strong>
            <span>${esc(item.email || "-")}</span>
            <span>${esc(formatDate(item.created_at))}</span>
          </li>`)
        .join("");

      const atelierRows = latestAteliers
        .map((item) => `
          <li class="admin-tool__latest-item">
            <span>#${esc(String(item.id || ""))}</span>
            <strong>${esc(item.thematique || "-")}</strong>
            <span>${esc(item.username || "-")}</span>
            <span>${esc(formatDate(item.created_at))}</span>
            ${atelierStatusTag(item)}
          </li>`)
        .join("");

      const visitsStats = data?.visits?.counts || {};

      panels.overview.innerHTML = `
        <div class="admin-tool__overview-counters admin-tool__overview-counters--4">
          <article class="admin-tool__counter"><h3>Utilisateurs total</h3><p>${Number(counts.users_total || 0)}</p></article>
          <article class="admin-tool__counter"><h3>Visites total</h3><p>${Number(visitsStats.total_events || 0)}</p></article>
          <article class="admin-tool__counter"><h3>7 derniers jours</h3><p>${Number(visitsStats.last_7_days || 0)}</p></article>
          <article class="admin-tool__counter"><h3>Aujourd'hui</h3><p>${Number(visitsStats.today_events || 0)}</p></article>
        </div>
        <div class="admin-tool__overview-counters admin-tool__overview-counters--3">
          <article class="admin-tool__counter"><h3>Ateliers crees</h3><p>${Number(counts.ateliers_total || 0)}</p></article>
          <article class="admin-tool__counter"><h3>Ateliers en attente</h3><p>${Number(counts.ateliers_pending || 0)}</p></article>
          <article class="admin-tool__counter"><h3>Ateliers valides</h3><p>${Number(counts.ateliers_validated || 0)}</p></article>
        </div>
        <div class="admin-tool__overview-columns">
          <div class="admin-tool__latest-section">
            <h3>10 derniers utilisateurs inscrits</h3>
            <div class="admin-tool__latest-head" role="presentation">
              <span>ID</span>
              <span>Nom utilisateur</span>
              <span>Email</span>
              <span>Date d'inscription</span>
            </div>
            <ul class="admin-tool__latest-entries">${userRows || '<li class="admin-tool__latest-item"><span>-</span><span>Aucun utilisateur.</span><span></span><span></span></li>'}</ul>
          </div>
          <div class="admin-tool__latest-section admin-tool__latest-section--ateliers">
            <h3>5 derniers ateliers crees</h3>
            <div class="admin-tool__latest-head" role="presentation">
              <span>ID</span>
              <span>Thematique</span>
              <span>Utilisateur</span>
              <span>Date de creation</span>
              <span>Statut</span>
            </div>
            <div class="admin-tool__scroll-wrap">
              <div class="admin-tool__latest-scroll">
                <ul class="admin-tool__latest-entries">${atelierRows || '<li class="admin-tool__latest-item"><span>-</span><span>Aucun atelier.</span><span></span><span></span></li>'}</ul>
              </div>
            </div>
          </div>
        </div>`;

      panels.overview.querySelectorAll(".admin-tool__latest-item").forEach((item, i) => {
        item.style.animationDelay = `${i * 30}ms`;
      });
    } catch (error) {
      panels.overview.innerHTML = `<p class="admin-tool__error">Impossible de charger l'overview: ${esc(error?.message || "Erreur")}</p>`;
    }
  };

  const buildUserFilters = () => {
    const f = state.users.filters;
    return `
      <section class="admin-tool__filters-wrap">
        <div class="admin-tool__filters admin-tool__filters--users">
          <div class="admin-tool__filters-row">
            <input class="admin-tool__filter admin-tool__filter--id" data-filter="id" type="text" placeholder="ID" value="${esc(f.id)}" />
            <input class="admin-tool__filter" data-filter="username" type="text" placeholder="Username" value="${esc(f.username)}" />
            <input class="admin-tool__filter" data-filter="nom" type="text" placeholder="Nom" value="${esc(f.nom)}" />
            <input class="admin-tool__filter" data-filter="prenom" type="text" placeholder="Prenom" value="${esc(f.prenom)}" />
          </div>
          <div class="admin-tool__filters-row">
            <input class="admin-tool__filter admin-tool__filter--email" data-filter="email" type="text" placeholder="Adresse mail" value="${esc(f.email)}" />
            <div class="admin-tool__filter-date-wrap">
              <input class="admin-tool__filter admin-tool__filter--date${f.created_at ? " admin-tool__filter--has-value" : ""}" data-filter="created_at" type="date" value="${esc(f.created_at)}" />
              <span class="admin-tool__filter-date-placeholder" aria-hidden="true">-- Date de création --</span>
              <span class="admin-tool__field-icon admin-tool__field-icon--calendar" aria-hidden="true"></span>
            </div>
            <div class="admin-tool__filter-select-wrap">
              <select class="admin-tool__filter admin-tool__filter--select${f.newsletter ? " admin-tool__filter--has-value" : ""}" data-filter="newsletter">
                <option value="">-- Newsletter --</option>
                <option value="1" ${f.newsletter === "1" ? "selected" : ""}>Oui</option>
                <option value="0" ${f.newsletter === "0" ? "selected" : ""}>Non</option>
              </select>
              <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
            </div>
            <div class="admin-tool__filter-select-wrap">
              <select class="admin-tool__filter admin-tool__filter--select${f.is_admin ? " admin-tool__filter--has-value" : ""}" data-filter="is_admin">
                <option value="">-- is Admin --</option>
                <option value="1" ${f.is_admin === "1" ? "selected" : ""}>Oui</option>
                <option value="0" ${f.is_admin === "0" ? "selected" : ""}>Non</option>
              </select>
              <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <div class="admin-tool__filters-actions">
          <button type="button" class="buttonRoundAct" data-user-search disabled>Rechercher</button>
        </div>
      </section>`;
  };

  const buildAtelierFilters = () => {
    const f = state.ateliers.filters;
    const themaOptions = state.thematiquesCache
      .map((t) => `<option value="${esc(String(t.id))}" ${f.thematique_id === String(t.id) ? "selected" : ""}>${esc(t.titre)}</option>`)
      .join("");
    return `
      <section class="admin-tool__filters-wrap">
        <div class="admin-tool__filters admin-tool__filters--ateliers">
          <div class="admin-tool__filters-row">
            <input class="admin-tool__filter admin-tool__filter--id" data-filter="id" type="text" placeholder="ID" value="${esc(f.id)}" />
            <input class="admin-tool__filter" data-filter="username" type="text" placeholder="Nom d'utilisateur" value="${esc(f.username)}" />
            <input class="admin-tool__filter admin-tool__filter--email" data-filter="email" type="text" placeholder="Adresse mail" value="${esc(f.email)}" />
            <input class="admin-tool__filter" data-filter="telephone" type="text" placeholder="Téléphone" value="${esc(f.telephone)}" />
          </div>
          <div class="admin-tool__filters-row">
            <div class="admin-tool__filter-select-wrap">
              <select class="admin-tool__filter admin-tool__filter--select${f.thematique_id ? " admin-tool__filter--has-value" : ""}" data-filter="thematique_id">
                <option value="">-- Thématique --</option>
                ${themaOptions}
              </select>
              <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
            </div>
            <div class="admin-tool__filter-select-wrap">
              <select class="admin-tool__filter admin-tool__filter--select${f.mundaneum ? " admin-tool__filter--has-value" : ""}" data-filter="mundaneum">
                <option value="">-- Mundaneum --</option>
                <option value="1" ${f.mundaneum === "1" ? "selected" : ""}>Oui</option>
                <option value="0" ${f.mundaneum === "0" ? "selected" : ""}>Non</option>
              </select>
              <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
            </div>
            <div class="admin-tool__filter-select-wrap">
              <select class="admin-tool__filter admin-tool__filter--select${f.status ? " admin-tool__filter--has-value" : ""}" data-filter="status">
                <option value="">-- Statut --</option>
                <option value="pending" ${f.status === "pending" ? "selected" : ""}>En attente</option>
                <option value="validated" ${f.status === "validated" ? "selected" : ""}>Confirmé / Terminé</option>
              </select>
              <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <div class="admin-tool__filters-actions">
          <button type="button" class="buttonRoundAct" data-atelier-search disabled>Rechercher</button>
        </div>
      </section>`;
  };

  const userSortOptions = [
    ["id",          "ID"],
    ["username",    "Nom d\u2019utilisateur"],
    ["email",       "Adresse mail"],
    ["created_at",  "Date d\u2019inscription"],
    ["is_admin",    "R\u00f4le"]
  ];

  const userEntryBodyHtml = (user) => `
    <form class="admin-tool__entry-edit" data-user-edit-form="${esc(String(user.id))}">
      <div class="admin-tool__edit-row admin-tool__edit-row--3">
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Nom d'utilisateur</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="username" value="${esc(user.username || "")}" autocomplete="off" />
          </div>
          <span class="admin-tool__edit-field-error" data-field-error="username"></span>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Nom</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="nom" value="${esc(user.nom || "")}" autocomplete="off" />
          </div>
          <span class="admin-tool__edit-field-error" data-field-error="nom"></span>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Prénom</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="prenom" value="${esc(user.prenom || "")}" autocomplete="off" />
          </div>
          <span class="admin-tool__edit-field-error" data-field-error="prenom"></span>
        </div>
      </div>
      <div class="admin-tool__edit-row admin-tool__edit-row--email-checks">
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Adresse mail</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="email" name="email" value="${esc(user.email || "")}" autocomplete="off" />
          </div>
          <span class="admin-tool__edit-field-error" data-field-error="email"></span>
        </div>
        <div class="admin-tool__edit-checks">
          <label class="admin-tool__check-option">
            <input type="checkbox" name="isAdmin" ${Number(user.isAdmin) ? "checked" : ""} />
            Administrateur
          </label>
          <label class="admin-tool__check-option">
            <input type="checkbox" name="newsletter" ${Number(user.newsletter) ? "checked" : ""} />
            Abonné à la newsletter
          </label>
        </div>
      </div>
      <p class="admin-tool__entry-edit-msg" data-edit-msg></p>
      <div class="admin-tool__entry-actions">
        <button type="button" class="buttonRoundAct" data-delete-user>Supprimer</button>
        <button type="submit" class="buttonRoundAct" data-save-edit disabled>Sauvegarder</button>
      </div>
    </form>`;

  const renderUsersList = () => {
    const list = state.users.items
      .map((user) => `
          <li class="admin-tool__entry" data-user-id="${esc(String(user.id))}">
            <div class="admin-tool__entry-head">
              <div class="admin-tool__entry-main">
                <span class="admin-tool__entry-id">#${esc(String(user.id))}</span>
                <strong>${esc(user.username || "-")}</strong>
                <span>${esc(user.email || "-")}</span>
                <span>${esc(formatDate(user.created_at))}</span>
                <span>${Number(user.isAdmin) ? "Administrateur" : "Utilisateur"}</span>
              </div>
              <button type="button" class="admin-tool__toggle-btn" aria-expanded="false" data-toggle-user>
                <span class="admin-tool__field-icon admin-tool__field-icon--arrow admin-tool__toggle-arrow" aria-hidden="true"></span>
              </button>
            </div>
            <div class="admin-tool__entry-body" hidden>
              ${userEntryBodyHtml(user)}
            </div>
          </li>`)
      .join("");

    return `<ul class="admin-tool__entries">${list || '<li class="admin-tool__empty">Aucun utilisateur.</li>'}</ul>`;
  };

  // ─── Users: entry interactions (re-bound on every entries reload) ────────────

  const bindUsersEntryInteractions = () => {
    if (!panels.users) return;

    panels.users.querySelectorAll(".admin-tool__entry").forEach((entry) => {
      const body = entry.querySelector(".admin-tool__entry-body");
      const toggleBtn = entry.querySelector("[data-toggle-user]");
      toggleBtn?.addEventListener("click", () => {
        if (!body) return;
        body.hidden = !body.hidden;
        toggleBtn.setAttribute("aria-expanded", String(!body.hidden));
        entry.classList.toggle("is-expanded", !body.hidden);
      });

      entry.querySelector("[data-delete-user]")?.addEventListener("click", async () => {
        const userId = Number(entry.getAttribute("data-user-id") || 0);
        if (!userId) return;
        const ok = await showConfirm("Confirmer la suppression de cet utilisateur ?");
        if (!ok) return;
        try {
          await deleteAdminUser(userId, token);
          await loadUsers();
        } catch (error) {
          window.alert(error?.message || "Suppression impossible.");
        }
      });

      const editForm = entry.querySelector("[data-user-edit-form]");
      if (editForm instanceof HTMLFormElement) {
        const userId = Number(editForm.dataset.userEditForm || 0);
        const user = state.users.items.find((item) => Number(item.id) === userId);
        if (!user) return;

        const original = {
          username: String(user.username || ""),
          nom: String(user.nom || ""),
          prenom: String(user.prenom || ""),
          email: String(user.email || ""),
          isAdmin: Number(user.isAdmin) ? 1 : 0,
          newsletter: Number(user.newsletter) ? 1 : 0
        };

        const saveBtn = editForm.querySelector("[data-save-edit]");
        const msg = editForm.querySelector("[data-edit-msg]");

        const getCurrent = () => ({
          username: String(editForm.elements.username.value || "").trim(),
          nom: String(editForm.elements.nom.value || "").trim(),
          prenom: String(editForm.elements.prenom.value || "").trim(),
          email: String(editForm.elements.email.value || "").trim(),
          isAdmin: editForm.elements.isAdmin.checked ? 1 : 0,
          newsletter: editForm.elements.newsletter.checked ? 1 : 0
        });

        const refreshSaveState = () => {
          const current = getCurrent();
          const changed = Object.keys(current).some((key) => String(current[key]) !== String(original[key]));

          const fieldErrors = {
            username: String(current.username || "").trim().length < 2 ? "Au moins 2 caractères requis." : "",
            nom: "",
            prenom: "",
            email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(current.email || "").trim()) ? "Email invalide." : ""
          };

          Object.entries(fieldErrors).forEach(([field, errorMsg]) => {
            const input = editForm.elements[field];
            const errorEl = editForm.querySelector(`[data-field-error="${field}"]`);
            const fieldEl = input instanceof HTMLElement ? input.closest(".admin-tool__edit-field") : null;
            const hasValue = String(input?.value || "").trim().length > 0;
            if (fieldEl) {
              fieldEl.classList.toggle("is-invalid", Boolean(errorMsg));
              fieldEl.classList.toggle("is-valid", !errorMsg && hasValue);
            }
            if (errorEl) errorEl.textContent = errorMsg;
          });

          const hasErrors = Object.values(fieldErrors).some(Boolean);
          if (msg) msg.textContent = "";
          if (saveBtn instanceof HTMLButtonElement) {
            saveBtn.disabled = !changed || hasErrors;
          }
        };

        editForm.addEventListener("input", refreshSaveState);
        editForm.addEventListener("change", refreshSaveState);
        refreshSaveState();

        editForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const current = getCurrent();
          const errors = userInputValidation(current);
          if (errors.length) {
            if (msg) msg.textContent = errors[0];
            return;
          }

          try {
            await updateAdminUser(userId, current, token);
            await loadUsers();
          } catch (error) {
            if (msg) msg.textContent = error?.payload?.message || error?.message || "Mise a jour impossible.";
          }
        });
      }
    });

    const pagerHost = panels.users.querySelector("[data-users-pager]");
    if (pagerHost) {
      const pager = createPager({
        page: state.users.page,
        totalPages: state.users.totalPages,
        onPageClick: async (nextPage) => {
          state.users.page = nextPage;
          await loadUsers();
        }
      });
      pagerHost.replaceChildren(pager);
    }
  };

  // ─── Users: static interactions (bound once on first render) ─────────────────

  const bindUsersStaticInteractions = () => {
    if (!panels.users) return;

    const searchBtn = panels.users.querySelector("[data-user-search]");
    const filterInputs = [...panels.users.querySelectorAll(".admin-tool__filter")];
    const syncFilterState = (input) => {
      if (!(input instanceof HTMLElement)) return;
      if (input.tagName === "SELECT" || input.getAttribute("type") === "date") {
        input.classList.toggle("admin-tool__filter--has-value", input.value !== "");
      }
    };

    const refreshSearchBtn = () => {
      const hasValue = filterInputs.some((input) => String(input.value || "").trim() !== "");
      if (searchBtn instanceof HTMLButtonElement) {
        searchBtn.disabled = !hasValue;
      }
    };

    filterInputs.forEach((input) => {
      syncFilterState(input);
      input.addEventListener("input", () => {
        const key = input.getAttribute("data-filter");
        if (!key) return;
        state.users.filters[key] = String(input.value || "").trim();
        syncFilterState(input);
        refreshSearchBtn();
      });
      input.addEventListener("change", () => {
        const key = input.getAttribute("data-filter");
        if (!key) return;
        state.users.filters[key] = String(input.value || "").trim();
        syncFilterState(input);
        refreshSearchBtn();
      });
    });

    searchBtn?.addEventListener("click", async () => {
      state.users.page = 1;
      await loadUsers();
    });

    panels.users.querySelectorAll(".admin-tool__filter--select").forEach(syncSelectWidthToContent);

    const sortSelect = panels.users.querySelector("[data-users-sort]");
    syncSelectWidthToContent(sortSelect);
    sortSelect?.addEventListener("change", async () => {
      const col = String(sortSelect.value || "created_at");
      if (state.users.sortBy === col) {
        state.users.sortDir = state.users.sortDir === "DESC" ? "ASC" : "DESC";
      } else {
        state.users.sortBy = col;
        state.users.sortDir = "DESC";
      }
      state.users.page = 1;
      await loadUsers();
    });

    const usersHead = panels.users.querySelector(".admin-tool__entries-head");
    usersHead?.addEventListener("click", async (e) => {
      const span = e.target.closest("[data-sort-col]");
      if (!span) return;
      const col = span.getAttribute("data-sort-col");
      if (!col) return;
      if (state.users.sortBy === col) {
        state.users.sortDir = state.users.sortDir === "DESC" ? "ASC" : "DESC";
      } else {
        state.users.sortBy = col;
        state.users.sortDir = "DESC";
      }
      state.users.page = 1;
      await loadUsers();
    });

    refreshSearchBtn();
  };

  // ─── Users: update only the entries area + pager ──────────────────────────────

  const updateUsersEntries = () => {
    const scroll = panels.users.querySelector(".admin-tool__entries-scroll");
    if (scroll) {
      scroll.innerHTML = renderUsersList();
      scroll.querySelectorAll(".admin-tool__entry").forEach((entry, i) => {
        entry.style.animationDelay = `${i * 40}ms`;
      });
    }
    bindUsersEntryInteractions();
  };

  // ─── Users: build full panel structure (once) ─────────────────────────────────

  const usersHeadCols = [
    { label: "ID",                  col: "id" },
    { label: "Nom d\u2019utilisateur", col: "username" },
    { label: "Adresse mail",         col: "email" },
    { label: "Date d\u2019inscription", col: "created_at" },
    { label: "R\u00f4le",             col: "is_admin" }
  ];

  const buildUsersHeadHtml = () => usersHeadCols.map(({ label, col }) => {
    if (!col) return `<span>${esc(label)}</span>`;
    const isActive = state.users.sortBy === col;
    const cls = isActive
      ? ` class="is-sort-active${state.users.sortDir === "ASC" ? " is-sort-asc" : ""}"`
      : "";
    return `<span${cls} data-sort-col="${esc(col)}">${esc(label)}</span>`;
  }).join("");

  const syncUsersHeadSort = () => {
    const head = panels.users?.querySelector(".admin-tool__entries-head");
    if (head) head.innerHTML = buildUsersHeadHtml();
    const sel = panels.users?.querySelector("[data-users-sort]");
    if (sel) sel.value = state.users.sortBy;
  };

  const renderUsersPanel = () => {
    if (!panels.users) return;

    const sortHtml = userSortOptions
      .map(([value, label]) => {
        const selected = state.users.sortBy === value ? "selected" : "";
        return `<option value="${esc(value)}" ${selected}>${esc(label)}</option>`;
      })
      .join("");

    panels.users.innerHTML = `
      ${buildUserFilters()}
      <div class="admin-tool__list-head">
        <label class="admin-tool__sort-wrap">Trier par
          <span class="admin-tool__select-wrap">
            <select data-users-sort>${sortHtml}</select>
            <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
          </span>
        </label>
      </div>
      <div class="admin-tool__entries-head" role="presentation">${buildUsersHeadHtml()}</div>
      <div class="admin-tool__panel-main admin-tool__panel-main--list">
        <div class="admin-tool__scroll-wrap">
          <div class="admin-tool__entries-scroll"></div>
        </div>
        <div class="admin-tool__panel-footer" data-users-pager></div>
      </div>`;

    bindUsersStaticInteractions();
  };

  const loadUsers = async () => {
    if (!panels.users) return;

    const alreadyBuilt = Boolean(panels.users.querySelector(".admin-tool__entries-scroll"));
    if (!alreadyBuilt) renderUsersPanel();

    const scroll = panels.users.querySelector(".admin-tool__entries-scroll");
    if (scroll) scroll.innerHTML = "";

    const params = {
      page: state.users.page,
      per_page: 25,
      sort_by: state.users.sortBy,
      sort_dir: state.users.sortDir,
      ...state.users.filters
    };

    try {
      const data = await fetchAdminUsers(params, token);
      state.users.items = Array.isArray(data?.items) ? data.items : [];
      state.users.totalPages = Number(data?.total_pages || 1);
      state.users.page = Number(data?.page || 1);
      // Client-side alphabetical sort for string fields
      const { sortBy: ub, sortDir: ud } = state.users;
      const uDir = ud === "ASC" ? 1 : -1;
      if (["id", "username", "email", "nom", "prenom"].includes(ub)) {
        state.users.items.sort((a, b) =>
          String(a[ub] ?? "").localeCompare(String(b[ub] ?? ""), "fr", { sensitivity: "base" }) * uDir
        );
      } else if (ub === "is_admin") {
        state.users.items.sort((a, b) => (Number(a.isAdmin) - Number(b.isAdmin)) * uDir);
      }
      syncUsersHeadSort();
      updateUsersEntries();
    } catch (error) {
      if (scroll) scroll.innerHTML = `<li class="admin-tool__error" style="list-style:none">${esc(error?.message || "Erreur")}</li>`;
    }
  };

  const atelierEntryBodyHtml = (atelier) => {
    const themaOptions = state.thematiquesCache
      .map((t) => `<option value="${esc(String(t.id))}" ${String(atelier.thematique_id || "") === String(t.id) ? "selected" : ""}>${esc(t.titre)}</option>`)
      .join("");

    const nbVal = atelier.nb_participants != null ? String(atelier.nb_participants) : "";
    const nbDisplay = nbVal ? `+${nbVal}` : "";

    const isMundaneum = !!Number(atelier.mundaneum);
    const adresseDisabled = isMundaneum ? "disabled" : "";

    return `
    <form class="admin-tool__entry-edit" data-atelier-edit-form="${esc(String(atelier.id))}">
      <div class="admin-tool__edit-row admin-tool__edit-row--5">
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Thématique</span>
          <div class="admin-tool__edit-input-wrap admin-tool__edit-input-wrap--select">
            <select name="thematique_id">
              <option value="">-- Thématique --</option>
              ${themaOptions}
            </select>
            <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Nb participants</span>
          <div class="admin-tool__edit-input-wrap admin-tool__edit-input-wrap--number">
            <input type="text" inputmode="numeric" readonly name="nb_participants"
              data-number-step="10" data-number-min="10" data-number-max="100" data-number-prefix="+"
              value="${esc(nbDisplay)}" placeholder="-- Participants --" autocomplete="off" />
            <div class="admin-tool__number-arrows" aria-hidden="true">
              <button class="admin-tool__number-arrow admin-tool__number-arrow--up" type="button" tabindex="-1"></button>
              <button class="admin-tool__number-arrow admin-tool__number-arrow--down" type="button" tabindex="-1"></button>
            </div>
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Date début</span>
          <div class="admin-tool__edit-input-wrap admin-tool__edit-input-wrap--date">
            <input type="date" name="start_date" value="${esc(atelier.start_date ? String(atelier.start_date).slice(0, 10) : "")}"
              class="${atelier.start_date ? "has-value" : ""}" />
            <span class="admin-tool__edit-date-placeholder" aria-hidden="true">-- Date début --</span>
            <span class="admin-tool__field-icon admin-tool__field-icon--calendar" aria-hidden="true"></span>
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Date fin</span>
          <div class="admin-tool__edit-input-wrap admin-tool__edit-input-wrap--date">
            <input type="date" name="end_date" value="${esc(atelier.end_date ? String(atelier.end_date).slice(0, 10) : "")}"
              class="${atelier.end_date ? "has-value" : ""}" />
            <span class="admin-tool__edit-date-placeholder" aria-hidden="true">-- Date fin --</span>
            <span class="admin-tool__field-icon admin-tool__field-icon--calendar" aria-hidden="true"></span>
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Date validation</span>
          <div class="admin-tool__edit-input-wrap admin-tool__edit-input-wrap--date">
            <input type="date" name="valid_date" value="${esc(atelier.valid_date ? String(atelier.valid_date).slice(0, 10) : "")}"
              class="${atelier.valid_date ? "has-value" : ""}" />
            <span class="admin-tool__edit-date-placeholder" aria-hidden="true">-- Date validation --</span>
            <span class="admin-tool__field-icon admin-tool__field-icon--calendar" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <h4 class="admin-tool__edit-section-title">Lieu de l’atelier</h4>
      <div class="admin-tool__edit-row admin-tool__edit-row--4 admin-tool__edit-row--address${isMundaneum ? " is-disabled" : ""}">
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Établissement</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="etablissement" value="${esc(isMundaneum ? "Mundaneum" : (atelier.etablissement || ""))}" autocomplete="off" ${adresseDisabled} />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Adresse</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="adresse" value="${esc(isMundaneum ? "Rue de Nimy 76" : (atelier.adresse || ""))}" autocomplete="off" ${adresseDisabled} />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Code postal</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="code_postal" value="${esc(isMundaneum ? "7000" : (atelier.code_postal || ""))}" autocomplete="off" ${adresseDisabled} />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Localité</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="localite" value="${esc(isMundaneum ? "Mons" : (atelier.localite || ""))}" autocomplete="off" ${adresseDisabled} />
          </div>
        </div>
      </div>
      <div class="admin-tool__edit-row admin-tool__edit-row--mundaneum">
        <label class="admin-tool__check-option">
          <input type="checkbox" name="mundaneum" ${isMundaneum ? "checked" : ""} />
          Au Mundaneum
        </label>
      </div>
      <h4 class="admin-tool__edit-section-title">Personne de contact</h4>
      <div class="admin-tool__edit-row admin-tool__edit-row--4">
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Nom</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="nom" value="${esc(atelier.nom || "")}" autocomplete="off" />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Prénom</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="prenom" value="${esc(atelier.prenom || "")}" autocomplete="off" />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Mail</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="email" name="email" value="${esc(atelier.email || "")}" autocomplete="off" />
          </div>
          <span class="admin-tool__edit-field-error" data-field-error="email"></span>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Téléphone</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="telephone" value="${esc(atelier.telephone || "")}" autocomplete="off" />
          </div>
        </div>
      </div>
      <p class="admin-tool__entry-edit-msg" data-edit-msg></p>
      <div class="admin-tool__entry-actions">
        <button type="button" class="buttonRoundAct" data-delete-atelier>Supprimer</button>
        <button type="submit" class="buttonRoundAct" data-save-edit disabled>Sauvegarder</button>
      </div>
    </form>`;
  };

  const renderAteliersList = () => {
    const items = state.ateliers.items
      .map((atelier) => `
        <li class="admin-tool__entry" data-atelier-id="${esc(String(atelier.id))}">
          <div class="admin-tool__entry-head">
            <div class="admin-tool__entry-main">
              <span class="admin-tool__entry-id">#${esc(String(atelier.id))}</span>
              <strong>${esc(atelier.thematique || "-")}</strong>
              <span>${esc(atelier.username || "-")}</span>
              <span>${esc(formatDateTime(atelier.created_at))}</span>
              ${atelierStatusTag(atelier)}
            </div>
            <button type="button" class="admin-tool__toggle-btn" aria-expanded="false" data-toggle-atelier>
              <span class="admin-tool__field-icon admin-tool__field-icon--arrow admin-tool__toggle-arrow" aria-hidden="true"></span>
            </button>
          </div>
          <div class="admin-tool__entry-body" hidden>
            ${atelierEntryBodyHtml(atelier)}
          </div>
        </li>`)
      .join("");

    return `<ul class="admin-tool__entries">${items || '<li class="admin-tool__empty">Aucun atelier.</li>'}</ul>`;
  };

  // ─── Ateliers: entry interactions (re-bound on every entries reload) ──────────

  const mundaneumFill = {
    etablissement: "Mundaneum",
    adresse: "Rue de Nimy 76",
    code_postal: "7000",
    localite: "Mons"
  };

  const bindAteliersEntryInteractions = () => {
    if (!panels.ateliers) return;

    const allEntries = [...panels.ateliers.querySelectorAll(".admin-tool__entry")];

    const closeEntry = (entry) => {
      const body = entry.querySelector(".admin-tool__entry-body");
      if (!body || body.hidden) return;
      body.hidden = true;
      entry.querySelector("[data-toggle-atelier]")?.setAttribute("aria-expanded", "false");
      entry.classList.remove("is-expanded");
    };

    allEntries.forEach((entry) => {
      const body = entry.querySelector(".admin-tool__entry-body");
      const atelierId = Number(entry.getAttribute("data-atelier-id") || 0);

      entry.querySelector("[data-toggle-atelier]")?.addEventListener("click", () => {
        if (!body) return;
        const isOpen = !body.hidden;
        allEntries.forEach(closeEntry);
        if (!isOpen) {
          body.hidden = false;
          entry.querySelector("[data-toggle-atelier]")?.setAttribute("aria-expanded", "true");
          entry.classList.add("is-expanded");
        }
      });

      entry.querySelector("[data-delete-atelier]")?.addEventListener("click", async () => {
        if (!atelierId) return;
        const ok = await showConfirm("Confirmer la suppression de cet atelier ?");
        if (!ok) return;
        try {
          await deleteAdminAtelier(atelierId, token);
          await loadAteliers();
        } catch (error) {
          window.alert(error?.message || "Suppression impossible.");
        }
      });

      const editForm = entry.querySelector("[data-atelier-edit-form]");
      if (!(editForm instanceof HTMLFormElement)) return;

      const saveBtn = editForm.querySelector("[data-save-edit]");
      const msg = editForm.querySelector("[data-edit-msg]");
      const addressRow = editForm.querySelector(".admin-tool__edit-row--address");
      const mundaneumCb = editForm.querySelector("input[name='mundaneum']");

      const atelier = state.ateliers.items.find((item) => item.id === atelierId);
      const isMundaneum = !!Number(atelier?.mundaneum);

      const original = {
        thematique_id: String(atelier?.thematique_id ?? "").trim(),
        nb_participants: atelier?.nb_participants != null ? `+${atelier.nb_participants}` : "",
        start_date: atelier?.start_date ? String(atelier.start_date).slice(0, 10) : "",
        end_date: atelier?.end_date ? String(atelier.end_date).slice(0, 10) : "",
        valid_date: atelier?.valid_date ? String(atelier.valid_date).slice(0, 10) : "",
        mundaneum: isMundaneum ? "1" : "0",
        etablissement: isMundaneum ? "Mundaneum" : String(atelier?.etablissement ?? "").trim(),
        adresse: isMundaneum ? "Rue de Nimy 76" : String(atelier?.adresse ?? "").trim(),
        code_postal: isMundaneum ? "7000" : String(atelier?.code_postal ?? "").trim(),
        localite: isMundaneum ? "Mons" : String(atelier?.localite ?? "").trim(),
        nom: String(atelier?.nom ?? "").trim(),
        prenom: String(atelier?.prenom ?? "").trim(),
        email: String(atelier?.email ?? "").trim(),
        telephone: String(atelier?.telephone ?? "").trim()
      };

      const getFields = () => ({
        thematique_id: String(editForm.elements.thematique_id?.value ?? "").trim(),
        nb_participants: String(editForm.elements.nb_participants?.value ?? "").trim(),
        start_date: String(editForm.elements.start_date?.value ?? "").trim(),
        end_date: String(editForm.elements.end_date?.value ?? "").trim(),
        valid_date: String(editForm.elements.valid_date?.value ?? "").trim(),
        mundaneum: editForm.elements.mundaneum?.checked ? "1" : "0",
        etablissement: String(editForm.elements.etablissement?.value ?? "").trim(),
        adresse: String(editForm.elements.adresse?.value ?? "").trim(),
        code_postal: String(editForm.elements.code_postal?.value ?? "").trim(),
        localite: String(editForm.elements.localite?.value ?? "").trim(),
        nom: String(editForm.elements.nom?.value ?? "").trim(),
        prenom: String(editForm.elements.prenom?.value ?? "").trim(),
        email: String(editForm.elements.email?.value ?? "").trim(),
        telephone: String(editForm.elements.telephone?.value ?? "").trim()
      });

      // Mundaneum toggle
      const applyMundaneum = (checked) => {
        if (!addressRow) return;
        addressRow.classList.toggle("is-disabled", checked);
        ["etablissement", "adresse", "code_postal", "localite"].forEach((name) => {
          const input = editForm.elements[name];
          if (!(input instanceof HTMLInputElement)) return;
          input.disabled = checked;
          input.value = checked ? (mundaneumFill[name] ?? "") : (String(atelier?.[name] ?? "").trim());
        });
      };

      mundaneumCb?.addEventListener("change", () => {
        applyMundaneum(mundaneumCb.checked);
        refreshSaveState();
      });

      // Date inputs: toggle has-value class + placeholder visibility
      editForm.querySelectorAll("input[type='date']").forEach((dateInput) => {
        dateInput.addEventListener("change", () => {
          dateInput.classList.toggle("has-value", !!dateInput.value);
        });
      });

      // Number stepper arrows
      editForm.addEventListener("click", (event) => {
        const arrow = event.target instanceof Element
          ? event.target.closest(".admin-tool__number-arrow")
          : null;
        if (!(arrow instanceof HTMLButtonElement)) return;
        const wrap = arrow.closest(".admin-tool__edit-input-wrap--number");
        const input = wrap?.querySelector("input[data-number-step]");
        if (!(input instanceof HTMLInputElement)) return;
        const step = Number(input.dataset.numberStep) || 10;
        const min = Number(input.dataset.numberMin) || step;
        const max = input.dataset.numberMax ? Number(input.dataset.numberMax) : Infinity;
        const prefix = input.dataset.numberPrefix || "";
        const raw = String(input.value || "").replace(/[^0-9]/g, "");
        const current = raw ? Number(raw) : 0;
        const isUp = arrow.classList.contains("admin-tool__number-arrow--up");
        if (isUp) {
          input.value = prefix + Math.min(current === 0 ? min : current + step, max);
        } else {
          const next = current - step;
          input.value = next < min ? "" : prefix + next;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const refreshSaveState = () => {
        const current = getFields();
        const changed = Object.keys(current).some((key) => current[key] !== original[key]);
        const emailError = current.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.email) ? "Email invalide." : "";

        const emailField = editForm.querySelector(".admin-tool__edit-field:has([name='email'])");
        const emailErrorEl = editForm.querySelector("[data-field-error='email']");
        if (emailField) emailField.classList.toggle("is-invalid", Boolean(emailError));
        if (emailErrorEl) emailErrorEl.textContent = emailError;

        if (msg) msg.textContent = "";
        if (saveBtn instanceof HTMLButtonElement) {
          saveBtn.disabled = !changed || Boolean(emailError);
        }
      };

      editForm.addEventListener("input", refreshSaveState);
      editForm.addEventListener("change", refreshSaveState);
      refreshSaveState();

      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const current = getFields();
        const emailError = current.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.email) ? "Email invalide." : "";
        if (emailError) {
          if (msg) msg.textContent = emailError;
          return;
        }
        // Send raw number (strip prefix)
        const rawNb = String(current.nb_participants || "").replace(/[^0-9]/g, "");
        try {
          await updateAdminAtelier(atelierId, { ...current, nb_participants: rawNb }, token);
          await loadAteliers();
        } catch (error) {
          if (msg) msg.textContent = error?.payload?.message || error?.message || "Mise à jour impossible.";
        }
      });
    });

    const pagerHost = panels.ateliers.querySelector("[data-ateliers-pager]");
    if (pagerHost) {
      const pager = createPager({
        page: state.ateliers.page,
        totalPages: state.ateliers.totalPages,
        onPageClick: async (nextPage) => {
          state.ateliers.page = nextPage;
          await loadAteliers();
        }
      });
      pagerHost.replaceChildren(pager);
    }
  };

  // ─── Ateliers: static interactions (bound once on first render) ───────────────

  const bindAteliersStaticInteractions = () => {
    if (!panels.ateliers) return;

    const searchBtn = panels.ateliers.querySelector("[data-atelier-search]");
    const filterInputs = [...panels.ateliers.querySelectorAll(".admin-tool__filter")];

    const syncFilterState = (input) => {
      if (!(input instanceof HTMLElement)) return;
      if (input.tagName === "SELECT" || input.getAttribute("type") === "date") {
        input.classList.toggle("admin-tool__filter--has-value", input.value !== "");
      }
    };

    const refreshSearchBtn = () => {
      const hasValue = filterInputs.some((input) => String(input.value || "").trim() !== "");
      if (searchBtn instanceof HTMLButtonElement) {
        searchBtn.disabled = !hasValue;
      }
    };

    filterInputs.forEach((input) => {
      syncFilterState(input);
      input.addEventListener("input", () => {
        const key = input.getAttribute("data-filter");
        if (!key) return;
        state.ateliers.filters[key] = String(input.value || "").trim();
        syncFilterState(input);
        refreshSearchBtn();
      });
      input.addEventListener("change", () => {
        const key = input.getAttribute("data-filter");
        if (!key) return;
        state.ateliers.filters[key] = String(input.value || "").trim();
        syncFilterState(input);
        refreshSearchBtn();
      });
    });

    searchBtn?.addEventListener("click", async () => {
      state.ateliers.page = 1;
      await loadAteliers();
    });

    panels.ateliers.querySelectorAll(".admin-tool__filter--select").forEach(syncSelectWidthToContent);

    const sortSelect = panels.ateliers.querySelector("[data-ateliers-sort]");
    syncSelectWidthToContent(sortSelect);
    sortSelect?.addEventListener("change", async () => {
      const col = String(sortSelect.value || "created_at");
      if (state.ateliers.sortBy === col) {
        state.ateliers.sortDir = state.ateliers.sortDir === "DESC" ? "ASC" : "DESC";
      } else {
        state.ateliers.sortBy = col;
        state.ateliers.sortDir = "DESC";
      }
      state.ateliers.page = 1;
      await loadAteliers();
    });

    const ateliersHead = panels.ateliers.querySelector(".admin-tool__entries-head");
    ateliersHead?.addEventListener("click", async (e) => {
      const span = e.target.closest("[data-sort-col]");
      if (!span) return;
      const col = span.getAttribute("data-sort-col");
      if (!col) return;
      if (state.ateliers.sortBy === col) {
        state.ateliers.sortDir = state.ateliers.sortDir === "DESC" ? "ASC" : "DESC";
      } else {
        state.ateliers.sortBy = col;
        state.ateliers.sortDir = "DESC";
      }
      state.ateliers.page = 1;
      await loadAteliers();
    });

    refreshSearchBtn();
  };

  // ─── Ateliers: update only the entries area + pager ───────────────────────────

  const updateAteliersEntries = () => {
    const scroll = panels.ateliers.querySelector(".admin-tool__entries-scroll");
    if (scroll) {
      scroll.innerHTML = renderAteliersList();
      scroll.querySelectorAll(".admin-tool__entry").forEach((entry, i) => {
        entry.style.animationDelay = `${i * 40}ms`;
      });
    }
    bindAteliersEntryInteractions();
  };

  // ─── Ateliers: build full panel structure (once) ──────────────────────────────

  const ateliersHeadCols = [
    { label: "ID",                   col: "id" },
    { label: "Th\u00e9matique",         col: "thematique_id" },
    { label: "Utilisateur",           col: "username" },
    { label: "Date de cr\u00e9ation",   col: "created_at" },
    { label: "Statut",                col: "valid_date" }
  ];

  const ateliersSortOptions = [
    ["id",            "ID"],
    ["thematique_id", "Th\u00e9matique"],
    ["username",      "Utilisateur"],
    ["created_at",    "Date de cr\u00e9ation"],
    ["valid_date",    "Statut"]
  ];

  const buildAteliersHeadHtml = () => ateliersHeadCols.map(({ label, col }) => {
    if (!col) return `<span>${esc(label)}</span>`;
    const isActive = state.ateliers.sortBy === col;
    const cls = isActive
      ? ` class="is-sort-active${state.ateliers.sortDir === "ASC" ? " is-sort-asc" : ""}"`
      : "";
    return `<span${cls} data-sort-col="${esc(col)}">${esc(label)}</span>`;
  }).join("");

  const syncAteliersHeadSort = () => {
    const head = panels.ateliers?.querySelector(".admin-tool__entries-head");
    if (head) head.innerHTML = buildAteliersHeadHtml();
    const sel = panels.ateliers?.querySelector("[data-ateliers-sort]");
    if (sel) {
      sel.value = state.ateliers.sortBy;
      syncSelectWidthToContent(sel);
    }
  };

  const renderAteliersPanel = () => {
    if (!panels.ateliers) return;

    const sortHtml = ateliersSortOptions
      .map(([value, label]) => {
        const selected = state.ateliers.sortBy === value ? "selected" : "";
        return `<option value="${esc(value)}" ${selected}>${esc(label)}</option>`;
      })
      .join("");

    panels.ateliers.innerHTML = `
      ${buildAtelierFilters()}
      <div class="admin-tool__list-head">
        <label class="admin-tool__sort-wrap">Trier par
          <span class="admin-tool__select-wrap">
            <select data-ateliers-sort>${sortHtml}</select>
            <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
          </span>
        </label>
      </div>
      <div class="admin-tool__entries-head admin-tool__entries-head--ateliers" role="presentation">${buildAteliersHeadHtml()}</div>
      <div class="admin-tool__panel-main admin-tool__panel-main--list">
        <div class="admin-tool__scroll-wrap">
          <div class="admin-tool__entries-scroll"></div>
        </div>
        <div class="admin-tool__panel-footer" data-ateliers-pager></div>
      </div>`;

    bindAteliersStaticInteractions();
  };

  const loadAteliers = async () => {
    if (!panels.ateliers) return;

    if (state.thematiquesCache.length === 0) {
      try {
        state.thematiquesCache = await fetchThematiques();
      } catch (_) {
        state.thematiquesCache = [];
      }
    }

    const alreadyBuilt = Boolean(panels.ateliers.querySelector(".admin-tool__entries-scroll"));
    if (!alreadyBuilt) renderAteliersPanel();

    const scroll = panels.ateliers.querySelector(".admin-tool__entries-scroll");
    if (scroll) scroll.innerHTML = "";

    const params = {
      page: state.ateliers.page,
      per_page: 10,
      sort_by: state.ateliers.sortBy,
      sort_dir: state.ateliers.sortDir,
      ...state.ateliers.filters
    };

    try {
      const data = await fetchAdminAteliers(params, token);

      state.ateliers.items = Array.isArray(data?.items) ? data.items : [];
      state.ateliers.totalPages = Number(data?.total_pages || 1);
      state.ateliers.page = Number(data?.page || 1);
      // Client-side alphabetical sort for string / name-based fields
      const { sortBy: ab, sortDir: ad } = state.ateliers;
      const aDir = ad === "ASC" ? 1 : -1;
      if (ab === "thematique_id") {
        const nameMap = Object.fromEntries(
          state.thematiquesCache.map((t) => [String(t.id), String(t.titre || "")])
        );
        state.ateliers.items.sort((a, b) =>
          (nameMap[String(a.thematique_id)] || "").localeCompare(
            nameMap[String(b.thematique_id)] || "", "fr", { sensitivity: "base" }
          ) * aDir
        );
      } else if (["username", "id"].includes(ab)) {
        state.ateliers.items.sort((a, b) =>
          String(a[ab] ?? "").localeCompare(String(b[ab] ?? ""), "fr", { sensitivity: "base" }) * aDir
        );
      } else if (ab === "valid_date") {
        state.ateliers.items.sort((a, b) => {
          const va = String(a.valid_date || "");
          const vb = String(b.valid_date || "");
          return va < vb ? -aDir : va > vb ? aDir : 0;
        });
      }
      syncAteliersHeadSort();
      updateAteliersEntries();
    } catch (error) {
      if (scroll) scroll.innerHTML = `<li class="admin-tool__error" style="list-style:none">${esc(error?.message || "Erreur")}</li>`;
    }
  };

  root.querySelectorAll(".admin-tool__tab").forEach((tabButton) => {
    tabButton.addEventListener("click", async () => {
      const tab = tabButton.getAttribute("data-admin-tab");
      if (!tab) return;

      root.querySelectorAll(".admin-tool__tab").forEach((node) => node.classList.toggle("is-active", node === tabButton));
      root.querySelectorAll(".admin-tool__panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.getAttribute("data-admin-panel") === tab);
      });

      if (tab === "overview" && !state.overviewLoaded) {
        state.overviewLoaded = true;
        await renderOverview();
      }
      if (tab === "users" && !state.usersLoaded) {
        state.usersLoaded = true;
        await loadUsers();
      }
      if (tab === "ateliers" && !state.ateliersLoaded) {
        state.ateliersLoaded = true;
        await loadAteliers();
      }
    });
  });

  state.overviewLoaded = true;
  try {
    const initialOverview = await fetchAdminOverview(token);
    await renderOverview(initialOverview);
  } catch (error) {
    await renderOverview();
  }
}

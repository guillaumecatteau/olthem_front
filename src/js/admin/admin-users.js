// admin-users.js — Panel Utilisateurs de l'admin tool.
//
// Responsabilité : construire et gérer le panel de gestion des utilisateurs
// (filtres, liste paginée, formulaire d'édition inline, suppression).
//
// Exposé via la fonction createUsersPanel(state, panels, token, deps).
// Retourne { loadUsers } pour permettre au parent (admin-tool.js) de déclencher
// le chargement initial ou de rafraîchir la liste depuis l'extérieur.

// ─── Validation locale ────────────────────────────────────────────────────────

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

// \u2500\u2500\u2500 Constructeur de panel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export function createUsersPanel(state, panels, token, deps) {
  const {
    esc,
    formatDate,
    createPager,
    syncSelectWidthToContent,
    fetchAdminUsers,
    updateAdminUser,
    deleteAdminUser,
    showConfirm
  } = deps;

  // ─── Options de tri disponibles ─────────────────────────────────────────────

  const userSortOptions = [
    ["id",          "ID"],
    ["username",    "Nom d\u2019utilisateur"],
    ["email",       "Adresse mail"],
    ["created_at",  "Date d\u2019inscription"],
    ["is_admin",    "R\u00f4le"]
  ];

  // ─── Colonnes d'en-tête ──────────────────────────────────────────────────────

  const usersHeadCols = [
    { label: "ID",                     col: "id" },
    { label: "Nom d\u2019utilisateur", col: "username" },
    { label: "Adresse mail",           col: "email" },
    { label: "Date d\u2019inscription", col: "created_at" },
    { label: "R\u00f4le",              col: "is_admin" }
  ];

  // ─── Filtres ─────────────────────────────────────────────────────────────────

  const buildUserFilters = () => {
    const f = state.users.filters;
    return `
      <section class="admin-tool__filters-wrap">
        <div class="admin-tool__filters admin-tool__filters--users">
          <div class="admin-tool__filters-row">
            <input class="admin-tool__filter admin-tool__filter--id" data-filter="id" type="text" placeholder="ID" value="${esc(f.id)}" />
            <input class="admin-tool__filter" data-filter="username" type="text" placeholder="Username" value="${esc(f.username)}" />
            <input class="admin-tool__filter" data-filter="last_name" type="text" placeholder="Nom" value="${esc(f.last_name)}" />
            <input class="admin-tool__filter" data-filter="first_name" type="text" placeholder="Prenom" value="${esc(f.first_name)}" />
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

  // ─── Corps du formulaire d'édition (accordéon) ───────────────────────────────

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
            <input type="text" name="last_name" value="${esc(user.last_name || "")}" autocomplete="off" />
          </div>
          <span class="admin-tool__edit-field-error" data-field-error="last_name"></span>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Prénom</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="first_name" value="${esc(user.first_name || "")}" autocomplete="off" />
          </div>
          <span class="admin-tool__edit-field-error" data-field-error="first_name"></span>
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

  // ─── Rendu de la liste ────────────────────────────────────────────────────────

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

  // ─── Interactions par entrée (reliées à chaque rechargement) ─────────────────

  const bindUsersEntryInteractions = () => {
    if (!panels.users) return;

    panels.users.querySelectorAll(".admin-tool__entry").forEach((entry) => {
      const body      = entry.querySelector(".admin-tool__entry-body");
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
      if (!(editForm instanceof HTMLFormElement)) return;

      const userId = Number(editForm.dataset.userEditForm || 0);
      const user   = state.users.items.find((item) => Number(item.id) === userId);
      if (!user) return;

      const original = {
        username:   String(user.username   || ""),
        last_name:  String(user.last_name  || ""),
        first_name: String(user.first_name || ""),
        email:      String(user.email      || ""),
        isAdmin:    Number(user.isAdmin)    ? 1 : 0,
        newsletter: Number(user.newsletter) ? 1 : 0
      };

      const saveBtn = editForm.querySelector("[data-save-edit]");
      const msg     = editForm.querySelector("[data-edit-msg]");

      const getCurrent = () => ({
        username:   String(editForm.elements.username.value   || "").trim(),
        last_name:  String(editForm.elements.last_name.value  || "").trim(),
        first_name: String(editForm.elements.first_name.value || "").trim(),
        email:      String(editForm.elements.email.value      || "").trim(),
        isAdmin:    editForm.elements.isAdmin.checked    ? 1 : 0,
        newsletter: editForm.elements.newsletter.checked ? 1 : 0
      });

      const refreshSaveState = () => {
        const current = getCurrent();
        const changed = Object.keys(current).some((key) => String(current[key]) !== String(original[key]));

        const fieldErrors = {
          username:   String(current.username || "").trim().length < 2 ? "Au moins 2 caract\u00e8res requis." : "",
          last_name:  "",
          first_name: "",
          email:      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(current.email || "").trim()) ? "Email invalide." : ""
        };

        Object.entries(fieldErrors).forEach(([field, errorMsg]) => {
          const input   = editForm.elements[field];
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

      editForm.addEventListener("input",  refreshSaveState);
      editForm.addEventListener("change", refreshSaveState);
      refreshSaveState();

      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const current = getCurrent();
        const errors  = userInputValidation(current);
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
    });

    // Pager
    const pagerHost = panels.users.querySelector("[data-users-pager]");
    if (pagerHost) {
      const pager = createPager({
        page:       state.users.page,
        totalPages: state.users.totalPages,
        onPageClick: async (nextPage) => {
          state.users.page = nextPage;
          await loadUsers();
        }
      });
      pagerHost.replaceChildren(pager);
    }
  };

  // ─── Interactions statiques (liées une seule fois) ────────────────────────────

  const bindUsersStaticInteractions = () => {
    if (!panels.users) return;

    const searchBtn    = panels.users.querySelector("[data-user-search]");
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
        state.users.sortBy  = col;
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
        state.users.sortBy  = col;
        state.users.sortDir = "DESC";
      }
      state.users.page = 1;
      await loadUsers();
    });

    refreshSearchBtn();
  };

  // ─── Mise à jour partielle (liste + pager seulement) ──────────────────────────

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

  // ─── Helpers tête de colonne ──────────────────────────────────────────────────

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

  // ─── Construction du panel (une seule fois) ───────────────────────────────────

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

  // ─── Chargement / rechargement de la liste ────────────────────────────────────

  const loadUsers = async () => {
    if (!panels.users) return;

    const alreadyBuilt = Boolean(panels.users.querySelector(".admin-tool__entries-scroll"));
    if (!alreadyBuilt) renderUsersPanel();

    const scroll = panels.users.querySelector(".admin-tool__entries-scroll");
    if (scroll) scroll.innerHTML = "";

    const params = {
      page:      state.users.page,
      per_page:  25,
      sort_by:   state.users.sortBy,
      sort_dir:  state.users.sortDir,
      ...state.users.filters
    };

    try {
      const data = await fetchAdminUsers(params, token);
      state.users.items      = Array.isArray(data?.items) ? data.items : [];
      state.users.totalPages = Number(data?.total_pages || 1);
      state.users.page       = Number(data?.page || 1);

      // Tri alphabétique côté client pour les champs texte
      const { sortBy: ub, sortDir: ud } = state.users;
      const uDir = ud === "ASC" ? 1 : -1;
      if (["id", "username", "email", "last_name", "first_name"].includes(ub)) {
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

  return { loadUsers };
}

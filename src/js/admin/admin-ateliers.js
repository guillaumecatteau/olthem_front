// admin-ateliers.js — Panel Ateliers de l'admin tool.
//
// Responsabilité : construire et gérer le panel de gestion des ateliers
// (filtres, liste paginée, formulaire d'édition inline, suppression).
//
// Expose aussi les helpers de statut atelierAtelierStatus et atelierStatusTag
// qui sont réutilisés par l'overview dans admin-tool.js.
//
// Exposé via la factory createAteliersPanel(state, panels, token, deps).
// Retourne { loadAteliers } pour permettre au parent de déclencher
// le chargement initial ou de rafraîchir la liste depuis l'extérieur.

// ─── Constante Mundaneum ──────────────────────────────────────────────────────

const mundaneumFill = {
  institution:  "Mundaneum",
  address:      "Rue de Nimy 76",
  postal_code:  "7000",
  city:         "Mons"
};

// ─── Helpers de statut (exportés : utilisés aussi dans renderOverview) ─────────

export function atelierAtelierStatus(atelier) {
  const today      = new Date().toISOString().slice(0, 10);
  const isTermine  = atelier.valid_date
    ? String(atelier.valid_date).slice(0, 10) < today
    : !!(atelier.start_date && String(atelier.start_date).slice(0, 10) < today);
  const isConfirme = !!atelier.valid_date && !isTermine;
  if (isTermine)  return { mod: "termine",  label: "Terminé"     };
  if (isConfirme) return { mod: "confirme", label: "Confirmé"    };
  return              { mod: "attente",   label: "En attente"  };
}

export function atelierStatusTag(atelier) {
  const { mod, label } = atelierAtelierStatus(atelier);
  return `<span class="compte-ateliers__status compte-ateliers__status--${mod}">${label}</span>`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAteliersPanel(state, panels, token, deps) {
  const {
    esc,
    formatDateTime,
    createPager,
    syncSelectWidthToContent,
    fetchAdminAteliers,
    updateAdminAtelier,
    deleteAdminAtelier,
    fetchThematiques,
    showConfirm
  } = deps;

  // ─── Options de tri ──────────────────────────────────────────────────────────

  const ateliersSortOptions = [
    ["id",            "ID"],
    ["thematic_id",  "Th\u00e9matique"],
    ["username",      "Utilisateur"],
    ["created_at",    "Date de cr\u00e9ation"],
    ["valid_date",    "Statut"]
  ];

  // ─── Colonnes d'en-tête ──────────────────────────────────────────────────────

  const ateliersHeadCols = [
    { label: "ID",                   col: "id" },
    { label: "Th\u00e9matique",      col: "thematic_id" },
    { label: "Utilisateur",          col: "username" },
    { label: "Date de cr\u00e9ation", col: "created_at" },
    { label: "Statut",               col: "valid_date" }
  ];

  // ─── Filtres ─────────────────────────────────────────────────────────────────

  const buildAtelierFilters = () => {
    const f = state.ateliers.filters;
    const themaOptions = state.thematiquesCache
      .map((t) => `<option value="${esc(String(t.id))}" ${f.thematic_id === String(t.id) ? "selected" : ""}>${esc(t.titre)}</option>`)
      .join("");
    return `
      <section class="admin-tool__filters-wrap">
        <div class="admin-tool__filters admin-tool__filters--ateliers">
          <div class="admin-tool__filters-row">
            <input class="admin-tool__filter admin-tool__filter--id" data-filter="id" type="text" placeholder="ID" value="${esc(f.id)}" />
            <input class="admin-tool__filter" data-filter="username" type="text" placeholder="Nom d'utilisateur" value="${esc(f.username)}" />
            <input class="admin-tool__filter admin-tool__filter--email" data-filter="email" type="text" placeholder="Adresse mail" value="${esc(f.email)}" />
            <input class="admin-tool__filter" data-filter="phone" type="text" placeholder="Téléphone" value="${esc(f.phone)}" />
          </div>
          <div class="admin-tool__filters-row">
            <div class="admin-tool__filter-select-wrap">
              <select class="admin-tool__filter admin-tool__filter--select${f.thematic_id ? " admin-tool__filter--has-value" : ""}" data-filter="thematic_id">
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
                <option value="pending"    ${f.status === "pending"    ? "selected" : ""}>En attente</option>
                <option value="validated"  ${f.status === "validated"  ? "selected" : ""}>Confirmé / Terminé</option>
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

  // ─── Corps du formulaire d'édition ───────────────────────────────────────────

  const atelierEntryBodyHtml = (atelier) => {
    const themaOptions = state.thematiquesCache
      .map((t) => `<option value="${esc(String(t.id))}" ${String(atelier.thematic_id || "") === String(t.id) ? "selected" : ""}>${esc(t.titre)}</option>`)
      .join("");

    const nbVal     = atelier.participants_count != null ? String(atelier.participants_count) : "";
    const nbDisplay = nbVal ? `+${nbVal}` : "";
    const isMundaneum      = !!Number(atelier.mundaneum);
    const adresseDisabled  = isMundaneum ? "disabled" : "";

    return `
    <form class="admin-tool__entry-edit" data-atelier-edit-form="${esc(String(atelier.id))}">
      <div class="admin-tool__edit-row admin-tool__edit-row--5">
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Thématique</span>
          <div class="admin-tool__edit-input-wrap admin-tool__edit-input-wrap--select">
            <select name="thematic_id">
              <option value="">-- Thématique --</option>
              ${themaOptions}
            </select>
            <span class="admin-tool__field-icon admin-tool__field-icon--arrow" aria-hidden="true"></span>
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Nb participants</span>
          <div class="admin-tool__edit-input-wrap admin-tool__edit-input-wrap--number">
            <input type="text" inputmode="numeric" readonly name="participants_count"
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
      <h4 class="admin-tool__edit-section-title">Lieu de l'atelier</h4>
      <div class="admin-tool__edit-row admin-tool__edit-row--4 admin-tool__edit-row--address${isMundaneum ? " is-disabled" : ""}">
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Établissement</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="institution" value="${esc(isMundaneum ? "Mundaneum" : (atelier.institution || ""))}" autocomplete="off" ${adresseDisabled} />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Adresse</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="address" value="${esc(isMundaneum ? "Rue de Nimy 76" : (atelier.address || ""))}" autocomplete="off" ${adresseDisabled} />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Code postal</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="postal_code" value="${esc(isMundaneum ? "7000" : (atelier.postal_code || ""))}" autocomplete="off" ${adresseDisabled} />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Localité</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="city" value="${esc(isMundaneum ? "Mons" : (atelier.city || ""))}" autocomplete="off" ${adresseDisabled} />
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
            <input type="text" name="last_name" value="${esc(atelier.last_name || "")}" autocomplete="off" />
          </div>
        </div>
        <div class="admin-tool__edit-field">
          <span class="admin-tool__edit-label">Prénom</span>
          <div class="admin-tool__edit-input-wrap">
            <input type="text" name="first_name" value="${esc(atelier.first_name || "")}" autocomplete="off" />
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
            <input type="text" name="phone" value="${esc(atelier.phone || "")}" autocomplete="off" />
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

  // ─── Rendu de la liste ────────────────────────────────────────────────────────

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

  // ─── Interactions par entrée (reliées à chaque rechargement) ─────────────────

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
      const body       = entry.querySelector(".admin-tool__entry-body");
      const atelierId  = Number(entry.getAttribute("data-atelier-id") || 0);

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

      const saveBtn    = editForm.querySelector("[data-save-edit]");
      const msg        = editForm.querySelector("[data-edit-msg]");
      const addressRow = editForm.querySelector(".admin-tool__edit-row--address");
      const mundaneumCb = editForm.querySelector("input[name='mundaneum']");

      const atelier    = state.ateliers.items.find((item) => item.id === atelierId);
      const isMundaneum = !!Number(atelier?.mundaneum);

      const original = {
        thematic_id:      String(atelier?.thematic_id      ?? "").trim(),
        participants_count: atelier?.participants_count != null ? `+${atelier.participants_count}` : "",
        start_date:     atelier?.start_date  ? String(atelier.start_date).slice(0, 10)  : "",
        end_date:       atelier?.end_date    ? String(atelier.end_date).slice(0, 10)    : "",
        valid_date:     atelier?.valid_date  ? String(atelier.valid_date).slice(0, 10)  : "",
        mundaneum:      isMundaneum ? "1" : "0",
        institution:  isMundaneum ? "Mundaneum"       : String(atelier?.institution  ?? "").trim(),
        address:      isMundaneum ? "Rue de Nimy 76"  : String(atelier?.address      ?? "").trim(),
        postal_code:  isMundaneum ? "7000"            : String(atelier?.postal_code  ?? "").trim(),
        city:         isMundaneum ? "Mons"            : String(atelier?.city         ?? "").trim(),
        last_name:  String(atelier?.last_name  ?? "").trim(),
        first_name: String(atelier?.first_name ?? "").trim(),
        email:      String(atelier?.email      ?? "").trim(),
        phone:      String(atelier?.phone      ?? "").trim()
      };

      const getFields = () => ({
        thematic_id:      String(editForm.elements.thematic_id?.value      ?? "").trim(),
        participants_count: String(editForm.elements.participants_count?.value ?? "").trim(),
        start_date:  String(editForm.elements.start_date?.value  ?? "").trim(),
        end_date:    String(editForm.elements.end_date?.value    ?? "").trim(),
        valid_date:  String(editForm.elements.valid_date?.value  ?? "").trim(),
        mundaneum:   editForm.elements.mundaneum?.checked ? "1" : "0",
        institution: String(editForm.elements.institution?.value ?? "").trim(),
        address:     String(editForm.elements.address?.value     ?? "").trim(),
        postal_code: String(editForm.elements.postal_code?.value ?? "").trim(),
        city:        String(editForm.elements.city?.value        ?? "").trim(),
        last_name:  String(editForm.elements.last_name?.value  ?? "").trim(),
        first_name: String(editForm.elements.first_name?.value ?? "").trim(),
        email:      String(editForm.elements.email?.value      ?? "").trim(),
        phone:      String(editForm.elements.phone?.value      ?? "").trim()
      });

      // Toggle case Mundaneum : désactiver/remplir les champs d'adresse
      const applyMundaneum = (checked) => {
        if (!addressRow) return;
        addressRow.classList.toggle("is-disabled", checked);
        ["institution", "address", "postal_code", "city"].forEach((name) => {
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

      // Inputs date : toggle classe has-value + visibilité du placeholder
      editForm.querySelectorAll("input[type='date']").forEach((dateInput) => {
        dateInput.addEventListener("change", () => {
          dateInput.classList.toggle("has-value", !!dateInput.value);
        });
      });

      // Stepper numérique (flèches haut/bas)
      editForm.addEventListener("click", (event) => {
        const arrow = event.target instanceof Element
          ? event.target.closest(".admin-tool__number-arrow")
          : null;
        if (!(arrow instanceof HTMLButtonElement)) return;
        const wrap  = arrow.closest(".admin-tool__edit-input-wrap--number");
        const input = wrap?.querySelector("input[data-number-step]");
        if (!(input instanceof HTMLInputElement)) return;
        const step   = Number(input.dataset.numberStep)   || 10;
        const min    = Number(input.dataset.numberMin)    || step;
        const max    = input.dataset.numberMax ? Number(input.dataset.numberMax) : Infinity;
        const prefix = input.dataset.numberPrefix || "";
        const raw    = String(input.value || "").replace(/[^0-9]/g, "");
        const current = raw ? Number(raw) : 0;
        const isUp    = arrow.classList.contains("admin-tool__number-arrow--up");
        if (isUp) {
          input.value = prefix + Math.min(current === 0 ? min : current + step, max);
        } else {
          const next = current - step;
          input.value = next < min ? "" : prefix + next;
        }
        input.dispatchEvent(new Event("input",  { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const refreshSaveState = () => {
        const current    = getFields();
        const changed    = Object.keys(current).some((key) => current[key] !== original[key]);
        const emailError = current.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.email) ? "Email invalide." : "";

        const emailField   = editForm.querySelector(".admin-tool__edit-field:has([name='email'])");
        const emailErrorEl = editForm.querySelector("[data-field-error='email']");
        if (emailField)   emailField.classList.toggle("is-invalid", Boolean(emailError));
        if (emailErrorEl) emailErrorEl.textContent = emailError;

        if (msg) msg.textContent = "";
        if (saveBtn instanceof HTMLButtonElement) {
          saveBtn.disabled = !changed || Boolean(emailError);
        }
      };

      editForm.addEventListener("input",  refreshSaveState);
      editForm.addEventListener("change", refreshSaveState);
      refreshSaveState();

      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const current    = getFields();
        const emailError = current.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.email) ? "Email invalide." : "";
        if (emailError) {
          if (msg) msg.textContent = emailError;
          return;
        }
        // Envoyer la valeur numérique brute (sans le préfixe "+")
        const rawNb = String(current.participants_count || "").replace(/[^0-9]/g, "");
        try {
          await updateAdminAtelier(atelierId, { ...current, participants_count: rawNb }, token);
          await loadAteliers();
        } catch (error) {
          if (msg) msg.textContent = error?.payload?.message || error?.message || "Mise à jour impossible.";
        }
      });
    });

    // Pager
    const pagerHost = panels.ateliers.querySelector("[data-ateliers-pager]");
    if (pagerHost) {
      const pager = createPager({
        page:       state.ateliers.page,
        totalPages: state.ateliers.totalPages,
        onPageClick: async (nextPage) => {
          state.ateliers.page = nextPage;
          await loadAteliers();
        }
      });
      pagerHost.replaceChildren(pager);
    }
  };

  // ─── Interactions statiques (liées une seule fois) ────────────────────────────

  const bindAteliersStaticInteractions = () => {
    if (!panels.ateliers) return;

    const searchBtn    = panels.ateliers.querySelector("[data-atelier-search]");
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
        state.ateliers.sortBy  = col;
        state.ateliers.sortDir = "DESC";
      }
      state.ateliers.page = 1;
      await loadAteliers();
    });

    const ateliersHead = panels.ateliers.querySelector(".admin-tool__entries-head");
    ateliersHead?.addEventListener("click", async (e) => {
      const span = e.target.closest("[data-sort-col]");
      if (!span) return;
      const col  = span.getAttribute("data-sort-col");
      if (!col) return;
      if (state.ateliers.sortBy === col) {
        state.ateliers.sortDir = state.ateliers.sortDir === "DESC" ? "ASC" : "DESC";
      } else {
        state.ateliers.sortBy  = col;
        state.ateliers.sortDir = "DESC";
      }
      state.ateliers.page = 1;
      await loadAteliers();
    });

    refreshSearchBtn();
  };

  // ─── Mise à jour partielle (liste + pager seulement) ──────────────────────────

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

  // ─── Helpers tête de colonne ──────────────────────────────────────────────────

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
    const sel  = panels.ateliers?.querySelector("[data-ateliers-sort]");
    if (sel) {
      sel.value = state.ateliers.sortBy;
      syncSelectWidthToContent(sel);
    }
  };

  // ─── Construction du panel (une seule fois) ───────────────────────────────────

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

  // ─── Chargement / rechargement de la liste ────────────────────────────────────

  const loadAteliers = async () => {
    if (!panels.ateliers) return;

    // Charger les thématiques la première fois (cache partagé via state)
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
      page:      state.ateliers.page,
      per_page:  10,
      sort_by:   state.ateliers.sortBy,
      sort_dir:  state.ateliers.sortDir,
      ...state.ateliers.filters
    };

    try {
      const data = await fetchAdminAteliers(params, token);

      state.ateliers.items      = Array.isArray(data?.items) ? data.items : [];
      state.ateliers.totalPages = Number(data?.total_pages || 1);
      state.ateliers.page       = Number(data?.page || 1);

      // Tri client pour les champs non-numériques
      const { sortBy: ab, sortDir: ad } = state.ateliers;
      const aDir = ad === "ASC" ? 1 : -1;
      if (ab === "thematic_id") {
        const nameMap = Object.fromEntries(
          state.thematiquesCache.map((t) => [String(t.id), String(t.titre || "")])
        );
        state.ateliers.items.sort((a, b) =>
          (nameMap[String(a.thematic_id)] || "").localeCompare(
            nameMap[String(b.thematic_id)] || "", "fr", { sensitivity: "base" }
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

  return { loadAteliers };
}

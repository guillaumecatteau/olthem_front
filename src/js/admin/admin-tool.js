// admin-tool.js — Point d'entrée de l'outil d'administration.
//
// Responsabilité : orchestrer l'outil admin (structure DOM, onglets, overview).
// Délègue la gestion des panels aux modules spécialisés :
//   admin-users.js    → panel Utilisateurs
//   admin-ateliers.js → panel Ateliers
//
// Exports publics :
//   isAdminToolRequest(page, request) → boolean
//   bindAdminToolOverlay(content, page, options)

import {
  fetchAdminOverview,
  fetchThematiques,
  fetchAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  fetchAdminAteliers,
  updateAdminAtelier,
  deleteAdminAtelier
} from "../api/api.js";
import { getStoredToken, getStoredUser } from "../api/auth.js";
import { showConfirm } from "../components/popup.js";
import { esc, slugify, formatDateTime, formatDate } from "../core/utils.js";
import { createUsersPanel } from "./admin-users.js";
import { createAteliersPanel, atelierStatusTag } from "./admin-ateliers.js";

// ─── Helpers partagés ─────────────────────────────────────────────────────────

function createPager({ page, totalPages, onPageClick }) {
  const safeTotal = Math.max(1, Number(totalPages || 1));
  const safePage  = Math.min(Math.max(1, Number(page || 1)), safeTotal);
  const pages     = [];

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

function syncSelectWidthToContent(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  const longest = [...select.options].reduce(
    (max, option) => Math.max(max, String(option.textContent || "").trim().length),
    0
  );
  select.style.width = `calc(${Math.max(longest + 2, 12)}ch + 34px)`;
}

// ─── Détection de la page admin tool ─────────────────────────────────────────

export function isAdminToolRequest(page = null, request = {}) {
  const candidates = [
    page?.slug,
    request?.slug,
    request?.search,
    request?.exactTitle
  ].map((entry) => slugify(entry || ""));

  return candidates.some((entry) => entry === "admintool" || entry === "admin-tool");
}

// ─── Initialisation de l'overlay admin ───────────────────────────────────────

export async function bindAdminToolOverlay(content, page, options = {}) {
  if (!content || !isAdminToolRequest(page, options.request || {})) return;

  const token = getStoredToken();
  const user  = getStoredUser();

  if (!token || !user?.isAdmin) {
    content.innerHTML = `
      <div class="admin-tool admin-tool--forbidden">
        <p class="admin-tool__error">Acces reserve aux administrateurs.</p>
      </div>`;
    return;
  }

  // ─── Structure DOM ──────────────────────────────────────────────────────────

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

  // ─── État partagé ────────────────────────────────────────────────────────────

  const state = {
    users: {
      page: 1, totalPages: 1,
      sortBy: "created_at", sortDir: "DESC",
      filters: { id: "", username: "", last_name: "", first_name: "", email: "", created_at: "", newsletter: "", is_admin: "" },
      items: []
    },
    ateliers: {
      page: 1, totalPages: 1,
      sortBy: "created_at", sortDir: "DESC",
      filters: { id: "", username: "", email: "", phone: "", thematic_id: "", mundaneum: "", status: "" },
      items: []
    },
    thematiquesCache: [],
    overviewLoaded:   false,
    usersLoaded:      false,
    ateliersLoaded:   false
  };

  const panels = {
    overview: root.querySelector('[data-admin-panel="overview"]'),
    users:    root.querySelector('[data-admin-panel="users"]'),
    ateliers: root.querySelector('[data-admin-panel="ateliers"]')
  };

  // ─── Panel Utilisateurs ──────────────────────────────────────────────────────

  const { loadUsers } = createUsersPanel(state, panels, token, {
    esc, formatDate, createPager, syncSelectWidthToContent,
    fetchAdminUsers, updateAdminUser, deleteAdminUser, showConfirm
  });

  // ─── Panel Ateliers ──────────────────────────────────────────────────────────

  const { loadAteliers } = createAteliersPanel(state, panels, token, {
    esc, formatDateTime, createPager, syncSelectWidthToContent,
    fetchAdminAteliers, updateAdminAtelier, deleteAdminAtelier, fetchThematiques, showConfirm
  });

  // ─── Overview ────────────────────────────────────────────────────────────────

  const renderOverview = async (preloaded = null) => {
    if (!panels.overview) return;
    if (!preloaded) {
      panels.overview.innerHTML = '<p class="admin-tool__loading">Chargement...</p>';
    }

    try {
      const data = preloaded || await fetchAdminOverview(token);
      const counts         = data?.counts || {};
      const latestUsers    = Array.isArray(data?.latest_users)    ? data.latest_users    : [];
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

  // ─── Navigation par onglets ──────────────────────────────────────────────────

  root.querySelectorAll(".admin-tool__tab").forEach((tabButton) => {
    tabButton.addEventListener("click", async () => {
      const tab = tabButton.getAttribute("data-admin-tab");
      if (!tab) return;

      root.querySelectorAll(".admin-tool__tab").forEach((node) =>
        node.classList.toggle("is-active", node === tabButton)
      );
      root.querySelectorAll(".admin-tool__panel").forEach((panel) =>
        panel.classList.toggle("is-active", panel.getAttribute("data-admin-panel") === tab)
      );

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

  // ─── Chargement initial (overview) ───────────────────────────────────────────

  state.overviewLoaded = true;
  try {
    const initialOverview = await fetchAdminOverview(token);
    await renderOverview(initialOverview);
  } catch {
    await renderOverview();
  }
}

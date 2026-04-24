// ── Utilitaires partagés ──────────────────────────────────────────────────────
// Fonctions communes importées par api.js, main.js, thematiques.js, admin-tool.js

/**
 * Échappe les caractères HTML dangereux pour l'injection dans du HTML.
 */
export function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extrait le texte brut d'une chaîne HTML.
 * Alias plainText disponible pour compatibilité avec l'existant.
 */
export function stripHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  return template.content.textContent?.trim() || "";
}

// Alias — évite de renommer tous les appels dans main.js
export { stripHtml as plainText };

/**
 * Normalise une clé : minuscules, caractères alphanumériques uniquement.
 * Ex. : "acf_fc_layout" → "acffclayout", "Form Group" → "formgroup"
 */
export function normKey(raw) {
  return String(raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Transforme une chaîne en slug URL-safe (tirets, sans accents).
 * Commence par stripHtml pour gérer les valeurs qui peuvent contenir du balisage.
 */
export function slugify(value) {
  return stripHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Formate une date + heure pour affichage (fr-BE).
 * @param {string|null} value
 */
export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Formate une date seule pour affichage (fr-BE).
 * @param {string|null} value
 */
export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fr-BE");
}

let overlayEl = null;

function getOrCreateOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.className = "popup-overlay is-hidden";
  overlayEl.setAttribute("aria-hidden", "true");
  overlayEl.innerHTML = `
    <div class="popup" role="dialog" aria-modal="true">
      <p class="popup__message"></p>
      <div class="popup__actions">
        <button type="button" class="buttonRoundAct popup__btn--cancel">Annuler</button>
        <button type="button" class="buttonRoundAct popup__btn--confirm">Confirmer</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  return overlayEl;
}

/**
 * Affiche une pop-up de confirmation personnalisée.
 * @param {string} message
 * @returns {Promise<boolean>} true si confirmé, false si annulé
 */
export function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = getOrCreateOverlay();
    overlay.querySelector(".popup__message").textContent = message;
    overlay.classList.remove("is-hidden");
    overlay.setAttribute("aria-hidden", "false");

    const confirmBtn = overlay.querySelector(".popup__btn--confirm");
    const cancelBtn  = overlay.querySelector(".popup__btn--cancel");

    const cleanup = (result) => {
      overlay.classList.add("is-hidden");
      overlay.setAttribute("aria-hidden", "true");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      resolve(result);
    };

    const onConfirm = () => cleanup(true);
    const onCancel  = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
  });
}

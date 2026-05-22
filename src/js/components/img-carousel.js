// ─── Carrousel d'images (ImgGallerieCarousel) ─────────────────────────────────
// Classe de carrousel infini pour les galeries d'images. Partagée entre
// thematiques.js (rendu des sections) et section-builder.js (fallback mobile).
// window._initImgGallerieCarousel est exposé pour l'initialisation différée.
// ──────────────────────────────────────────────────────────────────────────────

// ─── Classe carrousel ─────────────────────────────────────────────────────────

export class ImgGallerieCarousel {
  constructor(track, dotsContainer, controller, totalImages) {
    this.track = track;
    this.dotsContainer = dotsContainer;
    this.controller = controller;
    this.totalOriginal = totalImages;
    this.current = 1; // index interne (après le clone de début)
    this._animMs = 500;

    this.dots = Array.from(dotsContainer.querySelectorAll('.img-gallerie-dots__dot'));
    this._setupInfiniteTrack();
    this._bindButtons();
    this._bindDots();
    this._bindTransitionEnd();
    this._jumpTo(this.current);
    this._syncDots();
  }

  _setupInfiniteTrack() {
    const slides = Array.from(this.track.querySelectorAll('.img-gallerie-carousel__slide'));
    if (slides.length <= 1) return;

    const firstClone = slides[0].cloneNode(true);
    const lastClone = slides[slides.length - 1].cloneNode(true);

    firstClone.dataset.clone = 'first';
    lastClone.dataset.clone = 'last';

    this.track.insertBefore(lastClone, slides[0]);
    this.track.appendChild(firstClone);
  }

  _bindDots() {
    this.dots.forEach((dot, i) => {
      dot.addEventListener('click', () => this.goTo(i + 1));
    });
  }

  _bindButtons() {
    const prevBtn = this.controller.querySelector('.img-gallerie-carousel__btn--prev');
    const nextBtn = this.controller.querySelector('.img-gallerie-carousel__btn--next');
    if (prevBtn) prevBtn.addEventListener('click', () => this.prev());
    if (nextBtn) nextBtn.addEventListener('click', () => this.next());
  }

  _bindTransitionEnd() {
    this.track.addEventListener('transitionend', () => {
      if (this.totalOriginal <= 1) return;

      // 0 = clone de la dernière image, total+1 = clone de la première
      if (this.current === 0) {
        this.current = this.totalOriginal;
        this._jumpTo(this.current);
      } else if (this.current === this.totalOriginal + 1) {
        this.current = 1;
        this._jumpTo(this.current);
      }

      this._syncDots();
    });
  }

  _jumpTo(index) {
    this.track.style.transition = 'none';
    this.track.style.transform = `translateX(-${index * 100}%)`;
    void this.track.offsetHeight;
    this.track.style.transition = `transform ${this._animMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  }

  _syncDots() {
    const dotIndex = ((this.current - 1) % this.totalOriginal + this.totalOriginal) % this.totalOriginal;
    this.dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === dotIndex);
    });
  }

  goTo(index) {
    if (this.totalOriginal <= 1) return;
    this.current = index;
    this.track.style.transform = `translateX(-${this.current * 100}%)`;
    this._syncDots();
  }

  next() {
    if (this.totalOriginal <= 1) return;
    this.goTo(this.current + 1);
  }

  prev() {
    if (this.totalOriginal <= 1) return;
    this.goTo(this.current - 1);
  }
}

// ─── Hook global (utilisé par section-builder.js pour le fallback mobile) ────

// window._initImgGallerieCarousel est appelé via setTimeout dans renderSectionLayout
// quand une galerie est rendue en mode mobile dans section-builder.js.
window._initImgGallerieCarousel = function(trackId, dotsId, controllerId, total) {
  const track      = document.getElementById(trackId);
  const dots       = document.getElementById(dotsId);
  const controller = document.getElementById(controllerId);
  if (track && dots && controller) {
    new ImgGallerieCarousel(track, dots, controller, total);
  }
};

/**
 * scroll-lock.js — Centralized main-page scroll locker.
 *
 * Adds/removes `is-main-overlay-open` on <body> (checked by scroll.js to block
 * the magnetic section scroll) and hides the native scrollbar via `overflow:hidden`.
 *
 * Counter-based so that nested callers never unlock prematurely.
 * Usage:
 *   lockMainScroll();   // open overlay
 *   unlockMainScroll(); // close overlay
 *
 * The Thématiques overlay intentionally does NOT use this — it keeps the
 * magnetic scroll active so users can navigate sections while browsing themes.
 */

let _lockCount = 0;

export function lockMainScroll() {
  if (_lockCount === 0) {
    document.body.classList.add('is-main-overlay-open');
    document.body.style.overflow = 'hidden';
  }
  _lockCount++;
}

export function unlockMainScroll() {
  _lockCount = Math.max(0, _lockCount - 1);
  if (_lockCount === 0) {
    document.body.classList.remove('is-main-overlay-open');
    document.body.style.overflow = '';
  }
}

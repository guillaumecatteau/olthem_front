const LARGE_CONTAINER_WIDTH = 1200;
const HORIZONTAL_PADDING = 22;
const WHEEL_FACTOR = 0.92;
const CONTENT_FADE_SIZE = 100;
const SUBSECTION_EDGE_BREAK_GAP_MS = 200;
const SUBSECTION_EDGE_RELEASE_WINDOW_MS = 500;

const SCROLLER_SELECTORS = [
  '.js-section-subsections-scroll',
  '#thm-overlay-inner',
  '#page-overlay .page-overlay__inner',
  '.admin-tool__latest-scroll',
  '.admin-tool__entries-scroll',
];

const stateByScroller = new Map();
const subsectionEdgeGuard = {
  edgeLocked: false,
  scroller: null,
  direction: 0,
  passThroughUntilTs: 0,
  lastWheelTs: 0,
};

function clearSubsectionEdgeGuard() {
  subsectionEdgeGuard.edgeLocked = false;
  subsectionEdgeGuard.scroller = null;
  subsectionEdgeGuard.direction = 0;
  subsectionEdgeGuard.passThroughUntilTs = 0;
  subsectionEdgeGuard.lastWheelTs = 0;
}

function isSubsectionScroller(scroller) {
  return !!scroller?.classList?.contains('js-section-subsections-scroll');
}

function hasOverflow(el) {
  return !!el && el.scrollHeight - el.clientHeight > 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getScrollableByDirection(scroller, deltaY) {
  if (!scroller) return false;
  if (!hasOverflow(scroller)) return false;

  if (deltaY > 0) {
    return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
  }

  if (deltaY < 0) {
    return scroller.scrollTop > 1;
  }

  return true;
}

function bindThumbDrag(thumb, scroller, getRailHeight) {
  let dragging = false;
  let startClientY = 0;
  let startScrollTop = 0;
  let startRailH = 0;
  let startThumbH = 0;

  function startDraggingState() {
    thumb.classList.add('is-dragging');
    document.body.classList.add('is-secondary-scroll-dragging');
  }

  function stopDraggingState() {
    thumb.classList.remove('is-dragging');
    document.body.classList.remove('is-secondary-scroll-dragging');
  }

  thumb.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    startDraggingState();
    startClientY = e.clientY;
    startScrollTop = scroller.scrollTop;
    startRailH = getRailHeight();
    startThumbH = thumb.offsetHeight;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    if (!dragging) return;
    const delta = e.clientY - startClientY;
    const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
    const maxThumbTop = Math.max(1, startRailH - startThumbH);
    const scrollDelta = (delta / maxThumbTop) * maxScrollTop;
    scroller.scrollTop = Math.max(0, Math.min(maxScrollTop, startScrollTop + scrollDelta));
  }

  function onUp() {
    dragging = false;
    stopDraggingState();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  window.addEventListener('blur', () => {
    if (!dragging) return;
    dragging = false;
    stopDraggingState();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  });
}

function setupIframeInteraction(scroller) {
  scroller.querySelectorAll('.layout-iframe__wrapper').forEach((wrapper) => {
    if (wrapper.dataset.iframeInteractionBound) return;

    const iframe = wrapper.querySelector('iframe');
    if (!iframe) return;

    wrapper.dataset.iframeInteractionBound = '1';

    const routeWheelToScroller = (e) => {
      if (!hasOverflow(scroller)) return;
      if (!getScrollableByDirection(scroller, e.deltaY)) return;
      e.preventDefault();
      e.stopPropagation();
      scroller.scrollTop += e.deltaY * WHEEL_FACTOR;
    };

    // Keep iframe fully native-interactive; only wheel is rerouted when possible.
    wrapper.addEventListener('wheel', routeWheelToScroller, { passive: false });
    iframe.addEventListener('wheel', routeWheelToScroller, { passive: false });
  });
}

function ensureDecor(scroller) {
  if (stateByScroller.has(scroller)) {
    return stateByScroller.get(scroller);
  }

  const scope = scroller.closest('.admin-tool__scroll-wrap, .admin-tool__panel-main, .full-section, .thm-overlay, .page-overlay') || scroller.parentElement;
  if (!scope) return null;

  scope.classList.add('has-secondary-scroll-layer');

  const rail = document.createElement('div');
  rail.className = 'secondary-scrollbar';
  rail.setAttribute('aria-hidden', 'true');
  rail.innerHTML = '<span class="secondary-scrollbar__line"></span><span class="secondary-scrollbar__thumb"></span>';

  scope.append(rail);

  const thumb = rail.querySelector('.secondary-scrollbar__thumb');
  const entry = { scope, rail, thumb };
  stateByScroller.set(scroller, entry);
  bindThumbDrag(thumb, scroller, () => rail.getBoundingClientRect().height);
  return entry;
}

function updateDecorForScroller(scroller) {
  const entry = ensureDecor(scroller);
  if (!entry || !entry.thumb) return;

  const { scope, rail, thumb } = entry;

  const style = getComputedStyle(scroller);
  const padTop = parseFloat(style.paddingTop) || 0;
  const padBottom = parseFloat(style.paddingBottom) || 0;

  scroller.style.setProperty('--secondary-pad-top', `${padTop}px`);
  scroller.style.setProperty('--secondary-pad-bottom', `${padBottom}px`);

  scope.style.setProperty('--secondary-scroll-top', `${padTop}px`);
  scope.style.setProperty('--secondary-scroll-bottom', `${padBottom}px`);

  const overflow = hasOverflow(scroller);
  scope.classList.toggle('has-scrollable-content', overflow);

  if (!overflow) {
    scope.classList.remove('can-scroll-up', 'can-scroll-down');
    scroller.style.setProperty('--secondary-fade-top', '0px');
    scroller.style.setProperty('--secondary-fade-bottom', '0px');
    thumb.style.height = '0px';
    thumb.style.top = '0px';
    return;
  }

  const maxScroll = scroller.scrollHeight - scroller.clientHeight;
  const ratio = scroller.clientHeight / scroller.scrollHeight;
  const railRect = rail.getBoundingClientRect();
  const trackHeight = Math.max(0, railRect.height);
  const thumbHeight = clamp(trackHeight * ratio, 28, trackHeight);
  const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
  const progress = maxScroll <= 0 ? 0 : scroller.scrollTop / maxScroll;
  const thumbTop = progress * maxThumbTop;

  thumb.style.height = `${thumbHeight}px`;
  thumb.style.top = `${thumbTop}px`;

  const canScrollUp = scroller.scrollTop > 1;
  const canScrollDown = scroller.scrollTop < maxScroll - 1;

  scope.classList.toggle('can-scroll-up', canScrollUp);
  scope.classList.toggle('can-scroll-down', canScrollDown);

  scroller.style.setProperty('--secondary-fade-top', canScrollUp ? `${CONTENT_FADE_SIZE}px` : '0px');
  scroller.style.setProperty('--secondary-fade-bottom', canScrollDown ? `${CONTENT_FADE_SIZE}px` : '0px');
}

function getAllScrollers() {
  const nodes = SCROLLER_SELECTORS
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)));

  return nodes.filter((node) => node instanceof HTMLElement);
}

function pointerInsideLargeContainer(clientX) {
  const width = Math.max(0, Math.min(LARGE_CONTAINER_WIDTH, window.innerWidth - HORIZONTAL_PADDING * 2));
  const left = (window.innerWidth - width) * 0.5;
  const right = left + width;
  return clientX >= left && clientX <= right;
}

function pointerInsideScrollerRect(scroller, clientX, clientY) {
  if (!scroller) return false;
  const rect = scroller.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function getPreferredScroller() {
  const pageOverlay = document.getElementById('page-overlay');
  if (pageOverlay?.classList.contains('is-visible')) {
    return pageOverlay.querySelector('.page-overlay__inner');
  }

  const thmOverlay = document.getElementById('thm-overlay');
  if (thmOverlay?.classList.contains('is-visible')) {
    const inner = document.getElementById('thm-overlay-inner');
    if (inner) return inner;
  }

  const candidates = Array.from(document.querySelectorAll('.js-section-subsections-scroll'));
  if (!candidates.length) return null;

  const viewportCenter = window.innerHeight * 0.5;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate) => {
    if (!(candidate instanceof HTMLElement)) return;
    const section = candidate.closest('.full-section');
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const center = rect.top + rect.height * 0.5;
    const dist = Math.abs(center - viewportCenter);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = candidate;
    }
  });

  return best;
}

function shouldRouteWheelToSecondaryScroll(event) {
  const preferred = getPreferredScroller();
  if (!preferred) return false;
  if (!pointerInsideLargeContainer(event.clientX)) return false;
  if (!pointerInsideScrollerRect(preferred, event.clientX, event.clientY)) return false;
  if (!hasOverflow(preferred)) return false;
  if (!getScrollableByDirection(preferred, event.deltaY)) return false;
  return true;
}

window.__shouldRouteWheelToSecondaryScroll = shouldRouteWheelToSecondaryScroll;

function isWheelInsideSubsectionContentZone(event) {
  const preferred = getPreferredScroller();
  if (!preferred) return false;
  if (!isSubsectionScroller(preferred)) return false;
  if (!pointerInsideLargeContainer(event.clientX)) return false;
  if (!pointerInsideScrollerRect(preferred, event.clientX, event.clientY)) return false;
  return true;
}

window.__isWheelInsideSubsectionContentZone = isWheelInsideSubsectionContentZone;

function routeWheelToSecondaryScroll(event) {
  const preferred = getPreferredScroller();
  if (!preferred) {
    clearSubsectionEdgeGuard();
    return false;
  }

  const inLargeZone = pointerInsideLargeContainer(event.clientX);
  const inScrollerZone = pointerInsideScrollerRect(preferred, event.clientX, event.clientY);
  if (!inLargeZone || !inScrollerZone) {
    clearSubsectionEdgeGuard();
    return false;
  }

  if (!hasOverflow(preferred)) {
    clearSubsectionEdgeGuard();
    return false;
  }

  const direction = Math.sign(event.deltaY) || 0;
  const canScrollInDirection = getScrollableByDirection(preferred, event.deltaY);
  const isSubsection = isSubsectionScroller(preferred);
  const now = typeof event.timeStamp === 'number' ? event.timeStamp : performance.now();

  if (isSubsection && !canScrollInDirection) {
    const sameEdgeContext = subsectionEdgeGuard.scroller === preferred
      && subsectionEdgeGuard.direction === direction;

    const interrupted = subsectionEdgeGuard.lastWheelTs > 0
      && (now - subsectionEdgeGuard.lastWheelTs) >= SUBSECTION_EDGE_BREAK_GAP_MS;

    // After a real interruption, open a temporary pass-through window for
    // magnetic section scrolling while cursor remains in subsection zone.
    if (interrupted && sameEdgeContext) {
      subsectionEdgeGuard.edgeLocked = false;
      subsectionEdgeGuard.passThroughUntilTs = now + SUBSECTION_EDGE_RELEASE_WINDOW_MS;
    }

    if (sameEdgeContext && now <= subsectionEdgeGuard.passThroughUntilTs) {
      subsectionEdgeGuard.lastWheelTs = now;
      return false;
    }

    // Continuous edge stream: absorb and keep refreshing pause timer.
    subsectionEdgeGuard.edgeLocked = true;
    subsectionEdgeGuard.scroller = preferred;
    subsectionEdgeGuard.direction = direction;
    subsectionEdgeGuard.passThroughUntilTs = 0;
    subsectionEdgeGuard.lastWheelTs = now;

    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  if (!canScrollInDirection) {
    subsectionEdgeGuard.lastWheelTs = now;
    return false;
  }

  // Normal internal scroll in subsection cancels edge lock state.
  if (isSubsection) {
    subsectionEdgeGuard.edgeLocked = false;
    subsectionEdgeGuard.scroller = null;
    subsectionEdgeGuard.direction = 0;
    subsectionEdgeGuard.passThroughUntilTs = 0;
    subsectionEdgeGuard.lastWheelTs = now;
  }

  preferred.scrollTop += event.deltaY * WHEEL_FACTOR;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

window.__routeWheelToSecondaryScroll = routeWheelToSecondaryScroll;

function refreshSecondaryScroll() {
  getAllScrollers().forEach((scroller) => {
    scroller.classList.add('js-secondary-scroll');
    updateDecorForScroller(scroller);
    setupIframeInteraction(scroller);
  });
}

function bindScroller(scroller) {
  if (!(scroller instanceof HTMLElement)) return;
  if (scroller.dataset.secondaryScrollBound === '1') return;

  scroller.dataset.secondaryScrollBound = '1';
  scroller.addEventListener('scroll', () => updateDecorForScroller(scroller), { passive: true });
}

function bindAllScrollers() {
  getAllScrollers().forEach((scroller) => {
    bindScroller(scroller);
    updateDecorForScroller(scroller);
  });
}

function onWheel(event) {
  routeWheelToSecondaryScroll(event);
}

function setupObservers() {
  const resizeObserver = new ResizeObserver(() => {
    refreshSecondaryScroll();
  });

  getAllScrollers().forEach((scroller) => resizeObserver.observe(scroller));

  const mutationObserver = new MutationObserver(() => {
    bindAllScrollers();
    refreshSecondaryScroll();
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

window.addEventListener('wheel', onWheel, { passive: false });
window.addEventListener('resize', refreshSecondaryScroll, { passive: true });
window.addEventListener('secondary-scroll:refresh', refreshSecondaryScroll);
window.addEventListener('load', () => {
  bindAllScrollers();
  refreshSecondaryScroll();
  setupObservers();
});

setTimeout(() => {
  bindAllScrollers();
  refreshSecondaryScroll();
}, 0);

/* StandBy Mode Pro - Accessibility Runtime
 *
 * AUDIT.md §5 verified 14 concrete accessibility gaps. This module owns the
 * runtime half of the fix (modal focus management, inertness, live regions,
 * reduced-motion mirroring). The CSS half lives in css/a11y.css.
 *
 * The single highest-impact defect being fixed here (AUDIT.md §5.2):
 * `.modal-overlay` used only `opacity: 0; pointer-events: none`, which leaves
 * every descendant of all three CLOSED modals reachable by Tab. Roughly forty
 * invisible controls were in the tab order on page load. `setModalOpen()` below
 * uses the `inert` attribute (with a focusout fallback) so closed dialogs are
 * genuinely not tabbable.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(node => {
    if (node.hasAttribute("disabled")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    // offsetParent is null for display:none subtrees, which is exactly the
    // check we need for anything inside a hidden panel.
    return node.offsetParent !== null || node === document.activeElement;
  });
}

export function trapFocus(container, event) {
  const focusable = getFocusable(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Marks a modal subtree as non-interactive when closed.
 *
 * `inert` is the correct tool and is supported in all current browsers, but it
 * is applied defensively: if the browser lacks it, we additionally force focus
 * out of the subtree so no keyboard user can get stranded inside.
 */
export function setInert(element, inert) {
  if (!element) return;
  if (inert) {
    element.setAttribute("inert", "");
    element.setAttribute("aria-hidden", "true");
  } else {
    element.removeAttribute("inert");
    element.removeAttribute("aria-hidden");
  }
}

/**
 * Wires a modal root for correct dialog behaviour:
 *  - role="dialog", aria-modal, labelled by its heading
 *  - focus moved in on open, restored on close
 *  - Tab cycles inside while open
 *  - Escape closes
 *
 * @param {HTMLElement} root  The `.modal-overlay` element.
 * @param {{ onClose: Function, initialFocus?: string }} spec
 * @returns {() => void} teardown
 */
export function enhanceModal(root, spec) {
  if (!root) return () => {};

  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");

  const heading = root.querySelector("h2, h3, [data-modal-title]");
  if (heading) {
    if (!heading.id) heading.id = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
    root.setAttribute("aria-labelledby", heading.id);
  }

  let previouslyFocused = null;
  let isOpen = false;

  const onKeyDown = (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      spec.onClose();
      return;
    }
    if (event.key === "Tab") {
      trapFocus(root, event);
    }
  };

  document.addEventListener("keydown", onKeyDown, true);

  return {
    open() {
      previouslyFocused = document.activeElement;
      isOpen = true;
      setInert(root, false);
      root.classList.add("open");

      // Defer so the element is laid out before we look for focusables.
      requestAnimationFrame(() => {
        const target = spec.initialFocus
          ? root.querySelector(spec.initialFocus)
          : getFocusable(root)[0];
        if (target && typeof target.focus === "function") target.focus();
      });
    },
    close() {
      isOpen = false;
      root.classList.remove("open");
      setInert(root, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
      previouslyFocused = null;
    },
    get isOpen() {
      return isOpen;
    },
    destroy() {
      document.removeEventListener("keydown", onKeyDown, true);
      setInert(root, true);
    }
  };
}

/**
 * A polite live region, created once and reused. Used by the toast system and by
 * any feature whose state change would otherwise be silent (AUDIT.md §5.9).
 */
let liveRegion = null;

export function announce(message, assertive = false) {
  if (!liveRegion) {
    liveRegion = document.createElement("div");
    liveRegion.className = "sr-only";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    document.body.append(liveRegion);
  }
  liveRegion.setAttribute("aria-live", assertive ? "assertive" : "polite");
  // Clearing first guarantees repeat messages are re-announced.
  liveRegion.textContent = "";
  requestAnimationFrame(() => {
    if (liveRegion) liveRegion.textContent = String(message ?? "");
  });
}

/**
 * Mirrors the OS reduced-motion preference onto a body class so CSS can respond,
 * and exposes a runtime override for the Accessibility settings.
 *
 * @param {{ savedPreference?: boolean|null }} [spec] null = follow the OS.
 */
export function initMotionPreference(spec = {}) {
  const query = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  const apply = () => {
    const reduced = spec.savedPreference === null || spec.savedPreference === undefined
      ? Boolean(query && query.matches)
      : Boolean(spec.savedPreference);
    document.body.classList.toggle("reduced-motion", reduced);
    return reduced;
  };

  apply();

  if (query) {
    const listener = () => {
      if (spec.savedPreference === null || spec.savedPreference === undefined) apply();
    };
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", listener);
    } else if (typeof query.addListener === "function") {
      query.addListener(listener);
    }
  }

  return apply;
}

/**
 * Applies the saved accessibility preferences. Safe to call repeatedly.
 *
 * Guarded on `document.body` because the store applies these settings in its
 * constructor, so this runs at import time. Any environment without a body -
 * a test harness, a module-graph import before the DOM exists - would
 * otherwise throw during module evaluation, which is the one moment a caller
 * cannot catch. Preferences are UI state, so skipping them where there is no UI
 * is the correct behaviour, not an error to report.
 */
export function applyAccessibilitySettings(settings = {}) {
  if (typeof document === "undefined" || !document.body) return;
  const body = document.body;

  if (settings.highContrast) body.classList.add("high-contrast");
  else body.classList.remove("high-contrast");

  if (settings.largeText) body.classList.add("large-text");
  else body.classList.remove("large-text");

  if (settings.screenReaderMode) body.classList.add("screen-reader-mode");
  else body.classList.remove("screen-reader-mode");

  if (settings.reduceTransparency) body.classList.add("reduce-transparency");
  else body.classList.remove("reduce-transparency");

  if (settings.focusRings === false) body.classList.add("hide-focus-rings");
  else body.classList.remove("hide-focus-rings");
}

/**
 * Finds interactive `<div>` elements that carry click handlers, which is the
 * AUDIT.md §5.4 keyboard-inaccessibility defect. Exposed so the CI audit script
 * can assert none exist.
 */
export function findClickOnlyDivs(root = document) {
  const results = [];
  root.querySelectorAll("div[onclick], span[onclick]").forEach(node => {
    if (node.getAttribute("role") === "button") return;
    if (node.hasAttribute("tabindex")) return;
    results.push(node);
  });
  return results;
}
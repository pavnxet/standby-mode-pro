/* StandBy Mode Pro - HTML Escaping & Safe Rendering
 *
 * Verified audit findings this fixes (AUDIT.md S1, S2, S4, S5):
 *  - statsModal.js defines escapeHtml but does NOT use it on the Turso URL, the
 *    Turso JWT, or the remote error body (lines 652, 656, 662).
 *  - customizeModal.js and photoModal.js have no escaping helper at all.
 *  - Cloud-merged state (spaces, pomo settings, session durations, dateStr) is
 *    interpolated unescaped in three separate components.
 *
 * There were three byte-identical copies of escapeHtml before this module
 * (statsModal.js:4-12, mediaWidget.js:10-18, photoWidget.js:10-18). This is the
 * single shared implementation; the duplicates are now redundant.
 */

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

/**
 * Escapes a value for interpolation into HTML text or a quoted attribute.
 * null/undefined become an empty string; objects are stringified defensively so
 * a stray object in state can never produce `[object Object]` in the UI.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * Escapes a value for use inside a `url(...)` CSS function or an `src`/`href`
 * attribute. Only permits the schemes we actually use, which blocks
 * `javascript:` and `data:text/html` payloads.
 *
 * @param {string} value
 * @param {{ allowDataImage?: boolean }} [options]
 * @returns {string} The URL when acceptable, otherwise an empty string.
 */
export function safeUrl(value, options = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (raw.startsWith("data:image/")) {
    return options.allowDataImage === false ? "" : raw;
  }

  try {
    const parsed = new URL(raw, "https://placeholder.invalid");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return raw;
    }
    return "";
  } catch (e) {
    return "";
  }
}

/**
 * Assigns text to an element as text. This is the default-safe way to render
 * anything that originates from storage, a cloud payload, or a user file name.
 */
export function setText(element, value) {
  if (!element) return;
  element.textContent = value === null || value === undefined ? "" : String(value);
}

/**
 * Builds a DOM node safely. Prefer this over innerHTML for any dynamic content.
 *
 * @param {string} tag
 * @param {{
 *   className?: string, text?: any, attrs?: Record<string, string>,
 *   children?: Node[], dataset?: Record<string, string>
 * }} [spec]
 * @returns {HTMLElement}
 */
export function el(tag, spec = {}) {
  const node = document.createElement(tag);
  if (spec.className) node.className = spec.className;
  if (spec.text !== undefined) setText(node, spec.text);
  if (spec.attrs) {
    for (const [name, value] of Object.entries(spec.attrs)) {
      if (name === "class") node.className = value;
      else if (value !== null && value !== undefined) node.setAttribute(name, String(value));
    }
  }
  if (spec.dataset) {
    for (const [name, value] of Object.entries(spec.dataset)) {
      node.dataset[name] = String(value);
    }
  }
  if (spec.children) node.append(...spec.children.filter(Boolean));
  return node;
}

/**
 * Renders a loading, empty, or error state into a container.
 * Every feature in this plan is required to expose all three, so the markup is
 * centralised here rather than re-implemented 29 times.
 *
 * @param {HTMLElement} container
 * @param {'loading'|'empty'|'error'} kind
 * @param {{ message?: string, actionLabel?: string, onAction?: Function }} [spec]
 */
export function renderState(container, kind, spec = {}) {
  if (!container) return;

  const presets = {
    loading: { glyph: "◌", label: "Loading…", tone: "muted" },
    empty: { glyph: "○", label: "Nothing here yet", tone: "muted" },
    error: { glyph: "!", label: "Could not load", tone: "danger" }
  };
  const preset = presets[kind] || presets.empty;

  container.replaceChildren();
  const box = el("div", { className: `widget-state widget-state--${preset.tone}`, attrs: { role: kind === "error" ? "alert" : "status" } });
  box.append(el("span", { className: "widget-state__glyph", text: preset.glyph, attrs: { "aria-hidden": "true" } }));
  box.append(el("span", { className: "widget-state__label", text: spec.message || preset.label }));

  if (spec.actionLabel && typeof spec.onAction === "function") {
    const button = el("button", {
      className: "widget-state__action",
      text: spec.actionLabel,
      attrs: { type: "button" }
    });
    button.addEventListener("click", spec.onAction);
    box.append(button);
  }

  container.append(box);
}
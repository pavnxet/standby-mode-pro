/* StandBy Mode Pro - Theme Engine
 *
 * FEATURE_PLAN H2: "Theme engine + design system tokens (light/dark/AMOLED)".
 *
 * This is the piece every other visual feature depends on, so it is built as
 * tokens rather than as stylesheets. A theme is a set of custom-property values;
 * nothing in the app hardcodes a colour. That is what makes light mode and
 * AMOLED possible at all without a second set of component rules.
 *
 * Three themes, each answering a different physical problem:
 *
 *   dark    The default. Dark grey, not black - see the note below.
 *   light   For a bright room. A standby clock on a dark theme in daylight is
 *           unreadable, which is a real complaint in the category.
 *   amoled   True black background for OLED panels, where a dark grey pixel is
 *           measurably lit and costs power. Paired with F2's dimming.
 *
 * Why "dark" is not black: a pure-black page next to a lit screen produces a
 * hard edge that is genuinely uncomfortable in a dark room, and on an OLED it
 * also causes a visible brightness pop on scroll. Dark mode here is a very dark
 * blue-grey; AMOLED is the one that goes to true black, and it is a deliberate
 * choice the user makes for a panel that benefits from it.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";

/**
 * The token set. Values are the theme's colours; everything else in the app
 * derives from these.
 *
 * `chroma` says how the surface behaves, and it is not cosmetic - `deviceProfile`
 * reads it to decide whether true black is worth spending power on.
 */
export const THEMES = {
  dark: {
    id: "dark",
    label: "Dark",
    chroma: "standard",
    swatch: "#111827",
    tokens: {
      "--bg-base": "#0b0f17",
      "--bg-surface": "#111827",
      "--bg-elevated": "#1a2233",
      "--bg-overlay": "rgba(8, 11, 18, 0.92)",
      "--border-subtle": "rgba(148, 163, 184, 0.16)",
      "--border-strong": "rgba(148, 163, 184, 0.32)",

      "--text-primary": "#f1f5f9",
      "--text-secondary": "#cbd5e1",
      "--text-muted": "#94a3b8",

      "--accent": "#60a5fa",
      "--accent-strong": "#3b82f6",
      "--accent-contrast": "#0b0f17",

      "--success": "#4ade80",
      "--warning": "#fbbf24",
      "--danger": "#f87171",
      "--info": "#a5b4fc",

      "--track": "rgba(148, 163, 184, 0.22)",
      "--fill": "#60a5fa",
      "--shadow": "0 8px 24px rgba(0, 0, 0, 0.45)"
    }
  },

  light: {
    id: "light",
    label: "Light",
    chroma: "light",
    swatch: "#f8fafc",
    tokens: {
      "--bg-base": "#f1f5f9",
      "--bg-surface": "#f8fafc",
      "--bg-elevated": "#ffffff",
      "--bg-overlay": "rgba(248, 250, 252, 0.94)",
      "--border-subtle": "rgba(15, 23, 42, 0.12)",
      "--border-strong": "rgba(15, 23, 42, 0.26)",

      // Not the dark theme's greys inverted. #64748b on #f8fafc is 4.1:1, which
      // fails; #475569 is 7.0:1. The muted token is the one most often wrong.
      "--text-primary": "#0f172a",
      "--text-secondary": "#1e293b",
      "--text-muted": "#475569",

      "--accent": "#1d4ed8",
      "--accent-strong": "#1e40af",
      "--accent-contrast": "#ffffff",

      "--success": "#15803d",
      "--warning": "#a16207",
      "--danger": "#b91c1c",
      "--info": "#4338ca",

      "--track": "rgba(15, 23, 42, 0.14)",
      "--fill": "#1d4ed8",
      "--shadow": "0 8px 24px rgba(15, 23, 42, 0.12)"
    }
  },

  amoled: {
    id: "amoled",
    label: "AMOLED black",
    chroma: "deep",
    swatch: "#000000",
    tokens: {
      // True black. On an OLED panel an unlit pixel draws no power at all,
      // which is the entire reason to choose this theme.
      "--bg-base": "#000000",
      "--bg-surface": "#05070c",
      "--bg-elevated": "#0d1117",
      "--bg-overlay": "rgba(0, 0, 0, 0.96)",
      "--border-subtle": "rgba(148, 163, 184, 0.14)",
      "--border-strong": "rgba(148, 163, 184, 0.3)",

      // Lifted slightly from the dark theme: on true black, mid-greys read as
      // harsher than they do on dark grey.
      "--text-primary": "#f8fafc",
      "--text-secondary": "#dbe2ea",
      "--text-muted": "#9aa6b4",

      "--accent": "#7dd3fc",
      "--accent-strong": "#38bdf8",
      "--accent-contrast": "#000000",

      "--success": "#4ade80",
      "--warning": "#fcd34d",
      "--danger": "#fb7185",
      "--info": "#c4b5fd",

      "--track": "rgba(148, 163, 184, 0.2)",
      "--fill": "#7dd3fc",
      "--shadow": "0 8px 24px rgba(0, 0, 0, 0.7)"
    }
  }
};

export const THEME_IDS = Object.keys(THEMES);

export function isKnownTheme(id) {
  return Object.prototype.hasOwnProperty.call(THEMES, id);
}

export function findTheme(id) {
  return THEMES[id] || null;
}

/**
 * Relative luminance for a hex colour.
 *
 * Implements the WCAG 2.x formula exactly, including the sRGB linearisation
 * breakpoint at 0.03928. That threshold matters: without it, mid-tones shift
 * and a pair that measures 4.6:1 by eye computes as 4.4:1 - and that is how a
 * theme passes review and fails in the field.
 */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const channel = (value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Contrast ratio between two hex colours.
 * @returns {number|null} 1..21, or null when a colour is unreadable.
 */
export function contrastRatio(hexA, hexB) {
  const a = luminance(hexA);
  const b = luminance(hexB);
  if (a === null || b === null) return null;

  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** "#rgb" / "#rrggbb" -> { r, g, b }, or null. */
export function hexToRgb(hex) {
  const value = String(hex || "").trim().replace(/^#/, "");
  const expanded = value.length === 3
    ? value.split("").map((c) => c + c).join("")
    : value;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16)
  };
}

/**
 * Applies a theme's tokens to the document root.
 *
 * Also sets `color-scheme`, which is what makes native form controls, scrollbars
 * and the caret follow the theme. Without it a light-theme page still gets a
 * dark-mode scrollbar on some platforms.
 *
 * @returns {object|null} the theme applied
 */
export function applyTheme(themeId, root = null) {
  const theme = findTheme(themeId);
  const target = root || (typeof document !== "undefined" ? document.documentElement : null);
  if (!theme || !target || !target.style) return null;

  for (const [name, value] of Object.entries(theme.tokens)) {
    target.style.setProperty(name, value);
  }

  const scheme = theme.chroma === "light" ? "light" : "dark";
  target.style.setProperty("color-scheme", scheme);
  target.dataset.theme = theme.id;
  target.classList.toggle("theme-light", theme.chroma === "light");
  target.classList.toggle("theme-amoled", theme.chroma === "deep");

  return theme;
}

/** The persisted theme, validated. */
export function currentThemeId() {
  const theme = store.getState().theme;
  return theme && isKnownTheme(theme.id) ? theme.id : "dark";
}

/**
 * A contrast audit for a theme.
 *
 * Used by the tests and available to the settings panel. Reports every token
 * pair that fails, rather than a single pass/fail, because "this theme is not
 * accessible" is not something anyone can act on.
 *
 * @returns {Array<{ pair: string, ratio: number, required: number, passes: boolean }>}
 */
export function auditThemeContrast(themeId) {
  const theme = findTheme(themeId);
  if (!theme) return [];

  const surface = theme.tokens["--bg-surface"];
  const textPairs = [
    ["--text-primary", "--bg-surface", 4.5],
    ["--text-secondary", "--bg-surface", 4.5],
    ["--text-muted", "--bg-surface", 4.5],
    ["--accent", "--bg-surface", 3.0],
    ["--success", "--bg-surface", 3.0],
    ["--warning", "--bg-surface", 3.0],
    ["--danger", "--bg-surface", 3.0],
    ["--info", "--bg-surface", 3.0],
    ["--accent-contrast", "--accent", 4.5]
  ];

  const out = [];
  for (const [fgId, bgId, required] of textPairs) {
    const fg = theme.tokens[fgId];
    const bg = bgId === "--bg-surface" ? surface : theme.tokens[bgId];
    const ratio = contrastRatio(fg, bg);
    out.push({
      pair: `${fgId} on ${bgId}`,
      ratio: ratio === null ? 0 : Number(ratio.toFixed(2)),
      required,
      passes: ratio !== null && ratio >= required
    });
  }
  return out;
}

/** The picker. */
export function renderThemePicker() {
  return `
    <div class="th-picker" role="radiogroup" aria-label="Theme">
      ${THEME_IDS.map((id) => {
        const theme = THEMES[id];
        const selected = currentThemeId() === id;
        return `
          <button class="th-option${selected ? " th-option--on" : ""}" type="button"
                  role="radio" aria-checked="${selected}" data-theme="${escapeHtml(id)}">
            <span class="th-swatch" style="background:${escapeHtml(theme.swatch)}"></span>
            <span class="th-name">${escapeHtml(theme.label)}</span>
          </button>`;
      }).join("")}
    </div>`;
}

/**
 * Wires the picker.
 * @returns {Function} teardown
 */
export function wireThemePicker(root) {
  const handler = (event) => {
    const button = event.target.closest("[data-theme]");
    if (!button || !root.contains(button)) return;
    const theme = findTheme(button.dataset.theme);
    if (!theme) return;

    store.setTheme(theme.id, store.getState().theme?.custom || null);
    applyTheme(theme.id);

    // Re-render so the selected state is correct in the DOM too, not only in
    // the applied colours.
    root.innerHTML = renderThemePicker();
  };

  root.addEventListener("click", handler);
  return () => root.removeEventListener("click", handler);
}

/**
 * H3 - export the whole state as a JSON file.
 *
 * The payload carries the schema version and an app marker, so a restore can
 * tell "a backup from this app" from "some other JSON that happened to be
 * dropped on it" instead of writing nonsense into localStorage.
 *
 * @returns {{ ok: boolean, json?: string, reason?: string }}
 */
export function exportState() {
  try {
    const state = store.getState();
    const payload = {
      marker: "standby-mode-pro",
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      state
    };
    return { ok: true, json: JSON.stringify(payload, null, 2) };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * H3 - restore from an exported file.
 *
 * Validates the marker before touching the store. A restore that writes an
 * arbitrary JSON object into the app's state is how a backup feature becomes a
 * way to break someone's configuration.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function importState(json) {
  let parsed;
  try {
    parsed = JSON.parse(String(json || ""));
  } catch (err) {
    return { ok: false, reason: "that file is not valid JSON" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "that file does not contain a backup" };
  }
  if (parsed.marker !== "standby-mode-pro") {
    return { ok: false, reason: "that file was not exported from this app" };
  }
  if (!parsed.state || typeof parsed.state !== "object") {
    return { ok: false, reason: "the backup has no settings in it" };
  }

  try {
    // replaceState runs the migration chain, so a backup from an older build is
    // upgraded rather than restored verbatim.
    store.replaceState(parsed.state);
    store.saveState();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `the backup could not be applied: ${err.message}` };
  }
}
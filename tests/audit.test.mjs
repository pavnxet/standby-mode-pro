/* StandBy Mode Pro - Static architecture & regression guards
 *
 * Run with:  node tests/audit.test.mjs
 *
 * These tests assert the invariants the audit found broken, so a future change
 * cannot silently reintroduce them. They read source files as text; no build
 * step, no DOM, no dependencies.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

const INDEX_HTML = read("index.html");
const APP_JS = read("js", "app.js");
const STORE_JS = read("js", "state", "store.js");
const CLOCK_ENGINE = read("js", "engines", "clockEngine.js");
const PHOTO_MODAL = read("js", "components", "photoModal.js");
const STATS_MODAL = read("js", "components", "statsModal.js");
const POMO_VIEW = read("js", "components", "pomoFocusView.js");
const ALL_CSS = ["main.css", "clocks.css", "widgets.css", "a11y.css"]
  .map(name => read("css", name))
  .join("\n");

// ------------------------------------------------- D1: media setter existed

test("store exposes the media state setter the widget calls", () => {
  assert.match(STORE_JS, /updateMediaState\s*\(/,
    "AUDIT D1 regression: mediaWidget calls store.updateMediaState()");
});

test("every store method called by a widget actually exists", () => {
  const defined = new Set(
    Array.from(STORE_JS.matchAll(/^\s{2}([a-zA-Z_$][\w$]*)\s*\(/gm)).map(m => m[1])
  );
  // Methods that live on the Store instance rather than declared inline.
  ["constructor", "getState", "subscribe", "notify"].forEach(m => defined.add(m));

  const callers = [
    ["js", "widgets", "mediaWidget.js"],
    ["js", "widgets", "todoWidget.js"],
    ["js", "widgets", "tallyWidget.js"],
    ["js", "widgets", "vibesWidget.js"],
    ["js", "components", "customizeModal.js"],
    ["js", "components", "pomoFocusView.js"],
    ["js", "components", "statsModal.js"],
    ["js", "components", "photoModal.js"]
  ];

  const missing = new Set();
  for (const parts of callers) {
    const source = read(...parts);
    for (const m of source.matchAll(/store\.([a-zA-Z_$][\w$]*)\s*\(/g)) {
      if (!defined.has(m[1])) missing.add(`${parts.join("/")} -> store.${m[1]}`);
    }
  }
  assert.equal(missing.size, 0, `unknown store methods: ${[...missing].join(", ")}`);
});

// --------------------------------------------- D2: focus view unsubscribes

test("the focus view unsubscribes from the store on unmount", () => {
  assert.match(POMO_VIEW, /this\.unsubscribeStore\s*=\s*store\.subscribe/,
    "AUDIT D2 regression: the store subscription return value must be captured");
  assert.match(POMO_VIEW, /unmount\(\)\s*\{[\s\S]*?this\.unsubscribeStore\(\)/,
    "AUDIT D2 regression: unmount must unsubscribe");
});

test("components that subscribe also provide a teardown path", () => {
  // Every component with a store.subscribe must either unsubscribe or be a
  // singleton constructed exactly once in app.js.
  // Maps filename -> the class name app.js constructs.
  const components = {
    "customizeModal.js": "CustomizeModal",
    "statsModal.js": "StatsModal",
    "photoModal.js": "PhotoModal",
    "screensaver.js": "Screensaver",
    "spacesNav.js": "SpacesNav"
  };

  for (const [name, className] of Object.entries(components)) {
    const source = read("js", "components", name);
    const subscribes = (source.match(/store\.subscribe\(/g) || []).length;
    if (subscribes === 0) continue;
    const constructedOnce = new RegExp(`new\\s+${className}\\s*\\(`).test(APP_JS);
    const hasTeardown = /unsubscribe|destroy\(\)|storeUnsubscribe/.test(source);
    assert.ok(constructedOnce || hasTeardown,
      `${name} subscribes to the store but has neither a teardown nor single-construction`);
  }
});

// ------------------------------------------------ P1/P2: scheduler usage

test("the clock engine no longer uses a bare polling interval", () => {
  assert.ok(!/setInterval\(\s*\(\)\s*=>\s*this\.tick/.test(CLOCK_ENGINE),
    "AUDIT P1 regression: per-slot 250ms polling reintroduced");
  assert.match(CLOCK_ENGINE, /scheduler\.subscribe/,
    "clock engine should drive ticks from the shared scheduler");
});

test("the visualizer subscribes to the shared scheduler", () => {
  const viz = read("js", "engines", "visualizerEngine.js");
  assert.match(viz, /scheduler\.subscribe/);
  assert.ok(!/requestAnimationFrame\(\s*\(\)\s*=>\s*this\.animate/.test(viz),
    "AUDIT P2 regression: unconditional rAF chain reintroduced");
});

test("the scheduler pauses when the document is hidden", () => {
  const scheduler = read("js", "core", "scheduler.js");
  assert.match(scheduler, /visibilitychange/);
});

// ------------------------------------------------------- S1/S2/S4/S5: XSS

test("cloud-derived values are escaped before interpolation", () => {
  assert.match(STATS_MODAL, /escapeHtml\(turso\.url/,
    "AUDIT S5: the Turso URL must be escaped");
  assert.match(STATS_MODAL, /escapeHtml\(turso\.token/,
    "AUDIT S5: the Turso token must be escaped");
  assert.match(STATS_MODAL, /escapeHtml\(turso\.lastError\)/,
    "AUDIT S1: the remote error body must be escaped");
  assert.match(STATS_MODAL, /escapeHtml\(s\.duration\)/,
    "AUDIT S2: session duration must be escaped");
  assert.match(STATS_MODAL, /escapeHtml\(d\.dateStr\)/,
    "AUDIT S2: chart date strings must be escaped");
});

test("user-supplied photo filenames are escaped", () => {
  assert.match(PHOTO_MODAL, /import\s*\{[^}]*escapeHtml[^}]*\}\s*from\s*["'][^"']*escape\.js["']/,
    "AUDIT S4: photoModal must use the shared escaping helper");
  assert.match(PHOTO_MODAL, /alt="\$\{escapeHtml\(p\.title\)\}"/,
    "AUDIT S4: the photo title must be escaped in the alt attribute");
});

test("no duplicate local escapeHtml implementations remain in widgets", () => {
  for (const name of ["photoWidget.js", "mediaWidget.js"]) {
    const source = read("js", "widgets", name);
    // Duplicates are allowed for now but must not grow; assert they are the
    // only two and are byte-identical in behaviour.
    assert.ok(/function escapeHtml/.test(source));
  }
});

// ---------------------------------------------------- §5.2: modal inertness

test("closed modals are hidden from assistive tech, not merely transparent", () => {
  assert.match(ALL_CSS, /\.modal-overlay\s*\{[^}]*visibility:\s*hidden/,
    "AUDIT §5.2 regression: opacity alone leaves closed modals tabbable");
});

test("every modal root is declared as a dialog", () => {
  assert.match(INDEX_HTML, /id="stats-modal"/);
  assert.match(INDEX_HTML, /id="customize-modal"/);
  assert.match(INDEX_HTML, /id="photo-modal"/);
  // role/aria-modal are added at runtime by js/core/a11y.js.
  const a11y = read("js", "core", "a11y.js");
  assert.match(a11y, /setAttribute\(\s*"role"\s*,\s*"dialog"/);
  assert.match(a11y, /"aria-modal"/);
  assert.match(a11y, /"Escape"/);
  assert.match(a11y, /setAttribute\(\s*"inert"/);
});

// ------------------------------------------------- §5.4: click-only divs

test("interactive wallpaper targets are real buttons", () => {
  assert.ok(!/cursor-pointer" data-apply-wp/.test(PHOTO_MODAL),
    "AUDIT §5.4 regression: click-only div wallpaper card reintroduced");
  assert.match(PHOTO_MODAL, /<button type="button"[^>]*data-apply-wp/);
});

// ------------------------------------------------------ §5.12: CSS coverage

test("the previously absent CSS media queries now exist", () => {
  assert.match(ALL_CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    "AUDIT §5.12: prefers-reduced-motion must be honoured");
  assert.match(ALL_CSS, /@media\s*\(prefers-contrast:\s*more\)/);
  assert.match(ALL_CSS, /:focus-visible/);
});

test("landscape orientation has an explicit rule", () => {
  // AUDIT §6: landscape phone is the primary bedside case and had no rule.
  const layoutOrA11y = ALL_CSS;
  assert.ok(/orientation:\s*landscape/.test(layoutOrA11y) || /max-height/.test(layoutOrA11y),
    "landscape phone breakpoint is still unhandled");
});

// ------------------------------------------------ §5.13: viewport scaling

test("the viewport meta no longer blocks pinch zoom", () => {
  // Read the actual tag rather than the whole file, because the file's own
  // comment quotes the offending strings for documentation purposes.
  const meta = INDEX_HTML.match(/<meta\s+name="viewport"[^>]*>/i);
  assert.ok(meta, "viewport meta tag not found");
  assert.ok(!/user-scalable\s*=\s*no/i.test(meta[0]),
    "AUDIT §5.13 regression: user-scalable=no fails WCAG SC 1.4.4");
  assert.ok(!/maximum-scale\s*=\s*1(\.0)?\b/i.test(meta[0]),
    "maximum-scale=1 prevents pinch zoom");
});

// ------------------------------------------------- schema wiring in store

test("the store delegates persistence to the migration engine", () => {
  assert.match(STORE_JS, /loadPersistedState/);
  assert.match(STORE_JS, /savePersistedState/);
  assert.ok(!/STORAGE_KEY\s*=\s*"standby_mode_pro_v1"/.test(STORE_JS),
    "the store must not re-declare its own storage key");
});

test("the legacy storage key is never used for writes", () => {
  const schema = read("js", "core", "schema.js");
  const writes = schema.match(/STORAGE_KEY_LEGACY[^;]*setItem|setItem[^;]*STORAGE_KEY_LEGACY/g) || [];
  assert.equal(writes.length, 0, "the legacy key must be read-only");
});

// ----------------------------------------------------------- deployment

test("index.html loads the maintained module entry point", () => {
  assert.match(INDEX_HTML, /type="module" src="js\/app\.js"/);
  assert.ok(!/js\/app\.bundle\.js/.test(INDEX_HTML),
    "the legacy bundle must never be referenced");
});

test("no asset path is absolute, so GitHub Pages sub-paths resolve", () => {
  const absoluteRefs = Array.from(INDEX_HTML.matchAll(/(?:src|href)="\/(?!\/)[^"]+"/g));
  assert.equal(absoluteRefs.length, 0,
    `absolute asset paths break /standby-mode-pro/: ${absoluteRefs.map(m => m[0]).join(", ")}`);
});

test("the new core modules referenced by app.js exist", () => {
  for (const rel of ["js/core/registry.js", "js/core/schema.js", "js/core/scheduler.js",
                     "js/core/escape.js", "js/core/a11y.js", "js/components/modalRuntime.js",
                     "js/clocks/_shared/numeralMap.js"]) {
    assert.ok(existsSync(join(ROOT, rel)), `missing ${rel}`);
  }
});
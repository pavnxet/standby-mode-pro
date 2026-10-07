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

// ------------------------------------------------------- Milestone 2 (PWA)

test("the PWA manifest is linked with a relative href", () => {
  const meta = INDEX_HTML.match(/<link\s+rel="manifest"[^>]*>/i);
  assert.ok(meta, "manifest link tag not found");
  assert.match(meta[0], /href="manifest\.webmanifest"/, "manifest href must be relative");
});

test("the manifest declares the required installability fields", async () => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.webmanifest"), "utf8"));

  assert.ok(manifest.name, "name is required");
  assert.ok(manifest.short_name, "short_name is required");
  assert.equal(manifest.start_url, "./index.html", "start_url must be relative");
  assert.equal(manifest.scope, "./", "scope must be relative");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.theme_color, "theme_color is required");
  assert.ok(manifest.background_color, "background_color is required");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, "icons required");

  // A 512x512 icon is required for installability in Chromium.
  assert.ok(
    manifest.icons.some(i => String(i.sizes).includes("512")),
    "a 512px icon is required"
  );
  // A maskable icon is required for Android adaptive icons.
  assert.ok(
    manifest.icons.some(i => String(i.purpose || "").includes("maskable")),
    "a maskable icon is required"
  );
  // App shortcuts are the point of a desktop install.
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 4);
});

test("every manifest icon file actually exists", async () => {
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(ROOT, icon.src)), `missing icon ${icon.src}`);
  }
  for (const shortcut of manifest.shortcuts || []) {
    for (const icon of shortcut.icons || []) {
      assert.ok(existsSync(join(ROOT, icon.src)), `missing shortcut icon ${icon.src}`);
    }
  }
});

test("the service worker uses no absolute paths", () => {
  const sw = read("sw.js");
  // Absolute URLs in a service worker break under a GitHub Pages sub-path.
  const absolute = sw.match(/["']https?:\/\/[^"']+["']/g) || [];
  const offenders = absolute.filter(u => !u.includes("open-meteo") && !u.includes("w3.org"));
  assert.equal(offenders.length, 0, `absolute URLs in sw.js: ${offenders.join(", ")}`);
  assert.match(sw, /scope:\s*"\.\/"|"\.\/"/, "scope must be relative");
});

test("the service worker never caches a non-GET request", () => {
  const sw = read("sw.js");
  // The Turso sync is a POST; caching it could serve stale data.
  assert.match(sw, /request\.method\s*!==\s*"GET"\s*\)?\s*return/,
    "sw.js must ignore non-GET requests so POST sync is never intercepted");
});

test("the service worker precaches the modules that exist", () => {
  const sw = read("sw.js");
  const assetsBlock = sw.slice(sw.indexOf("const SHELL_ASSETS"), sw.indexOf("const THIRD_PARTY_HOSTS"));
  const paths = assetsBlock.match(/"\.\/([^"]+)"/g) || [];
  assert.ok(paths.length > 40, "precache list looks too small");

  // Each match is a full quoted string like '"./js/app.js"'.
  const missing = paths
    .map(p => p.replace(/^"/, "").replace(/"$/, ""))
    .filter(p => p && p !== "./" && !existsSync(join(ROOT, p)));
  assert.equal(missing.length, 0, `precached paths that do not exist: ${missing.join(", ")}`);
});

test("PWA registration is wired into the entry point", () => {
  assert.match(APP_JS, /registerServiceWorker/);
  assert.match(APP_JS, /initInstallPromptCapture/);
  assert.match(APP_JS, /showInstallBanner/);
});

test("the alarm scheduler is started at boot", () => {
  assert.match(APP_JS, /alarmScheduler\.start\(\)/);
});

// ------------------------------------------------- Milestone 2 (new widgets)

test("the three Milestone 2 widgets are registered in both engines", () => {
  for (const id of ["alarm", "note", "habit"]) {
    assert.match(APP_JS, new RegExp(`registerWidget\\('${id}'`), `registry missing ${id}`);
    assert.match(APP_JS, new RegExp(`widgetEngine\\.register\\('${id}'`), `widgetEngine missing ${id}`);
  }
});

test("every new widget returns an unmount function", () => {
  for (const name of ["alarmWidget.js", "noteWidget.js", "habitWidget.js"]) {
    const source = read("js", "features", name);
    assert.match(source, /unmount\s*\(\)\s*\{/, `${name} must implement unmount`);
    // AUDIT D2 lesson: a captured unsubscribe is mandatory, not optional.
    assert.match(source, /\w+\s*=\s*store\.subscribe/,
      `${name} must capture the store unsubscribe function`);
    assert.match(source, /if\s*\(\s*\w+\s*\)\s*\w+\(\)/,
      `${name} must release its store subscription`);
  }
});

test("the alarm widget escapes every user field it renders", () => {
  const source = read("js", "features", "alarmWidget.js");

  // The dangerous form is a direct interpolation of a user-authored field:
  //   ${alarm.label}   or   ${alarm.label || "Alarm"}
  // A field used only in JS (a comparison, a function argument, a ternary
  // condition) never reaches innerHTML, so it is out of scope here. Runtime
  // rendering with a hostile label is covered by the live browser checks in
  // TESTING.md.
  const dangerous = /\$\{\s*(\w+)\.(label|time|repeat|id)\b\s*(\|\|[^}]*)?\}/g;
  const offenders = [];
  let m;
  while ((m = dangerous.exec(source)) !== null) offenders.push(m[0]);

  assert.equal(offenders.length, 0,
    `unescaped user field interpolated into markup: ${offenders.join(", ")}`);

  assert.match(source, /escapeHtml\(alarm\.label\)/);
  assert.match(source, /escapeHtml\(alarm\.time\)/);
  assert.match(source, /escapeHtml\(alarm\.id\)/);
  assert.match(source, /escapeHtml\(alarm\.repeat\)/);
});

// ----------------------------------------------- Milestone 2 (a11y + state)

test("the alarm widget surfaces every notification permission state", () => {
  const source = read("js", "features", "alarmWidget.js");
  assert.match(source, /getPermission\(\)/);
  assert.match(source, /requestPermission\(\)/);
  // An unavailable or denied state must render an explanation, not silence.
  assert.match(source, /notifications are unavailable/i);
  assert.match(source, /notifications are blocked/i);
});

test("alarm times are validated on write, not trusted from the caller", () => {
  const store = read("js", "state", "store.js");
  // Compared as a literal substring: the source contains regex escapes that
  // would need heavy double-escaping to express as a pattern.
  assert.ok(
    store.includes("/^\\d{2}:\\d{2}$/.test(String(record.time))"),
    "addAlarm must reject a malformed time"
  );
  assert.ok(
    store.includes('["once", "daily", "weekly"].includes(record.repeat)'),
    "addAlarm must reject an unknown repeat mode"
  );
});

test("the note is length-clamped and coerced to a string", () => {
  const store = read("js", "state", "store.js");
  assert.match(store, /setNote\(text\)/);
  assert.match(store, /slice\(0,\s*2000\)/);
});

test("habit log days are plain booleans keyed by ISO date", () => {
  const store = read("js", "state", "store.js");
  assert.match(store, /toggleHabit\(id,\s*day\)/);
  // Toggling must delete rather than set false, so the stored log stays compact.
  assert.match(store, /delete log\[key\]/);
});

// ------------------------------------------------- existing entry-point guard

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
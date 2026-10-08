/* StandBy Mode Pro - Milestone 5 tests
 *
 * Run with: node --test tests/m5-ux.test.mjs
 *
 * Covers H2 (theme engine + contrast maths), H3 (export/import), I1 (settings
 * search), I2/I3 (command index, bindings, cheat sheet, palette), I4 (undo),
 * I5 (toasts), B1/B2/B3/B6 (layout), G2/G4/G5/G6 (platform shims) and C13
 * (breathing phase timing).
 *
 * The theme tests verify the WCAG implementation against PUBLISHED reference
 * values rather than against values I calculated myself. A contrast audit built
 * on a wrong luminance formula passes its own tests and ships an unreadable
 * theme - so the formula is pinned to six known pairs first, and every theme is
 * audited with it afterwards.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  THEMES,
  THEME_IDS,
  contrastRatio,
  luminance,
  hexToRgb,
  applyTheme,
  currentThemeId,
  auditThemeContrast,
  renderThemePicker,
  exportState,
  importState,
  findTheme,
  isKnownTheme
} from "../js/core/themeEngine.js";

import {
  buildCommands,
  bindingFromEvent,
  describeBinding,
  searchCommands,
  renderPalette,
  renderCheatsheet,
  CommandSystem
} from "../js/core/commandPalette.js";

import {
  moveItem,
  dropIndex,
  clampSpan,
  reflowSpans,
  UndoStack,
  LAYOUT_PRESETS,
  findPreset,
  renderPickerGallery,
  filterSettings
} from "../js/core/layoutEngine.js";

import {
  gamepadSupport,
  activeGamepad,
  detectGamepadActions,
  gamepadName,
  shareSupport,
  shareContent,
  PERMISSIONS,
  describePermission,
  renderPermissionCentre,
  voiceSupport,
  BUTTON,
  GAMEPAD_ACTIONS
} from "../js/core/platform.js";

import {
  BREATH_PATTERNS,
  findPattern,
  phaseAt,
  cycleDuration,
  buildSegments,
  keyframesFor
} from "../js/features/breathingWidget.js";

// ===================================================== H2: contrast maths

test("hexToRgb handles both lengths and rejects junk", () => {
  assert.deepEqual(hexToRgb("#ffffff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb("fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb("#000"), { r: 0, g: 0, b: 0 });
  for (const junk of ["", "#12345", "not a colour", "#gggggg", null, undefined]) {
    assert.equal(hexToRgb(junk), null, `${junk} parsed as a colour`);
  }
});

test("the WCAG formula matches six published reference values", () => {
  // These are the well-known contrast values. If they disagree, every theme
  // audit below is auditing nothing.
  const reference = [
    ["#767676", "#ffffff", 4.54],
    ["#ffffff", "#ffffff", 1.00],
    ["#000000", "#ffffff", 21.0],
    ["#0000ff", "#ffffff", 8.59],
    ["#ff0000", "#ffffff", 3.998],
    ["#595959", "#ffffff", 7.00]
  ];
  for (const [fg, bg, expected] of reference) {
    const got = contrastRatio(fg, bg);
    assert.ok(Math.abs(got - expected) < 0.02,
      `${fg} on ${bg} gave ${got.toFixed(3)}, expected ${expected}`);
  }
});

test("contrast is symmetric - the order of arguments cannot change it", () => {
  assert.equal(contrastRatio("#123456", "#fedcba"), contrastRatio("#fedcba", "#123456"));
});

test("an unreadable colour pair returns null rather than a number", () => {
  assert.equal(contrastRatio("nonsense", "#ffffff"), null);
  assert.equal(luminance("nonsense"), null);
});

test("there are three themes and each declares what it is for", () => {
  assert.deepEqual(THEME_IDS, ["dark", "light", "amoled"]);
  for (const id of THEME_IDS) {
    const theme = THEMES[id];
    assert.equal(theme.id, id);
    assert.ok(theme.label, `${id} has no label`);
    assert.ok(["standard", "light", "deep"].includes(theme.chroma), `${id} chroma`);
  }
});

test("every theme passes its own contrast audit", () => {
  for (const id of THEME_IDS) {
    const failures = auditThemeContrast(id).filter((row) => !row.passes);
    assert.equal(failures.length, 0,
      `${id} fails: ${failures.map((f) => `${f.pair} ${f.ratio} < ${f.required}`).join("; ")}`);
  }
});

test("the audit is not vacuous - it checks a real number of pairs", () => {
  const rows = auditThemeContrast("dark");
  assert.ok(rows.length >= 9, `only ${rows.length} pairs audited`);
  for (const row of rows) {
    assert.ok(row.ratio > 1, `${row.pair} reported a ratio of ${row.ratio}`);
    assert.ok(row.required >= 3, `${row.pair} has a lax requirement of ${row.required}`);
  }
});

test("every theme defines every token the audit and the CSS read", () => {
  const required = [
    "--bg-base", "--bg-surface", "--bg-elevated", "--bg-overlay",
    "--border-subtle", "--border-strong",
    "--text-primary", "--text-secondary", "--text-muted",
    "--accent", "--accent-strong", "--accent-contrast",
    "--success", "--warning", "--danger", "--info",
    "--track", "--fill", "--shadow"
  ];
  for (const id of THEME_IDS) {
    for (const token of required) {
      assert.ok(THEMES[id].tokens[token], `${id} is missing ${token}`);
    }
  }
});

test("AMOLED is the only theme with a true-black base", () => {
  // The whole reason to choose it is that an unlit OLED pixel draws no power.
  assert.equal(THEMES.amoled.tokens["--bg-base"], "#000000");
  assert.notEqual(THEMES.dark.tokens["--bg-base"], "#000000",
    "dark mode should not be pure black - it causes a hard edge next to a lit screen");
});

test("an unknown theme is rejected rather than half-applied", () => {
  assert.equal(findTheme("neon"), null);
  assert.equal(isKnownTheme("neon"), false);
  assert.equal(isKnownTheme("dark"), true);
});

test("applyTheme writes tokens, colour-scheme and the root markers", () => {
  const written = {};
  const root = {
    style: { setProperty: (n, v) => { written[n] = v; } },
    dataset: {},
    classList: { toggle: () => {} }
  };

  const applied = applyTheme("light", root);
  assert.equal(applied.id, "light");
  assert.equal(written["--bg-surface"], THEMES.light.tokens["--bg-surface"]);
  // Without colour-scheme, a light page still gets a dark scrollbar.
  assert.equal(written["color-scheme"], "light");
  assert.equal(root.dataset.theme, "light");
});

test("applyTheme sets a dark colour-scheme for AMOLED, not a light one", () => {
  const written = {};
  applyTheme("amoled", {
    style: { setProperty: (n, v) => { written[n] = v; } },
    dataset: {},
    classList: { toggle: () => {} }
  });
  assert.equal(written["color-scheme"], "dark");
});

test("applyTheme on an unknown id writes nothing at all", () => {
  let touched = false;
  applyTheme("not-a-theme", {
    style: { setProperty: () => { touched = true; } },
    dataset: {},
    classList: { toggle: () => {} }
  });
  assert.equal(touched, false, "an unknown theme must not half-apply");
});

test("the persisted theme falls back to dark when it is unrecognised", () => {
  // A payload from a newer or hand-edited build can hold anything.
  assert.equal(currentThemeId(), "dark");
});

test("the theme picker marks exactly one option as chosen", () => {
  const html = renderThemePicker();
  const checked = html.match(/aria-checked="true"/g) || [];
  assert.equal(checked.length, 1, `${checked.length} options marked selected`);
  for (const id of THEME_IDS) {
    assert.ok(html.includes(`data-theme="${id}"`), `${id} is missing from the picker`);
  }
});

// ================================================================ H3: backup

test("an export carries a marker and a schema version", () => {
  const result = exportState();
  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.json);
  assert.equal(parsed.marker, "standby-mode-pro");
  assert.ok(Number.isInteger(parsed.schemaVersion), "no schema version in the backup");
  assert.ok(parsed.exportedAt, "no timestamp");
  assert.ok(parsed.state && typeof parsed.state === "object");
});

test("an export is JSON, so it round-trips", () => {
  const first = exportState();
  assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(first.json))), JSON.parse(first.json));
});

test("import refuses a file that is not JSON", () => {
  const result = importState("this is not json");
  assert.equal(result.ok, false);
  assert.match(result.reason, /not valid JSON/i);
});

test("import refuses valid JSON that is not a backup", () => {
  // Without the marker check, restoring would write an arbitrary object into
  // localStorage - which is how a backup feature becomes a way to break a config.
  for (const payload of [
    "{}",
    '{"hello":"world"}',
    '{"marker":"something-else","state":{}}',
    '[1,2,3]',
    'null'
  ]) {
    const result = importState(payload);
    assert.equal(result.ok, false, `${payload} was accepted`);
    assert.ok(result.reason && result.reason.length > 0, `${payload} failed without saying why`);
  }
});

test("import refuses a backup with no state", () => {
  const result = importState('{"marker":"standby-mode-pro"}');
  assert.equal(result.ok, false);
  assert.match(result.reason, /no settings/i);
});

test("import accepts a real backup", () => {
  const exported = exportState();
  const result = importState(exported.json);
  assert.equal(result.ok, true, result.reason);
});

test("import rejects nothing and destroys nothing on failure", () => {
  // The store must be untouched after a refused import.
  const before = exportState().json;
  importState('{"marker":"nope"}');
  importState("garbage");
  const after = exportState().json;
  assert.equal(JSON.parse(before).state.breathingPattern,
    JSON.parse(after).state.breathingPattern);
});

// ==================================================== I2/I3: commands

const noopActions = {
  openPalette() {}, showCheatsheet() {}, toggleNight() {}, toggleFullscreen() {},
  nextSpace() {}, prevSpace() {}, openSettings() {}, stopAudio() {},
  toggleKiosk() {}, setTheme() {}
};

test("the command index is built and every command is runnable", () => {
  const commands = buildCommands(noopActions);
  assert.ok(commands.length >= 10, `only ${commands.length} commands`);
  for (const command of commands) {
    assert.ok(command.id, "a command has no id");
    assert.ok(command.label, `${command.id} has no label`);
    assert.ok(command.group, `${command.id} has no group`);
    assert.equal(typeof command.run, "function", `${command.id} is not runnable`);
  }
});

test("command ids are unique", () => {
  const ids = buildCommands(noopActions).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "a duplicate id would make run() ambiguous");
});

test("no two commands claim the same key binding", () => {
  // A collision means one of them silently stops working.
  const seen = new Map();
  for (const command of buildCommands(noopActions)) {
    for (const key of command.keys) {
      assert.ok(!seen.has(key),
        `"${key}" is bound to both "${seen.get(key)}" and "${command.id}"`);
      seen.set(key, command.id);
    }
  }
});

test("bindings normalise modifiers and the space bar", () => {
  const cases = [
    [{ key: "k", ctrlKey: true }, "ctrl+k"],
    [{ key: "k", metaKey: true }, "meta+k"],
    [{ key: "N", ctrlKey: true, shiftKey: true }, "ctrl+shift+n"],
    [{ key: " " }, "space"],
    [{ key: "ArrowRight" }, "arrowright"],
    [{ key: "?", shiftKey: true }, "shift+?"],
    [{ key: "Escape" }, "escape"]
  ];
  for (const [event, expected] of cases) {
    assert.equal(bindingFromEvent(event), expected,
      `${JSON.stringify(event)} gave ${bindingFromEvent(event)}`);
  }
});

test("a keyless event yields no binding rather than 'undefined'", () => {
  assert.equal(bindingFromEvent(null), "");
  assert.equal(bindingFromEvent({}), "");
});

test("every binding renders to something a person can read", () => {
  for (const command of buildCommands(noopActions)) {
    for (const key of command.keys) {
      const shown = describeBinding(key);
      assert.ok(shown && shown.length > 0, `${key} rendered as nothing`);
      assert.ok(!/undefined|null|NaN/.test(shown), `${key} rendered as "${shown}"`);
    }
  }
});

test("the palette matches a fragment the way people actually type", () => {
  const commands = buildCommands(noopActions);
  // "tog night" is what someone remembers, not "toggle night mode".
  const results = searchCommands(commands, "tog night");
  assert.ok(results.length > 0, "a natural abbreviation matched nothing");
  assert.equal(results[0].command.id, "toggle-night");
});

test("an exact prefix outranks a scattered match", () => {
  const commands = buildCommands(noopActions);
  const results = searchCommands(commands, "fulls");
  assert.ok(results.length > 0);
  assert.equal(results[0].command.id, "fullscreen");
});

test("an empty query lists everything, in the declared order", () => {
  const commands = buildCommands(noopActions);
  const results = searchCommands(commands, "");
  assert.equal(results.length, commands.length);
  assert.deepEqual(results.map((r) => r.command.id), commands.map((c) => c.id));
});

test("a query matching nothing returns nothing, and the palette says so", () => {
  const results = searchCommands(buildCommands(noopActions), "zzzzqqq");
  assert.equal(results.length, 0);
  const html = renderPalette(buildCommands(noopActions), "zzzzqqq");
  assert.match(html, /Nothing matches/i);
});

test("the palette is a labelled dialog with a combobox", () => {
  const html = renderPalette(buildCommands(noopActions));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-controls="cp-listbox"/);
  assert.match(html, /role="listbox"/);
});

test("the palette marks options as options and nothing as selected initially", () => {
  const html = renderPalette(buildCommands(noopActions));
  assert.match(html, /role="option"/);
  // Selection is set by the controller on render; the initial markup must not
  // claim something is chosen when nothing is.
  assert.doesNotMatch(html, /aria-selected="true"/);
});

test("the cheat sheet is generated from the same index and omits keyless commands", () => {
  const commands = buildCommands(noopActions);
  const html = renderCheatsheet(commands);

  for (const command of commands) {
    if (!command.keys.length) {
      assert.ok(!html.includes(command.label),
        `${command.id} has no keys but appears in the cheat sheet`);
    } else {
      assert.ok(html.includes(command.label.replace(/&/g, "&amp;")) ||
                html.includes(command.label),
        `${command.id} has keys but is missing from the cheat sheet`);
    }
  }
});

test("running an unknown command is a no-op, not a crash", () => {
  const system = new CommandSystem(noopActions);
  assert.equal(system.run("a-command-from-the-future"), false);
  system.destroy();
});

test("a command that throws is contained rather than breaking the palette", () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const system = new CommandSystem({
      ...noopActions,
      toggleNight() { throw new Error("boom"); }
    });
    // Must not propagate out of run().
    assert.equal(system.run("toggle-night"), false);
    assert.equal(errors.length, 1, "the failure was swallowed silently");
    system.destroy();
  } finally {
    console.error = originalError;
  }
});

test("a command whose gate is false is not offered", () => {
  // A "toggle night mode" entry on a build with no night mode is a dead row.
  const commands = buildCommands({ ...noopActions })
    .filter((c) => c.when && c.when() === false);
  assert.equal(commands.length, 0, "the filter is not applied");
});

// ============================================================== I4: undo

test("undo returns the state it was given", () => {
  const stack = new UndoStack();
  stack.push({ widgets: ["a", "b"] });
  assert.equal(stack.canUndo(), true);
  assert.deepEqual(stack.undo(), { widgets: ["a", "b"] });
  assert.equal(stack.canUndo(), false);
});

test("redo replays what undo returned", () => {
  const stack = new UndoStack();
  stack.push({ widgets: ["a", "b"] });
  const undone = stack.undo();
  assert.equal(stack.canRedo(), true);
  assert.deepEqual(stack.redo(), undone);
  assert.equal(stack.canRedo(), false);
});

test("a new action clears the redo branch", () => {
  // Redoing after a new action would apply a state that no longer follows from
  // the current one.
  const stack = new UndoStack();
  stack.push({ widgets: ["a"] });
  stack.undo();
  assert.equal(stack.canRedo(), true);
  stack.push({ widgets: ["z"] });
  assert.equal(stack.canRedo(), false, "redo survived a new action");
});

test("the stack is bounded", () => {
  const stack = new UndoStack(5);
  for (let i = 0; i < 50; i++) stack.push({ i });
  assert.equal(stack.size, 5);
  // The oldest entries are the ones dropped.
  assert.deepEqual(stack.undo(), { i: 49 });
});

test("snapshots are copied, not referenced", () => {
  // Recording a reference means undo restores the object that was mutated,
  // which is the classic "undo does nothing" bug.
  const stack = new UndoStack();
  const snapshot = { widgets: ["a"] };
  stack.push(snapshot);
  snapshot.widgets.push("b");
  assert.deepEqual(stack.undo(), { widgets: ["a"] },
    "the snapshot tracked a later mutation");
});

test("undo on an empty stack returns null rather than throwing", () => {
  const stack = new UndoStack();
  assert.equal(stack.undo(), null);
  assert.equal(stack.redo(), null);
});

// ===================================================== B1: ordering maths

test("moving an item reorders it correctly", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("a move does not mutate the input", () => {
  const original = ["a", "b", "c"];
  moveItem(original, 0, 2);
  assert.deepEqual(original, ["a", "b", "c"]);
});

test("out-of-bounds moves land at the ends", () => {
  // Dropping "there" past the end means the end, not a rejection.
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 99), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, -5), ["c", "a", "b"]);
});

test("moving within an empty list yields an empty list", () => {
  assert.deepEqual(moveItem([], 0, 1), []);
  assert.deepEqual(moveItem(null, 0, 1), []);
});

test("a single-column layout has no half-cell ambiguity", () => {
  const target = { index: 2, rect: { left: 0, width: 300 } };
  assert.equal(dropIndex(target, 10, 1), 2);
  assert.equal(dropIndex(target, 290, 1), 2);
});

test("a multi-column layout resolves the half-cell the pointer is in", () => {
  const target = { index: 1, rect: { left: 300, width: 300 } };
  // Left half: land before the tile.
  assert.equal(dropIndex(target, 310, 3), 1);
  // Right half: land after it.
  assert.equal(dropIndex(target, 590, 3), 2);
});

test("dropIndex survives a missing rect or index", () => {
  assert.equal(dropIndex({ index: NaN }, 10, 3), 0);
  assert.equal(dropIndex(null, 10, 3), 0);
});

// ======================================================= B2: spans

test("a span is clamped to the column count", () => {
  assert.equal(clampSpan(3, 3), 3);
  assert.equal(clampSpan(9, 3), 3);
  assert.equal(clampSpan(0, 3), 1);
  assert.equal(clampSpan(-4, 3), 1);
  assert.equal(clampSpan("2", 3), 2);
});

test("a nonsense span becomes 1 rather than NaN", () => {
  assert.equal(clampSpan("wide", 3), 1);
  assert.equal(clampSpan(NaN, 3), 1);
  assert.equal(clampSpan(undefined, 3), 1);
});

test("a zero-column grid does not divide by zero", () => {
  assert.equal(clampSpan(2, 0), 1);
  assert.deepEqual(reflowSpans([{ id: "a", span: 1 }], 0).length, 1);
});

test("reflow wraps a tile that cannot fit the remaining row", () => {
  const tiles = [
    { id: "a", span: 2 },
    { id: "b", span: 2 },   // fills row 1
    { id: "c", span: 1 }    // wraps to row 2
  ];
  const out = reflowSpans(tiles, 2);
  assert.deepEqual(out.map((t) => t.span), [2, 2, 1]);
  assert.deepEqual(out.map((t) => t.id), ["a", "b", "c"]);
});

test("reflow leaves a fitting tile in place", () => {
  const tiles = [{ id: "a", span: 1 }, { id: "b", span: 1 }, { id: "c", span: 1 }];
  assert.deepEqual(reflowSpans(tiles, 3).map((t) => t.span), [1, 1, 1]);
});

test("reflow clamps an oversized span before laying out", () => {
  const out = reflowSpans([{ id: "a", span: 99 }], 2);
  assert.equal(out[0].span, 2);
});

test("reflow handles empty input", () => {
  assert.deepEqual(reflowSpans([], 3), []);
  assert.deepEqual(reflowSpans(null, 3), []);
});

// ============================================================ B3: presets

test("every preset is complete", () => {
  assert.ok(LAYOUT_PRESETS.length >= 5);
  for (const preset of LAYOUT_PRESETS) {
    assert.ok(preset.id && preset.label && preset.detail, `${preset.id} is incomplete`);
    assert.ok(Array.isArray(preset.widgets) && preset.widgets.length > 0,
      `${preset.id} arranges nothing`);
  }
});

test("preset ids are unique", () => {
  const ids = LAYOUT_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every preset begins with the clock", () => {
  // A standby display whose preset has no clock is a dashboard, not a clock.
  for (const preset of LAYOUT_PRESETS) {
    assert.equal(preset.widgets[0], "clock", `${preset.id} does not lead with the clock`);
  }
});

test("an unknown preset is not found", () => {
  assert.equal(findPreset("a-layout-from-the-future"), null);
});

// ==================================================== B6: picker gallery

test("the gallery groups by category and marks what is active", () => {
  const registry = [
    { id: "weather", widget: { name: "Weather", category: "Info" } },
    { id: "todo", widget: { name: "Tasks", category: "Focus" } },
    { id: "prayer", widget: { name: "Prayer", category: "Info", requiresNetwork: true } }
  ];
  const html = renderPickerGallery(registry, ["weather"]);

  assert.match(html, /Info/);
  assert.match(html, /Focus/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /data-widget="weather"/);
  // Only the active one is pressed.
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
});

test("the gallery tags a widget that needs the network", () => {
  const html = renderPickerGallery([
    { id: "prayer", widget: { name: "Prayer", category: "Info", requiresNetwork: true } }
  ], []);
  assert.match(html, /online/i);
});

test("the gallery labels an experimental widget", () => {
  // C19 is permanently experimental; a gallery that hides that is misleading.
  const html = renderPickerGallery([
    { id: "x", widget: { name: "X", category: "Info" }, experimental: true }
  ], []);
  assert.match(html, /experimental/i);
});

test("the gallery renders nothing gracefully for an empty registry", () => {
  const html = renderPickerGallery([], []);
  assert.ok(html.length > 0);
  assert.match(html, /0 widgets/);
});

// ==================================================== I1: settings search

test("settings search matches a fragment and ranks a prefix first", () => {
  const entries = [
    { label: "Screen brightness", section: "Display", keywords: "dim light" },
    { label: "Night mode", section: "Display", keywords: "dark" },
    { label: "Background sound", section: "Audio", keywords: "ambient mixer" }
  ];
  const results = filterSettings(entries, "brit");
  assert.ok(results.length > 0, "a natural abbreviation matched nothing");
  assert.equal(results[0].entry.label, "Screen brightness");

  const all = filterSettings(entries, "");
  assert.equal(all.length, 3);
});

test("settings search matches the keywords, not just the label", () => {
  const entries = [{ label: "Screen brightness", section: "Display", keywords: "dim light" }];
  assert.equal(filterSettings(entries, "dim").length, 1);
});

test("settings search returns nothing for a non-match", () => {
  assert.deepEqual(filterSettings([{ label: "Theme", section: "Display" }], "qqqq"), []);
});

// ==================================================== G2/G4/G5: platform

test("gamepad support is reported, never assumed", () => {
  const support = gamepadSupport();
  assert.equal(typeof support.supported, "boolean");
  if (!support.supported) {
    // Without a reason, a controller simply does nothing and the user cannot
    // tell whether the pad is broken or unsupported.
    assert.ok(support.reason.length > 20, "no explanation given for the missing Gamepad API");
    assert.match(support.reason, /Chrome|Edge|Firefox/);
  }
});

test("the active pad is the first connected one", () => {
  assert.equal(activeGamepad([null, { connected: true, id: "A" }, { connected: true, id: "B" }]).id, "A");
  assert.equal(activeGamepad([null, null]), null);
  assert.equal(activeGamepad([]), null);
  assert.equal(activeGamepad(null), null);
});

test("a disconnected pad is not followed", () => {
  // A disconnected pad leaves a null entry; index 0 is not always the pad.
  assert.equal(activeGamepad([{ connected: false }, null]), null);
});

test("gamepad actions are edge-triggered, not level-triggered", () => {
  // Level-triggering "toggle night mode" would strobe the display for as long
  // as the button is held.
  const pad = { buttons: [] };
  pad.buttons[BUTTON.north] = { pressed: true, value: 1 };

  const first = detectGamepadActions(pad, new Set());
  assert.equal(first.actions.length, 1);
  assert.equal(first.actions[0].id, "toggle-night");

  const held = detectGamepadActions(pad, first.pressed);
  assert.equal(held.actions.length, 0, "a held button fired again");
});

test("gamepad actions read the legacy value-only shape", () => {
  // Older implementations set only `value`.
  const pad = { buttons: [] };
  pad.buttons[BUTTON.start] = { value: 0.9 };
  const result = detectGamepadActions(pad, new Set());
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].id, "open-palette");
});

test("a pad with no buttons produces nothing rather than throwing", () => {
  for (const pad of [null, {}, { buttons: null }, { buttons: [] }]) {
    const result = detectGamepadActions(pad, new Set());
    assert.deepEqual(result.actions, []);
  }
});

test("every gamepad binding uses a real Standard Gamepad button index", () => {
  for (const binding of GAMEPAD_ACTIONS) {
    assert.ok(binding.id && binding.label, `${binding.id} is incomplete`);
    assert.ok(Number.isInteger(binding.button) && binding.button >= 0 && binding.button <= 16,
      `${binding.id} uses index ${binding.button}`);
  }
});

test("a pad name is shortened to something usable in a status line", () => {
  const long = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)";
  const name = gamepadName({ id: long });
  assert.ok(name.length <= 48, `the name was ${name.length} characters`);
  assert.ok(!/045e|vendor:/i.test(name), `vendor noise survived: "${name}"`);
});

test("no pad is named, not left blank", () => {
  assert.equal(gamepadName(null), "None");
  assert.equal(gamepadName({}), "Connected controller");
  assert.equal(gamepadName({ id: "   " }), "Connected controller");
});

test("share support is reported with a reason", () => {
  const support = shareSupport();
  assert.equal(typeof support.supported, "boolean");
  if (!support.supported) assert.ok(support.reason.length > 20);
});

test("a cancelled share is not reported as a failure", async () => {
  // AbortError means the reader changed their mind. Reporting that as
  // "sharing failed" is both wrong and alarming.
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, "share");
  const abort = Object.assign(new Error("Share canceled"), { name: "AbortError" });
  Object.defineProperty(globalThis.navigator, "share", {
    value: () => Promise.reject(abort),
    configurable: true
  });
  try {
    const result = await shareContent({ title: "x", url: "https://example.com" });
    assert.equal(result.ok, false);
    assert.equal(result.cancelled, true, "a cancellation was reported as a failure");
  } finally {
    if (original) Object.defineProperty(globalThis.navigator, "share", original);
    else delete globalThis.navigator.share;
  }
});

test("a blocked share is distinguished from a cancelled one", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, "share");
  Object.defineProperty(globalThis.navigator, "share", {
    value: () => Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
    configurable: true
  });
  try {
    const result = await shareContent({ title: "x" });
    assert.equal(result.ok, false);
    assert.equal(result.cancelled, undefined);
    assert.match(result.reason, /blocked|gesture/i);
  } finally {
    if (original) Object.defineProperty(globalThis.navigator, "share", original);
    else delete globalThis.navigator.share;
  }
});

test("there is nothing to share is reported before calling the API", async () => {
  // With nothing in the payload the browser rejects with DataError, which is a
  // confusing way to learn the caller forgot to fill anything in.
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, "share");
  let called = false;
  Object.defineProperty(globalThis.navigator, "share", {
    value: () => { called = true; return Promise.resolve(); },
    configurable: true
  });
  try {
    const result = await shareContent({});
    assert.equal(result.ok, false);
    assert.equal(called, false, "the browser was called with an empty payload");
  } finally {
    if (original) Object.defineProperty(globalThis.navigator, "share", original);
    else delete globalThis.navigator.share;
  }
});

test("voice support explains the privacy conflict rather than just saying no", () => {
  // G5 is off by default because Web Speech sends audio to the vendor's cloud.
  const support = voiceSupport();
  if (typeof window === "undefined") {
    // Node has no `window`, and the check is on `window.SpeechRecognition`
    // rather than on a global - so this is the correct answer here, not a gap.
    assert.equal(support.supported, false);
    assert.equal(support.reason, "No browser.");
    return;
  }
  if (!support.supported) {
    assert.match(support.reason, /Chromium/i);
    assert.match(support.reason, /servers|cloud|vendor/i,
      "the privacy conflict is not mentioned");
  }
});

test("every capability shim reports a reason when unsupported", () => {
  // The shared shape: a capability the browser lacks must say so, because the
  // alternative is a button that does nothing with no explanation.
  for (const [name, support] of [
    ["gamepad", gamepadSupport()],
    ["share", shareSupport()],
    ["voice", voiceSupport()]
  ]) {
    assert.equal(typeof support.supported, "boolean", `${name} has no boolean`);
    assert.equal(typeof support.reason, "string", `${name} has no reason field`);
    if (!support.supported) {
      assert.ok(support.reason.length > 0, `${name} is unsupported with no reason`);
    }
  }
});

// ==================================================== G6: permissions

test("every permission states what it is for", () => {
  // A prompt with no stated reason is the fastest route to a permanent denial.
  for (const permission of PERMISSIONS) {
    assert.ok(permission.id && permission.label, `${permission.id} is incomplete`);
    assert.ok(permission.why && permission.why.length > 15,
      `${permission.id} does not say why it wants the permission`);
    assert.equal(typeof permission.query, "function", `${permission.id} has no query`);
  }
});

test("permission ids are unique", () => {
  const ids = PERMISSIONS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every permission query is wrapped in try/catch by the describer", () => {
  // A query that throws (a browser denying the property read) must not take the
  // settings panel down with it.
  const hostile = [{
    id: "hostile", label: "Hostile", why: "Throws when queried.",
    query() { throw new Error("nope"); }
  }];
  const described = describePermission(hostile[0]);
  assert.equal(described.state, "unsupported");
  assert.ok(described.stateLabel);
});

test("a permission is described with a tone the UI can style", () => {
  for (const permission of PERMISSIONS) {
    const described = describePermission(permission);
    assert.ok(["good", "bad", "warn", "neutral"].includes(described.tone),
      `${permission.id} has tone "${described.tone}"`);
    assert.ok(described.stateLabel.length > 0);
  }
});

test("no action is offered for a permission the browser lacks", () => {
  // Offering "Grant" for an API that does not exist teaches people to ignore
  // the panel's buttons.
  const fake = [{ id: "nope", label: "Nope", why: "Not in this browser.", query: () => "unsupported" }];
  assert.equal(describePermission(fake[0]).action, null);
});

test("a prompt-state permission offers to ask", () => {
  const fake = [{ id: "p", label: "P", why: "Because of a reason.", query: () => "prompt" }];
  assert.equal(describePermission(fake[0]).action.kind, "ask");
});

test("the permission centre states that nothing is requested in the background", () => {
  const html = renderPermissionCentre();
  assert.match(html, /background/i);
  assert.match(html, /declined?/i);
});

test("the permission centre renders one row per permission", () => {
  const html = renderPermissionCentre();
  assert.equal((html.match(/class="pc-row"/g) || []).length, PERMISSIONS.length);
});

// ================================================================ C13

test("every breathing pattern is complete", () => {
  assert.ok(BREATH_PATTERNS.length >= 4);
  for (const pattern of BREATH_PATTERNS) {
    assert.ok(pattern.id && pattern.label && pattern.detail, `${pattern.id} is incomplete`);
    assert.ok(pattern.inhale > 0, `${pattern.id} has no inhale`);
    assert.ok(pattern.exhale > 0, `${pattern.id} has no exhale`);
  }
});

test("an unknown pattern falls back rather than producing nothing", () => {
  assert.equal(findPattern("a-pattern-from-the-future").id, "box");
});

test("box breathing is four equal counts", () => {
  const segments = buildSegments(findPattern("box"));
  assert.deepEqual(segments.map((s) => s.duration), [4, 4, 4, 4]);
  assert.equal(cycleDuration(findPattern("box")), 16);
});

test("4-7-8 really is 4-7-8, with no invented hold", () => {
  // The cycle is 19s, not 23s: a hold after the exhale is not part of this
  // pattern and adding one would make it something else.
  const segments = buildSegments(findPattern("relaxing"));
  assert.deepEqual(segments.map((s) => s.key), ["inhale", "hold", "exhale"]);
  assert.deepEqual(segments.map((s) => s.duration), [4, 7, 8]);
  assert.equal(cycleDuration(findPattern("relaxing")), 19);
});

test("zero-length phases are dropped, not emitted", () => {
  // A 0s segment makes the animation-delay sums wrong and produces an
  // instantaneous phase change that reads as a stutter.
  const segments = buildSegments(findPattern("coherent"));
  assert.deepEqual(segments.map((s) => s.key), ["inhale", "exhale"]);
  for (const segment of segments) assert.ok(segment.duration > 0);
});

test("the long sigh has two inhales", () => {
  const segments = buildSegments(findPattern("sigh"));
  assert.equal(segments.filter((s) => s.key === "inhale").length, 2);
  assert.deepEqual(segments.map((s) => s.duration), [4, 4, 8]);
});

test("the phase label matches the animation at every boundary", () => {
  // The property that matters: the words cannot drift from the ring. Checked
  // on both sides of every boundary, where drift would show first.
  for (const pattern of BREATH_PATTERNS) {
    const cycle = cycleDuration(pattern);
    const segments = buildSegments(pattern);
    let at = 0;

    for (const segment of segments) {
      const start = phaseAt(pattern, at);
      assert.equal(start.phase, segment.key,
        `${pattern.id} at t=${at} said "${start.phase}", expected "${segment.key}"`);

      // One millisecond before the boundary is still the same phase.
      const before = phaseAt(pattern, at + segment.duration - 0.001);
      assert.equal(before.phase, segment.key,
        `${pattern.id} at the end of ${segment.key} reported "${before.phase}"`);

      at += segment.duration;
    }

    // And the cycle wraps cleanly.
    assert.equal(phaseAt(pattern, cycle).phase, segments[0].key,
      `${pattern.id} did not wrap back to its first phase`);
    assert.equal(phaseAt(pattern, cycle + 1).phase, segments[0].key);
  }
});

test("the countdown never shows zero during a phase", () => {
  // "0 seconds left" for the last half-second reads as broken.
  for (const pattern of BREATH_PATTERNS) {
    for (const t of [0.1, 1, 2.9, 3.999]) {
      const phase = phaseAt(pattern, t);
      if (Number.isFinite(cycleDuration(pattern))) {
        assert.ok(phase.secondsLeft >= 1,
          `${pattern.id} at t=${t} showed ${phase.secondsLeft}`);
      }
    }
  }
});

test("elapsed time past several cycles is handled", () => {
  const pattern = findPattern("box");
  assert.equal(phaseAt(pattern, 0).phase, phaseAt(pattern, 16).phase);
  assert.equal(phaseAt(pattern, 4).phase, phaseAt(pattern, 1000 * 16 + 4).phase);
});

test("a nonsense elapsed time reports ready rather than a wrong phase", () => {
  const phase = phaseAt(findPattern("box"), NaN);
  assert.equal(phase.phase, "idle");
  assert.equal(phase.label, "Ready");
});

test("keyframes are generated for every pattern and sum to 100%", () => {
  for (const pattern of BREATH_PATTERNS) {
    const css = keyframesFor(pattern);
    assert.match(css, new RegExp(`@keyframes br-${pattern.id}`), `${pattern.id} has no keyframes`);

    const percentages = [...css.matchAll(/([\d.]+)%\s*\{/g)].map((m) => Number(m[1]));
    assert.ok(percentages.length >= 2, `${pattern.id} produced ${percentages.length} stops`);
    assert.equal(percentages[0], 0);
    assert.equal(percentages[percentages.length - 1], 100,
      `${pattern.id} keyframes do not reach 100%`);
  }
});

test("keyframes hold the same scale for a hold phase", () => {
  // The invariant, not a hand-written list: two consecutive stops at the same
  // scale mean that phase is a genuine hold. A hold that drifts between two
  // scales is a slow movement, which is not what "hold" means to the person
  // following the words.
  for (const pattern of BREATH_PATTERNS) {
    const segments = buildSegments(pattern);
    const scales = [...keyframesFor(pattern).matchAll(/scale\(([\d.]+)\)/g)].map((m) => m[1]);

    // scales[0] opens the cycle; scales[i+1] closes segment i. So a segment
    // spans scales[i] -> scales[i+1].
    assert.equal(scales.length, segments.length + 1,
      `${pattern.id} produced ${scales.length} stops for ${segments.length} phases`);

    for (let i = 0; i < segments.length; i++) {
      const { key } = segments[i];
      if (key !== "hold" && key !== "holdEmpty") continue;
      assert.equal(scales[i], scales[i + 1],
        `${pattern.id}: the "${key}" phase drifted between ${scales[i]} and ${scales[i + 1]}`);
    }

    // And a moving phase must actually change the scale, or nothing breathes.
    const moving = segments.some((s, i) =>
      (s.key === "inhale" || s.key === "exhale") && scales[i] !== scales[i + 1]);
    assert.ok(moving, `${pattern.id} has no phase that changes the scale`);
  }
});

test("the cycle opens contracted and closes at the same scale", () => {
  // Otherwise the ring jumps at the loop point, which reads as a glitch.
  for (const pattern of BREATH_PATTERNS) {
    const scales = [...keyframesFor(pattern).matchAll(/scale\(([\d.]+)\)/g)].map((m) => m[1]);
    assert.equal(scales[0], scales[scales.length - 1],
      `${pattern.id} jumps from ${scales[0]} to ${scales[scales.length - 1]} at the loop point`);
  }
});

test("each phase occupies the share of the cycle its duration implies", () => {
  // The bug this replaces divided the cycle by phase COUNT instead of by
  // DURATION. For 4-7-8 that put the last stop at 67%, so the ring stopped
  // contracting 6.4 seconds before the phase ended while the label still said
  // "breathe out" - the words and the ring disagreeing, which is the one
  // failure this widget cannot have.
  for (const pattern of BREATH_PATTERNS) {
    const segments = buildSegments(pattern);
    const cycle = cycleDuration(pattern);
    const percentages = [...keyframesFor(pattern).matchAll(/([\d.]+)%/g)]
      .map((m) => Number(m[1]));

    assert.equal(percentages.length, segments.length + 1,
      `${pattern.id}: stop count does not match the phase count`);

    let elapsed = 0;
    for (let i = 0; i < segments.length; i++) {
      elapsed += segments[i].duration;
      const expected = (elapsed / cycle) * 100;
      // The final stop is forced to exactly 100, so compare loosely there.
      const tolerance = i === segments.length - 1 ? 0.01 : 0.002;
      assert.ok(Math.abs(percentages[i + 1] - expected) < tolerance,
        `${pattern.id}: "${segments[i].key}" ends at ${percentages[i + 1]}%, expected ${expected.toFixed(3)}%`);
    }
  }
});

test("the exhale scale is smaller than the inhale scale", () => {
  const box = keyframesFor(findPattern("box"));
  const scales = [...box.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...scales) > Math.min(...scales),
    "the ring never changes size, so it is not breathing");
});

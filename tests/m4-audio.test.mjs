/* StandBy Mode Pro - Milestone 4 tests, part 1
 *
 * Run with: node --test tests/m4-audio.test.mjs
 *
 * Covers the pure logic behind E1 (ambience catalogue), E2 (mixer), E3 (sleep
 * timer), F2 (dimming) and F5 (kiosk). All of it is deliberately DOM-free: the
 * Web Audio graph, the CSS custom properties and the class toggles are verified
 * in the browser, and what is testable without one is tested here.
 *
 * The theme running through the file: three of these features have a specific,
 * identifiable way to be wrong that no amount of "does the slider move" testing
 * would catch. Each is pinned below where it matters.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  AMBIENCES,
  AMBIENCE_IDS,
  AMBIENCE_GROUPS,
  MIX_PRESETS,
  findAmbience,
  isKnownAmbience,
  clampMix,
  defaultMixFor,
  normalizeMix,
  activeLayers,
  groupLabel,
  headphoneWarnings,
  findPreset
} from "../js/core/ambiences.js";

import {
  brightnessVars,
  isNearZero,
  containsMinutes,
  parseHhMm,
  describeBrightness,
  DIM_MIN,
  NEAR_ZERO_THRESHOLD,
  DIM_PRESETS
} from "../js/components/dimmingController.js";

import {
  holdProgress,
  KIOSK_DISCLOSURE,
  HOLD_MS,
  IDLE_MS
} from "../js/features/kioskMode.js";

import {
  wakeLockStatus,
  wakeLockSupport,
  FAILURES_BEFORE_WARNING
} from "../js/engines/wakeLockResilience.js";

// ========================================================== E1: the catalogue

test("every ambience has the fields the UI renders", () => {
  for (const a of AMBIENCES) {
    assert.ok(a.id && /^[a-z][a-z0-9]*$/.test(a.id), `${a.id} is not a slug`);
    assert.ok(a.label && a.label.length > 0, `${a.id} has no label`);
    assert.ok(a.description && a.description.length > 10, `${a.id} needs a real description`);
    assert.equal(typeof a.defaultMix, "number", `${a.id} defaultMix is not a number`);
    assert.ok(a.defaultMix > 0 && a.defaultMix <= 1, `${a.id} defaultMix ${a.defaultMix} out of range`);
  }
});

test("ambience ids are unique and lowercase-slug shaped", () => {
  assert.equal(new Set(AMBIENCE_IDS).size, AMBIENCE_IDS.length, "duplicate ambience id");
  for (const id of AMBIENCE_IDS) {
    assert.match(id, /^[a-z][a-z0-9]*$/, `"${id}" is not a slug`);
  }
});

test("every ambience belongs to a group the picker offers", () => {
  const groups = new Set(AMBIENCE_GROUPS.map((g) => g.id));
  for (const a of AMBIENCES) {
    assert.ok(groups.has(a.group),
      `${a.id} is in group "${a.group}", which no group label covers`);
  }
});

test("every group has at least one ambience and a label", () => {
  for (const group of AMBIENCE_GROUPS) {
    assert.ok(group.label && group.label.length > 0, `group ${group.id} has no label`);
    const members = AMBIENCES.filter((a) => a.group === group.id);
    assert.ok(members.length > 0, `group ${group.id} would render as an empty fieldset`);
  }
});

test("E1 shipped the seven new vibes the plan names", () => {
  // FEATURE_PLAN E1 lists: cafe, forest, brown noise, brown-noise-plus, wind,
  // thunderstorm, vinyl crackle.
  const required = ["cafe", "forest", "brownnoise", "brownnoiseplus", "wind", "thunderstorm", "vinyl"];
  for (const id of required) {
    assert.ok(isKnownAmbience(id), `E1 requires "${id}" and it is missing`);
  }
});

test("the pre-E2 ambiences all survived", () => {
  // The engine previously dispatched on exactly these five. Losing one would be
  // a silent regression for anyone whose space already referenced it.
  for (const id of ["rain", "waves", "fire", "binaural", "noise"]) {
    assert.ok(isKnownAmbience(id), `pre-existing ambience "${id}" was dropped`);
  }
});

test("only binaural is flagged as needing headphones", () => {
  const flagged = AMBIENCES.filter((a) => a.requiresHeadphones).map((a) => a.id);
  assert.deepEqual(flagged, ["binaural"],
    "only the interaural beat depends on headphones; over-flagging trains people to ignore it");
});

test("findAmbience returns null rather than throwing for junk", () => {
  assert.equal(findAmbience("nope"), null);
  assert.equal(findAmbience(null), null);
  assert.equal(findAmbience(undefined), null);
  assert.equal(findAmbience(""), null);
  assert.ok(findAmbience("rain"));
});

test("groupLabel falls back rather than returning undefined", () => {
  assert.equal(groupLabel("masker"), "Masks sound");
  assert.equal(groupLabel("weird"), "weird");
  assert.equal(groupLabel(null), "Other");
});

// ========================================================== E2: mix handling

test("clampMix clamps to 0..1 and rejects junk", () => {
  assert.equal(clampMix(0.5), 0.5);
  assert.equal(clampMix(-1), 0);
  assert.equal(clampMix(5), 1);
  // A range input yields a string; that is not an error.
  assert.equal(clampMix("0.75"), 0.75);
  // NaN falls back rather than becoming 0 - silence from a typo is the
  // worse failure, because it looks like a deliberate choice.
  assert.equal(clampMix("abc", 0.4), 0.4);
  assert.equal(clampMix(NaN, 0.4), 0.4);
  assert.equal(clampMix(null, 0.4), 0.4);
  assert.equal(clampMix(undefined, 0.3), 0.3);
});

test("defaultMixFor covers every ambience so every row renders", () => {
  const mix = defaultMixFor(["rain"]);
  for (const id of AMBIENCE_IDS) {
    assert.ok(typeof mix[id] === "number", `${id} has no row in the default mix`);
  }
  // The argument wins, so a caller cannot get a default that contradicts the
  // catalogue.
  assert.equal(mix.rain, findAmbience("rain").defaultMix);
});

test("normalizeMix drops unknown ids and backfills missing ones", () => {
  // The two halves of "a catalogue changed under a saved mix".
  const mix = normalizeMix({ rain: 0.6, aRemovedAmbience: 0.9, cafe: 2 });
  assert.ok(!("aRemovedAmbience" in mix), "an unknown id must not leave a dead slider");
  assert.equal(mix.rain, 0.6);
  assert.equal(mix.cafe, 1, "an out-of-range stored value is clamped, not trusted");
  assert.ok(typeof mix.fire === "number", "a missing id is backfilled with its default");
});

test("normalizeMix survives every shape of stored junk", () => {
  for (const junk of [null, undefined, 42, "rain", [], [1, 2, 3]]) {
    const mix = normalizeMix(junk);
    assert.ok(mix && typeof mix === "object");
    for (const id of AMBIENCE_IDS) {
      assert.ok(typeof mix[id] === "number", `${id} missing after normalizing ${JSON.stringify(junk)}`);
    }
  }
});

test("activeLayers treats zero as off, which is not the same as quiet", () => {
  const mix = { rain: 0.4, waves: 0, fire: 0.001, cafe: 0.5 };
  const active = activeLayers(mix);
  assert.ok(active.includes("rain"));
  assert.ok(active.includes("cafe"));
  assert.ok(!active.includes("waves"), "an exact zero must not keep a layer running");
  assert.ok(!active.includes("fire"), "0.001 is below the audible threshold");
});

test("activeLayers of an empty mix is empty, not everything", () => {
  assert.deepEqual(activeLayers({}), []);
  assert.deepEqual(activeLayers(null), []);
});

test("headphone warnings name the layer", () => {
  const warnings = headphoneWarnings(["binaural", "rain"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /headphones/i);
  assert.match(warnings[0], /Binaural/);
  assert.deepEqual(headphoneWarnings(["rain"]), []);
  assert.deepEqual(headphoneWarnings([]), []);
});

test("every preset references only real ambiences", () => {
  for (const preset of MIX_PRESETS) {
    assert.ok(preset.label && preset.detail, `preset ${preset.id} is missing copy`);
    for (const layer of preset.layers) {
      assert.ok(isKnownAmbience(layer),
        `preset "${preset.id}" references unknown ambience "${layer}"`);
    }
    // The point of a preset is a mixture.
    assert.equal(new Set(preset.layers).size, preset.layers.length,
      `preset "${preset.id}" lists a layer twice`);
  }
});

test("there is a silence preset and a findPreset that degrades", () => {
  assert.ok(MIX_PRESETS.some((p) => p.layers.length === 0), "no way to stop everything from the mixer");
  assert.equal(findPreset("sleep").id, "sleep");
  assert.equal(findPreset("nope"), null);
});

// ================================================= F2: brightness, and the floor

test("brightness reaches zero - the plan's hard requirement", () => {
  // "Must reach near-zero without a UI-imposed floor." The exact bug this
  // feature exists to fix is a display that "snaps back up to some weird
  // minimal value", which is what a floor anywhere in the chain produces.
  assert.equal(DIM_MIN, 0, "the slider minimum must be zero");
  assert.equal(brightnessVars(0).brightness, "0.000");
  assert.equal(brightnessVars(0).level, "0.000");
});

test("no brightness value is silently clamped upward", () => {
  // If this ever returns a value above the request, the UI would show 0%
  // while the display sat brighter - precisely the reviewed complaint.
  for (let level = 0; level <= 1.0001; level += 0.05) {
    const vars = brightnessVars(level);
    const applied = Number(vars.brightness);
    assert.ok(applied <= level + 1e-9,
      `level ${level.toFixed(2)} was rendered as ${vars.brightness}`);
  }
});

test("the whole 0..1 range is honoured monotonically", () => {
  let previous = Infinity;
  for (const level of [1, 0.6, 0.3, 0.12, 0.04, 0]) {
    const applied = Number(brightnessVars(level).brightness);
    assert.ok(applied <= previous, `brightness rose from ${level}`);
    previous = applied;
  }
});

test("near-zero mode switches on below the threshold", () => {
  assert.equal(brightnessVars(1).lowMode, "0");
  assert.equal(brightnessVars(0.5).lowMode, "0");
  assert.equal(brightnessVars(NEAR_ZERO_THRESHOLD).lowMode, "1", "the threshold is inclusive");
  assert.equal(brightnessVars(NEAR_ZERO_THRESHOLD + 0.01).lowMode, "0");
});

test("isNearZero agrees with the CSS threshold", () => {
  // These two must not drift, or the class and the copy disagree.
  for (const level of [0, 0.01, 0.1, 0.12, 0.13, 0.5, 1]) {
    assert.equal(isNearZero(level), brightnessVars(level).lowMode === "1",
      `level ${level}: isNearZero and brightnessVars disagree`);
  }
});

test("brightnessVars survives junk by falling back to full", () => {
  // Not to zero: a corrupted preference must not black out the display, which
  // on a clock is indistinguishable from a crash.
  for (const junk of [NaN, null, undefined, "abc", {}]) {
    assert.equal(brightnessVars(junk).brightness, "1.000", `${junk} did not fall back to full`);
  }
});

test("brightnessVars clamps above 1 rather than over-brightening", () => {
  assert.equal(brightnessVars(5).brightness, "1.000");
  assert.equal(brightnessVars(-3).brightness, "0.000");
});

test("the presets descend to the floor", () => {
  const levels = DIM_PRESETS.map((p) => p.level);
  assert.equal(Math.min(...levels), 0, "no preset offers the lowest brightness");
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i] < levels[i - 1], "presets must descend in brightness");
  }
  // "Night" must be dimmer than "Full" by a real margin, not by a rounding
  // step - this is the whole feature.
  const full = DIM_PRESETS.find((p) => p.id === "full");
  const night = DIM_PRESETS.find((p) => p.id === "night");
  assert.ok(night.level <= 0.15 && full.level === 1);
});

test("describeBrightness distinguishes off from merely dim", () => {
  // "4%" and "0%" look identical to a reader and are not the same state.
  assert.match(describeBrightness(0), /Off/i);
  assert.match(describeBrightness(0.04), /low-brightness/i);
  assert.match(describeBrightness(0.5), /^50%$/);
  assert.match(describeBrightness(1), /Full/i);
  assert.equal(describeBrightness(NaN), "—");
});

// ============================================== F2/F1: the schedule, incl. midnight

test("parseHhMm reads a wall clock and rejects nonsense", () => {
  assert.equal(parseHhMm("00:00"), 0);
  assert.equal(parseHhMm("9:05"), 545);
  assert.equal(parseHhMm("23:59"), 1439);
  for (const bad of ["24:00", "12:60", "1230", "", null, "ab:cd"]) {
    assert.equal(parseHhMm(bad), null, `"${bad}" should not parse`);
  }
});

test("a daytime range matches only inside itself", () => {
  const range = { from: "09:00", to: "17:00" };
  assert.equal(containsMinutes(range, 9 * 60), true, "the start is inclusive");
  assert.equal(containsMinutes(range, 16 * 60 + 59), true);
  assert.equal(containsMinutes(range, 17 * 60), false, "the end is exclusive");
  assert.equal(containsMinutes(range, 8 * 60 + 59), false);
  assert.equal(containsMinutes(range, 23 * 60), false);
});

test("a range that wraps midnight matches overnight - the case that matters", () => {
  // Every night schedule wraps. The naive `from <= m && m <= to` test never
  // matches between 23:00 and 06:00, so night mode would silently never turn
  // on - a bug with no visible symptom other than the feature not working.
  const range = { from: "23:00", to: "06:00" };
  assert.equal(containsMinutes(range, 23 * 60), true, "23:00");
  assert.equal(containsMinutes(range, 23 * 60 + 59), true, "23:59");
  assert.equal(containsMinutes(range, 0), true, "00:00 - past midnight");
  assert.equal(containsMinutes(range, 3 * 60 + 30), true, "03:30");
  assert.equal(containsMinutes(range, 5 * 60 + 59), true, "05:59");
  assert.equal(containsMinutes(range, 6 * 60), false, "06:00 is the end, exclusive");
  assert.equal(containsMinutes(range, 12 * 60), false, "midday");
});

test("a range spanning a single midnight minute still works", () => {
  const range = { from: "23:59", to: "00:00" };
  assert.equal(containsMinutes(range, 23 * 60 + 59), true);
  assert.equal(containsMinutes(range, 0), false, "the end is exclusive");
});

test("a zero-width range matches nothing, rather than everything", () => {
  // from === to is a configuration mistake. Matching all 1440 minutes would
  // leave the display permanently dimmed with no way to see why.
  const range = { from: "03:00", to: "03:00" };
  assert.equal(containsMinutes(range, 3 * 60), false);
  assert.equal(containsMinutes(range, 12 * 60), false);
});

test("a malformed range never matches", () => {
  assert.equal(containsMinutes({ from: "nope", to: "06:00" }, 600), false);
  assert.equal(containsMinutes({ from: "23:00" }, 600), false);
  assert.equal(containsMinutes(null, 600), false);
  assert.equal(containsMinutes({ from: "00:00", to: "06:00" }, NaN), false);
});

// ============================================================== F5: kiosk mode

test("the hold must be held - a tap must not reveal the screen", () => {
  // A click handler would fire on a brush of the screen while someone reaches
  // for something, which is exactly the accidental reveal this prevents.
  assert.equal(holdProgress(0).revealed, false);
  assert.equal(holdProgress(50).revealed, false);
  assert.equal(holdProgress(HOLD_MS - 1).revealed, false, "one millisecond short must not count");
  assert.equal(holdProgress(HOLD_MS).revealed, true);
  assert.equal(holdProgress(HOLD_MS * 10).revealed, true, "over-holding must still reveal");
});

test("hold progress is monotonic and clamped", () => {
  let previous = -1;
  for (let held = 0; held <= HOLD_MS * 2; held += 50) {
    const { progress } = holdProgress(held);
    assert.ok(progress >= previous, `progress went backwards at ${held}ms`);
    assert.ok(progress >= 0 && progress <= 1, `progress ${progress} out of range`);
    previous = progress;
  }
  assert.equal(holdProgress(HOLD_MS).progress, 1);
});

test("holdProgress treats junk as not-held", () => {
  for (const junk of [NaN, null, undefined, -100, "abc"]) {
    assert.deepEqual(holdProgress(junk), { revealed: false, progress: 0 },
      `"${junk}" should be a no-op`);
  }
});

test("the kiosk disclosure says a web page cannot lock a device", () => {
  // FEATURE_PLAN F5 makes this an explicit requirement. A user who believes
  // this locks their phone is worse off than one who never enabled it,
  // because they will stop locking their phone.
  assert.match(KIOSK_DISCLOSURE, /cannot lock/i);
  assert.match(KIOSK_DISCLOSURE, /privacy/i);
  // It must not read as a security guarantee.
  assert.doesNotMatch(KIOSK_DISCLOSURE, /\b(secure|encrypted|protected)\b/i);
  assert.ok(KIOSK_DISCLOSURE.length > 100, "the disclosure must be a real explanation");
});

test("the default idle is long enough to read a clock", () => {
  assert.ok(IDLE_MS >= 60000, "blanking under a minute trains people to disable it");
});

// ============================================== F4: wake lock, honestly reported

test("the wake lock status distinguishes four states", () => {
  // The plan: "Must never pretend to hold a lock it doesn't have." Collapsing
  // these is how the original complaint survives the fix.
  const off = wakeLockStatus({ supported: true, held: false, failures: 0, wantsLock: false });
  const unsupported = wakeLockStatus({ supported: false, held: false, failures: 0, wantsLock: true });
  const held = wakeLockStatus({ supported: true, held: true, failures: 0, wantsLock: true });
  const atRisk = wakeLockStatus({ supported: true, held: false, failures: 1, wantsLock: true });
  const lost = wakeLockStatus({ supported: true, held: false, failures: 9, wantsLock: true });

  const labels = [off.label, unsupported.label, held.label, atRisk.label, lost.label];
  assert.equal(new Set(labels).size, labels.length, `two states share a label: ${labels}`);

  assert.equal(held.tone, "held");
  assert.equal(unsupported.tone, "unsupported");
  assert.equal(lost.tone, "lost");
  assert.equal(atRisk.tone, "at-risk");
});

test("an unsupported browser says so instead of retrying forever", () => {
  const status = wakeLockStatus({ supported: false, held: false, failures: 99, wantsLock: true });
  assert.equal(status.tone, "unsupported");
  assert.match(status.detail, /no Screen Wake Lock API/i);
  assert.match(status.detail, /Firefox|Safari/i, "naming the browsers makes it actionable");
});

test("a repeatedly refused lock asks the user to act", () => {
  const status = wakeLockStatus({
    supported: true, held: false, failures: FAILURES_BEFORE_WARNING, wantsLock: true
  });
  assert.equal(status.tone, "lost");
  assert.match(status.detail, /leave it open|foreground/i,
    "the message must say what the reader can do");
  assert.match(status.detail, new RegExp(String(FAILURES_BEFORE_WARNING)),
    "the message should say how many times it was refused");
});

test("a held lock is not reported as at-risk", () => {
  // The failure counter must be irrelevant once a lock is actually live.
  const status = wakeLockStatus({ supported: true, held: true, failures: 7, wantsLock: true });
  assert.equal(status.tone, "held");
});

test("keep-awake off is reported as off, not as a failure", () => {
  const status = wakeLockStatus({ supported: true, held: false, failures: 0, wantsLock: false });
  assert.equal(status.tone, "off");
  assert.match(status.detail, /screen timeout/i);
});

test("wake lock support reports a reason, never a bare false", () => {
  // "It doesn't work" with no explanation is the most common report about this.
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  const setGlobal = (key, value) =>
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  try {
    setGlobal("navigator", {});
    const none = wakeLockSupport();
    assert.equal(none.supported, false);
    assert.ok(none.reason.length > 20, "the reason must be user-readable");

    setGlobal("navigator", { wakeLock: {} });
    setGlobal("document", { visibilityState: "visible" });
    assert.equal(wakeLockSupport().supported, true);

    setGlobal("document", { visibilityState: "hidden" });
    const hidden = wakeLockSupport();
    assert.equal(hidden.supported, false);
    assert.match(hidden.reason, /visible/i);
  } finally {
    setGlobal("navigator", originalNavigator);
    setGlobal("document", originalDocument);
  }
});
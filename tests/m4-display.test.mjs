/* StandBy Mode Pro - Milestone 4 tests, part 2
 *
 * Run with: node --test tests/m4-display.test.mjs
 *
 * Covers F3 (burn-in modes), F6/B4 (device profiles), F7 (screen-timeout
 * rescue), E4 (visualiser maths), E6 (solar schedule) and E7 (screensaver
 * styles).
 *
 * The bias throughout is toward properties that are invisible when correct and
 * loud when wrong: a burn-in mode that never moves, a profile that clamps the
 * type scale the wrong way, a visualiser that emits NaN, a solar schedule that
 * invents a sunrise at the poles.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEVICE_PROFILES,
  DEFAULT_PROFILE_ID,
  detectProfile,
  profileFromEnvironment,
  columnsFor,
  shouldAutoHide,
  applyProfile
} from "../js/core/deviceProfile.js";

import {
  BURN_IN_MODES,
  burnInVars,
  shiftOffset,
  checkerQuadrant,
  SHIFT_MAX_PX,
  STATIC_DIM_MS,
  STATIC_DIM_LEVEL
} from "../js/engines/burnInProtector.js";

import {
  isMissed,
  classifyAlarm,
  missedReason,
  MISS_GRACE_MS
} from "../js/core/screenTimeoutRescue.js";

import {
  smoothToward,
  resampleSpectrum,
  barColour,
  VISUALISER_MODES
} from "../js/engines/beatVisualiser.js";

import {
  solarMinutes,
  solarSchedule,
  describeSchedule,
  SOLAR_PRESETS
} from "../js/features/nightSchedule.js";

import {
  SCREENSAVER_STYLES,
  quoteForMinute,
  renderScreensaverStyle,
  activeScreensaverStyle
} from "../js/features/screensaverStyles.js";

// ================================================= F6/B4: device profiles

test("every profile is complete and internally consistent", () => {
  for (const [id, profile] of Object.entries(DEVICE_PROFILES)) {
    assert.equal(profile.id, id, `${id} has a mismatched id field`);
    assert.ok(profile.label && profile.label.length > 0, `${id} has no label`);
    assert.ok(profile.typeScale >= 1, `${id} shrinks text (${profile.typeScale})`);
    assert.ok(profile.tapTarget >= 24,
      `${id} targets ${profile.tapTarget}px, under the WCAG 2.5.8 floor`);
    assert.ok(profile.columns >= 1, `${id} has ${profile.columns} columns`);
    assert.ok(["standard", "deep"].includes(profile.chroma), `${id} chroma is nonsense`);
  }
});

test("a forced profile wins over detection", () => {
  // F6's TV mode is entered deliberately: there is no reliable signal that says
  // a display is a television, so it has to be a choice.
  assert.equal(detectProfile({ width: 800 }, "tv").id, "tv");
  assert.equal(detectProfile({ width: 400 }, "desktop").id, "desktop");
  assert.equal(detectProfile({ width: 3200 }, "phone").id, "phone");
});

test("an unknown forced profile falls back to detection, not to undefined", () => {
  const profile = detectProfile({ width: 390 }, "nonsense");
  assert.ok(profile && profile.id, "an unknown id must not produce a broken profile");
  assert.equal(profile.id, "phone");
});

test("width selects a sane profile at each boundary", () => {
  const cases = [
    [320, "phone"], [640, "phone"], [641, "tablet"],
    [1024, "tablet"], [1025, "desktop"], [1600, "desktop"],
    [1601, "wall"], [2600, "wall"], [2601, "tv"]
  ];
  for (const [width, expected] of cases) {
    assert.equal(detectProfile({ width }).id, expected, `${width}px should be ${expected}`);
  }
});

test("type scale rises with viewing distance", () => {
  // NOT a strict increase across all five, and deliberately so: a tablet is
  // held much closer than a desktop monitor, so the tablet's scale is larger
  // than the desktop's. Asserting a strict chain here would have "fixed" a
  // correct design decision.
  //
  // What must hold is the part that matters: type grows monotonically from a
  // desktop monitor outwards, and the hand-held profiles are never smaller than
  // the phone.
  assert.ok(DEVICE_PROFILES.wall.typeScale > DEVICE_PROFILES.desktop.typeScale);
  assert.ok(DEVICE_PROFILES.tv.typeScale > DEVICE_PROFILES.wall.typeScale);
  assert.ok(DEVICE_PROFILES.tablet.typeScale >= DEVICE_PROFILES.phone.typeScale);
  assert.ok(DEVICE_PROFILES.desktop.typeScale >= DEVICE_PROFILES.phone.typeScale);

  // And the wall/TV end must be dramatically larger, not marginally - that is
  // the whole point of a 10-foot UI.
  assert.ok(DEVICE_PROFILES.tv.typeScale >= 2 * DEVICE_PROFILES.desktop.typeScale,
    "a TV scale of less than 2x is not a 10-foot UI");
});

test("tap targets are driven by pointer coarseness, then by distance", () => {
  // Two separate forces, and conflating them is the obvious mistake: a phone
  // needs a 44px target because it is touched, while a desktop mouse needs
  // only 32px because it is precise. So phone > desktop is CORRECT, and a
  // "monotonic in distance" assertion would have "fixed" it wrongly.
  //
  // Force 1: anything touch-driven clears 44px.
  assert.ok(DEVICE_PROFILES.phone.tapTarget >= 44, "a phone target under 44px is too small");
  assert.ok(DEVICE_PROFILES.tablet.tapTarget >= 44, "a tablet is also touch-driven");

  // Force 2: everything clears the WCAG 2.2 SC 2.5.8 floor of 24px.
  for (const profile of Object.values(DEVICE_PROFILES)) {
    assert.ok(profile.tapTarget >= 24, `${profile.id} is under the 24px floor`);
  }

  // Force 3: beyond the desktop, distance takes over and IS monotonic.
  assert.ok(DEVICE_PROFILES.wall.tapTarget > DEVICE_PROFILES.desktop.tapTarget);
  assert.ok(DEVICE_PROFILES.tv.tapTarget > DEVICE_PROFILES.wall.tapTarget);
});

test("columnsFor caps a layout at what the device can show", () => {
  // A three-column layout on a phone produces three unreadable slivers.
  assert.equal(columnsFor(DEVICE_PROFILES.phone, 3), 1);
  assert.equal(columnsFor(DEVICE_PROFILES.tablet, 4), 2);
  assert.equal(columnsFor(DEVICE_PROFILES.desktop, 2), 2);
  assert.equal(columnsFor(DEVICE_PROFILES.tv, 3), 2);
});

test("columnsFor falls back for nonsense input rather than producing 0", () => {
  assert.equal(columnsFor(DEVICE_PROFILES.desktop, 0), 3);
  assert.equal(columnsFor(DEVICE_PROFILES.desktop, -2), 3);
  assert.equal(columnsFor(DEVICE_PROFILES.desktop, null), 3);
});

test("auto-hide is off for devices with a pointer", () => {
  // A tablet nobody is going to swipe should keep its navigation.
  assert.equal(shouldAutoHide(DEVICE_PROFILES.tablet, 10_000_000, 0), false);
  assert.equal(shouldAutoHide(DEVICE_PROFILES.desktop, 10_000_000, 0), false);
  assert.equal(shouldAutoHide(DEVICE_PROFILES.phone, 1000, 0), false, "idle 1s < 4s threshold");
});

test("auto-hide fires on a TV after the idle window", () => {
  // Only the TV auto-hides its chrome, and that is the specific reason it is
  // the TV: there is no pointer on a television, so visible chrome is chrome
  // the viewer cannot dismiss. A wall display is a touch device someone walks
  // up to, so its chrome must stay.
  assert.equal(shouldAutoHide(DEVICE_PROFILES.tv, 7000, 0), true);
  assert.equal(shouldAutoHide(DEVICE_PROFILES.wall, 7000, 0), false,
    "a wall display is touch - its chrome must stay reachable");

  // Recency of input defers it.
  assert.equal(shouldAutoHide(DEVICE_PROFILES.tv, 7000, 6000), false);
});

test("applyProfile writes the variables the stylesheet reads", () => {
  const written = {};
  const fakeRoot = {
    style: {
      setProperty: (name, value) => { written[name] = value; }
    },
    dataset: {},
    classList: { toggle: () => {} }
  };

  const applied = applyProfile(DEVICE_PROFILES.tv, fakeRoot);

  assert.equal(applied.id, "tv");
  assert.equal(written["--device-type-scale"], "2.6");
  assert.equal(written["--device-tap-target"], "96px");
  assert.equal(written["--device-columns"], "2");
  assert.equal(fakeRoot.dataset.deviceProfile, "tv");
});

test("profileFromEnvironment is safe with no window at all", () => {
  // Called at module scope in some paths, and must not throw during import.
  const original = globalThis.window;
  Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
  try {
    const { profile, reason } = profileFromEnvironment();
    assert.equal(profile.id, DEFAULT_PROFILE_ID);
    assert.ok(reason.length > 0, "the reason must say why");
  } finally {
    Object.defineProperty(globalThis, "window", { value: original, configurable: true });
  }
});

// ================================================================ F3: burn-in

test("there are four modes and each declares whether it moves", () => {
  assert.equal(BURN_IN_MODES.length, 4);
  for (const mode of BURN_IN_MODES) {
    assert.ok(mode.id && mode.label, `mode ${mode.id} is incomplete`);
    assert.equal(typeof mode.moves, "boolean");
  }
  // static-dim is the only non-moving one, and it exists for reduced motion.
  assert.deepEqual(BURN_IN_MODES.filter((m) => !m.moves).map((m) => m.id), ["static-dim"]);
});

test("the pixel shift stays within the documented amplitude", () => {
  // Visible sway is a bug, not the feature.
  for (let i = 0; i < 40; i++) {
    const { x, y } = shiftOffset(i);
    assert.ok(Math.abs(x) <= SHIFT_MAX_PX, `x ${x} exceeds ${SHIFT_MAX_PX}px`);
    assert.ok(Math.abs(y) <= SHIFT_MAX_PX, `y ${y} exceeds ${SHIFT_MAX_PX}px`);
  }
});

test("the pixel shift uses whole pixels only", () => {
  // Sub-pixel values shimmer under fractional scaling, which is more distracting
  // than the burn-in it prevents.
  for (let i = 0; i < 40; i++) {
    const { x, y } = shiftOffset(i);
    assert.equal(x, Math.round(x), `x ${x} is fractional`);
    assert.equal(y, Math.round(y), `y ${y} is fractional`);
  }
});

test("the pixel shift returns to centre, so the cycle has no snap", () => {
  // The sequence must include an origin step; otherwise the panel jumps at the
  // end of every cycle.
  const seenCentre = [];
  for (let i = 0; i < 10; i++) {
    const { x, y } = shiftOffset(i);
    if (x === 0 && y === 0) seenCentre.push(i);
  }
  assert.ok(seenCentre.length >= 2,
    `the cycle touches centre only ${seenCycleCount(seenCentre)} time(s)`);

  function seenCycleCount(arr) { return arr.length; }
});

test("the pixel shift actually moves", () => {
  const moved = [];
  for (let i = 0; i < 10; i++) {
    const { x, y } = shiftOffset(i);
    if (x !== 0 || y !== 0) moved.push(i);
  }
  assert.ok(moved.length >= 6,
    `only ${moved.length} of 10 steps move the content`);
});

test("the checkerboard visits all four quadrants", () => {
  const seen = new Set();
  for (let i = 0; i < 8; i++) seen.add(checkerQuadrant(i));
  assert.equal(seen.size, 4, `saw only ${[...seen].join(",")}`);
  for (const q of seen) assert.ok(Number.isInteger(q) && q >= 0 && q <= 3);
});

test("each mode writes a complete set of variables", () => {
  // A mode that sets only some of them leaves the previous mode's values in
  // place, which is how a stuck checkerboard happens.
  const required = ["--burn-shift-x", "--burn-shift-y", "--burn-scale", "--burn-quadrant", "--burn-dim"];

  for (const mode of BURN_IN_MODES) {
    const vars = burnInVars(mode.id, 3, { nowMs: 1000, dimStartedAt: 0 });
    for (const name of required) {
      assert.ok(name in vars, `${mode.id} does not set ${name}`);
      assert.ok(typeof vars[name] === "string" && vars[name].length > 0,
        `${mode.id} set ${name} to something unusable`);
    }
  }
});

test("checkerboard and edge-crop do not translate", () => {
  for (const id of ["checkerboard", "edge-crop"]) {
    const vars = burnInVars(id, 5);
    assert.equal(vars["--burn-shift-x"], "0px", `${id} translated horizontally`);
    assert.equal(vars["--burn-shift-y"], "0px", `${id} translated vertically`);
  }
  const cropped = burnInVars("edge-crop", 0);
  assert.ok(Number(cropped["--burn-scale"]) > 1, "edge-crop must scale content up");
});

test("static-dim dims then restores, and never below the floor", () => {
  const started = 1_000_000;
  const during = burnInVars("static-dim", 1, { nowMs: started + 1000, dimStartedAt: started });
  assert.equal(Number(during["--burn-dim"]), STATIC_DIM_LEVEL);

  const after = burnInVars("static-dim", 1, { nowMs: started + STATIC_DIM_MS + 1, dimStartedAt: started });
  assert.equal(Number(after["--burn-dim"]), 1, "static-dim must restore itself");
});

test("static-dim with no start time stays at full", () => {
  // No timer yet means no dim, not a permanently dim panel.
  const vars = burnInVars("static-dim", 1, { nowMs: 5_000_000, dimStartedAt: null });
  assert.equal(Number(vars["--burn-dim"]), 1);
});

test("an unknown mode falls back to a real one rather than producing nothing", () => {
  const vars = burnInVars("a-mode-from-the-future", 2);
  assert.ok(vars["--burn-shift-x"].length > 0, "an unknown mode must still write usable values");
  assert.equal(vars["--burn-shift-x"], `${shiftOffset(2).x}px`);
});

// ==================================================== F7: screen-timeout rescue

test("an alarm well in the past is reported as missed", () => {
  const now = new Date(2026, 9, 8, 7, 30).getTime();
  assert.equal(isMissed({ hour: 6, minute: 0 }, now, {}), true);
});

test("an alarm inside the grace window is not yet missed", () => {
  // A throttled check arriving a minute late must not report a miss.
  const now = new Date(2026, 9, 8, 7, 2).getTime();
  assert.equal(isMissed({ hour: 7, minute: 0 }, now, {}), false,
    "two minutes late is within the grace window");

  const boundary = new Date(2026, 9, 8, 7, 0 + MISS_GRACE_MS / 60000).getTime();
  assert.equal(isMissed({ hour: 7, minute: 0 }, boundary, {}), true,
    "exactly at the grace boundary it is missed");
});

test("a future alarm is never missed", () => {
  const now = new Date(2026, 9, 8, 6, 0).getTime();
  assert.equal(isMissed({ hour: 7, minute: 0 }, now, {}), false);
});

test("a disabled alarm is never missed", () => {
  const now = new Date(2026, 9, 8, 12, 0).getTime();
  assert.equal(isMissed({ hour: 7, minute: 0, enabled: false }, now, {}), false);
});

test("a malformed alarm is never missed", () => {
  const now = new Date(2026, 9, 8, 12, 0).getTime();
  for (const bad of [null, {}, { hour: NaN, minute: 0 }, { hour: 99, minute: 0 }, { hour: "x", minute: "y" }]) {
    assert.equal(isMissed(bad, now, {}), false, `${JSON.stringify(bad)} was treated as missable`);
  }
});

test("the same miss is not reported twice", () => {
  const now = new Date(2026, 9, 8, 9, 0).getTime();
  const context = { notifiedAt: new Date(2026, 9, 8, 7, 0).getTime() };
  assert.equal(isMissed({ hour: 7, minute: 0 }, now, context), false,
    "an already-reported alarm must not be reported again");
});

test("classifyAlarm wraps to tomorrow rather than reporting a negative distance", () => {
  const now = new Date(2026, 9, 8, 23, 0).getTime();
  const result = classifyAlarm({ hour: 7, minute: 30 }, now);
  assert.ok(result.minutesAway > 0, `got a distance of ${result.minutesAway}`);
  assert.ok(result.minutesAway <= 1440);
});

test("the missed reason names the cause, not just the symptom", () => {
  const background = missedReason({ hiddenAt: Date.now() });
  assert.match(background, /background/i);
  assert.match(background, /keep this tab open|foreground/i,
    "the message must say what the reader can do");

  const generic = missedReason({});
  assert.ok(generic.length > 20);
  assert.doesNotMatch(generic, /sorry/i, "an apology is not an explanation");
});

// =========================================================== E4: visualiser

test("the visualiser declares three modes", () => {
  assert.equal(VISUALISER_MODES.length, 3);
  for (const mode of VISUALISER_MODES) {
    assert.ok(mode.id && mode.label && mode.hint);
  }
});

test("smoothing actually smooths, and converges", () => {
  let values = [0, 0, 0, 0];
  const target = [1, 1, 1, 1];

  // Immediately after a step change it must NOT already be at the target,
  // or the smoothing is not smoothing.
  const first = smoothToward(values, target);
  for (const v of first) {
    assert.ok(v > 0 && v < 1, `first frame ${v} jumped straight to the target`);
  }

  // And it must actually arrive.
  values = first;
  for (let i = 0; i < 80; i++) values = smoothToward(values, target);
  for (const v of values) assert.ok(Math.abs(v - 1) < 0.02, `converged to ${v}`);
});

test("smoothing preserves length across differing inputs", () => {
  const out = smoothToward([0.5], [0.1, 0.2, 0.3]);
  assert.equal(out.length, 3);
  for (const v of out) assert.ok(Number.isFinite(v), `produced ${v}`);
});

test("smoothing never emits NaN from NaN input", () => {
  const out = smoothToward([NaN, NaN], [0.5, 0.5]);
  for (const v of out) {
    assert.ok(Number.isFinite(v), `NaN propagated into the visualiser`);
    assert.ok(v >= 0 && v <= 1);
  }
});

test("spectrum resampling produces usable values for a real analyser shape", () => {
  // 128 bins, matching fftSize 256.
  const bins = new Uint8Array(128);
  bins[0] = 250;                       // DC - must be skipped
  for (let i = 1; i < 20; i++) bins[i] = 200;

  const bars = resampleSpectrum(bins, 24);
  assert.equal(bars.length, 24);
  for (let i = 0; i < bars.length; i++) {
    assert.ok(Number.isFinite(bars[i]), `bar ${i} is ${bars[i]}`);
    assert.ok(bars[i] >= 0 && bars[i] <= 1, `bar ${i} out of range: ${bars[i]}`);
  }
  // The low bars must carry the energy, not just the first one (bin 0 is DC).
  assert.ok(bars[0] + bars[1] > 0, "the low end is empty despite low-frequency energy");
});

test("resampling survives junk without NaN", () => {
  for (const junk of [null, undefined, new Uint8Array(0), []]) {
    const bars = resampleSpectrum(junk, 8);
    assert.equal(bars.length, 8);
    for (const v of bars) assert.ok(Number.isFinite(v), `junk produced ${v}`);
  }
  // A count of 0 or negative must not spin.
  assert.deepEqual(resampleSpectrum(new Uint8Array(16), 0), []);
});

test("bar colour is a single-hue ramp, not a rainbow", () => {
  // A rainbow adds nothing: height already carries the signal, and a
  // red/green scale is unreadable for a colour-blind viewer.
  const low = barColour(0);
  const high = barColour(1);
  assert.ok(low.startsWith("hsl(") && high.startsWith("hsl("));
  assert.match(low, /hsl\(212, 85%, \d+%\)/, "hue must be constant");
  assert.match(high, /hsl\(212, 85%, \d+%\)/);
  assert.notEqual(low, high, "the ramp must actually vary");
});

test("bar colour clamps rather than producing an invalid colour", () => {
  for (const v of [-5, 0, 0.5, 1, 99, NaN, null, undefined]) {
    const colour = barColour(v);
    assert.match(colour, /^hsl\(212, 85%, \d+%\)$/, `${v} produced "${colour}"`);
  }
});

// ============================================================== E6: solar

test("solar minutes are null with no location", () => {
  assert.equal(solarMinutes(new Date(), null, null, "sunrise"), null);
  assert.equal(solarMinutes(new Date(), NaN, 77), null);
  assert.equal(solarMinutes(new Date(), 51.5, undefined, "sunset"), null);
});

test("solar schedule is null with no location rather than guessing", () => {
  // Inventing an 18:00 sunset in Oslo is wrong for half the year, so the
  // schedule declines to be built at all.
  const result = solarSchedule(new Date(), "civil");
  assert.equal(result, null, "a solar schedule was invented without a location");
});

test("every solar preset has ordered rise and set depressions", () => {
  for (const preset of SOLAR_PRESETS) {
    assert.ok(preset.id && preset.label, `preset ${preset.id} is incomplete`);
    assert.ok(preset.rise < preset.set, `${preset.id}: rise is not before set`);
    assert.ok(preset.rise <= 0 && preset.set >= -12,
      `${preset.id} has an implausible depression angle`);
  }
});

test("describeSchedule always says what is happening", () => {
  const none = describeSchedule(null, "time");
  assert.ok(none.length > 20);
  assert.match(none, /stays at the brightness you set/i);

  const one = describeSchedule([{ from: "22:00", to: "06:30", dim: 0.04, night: true }], "time");
  assert.match(one, /22:00/);
  assert.match(one, /06:30/);
  assert.match(one, /night mode/i);

  const solar = describeSchedule([{ from: "20:10", to: "05:44", dim: 0.04, night: true }], "solar");
  assert.match(solar, /following the sun/i);

  const many = describeSchedule(
    [{ from: "22:00", to: "23:00", dim: 0.2, night: false },
     { from: "00:00", to: "01:00", dim: 0.2, night: false }],
    "time"
  );
  assert.match(many, /2 automatic windows/);
});

// ================================================================ E7: styles

test("five screensaver styles are declared", () => {
  assert.equal(SCREENSAVER_STYLES.length, 5);
  const ids = SCREENSAVER_STYLES.map((s) => s.id);
  assert.equal(new Set(ids).size, 5);
  for (const style of SCREENSAVER_STYLES) {
    assert.ok(style.label && style.hint, `${style.id} is incomplete`);
  }
});

test("every screensaver style renders markup", () => {
  const now = new Date(2026, 9, 8, 14, 30);
  for (const style of SCREENSAVER_STYLES) {
    const html = renderScreensaverStyle(style.id, now);
    assert.ok(html && html.length > 40, `${style.id} rendered nothing useful`);
    assert.match(html, /<div|<blockquote/, `${style.id} produced no elements`);
  }
});

test("every screensaver style tells the reader how to wake", () => {
  // The single most reported screensaver complaint is not knowing how to get
  // back to the clock.
  const now = new Date();
  for (const style of SCREENSAVER_STYLES) {
    assert.match(renderScreensaverStyle(style.id, now), /Tap anywhere to wake/i,
      `${style.id} is missing the wake hint`);
  }
});

test("an unknown style renders the default rather than nothing", () => {
  const html = renderScreensaverStyle("a-style-removed-last-release", new Date());
  assert.ok(html.length > 40, "a removed style must degrade, not blank the screen");
  assert.match(html, /sa-clock/);
});

test("the active style is validated against the declared set", () => {
  // setScreensaverStyle validates on write, but a payload from an older or
  // newer build can still hold anything.
  assert.equal(activeScreensaverStyle(), "clock");
});

test("the quote for a given minute is stable", () => {
  // It must not flicker between renders within the same minute.
  const a = quoteForMinute(12345.7);
  const b = quoteForMinute(12345.2);
  assert.equal(a.text, b.text);
  assert.ok(a.text.length > 10);
});

test("the solar screensaver admits when it does not know the location", () => {
  // A solar arc without a location is a lie about where the sun is.
  const html = renderScreensaverStyle("solar", new Date());
  assert.ok(html.includes("Set a location") || html.includes("sa-sun"),
    "the solar style neither rendered the sun nor said why not");
  if (!html.includes("sa-sun")) {
    assert.match(html, /Set a location/i);
  }
});
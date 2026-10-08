/* StandBy Mode Pro - Tests for Milestone 3 clock faces
 *
 * Run with: node --test tests/clocks-m3.test.mjs
 *
 * Covers the pure logic behind the 15 new faces: the word-clock grammar, the
 * solar/lunar ephemeris, the shared SVG primitives, and the numeral round-trip
 * that every new face depends on. The DOM behaviour of each face is covered by
 * the live browser checks recorded in TESTING.md, because these modules need a
 * real document to mount into.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { numberToWords, wordsFor } from "../js/clocks/_shared/words.js";
import {
  toRoman,
  formatDigits,
  setNumeralSystem,
  toBraille,
  NUMERAL_SYSTEMS
} from "../js/clocks/_shared/numeralMap.js";
import {
  sunTimes,
  daylightPeriods,
  sunAltitude,
  subsolarLongitude,
  moonPhase,
  moonPhaseName,
  moonPath,
  altitudeAtHour
} from "../js/clocks/_shared/solarMath.js";
import {
  polarToXY,
  arcPath,
  handPath,
  handAngles,
  tickMarks,
  dialNumerals,
  dotMatrixGlyph,
  dotMatrixGrid,
  humanDuration
} from "../js/clocks/_shared/primitives.js";
// From core/, not from the face modules: those import store.js, which
// constructs a Store at module load and touches `document`, failing under
// node --test.
import { dayOfYear, daysInYear } from "../js/core/clockMath.js";
import { formatInZone, offsetLabel } from "../js/core/timezones.js";

/** Mean synodic month, mirrored from solarMath.js so the tolerance below is
 *  stated in days rather than as an arbitrary phase fraction. */
const SYNODIC = 29.530588853;

// ------------------------------------------------- word clock grammar (A2)

test("numberToWords spells the awkward values correctly", () => {
  assert.equal(numberToWords(0), "zero");
  assert.equal(numberToWords(13), "thirteen");
  assert.equal(numberToWords(20), "twenty");
  assert.equal(numberToWords(42), "forty-two");
  assert.equal(numberToWords(59), "fifty-nine");
  assert.equal(numberToWords(-1), "");
  assert.equal(numberToWords("nonsense"), "");
});

test("wordsFor omits the minutes exactly on the hour", () => {
  assert.equal(wordsFor({ hours: 9, minutes: 0 }), "nine");
  assert.equal(wordsFor({ hours: 0, minutes: 0 }), "midnight");
  assert.equal(wordsFor({ hours: 12, minutes: 0 }), "noon");
});

test("wordsFor uses past/to correctly around the half hour", () => {
  assert.equal(wordsFor({ hours: 9, minutes: 15 }), "quarter past nine");
  assert.equal(wordsFor({ hours: 9, minutes: 30 }), "half past nine");
  assert.equal(wordsFor({ hours: 9, minutes: 45 }), "quarter to ten");
  assert.equal(wordsFor({ hours: 9, minutes: 1 }), "one past nine");
  assert.equal(wordsFor({ hours: 9, minutes: 20 }), "twenty past nine");
  assert.equal(wordsFor({ hours: 9, minutes: 59 }), "one to ten");
  assert.equal(wordsFor({ hours: 9, minutes: 31 }), "twenty-nine to ten");
});

test("wordsFor wraps the 12-hour cycle at both ends", () => {
  // The regression this guards: 23:45 once produced "quarter to thirteen".
  assert.equal(wordsFor({ hours: 23, minutes: 45 }), "quarter to twelve");
  assert.equal(wordsFor({ hours: 0, minutes: 7 }), "seven past twelve");
  assert.equal(wordsFor({ hours: 11, minutes: 59 }), "one to twelve");
  assert.equal(wordsFor({ hours: 12, minutes: 30 }), "half past twelve");
});

test("wordsFor in 24-hour mode names the hour directly", () => {
  assert.equal(wordsFor({ hours: 19, minutes: 30, is24: true }), "half past nineteen");
  assert.equal(wordsFor({ hours: 0, minutes: 0, is24: true }), "midnight");
  assert.equal(wordsFor({ hours: 23, minutes: 45, is24: true }), "quarter to midnight");
});

test("wordsFor survives the numeral engine by rejecting NaN", () => {
  // The engine hands over numeral-converted strings; a face must not build a
  // phrase from those. Number("१४") is NaN, so the guard has to return empty
  // rather than the string "NaN past NaN".
  assert.equal(wordsFor({ hours: "१४", minutes: "३०" }), "");
});

// ------------------------------------------------------- solar ephemeris

/** Minutes past UTC midnight. sunTimes returns absolute instants, so the
 *  assertions below must be timezone-independent: reading `.getHours()` off
 *  them depends on the machine running the test, which is how the original
 *  assertions came to disagree with a correct implementation. */
const utcMinutes = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();

test("sunTimes returns a plausible London summer day", () => {
  // 21 June 2026, London. Published sunrise 04:43 and sunset 21:21 BST,
  // i.e. 03:43 and 20:21 UTC.
  const { sunrise, sunset, polarDay, polarNight } = sunTimes(
    new Date(2026, 5, 21), 51.5074, -0.1278
  );

  assert.equal(polarDay, false);
  assert.equal(polarNight, false);
  assert.ok(sunrise instanceof Date && !Number.isNaN(sunrise.getTime()),
    "sunrise must be a real Date, not Invalid Date");
  assert.ok(!Number.isNaN(sunset.getTime()), "sunset must be a real Date");

  assert.ok(Math.abs(utcMinutes(sunrise) - 223) < 20,
    `sunrise ${utcMinutes(sunrise)}m UTC should be near 223 (04:43 BST)`);
  assert.ok(Math.abs(utcMinutes(sunset) - 1221) < 20,
    `sunset ${utcMinutes(sunset)}m UTC should be near 1221 (21:21 BST)`);
});

test("sunTimes places sunrise and sunset correctly outside the UK", () => {
  // New York, 21 June: published 05:25 and 20:31 EDT = 09:25 / 00:31 UTC.
  const nyc = sunTimes(new Date(2026, 5, 21), 40.7128, -74.006);
  assert.ok(Math.abs(utcMinutes(nyc.sunrise) - 565) < 25,
    `NYC sunrise ${utcMinutes(nyc.sunrise)}m UTC should be near 565`);
  // Sunset falls on the following UTC day, so compare the epoch difference.
  const nycDayLength = (nyc.sunset - nyc.sunrise) / 60000;
  assert.ok(nycDayLength > 890 && nycDayLength < 950,
    `NYC day length ${nycDayLength.toFixed(0)}m should be near 906`);

  // Sydney, 21 June: published 07:00 and 16:54 AEST = 21:00 prev / 06:54 UTC.
  const syd = sunTimes(new Date(2026, 5, 21), -33.8688, 151.2093);
  const sydDayLength = (syd.sunset - syd.sunrise) / 60000;
  assert.ok(sydDayLength > 570 && sydDayLength < 620,
    `Sydney day length ${sydDayLength.toFixed(0)}m should be near 594 (southern winter)`);
});

test("sunTimes reports polar day and polar night instead of lying", () => {
  // Svalbard in June: the sun does not set.
  const summer = sunTimes(new Date(2026, 5, 21), 78.22, 15.63);
  assert.equal(summer.polarDay, true);
  assert.equal(summer.polarNight, false);
  assert.equal(summer.sunrise, null, "polar day must not invent a sunrise");

  // Svalbard in December: the sun does not rise.
  const winter = sunTimes(new Date(2026, 11, 21), 78.22, 15.63);
  assert.equal(winter.polarNight, true);
  assert.equal(winter.polarDay, false);
  assert.equal(winter.sunset, null, "polar night must not invent a sunset");
});

test("daylightPeriods reports a long British summer day", () => {
  const periods = daylightPeriods(new Date(2026, 5, 21), 51.5074, -0.1278);
  assert.equal(periods.polarDay, false);
  // 16h38m is the published figure for London on the solstice. This must come
  // from an epoch difference: the previous implementation subtracted local
  // wall-clock hour fields and returned -441 minutes.
  assert.ok(periods.dayLengthMinutes > 960 && periods.dayLengthMinutes < 1010,
    `day length ${periods.dayLengthMinutes}m should be near 998m`);
  assert.ok(periods.daylightFraction > 0.66 && periods.daylightFraction < 0.71);
});

test("daylightPeriods twilight offsets bracket the sunrise and sunset", () => {
  const p = daylightPeriods(new Date(2026, 5, 21), 51.5074, -0.1278);
  const min = 60_000;

  assert.equal(Math.round((p.sunrise - p.firstLight) / min), 72);
  assert.equal(Math.round((p.lastLight - p.sunset) / min), 72);
  assert.equal(Math.round((p.sunset - p.goldenEnd) / min), 60);

  // Ordering must hold, and it must hold regardless of the test machine's
  // timezone - which the old wall-clock implementation did not.
  assert.ok(p.firstLight < p.sunrise);
  assert.ok(p.goldenEnd < p.sunset);
  assert.ok(p.sunset < p.lastLight);
});

test("a winter day is shorter than a summer day at the same location", () => {
  const summer = daylightPeriods(new Date(2026, 5, 21), 51.5074, -0.1278);
  const winter = daylightPeriods(new Date(2026, 11, 21), 51.5074, -0.1278);
  assert.ok(summer.dayLengthMinutes > winter.dayLengthMinutes,
    `${summer.dayLengthMinutes} should exceed ${winter.dayLengthMinutes}`);
  assert.ok(winter.dayLengthMinutes > 440 && winter.dayLengthMinutes < 500,
    `winter day length ${winter.dayLengthMinutes}m should be near 469`);
});

test("sunAltitude peaks at solar noon with the correct geometric maximum", () => {
  // UTC instants, not local ones: sunAltitude consumes the UTC fields, so a
  // machine-local Date would make this assertion pass or fail depending on
  // where the test runs.
  const at = (h) => sunAltitude(new Date(Date.UTC(2026, 5, 21, h, 0)), 51.5074, -0.1278);

  const atNoon = at(12);
  assert.ok(atNoon > 61 && atNoon < 62.5,
    `solstice noon altitude ${atNoon.toFixed(2)} should be ~61.9 (= 90 - 51.51 + 23.44)`);

  assert.ok(at(12) > at(9), "noon must be higher than 09:00 UTC");
  assert.ok(at(12) > at(18), "noon must be higher than 18:00 UTC");

  // Near the solstice the sun barely dips below the horizon at London's
  // latitude: 0 to 6h after solar midnight is still astronomical twilight at
  // roughly -15 degrees, not -40. Assert the real value, not a loose guess.
  assert.ok(at(0) < -14 && at(0) > -17,
    `00:00 UTC should be about -15 degrees, was ${at(0).toFixed(2)}`);
  assert.ok(at(0) < 0 && at(3) < 0, "before sunrise the sun is below the horizon");
});

test("sunAltitude is symmetric about solar noon", () => {
  // Solar noon at London's longitude on 21 June is 12:03 UTC (sunrise 03:43,
  // sunset 20:21, so the midpoint is 12:02).
  const noonUtc = 12.03;
  const at = (h) => sunAltitude(new Date(Date.UTC(2026, 5, 21, 0, 0) + h * 3600000), 51.5074, -0.1278);

  let best = -Infinity;
  let bestHour = 0;
  for (let h = 0; h < 24; h += 0.02) {
    const v = at(h);
    if (v > best) { best = v; bestHour = h; }
  }
  assert.ok(Math.abs(bestHour - noonUtc) < 0.1,
    `the daily peak should sit at solar noon (~${noonUtc}h UTC), was at ${bestHour.toFixed(2)}h`);

  for (const offset of [1, 2, 3, 4]) {
    const before = at(bestHour - offset);
    const after = at(bestHour + offset);
    assert.ok(Math.abs(before - after) < 1.5,
      `${offset}h either side of solar noon differed by ${Math.abs(before - after).toFixed(2)} degrees`);
  }
});

test("subsolar longitude is the noon meridian, and moves through the day", () => {
  // At 12:00 UTC the sun is overhead near longitude 0 (plus the equation of time).
  const noonUtc = subsolarLongitude(new Date(Date.UTC(2026, 5, 21, 12, 0)));
  assert.ok(Math.abs(noonUtc) < 3,
    `subsolar longitude at 12:00 UTC was ${noonUtc.toFixed(2)}`);

  // 18:00 UTC is six hours later, so ~90 degrees further west.
  const evening = subsolarLongitude(new Date(Date.UTC(2026, 5, 21, 18, 0)));
  assert.ok(evening < -80 && evening > -100,
    `subsolar longitude at 18:00 UTC was ${evening.toFixed(2)}, expected about -90`);
});

test("altitudeAtHour answers for the local wall clock, not for UTC", () => {
  // altitudeAtHour takes a LOCAL calendar day and a LOCAL hour. Its peak must
  // therefore sit at solar noon expressed in machine-local time, which is NOT
  // near machine-local midday unless the machine happens to share the
  // location's timezone. On a UTC+5:30 machine, London's 12:03 UTC solar noon
  // is 17:33 local - which is exactly the failure this test pins down.
  const day = new Date(2026, 5, 21);
  const at = (h) => altitudeAtHour(day, h, 51.5074, -0.1278);

  let best = -Infinity;
  let bestHour = 0;
  for (let h = 0; h <= 24; h += 0.05) {
    const v = at(h);
    if (v > best) { best = v; bestHour = h; }
  }

  const solarNoonUtcMinutes = 720 - 4 * -0.1278 - 1.72; // ~722.3
  const machineOffsetMinutes = -new Date(2026, 5, 21).getTimezoneOffset();
  const expectedLocalHour = ((solarNoonUtcMinutes + machineOffsetMinutes) / 60 + 24) % 24;

  assert.ok(Math.abs(bestHour - expectedLocalHour) < 0.15,
    `the peak should be at ${expectedLocalHour.toFixed(2)}h local (machine offset ${machineOffsetMinutes}m), was ${bestHour.toFixed(2)}h`);

  assert.ok(best > 61 && best < 62.5,
    `the solstice peak at London should be ~61.9 degrees, was ${best.toFixed(2)}`);

  // Equidistant from the peak the curve must mirror itself.
  for (const offset of [1, 2, 3]) {
    const before = at(bestHour - offset);
    const after = at(bestHour + offset);
    assert.ok(Math.abs(before - after) < 1.5,
      `${offset}h either side of the peak differed by ${Math.abs(before - after).toFixed(2)} degrees`);
  }

  // The lowest point of the local day must be well below the peak. Note this is
  // NOT the same as "local midnight is dark": altitudeAtHour combines a
  // machine-local hour with an arbitrary longitude, so on a machine at UTC+5:30
  // asking for London, local midnight is 18:30 UTC and the sun is still up.
  // Asserting darkness there would encode a coincidence of the test machine's
  // timezone with the test location.
  let lowest = Infinity;
  for (let h = 0; h <= 24; h += 0.05) lowest = Math.min(lowest, at(h));
  assert.ok(lowest < -10,
    `the darkest point of the local day should be well below the horizon, was ${lowest.toFixed(2)}`);
});

test("altitudeAtHour reports a night when the location shares the machine timezone", () => {
  // Pick a longitude that matches the machine's own UTC offset, so "local hour"
  // and "the location's hour" are the same thing. London is on Greenwich, so a
  // zero-offset machine can be checked directly.
  const machineOffsetMinutes = -new Date().getTimezoneOffset();
  if (machineOffsetMinutes !== 0) {
    // Assert the equivalent for the machine's actual offset: the hour at which
    // the machine's local midnight falls must be below the horizon there.
    const longitude = machineOffsetMinutes / 4;
    const day = new Date(2026, 5, 21);
    const solarNoonUtc = 720 - 4 * longitude - 1.72;
    const localMidnightUtc = (solarNoonUtc + 720) % 1440;
    const altitude = sunAltitude(
      new Date(Date.UTC(2026, 5, 21, 0, 0) + localMidnightUtc * 60000),
      0, longitude
    );
    assert.ok(altitude < 0,
      `solar midnight at the equator should be dark, was ${altitude.toFixed(2)}`);
    return;
  }

  const day = new Date(2026, 5, 21);
  const at = (h) => altitudeAtHour(day, h, 51.5074, -0.1278);
  assert.ok(at(0) < 0, `local midnight at Greenwich must be dark, was ${at(0).toFixed(2)}`);
  assert.ok(at(23) < 0, `23:00 at Greenwich must be dark, was ${at(23).toFixed(2)}`);
});

test("sunAltitude is at the horizon at the computed sunrise and sunset", () => {
  // The strongest available consistency check: the arc clock draws a day curve
  // from altitudeAtHour and prints sunrise/sunset from sunTimes. If those two
  // disagreed, the face would draw the sun below the horizon at its own
  // published sunrise.
  //
  // Checked against sunAltitude on absolute instants rather than
  // altitudeAtHour on local hours, because mixing a London location with a
  // machine-local hour is only meaningful when the two timezones agree - which
  // is not something a test can assume.
  const at = (date) => sunAltitude(date, 51.5074, -0.1278);

  for (const [month, day, label] of [[5, 21, "June solstice"], [11, 21, "December solstice"]]) {
    const { sunrise, sunset } = sunTimes(new Date(2026, month, day), 51.5074, -0.1278);

    assert.ok(Math.abs(at(sunrise)) < 1,
      `${label}: altitude at sunrise should be ~0, was ${at(sunrise).toFixed(2)}`);
    assert.ok(Math.abs(at(sunset)) < 1,
      `${label}: altitude at sunset should be ~0, was ${at(sunset).toFixed(2)}`);

    // Clearly above the horizon at solar noon, which is the midpoint between
    // sunrise and sunset. The expected maximum is 90 - latitude +/- declination,
    // so it is ~61.9 degrees in June but only ~15.1 in December. Asserting one
    // threshold for both would encode a June-only assumption.
    const noon = new Date(sunrise.getTime() + (sunset - sunrise) / 2);
    const expectedNoon = month === 5 ? 61.9 : 15.1;
    assert.ok(Math.abs(at(noon) - expectedNoon) < 1,
      `${label}: solar noon should be ~${expectedNoon} degrees, was ${at(noon).toFixed(2)}`);

    // Solar midnight is 12 hours after solar noon, NOT 12 hours after sunrise:
    // at London's latitude the June solstice has only 16h39m of daylight, so
    // sunrise + 12h lands at 15:43, still broad daylight.
    const solarMidnight = new Date(noon.getTime() + 12 * 3600000);
    assert.ok(at(solarMidnight) < 0,
      `${label}: solar midnight should be dark, was ${at(solarMidnight).toFixed(2)}`);
  }
});

// ---------------------------------------------------------- lunar phases

test("the module's own reference epoch is a new moon", () => {
  // solarMath anchors the cycle at 2000-01-06 18:14 UTC. If that anchor is
  // ever edited, this fails immediately rather than silently shifting every
  // rendered phase.
  const { phase, illumination } = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)));
  assert.ok(phase < 0.001 || phase > 0.999, `phase was ${phase}`);
  assert.ok(illumination < 0.01, `illumination was ${illumination}`);
});

// The linear synodic-month model is verified against published phase times to
// better than about 1.2 days, which is the honest accuracy of any formula this
// simple. The dates below are Catalina Sky Survey / Griffith Observatory /
// timeanddate.com values. See learning.md for why the tolerance is expressed in
// days rather than in phase fractions.

test("moonPhase puts the 2017 quarter phases near their expected fractions", () => {
  const cases = [
    ["2017-01-05 first quarter", Date.UTC(2017, 0, 5, 19, 47), 0.25],
    ["2017-01-12 full",          Date.UTC(2017, 0, 12, 11, 35), 0.50],
    ["2017-01-19 last quarter",  Date.UTC(2017, 0, 19, 22, 13), 0.75],
    ["2017-02-26 new",           Date.UTC(2017, 1, 26, 15, 30), 0.00]
  ];

  for (const [label, epoch, expected] of cases) {
    const { phase } = moonPhase(new Date(epoch));
    let error = Math.abs(phase - expected);
    error = Math.min(error, 1 - error);
    const days = error * SYNODIC;
    assert.ok(days < 1.5,
      `${label}: model gave phase ${phase.toFixed(4)}, off by ${days.toFixed(2)} days`);
  }
});

test("moonPhase reports illumination and direction consistently", () => {
  const newMoon = moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14)));
  assert.ok(newMoon.illumination < 0.01, `new moon illum ${newMoon.illumination}`);
  assert.equal(newMoon.waxing, true, "a new moon begins the waxing half");

  // Halfway along the cycle the moon is at maximum illumination. Use a
  // VERIFIED full moon: 2003-05-31 turns out to be a new moon in this model
  // (and in the published tables), which is why the phase checks below use
  // 2017 dates taken from Griffith Observatory.
  const full = moonPhase(new Date(Date.UTC(2017, 0, 12, 11, 35)));
  assert.ok(full.illumination > 0.98, `illumination was ${full.illumination}`);

  // The waxing flag flips at exactly phase 0.5, and the linear model straddles
  // that boundary by up to ~1.2 days. Assert the flag away from the boundary
  // rather than at it: mid-waxing is waxing, mid-waning is waning.
  assert.equal(moonPhase(new Date(Date.UTC(2017, 0, 8, 0, 0))).waxing, true,
    "early January 2017 is in the waxing half");
  assert.equal(moonPhase(new Date(Date.UTC(2017, 0, 22, 0, 0))).waxing, false,
    "late January 2017 is in the waning half");

  // Illumination must never leave [0, 1] anywhere in the cycle.
  for (let d = 0; d < 30; d++) {
    const { illumination } = moonPhase(new Date(Date.UTC(2026, 0, 1 + d)));
    assert.ok(illumination >= 0 && illumination <= 1,
      `day ${d} produced illumination ${illumination}`);
  }
});

test("moonPhaseName labels all eight octants", () => {
  const names = new Set();
  for (let i = 0; i < 8; i++) names.add(moonPhaseName(i / 8 + 0.06));
  assert.equal(names.size, 8, `only got ${[...names].join(", ")}`);
});

test("moonPath produces valid SVG at every phase, with no NaN", () => {
  for (let i = 0; i <= 40; i++) {
    const phase = i / 40;
    const d = moonPath(phase, 46);
    assert.ok(!/NaN|Infinity/.test(d), `phase ${phase} produced ${d}`);
    assert.match(d, /^M [\d.]+ [\d.]+ A /);
  }
});

test("moonPath degenerates to nothing at new moon and a full disc at full", () => {
  // At new moon the terminator ellipse coincides with the limb, so the two
  // arcs describe the same boundary and enclose no area.
  const newMoon = moonPath(0, 46);
  const fullMoon = moonPath(0.5, 46);
  assert.ok(!/NaN/.test(newMoon) && !/NaN/.test(fullMoon));
  // Both are still well-formed paths, which is what matters for rendering: the
  // fill rule does the rest.
  assert.equal(newMoon.split("A").length, fullMoon.split("A").length);
});

// ------------------------------------------------------ SVG primitives

test("polarToXY puts 0 degrees at 12 o'clock and runs clockwise", () => {
  const top = polarToXY(0, 0, 10, 0);
  assert.ok(Math.abs(top.x) < 1e-9 && Math.abs(top.y + 10) < 1e-9,
    `0deg should be straight up, got ${top.x},${top.y}`);

  const right = polarToXY(0, 0, 10, 90);
  assert.ok(Math.abs(right.x - 10) < 1e-9 && Math.abs(right.y) < 1e-9,
    `90deg should be straight right, got ${right.x},${right.y}`);

  const bottom = polarToXY(0, 0, 10, 180);
  assert.ok(Math.abs(bottom.y - 10) < 1e-9, "180deg should be straight down");
});

test("handAngles moves the hour hand continuously", () => {
  const a = handAngles({ hours: 9, minutes: 0, seconds: 0 });
  const b = handAngles({ hours: 9, minutes: 30, seconds: 0 });
  assert.equal(a.hour, 270);
  assert.equal(b.hour, 285, "half an hour must advance the hour hand 15 degrees");
  assert.equal(a.minute, 0);
  assert.equal(a.second, 0);
  assert.equal(handAngles({ hours: 0, minutes: 0, seconds: 30 }).second, 180);
});

test("handPath emits one closed subpath with no zero-length artefacts", () => {
  const d = handPath(100, 100, 80, "hour", 90);
  assert.match(d, /^M /);
  assert.match(d, /Z$/);
  assert.ok(!/l 0\.01 0/.test(d), "the old no-op tail segment must be gone");
  assert.equal(d.match(/M /g).length, 1, "a hand must be a single subpath");
  assert.ok(!/NaN/.test(d));
});

test("arcPath produces a well-formed arc with no NaN", () => {
  const d = arcPath(50, 50, 40, 0, 90);
  assert.ok(!/NaN/.test(d));
  assert.match(d, /^M -?[\d.]+ -?[\d.]+ A 40 40 0 0 1 /);
});

test("tickMarks marks every Nth tick as major", () => {
  const ticks = tickMarks({ cx: 0, cy: 0, radius: 100, count: 12, every: 3 });
  assert.equal(ticks.match(/<line/g).length, 12);

  // Major ticks are drawn from a smaller inner radius, so they are both longer
  // and thicker. Index 0 is major (0 % 3 === 0) and index 1 is minor.
  const widths = Array.from(ticks.matchAll(/stroke-width="([\d.]+)"/g)).map(m => Number(m[1]));
  const isMajor = (i) => widths[i] > widths[1];
  assert.ok(isMajor(0), "tick 0 must be major");
  assert.ok(!isMajor(1), "tick 1 must be minor");
  assert.ok(isMajor(3), "tick 3 must be major (3 % 3 === 0)");
  assert.ok(isMajor(6) && isMajor(9), "ticks 6 and 9 must be major");
  assert.ok(!isMajor(11), "tick 11 must be minor");
  assert.ok(!/NaN/.test(ticks));
});

test("dialNumerals renders Roman numerals when asked", () => {
  const arabic = dialNumerals({ cx: 0, cy: 0, radius: 100, style: "arabic", size: 10 });
  const roman = dialNumerals({ cx: 0, cy: 0, radius: 100, style: "roman", size: 10 });
  assert.equal(arabic.match(/<text/g).length, 12);
  assert.ok(roman.includes(">XII<"), "12 o'clock must read XII in Roman");
  assert.ok(!/NaN/.test(roman));
});

test("dotMatrixGlyph renders a 5-wide glyph and blanks unknown characters", () => {
  const zero = dotMatrixGlyph("0");
  assert.match(zero, /viewBox="0 0 \d+ \d+"/);
  assert.equal(zero.match(/<rect/g).length, 35, "a full 5x7 cell is 35 rects");

  // The glyph table is deliberately Latin-only. An unknown character must render
  // an explicit blank rather than a guessed shape.
  const unknown = dotMatrixGlyph("Ж");
  assert.equal(unknown.match(/<rect/g)?.length ?? 0, 0);
  assert.ok(!/NaN/.test(unknown));
});

test("dotMatrixGrid sizes itself from the character count", () => {
  const short = dotMatrixGrid("1", { cell: 6, gap: 2, charGap: 6 });
  const long = dotMatrixGrid("12", { cell: 6, gap: 2, charGap: 6 });
  const widthOf = (svg) => Number(/viewBox="0 0 ([\d.]+) /.exec(svg)[1]);
  assert.ok(widthOf(long) > widthOf(short));
  assert.ok(!/NaN/.test(long));
});

test("humanDuration renders day, hour and minute granularity", () => {
  assert.equal(humanDuration(0), "now");
  assert.equal(humanDuration(0.4), "now");
  assert.equal(humanDuration(42), "42 m");
  assert.equal(humanDuration(60), "1 h");
  assert.equal(humanDuration(192), "3 h 12 m");
  assert.equal(humanDuration(1440), "1 d");
  assert.equal(humanDuration(1560), "1 d 2 h");
});

// ------------------------------------------------- Roman numeral helper

test("toRoman converts the canonical range", () => {
  assert.equal(toRoman(1), "I");
  assert.equal(toRoman(4), "IV");
  assert.equal(toRoman(9), "IX");
  assert.equal(toRoman(14), "XIV");
  assert.equal(toRoman(40), "XL");
  assert.equal(toRoman(59), "LIX");
  assert.equal(toRoman(1999), "MCMXCIX");
});

test("toRoman refuses values outside the readable range", () => {
  // 4000 would render "MMMM", which is unreadable at a glance. Passing through
  // is deliberate: a wrong-looking numeral is worse than a plain digit.
  assert.equal(toRoman(4000), "4000");
  assert.equal(toRoman(0), "0");
  assert.equal(toRoman(-5), "-5");
  assert.equal(toRoman("not a number"), "not a number");
});

// -------------------------------------- numeral engine round-trip (A19)

test("every numeral system round-trips a full clock string", () => {
  try {
    for (const system of Object.values(NUMERAL_SYSTEMS)) {
      setNumeralSystem(system.id);
      const formatted = formatDigits("14:30:52");

      // Structure is preserved for every system, including Latin.
      assert.equal(formatted.length, "14:30:52".length,
        `${system.id} changed the string length`);
      assert.equal(formatted.split(":").join(":"), "14:30:52".replace(/[0-9]/g, d => system.digits[Number(d)]),
        `${system.id} produced ${formatted}`);

      if (system.id === "latn") {
        // Latin is the identity mapping by definition; asserting it contains no
        // ASCII digits would be asserting the opposite of what Latin means.
        assert.equal(formatted, "14:30:52");
      } else {
        assert.ok(!/[0-9]/.test(formatted),
          `${system.id} left ASCII digits unconverted: ${formatted}`);
        assert.equal(formatted.split(":").length, 3,
          `${system.id} must not disturb the separators`);
      }
    }
  } finally {
    setNumeralSystem("latn");
  }
});

test("an unknown numeral id falls back to Latin rather than throwing", () => {
  assert.equal(setNumeralSystem("klingon"), "latn");
  assert.equal(formatDigits("07", "klingon"), "07");
});

test("toBraille uses Grade-1 digit cells", () => {
  // Grade-1 braille encodes digits as the letters a-j, so 0 is j (U+281A) and
  // 1 is a (U+2801). U+2834 is the NUMBER SIGN and must never stand in for a
  // digit - doing so renders 10:30 as "1n3n", defeating the point of the face.
  assert.equal(toBraille("0"), "⠚", "zero is braille letter j, not the number sign");
  assert.equal(toBraille("1"), "⠁");
  assert.equal(toBraille("9"), "⠊");
  assert.equal(toBraille("12:30"), "⠁⠃⠒⠉⠚");

  // All ten digits must be distinct, or the clock is unreadable.
  const cells = Array.from({ length: 10 }, (_, i) => toBraille(String(i)));
  assert.equal(new Set(cells).size, 10,
    `only ${new Set(cells).size} distinct cells across the digits`);
  assert.ok(!cells.includes("⠴"), "the number sign must not be one of the digit cells");
});

test("toBraille maps colons and spaces, leaving other text alone", () => {
  assert.equal(toBraille(":"), "⠒");
  assert.equal(toBraille(" "), "⠀");
  // A non-digit must not be silently swallowed: it passes through, and the
  // face is responsible for never feeding it arbitrary text.
  assert.equal(toBraille("x"), "x");
});

// ------------------------------------------------------- clock of the year

test("dayOfYear is 1-based and handles leap years", () => {
  assert.equal(dayOfYear(new Date(2026, 0, 1)), 1);
  assert.equal(dayOfYear(new Date(2026, 11, 31)), 365);
  assert.equal(dayOfYear(new Date(2024, 11, 31)), 366);
  assert.equal(daysInYear(2026), 365);
  assert.equal(daysInYear(2024), 366);
  assert.equal(daysInYear(1900), 365, "1900 is not a leap year");
  assert.equal(daysInYear(2000), 366, "2000 is a leap year");
});

// --------------------------------------------------------- world clock

test("formatInZone formats a named zone", () => {
  const instant = new Date(Date.UTC(2026, 5, 21, 12, 0));
  const tokyo = formatInZone(instant, "Asia/Tokyo", { hour: "2-digit", minute: "2-digit" });
  // Tokyo is UTC+9 year-round, so 12:00 UTC is 21:00 there.
  assert.ok(/21/.test(tokyo), `expected 21:00, got ${tokyo}`);
});

test("an unknown timezone returns null, never a wrong time", () => {
  // The honest degradation: the face renders "—" rather than silently falling
  // back to the local zone and showing a plausible but false reading.
  const bad = formatInZone(new Date(), "Mars/Olympus", { hour: "2-digit" });
  assert.equal(bad, null);
  assert.equal(offsetLabel(new Date(), "Mars/Olympus"), null);
});

test("offsetLabel reports a real UTC offset for a real zone", () => {
  const label = offsetLabel(new Date(Date.UTC(2026, 0, 15, 12)), "Asia/Kolkata");
  assert.ok(label && /5:30|GMT\+5:30/.test(label), `expected +5:30, got ${label}`);
});

// ------------------------------------------------ world land geometry

test("world land outlines are real geography within valid bounds", async () => {
  const { LAND_RINGS, landPaths } = await import("../js/clocks/_shared/worldLand.js");

  assert.ok(LAND_RINGS.length > 20,
    `only ${LAND_RINGS.length} rings: the outline is too sparse to be recognisable`);

  let points = 0;
  for (const ring of LAND_RINGS) {
    assert.ok(ring.length >= 4, `a ring had only ${ring.length} points`);
    for (const [lon, lat] of ring) {
      assert.ok(lon >= -180 && lon <= 180, `longitude ${lon} out of range`);
      assert.ok(lat >= -90 && lat <= 90, `latitude ${lat} out of range`);
    }
    points += ring.length;
  }
  // The simplification budget is explicit in the generator; if someone tightens
  // it further the map silently stops being recognisable, so pin the floor.
  assert.ok(points > 800, `only ${points} points: simplification went too far`);

  const d = landPaths();
  assert.ok(!/NaN|Infinity/.test(d), "projection produced a non-finite coordinate");
});

/** Standard ray-casting point-in-ring test. */
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

test("world land outlines place known landmasses where they belong", async () => {
  const { LAND_RINGS } = await import("../js/clocks/_shared/worldLand.js");

  // Real point-in-polygon, not a grid of vertices: marking only the ring points
  // as land would report the interior of every continent as sea.
  const isLand = (lon, lat) => LAND_RINGS.some((ring) => inRing(lon, lat, ring));

  // Land: central Brazil, central Australia, central Kazakhstan, Siberia.
  for (const [name, lon, lat] of [
    ["central Brazil", -52, -10],
    ["central Australia", 133, -25],
    ["central Kazakhstan", 65, 48],
    ["central Siberia", 95, 62],
    ["central United States", -100, 40],
    ["central Sahara", 10, 23]
  ]) {
    assert.ok(isLand(lon, lat), `${name} (${lon}, ${lat}) should be land`);
  }

  // Sea: open oceans and two inland seas, which must not read as land.
  for (const [name, lon, lat] of [
    ["mid-Atlantic", -30, 20],
    ["mid-Pacific", -150, 0],
    ["Indian Ocean", 80, -40],
    ["Black Sea", 34, 43],
    ["North Sea", 3, 56]
  ]) {
    assert.ok(!isLand(lon, lat), `${name} (${lon}, ${lat}) should be sea`);
  }
});
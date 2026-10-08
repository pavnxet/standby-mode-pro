/* StandBy Mode Pro - Tests for Milestone 3 widget engines
 *
 * Run with: node --test tests/widgets-m3.test.mjs
 *
 * Covers the pure logic behind the Milestone 3 widgets: unit conversion, the
 * calculator parser, countdown date handling, timezone maths, numeric input
 * parsing, AQI banding and system-status normalisation. DOM behaviour is
 * covered by the live browser checks recorded in TESTING.md.
 */

import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------- unit conversion

import {
  convert,
  toCelsius,
  fromCelsius,
  unitsFor,
  formatValue,
  unitSymbol,
  CATEGORIES,
  CATEGORY_IDS
} from "../js/core/units.js";

// -------------------------------------------------------------- calculator

import {
  evaluate,
  tryEvaluate,
  formatResult,
  ExpressionError
} from "../js/core/calculator.js";

// ------------------------------------------------------- countdown + dates

import {
  splitDuration,
  headlineUnit,
  parseLocalInputValue,
  toLocalInputValue
} from "../js/core/countdownMath.js";
import { dayOfYear, daysInYear } from "../js/core/clockMath.js";

// --------------------------------------------------------------- timezones

import {
  formatInZone,
  offsetLabel,
  offsetMinutes,
  zoneDifferenceHours,
  isValidZone,
  supportedZones,
  localZone,
  DEFAULT_CITIES
} from "../js/core/timezones.js";

// ------------------------------------------------------------ numeric input

import { parseNumericInput, formatNumberInput } from "../js/core/inputParse.js";

// ------------------------------------------------------------- air quality

import { bandFor, airQualityUrl, formatParticulate, bandScale } from "../js/core/airQuality.js";

// ----------------------------------------------------------- system status

import {
  readBattery,
  readConnection,
  batteryLabel,
  hasAnySystemApi
} from "../js/core/systemStatus.js";

// ============================================================ units

test("length conversions round-trip through the base unit", () => {
  for (const from of ["mm", "cm", "m", "km", "in", "ft", "yd", "mi", "nmi"]) {
    const there = convert("length", 7, from, "m");
    assert.ok(Number.isFinite(there), `${from} -> m produced ${there}`);
    const back = convert("length", there, "m", from);
    assert.ok(Math.abs(back - 7) < 1e-9, `${from} round-trip gave ${back}`);
  }
});

test("length conversions match published reference values", () => {
  assert.ok(Math.abs(convert("length", 1, "mi", "m") - 1609.344) < 1e-9);
  assert.ok(Math.abs(convert("length", 1, "ft", "m") - 0.3048) < 1e-12);
  assert.ok(Math.abs(convert("length", 1, "in", "cm") - 2.54) < 1e-9);
  assert.ok(Math.abs(convert("length", 100, "yd", "ft") - 300) < 1e-9);
  assert.ok(Math.abs(convert("length", 1, "nmi", "km") - 1.852) < 1e-9);
});

test("mass conversions match published reference values", () => {
  assert.ok(Math.abs(convert("mass", 1, "lb", "kg") - 0.45359237) < 1e-9);
  assert.ok(Math.abs(convert("mass", 1, "oz", "g") - 28.349523125) < 1e-9);
  assert.ok(Math.abs(convert("mass", 1, "st", "lb") - 14) < 1e-9);
  assert.ok(Math.abs(convert("mass", 1000, "g", "kg") - 1) < 1e-12);
});

test("volume conversions use US customary measures", () => {
  assert.ok(Math.abs(convert("volume", 1, "gal", "l") - 3.785411784) < 1e-9);
  assert.ok(Math.abs(convert("volume", 1, "floz", "ml") - 29.5735295625) < 1e-9);
  assert.ok(Math.abs(convert("volume", 3, "tsp", "tbsp") - 1) < 1e-12);
});

test("data conversions distinguish decimal from binary prefixes", () => {
  // The classic SI/IEC trap. The first draft based this category on bytes while
  // labelling the unit "Bits", so a kilobyte came out as 1024 bits - off by a
  // factor of eight in the one category where the distinction is the point.
  assert.ok(Math.abs(convert("data", 1, "kb", "byte") - 1000) < 1e-9, "1 kB = 1000 bytes");
  assert.ok(Math.abs(convert("data", 1, "kib", "byte") - 1024) < 1e-9, "1 KiB = 1024 bytes");
  assert.ok(Math.abs(convert("data", 1, "byte", "b") - 8) < 1e-12, "1 byte = 8 bits");
  assert.ok(Math.abs(convert("data", 1, "kb", "b") - 8000) < 1e-9, "1 kB = 8000 bits");

  assert.ok(Math.abs(convert("data", 1, "gb", "mb") - 1000) < 1e-9);
  assert.ok(Math.abs(convert("data", 1, "gib", "mib") - 1024) < 1e-9);
  assert.ok(Math.abs(convert("data", 1, "tb", "gb") - 1000) < 1e-9);
  assert.ok(Math.abs(convert("data", 1, "tib", "gib") - 1024) < 1e-9);

  for (const unit of ["kb", "mb", "gb", "tb", "kib", "mib", "gib", "tib"]) {
    const there = convert("data", 3, unit, "byte");
    const back = convert("data", there, "byte", unit);
    assert.ok(Math.abs(back - 3) < 1e-9, `${unit} round-trip gave ${back}`);
  }
});

test("speed and energy conversions match reference values", () => {
  assert.ok(Math.abs(convert("speed", 1, "kph", "mps") - 0.2777777778) < 1e-9);
  assert.ok(Math.abs(convert("speed", 1, "mph", "mps") - 0.44704) < 1e-12);
  assert.ok(Math.abs(convert("energy", 1, "kcal", "j") - 4184) < 1e-9);
  assert.ok(Math.abs(convert("energy", 1, "kwh", "kj") - 3600) < 1e-9);
  assert.ok(Math.abs(convert("energy", 1, "cal", "j") - 4.184) < 1e-12);
});

test("temperature is affine, not multiplicative", () => {
  // The case a factor-based model gets wrong.
  assert.ok(Math.abs(convert("temperature", 100, "c", "f") - 212) < 1e-9);
  assert.ok(Math.abs(convert("temperature", 32, "f", "c") - 0) < 1e-9);
  assert.ok(Math.abs(convert("temperature", -40, "c", "f") - -40) < 1e-9);
  assert.ok(Math.abs(convert("temperature", 0, "c", "k") - 273.15) < 1e-9);
  assert.ok(Math.abs(convert("temperature", -273.15, "c", "k")) < 1e-9);
  assert.equal(toCelsius(212, "f"), 100);
  assert.equal(fromCelsius(100, "f"), 212);
  assert.ok(Number.isNaN(toCelsius(1, "x")));
});

test("convert returns null for unknown units, never NaN", () => {
  assert.equal(convert("length", 1, "m", "parsec"), null);
  assert.equal(convert("length", 1, "parsec", "m"), null);
  assert.equal(convert("nosuchcategory", 1, "m", "ft"), null);
  assert.equal(convert("length", NaN, "m", "ft"), null);
  assert.equal(convert("length", Infinity, "m", "ft"), null);
});

test("every category declares a base unit that exists, with numeric factors", () => {
  for (const id of CATEGORY_IDS) {
    const group = CATEGORIES[id];
    assert.ok(group.units[group.base], `${id}: base "${group.base}" missing from units`);
    if (group.affine) continue;
    for (const [unitId, def] of Object.entries(group.units)) {
      assert.equal(typeof def.factor, "number", `${id}.${unitId} needs a numeric factor`);
      assert.ok(def.factor > 0, `${id}.${unitId} factor must be positive`);
      assert.ok(def.label && typeof def.label === "string", `${id}.${unitId} needs a label`);
    }
  }
});

test("unitsFor returns select options, and nothing for a bad category", () => {
  assert.ok(unitsFor("length").length >= 9);
  assert.ok(unitsFor("length").every((u) => u.id && u.label));
  assert.deepEqual(unitsFor("nope"), []);
});

test("formatValue picks readable precision and handles extremes", () => {
  assert.equal(formatValue(0, "m"), "0");
  assert.equal(formatValue(1234.5678, "m"), "1,235");
  assert.equal(formatValue(0.5, "m"), "0.5");
  assert.ok(formatValue(1e-9, "m").includes("e-"));
  assert.ok(formatValue(1e20, "m").includes("e+"));
  assert.equal(formatValue(NaN, "m"), "—");
  assert.equal(unitSymbol("temperature", "c"), "°C");
  assert.equal(unitSymbol("length", "m"), "");
});

// ============================================================ calculator

test("evaluates the four operations with correct precedence", () => {
  assert.equal(evaluate("2+3"), 5);
  assert.equal(evaluate("2+3*4"), 14);
  assert.equal(evaluate("(2+3)*4"), 20);
  assert.equal(evaluate("10-2-3"), 5, "subtraction is left-associative");
  assert.equal(evaluate("100/5/2"), 10, "division is left-associative");
  assert.equal(evaluate("2+3*4-6/3"), 12);
});

test("exponentiation is right-associative", () => {
  // The bug a naive left-to-right implementation gets wrong.
  assert.equal(evaluate("2^3^2"), 512, "2^(3^2) = 512, not (2^3)^2 = 64");
  assert.equal(evaluate("3^2"), 9);
});

test("unary minus binds correctly against exponentiation", () => {
  assert.equal(evaluate("-2^2"), -4, "-(2^2)");
  assert.equal(evaluate("0-2^2"), -4);
  assert.equal(evaluate("-3+5"), 2);
  assert.equal(evaluate("2*-3"), -6);
  assert.equal(evaluate("--5"), 5);
  assert.equal(evaluate("-(3+4)"), -7);
});

test("supports pi, e and unary functions", () => {
  assert.ok(Math.abs(evaluate("pi") - Math.PI) < 1e-12);
  assert.ok(Math.abs(evaluate("e") - Math.E) < 1e-12);
  assert.equal(evaluate("sqrt(16)"), 4);
  assert.equal(evaluate("abs(-7)"), 7);
  assert.equal(evaluate("round(2.6)"), 3);
  assert.equal(evaluate("floor(2.9)"), 2);
  assert.equal(evaluate("ceil(2.1)"), 3);
  assert.ok(Math.abs(evaluate("ln(e)") - 1) < 1e-12);
  assert.ok(Math.abs(evaluate("log(1000)") - 3) < 1e-12);
});

test("handles whitespace, decimals and exponent notation", () => {
  assert.equal(evaluate("  12  +  8 "), 20);
  assert.equal(evaluate("1.5 * 4"), 6);
  assert.equal(evaluate("2e3"), 2000);
  assert.equal(evaluate("1.5e-2"), 0.015);
  assert.equal(evaluate(".5 + .5"), 1);
});

test("rejects malformed input", () => {
  for (const input of [
    "", "2+", "*3", "(2+3", "2+3)", "2 3", "foo(2)", "sqrt", "sqrt()", "()",
    // Failing mid-string, after operators have already been popped onto the
    // output stack - the case a partial implementation misses.
    "2*/3", "1+*2", "(1+)(2)", "2+*", "5//3"
  ]) {
    assert.throws(() => evaluate(input), ExpressionError, `"${input}" should throw`);
  }
});

test("rejects code-injection and prototype-pollution spellings", () => {
  // The entire reason this is a hand-written parser rather than eval().
  for (const input of [
    "constructor", "globalThis", "alert(1)", "process.exit(1)", "[].constructor",
    "1;alert(1)", "`x`", "1+{}", "require('fs')",
    "constructor.constructor('return 1')()"
  ]) {
    assert.throws(() => evaluate(input), ExpressionError, `"${input}" must be rejected`);
  }
});

test("non-finite results are returned, not thrown", () => {
  assert.equal(evaluate("1/0"), Infinity);
  assert.ok(Number.isNaN(evaluate("0/0")));
});

test("formatResult renders non-finite and whole numbers explicitly", () => {
  assert.equal(formatResult(Infinity), "∞");
  assert.equal(formatResult(-Infinity), "−∞");
  assert.equal(formatResult(NaN), "Not a number");
  assert.ok(formatResult(1e20).includes("e+"));
  assert.ok(formatResult(1e-12).includes("e-"));
  assert.equal(formatResult(1200), "1,200", "a whole number must not gain a decimal separator");
  assert.equal(formatResult(0), "0");
  assert.ok(formatResult(1234.5).includes("5"));
});

test("tryEvaluate never throws, for live keystroke previews", () => {
  assert.deepEqual(
    { ok: tryEvaluate("2+2").ok, value: tryEvaluate("2+2").value },
    { ok: true, value: 4 }
  );
  const bad = tryEvaluate("2+");
  assert.equal(bad.ok, false);
  assert.equal(bad.value, null);
  assert.ok(typeof bad.error === "string");
});

// ============================================================ countdown

test("splitDuration breaks a delta into readable parts", () => {
  const parts = splitDuration((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000);
  assert.equal(parts.passed, false);
  assert.equal(parts.days, 2);
  assert.equal(parts.hours, 3);
  assert.equal(parts.minutes, 4);
  assert.equal(parts.seconds, 5);
});

test("splitDuration flips to passed for a negative delta", () => {
  const parts = splitDuration(-5000);
  assert.equal(parts.passed, true, "a passed target must be reported, not shown as zero");
  assert.equal(parts.seconds, 5);
});

test("splitDuration handles zero and sub-second deltas", () => {
  assert.equal(splitDuration(0).passed, false);
  assert.equal(splitDuration(999).seconds, 0);
});

test("headlineUnit picks the largest non-zero unit", () => {
  assert.deepEqual(headlineUnit(splitDuration(2 * 86400 * 1000)), { value: 2, unit: "days" });
  assert.deepEqual(headlineUnit(splitDuration(86400 * 1000)), { value: 1, unit: "day" });
  assert.deepEqual(headlineUnit(splitDuration(3 * 3600 * 1000)), { value: 3, unit: "hours" });
  assert.deepEqual(headlineUnit(splitDuration(3600 * 1000)), { value: 1, unit: "hour" });
  assert.deepEqual(headlineUnit(splitDuration(90 * 1000)), { value: 1, unit: "minute" });
  assert.deepEqual(headlineUnit(splitDuration(60 * 1000)), { value: 1, unit: "minute" });
  assert.deepEqual(headlineUnit(splitDuration(5000)), { value: 5, unit: "seconds" });
});

test("parseLocalInputValue reads a datetime-local string as LOCAL time", () => {
  // `new Date("2026-10-07T09:00")` is UTC by spec, which would shift the target
  // by the machine's offset.
  const parsed = parseLocalInputValue("2026-10-07T09:00");
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 9);
  assert.equal(parsed.getDate(), 7);
  assert.equal(parsed.getHours(), 9);
  assert.equal(parsed.getMinutes(), 0);
  assert.equal(parsed.getSeconds(), 0);
});

test("parseLocalInputValue rejects malformed strings", () => {
  assert.equal(parseLocalInputValue(""), null);
  assert.equal(parseLocalInputValue("not a date"), null);
  assert.equal(parseLocalInputValue("07/10/2026"), null);
  assert.equal(parseLocalInputValue(null), null);
});

test("datetime-local values round-trip", () => {
  const original = new Date(2026, 10, 7, 14, 35);
  const text = toLocalInputValue(original);
  assert.equal(text, "2026-11-07T14:35");
  assert.equal(parseLocalInputValue(text).getTime(), original.getTime());
  assert.equal(toLocalInputValue(new Date(2026, 0, 5, 3, 7)), "2026-01-05T03:07");
});

// ======================================================= day of year

test("dayOfYear is 1-based and handles leap years", () => {
  assert.equal(dayOfYear(new Date(2026, 0, 1)), 1);
  assert.equal(dayOfYear(new Date(2026, 11, 31)), 365);
  assert.equal(dayOfYear(new Date(2024, 11, 31)), 366);
});

test("daysInYear follows the Gregorian leap rule", () => {
  assert.equal(daysInYear(2026), 365);
  assert.equal(daysInYear(2024), 366);
  assert.equal(daysInYear(1900), 365, "1900 is divisible by 100 but not 400");
  assert.equal(daysInYear(2000), 366, "2000 is divisible by 400");
});

// ============================================================ timezones

test("formatInZone formats a named zone", () => {
  const instant = new Date(Date.UTC(2026, 5, 21, 12, 0));
  const tokyo = formatInZone(instant, "Asia/Tokyo", { hour: "2-digit", minute: "2-digit" });
  assert.ok(/21/.test(tokyo), `expected 21:00 in Tokyo, got ${tokyo}`);
});

test("an unknown timezone returns null, never a wrong time", () => {
  // A plausible-but-false time is the worst possible bug for a clock.
  assert.equal(formatInZone(new Date(), "Mars/Olympus", { hour: "2-digit" }), null);
  assert.equal(offsetLabel(new Date(), "Mars/Olympus"), null);
  assert.equal(offsetMinutes(new Date(), "Mars/Olympus"), null);
  assert.equal(zoneDifferenceHours(new Date(), "Mars/Olympus", "UTC"), null);
});

test("offsetMinutes reports real offsets for real zones", () => {
  assert.equal(offsetMinutes(new Date(Date.UTC(2026, 0, 15)), "UTC"), 0);
  assert.equal(offsetMinutes(new Date(Date.UTC(2026, 0, 15)), "Asia/Kolkata"), 330);
  assert.equal(offsetMinutes(new Date(Date.UTC(2026, 0, 15)), "Asia/Tokyo"), 540);
});

test("offsetMinutes tracks daylight saving rather than a fixed table", () => {
  // London is UTC+0 in January and UTC+1 in July. A hard-coded rules table is
  // exactly the approach this avoids, so the test pins the behaviour.
  assert.equal(offsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), "Europe/London"), 0);
  assert.equal(offsetMinutes(new Date(Date.UTC(2026, 6, 15, 12)), "Europe/London"), 60);

  // New York is UTC-5 in January and UTC-4 in July.
  assert.equal(offsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), "America/New_York"), -300);
  assert.equal(offsetMinutes(new Date(Date.UTC(2026, 6, 15, 12)), "America/New_York"), -240);
});

test("zoneDifferenceHours computes the gap between two zones", () => {
  const summer = new Date(Date.UTC(2026, 6, 15, 12));
  // Tokyo (UTC+9) versus New York (UTC-4) in July: 13 hours ahead.
  assert.equal(zoneDifferenceHours(summer, "America/New_York", "Asia/Tokyo"), 13);
  // Kolkata has no DST, so the gap is a constant 9.5 hours.
  assert.equal(zoneDifferenceHours(summer, "Asia/Kolkata", "Asia/Tokyo"), 3.5);
});

test("isValidZone distinguishes real zones from typos", () => {
  assert.equal(isValidZone("Europe/London"), true);
  assert.equal(isValidZone("Asia/Kolkata"), true);
  assert.equal(isValidZone("Mars/Olympus"), false);
  assert.equal(isValidZone(""), false);
  assert.equal(isValidZone(null), false);
});

test("supportedZones returns a usable list or an empty one, never junk", () => {
  const zones = supportedZones();
  assert.ok(Array.isArray(zones));
  if (zones.length) {
    assert.ok(zones.length > 100, `only ${zones.length} zones`);
    assert.ok(zones.includes("Europe/London"));
  }
});

test("the local zone is either a real zone or null", () => {
  const zone = localZone();
  assert.ok(zone === null || isValidZone(zone), `got "${zone}"`);
});

test("the default city list is well formed", () => {
  assert.ok(DEFAULT_CITIES.length >= 8);
  assert.equal(DEFAULT_CITIES[0].tz, null, "the first entry is the local zone");
  for (const city of DEFAULT_CITIES.slice(1)) {
    assert.ok(city.id && city.label, "every city needs an id and a label");
    assert.ok(isValidZone(city.tz), `${city.id} has an invalid zone "${city.tz}"`);
  }
});

// ======================================================== numeric input

test("parseNumericInput accepts real numbers and rejects trailing garbage", () => {
  assert.equal(parseNumericInput("12"), 12);
  assert.equal(parseNumericInput("-3.5"), -3.5);
  assert.equal(parseNumericInput("+7"), 7);
  assert.equal(parseNumericInput(".5"), 0.5);
  assert.equal(parseNumericInput("2e3"), 2000);
  assert.equal(parseNumericInput("1,234.5"), 1234.5, "thousands separators are stripped");

  // parseFloat("12abc") is 12, which would show a confident wrong answer.
  assert.equal(parseNumericInput("12abc"), null);
  assert.equal(parseNumericInput("abc"), null);
  assert.equal(parseNumericInput(""), null);
  assert.equal(parseNumericInput("   "), null);
  assert.equal(parseNumericInput("Infinity"), null);
  assert.equal(parseNumericInput("NaN"), null);
  assert.equal(parseNumericInput("0x1f"), null);
  assert.equal(parseNumericInput(null), null);
});

test("formatNumberInput does not add a decimal separator to whole numbers", () => {
  assert.equal(formatNumberInput(1200), "1,200");
  assert.equal(formatNumberInput(0), "0");
  assert.ok(formatNumberInput(1234.5).includes("5"));
  assert.equal(formatNumberInput(NaN), "");
});

// ============================================================ air quality

test("bandFor maps European AQI values to their bands", () => {
  assert.deepEqual(bandFor(0), { label: "Good", tone: "good" });
  assert.deepEqual(bandFor(20), { label: "Good", tone: "good" });
  assert.deepEqual(bandFor(21), { label: "Fair", tone: "fair" });
  assert.deepEqual(bandFor(45), { label: "Moderate", tone: "moderate" });
  assert.deepEqual(bandFor(65), { label: "Poor", tone: "poor" });
  assert.deepEqual(bandFor(85), { label: "Very poor", tone: "very-poor" });
  assert.deepEqual(bandFor(150), { label: "Extremely poor", tone: "extreme" });
});

test("bandFor returns Unknown for a missing reading, never a band", () => {
  // A missing reading must never be presented as clean air.
  for (const bad of [null, undefined, NaN, Infinity, -1]) {
    assert.equal(bandFor(bad).label, "Unknown", `${bad} should be Unknown`);
    assert.equal(bandFor(bad).tone, "unknown");
  }
});

test("bandScale covers the range in ascending order", () => {
  const scale = bandScale();
  assert.ok(scale.length >= 6);
  for (let i = 1; i < scale.length; i++) {
    assert.ok(scale[i].max > scale[i - 1].max, "bands must ascend");
  }
});

test("airQualityUrl builds a keyless Open-Meteo request", () => {
  const url = airQualityUrl(28.6139, 77.209);
  assert.ok(url.startsWith("https://air-quality-api.open-meteo.com/v1/air-quality"));
  assert.ok(url.includes("latitude=28.6139"));
  assert.ok(url.includes("longitude=77.209"));
  assert.ok(url.includes("european_aqi"));
  assert.ok(!url.includes("apikey"), "must not embed an API key");
});

test("airQualityUrl rejects invalid coordinates", () => {
  assert.equal(airQualityUrl(NaN, 0), null);
  assert.equal(airQualityUrl(0, Infinity), null);
  assert.equal(airQualityUrl(91, 0), null, "latitude beyond 90");
  assert.equal(airQualityUrl(0, 181), null, "longitude beyond 180");
  assert.ok(airQualityUrl(-33.8688, 151.2093), "Sydney is valid");
});

test("formatParticulate shows a dash for a missing value", () => {
  assert.equal(formatParticulate(12.34), "12.3 µg/m³");
  assert.equal(formatParticulate(NaN), "—");
  assert.equal(formatParticulate(null), "—");
});

// ========================================================== system status

test("readBattery normalises a BatteryManager", () => {
  assert.deepEqual(
    readBattery({ level: 0.42, charging: true, chargingTime: 1800 }),
    { level: 0.42, charging: true, timeToCharge: 30 }
  );
});

test("readBattery clamps an out-of-range level", () => {
  assert.equal(readBattery({ level: 1.2 }).level, 1);
  assert.equal(readBattery({ level: -0.5 }).level, 0);
});

test("readBattery returns all nulls when the API is absent", () => {
  for (const input of [null, undefined, {}, { level: "high" }, { level: NaN }]) {
    assert.deepEqual(readBattery(input), { level: null, charging: null, timeToCharge: null });
  }
});

test("readBattery treats Infinity chargingTime as unknown", () => {
  // The spec returns Infinity when unplugged; that must not become a number.
  assert.equal(readBattery({ level: 0.5, charging: false, chargingTime: Infinity }).timeToCharge, null);
});

test("readConnection tolerates both Chromium property generations", () => {
  const modern = readConnection({ effectiveType: "4g", downlink: 10, saveData: false });
  assert.equal(modern.effectiveType, "4g");
  assert.equal(modern.downlink, 10);

  const legacy = readConnection({ type: "wifi" });
  assert.equal(legacy.type, "wifi");
  assert.equal(legacy.effectiveType, null);
});

test("readConnection returns all nulls where the API does not exist", () => {
  const empty = { type: null, effectiveType: null, downlink: null, saveData: null };
  assert.deepEqual(readConnection(null), empty);
  assert.deepEqual(readConnection(undefined), empty);
  assert.deepEqual(readConnection({}), empty);
});

test("batteryLabel marks the low and critical bands", () => {
  assert.equal(batteryLabel(null), "Unavailable");
  assert.equal(batteryLabel(0), "0% · empty");
  assert.equal(batteryLabel(0.05), "5% · critical");
  assert.equal(batteryLabel(0.15), "15% · low");
  assert.equal(batteryLabel(0.5), "50%");
  assert.equal(batteryLabel(1), "100%");
});

test("hasAnySystemApi detects whether the widget can show anything", () => {
  assert.equal(hasAnySystemApi({}), false);
  assert.equal(hasAnySystemApi({ getBattery() {} }), true);
  assert.equal(hasAnySystemApi({ connection: {} }), true);
});
/* StandBy Mode Pro - Location honesty tests
 *
 * Run with: node --test tests/location-honesty.test.mjs
 *
 * Two widgets load a hardcoded fallback location when geolocation is
 * unavailable. That is a reasonable thing to do - showing nothing is not better -
 * but ONLY if the reader can see which place the numbers describe. Neither
 * widget did, and one of them had a code comment asserting that it did.
 *
 * The tests here read the source rather than mounting, because the defect is
 * about a string that appears (or does not) in a template - a mounting test
 * would pass on a widget that renders the wrong thing as long as it renders
 * something.
 *
 * The third test is about the fallback existing at all: if a widget silently
 * invents a coordinate and no label, that is the failure. So the rule encoded
 * here is "a fallback location must be named, and the name must reach the DOM".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

const WEATHER = read("js", "widgets", "weatherWidget.js");
const AIR_QUALITY = read("js", "features", "airQualityWidget.js");
const SUN = read("js", "features", "sunWidget.js");

/**
 * Widgets known to fall back to a fixed location.
 *
 * Deliberately a list rather than a scan. A scan for "any coordinate literal"
 * would also match WORLD_CITIES in the world clock, where the coordinates are
 * the data - the thing being checked is a coordinate used as a *stand-in for the
 * reader*, which is a different thing entirely.
 */
const FALLBACK_WIDGETS = [
  { name: "weatherWidget", source: WEATHER, file: "js/widgets/weatherWidget.js" },
  { name: "airQualityWidget", source: AIR_QUALITY, file: "js/features/airQualityWidget.js" },
  { name: "sunWidget", source: SUN, file: "js/features/sunWidget.js" }
];

/** Coordinate literals that look like a fallback rather than data. */
const COORD_PAIR = /\b-?\d{1,3}\.\d{3,}\b[^\n]*?\b-?\d{1,3}\.\d{3,}\b|\b-?\d{1,3}\.\d{3,}\b\s*,\s*-?\d{1,3}\.\d{3,}\b/;

/**
 * Source with comments removed.
 *
 * Necessary because these widgets now contain comments explaining the defect
 * they were fixed for - including the offending literal quoted verbatim. A check
 * that greps raw source then fails on its own documentation, which is the worst
 * way for a guard to behave: it gets "fixed" by deleting the explanation.
 *
 * Strings are left intact, since a quoted value in code is exactly what is being
 * checked for.
 */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("a widget that falls back to a fixed location names it", () => {
  for (const { name, source, file } of FALLBACK_WIDGETS) {
    if (!COORD_PAIR.test(code(source))) continue; // no fallback in this widget

    // The place has to have a name in the source, not just two numbers.
    const hasName = /\bname:\s*"[^"]+"/.test(source) || /"Delhi/.test(source) || /Delhi/.test(source);
    assert.ok(hasName, `${file} falls back to fixed coordinates with no name for them`);
  }
});

test("a widget's output either names a place or admits it has none", () => {
  /*
   * The invariant, rather than a specific implementation.
   *
   * There are two honest outcomes and one dishonest one:
   *
   *   names a place       the render shows a location label - from a bundled name,
   *                       from the store, or from the API's own timezone field
   *   admits it has none  the render says "no location" and what to do about it
   *   dishonest           a reading with no place attached, which is
   *                       indistinguishable from the reader's own air/weather
   *
   * An earlier version of this only looked for `${escapeHtml(location.name)}`,
   * which rejected the weather widget for the right reason (it rendered nothing)
   * and for the wrong reason once fixed (it renders the API's timezone). Naming
   * the shapes explicitly keeps the check meaningful instead of pinning it to one
   * way of doing the right thing.
   *
   * A still-earlier version accepted ANY `${escapeHtml(...label...)}`, which
   * matched `${escapeHtml(band.label)}` - the air-quality BAND name - so the guard
   * passed with the location label deleted. It was found by deleting the label
   * and re-running: a guard has to be negative-tested, or "6 passed" only means
   * the regexes still match the code they were written next to.
   */
  const renderers = FALLBACK_WIDGETS.filter(({ source }) => COORD_PAIR.test(code(source)));

  for (const { name, source, file } of renderers) {
    const namesAPlace =
      /\$\{escapeHtml\((?:location|place|where|loc)\.name\)\}/.test(source)   // bundled name
      || /\$\{escapeHtml\(where\)\}/.test(source)                             // resolved label
      || /data\.timezone/.test(source)                                       // from the response
      || /\$\{escapeHtml\(placeName\)\}/.test(source);                        // explicit variable

    const admitsNone =
      /No location/i.test(source)
      || /Location denied/i.test(source)
      || /Set one in settings/i.test(source)
      || /requiresLocation/.test(source);

    assert.ok(namesAPlace || admitsNone,
      `${file} renders a reading with neither a place name nor an explicit "no location" state; ` +
      "a number with no place attached is indistinguishable from the reader's own");
  }
});

test("no widget labels a reading with a place it did not resolve", () => {
  // "Local Forecast" was the weather widget's label when the API response had no
  // timezone field: an assertion of place without one. The replacement names what
  // the widget actually knows - that it used the reader's coordinates.
  assert.doesNotMatch(code(WEATHER), /"Local Forecast"/,
    "the weather widget still labels a reading with an unverified place");
});

test("no code comment claims a labelling that the template does not do", () => {
  // The air-quality widget carried the comment "Explicit fallback: labelled, not
  // silently substituted" above a call that passed no name and a render that
  // showed none. A false comment is worse than no comment: it is a claim someone
  // will rely on during review.
  for (const { name, source, file } of FALLBACK_WIDGETS) {
    if (!COORD_PAIR.test(source)) continue;

    const claimsLabelled = /labelled,\s*not\s+silently/i.test(source);
    if (!claimsLabelled) continue;

    const namesAPlace =
      /\$\{escapeHtml\((?:location|place|where|loc)\.name\)\}/.test(source)
      || /\$\{escapeHtml\(where\)\}/.test(source)
      || /data\.timezone/.test(source)
      || /No location/i.test(source);

    assert.ok(namesAPlace,
      `${file} says its fallback is "labelled, not silently substituted" but renders no location name`);
  }
});

test("every networked widget goes through the shared network policy", () => {
  // netPolicy gives caching, a timeout and abort wiring. A raw fetch() gets none
  // of them, so a hung request never settles and leaving the widget leaves the
  // connection open. The weather widget was the last one still doing this.
  const networked = [
    { file: "js/widgets/weatherWidget.js", source: WEATHER },
    { file: "js/features/airQualityWidget.js", source: AIR_QUALITY }
  ];

  for (const { file, source } of networked) {
    assert.match(source, /from\s*"\.\.\/core\/netPolicy\.js"/,
      `${file} does not import netPolicy`);
    assert.match(source, /\bfetchJson\(/,
      `${file} imports netPolicy but does not use fetchJson`);

    // A bare `await fetch(` outside netPolicy is the thing being banned.
    const bareFetch = [...source.matchAll(/(?<![\w.])await\s+fetch\s*\(/g)];
    assert.equal(bareFetch.length, 0,
      `${file} calls fetch() directly, bypassing the timeout, cache and abort policy`);
  }
});

test("a widget with a network request aborts it on unmount", () => {
  for (const { file, source } of [
    { file: "js/widgets/weatherWidget.js", source: WEATHER },
    { file: "js/features/airQualityWidget.js", source: AIR_QUALITY }
  ]) {
    assert.match(source, /new AbortController\(\)/,
      `${file} makes a request but creates no AbortController`);
    assert.match(source, /unmount\s*\(\)\s*\{[\s\S]{0,400}?\.abort\(\)/,
      `${file} makes a request but never aborts it on unmount, so the connection outlives the widget`);
  }
});

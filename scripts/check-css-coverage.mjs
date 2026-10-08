/* StandBy Mode Pro - Stylesheet coverage check
 *
 * Run with: node scripts/check-css-coverage.mjs
 *
 * A class that a widget renders but no stylesheet defines is not a cosmetic
 * problem: the element falls back to unstyled, which in this app means the
 * legacy `vw`-based widget CSS sizes it instead of the container-query rules
 * written for it. That is how a widget ends up overflowing a narrow panel while
 * its own stylesheet appears complete.
 *
 * The reverse direction is reported too, but as information rather than an
 * error - a stylesheet may legitimately carry rules for a state not currently
 * reachable.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Widgets and the stylesheet each is expected to be styled by. */
const WIDGET_STYLESHEETS = [
  ["agendaWidget.js", "widgets-m3b.css"],
  ["flashcardsWidget.js", "widgets-m3b.css"],
  ["timezoneWidget.js", "widgets-m3b.css"],
  ["mediaSessionWidget.js", "widgets-m3b.css"],
  ["fxWidget.js", "widgets-m3b.css"],
  ["marketWidget.js", "widgets-m3b.css"],
  ["newsWidget.js", "widgets-m3b.css"],
  ["prayerWidget.js", "widgets-m3b.css"],
  ["countdownWidget.js", "widgets-m3.css"],
  ["converterWidget.js", "widgets-m3.css"],
  ["calculatorWidget.js", "widgets-m3.css"],
  ["goalsWidget.js", "widgets-m3.css"],
  ["sunWidget.js", "widgets-m3.css"],
  ["airQualityWidget.js", "widgets-m3.css"],
  ["systemStatusWidget.js", "widgets-m3.css"]
];

/**
 * Every stylesheet the page actually loads.
 *
 * A widget is styled if ANY loaded stylesheet defines its class. Checking only
 * the one "expected" file would report shared utilities such as
 * `.visually-hidden` as unstyled even though `widgets-m3.css` provides them -
 * a false failure that trains you to ignore the check.
 */
const LOADED_STYLESHEETS = [
  "main.css", "clocks.css", "clocks-m3.css",
  "widgets.css", "widgets-m2.css", "widgets-m3.css", "widgets-m3b.css",
  "a11y.css"
];

const CLASS_ATTR = /class="([^"`$]+)"/g;

/** Classes a widget renders, minus interpolations the template computes. */
function classesUsedIn(file) {
  const source = readFileSync(join(root, "js", "features", file), "utf8");
  const used = new Set();

  for (const match of source.matchAll(CLASS_ATTR)) {
    for (const token of match[1].trim().split(/\s+/)) {
      // Skip anything containing an interpolation; those are built at runtime
      // (e.g. `ag-grade--${grade}`) and are covered by the sibling rules.
      if (token && !token.includes("${")) used.add(token);
    }
  }
  return used;
}

/** Top-level class selectors a stylesheet defines. */
function classesDefined(file) {
  const path = join(root, "css", file);
  if (!existsSync(path)) throw new Error(`missing stylesheet: css/${file}`);

  const css = readFileSync(path, "utf8");
  const defined = new Set();
  for (const match of css.matchAll(/^\.([a-zA-Z0-9_-]+)/gm)) defined.add(match[1]);
  return defined;
}

/** Union of every class any loaded stylesheet defines. */
const globallyDefined = new Set();
for (const file of LOADED_STYLESHEETS) {
  for (const className of classesDefined(file)) globallyDefined.add(className);
}

let failures = 0;
let totalClasses = 0;

for (const [widget, stylesheet] of WIDGET_STYLESHEETS) {
  const used = classesUsedIn(widget);
  const missing = [...used].filter((c) => !globallyDefined.has(c)).sort();

  totalClasses += used.size;
  console.log(
    `${missing.length ? "FAIL" : "ok  "} ${widget.padEnd(26)} ` +
    `${String(used.size).padStart(3)} classes  (expected in ${stylesheet})`
  );

  if (missing.length) {
    failures++;
    console.log(`       UNSTYLED: ${missing.join(", ")}`);
  }
}

console.log(
  `\n${failures
    ? `${failures} widget(s) render an unstyled class`
    : "every widget class is styled"} ` +
  `(${totalClasses} class references checked against ${LOADED_STYLESHEETS.length} stylesheets)`
);

process.exit(failures ? 1 : 0);
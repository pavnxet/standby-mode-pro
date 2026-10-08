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

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Widgets and the stylesheet each is EXPECTED to be styled by.
 *
 * The second column is advisory only - it appears in the output so a failing
 * widget points at the file someone probably needs to open. The pass/fail
 * decision is made against every loaded stylesheet, for the reason given below.
 *
 * The list of widget FILES is derived from the widget index rather than written
 * here. A hardcoded list is a list that goes stale: three stylesheets were added
 * in Milestone 4 and 5 and this array was never updated, so the new widgets'
 * classes were being checked against a set of stylesheets the page had not
 * loaded in three passes.
 *
 * SCOPE: only widgets carrying a `feature` tag - the ones this project added.
 *
 * The nine original widgets are deliberately excluded, and the reason is a real
 * open question rather than a convenience: they are styled with Tailwind utility
 * classes (`flex`, `text-xs`, `gap-2`) served by `cdn.tailwindcss.com`, so no
 * local stylesheet defines them and every one of them would report as unstyled.
 * That is the documented ADR-015 pending decision about replacing the CDN with
 * precompiled CSS. Until it is resolved, checking those widgets here would only
 * produce nine false failures, and a check that always fails is a check nobody
 * runs.
 */
const INDEX_SOURCE = readFileSync(join(root, "js", "widgets", "index.js"), "utf8");

/** local binding -> source file, from the index's own imports. */
const WIDGET_FILES = (() => {
  const byBinding = new Map();
  for (const m of INDEX_SOURCE.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
    for (const specifier of m[1].split(",")) {
      const binding = specifier.trim().split(/\s+as\s+/)[0].trim();
      if (binding) byBinding.set(binding, m[2]);
    }
  }

  // Only the entries this project added: `{ id, widget, milestone, feature }`.
  const added = new Set(
    [...INDEX_SOURCE.matchAll(/\{\s*id:\s*"([^"]+)"[\s\S]{0,140}?feature:\s*"C\d+"/g)]
      .map((m) => m[1])
  );

  const out = [];
  for (const m of INDEX_SOURCE.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*widget:\s*([A-Za-z_$][\w$]*)/g)) {
    const file = byBinding.get(m[2]);
    if (file && added.has(m[1])) out.push([file, m[1]]);
  }
  return out;
})();

/**
 * Every stylesheet the page actually loads, read from index.html.
 *
 * Derived, not listed. A hardcoded list here was the reason this check went
 * quietly blind: m4.css, screensaver.css and m5.css were added to the page and
 * not to the array, so classes defined in them read as UNSTYLED while classes
 * defined in a stylesheet nobody loads would have read as styled. A guard that
 * cannot see the files it is guarding is worse than no guard.
 *
 * A widget is styled if ANY loaded stylesheet defines its class. Checking only
 * the one "expected" file would report shared utilities such as
 * `.visually-hidden` as unstyled even though `widgets-m3.css` provides them -
 * a false failure that trains you to ignore the check.
 */
const LOADED_STYLESHEETS = [
  ...new Set(
    [...readFileSync(join(root, "index.html"), "utf8")
      .matchAll(/<link[^>]+rel="stylesheet"[^>]+href="css\/([^"]+)"/g)]
      .map((m) => m[1])
  )
];

/**
 * A stylesheet on disk that nothing loads is dead weight shipped to every reader;
 * one that is linked but missing is a 404. Both are checked, because both are
 * invisible in a review that only looks at index.html or only looks at css/.
 */
const UNLINKED = readdirSync(join(root, "css"))
  .filter((f) => f.endsWith(".css") && !LOADED_STYLESHEETS.includes(f));

let failures = 0;

for (const file of UNLINKED) {
  console.log(`FAIL css/${file} exists but no <link> in index.html loads it`);
  failures++;
}

const CLASS_ATTR = /class="([^"`$]+)"/g;

/** Classes a widget renders, minus interpolations the template computes. */
function classesUsedIn(file) {
  // `file` is the index's own import specifier, resolved relative to js/widgets/
  // rather than assumed to be js/features/. The nine original widgets live in
  // js/widgets/ and the newer ones in js/features/, so a fixed directory reads
  // nine ENOENTs and then stops.
  const source = readFileSync(join(root, "js", "widgets", file), "utf8");
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

let totalClasses = 0;

for (const [file, id] of WIDGET_FILES) {
  const used = classesUsedIn(file);
  const missing = [...used].filter((c) => !globallyDefined.has(c)).sort();

  totalClasses += used.size;
  console.log(
    `${missing.length ? "FAIL" : "ok  "} ${file.split("/").pop().padEnd(26)} ` +
    `${String(used.size).padStart(3)} classes  (${id})`
  );

  if (missing.length) {
    failures++;
    console.log(`       UNSTYLED: ${missing.join(", ")}`);
  }
}

console.log(
  `\n${failures
    ? `${failures} problem(s) found`
    : "every widget class is styled"} ` +
  `(${totalClasses} class references, ${WIDGET_FILES.length} widgets, ` +
  `${LOADED_STYLESHEETS.length} stylesheets loaded from index.html)`
);

process.exit(failures ? 1 : 0);
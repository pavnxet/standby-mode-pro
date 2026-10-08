/* Derive the remaining feature list from FEATURE_PLAN.md against what exists.
 *
 * Run: node scripts/remaining-features.mjs
 *
 * The CHANGELOG table went stale twice already - once reporting shipped features
 * as planned, and once reporting C13 as out of scope when the plan assigned it.
 * This asks the question directly instead: which plan features have no
 * corresponding shipped artefact?
 *
 * Two sources of truth, deliberately:
 *   - the plan, for what was specified
 *   - the codebase, for what exists
 * A feature counts as delivered when its named file exists AND is referenced.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const plan = readFileSync(join(ROOT, "FEATURE_PLAN.md"), "utf8");

/** Every shipped source file, repo-relative with forward slashes. */
const SHIPPED = new Map();
function walk(dir) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = `${dir}/${entry.name}`.split("\\").join("/");
    if (entry.isDirectory()) walk(rel);
    else if (/\.(js|mjs|css)$/.test(entry.name)) {
      SHIPPED.set(rel, readFileSync(join(ROOT, rel), "utf8"));
    }
  }
}
walk("js");
walk("css");

// Not under js/ or css/, but named by the plan as a feature's artefact.
for (const name of ["sw.js", "manifest.webmanifest"]) {
  if (existsSync(join(ROOT, name))) SHIPPED.set(name, readFileSync(join(ROOT, name), "utf8"));
}

/** id -> { milestone, title, files[] } */
const features = new Map();
let current = null;
for (const line of plan.split(/\r?\n/)) {
  const heading = /^### ([A-J]\d+)\b[^\n]*\*\*(M\d)\*\*/.exec(line);
  if (heading) {
    current = {
      id: heading[1],
      milestone: heading[2],
      title: line.replace(/^### /, "").replace(/\s*-\s*\*\*M\d\*\*.*/, "").trim(),
      files: [],
      shipped: false
    };
    features.set(current.id, current);
    continue;
  }
  if (!current) continue;

  // Files: `js/foo/bar.js` (new) - ... Deps: ...
  const filesLine = /\*\*Files:\*\*(.*)/.exec(line);
  if (filesLine) {
    for (const m of filesLine[1].matchAll(/`([^`]+\.(?:js|mjs|css))`/g)) current.files.push(m[1]);
  }
  // "Files: js/foo.js (EXISTING)" or a bare path with no backticks.
  // The forward slash inside the lookbehind's character class has to be escaped:
  // an unescaped one terminates the regex literal and the file fails to parse.
  for (const m of line.matchAll(/(?<![\w\/`])(js\/[\w./-]+\.(?:js|mjs|css))/g)) {
    if (!current.files.includes(m[1])) current.files.push(m[1]);
  }
}

/*
 * A feature counts as shipped when a file it names exists on disk.
 *
 * Deliberately the only rule. An earlier version also searched the CONTENTS of
 * shipped files for the feature's basename, which made almost everything look
 * delivered - a module is named in an import line whether or not the feature it
 * belongs to was ever built. A weaker test that reports "done" is worse than no
 * test at all, because it removes the reason to look.
 *
 * Paths in the plan are not consistent - some repo-relative, some written relative
 * to js/ - so a name is resolved by basename.
 */
for (const feature of features.values()) {
  feature.shipped = feature.files.some((file) => {
    if (SHIPPED.has(file)) return true;
    const base = file.split("/").pop();
    return [...SHIPPED.keys()].some((key) => key.endsWith("/" + base));
  });
}

const rows = [...features.values()];
const missing = rows.filter((f) => !f.shipped);

console.log(`plan features parsed:   ${rows.length}`);
console.log(`with a named artefact:  ${rows.filter((f) => f.files.length).length}`);
console.log(`artefact found:         ${rows.filter((f) => f.shipped).length}`);
console.log(`NOT found:              ${missing.length}\n`);

const byMilestone = new Map();
for (const f of missing) {
  if (!byMilestone.has(f.milestone)) byMilestone.set(f.milestone, []);
  byMilestone.get(f.milestone).push(f);
}
for (const [milestone, list] of [...byMilestone.entries()].sort()) {
  console.log(`--- ${milestone} (${list.length}) ---`);
  for (const f of list) {
    console.log(`  ${f.id.padEnd(4)} ${f.title.slice(0, 52).padEnd(54)} ${f.files[0] ?? "(no file named)"}`);
  }
}

/*
 * A second, weaker pass: does any shipped file mention a distinctive word from
 * the feature's title?
 *
 * Reported separately and never as a pass. The plan guessed many filenames wrong
 * - B1 names `js/layout/gridEngine.js` and the work landed in
 * `js/core/layoutEngine.js` - so "no file by that name" is not the same as "not
 * built". This catches the ones whose subject appears in the codebase, and the
 * residue is the list actually worth working through.
 *
 * A word is distinctive if it is longer than four characters and not a stop word.
 * Short words match far too much to mean anything.
 */
const STOP = new Set(["with", "from", "that", "this", "into", "your", "each", "full",
  "live", "only", "over", "plus", "mode", "auto", "them", "then", "than", "when",
  "what", "will", "were", "have", "been", "also", "more", "most", "some", "such"]);

const reallyMissing = missing.filter((f) => {
  const words = f.title.toLowerCase().match(/[a-z]{5,}/g) || [];
  const distinctive = [...new Set(words.filter((w) => !STOP.has(w)))];
  if (!distinctive.length) return false;

  return !distinctive.some((word) =>
    [...SHIPPED.values()].some((body) => body.toLowerCase().includes(word))
  );
});

console.log(`\nnot found by name, and no trace of their subject in the code: ${reallyMissing.length}`);
for (const f of reallyMissing) {
  console.log(`  ${f.id.padEnd(4)} ${f.title.slice(0, 60)}`);
}

/* Find exported symbols that nothing imports.
 *
 * Run: node scripts/find-unused-exports.mjs
 *
 * The orphan check answers "is this file reachable". This answers the harder
 * question - "is this code inside a reachable file actually used" - which is where
 * the remaining dead weight is, and where the CI size budget can be met without
 * deleting a feature.
 *
 * A symbol counts as used only if some file imports it. The entry point being
 * imported is the root; anything not reachable from there by import edge is
 * reportable.
 *
 * Three things this deliberately does NOT do:
 *
 *  - It does not treat a `export const` on a component object as dead. Those are
 *    the module's contract and some are imported by tests, which is a real
 *    consumer.
 *  - It does not report symbols only used dynamically by a string-built import
 *    path, because it cannot see them. Those are listed separately as "unknown",
 *    not flagged.
 *  - It does not delete anything. It produces a list; a human decides.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS = resolve(ROOT, "js");

const files = new Set();
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (entry.name.endsWith(".js")) files.add(rel);
  }
})(JS);

/** Every export declaration per file. */
const exportsByFile = new Map();
const EXPORT_RE = /export\s+(?:async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST_RE = /export\s*\{([^}]+)\}/g;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const names = new Set();

  for (const m of source.matchAll(EXPORT_RE)) names.add(m[2]);
  for (const m of source.matchAll(EXPORT_LIST_RE)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  exportsByFile.set(file, names);
}

/** Every imported symbol per file, including re-exports. */
const importedAnywhere = new Set();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const m of source.matchAll(/import\s*(?:[\s\S]*?)\s*from\s*["']([^"']+)["']/g)) {
    const clause = m[0].split(/\s+from\s+/)[0];
    const named = /\{([\s\S]*)\}/.exec(clause);
    if (named) {
      for (const part of named[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) importedAnywhere.add(name);
      }
    }
  }
  // Side-effecting imports and `import x from` also count as a reference.
  for (const m of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) {
    importedAnywhere.add(m[1]);
  }
}

// Test files are a legitimate consumer: an export used only by tests is not dead.
const testFiles = readdirSync(join(ROOT, "tests"));
const testsSource = testFiles.map((f) => readFileSync(join(ROOT, "tests", f), "utf8")).join("\n");

const scriptFiles = readdirSync(join(ROOT, "scripts"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => readFileSync(join(ROOT, "scripts", f), "utf8")).join("\n");

const scriptsSource = readFileSync(join(ROOT, "index.html"), "utf8") + scriptFiles + testsSource;

let totalUnused = 0;
const unusedBytes = new Map();

for (const [file, names] of exportsByFile) {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  for (const name of names) {
    // Reference outside its own declaration.
    const used = importedAnywhere.has(name)
      || new RegExp(`\\b${name}\\b`).test(scriptsSource)
      // A default-exported component object is the module contract.
      || /^export default/.test(source) && names.size <= 1;

    if (used) continue;

    // Approximate the number of lines the declaration occupies, so the size
    // estimate is a guide rather than a guess.
    let start = lines.findIndex((l) => new RegExp(`export\\s+(async\\s+)?(function|const|let|var|class)\\s+${name}\\b`).test(l));
    if (start === -1) continue;
    let end = start;
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      end = i;
      if (depth <= 0 && i > start) break;
      if (lines[i].endsWith(";") && depth === 0) break;
    }

    const bytes = lines.slice(start, end + 1).join("\n").length;
    unusedBytes.set(file, (unusedBytes.get(file) || 0) + bytes + 1);
    totalUnused++;
  }
}

const sorted = [...unusedBytes.entries()].filter(([, bytes]) => bytes > 0)
  .sort((a, b) => b[1] - a[1]);

console.log(`files scanned:            ${files.size}`);
console.log(`unused exports found:     ${totalUnused}`);
console.log(`approx recoverable bytes: ${sorted.reduce((s, [, b]) => s + b, 0)} KB\n`);

for (const [file, bytes] of sorted.slice(0, 20)) {
  console.log(`  ${String(Math.round(bytes / 1024)).padStart(5)} KB  ${file.replace(ROOT + "\\", "")}`);
}

const totalBytes = [...files].reduce((s, f) => s + readFileSync(f).length, 0);
const recoverable = sorted.reduce((s, [, b]) => s + b, 0);
console.log(`\ncurrent:   ${Math.round(totalBytes / 1024)} KB`);
console.log(`after cut: ${Math.round((totalBytes - recoverable) / 1024)} KB`);
console.log(`budget:    ${Math.round(900 * 1024)} bytes`);

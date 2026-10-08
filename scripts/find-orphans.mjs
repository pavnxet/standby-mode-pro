/* Find JavaScript modules nothing imports.
 *
 * Run: node scripts/find-orphans.mjs
 *
 * The CI size budget counts every .js file under js/, whether or not it is
 * reachable from the entry point. So an orphan module counts against a gate it
 * never contributes to - and the budget is already over, which makes this the
 * cheapest honest saving available before adding anything.
 *
 * Reachability is computed from the static import graph. Dynamic imports are
 * followed too, but their target is usually built from a string, so anything only
 * reached dynamically is listed separately rather than reported as an orphan.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS_DIR = resolve(ROOT, "js");

const all = new Set();
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (entry.name.endsWith(".js")) all.add(rel);
  }
}
walk(JS_DIR);

/** module -> every module path it statically imports. */
const edges = new Map();
const importRe = /(?:^|[\s;{}(])import\s+(?:[\s\S]*?)\s+from\s*["']([^"']+)["']/g;
const dynamicRe = /import\s*\(\s*["']([^"']+)["']/g;

for (const file of all) {
  const source = readFileSync(file, "utf8");
  const targets = new Set();

  for (const m of source.matchAll(importRe)) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const target = resolve(dirname(file), spec);
      if (existsSync(target)) targets.add(target);
    }
  }
  for (const m of source.matchAll(dynamicRe)) {
    const spec = m[1];
    if (spec.startsWith("./") || spec.startsWith("../")) {
      targets.add(`${resolve(dirname(file), spec)}  (dynamic)`);
    }
  }
  edges.set(file, targets);
}

// Reachable from the entry point, plus anything index.html loads directly.
const ENTRY = resolve(JS_DIR, "app.js");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const roots = [ENTRY];
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  if (m[1].endsWith(".js") && !m[1].includes("cdn.tailwindcss")) {
    roots.push(resolve(ROOT, m[1]));
  }
}
for (const m of html.matchAll(/import\s+["']([^"']+)["']/g)) {
  roots.push(resolve(ROOT, m[1]));
}

const seen = new Set();
const queue = [...roots.filter((r) => existsSync(r))];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  for (const target of edges.get(file) ?? []) {
    const clean = target.replace("  (dynamic)", "");
    if (all.has(clean)) queue.push(clean);
  }
}

const orphans = [...all].filter((f) => !seen.has(f)).sort();
const bytes = orphans.reduce((sum, f) => sum + readFileSync(f).length, 0);

console.log(`js modules:            ${all.size}`);
console.log(`reachable:             ${seen.size}`);
console.log(`unreachable:           ${orphans.length}`);
console.log(`unreachable size:      ${Math.round(bytes / 1024)} KB\n`);

for (const file of orphans) {
  const kb = readFileSync(file).length / 1024;
  console.log(`  ${kb.toFixed(1).padStart(6)} KB  ${file.replace(ROOT + "\\", "")}`);
}

const total = [...all].reduce((sum, f) => sum + readFileSync(f).length, 0);
console.log(`\nall js: ${Math.round(total / 1024)} KB   after removing orphans: ` +
  `${Math.round((total - bytes) / 1024)} KB`);

/* Compare Lighthouse runs across a series of commits.
 *
 * Run: node scripts/lighthouse-compare.mjs <report> [<report> ...]
 *
 * Every score printed here is read out of a report file. Nothing is estimated and
 * nothing is filled in from a previous run - a missing run is printed as missing,
 * because a plausible-looking number that was not measured is worse than no
 * number at all.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("usage: node scripts/lighthouse-compare.mjs <report.json> [...]");
  process.exit(2);
}

const runs = files.map((name) => {
  try {
    const report = JSON.parse(readFileSync(resolve(ROOT, name), "utf8"));
    return { name, report, ok: true };
  } catch (err) {
    return { name, error: err.message, ok: false };
  }
});

for (const run of runs) {
  if (!run.ok) console.log(`SKIP ${run.name}: ${run.error}`);
}
const good = runs.filter((r) => r.ok);
if (!good.length) process.exit(1);

const pad = (s, n) => String(s).padEnd(n);
const cols = good.map((r) => r.name.replace(/^lighthouse-/, "").replace(/\.json$/, ""));

console.log(`Lighthouse ${good[0].report.lighthouseVersion}  |  ` +
  `${good[0].report.configSettings.formFactor}, ${good[0].report.configSettings.throttlingMethod} throttling\n`);
console.log(pad("category", 18) + cols.map((c) => pad(c, 16)).join(""));
for (const key of Object.keys(good[0].report.categories)) {
  const row = good.map((r) => pad(Math.round(r.report.categories[key].score * 100), 16));
  console.log(pad("  " + key, 18) + row.join(""));
}

console.log("");
console.log(pad("metric", 28) + cols.map((c) => pad(c, 16)).join(""));
for (const id of ["first-contentful-paint", "largest-contentful-paint", "speed-index",
                  "total-blocking-time", "cumulative-layout-shift"]) {
  const row = good.map((r) => pad(r.report.audits[id]?.displayValue ?? "—", 16));
  console.log(pad(id, 28) + row.join(""));
}

console.log("");
const thirdParty = (r) => r.audits["network-requests"].details.items
  .filter((i) => !i.url.includes("localhost"));
console.log(pad("third-party requests", 28) +
  good.map((r) => pad(String(thirdParty(r.report).length), 16)).join(""));
console.log(pad("third-party KB", 28) +
  good.map((r) => pad(
    Math.round(thirdParty(r.report).reduce((s, i) => s + (i.transferSize || 0), 0) / 1024),
    16)).join(""));
console.log(pad("render-blocking est", 28) +
  good.map((r) => {
    const audit = r.report.audits["render-blocking-resources"];
    const ms = audit?.details?.items?.reduce((s, i) => s + i.wastedMs, 0) ?? 0;
    return pad((ms / 1000).toFixed(2) + "s", 16);
  }).join(""));

console.log("");
console.log("third-party origins in the final run:");
const origins = new Map();
for (const item of thirdParty(good[good.length - 1].report)) {
  const host = new URL(item.url).host;
  origins.set(host, (origins.get(host) || 0) + 1);
}
for (const [host, count] of origins) console.log(`  ${host} (${count})`);

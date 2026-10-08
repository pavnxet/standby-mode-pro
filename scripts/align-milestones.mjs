/* One-off: align every widget's milestone tag with FEATURE_PLAN.md.
 *
 * Run: node scripts/align-milestones.mjs
 *
 * Eleven widgets were tagged "M3" because they were BUILT in the Milestone 3
 * pass, while the plan assigns those features to M2. The build pass is already
 * recorded in git history and in CHANGELOG.md; the tag should record which
 * milestone in the plan the feature belongs to, because that is the stable,
 * checkable fact. A tag that means "when I got round to it" cannot be verified
 * against anything.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** feature id -> milestone, parsed from the plan's own headings. */
function planMilestones(plan) {
  const out = {};
  for (const line of plan.split(/\r?\n/)) {
    // The plan separates heading parts with middot and em-dash, so the marker
    // is matched anywhere on the line rather than after a literal hyphen.
    const match = /^### (C\d+)\b[^\n]*\*\*(M\d)\*\*/.exec(line);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const plan = readFileSync(join(ROOT, "FEATURE_PLAN.md"), "utf8");
const expected = planMilestones(plan);

const target = join(ROOT, "js", "widgets", "index.js");
const original = readFileSync(target, "utf8");

const lines = original.split("\n");
const rewrites = [];

const updated = lines.map((line, index) => {
  const feature = /feature:\s*"(C\d+)"/.exec(line)?.[1];
  const tag = /milestone:\s*"(M\d)"/.exec(line)?.[1];
  if (!feature || !tag) return line;

  const want = expected[feature];
  if (!want || want === tag) return line;

  rewrites.push({
    line: index + 1,
    id: /id:\s*"([^"]+)"/.exec(line)?.[1] ?? "?",
    from: tag,
    to: want
  });
  return line.replace(/milestone:\s*"M\d"/, `milestone: "${want}"`);
});

if (rewrites.length === 0) {
  console.log("no milestone tags needed changing");
} else {
  for (const r of rewrites) {
    console.log(`  ${r.id.padEnd(12)} ${r.from} -> ${r.to}   (line ${r.line})`);
  }
  writeFileSync(target, updated.join("\n"));
  console.log(`\nrewrote ${rewrites.length} milestone tags`);
}

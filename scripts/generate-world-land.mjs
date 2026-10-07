/* Generates js/clocks/_shared/worldLand.js from Natural Earth 110m land.
 *
 * Run: node scripts/generate-world-land.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * FEATURE_PLAN.md A6 (day/night terminator clock) needs a world outline. The
 * first implementation hand-wrote continent coordinates, and at desk-display
 * scale the result was an unrecognisable blob - the shapes carried no
 * geographic meaning at all. Fabricating map data is worse than omitting it.
 *
 * This script takes the authoritative source (Natural Earth, public domain),
 * projects each ring to the equirectangular space the clock renders in, and
 * emits a compact coordinate string. The generated file is committed, so the
 * app itself ships no build step and makes no network request: the geometry is
 * a static asset like any stylesheet.
 *
 * Size matters. 5091 source points at 0.1 degree precision would be ~25 KB of
 * coordinates. Douglas-Peucker simplification plus coordinate quantisation
 * brings it to a few KB with no visible loss at the 720x360 render size.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = process.argv[2] || join(process.env.TEMP || ".", "ne_land.geojson");
const TARGET = join(ROOT, "js", "clocks", "_shared", "worldLand.js");

// Coordinates are stored as integers scaled by this factor, so the payload
// avoids a decimal point and a trailing ".0" on every whole degree. At 0.1
// degree precision this is ~11 km, far below one screen pixel at 720px wide
// (which is 0.5 degrees per pixel), so nothing is lost visually.
const SCALE = 10;

// Simplification tolerance in degrees. 0.6 degrees is roughly one pixel at the
// render size, so the shape is preserved exactly as displayed.
const TOLERANCE = 0.6;

/** Perpendicular distance from p to the segment ab, in degrees. */
function segmentDistance(p, a, b) {
  let [x, y] = a;
  const [x1, y1] = a;
  const [x2, y2] = b;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    x = x1 - p[0];
    y = y1 - p[1];
  } else {
    const t = ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    x = x1 + clamped * dx;
    y = y1 + clamped * dy;
  }

  return Math.hypot(p[0] - x, p[1] - y);
}

/**
 * Douglas-Peucker. Iterative rather than recursive: Natural Earth contains
 * rings with several thousand points, which would blow the call stack.
 */
function simplify(points, tolerance) {
  if (points.length <= 2) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let index = -1;

    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }

    if (maxDistance > tolerance && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/** Rings below this many points contribute no recognisable shape. */
const MIN_RING_POINTS = 4;

function main() {
  const geo = JSON.parse(readFileSync(SOURCE, "utf8"));

  const rings = [];
  let sourcePoints = 0;
  let simplifiedPoints = 0;

  for (const feature of geo.features) {
    const geometry = feature.geometry;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

    for (const polygon of polygons) {
      // Only the outer ring. Natural Earth's 110m land set has no meaningful
      // interior rings at this scale, and including holes would add nothing.
      const outer = polygon[0];
      if (!outer || outer.length < MIN_RING_POINTS) continue;

      sourcePoints += outer.length;

      const simplified = simplify(outer, TOLERANCE);
      if (simplified.length < MIN_RING_POINTS) continue;

      const quantised = simplified.map(([lon, lat]) => [
        Math.round(lon * SCALE),
        Math.round(lat * SCALE)
      ]);

      simplifiedPoints += quantised.length;
      rings.push(quantised);
    }
  }

  // Largest first so the renderer can draw big landmasses before small ones
  // and the ordering is stable across regenerations.
  rings.sort((a, b) => b.length - a.length);

  const payload = rings
    .map((ring) => ring.map(([lon, lat]) => `${lon},${lat}`).join(" "))
    .join("|");

  const body = `/* StandBy Mode Pro - World Land Outlines
 *
 * GENERATED FILE - do not edit by hand.
 * Regenerate with: node scripts/generate-world-land.mjs
 *
 * Source: Natural Earth 110m land (public domain), downloaded from
 * raw.githubusercontent.com/nvkelso/natural-earth-vector
 *
 * ${sourcePoints} source points simplified to ${simplifiedPoints} across ${rings.length} rings
 * (Douglas-Peucker at ${TOLERANCE} degrees, coordinates quantised to ${1 / SCALE} degrees).
 *
 * Coordinates are longitude,latitude in tenths of a degree, pairs separated by
 * spaces and rings separated by "|". Equirectangular projection, so
 * x = (lon + 180) / 360.
 */

const RAW = "${payload}";

/** Parsed once at module load: [[ [lon, lat], ... ], ...] in real degrees. */
export const LAND_RINGS = RAW.split("|").map((ring) =>
  ring.split(" ").map((pair) => {
    const comma = pair.indexOf(",");
    return [
      Number(pair.slice(0, comma)) / ${SCALE},
      Number(pair.slice(comma + 1)) / ${SCALE}
    ];
  })
);

/**
 * Projects a ring to SVG path data for the clock's 720x360 viewBox.
 * Closes each subpath so fills do not leak between rings.
 */
export function landPaths(width = 720, height = 360) {
  return LAND_RINGS
    .map((ring) => {
      const d = ring
        .map(([lon, lat], i) => {
          const x = ((lon + 180) / 360) * width;
          const y = ((90 - lat) / 180) * height;
          return \`\${i === 0 ? "M" : "L"} \${x.toFixed(1)} \${y.toFixed(1)}\`;
        })
        .join(" ");
      return \`\${d} Z\`;
    })
    .join(" ");
}
`;

  writeFileSync(TARGET, body, "utf8");

  const bytes = Buffer.byteLength(body);
  console.log(
    `worldLand.js written: ${rings.length} rings, ` +
    `${sourcePoints} -> ${simplifiedPoints} points, ${(bytes / 1024).toFixed(1)} KB`
  );
}

main();
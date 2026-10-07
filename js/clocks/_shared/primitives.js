/* StandBy Mode Pro - Shared Clock Primitives
 *
 * FEATURE_PLAN.md A17. AUDIT.md T5 recorded that all 11 original clock modules
 * duplicated the same DOM-scaffold boilerplate. These helpers exist so the new
 * faces do not add more copies.
 *
 * Everything here is a pure function or a string builder. Nothing touches the
 * DOM until a clock calls it, which keeps the pieces trivially testable.
 */

import { toRoman } from "./numeralMap.js";

/**
 * SVG polar-to-cartesian, with 0 degrees at 12 o'clock and clockwise positive.
 * Used by every analog dial.
 */
export function polarToXY(cx, cy, radius, degrees) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad)
  };
}

/**
 * Builds an SVG arc path between two clock positions.
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} startAngle degrees clockwise from 12
 * @param {number} endAngle
 * @param {boolean} counterClockwise
 */
export function arcPath(cx, cy, radius, startAngle, endAngle, counterClockwise = false) {
  const start = polarToXY(cx, cy, radius, startAngle);
  const end = polarToXY(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = counterClockwise ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Renders a hand as a path with a counterweight tail.
 * @param {'hour'|'minute'|'second'} kind
 */
export function handPath(cx, cy, length, kind, angle) {
  const widths = {
    hour: { w: 6, tail: 14, tip: 12 },
    minute: { w: 4, tail: 18, tip: 8 },
    second: { w: 2, tail: 26, tip: 16 }
  }[kind] || { w: 4, tail: 12, tip: 8 };

  const tip = polarToXY(cx, cy, length, angle);
  const left = polarToXY(cx, cy, -widths.tail, angle - 90);
  const right = polarToXY(cx, cy, -widths.tail, angle + 90);
  const tipLeft = polarToXY(cx, cy, -widths.tip, angle - 90);
  const tipRight = polarToXY(cx, cy, -widths.tip, angle + 90);

  // A hand is a single closed shape: the counterweight tail is produced by
  // extending the base past the pivot, so it needs no separate subpath. The
  // earlier version appended a zero-length "M ... l 0.01 0" segment, which is
  // not a rendered tail at all.
  return [
    `M ${left.x.toFixed(2)} ${left.y.toFixed(2)}`,
    `L ${tipLeft.x.toFixed(2)} ${tipLeft.y.toFixed(2)}`,
    `L ${tip.x.toFixed(2)} ${tip.y.toFixed(2)}`,
    `L ${tipRight.x.toFixed(2)} ${tipRight.y.toFixed(2)}`,
    `L ${right.x.toFixed(2)} ${right.y.toFixed(2)}`,
    "Z"
  ].join(" ");
}

/**
 * Hour tick marks around a dial.
 * @param {object} spec
 * @param {number} [spec.count] Number of ticks, default 12.
 * @param {number} [spec.every] Emphasise every Nth tick, default 3 (quarters).
 * @param {number} [spec.inner] Inner radius as a fraction of the dial radius.
 */
export function tickMarks({ cx, cy, radius, count = 12, every = 3, inner = 0.88, major = 0.78 } = {}) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 360;
    const isMajor = i % every === 0;
    const from = polarToXY(cx, cy, radius * (isMajor ? major : inner), angle);
    const to = polarToXY(cx, cy, radius, angle);
    const width = isMajor ? radius * 0.045 : radius * 0.018;
    out += `<line x1="${from.x.toFixed(2)}" y1="${from.y.toFixed(2)}" x2="${to.x.toFixed(2)}" y2="${to.y.toFixed(2)}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" />`;
  }
  return out;
}

/** Numerals positioned around a dial, honouring Roman/word variants. */
export function dialNumerals({ cx, cy, radius, style = "arabic", size = 16 } = {}) {
  let out = "";
  for (let i = 1; i <= 12; i++) {
    const angle = (i / 12) * 360;
    const pos = polarToXY(cx, cy, radius * 0.66, angle);
    // Only ever "I".."XII" or "1".."12", both built here, so there is nothing
    // untrusted to escape.
    const label = style === "roman" ? toRoman(i) : String(i);
    out += `<text x="${pos.x.toFixed(2)}" y="${pos.y.toFixed(2)}" font-size="${size}" text-anchor="middle" dominant-baseline="central" class="dial-numeral">${label}</text>`;
  }
  return out;
}

/**
 * A full SVG analog dial: face, ticks, numerals and three named hands.
 * The caller updates the hands by transform, not by re-rendering.
 */
export function analogDialSvg({ size = 260, style = "arabic", numeralStyle = "" } = {}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  return `
    <svg class="analog-dial ${numeralStyle}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${radius + size * 0.06}" class="dial-bezel" />
      <circle cx="${cx}" cy="${cy}" r="${radius}" class="dial-face" />
      <g class="dial-ticks">${tickMarks({ cx, cy, radius })}</g>
      <g class="dial-numerals">${dialNumerals({ cx, cy, radius, style, size: size * 0.1 })}</g>
      <path class="dial-hand dial-hand--hour" d="" />
      <path class="dial-hand dial-hand--minute" d="" />
      <path class="dial-hand dial-hand--second" d="" />
      <circle cx="${cx}" cy="${cy}" r="${size * 0.014}" class="dial-pin" />
    </svg>
  `;
}

/**
 * Returns the rotation for each hand in degrees, from 12 o'clock.
 * Seconds are continuous for a smooth sweep; hour and minute are discrete.
 */
export function handAngles({ hours, minutes, seconds }) {
  return {
    hour: ((hours % 12) + minutes / 60) * 30,
    minute: (minutes + seconds / 60) * 6,
    second: (seconds + 0) * 6
  };
}

/**
 * A 7x5 dot-matrix character set. Each glyph is a list of "row:bits" pairs,
 * which is far more compact than per-cell markup and renders identically.
 */
/**
 * A 7x5 dot-matrix character set, one base-32 digit per row.
 *
 * The obvious representation - an array of [rowIndex, bitmask] pairs - costs
 * ~53 characters per glyph. Each glyph is exactly seven rows of five bits, so
 * one base-32 digit per row encodes all of it in seven characters with no loss.
 * Rows absent from a glyph are simply 0.
 *
 * Decoded once at module load; the render path still sees plain bitmasks.
 */
const ROW_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUV";

/** @type {Record<string, string>} */
const DOT_GLYPHS_ENCODED = {
  "0": "EHHHHHE",
  "1": "046444V",
  "2": "EH1248V",
  "3": "V12E11V",
  "4": "259HV11",
  "5": "VGGF11U",
  "6": "EGGFHHE",
  "7": "V123588",
  "8": "EHHEHHE",
  "9": "EHHF11E",
  ":": "0080080",
  ".": "0000008",
  "A": "EHHVHHH",
  "B": "UHHUHHU",
  "C": "EGGGGGE",
  "D": "UHHHHHU",
  "E": "VGGUGGV",
  "F": "VGGUGGG",
  "G": "EGGNHHE",
  "H": "HHHVHHH",
  "K": "HIKOKIH",
  "L": "GGGGGGV",
  "M": "HRLLHHH",
  "N": "HPLJHHH",
  "O": "EHHHHHE",
  "P": "UHHUGGG",
  "R": "UHHUKIH",
  "S": "FGGE11U",
  "T": "V444444",
  "U": "HHHHHHE",
  "V": "HHHHHA4",
  "W": "HHHLLLA",
  "X": "HHA4AHH",
  "Y": "HHA4444",
  "Z": "V1248GV",
  "-": "000V000",
  " ": "0000000",
  "/": "1248GGG"
};

/** Decoded once at module load into [rowIndex, bitmask] pairs per glyph. */
const DOT_GLYPHS = Object.fromEntries(
  Object.entries(DOT_GLYPHS_ENCODED).map(([char, encoded]) => [
    char,
    Array.from(encoded)
      .map((digit, row) => [row, ROW_ALPHABET.indexOf(digit)])
      .filter(([, bits]) => bits !== 0)
  ])
);

/**
 * Renders one character as an SVG dot matrix.
 * @param {string} char
 * @param {{ cell?: number, gap?: number, onClass?: string, offClass?: string }} [options]
 */
export function dotMatrixGlyph(char, options = {}) {
  const cell = options.cell ?? 8;
  const gap = options.gap ?? 2;
  const onClass = options.onClass ?? "dm-on";
  const offClass = options.offClass ?? "dm-off";

  const rows = DOT_GLYPHS[String(char).toUpperCase()];
  const size = cell * 5 + gap * 4;

  if (!rows) {
    // Unknown glyph: an explicit blank, never a guessed shape.
    return `<svg class="dm-glyph" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>`;
  }

  let cells = "";
  for (const [row, bits] of rows) {
    for (let col = 0; col < 5; col++) {
      const on = (bits >> (4 - col)) & 1;
      cells += `<rect class="${on ? onClass : offClass}" x="${col * (cell + gap)}" y="${row * (cell + gap)}" width="${cell}" height="${cell}" rx="${cell * 0.18}"/>`;
    }
  }

  return `<svg class="dm-glyph" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${cells}</svg>`;
}

/** A dot-matrix grid for a whole string, as a single SVG (one per cell). */
export function dotMatrixGrid(text, options = {}) {
  const cell = options.cell ?? 6;
  const gap = options.gap ?? 2;
  const charWidth = cell * 5 + gap * 4;
  const step = charWidth + (options.charGap ?? gap * 3);
  const chars = Array.from(String(text));
  const width = Math.max(1, chars.length * step - (options.charGap ?? gap * 3));
  const height = cell * 5 + gap * 4;

  let cells = "";
  chars.forEach((char, charIndex) => {
    const rows = DOT_GLYPHS[String(char).toUpperCase()] || [];
    for (const [row, bits] of rows) {
      for (let col = 0; col < 5; col++) {
        const on = (bits >> (4 - col)) & 1;
        cells += `<rect class="${on ? (options.onClass ?? "dm-on") : (options.offClass ?? "dm-off")}"
          x="${charIndex * step + col * (cell + gap)}"
          y="${row * (cell + gap)}"
          width="${cell}" height="${cell}" rx="${cell * 0.18}"/>`;
      }
    }
  });

  // Percentage width with no fixed height: the viewBox keeps the 5x7 grid's
  // aspect ratio while the face scales to whatever panel it is mounted in.
  // A hard pixel width overflowed and clipped the leading digit.
  return `<svg class="dm-grid" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">${cells}</svg>`;
}

/** Human "3 h 12 m" / "42 m" style duration. */
export function humanDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 1) return "now";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return mins > 0 ? `${hours} h ${mins} m` : `${hours} h`;
  return `${mins} m`;
}
/* Generates the PWA PNG icons procedurally.
 *
 * Why this exists rather than a checked-in binary: the repository has a
 * zero-dependency policy and no image tooling. Node's built-in zlib is enough
 * to emit a valid PNG, so the icons are reproducible from source.
 *
 * The artwork deliberately mirrors the SVG favicon already in index.html: a
 * clock face with hands. It stays legible at 192 px, scales to any density, and
 * avoids hand-tuned digit layouts that would need image tooling to verify.
 *
 * Run: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icons");

/** CRC-32 table, required by the PNG chunk format. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba Row-major RGBA, length width*height*4.
 */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const mix = (a, b, t) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));

/** Signed distance from a point to a rounded rectangle's boundary (negative = inside). */
function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance from a point to a line segment. */
function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
  return Math.hypot(apx - abx * t, apy - aby * t);
}

function drawIcon(size, maskable) {
  const rgba = new Uint8Array(size * size * 4);
  const half = size / 2;

  // Geometry in normalised [0..1] icon space, then scaled.
  const inset = maskable ? 0.14 : 0.0;
  const s = 1 - inset * 2;
  const at = (v) => (inset + v * s) * size;

  const bgRadius = maskable ? 0.5 * s * size : 0.22 * size;

  // Face geometry.
  const faceCx = at(0.5);
  const faceCy = at(0.5);
  const faceR = 0.34 * s * size;

  const handWidth = Math.max(1.5, 0.055 * s * size);
  // Ring stroke half-width: thin, so the dial keeps an open centre.
  const ringHalfWidth = Math.max(1, 0.045 * s * size);
  const hourLen = faceR * 0.52;
  const minLen = faceR * 0.80;
  // 10:08 — the classic watch-advertising pose, which reads as a clock at any size.
  const hourAngle = -Math.PI / 2 + (10 + 8 / 60) * (Math.PI / 6);
  const minAngle = -Math.PI / 2 + (8 / 60) * (Math.PI / 30);

  const accent = [96, 165, 250];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;

      // Background plate.
      const dBg = sdRoundRect(px, py, half, half, half, half, bgRadius);
      if (dBg > 0.5) continue;

      // Diagonal gradient background.
      const t = (px / size + py / size) / 2;
      let r = mix(15, 2, t), g = mix(23, 6, t), b = mix(42, 23, t);
      let a = 255;

      const dFace = Math.hypot(px - faceCx, py - faceCy) - faceR;
      // Anti-aliased STROKE, not a filled disc: the distance must be taken to
      // the ring's centre line, so the band is |dFace| and only a fixed-width
      // slice of it is opaque.
      const ringAlpha = Math.max(0, Math.min(1, 0.5 - Math.abs(dFace) + ringHalfWidth));
      if (ringAlpha > 0) {
        r = mix(r, accent[0], ringAlpha);
        g = mix(g, accent[1], ringAlpha);
        b = mix(b, accent[2], ringAlpha);
      }

      // Hour hand.
      const hx = faceCx + Math.cos(hourAngle) * hourLen;
      const hy = faceCy + Math.sin(hourAngle) * hourLen;
      const dHour = sdSegment(px, py, faceCx, faceCy, hx, hy) - handWidth * 0.62;
      const hourAlpha = Math.max(0, Math.min(1, 0.5 - dHour));
      if (hourAlpha > 0) {
        r = mix(r, 248, hourAlpha);
        g = mix(g, 250, hourAlpha);
        b = mix(b, 252, hourAlpha);
      }

      // Minute hand.
      const mx = faceCx + Math.cos(minAngle) * minLen;
      const my = faceCy + Math.sin(minAngle) * minLen;
      const dMin = sdSegment(px, py, faceCx, faceCy, mx, my) - handWidth * 0.42;
      const minAlpha = Math.max(0, Math.min(1, 0.5 - dMin));
      if (minAlpha > 0) {
        r = mix(r, 248, minAlpha);
        g = mix(g, 250, minAlpha);
        b = mix(b, 252, minAlpha);
      }

      // Centre pin.
      const dPin = Math.hypot(px - faceCx, py - faceCy) - handWidth * 0.72;
      const pinAlpha = Math.max(0, Math.min(1, 0.5 - dPin));
      if (pinAlpha > 0) {
        r = mix(r, accent[0], pinAlpha);
        g = mix(g, accent[1], pinAlpha);
        b = mix(b, accent[2], pinAlpha);
      }

      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
    }
  }

  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true }
];

for (const { file, size, maskable } of targets) {
  const png = encodePng(size, size, drawIcon(size, maskable));
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file}  ${size}x${size}  ${png.length} bytes`);
}
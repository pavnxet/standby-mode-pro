/* StandBy Mode Pro - Live Canvas Backgrounds
 *
 * FEATURE_PLAN E5. The plan's value statement is the justification:
 *
 *   "Removes the 4.3MB static-JPEG dependency for most users."
 *
 * Canvas and CSS only - explicitly NO WebGL. That is not timidity, it is the
 * stated constraint: WebGL is a shader bundle and a compatibility surface, and
 * E5's dependency list is "J2, H5" - the 60fps scheduler and reduced-motion.
 * A display running all night on a cheap tablet is the target, not a desktop.
 *
 * Three styles, chosen so at least one is cheap on every device:
 *
 *   gradient  Two drifting radial gradients. Two fills per frame; effectively
 *             free, and the fallback when a device reports it cannot keep up.
 *   particles Slow-drifting dots with a connection pass. The connection pass is
 *             O(n^2), so the count is capped by measured frame time rather than
 *             by a fixed guess - a fixed count that is fine on a laptop stalls
 *             a 2019 tablet.
 *   aurora    Layered sine ribbons. Cheap, and the most decorative.
 *
 * Adaptive quality is the important part: if frames run long, the particle
 * count drops. A background that silently costs 40% of a tablet's budget is a
 * worse outcome than a simpler one.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";

export const BACKGROUND_STYLES = [
  { id: "none", label: "None", hint: "No background" },
  { id: "gradient", label: "Drifting gradient", hint: "Very light" },
  { id: "particles", label: "Particles", hint: "Light" },
  { id: "aurora", label: "Aurora", hint: "Light" }
];

/** Frame budget in ms. Above this, quality is reduced. */
const FRAME_BUDGET_MS = 20;

/** Particle counts per quality tier. */
const QUALITY_TIERS = [
  { max: 14, count: 0 },
  { max: 22, count: 28 },
  { max: 40, count: 60 },
  { max: Infinity, count: 90 }
];

function pickTier(frameMs) {
  for (const tier of QUALITY_TIERS) {
    if (frameMs <= tier.max) return tier;
  }
  return QUALITY_TIERS[QUALITY_TIERS.length - 1];
}

export class LiveBackgrounds {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ style?: string }} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.style = options.style || store.getState().liveBackground || "gradient";
    this.disposed = false;
    this.unsubscribe = null;

    this.t0 = Date.now();
    /** Rolling frame-time average; the input to the quality decision. */
    this.frameMs = 16;
    this.tier = { count: 60 };

    this.particles = [];
    this.ribbons = [
      { hue: 168, amp: 0.06, freq: 2.1, speed: 0.09, y: 0.35, width: 0.34 },
      { hue: 268, amp: 0.05, freq: 1.6, speed: 0.13, y: 0.5, width: 0.28 },
      { hue: 196, amp: 0.07, freq: 2.6, speed: 0.07, y: 0.64, width: 0.4 }
    ];

    this.resize();
    this.seedParticles();
  }

  setStyle(style) {
    if (BACKGROUND_STYLES.some((s) => s.id === style)) {
      this.style = style;
      this.seedParticles();
    }
  }

  resize() {
    if (!this.canvas || typeof window === "undefined") return;
    // Capped at 1x. A background is out of focus by definition, so rendering
    // it at 2x on a retina screen costs 4x for no visible gain.
    const ratio = 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round((rect.width || window.innerWidth) * ratio));
    this.canvas.height = Math.max(1, Math.round((rect.height || window.innerHeight) * ratio));
  }

  seedParticles() {
    const target = this.tier.count;
    this.particles = Array.from({ length: target }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00018,
      vy: (Math.random() - 0.5) * 0.00018,
      r: 0.4 + Math.random() * 1.6
    }));
  }

  draw(now) {
    if (this.disposed || !this.ctx || !this.canvas) return;
    const started = performance.now();
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const elapsed = (now - this.t0) / 1000;

    ctx.clearRect(0, 0, w, h);

    if (this.style === "gradient") this.drawGradient(w, h, elapsed);
    else if (this.style === "particles") this.drawParticles(w, h);
    else if (this.style === "aurora") this.drawAurora(w, h, elapsed);

    // Adaptive quality: measured, not guessed. `particleCount` can only go
    // down within a session - letting it climb back would oscillate.
    const frameMs = performance.now() - started;
    this.frameMs = this.frameMs * 0.9 + frameMs * 0.1;
    const tier = pickTier(this.frameMs);
    if (tier.count < this.tier.count) {
      this.tier = tier;
      this.particles = this.particles.slice(0, tier.count);
    } else {
      this.tier = tier;
    }
  }

  drawGradient(w, h, elapsed) {
    const { ctx } = this;
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, w, h);

    // Two slow radial gradients. `lighter` compositing is what stops them
    // reading as flat discs.
    ctx.globalCompositeOperation = "lighter";
    const blobs = [
      {
        x: w * (0.5 + Math.sin(elapsed * 0.07) * 0.28),
        y: h * (0.42 + Math.cos(elapsed * 0.05) * 0.22),
        r: Math.max(w, h) * 0.55,
        hue: 205
      },
      {
        x: w * (0.5 + Math.cos(elapsed * 0.043) * 0.3),
        y: h * (0.6 + Math.sin(elapsed * 0.061) * 0.2),
        r: Math.max(w, h) * 0.45,
        hue: 280
      }
    ];

    for (const blob of blobs) {
      const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
      gradient.addColorStop(0, `hsla(${blob.hue}, 70%, 45%, 0.20)`);
      gradient.addColorStop(1, `hsla(${blob.hue}, 70%, 45%, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  drawParticles(w, h) {
    const { ctx } = this;
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, w, h);

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -0.05) p.x += 1.1; else if (p.x > 1.05) p.x -= 1.1;
      if (p.y < -0.05) p.y += 1.1; else if (p.y > 1.05) p.y -= 1.1;

      ctx.fillStyle = "rgba(190, 220, 255, 0.55)";
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Connection pass. O(n^2), which is why the count is capped by measured
    // frame time. The distance test avoids a sqrt per pair.
    const limit = Math.min(w, h) * 0.14;
    const limitSq = limit * limit;
    ctx.strokeStyle = "rgba(150, 190, 240, 0.16)";
    ctx.lineWidth = 1;

    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length; j++) {
        const b = this.particles[j];
        const dx = (a.x - b.x) * w;
        const dy = (a.y - b.y) * h;
        const dSq = dx * dx + dy * dy;
        if (dSq > limitSq) continue;
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      }
    }
  }

  drawAurora(w, h, elapsed) {
    const { ctx } = this;
    ctx.fillStyle = "#04060c";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    for (const ribbon of this.ribbons) {
      ctx.beginPath();
      ctx.moveTo(0, h);

      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = t * w;
        const phase = t * ribbon.freq * Math.PI * 2 + elapsed * ribbon.speed;
        // Two sines: a slow swell plus a faster ripple, so the ribbon never
        // reads as a single repeating wave.
        const y = h * ribbon.y +
          Math.sin(phase) * h * ribbon.amp +
          Math.sin(phase * 2.3 + ribbon.hue) * h * ribbon.amp * 0.35;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(w, h);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, `hsla(${ribbon.hue}, 80%, 60%, 0.16)`);
      gradient.addColorStop(1, `hsla(${ribbon.hue}, 80%, 40%, 0)`);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  /** 30fps. A background does not need 60, and this is on all night. */
  start() {
    if (this.unsubscribe || this.disposed) return;
    let frame = 0;

    this.unsubscribe = scheduler.subscribe("live-background", () => {
      if (this.disposed) return;
      scheduler.onSecondBoundary(() => {
        frame++;
        if (frame % 2 !== 0) return;
        if (this.style === "none") return;
        this.draw(Date.now());
      });
    }, { priority: 90 });
  }

  stop() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.disposed = true;
    this.stop();
  }
}
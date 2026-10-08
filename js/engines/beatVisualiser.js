/* StandBy Mode Pro - Beat-Reactive Visualisers
 *
 * FEATURE_PLAN E4. Completes the feature whose energy source was built and
 * verified in the previous pass.
 *
 * The plan's constraint is the whole design:
 *
 *   "our synthesised audio has no defined beat, so 'beat-reactive' must be
 *    driven by the AnalyserNode energy band, not a BPM detector."
 *
 * A BPM detector on a brown-noise bed returns a confident, meaningless tempo,
 * and a visualiser pulsing to it would look responsive while being fiction.
 * So nothing here infers a beat. Every visual is a direct function of the
 * current energy bands: fast, honest, and correct for noise as well as music.
 *
 * Three modes, chosen for what they are good at rather than for variety:
 *
 *   bars    Per-frequency columns. Best for showing *spectral* change.
 *   pulse   One ring that scales with total level. Best for "is it playing".
 *   flow    A smoothed particle field advected by the band energy. Best for
 *           ambient use, and the least distracting at low brightness.
 *
 * Two things this file is careful about:
 *
 *  - It never runs its own rAF loop. It draws from the shared scheduler, so a
 *    hidden tab pauses all three visualisers at once and N of them cost one
 *    frame.
 *  - It renders a flat, honest frame when there is no audio. Not a fake idle
 *    animation, which would suggest sound is playing when it is not.
 */

import { soundEngine } from "../engines/soundEngine.js";
import { scheduler } from "../core/scheduler.js";

export const VISUALISER_MODES = [
  { id: "bars", label: "Bars", hint: "Shows the spectrum" },
  { id: "pulse", label: "Pulse", hint: "Follows overall level" },
  { id: "flow", label: "Flow", hint: "Ambient drift" }
];

/**
 * Smoothing applied between frames.
 *
 * Without it the bars jitter at frame rate and read as noise rather than as a
 * response to sound. With too much they lag visibly behind the audio, which is
 * worse - the point is to look *caused*.
 */
const SMOOTHING = 0.24;

/**
 * Advances a set of smoothed values toward a target.
 *
 * Pure and exported because "does the smoothing actually smooth" is exactly the
 * kind of property that is obvious when reading and wrong when coded.
 *
 * @param {number[]} current
 * @param {number[]} target
 * @returns {number[]} new array; `current` is not mutated
 */
export function smoothToward(current, target) {
  const out = new Array(Math.max(current.length, target.length)).fill(0);
  for (let i = 0; i < out.length; i++) {
    const from = Number.isFinite(current[i]) ? current[i] : 0;
    const to = Number.isFinite(target[i]) ? target[i] : 0;
    out[i] = from + (to - from) * SMOOTHING;
  }
  return out;
}

/**
 * Resamples the analyser's bins into N bars.
 *
 * Logarithmic grouping, because the ear is logarithmic: linear bins put almost
 * every visible bar in the top octave and leave the lower two thirds of the
 * display dead for a noise bed.
 *
 * @param {Uint8Array} bins
 * @param {number} count
 * @returns {number[]} values in 0..1
 */
export function resampleSpectrum(bins, count = 24) {
  const out = new Array(count).fill(0);
  if (!bins || !bins.length || count < 1) return out;

  // Skip bin 0: it is DC, and it is large enough to dominate the first bar.
  const usable = bins.length - 1;
  if (usable < 1) return out;

  for (let i = 0; i < count; i++) {
    // Log spacing across the usable bins.
    const lo = Math.floor(Math.pow(usable, i / count));
    const hi = Math.max(lo + 1, Math.floor(Math.pow(usable, (i + 1) / count)));

    let sum = 0;
    for (let j = lo; j < hi && j <= usable; j++) sum += bins[j];
    out[i] = Math.max(0, Math.min(1, sum / ((hi - lo) * 255)));
  }
  return out;
}

/**
 * Colour for a bar height.
 *
 * Deliberately NOT a red/green scale: colour-blind readers get a meaningful
 * signal from height already, and a rainbow gradient on top of it adds nothing
 * but noise. Single-hue lightness ramp instead.
 */
export function barColour(level) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  const lightness = Math.round(38 + clamped * 46);
  return `hsl(212, 85%, ${lightness}%)`;
}

export class BeatVisualiser {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ mode?: string, barCount?: number }} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.mode = options.mode || "bars";
    this.barCount = options.barCount || 24;
    this.values = new Array(this.barCount).fill(0);
    this.smoothed = { bass: 0, mid: 0, treble: 0, level: 0 };
    this.disposed = false;
    this.unsubscribe = null;

    // Particles for the `flow` mode. Pre-allocated rather than grown per frame:
    // a display left running overnight should not spend its time in the
    // garbage collector.
    this.particles = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0012,
      vy: (Math.random() - 0.5) * 0.0012,
      r: 0.6 + Math.random() * 2.2
    }));

    this.resize();
  }

  setMode(mode) {
    if (VISUALISER_MODES.some((m) => m.id === mode)) this.mode = mode;
  }

  /** Matches the backing store to the CSS size and device pixel ratio. */
  resize() {
    if (!this.canvas || typeof window === "undefined") return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round((rect.width || this.canvas.clientWidth || 300) * ratio));
    const height = Math.max(1, Math.round((rect.height || this.canvas.clientHeight || 100) * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /** Reads the energy bands and updates the smoothed state. */
  sample() {
    const bands = soundEngine.readEnergyBands();
    this.smoothed = smoothToward(
      [this.smoothed.bass, this.smoothed.mid, this.smoothed.treble, this.smoothed.level],
      [bands.bass, bands.mid, bands.treble, bands.level]
    );
    return this.smoothed;
  }

  draw() {
    if (this.disposed || !this.ctx || !this.canvas) return;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.mode === "pulse") this.drawPulse(w, h);
    else if (this.mode === "flow") this.drawFlow(w, h);
    else this.drawBars(w, h);
  }

  drawBars(w, h) {
    const ctx = this.ctx;
    const gap = Math.max(1, w * 0.004);
    const barWidth = (w - gap * (this.barCount - 1)) / this.barCount;

    ctx.fillStyle = "rgba(148, 163, 184, 0.10)";
    for (let i = 0; i < this.barCount; i++) {
      ctx.fillRect(i * (barWidth + gap), 0, barWidth, h);
    }

    for (let i = 0; i < this.barCount; i++) {
      // Log-positioned sampling so the lower octaves are not visually empty.
      const position = i / (this.barCount - 1 || 1);
      const band = position < 0.33 ? this.smoothed.bass
        : position < 0.7 ? this.smoothed.mid
          : this.smoothed.treble;

      const target = Math.max(0, Math.min(1, band * (0.45 + position * 0.55)));
      this.values[i] = this.values[i] + (target - this.values[i]) * 0.3;

      const barHeight = Math.max(1, this.values[i] * h);
      ctx.fillStyle = barColour(this.values[i]);
      ctx.fillRect(i * (barWidth + gap), h - barHeight, barWidth, barHeight);
    }
  }

  drawPulse(w, h) {
    const ctx = this.ctx;
    const level = Math.max(0, Math.min(1, this.smoothed.level * 1.8));
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(w, h) * 0.42;
    const radius = maxRadius * (0.25 + level * 0.75);

    ctx.strokeStyle = barColour(level);
    ctx.lineWidth = Math.max(1, maxRadius * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Two inner rings driven by the spectral split, so the mode is not just a
    // louder version of `bars`.
    for (const [band, scale] of [[this.smoothed.bass, 0.5], [this.smoothed.treble, 0.28]]) {
      const value = Math.max(0, Math.min(1, band * 1.8));
      ctx.strokeStyle = barColour(value);
      ctx.lineWidth = Math.max(1, maxRadius * 0.035);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * scale * (0.6 + value * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawFlow(w, h) {
    const ctx = this.ctx;
    const energy = Math.max(0, Math.min(1, this.smoothed.level * 2.2));

    for (const p of this.particles) {
      // Energy advects the field; with no audio the particles barely move, so
      // the display is calm rather than pretending to be reacting.
      p.x += p.vx * (1 + energy * 14);
      p.y += p.vy * (1 + energy * 14);

      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1;
      if (p.y > 1) p.y -= 1;

      ctx.fillStyle = barColour(energy * 0.9);
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r * (1 + energy * 2.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Starts drawing from the shared scheduler.
   *
   * ~30fps, not 60: a visualiser has no frame-accurate content, and halving the
   * frame rate halves the GPU time on a display that may be running all night.
   */
  start() {
    if (this.unsubscribe || this.disposed) return;
    let frame = 0;

    this.unsubscribe = scheduler.subscribe("beat-visualiser", () => {
      if (this.disposed) return;
      scheduler.onSecondBoundary(() => {
        frame++;
        if (frame % 2 !== 0) return; // ~30fps from the shared loop
        this.resize();
        this.sample();
        this.draw();
      });
    }, { priority: 300 });
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
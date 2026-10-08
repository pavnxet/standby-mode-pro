/* StandBy Mode Pro - Burn-In Protection Modes
 *
 * FEATURE_PLAN F3. The plan is blunt about the defect it replaces:
 *
 *   "Upgrades a 51-line implementation that shifts the *entire* stage including
 *    widgets (AUDIT M11)." and "Static elements (widgets) genuinely need
 *    protection - the current whole-stage translate does not provide it."
 *
 * That is correct and worth understanding rather than just accepting. The old
 * implementation applied `translate()` to `#main-stage`, which moves the clock,
 * the widgets, the header and the navigation together. On an OLED panel the
 * physical pixels a static widget occupies are the same pixels either way -
 * moving everything changes which content is lit, but the widget's *own* pixels
 * burn the same spot every time. Moving the whole stage protects the panel
 * about as well as doing nothing, and it shakes the layout while doing it.
 *
 * Four modes, each protecting a genuinely different failure:
 *
 *   pixel-shift   Sub-pixel translation of the content layer. Small amplitude
 *                 (a few pixels), never a visible sway.
 *   checkerboard  Alternates which half of a grid is dimmed. Moves static
 *                 content between two positions without moving anything.
 *   edge-crop     Scales content up ~1.5% and lets the overflow be clipped, so
 *                 content sits inside the lit area rather than at the extreme
 *                 panel edge where degradation is worst.
 *   static-dim    No movement at all: dims slightly for a period, then
 *                 restores. The fallback for panels where any movement causes
 *                 visible pumping, and for anyone who finds the others distracting.
 *
 * All four respect `prefers-reduced-motion`: static-dim becomes the only mode.
 */

import { store } from "../state/store.js";

/** Amplitude in pixels. Deliberately small - visible sway is a bug, not a feature. */
export const SHIFT_MAX_PX = 3;

/** Edge-crop scale. 1.5% hides roughly 6px on a 400px-wide panel edge. */
export const EDGE_CROP_SCALE = 1.015;

/** How long `static-dim` stays dimmed before restoring, in ms. */
export const STATIC_DIM_MS = 45000;

/** How much darker, as a multiplier on the content layer's opacity. */
export const STATIC_DIM_LEVEL = 0.55;

export const BURN_IN_MODES = [
  { id: "pixel-shift", label: "Pixel shift", moves: true },
  { id: "checkerboard", label: "Checkerboard", moves: true },
  { id: "edge-crop", label: "Edge crop", moves: true },
  { id: "static-dim", label: "Static dim", moves: false }
];

/**
 * The next pixel-shift offset.
 *
 * A discrete set of offsets, not a continuous random number: continuous random
 * produces values of 0.4px that sub-pixel-render into a faint shimmer, which is
 * more distracting than the burn-in it prevents. Whole pixels, or nothing.
 *
 * @param {number} index Step number, so the sequence is reproducible for tests.
 * @returns {{ x: number, y: number }}
 */
export function shiftOffset(index) {
  const steps = [
    [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1], [0, 0]
  ];
  const step = steps[((index % steps.length) + steps.length) % steps.length];
  // The final step returns to centre, so the cycle has no visible "snap".
  if (step[0] === 0 && step[1] === 0) return { x: 0, y: 0 };
  return {
    x: step[0] * SHIFT_MAX_PX,
    y: step[1] * SHIFT_MAX_PX
  };
}

/**
 * Which quadrant of the checkerboard is dimmed for a given step.
 *
 * @param {number} index
 * @returns {number} 0..3
 */
export function checkerQuadrant(index) {
  return ((index % 4) + 4) % 4;
}

/**
 * The CSS custom properties for a mode at a given step.
 *
 * Pure and exported so the mapping can be asserted directly rather than read
 * back from a computed style - which is where the "is this CSS actually
 * applying?" trap has already bitten twice in this project.
 *
 * @param {string} modeId
 * @param {number} index
 * @param {{ nowMs?: number, dimStartedAt?: number|null }} [state]
 * @returns {Record<string,string>}
 */
export function burnInVars(modeId, index, state = {}) {
  const mode = BURN_IN_MODES.find((m) => m.id === modeId) || BURN_IN_MODES[0];

  if (mode.id === "checkerboard") {
    return {
      "--burn-shift-x": "0px",
      "--burn-shift-y": "0px",
      "--burn-scale": "1",
      // The CSS uses this to dim alternating quadrants via a gradient mask.
      "--burn-quadrant": String(checkerQuadrant(index)),
      "--burn-dim": "1"
    };
  }

  if (mode.id === "edge-crop") {
    return {
      "--burn-shift-x": "0px",
      "--burn-shift-y": "0px",
      "--burn-scale": String(EDGE_CROP_SCALE),
      "--burn-quadrant": "0",
      "--burn-dim": "1"
    };
  }

  if (mode.id === "static-dim") {
    const started = state.dimStartedAt;
    // No start time means no dim. The obvious bug here is treating "elapsed 0"
    // as "dimmed", which leaves the panel permanently dimmed until something
    // else happens to reset it - and there is nothing else that would.
    const elapsed = Number.isFinite(started)
      ? (state.nowMs ?? Date.now()) - started
      : Infinity;
    const dimmed = elapsed >= 0 && elapsed < STATIC_DIM_MS;
    return {
      "--burn-shift-x": "0px",
      "--burn-shift-y": "0px",
      "--burn-scale": "1",
      "--burn-quadrant": "0",
      "--burn-dim": dimmed ? String(STATIC_DIM_LEVEL) : "1"
    };
  }

  // pixel-shift
  const offset = shiftOffset(index);
  return {
    "--burn-shift-x": `${offset.x}px`,
    "--burn-shift-y": `${offset.y}px`,
    "--burn-scale": "1",
    "--burn-quadrant": "0",
    "--burn-dim": "1"
  };
}

export class BurnInProtector {
  constructor() {
    this.timeoutId = null;
    this.stageEl = null;
    this.step = 0;
    this.dimStartedAt = null;
    this.disposed = false;
  }

  start() {
    this.stageEl = this.resolveStage();
    this.scheduleNextShift();
  }

  resolveStage() {
    if (typeof document === "undefined") return null;
    return document.getElementById("main-stage");
  }

  /** The active mode, forced to static-dim under reduced motion. */
  currentMode() {
    const config = store.getState().burnInProtection || {};

    if (prefersReducedMotion()) {
      // Movement is exactly what reduced-motion is asking us not to do. A user
      // with vestibular sensitivity should not get a stage that sways every
      // minute because their panel is OLED.
      return "static-dim";
    }
    return BURN_IN_MODES.some((m) => m.id === config.mode) ? config.mode : "pixel-shift";
  }

  scheduleNextShift() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.disposed) return;

    const config = store.getState().burnInProtection || {};
    const minutes = Math.max(1, Number(config.intervalMinutes) || 5);

    this.timeoutId = setTimeout(() => {
      if (this.disposed) return;
      this.step++;
      // static-dim dims on the first tick of a cycle and restores after
      // STATIC_DIM_MS, so the "started" timestamp is reset each cycle.
      if (this.currentMode() === "static-dim") this.dimStartedAt = Date.now();
      this.shift();
      this.scheduleNextShift();
    }, minutes * 60000);
  }

  /**
   * Applies one step.
   *
   * Writes custom properties to the root element rather than a transform on the
   * stage. A transform on the stage moves the widgets too - which is the exact
   * defect F3 exists to fix - and creates a containing block that breaks the
   * fixed-position layers.
   */
  shift() {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root || !root.style) return;

    const config = store.getState().burnInProtection || {};

    if (!config.enabled) {
      this.clear();
      return;
    }

    const vars = burnInVars(this.currentMode(), this.step, {
      nowMs: Date.now(),
      dimStartedAt: this.dimStartedAt
    });

    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    root.dataset.burnInMode = this.currentMode();
  }

  /** Removes every property this protector set. */
  clear() {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root || !root.style) return;

    root.style.removeProperty("--burn-shift-x");
    root.style.removeProperty("--burn-shift-y");
    root.style.removeProperty("--burn-scale");
    root.style.removeProperty("--burn-quadrant");
    root.style.removeProperty("--burn-dim");
    if (root.dataset) delete root.dataset.burnInMode;
  }

  stop() {
    this.disposed = true;
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.clear();
  }
}

/** Re-arms the singleton after `stop()`. The app never calls stop; tests do. */
export function restartBurnInProtector(protector) {
  protector.disposed = false;
  protector.step = 0;
  protector.dimStartedAt = null;
  protector.start();
}

/** Whether the reader has asked for less motion. */
export function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export const burnInProtector = new BurnInProtector();
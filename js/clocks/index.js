/* StandBy Mode Pro - Clock Style Index
 *
 * FEATURE_PLAN.md A1. One declarative list of every clock face.
 *
 * The registry and clockEngine both read from here, and CI asserts the three
 * stay in sync, so adding a face means touching exactly one file.
 */

import { flipClock } from "./flipClock.js";
import { neonClock } from "./neonClock.js";
import { matrixClock } from "./matrixClock.js";
import { solarClock } from "./solarClock.js";
import { bigCropClock } from "./bigCropClock.js";
import { radialClock } from "./radialClock.js";
import { dayClock } from "./dayClock.js";
import { segmentedClock } from "./segmentedClock.js";
import { analogDigitalClock } from "./analogDigitalClock.js";
import { amoledClock } from "./amoledClock.js";
import { lcarsClock } from "./lcarsClock.js";

import { wordClock } from "./wordClock.js";
import { binaryClock } from "./binaryClock.js";
import { romanClock } from "./romanClock.js";
import {
  classicAnalogClock,
  sportAnalogClock,
  minimalAnalogClock,
  vintageAnalogClock
} from "./analogSkins.js";
import { terminatorClock } from "./terminatorClock.js";
import { moonClock } from "./moonClock.js";
import { gradientClock } from "./gradientClock.js";
import { tideClock } from "./tideClock.js";
import { persianClock } from "./persianClock.js";
import { brailleClock } from "./brailleClock.js";
import { departureBoardClock } from "./departureBoardClock.js";
import { dotMatrixClock } from "./dotMatrixClock.js";
import { worldClock } from "./worldClock.js";
import { sunArcClock } from "./sunArcClock.js";
import { yearClock } from "./yearClock.js";

/**
 * Every clock face, in registry order.
 * @type {Array<{ id: string, clock: object, milestone: string }>}
 */
export const CLOCKS = [
  // --- Existing (Milestone 1) ---
  { id: "flip", clock: flipClock, milestone: "M1" },
  { id: "neon", clock: neonClock, milestone: "M1" },
  { id: "matrix", clock: matrixClock, milestone: "M1" },
  { id: "solar", clock: solarClock, milestone: "M1" },
  { id: "bigcrop", clock: bigCropClock, milestone: "M1" },
  { id: "radial", clock: radialClock, milestone: "M1" },
  { id: "day", clock: dayClock, milestone: "M1" },
  { id: "segmented", clock: segmentedClock, milestone: "M1" },
  { id: "analogdigital", clock: analogDigitalClock, milestone: "M1" },
  { id: "minimal", clock: amoledClock, milestone: "M1" },
  { id: "lcars", clock: lcarsClock, milestone: "M1" },

  // --- Milestone 3: 15 new faces ---
  { id: "word", clock: wordClock, milestone: "M3" },
  { id: "binary", clock: binaryClock, milestone: "M3" },
  { id: "roman", clock: romanClock, milestone: "M3" },
  { id: "analogclassic", clock: classicAnalogClock, milestone: "M3" },
  { id: "analogsport", clock: sportAnalogClock, milestone: "M3" },
  { id: "analogminimal", clock: minimalAnalogClock, milestone: "M3" },
  { id: "analogvintage", clock: vintageAnalogClock, milestone: "M3" },
  { id: "terminator", clock: terminatorClock, milestone: "M3" },
  { id: "moon", clock: moonClock, milestone: "M3" },
  { id: "gradient", clock: gradientClock, milestone: "M3" },
  { id: "tide", clock: tideClock, milestone: "M3" },
  { id: "persian", clock: persianClock, milestone: "M3" },
  { id: "braille", clock: brailleClock, milestone: "M3" },
  { id: "departure", clock: departureBoardClock, milestone: "M3" },
  { id: "dotmatrix", clock: dotMatrixClock, milestone: "M3" },
  { id: "worldclock", clock: worldClock, milestone: "M3" },
  { id: "sunarc", clock: sunArcClock, milestone: "M3" },
  { id: "year", clock: yearClock, milestone: "M3" }
];

/** Clocks added in Milestone 3, for the settings filter. */
export const M3_CLOCKS = CLOCKS.filter(c => c.milestone === "M3");

/**
 * Default Space layout suggestions per face category, so choosing an
 * astronomical face in Duo mode picks a sensible companion widget.
 */
export const CLOCK_CATEGORIES = Array.from(
  new Set(CLOCKS.map(c => c.clock.category || "Modern"))
).sort();
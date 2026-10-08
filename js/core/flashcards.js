/* StandBy Mode Pro - Spaced Repetition Scheduling
 *
 * FEATURE_PLAN.md C14 pure logic, split out of the widget so it is testable
 * without a DOM.
 *
 * This is a simplified SM-2: SM-2's original quality grades (0-5) were designed
 * for a specific 1987 algorithm with a specific review workflow. A desk widget
 * wants four buttons and a visible next interval, so the model is reduced to
 * four grades and an explicit box ladder.
 *
 * What is kept from SM-2:
 *  - a correct answer advances the box and lengthens the interval
 *  - a lapse resets the card to the start (this is the part that matters most;
 *    a card that never comes back after being forgotten is not reviewable)
 *  - intervals grow, but are capped so nothing disappears for years
 *  - ease is per-card, so a hard deck slows down as a whole
 *
 * What is deliberately dropped: the 0-5 quality scale, and the "repeat within
 * the same session" behaviour, which does not apply to a passive desk display.
 */

/** The four answer buttons. */
export const GRADES = ["again", "hard", "good", "easy"];

/** Per-card ease, the SM-2 factor. Bounds keep a pathological deck stable. */
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const DEFAULT_EASE = 2.5;

/** Interval ladder in days, indexed by box. Exponential beyond the ladder. */
const LADDER = [1, 2, 4, 8, 16, 32, 64];
const MAX_INTERVAL_DAYS = 365;
const MAX_BOX = LADDER.length + 2;

/**
 * Applies one review and returns the card's next state.
 *
 * Pure: the input card is never mutated, so a caller can keep a history or
 * undo a mis-click without having stored a copy first.
 *
 * @param {{box?: number, intervalDays?: number, ease?: number,
 *          reviews?: number, lapses?: number}} card
 * @param {"again"|"hard"|"good"|"easy"} grade
 * @param {number} [now] Injectable clock, so tests are not time-dependent.
 * @returns {{box: number, intervalDays: number, ease: number, reviews: number,
 *            lapses: number, lastReviewedMs: number, dueMs: number}}
 */
export function scheduleCard(card = {}, grade = "good", now = Date.now()) {
  if (!GRADES.includes(grade)) grade = "good";

  const box = Number.isInteger(card.box) && card.box >= 0 ? card.box : 0;
  const ease = clamp(
    Number.isFinite(card.ease) ? card.ease : DEFAULT_EASE,
    MIN_EASE, MAX_EASE
  );
  const reviews = Number.isInteger(card.reviews) ? card.reviews : 0;
  const lapses = Number.isInteger(card.lapses) ? card.lapses : 0;

  let nextBox = box;
  let nextEase = ease;
  let nextInterval;

  switch (grade) {
    case "again":
      // A lapse resets the card. Ease drops, which slows the whole deck down
      // for this card rather than letting it creep back to a long interval.
      nextBox = 0;
      nextEase = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      nextInterval = 1; // seen again tomorrow
      break;

    case "hard":
      // Barely advances. If it was already new, it stays new.
      nextBox = Math.max(0, box - (box > 1 ? 1 : 0));
      nextEase = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
      nextInterval = Math.max(1, Math.round(intervalFor(box) * 0.6));
      break;

    case "good":
      nextBox = Math.min(MAX_BOX, box + 1);
      nextInterval = intervalFor(nextBox);
      break;

    case "easy":
      nextBox = Math.min(MAX_BOX, box + 2);
      nextEase = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
      nextInterval = Math.round(intervalFor(nextBox) * nextEase);
      break;

    default:
      break;
  }

  nextInterval = clamp(Math.round(nextInterval), 1, MAX_INTERVAL_DAYS);

  return {
    box: nextBox,
    intervalDays: nextInterval,
    ease: nextEase,
    reviews: reviews + 1,
    lapses: lapses + (grade === "again" ? 1 : 0),
    lastReviewedMs: now,
    dueMs: now + nextInterval * 86400000
  };
}

/** Interval in days for a box, exponential beyond the ladder. */
function intervalFor(box) {
  if (box < 0) return 1;
  if (box < LADDER.length) return LADDER[box];
  // Beyond the ladder, grow geometrically from the last rung.
  const overshoot = box - LADDER.length + 1;
  return Math.min(MAX_INTERVAL_DAYS, Math.round(LADDER[LADDER.length - 1] * Math.pow(1.6, overshoot)));
}

/**
 * What each button would do, for the labels under the keypad.
 * Computed without mutating the card.
 */
export function previewIntervals(card = {}) {
  const now = Date.now();
  return GRADES.map((grade) => {
    const next = scheduleCard(card, grade, now);
    return {
      grade,
      intervalDays: next.intervalDays,
      box: next.box,
      lapses: next.lapses
    };
  });
}

/** Human label for a card's stage, for the deck header. */
export function reviewState(card = {}) {
  const box = Number.isInteger(card.box) ? card.box : 0;
  const interval = Number.isFinite(card.intervalDays) ? card.intervalDays : 0;
  const lapses = Number.isInteger(card.lapses) ? card.lapses : 0;

  if (box === 0) return { label: "Learning", tone: "learning" };
  if (interval >= 21) return { label: "Mature", tone: "mature" };
  if (lapses > 2) return { label: "Learning", tone: "learning" };
  return { label: "Young", tone: "young" };
}

/** Cards whose due time has arrived, earliest first. */
export function dueCards(cards = [], now = Date.now()) {
  return cards
    .filter((card) => card && Number.isFinite(card.dueMs) && card.dueMs <= now)
    .sort((a, b) => a.dueMs - b.dueMs);
}

/** "3 d", "2 m 40 s", "due now" - interval as a duration. */
export function formatInterval(days) {
  if (!Number.isFinite(days)) return "—";
  if (days >= 1) return `${Math.round(days)} d`;
  const hours = days * 24;
  if (hours >= 1) return `${Math.round(hours)} h`;
  return `${Math.max(1, Math.round(hours * 60))} m`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
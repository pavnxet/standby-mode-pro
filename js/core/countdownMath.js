/* StandBy Mode Pro - Countdown Date Helpers
 *
 * FEATURE_PLAN.md C5's pure logic, split out of the widget so it can be
 * unit-tested. Importing countdownWidget.js pulls in `store`, which constructs a
 * Store at module load and touches `document` - fine in a browser, fatal under
 * `node --test`.
 *
 * The two functions here exist for one specific reason: a `datetime-local` input
 * yields a LOCAL wall-clock string with no timezone, and `new Date("2026-10-07
 * T09:00")` is interpreted as UTC by specification. Doing that would place
 * every countdown hours away from what the user typed.
 */

/**
 * Splits a millisecond delta into a human breakdown.
 *
 * `passed` flips once the target is in the past, which is what makes the widget
 * count up and relabel itself instead of sitting frozen on zero.
 *
 * @param {number} deltaMs Target minus now; negative once the target has passed.
 * @returns {{ passed: boolean, days: number, hours: number, minutes: number, seconds: number }}
 */
export function splitDuration(deltaMs) {
  const passed = deltaMs < 0;
  const total = Math.floor(Math.abs(deltaMs) / 1000);
  return {
    passed,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  };
}

/**
 * The largest non-zero unit, so the headline is the most useful figure rather
 * than always "42 seconds".
 * @returns {{ value: number, unit: string }}
 */
export function headlineUnit(parts) {
  if (parts.days > 0) return { value: parts.days, unit: parts.days === 1 ? "day" : "days" };
  if (parts.hours > 0) return { value: parts.hours, unit: parts.hours === 1 ? "hour" : "hours" };
  if (parts.minutes > 0) return { value: parts.minutes, unit: parts.minutes === 1 ? "minute" : "minutes" };
  return { value: parts.seconds, unit: "seconds" };
}

/**
 * "YYYY-MM-DDTHH:MM" in local time, the format a datetime-local input expects.
 */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parses a datetime-local string as LOCAL time.
 *
 * Splits the string and uses the Date constructor's local-time fields, which
 * avoids the spec's "no timezone means UTC" rule entirely.
 *
 * @returns {Date|null} null for anything malformed, so the caller can show a
 *   message rather than storing an Invalid Date as the countdown target.
 */
export function parseLocalInputValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}
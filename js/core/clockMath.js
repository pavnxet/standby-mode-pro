/* StandBy Mode Pro - Day-of-Year Helpers
 *
 * Split out of yearClock.js so they can be unit-tested: the face module
 * imports nothing heavy, but keeping the pure arithmetic in core/ makes the
 * dependency direction obvious (faces depend on core, never the reverse).
 *
 * Both use LOCAL calendar fields. Day-of-year is a user-facing "how far through
 * the year are we", which is a local-calendar question; computing it in UTC
 * would put a New Year's Eve entry in the wrong year for most of the world.
 */

/** Day-of-year, 1-based, using local time. */
export function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

/** 365 or 366, honouring the Gregorian leap rule including century years. */
export function daysInYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}
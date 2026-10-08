/* StandBy Mode Pro - Timezone Helpers
 *
 * Split out of worldClock.js for the same reason as clockMath.js: these are
 * pure functions over Intl, and the face module is a DOM concern.
 *
 * No timezone database is bundled. Every browser that can run this app already
 * ships full ICU data; a bundled copy would be ~100 KB of the source budget for
 * information the platform provides for free.
 */

/**
 * The cities offered by the World Clock face and the C1/C20 widgets.
 * IANA zone identifiers only.
 */
export const DEFAULT_CITIES = [
  { id: "local", label: "Local", tz: null },
  { id: "nyc", label: "New York", tz: "America/New_York" },
  { id: "london", label: "London", tz: "Europe/London" },
  { id: "dubai", label: "Dubai", tz: "Asia/Dubai" },
  { id: "india", label: "India", tz: "Asia/Kolkata" },
  { id: "tokyo", label: "Tokyo", tz: "Asia/Tokyo" },
  { id: "sydney", label: "Sydney", tz: "Australia/Sydney" },
  { id: "la", label: "Los Angeles", tz: "America/Los_Angeles" }
];

/**
 * Formats a time in a named timezone.
 *
 * @returns {string|null} null when the zone is unknown. The caller must render
 *   an explicit unavailable state: falling back to the local zone would show a
 *   plausible but false time, which for a clock is the worst possible bug.
 */
export function formatInZone(date, timeZone, options = {}) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, hour12: false, ...options }).format(date);
  } catch {
    return null;
  }
}

/**
 * Short UTC offset label, e.g. "GMT+5:30".
 * @returns {string|null}
 */
export function offsetLabel(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset"
    }).formatToParts(date);
    const tz = parts.find((p) => p.type === "timeZoneName");
    return tz ? tz.value : null;
  } catch {
    return null;
  }
}

/** The machine's own IANA zone, or null if Intl cannot report one. */
export function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** True when Intl recognises the zone. Used to validate user input. */
export function isValidZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Full zone list from the platform, for the timezone converter's picker.
 *
 * @returns {string[]} sorted IANA identifiers. Returns [] where
 *   `Intl.supportedValuesOf` is unavailable, which the caller renders as an
 *   explicit "zone list unavailable" state rather than an empty dropdown.
 */
export function supportedZones() {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone").slice().sort();
    }
  } catch {
    // Fall through to the empty list below.
  }
  return [];
}

/**
 * The numeric offset in minutes for a zone at an instant.
 *
 * Computed by formatting the instant in the target zone and in UTC and
 * differencing, which is the only way that works across DST without shipping a
 * rules table.
 *
 * @returns {number|null} minutes east of UTC, or null for an unknown zone.
 */
export function offsetMinutes(date, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
    );

    const asUTC = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
    );

    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return null;
  }
}

/**
 * The difference between two zones at an instant, in hours.
 * @returns {number|null} e.g. -5.5 for New York during daylight saving.
 */
export function zoneDifferenceHours(date, fromZone, toZone) {
  const from = offsetMinutes(date, fromZone);
  const to = offsetMinutes(date, toZone);
  if (from === null || to === null) return null;
  return (to - from) / 60;
}
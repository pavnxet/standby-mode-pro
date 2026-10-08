/* StandBy Mode Pro - Prayer Times Logic
 *
 * FEATURE_PLAN.md C19, which the plan rates HIGH risk with an explicit
 * instruction: **"Marked experimental."** It is marked experimental in the UI.
 *
 * Why that instruction exists, and why this module is shaped the way it is:
 * prayer times depend on latitude AND on a calculation school (method). Different
 * schools legitimately give different Fajr and Isha times, often by 10-20
 * minutes. There is no single correct answer that this code could verify
 * against, so attempting to compute them astronomically here would mean shipping
 * numbers I cannot check - which for something a person may act on is worse
 * than not shipping it.
 *
 * So this module does NOT calculate. It reads times from Aladhan, a service
 * built for exactly this, and treats the calculation method as a user choice
 * rather than a hidden constant. The pure functions here - parsing, ordering,
 * and finding the next prayer - are the parts that ARE verifiable, and they are
 * unit-tested.
 *
 * Source verified during this milestone: api.aladhan.com `/v1/timings`, keyless,
 * CORS `Access-Control-Allow-Origin: *`, returns timings plus the Hijri date.
 */

/**
 * Calculation methods, in the order a user is most likely to want them.
 *
 * `label` is the service's own name for the school, shown verbatim so the user
 * can match it against whatever their mosque or app uses. Getting this choice
 * wrong changes the numbers, which is exactly why it is a picker and not a
 * constant.
 */
export const PRAYER_METHODS = [
  { id: 2, label: "ISNA", hint: "Islamic Society of North America" },
  { id: 3, label: "Muslim World League", hint: "Most common worldwide" },
  { id: 4, label: "Umm al-Qura, Makkah", hint: "Used in Saudi Arabia" },
  { id: 5, label: "Egyptian General Authority", hint: "Used in Egypt and the Gulf" },
  { id: 1, label: "University of Islamic Sciences, Karachi" },
  { id: 12, label: "Union des Organisations Islamiques de France" },
  { id: 13, label: "Diyanet, Türkiye" }
];

export const DEFAULT_PRAYER_METHOD = 3;

/**
 * The day's times, in the order they occur.
 *
 * `isPrayer` is false for Sunrise, which is a boundary rather than a prayer:
 * it ends the pre-dawn window and is conventionally not something you pray at.
 * Including it in "next prayer" would be wrong, but omitting it entirely loses
 * the useful information that dawn has passed.
 */
export const PRAYER_SEQUENCE = [
  { key: "Fajr", label: "Fajr", isPrayer: true },
  { key: "Sunrise", label: "Sunrise", isPrayer: false },
  { key: "Dhuhr", label: "Dhuhr", isPrayer: true },
  { key: "Asr", label: "Asr", isPrayer: true },
  { key: "Maghrib", label: "Maghrib", isPrayer: true },
  { key: "Isha", label: "Isha", isPrayer: true }
];

/**
 * Builds the Aladhan URL for a coordinate and method.
 *
 * Returns null for an out-of-range coordinate rather than sending a request the
 * service will reject. Bounds are checked because a NaN slipping through here
 * would produce a plausible-looking response for the wrong place.
 */
export function prayerUrl(lat, lon, method = DEFAULT_PRAYER_METHOD) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const id = PRAYER_METHODS.some((m) => m.id === Number(method))
    ? Number(method)
    : DEFAULT_PRAYER_METHOD;

  const url = new URL("https://api.aladhan.com/v1/timings");
  url.search = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    method: String(id)
  });
  return url.toString();
}

/**
 * Reads an Aladhan response into a day.
 *
 * The service reports success in two places (`code: 200` at the root and
 * `status: "OK"`), so both are checked. A response that parses but reports an
 * error yields null rather than an object full of empty times.
 *
 * @returns {{day: string, entries: Array<object>, hijri: object, methodName: string,
 *            timezone: string} | null}
 */
export function parsePrayerResponse(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.code !== 200) return null;
  if (payload.status !== "OK") return null;

  const data = payload.data;
  if (!data || typeof data !== "object") return null;

  const timings = data.timings;
  if (!timings || typeof timings !== "object") return null;

  const entries = PRAYER_SEQUENCE.map((slot) => {
    const minutes = parseHhMm(timings[slot.key]);
    return { ...slot, minutes };
  });

  // A day missing its core times is unusable. Sunrise is allowed to be missing
  // because some sources genuinely omit it.
  const core = entries.filter((e) => e.isPrayer);
  if (core.some((e) => e.minutes === null)) return null;

  const date = data.date || {};
  const hijri = date.hijri || {};
  const gregorian = date.gregorian || {};

  return {
    day: `${gregorian.date || ""}`.trim(),
    entries,
    hijri: {
      day: String(hijri.day || "").trim(),
      month: String((hijri.month && hijri.month.en) || "").trim(),
      year: String(hijri.year || "").trim()
    },
    methodName: String((data.meta && data.meta.method && data.meta.method.name) || "").trim(),
    timezone: String((data.meta && data.meta.timezone) || "").trim()
  };
}

/**
 * "HH:MM" -> minutes past midnight, or null.
 *
 * Some responses include seconds ("HH:MM:SS") and some pad to five characters;
 * both are handled. Anything else is null, because a prayer time that cannot be
 * read is not a prayer time.
 */
export function parseHhMm(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Already numeric (minutes past midnight) from some endpoints.
    return value >= 0 && value < 24 * 60 ? Math.round(value) : null;
  }
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value || "").trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes past midnight -> "HH:MM". */
export function formatHhMm(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The next prayer at or after `nowMinutes`, wrapping to tomorrow's Fajr.
 *
 * Sunrise is excluded because it is not a prayer. When every prayer has passed,
 * the result is tomorrow's Fajr with `tomorrow: true` rather than null, so the
 * widget always has something truthful to show.
 */
export function nextPrayer(day, nowMinutes) {
  if (!day || !Array.isArray(day.entries)) return null;
  if (!Number.isFinite(nowMinutes)) return null;

  const prayers = day.entries.filter((e) => e.isPrayer && e.minutes !== null);
  if (!prayers.length) return null;

  for (const entry of prayers) {
    if (entry.minutes >= nowMinutes) {
      return { entry, minutesAway: entry.minutes - nowMinutes, tomorrow: false };
    }
  }

  const fajr = prayers[0];
  return { entry: fajr, minutesAway: 1440 - nowMinutes + fajr.minutes, tomorrow: true };
}

/** The prayer currently in progress, or null. */
export function currentPrayer(day, nowMinutes) {
  if (!day || !Array.isArray(day.entries)) return null;
  if (!Number.isFinite(nowMinutes)) return null;

  const prayers = day.entries.filter((e) => e.isPrayer && e.minutes !== null);
  let current = null;

  for (const entry of prayers) {
    if (entry.minutes <= nowMinutes) current = entry;
    else break;
  }
  return current;
}

/**
 * The date in the viewer's own timezone.
 *
 * Deliberately NOT derived from the API's `date` field: that field is the date
 * at the prayer location, and this app may well be showing a clock for a
 * different place. Using the viewer's own clock is the only reading that cannot
 * silently be wrong.
 */
export function viewerMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

/** "2 h 14 m", "12 m", "in a moment". */
export function formatCountdown(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  const total = Math.max(0, Math.round(minutes));
  if (total <= 0) return "now";
  if (total < 60) return `${total} m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
}

/** Human label for a method id, falling back to the raw id. */
export function methodLabel(id) {
  const found = PRAYER_METHODS.find((m) => m.id === Number(id));
  return found ? found.label : `Method ${id}`;
}
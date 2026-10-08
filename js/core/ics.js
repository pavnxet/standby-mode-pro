/* StandBy Mode Pro - iCalendar (RFC 5545) Parser
 *
 * FEATURE_PLAN.md C6, rated HIGH risk with the note: "timezone correctness is
 * an unsolved industry-wide failure" and four competitor threads of timezone
 * bugs. A clock showing the wrong time is the worst bug this product can have,
 * so the distinctions that are usually got wrong are handled explicitly here.
 *
 * The four cases, and what each means:
 *
 *  1. VALUE=DATE              An all-day event. It has NO time. Parsing it into a
 *                              Date and formatting it with a time zone invents
 *                              a time of day that does not exist. Kept as a plain
 *                              "YYYY-MM-DD" string and rendered as a date only.
 *
 *  2. DTSTART;TZID=Area/City A wall-clock time in THAT zone. To show it in the
 *                              user's zone we must first find the UTC offset of
 *                              the source zone at that instant, which means
 *                              iterating once because the offset is what we are
 *                              solving for. See `zonedWallTimeToUtc`.
 *
 *  3. DTSTART:...Z            An absolute UTC instant. No interpretation needed.
 *
 *  4. DTSTART:20260101T090000  A "floating" time: local to whoever reads the
 *  (no TZID, no Z)           calendar. Interpreted in the VIEWER's zone, which is
 *                              the only defensible reading.
 *
 * Only the subset that real calendars actually emit is supported. Anything
 * unrecognised is skipped rather than guessed, so a malformed feed degrades to
 * "fewer events" and never to "wrong events".
 */

import { offsetMinutes } from "./timezones.js";

/**
 * Unfolds continuation lines.
 *
 * RFC 5545: a content line is folded with CRLF followed by a single space or
 * tab, and the fold is not part of the value. Long DTSTART/RRULE lines are
 * routinely folded, and an unfolded parser silently truncates them.
 */
export function unfold(text) {
  return String(text || "")
    // Normalise all line endings first so CRLF, CR and LF all behave.
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // A newline followed by space or tab is a fold; keep the following char.
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 0);
}

/**
 * Splits a content line into its parts.
 *
 * The value separator is the FIRST unquoted colon, which is the subtlety that
 * breaks naive parsers: `DTSTART;TZID=GMT+05:30:20260101T090000` contains a
 * colon inside the parameter value.
 *
 * @returns {{ name: string, params: Record<string,string>, value: string }}
 */
export function parseLine(line) {
  const text = String(line || "");
  let inQuotes = false;
  let separator = -1;
  // Position just after the most recent "=" seen outside quotes, used for the
  // GMT+05:30 leniency below. -1 means "not inside a parameter value".
  let paramValueStart = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;

    if (ch === "=") { paramValueStart = i + 1; continue; }
    if (ch === ";") { paramValueStart = -1; continue; }

    if (ch === ":") {
      // RFC 5545's grammar forbids a colon in an unquoted param-text value, so
      // strictly the first unquoted colon is always the separator. Real feeds
      // break that rule anyway - `TZID=GMT+05:30` is common in the wild - so a
      // colon that completes a `+HH:MM` offset is treated as part of the value.
      if (paramValueStart !== -1 && isUtcOffsetTail(text, paramValueStart, i)) {
        continue;
      }
      separator = i;
      break;
    }
  }

  if (separator === -1) return { name: "", params: {}, value: "" };

  const head = text.slice(0, separator);
  const value = text.slice(separator + 1);

  const [name, ...paramParts] = head.split(";");
  const params = {};

  for (const part of paramParts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).toUpperCase();
    let val = part.slice(eq + 1);

    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    } else if (val.includes("^")) {
      val = decodeCaret(val);
    }
    params[key] = val;
  }

  return { name: name.toUpperCase(), params, value };
}

/**
 * True when the parameter value fragment completed by this colon is a
 * timezone UTC offset such as "GMT+05:30" or "UTC-08:00".
 *
 * Deliberately tight: an optional GMT/UTC prefix followed by a sign and one or
 * two digits. A looser "ends with a signed number" test would also swallow
 * legitimate separators in a parameter like `X=-1:value`.
 */
function isUtcOffsetTail(text, from, to) {
  const fragment = text.slice(from, to);
  if (!/^(?:GMT|UTC)?[+-]\d{1,2}$/i.test(fragment)) return false;
  // The minutes half of the offset must follow, and it must not itself be the
  // start of a time value (which would mean the colon was a real separator).
  return /^\d{2}(?!\d)/.test(text.slice(to + 1));
}

/**
 * Decodes RFC 6868 escaped parameter values.
 *
 * The encoding is per character, not a single escape: `^'quoted^'` means
 * `"quoted"`. Decoding the whole string as one token silently corrupts every
 * value containing more than one caret escape.
 */
function decodeCaret(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "^") { out += value[i]; continue; }
    const next = value[i + 1];
    switch (next) {
      case "n": case "N": out += "\n"; i++; break;
      case "'": out += '"'; i++; break;
      case "^": out += "^"; i++; break;
      default: out += next === undefined ? "^" : next; i++;
    }
  }
  return out;
}

/**
 * Unescapes an RFC 5545 TEXT value.
 * Backslash, semicolon, comma and newline are escaped with a backslash.
 */
export function unescapeText(value) {
  return String(value || "").replace(/\\([\\;,nN])/g, (_m, ch) => {
    if (ch === "n" || ch === "N") return "\n";
    return ch;
  });
}

/** Splits a comma-separated list, honouring quoting. */
function splitList(value) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (const ch of String(value || "")) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { out.push(current); current = ""; continue; }
    current += ch;
  }
  out.push(current);
  return out.filter((s) => s.length > 0);
}

/**
 * Converts a TZID wall-clock time to the corresponding UTC instant.
 *
 * This is the hard part, and it is genuinely iterative. "09:00 in Europe/London"
 * is not a fixed number of milliseconds from UTC, because London's offset
 * depends on the date (GMT in winter, BST in summer). We:
 *
 *   1. guess the instant using the offset at roughly the right time,
 *   2. re-read the offset AT that guessed instant,
 *   3. recompute once.
 *
 * Two passes is enough because offsets change at most once a year and a wrong
 * first guess still lands within a day, which is within a DST transition's
 * neighbourhood but on the correct side of it in every realistic calendar.
 *
 * @returns {Date|null} null if the zone is unknown to the platform.
 */
export function zonedWallTimeToUtc(parts, timeZone) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);

  const firstGuessOffset = offsetMinutes(new Date(naiveUtc), timeZone);
  if (firstGuessOffset === null) return null;

  const firstGuess = new Date(naiveUtc - firstGuessOffset * 60_000);
  const correctedOffset = offsetMinutes(firstGuess, timeZone);
  if (correctedOffset === null) return null;

  return new Date(naiveUtc - correctedOffset * 60_000);
}

/**
 * Parses a DATE-TIME value into a structured, unambiguous description.
 *
 * Deliberately returns a DESCRIPTION of the value, not a Date, because the four
 * cases above are genuinely different things and collapsing them into a Date at
 * parse time loses the information the renderer needs.
 *
 * @param {string} raw e.g. "20260115T090000Z", "20260115T090000"
 * @param {string|undefined} tzid
 * @returns {{ kind: 'utc'|'zoned'|'floating'|'date', raw: string, tzid?: string,
 *             year: number, month: number, day: number,
 *             hour: number, minute: number, second: number } | null}
 */
export function parseDateValue(raw, tzid) {
  const value = String(raw || "").trim();
  if (!value) return null;

  // DATE only: VALUE=DATE, or an 8-digit value with no T.
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    return {
      kind: "date",
      raw: value,
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
      hour: 0, minute: 0, second: 0
    };
  }

  // DATE-TIME. The trailing Z is UTC.
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (!dateTime) return null;

  const year = Number(dateTime[1]);
  const month = Number(dateTime[2]);
  const day = Number(dateTime[3]);
  const hour = Number(dateTime[4]);
  const minute = Number(dateTime[5]);
  const second = Number(dateTime[6]);

  // Validate against the real calendar. `day <= 31` is not enough: February 31st
  // does not exist, and Date would silently roll it to March 3rd - a confidently
  // wrong date in an agenda. Skipping the event is the honest answer.
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) ||
      hour > 23 || minute > 59 || second > 60) {
    return null;
  }

  const isUtc = dateTime[7] === "Z";
  return {
    kind: isUtc ? "utc" : (tzid ? "zoned" : "floating"),
    raw: value,
    tzid: isUtc ? undefined : tzid,
    year, month, day, hour, minute, second
  };
}

/** Real number of days in a month, leap years included. */
export function daysInMonth(year, month) {
  if (month < 1 || month > 12) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Converts a parsed DATE/DATE-TIME description to an absolute Date, or null. */
export function toInstant(parsed) {
  if (!parsed) return null;
  switch (parsed.kind) {
    case "utc":
      return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second));
    case "zoned":
      return zonedWallTimeToUtc(parsed, parsed.tzid);
    case "floating":
      // The viewer's own wall clock.
      return new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second);
    case "date":
      // An all-day event has no instant. Midnight local is the conventional
      // anchor for sorting, and the renderer must not print a time from it.
      return new Date(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0);
    default:
      return null;
  }
}

/**
 * Expands an RRULE into concrete occurrence start values.
 *
 * Supports FREQ (DAILY/WEEKLY/MONTHLY/YEARLY), INTERVAL, COUNT, UNTIL and
 * BYDAY - which is what Google, Apple and Outlook actually emit. Unsupported
 * keys are ignored rather than treated as an error.
 *
 * @returns {Array<object>} parsed DATE/DATE-TIME descriptions, capped.
 */
export function expandRecurrence(rule, start, rangeStart, rangeEnd, cap = 200) {
  if (!rule || !start) return [start];

  const parts = {};
  for (const piece of String(rule).split(";")) {
    const eq = piece.indexOf("=");
    if (eq === -1) continue;
    parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1);
  }

  const freq = (parts.FREQ || "").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return [start];

  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;

  const until = parts.UNTIL ? parseDateValue(parts.UNTIL, start.tzid) : null;
  const untilInstant = until ? toInstant(until)?.getTime() : Infinity;

  // BYDAY -> weekday numbers (0 = Sunday).
  const byDay = parts.BYDAY
    ? splitList(parts.BYDAY).map((token) => weekdayFromToken(token)).filter((n) => n !== null)
    : null;

  const results = [];
  const startInstant = toInstant(start);
  if (startInstant === null) return [];
  const rangeStartMs = rangeStart instanceof Date ? rangeStart.getTime() : -Infinity;
  const rangeEndMs = rangeEnd instanceof Date ? rangeEnd.getTime() : Infinity;

  // Advance by whole periods, capped so a malformed rule cannot spin forever.
  const MAX_PERIODS = 2000;

  for (let period = 0; period < MAX_PERIODS && results.length < cap; period++) {
    for (const offsetDays of daysForPeriod(freq, period * interval, byDay, start)) {
      const instant = new Date(startInstant.getTime() + offsetDays * 86400000);
      if (instant.getTime() > untilInstant) return results;
      if (count !== null && results.length >= count) return results;
      if (instant.getTime() < rangeStartMs) continue;
      if (instant.getTime() > rangeEndMs) return results;
      if (byDay && period === 0 && byDay.length && !byDay.includes(instant.getDay())) continue;

      results.push({
        kind: start.kind,
        raw: start.raw,
        tzid: start.tzid,
        year: instant.getFullYear(),
        month: instant.getMonth() + 1,
        day: instant.getDate(),
        // Recurrences keep the original wall-clock time, which is what "daily
        // standup at 09:00" means even across a DST boundary. Using the shifted
        // instant's hour here is the classic off-by-an-hour bug.
        hour: start.hour,
        minute: start.minute,
        second: start.second
      });
    }
  }

  return results;
}

/** Day offsets from the start for a given period index. */
function daysForPeriod(freq, index, byDay, start) {
  switch (freq) {
    case "DAILY":
      return [index];
    case "WEEKLY": {
      if (!byDay || !byDay.length) return [index * 7];
      const startDay = startInstantDay(start);
      // Every selected weekday within this week.
      return byDay.map((day) => {
        let delta = day - startDay;
        if (delta < 0) delta += 7;
        return index * 7 + delta;
      });
    }
    case "MONTHLY":
      // Month arithmetic on a Date, then snap back to the start's day-of-month
      // so "the 31st monthly" stays on the 31st where the month allows it.
      return [daysBetweenMonthStart(start, index)];
    case "YEARLY":
      return [index * 365];
    default:
      return [index];
  }
}

function startInstantDay(start) {
  const instant = toInstant(start);
  return instant ? instant.getDay() : 0;
}

function daysBetweenMonthStart(start, index) {
  const instant = toInstant(start);
  if (!instant) return index * 30;
  const target = new Date(instant.getFullYear(), instant.getMonth() + index, 1);
  const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(instant.getDate(), daysInTarget);
  return Math.round(
    (Date.UTC(target.getFullYear(), target.getMonth(), day) -
      Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate())) / 86400000
  );
}

/** "MO", "-1SU" -> weekday number, or null if unparseable. */
function weekdayFromToken(token) {
  const match = /^(?:[+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(String(token).trim());
  if (!match) return null;
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(match[1].toUpperCase());
}

/**
 * Parses a whole ICS document into event objects.
 *
 * @param {string} text
 * @param {{ rangeStart?: Date, rangeEnd?: Date }} [options]
 * @returns {{ events: Array<object>, warnings: string[] }}
 */
export function parseICS(text, options = {}) {
  const rangeStart = options.rangeStart || new Date();
  const rangeEnd = options.rangeEnd || new Date(rangeStart.getTime() + 30 * 86400000);

  const lines = unfold(text);
  const events = [];
  const warnings = [];

  let current = null;
  // Tracks whether a VCALENDAR block was ever *entered*, not whether it is
  // currently open. Checking "currently open" at the end of a well-formed
  // document always reported a missing block, because END:VCALENDAR has already
  // closed it by then.
  let sawVCalendar = false;

  for (let i = 0; i < lines.length; i++) {
    const { name, params, value } = parseLine(lines[i]);

    if (name === "BEGIN" && value.toUpperCase() === "VCALENDAR") { sawVCalendar = true; continue; }
    if (name === "END" && value.toUpperCase() === "VCALENDAR") continue;
    if (name === "BEGIN" && value.toUpperCase() === "VEVENT") {
      current = { rrule: null, exdates: [], uid: null, summary: "", location: "", description: "", allDay: false };
      continue;
    }
    if (name === "END" && value.toUpperCase() === "VEVENT") {
      if (current) {
        const built = buildEvent(current, rangeStart, rangeEnd);
        if (built) events.push(...built);
      }
      current = null;
      continue;
    }

    if (!current) continue;

    switch (name) {
      case "UID":
        current.uid = value;
        break;
      case "SUMMARY":
        current.summary = unescapeText(value);
        break;
      case "LOCATION":
        current.location = unescapeText(value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(value);
        break;
      case "DTSTART":
        current.start = parseDateValue(value, params.TZID);
        // VALUE=DATE is the only reliable all-day marker; a DTSTART with no
        // time component is also one.
        if (!current.start) warnings.push("DTSTART could not be read; event skipped");
        else if (current.start.kind === "date") current.allDay = true;
        break;
      case "DTEND":
        current.end = parseDateValue(value, params.TZID);
        break;
      case "RRULE":
        current.rrule = value;
        break;
      case "EXDATE":
        current.exdates.push(...splitList(value).map((v) => parseDateValue(v, params.TZID)).filter(Boolean));
        break;
      default:
        break;
    }
  }

  events.sort((a, b) => a.startMs - b.startMs);
  if (!sawVCalendar) warnings.push("No VCALENDAR block found; the file may not be an ICS document");

  return { events, warnings };
}

/** Builds one or more concrete occurrences from a VEVENT. */
function buildEvent(vevent, rangeStart, rangeEnd) {
  if (!vevent.start) return [];

  const occurrences = vevent.rrule
    ? expandRecurrence(vevent.rrule, vevent.start, rangeStart, rangeEnd)
    : [vevent.start];

  const excluded = new Set(
    vevent.exdates.map((e) => toInstant(e)?.getTime()).filter((n) => Number.isFinite(n))
  );

  const out = [];
  for (const occurrence of occurrences) {
    const startMs = toInstant(occurrence)?.getTime();
    if (!Number.isFinite(startMs) || excluded.has(startMs)) continue;

    const endMs = vevent.end ? toInstant(vevent.end)?.getTime() : null;
    out.push({
      uid: vevent.uid,
      summary: vevent.summary || "(no title)",
      location: vevent.location,
      description: vevent.description,
      allDay: vevent.allDay || occurrence.kind === "date",
      startMs,
      // A missing or nonsensical DTEND yields null rather than a bogus span.
      endMs: Number.isFinite(endMs) && endMs > startMs ? endMs : null,
      sourceZone: occurrence.tzid || null,
      localParts: occurrence
    });
  }
  return out;
}
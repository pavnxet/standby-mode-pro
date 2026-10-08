/* StandBy Mode Pro - Tests for the Milestone 3 widget pass, part 2
 *
 * Run with: node --test tests/widgets-m3c.test.mjs
 *
 * Covers the prayer-times mapping (C19), the media-session bridge (C12) and the
 * three widgets that ship logic worth pinning: the agenda's relative-time
 * wording (C6) and the world clock's delta label (C20).
 *
 * C19 and C12 both have hard failure modes that are invisible without a test:
 * a prayer time read as "12:60", and a media-session handler left installed
 * after unmount.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  prayerUrl,
  parsePrayerResponse,
  parseHhMm,
  formatHhMm,
  nextPrayer,
  currentPrayer,
  viewerMinutes,
  formatCountdown,
  methodLabel,
  PRAYER_METHODS,
  PRAYER_SEQUENCE,
  DEFAULT_PRAYER_METHOD
} from "../js/core/prayer.js";

import {
  SUPPORTED_ACTIONS,
  readSessionMetadata,
  setPlaybackState,
  mediaSessionAvailability,
  installMediaSession
} from "../js/core/mediaSession.js";

import { describeRelative } from "../js/features/agendaWidget.js";
import { formatDelta } from "../js/features/timezoneWidget.js";
import { describeFetchFailure } from "../js/core/netPolicy.js";
import { describeFetchFailure as describeFeedFailure } from "../js/features/newsWidget.js";

// ================================================================ C19: parsing

/**
 * A response shaped exactly like the one measured from api.aladhan.com during
 * this milestone, including the `code`/`status` envelope and the `hijri` block.
 * If the service changes shape, parsePrayerResponse must return null rather
 * than a day full of empty times.
 */
const SAMPLE_PRAYER = {
  code: 200,
  status: "OK",
  data: {
    timings: {
      Fajr: "04:59",
      Sunrise: "06:18",
      Dhuhr: "12:09",
      Asr: "15:30",
      Sunset: "17:59",
      Maghrib: "17:59",
      Isha: "19:13"
    },
    date: {
      readable: "08 Oct 2026",
      hijri: {
        day: "27",
        month: { number: 4, en: "Rabi al-thani", ar: "ربيع الآخر", days: 30 },
        year: "1448"
      },
      gregorian: { date: "08-10-2026", day: "08", month: { number: 10, en: "October" }, year: "2026" }
    },
    meta: {
      timezone: "Asia/Kolkata",
      method: { id: 3, name: "Muslim World League" }
    }
  }
};

test("prayerUrl builds a request for valid coordinates", () => {
  const url = prayerUrl(28.6139, 77.209, 3);
  assert.ok(url.startsWith("https://api.aladhan.com/v1/timings?"));
  assert.ok(url.includes("latitude=28.6139"));
  assert.ok(url.includes("longitude=77.209"));
  assert.ok(url.includes("method=3"));
});

test("prayerUrl rejects coordinates it cannot resolve", () => {
  // Sending a NaN through would get a plausible-looking answer for the wrong
  // place, which is worse than no answer.
  for (const bad of [[null, null], [NaN, 77], [28, undefined], ["a", "b"], [91, 0], [0, 181]]) {
    assert.equal(prayerUrl(bad[0], bad[1]), null, `${bad} should be rejected`);
  }
});

test("prayerUrl falls back to the default method for an unknown id", () => {
  const url = prayerUrl(28.6, 77.2, 999);
  assert.ok(url.includes(`method=${DEFAULT_PRAYER_METHOD}`));
});

test("parsePrayerResponse reads the measured response shape", () => {
  const day = parsePrayerResponse(SAMPLE_PRAYER);
  assert.ok(day, "a valid response should parse");
  assert.equal(day.timezone, "Asia/Kolkata");
  assert.equal(day.methodName, "Muslim World League");
  assert.equal(day.hijri.day, "27");
  assert.equal(day.hijri.month, "Rabi al-thani");
  assert.equal(day.hijri.year, "1448");
  assert.equal(day.entries.length, PRAYER_SEQUENCE.length);
});

test("parsePrayerResponse converts every time to minutes past midnight", () => {
  const day = parsePrayerResponse(SAMPLE_PRAYER);
  const byKey = Object.fromEntries(day.entries.map((e) => [e.key, e.minutes]));

  assert.equal(byKey.Fajr, 4 * 60 + 59);
  assert.equal(byKey.Sunrise, 6 * 60 + 18);
  assert.equal(byKey.Dhuhr, 12 * 60 + 9);
  assert.equal(byKey.Isha, 19 * 60 + 13);
});

test("parsePrayerResponse rejects a response that reports an error", () => {
  assert.equal(parsePrayerResponse({ code: 400, status: "Bad Request", data: {} }), null);
  assert.equal(parsePrayerResponse({ code: 200, status: "ERROR", data: SAMPLE_PRAYER.data }), null);
});

test("parsePrayerResponse rejects junk rather than returning empty times", () => {
  for (const bad of [null, undefined, {}, "text", 42, { data: null }]) {
    assert.equal(parsePrayerResponse(bad), null);
  }
  assert.equal(parsePrayerResponse({ code: 200, status: "OK", data: { timings: {} } }), null,
    "a day with no times is not a day");
});

test("a missing Sunrise is tolerated, a missing prayer is not", () => {
  // Sunrise is a boundary, not a prayer; some sources genuinely omit it.
  const noSunrise = structuredClone(SAMPLE_PRAYER);
  delete noSunrise.data.timings.Sunrise;
  const day = parsePrayerResponse(noSunrise);
  assert.ok(day, "a missing Sunrise should still parse");
  assert.equal(day.entries.find((e) => e.key === "Sunrise").minutes, null);

  const noIsha = structuredClone(SAMPLE_PRAYER);
  delete noIsha.data.timings.Isha;
  assert.equal(parsePrayerResponse(noIsha), null,
    "a missing Isha means the day is unusable");
});

test("parseHhMm handles every shape real responses use", () => {
  assert.equal(parseHhMm("04:59"), 299);
  assert.equal(parseHhMm("4:59"), 299);
  assert.equal(parseHhMm("04:59:00"), 299);
  assert.equal(parseHhMm("  04:59 "), 299);
  assert.equal(parseHhMm(299), 299, "a numeric response is minutes already");
  assert.equal(parseHhMm("00:00"), 0);
  assert.equal(parseHhMm("23:59"), 1439);
});

test("parseHhMm rejects unreadable or impossible times", () => {
  // "12:60" is the shape of bug that would put Isha an hour out. Rejecting it
  // renders "—", which is honest; accepting it renders a wrong prayer time.
  for (const bad of ["12:60", "24:00", "99:99", "", null, undefined, "noon", "04-59", {}]) {
    assert.equal(parseHhMm(bad), null, `"${bad}" should not parse`);
  }
  assert.equal(parseHhMm(1440), null, "24:00 as a number is out of range");
  assert.equal(parseHhMm(-1), null);
});

test("formatHhMm round-trips with parseHhMm", () => {
  for (const value of ["00:00", "04:59", "12:09", "19:13", "23:59"]) {
    assert.equal(formatHhMm(parseHhMm(value)), value);
  }
  assert.equal(formatHhMm(null), "—");
});

// ============================================================ C19: next prayer

test("nextPrayer finds the prayer after now", () => {
  const day = parsePrayerResponse(SAMPLE_PRAYER);
  // 08:00 local, between Sunrise 06:18 and Dhuhr 12:09.
  const next = nextPrayer(day, 8 * 60);
  assert.equal(next.entry.key, "Dhuhr");
  assert.equal(next.tomorrow, false);
  assert.equal(next.minutesAway, 12 * 60 + 9 - 8 * 60);
});

test("nextPrayer never returns Sunrise, which is not a prayer", () => {
  const day = parsePrayerResponse(SAMPLE_PRAYER);
  // 06:00 is after Fajr (04:59) but before Sunrise (06:18). If Sunrise were
  // treated as a prayer it would win over Dhuhr, which is wrong.
  const next = nextPrayer(day, 6 * 60);
  assert.equal(next.entry.key, "Dhuhr");
  assert.notEqual(next.entry.key, "Sunrise");
});

test("nextPrayer wraps to tomorrow's Fajr after Isha", () => {
  const day = parsePrayerResponse(SAMPLE_PRAYER);
  const next = nextPrayer(day, 23 * 60);
  assert.equal(next.entry.key, "Fajr");
  assert.equal(next.tomorrow, true);
  assert.ok(next.minutesAway > 0);
  assert.ok(next.minutesAway <= 24 * 60, "a wrap must not exceed one day");
});

test("nextPrayer includes a prayer happening exactly now", () => {
  const day = parsePrayerResponse(SAMPLE_PRAYER);
  const next = nextPrayer(day, 12 * 60 + 9);
  assert.equal(next.entry.key, "Dhuhr");
  assert.equal(next.minutesAway, 0);
});

test("currentPrayer reports the prayer in progress, and null before Fajr", () => {
  const day = parsePrayerResponse(SAMPLE_PRAYER);
  assert.equal(currentPrayer(day, 13 * 60).key, "Dhuhr");
  assert.equal(currentPrayer(day, 18 * 60).key, "Maghrib");
  // 03:00 precedes every prayer, so none is in progress.
  assert.equal(currentPrayer(day, 3 * 60), null);
});

test("the prayer helpers tolerate a missing or malformed day", () => {
  for (const bad of [null, undefined, {}, { entries: [] }, { entries: "x" }]) {
    assert.equal(nextPrayer(bad, 600), null);
    assert.equal(currentPrayer(bad, 600), null);
  }
  assert.equal(nextPrayer(parsePrayerResponse(SAMPLE_PRAYER), NaN), null);
});

test("viewerMinutes uses the machine's own clock, not the API's date", () => {
  // The API's date is the date at the prayer location. Using it would let the
  // widget show one place's day against another place's clock.
  const at = new Date(2026, 9, 8, 14, 30);
  assert.equal(viewerMinutes(at), 14 * 60 + 30);
});

// ============================================================= C19: formatting

test("formatCountdown reads as a duration", () => {
  assert.equal(formatCountdown(0), "now");
  assert.equal(formatCountdown(12), "12 m");
  assert.equal(formatCountdown(134), "2 h 14 m");
  assert.equal(formatCountdown(120), "2 h");
  assert.equal(formatCountdown(null), "—");
});

test("formatCountdown never renders a negative duration", () => {
  assert.equal(formatCountdown(-5), "now");
});

test("methodLabel names a known method and degrades for an unknown one", () => {
  assert.equal(methodLabel(3), "Muslim World League");
  assert.ok(methodLabel(3).length > 0);
  assert.equal(methodLabel(999), "Method 999");
});

test("every offered method has a distinct id and a label", () => {
  const ids = PRAYER_METHODS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate method ids in the picker");
  assert.ok(ids.includes(DEFAULT_PRAYER_METHOD), "the default must be offered");
  for (const method of PRAYER_METHODS) {
    assert.ok(method.label && method.label.length > 0, `method ${method.id} has no label`);
    assert.ok(Number.isInteger(method.id));
  }
});

// ================================================= C19: what the user is told

test("the prayer widget is flagged experimental, as the plan requires", async () => {
  const { prayerWidget } = await import("../js/features/prayerWidget.js");
  assert.equal(prayerWidget.experimental, true,
    "FEATURE_PLAN C19 says 'Marked experimental' - the flag must survive to the registry");
});

// ============================================================= C12: media session

test("SUPPORTED_ACTIONS omits seek, which there is no timeline to seek", () => {
  // This app has no <audio> element, so a seek action would be a silent no-op on
  // a hardware button. Exposing it would look broken rather than absent.
  assert.ok(!SUPPORTED_ACTIONS.includes("seekbackward"));
  assert.ok(!SUPPORTED_ACTIONS.includes("seekforward"));
  for (const action of ["play", "pause", "previoustrack", "nexttrack"]) {
    assert.ok(SUPPORTED_ACTIONS.includes(action), `${action} should be wired`);
  }
});

test("installMediaSession degrades cleanly when the API is absent", async () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaSession: undefined },
    configurable: true,
    writable: true
  });

  try {
    const session = installMediaSession({ play() {}, pause() {} });
    assert.equal(session.supported, false);
    assert.deepEqual(session.installed, []);
    assert.deepEqual(session.unsupported, SUPPORTED_ACTIONS);
    // destroy() must be safe to call even when nothing was installed.
    session.destroy();
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      value: original,
      configurable: true,
      writable: true
    });
  }
});

test("installMediaSession clears its handlers on destroy", () => {
  // A leaked handler keeps the system media keys pointed at a page that no
  // longer exists, which outlives the widget invisibly.
  const calls = [];
  let setActionHandler;
  const fake = {
    mediaSession: {
      setActionHandler: (action, handler) => {
        calls.push({ action, handler });
        if (handler === null) setActionHandler = null;
      }
    }
  };

  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: fake,
    configurable: true,
    writable: true
  });

  try {
    const session = installMediaSession({ play() {}, pause() {}, prev() {}, next() {} });
    assert.equal(session.supported, true);
    assert.ok(session.installed.includes("play"));
    assert.ok(calls.length > 0, "nothing was registered");

    session.destroy();

    const cleared = calls.filter((c) => c.handler === null).map((c) => c.action);
    assert.deepEqual(cleared.sort(), session.installed.slice().sort(),
      "every installed handler must be cleared");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      value: original,
      configurable: true,
      writable: true
    });
  }
});

test("a handler that throws does not escape to the media key", () => {
  // The browser invokes these from its own handler. An uncaught throw there is
  // an unexplained dead key press.
  let registered = null;
  const fake = {
    mediaSession: {
      setActionHandler: (_action, handler) => { registered = handler; }
    }
  };

  const original = globalThis.navigator;
  const originalError = console.error;
  console.error = () => {};

  Object.defineProperty(globalThis, "navigator", {
    value: fake,
    configurable: true,
    writable: true
  });

  try {
    installMediaSession({ play() { throw new Error("boom"); } });
    assert.equal(typeof registered, "function");
    assert.doesNotThrow(() => registered({}));
  } finally {
    console.error = originalError;
    Object.defineProperty(globalThis, "navigator", {
      value: original,
      configurable: true,
      writable: true
    });
  }
});

test("a browser that refuses an action is reported, not hidden", () => {
  const fake = {
    mediaSession: {
      setActionHandler(action) {
        // Real browsers throw for actions they do not implement.
        if (action === "nexttrack") throw new Error("NotSupportedError");
      }
    }
  };

  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: fake,
    configurable: true,
    writable: true
  });

  try {
    const session = installMediaSession({ play() {}, pause() {}, prev() {}, next() {} });
    assert.ok(session.installed.includes("play"));
    assert.ok(session.unsupported.includes("nexttrack"),
      "an action the browser rejected must be visible to the UI");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      value: original,
      configurable: true,
      writable: true
    });
  }
});

test("readSessionMetadata returns empty strings when nothing plays", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaSession: { metadata: null } },
    configurable: true,
    writable: true
  });

  try {
    const snapshot = readSessionMetadata();
    assert.equal(snapshot.title, "");
    assert.equal(snapshot.artist, "");
    assert.deepEqual(snapshot.artwork, []);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      value: original,
      configurable: true,
      writable: true
    });
  }
});

test("readSessionMetadata drops artwork with a dangerous or empty src", () => {
  // Artwork lands in an <img src>. A javascript: or data:text/html src there is
  // a live vector, so the filter is not cosmetic.
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaSession: {
        metadata: {
          title: "Track",
          artist: "Artist",
          artwork: [
            { src: "https://example.com/a.jpg" },
            { src: "javascript:alert(1)" },
            { src: "data:text/html,<script>alert(1)</script>" },
            { src: "" },
            { src: 42 }
          ]
        }
      }
    },
    configurable: true,
    writable: true
  });

  try {
    const snapshot = readSessionMetadata();
    assert.equal(snapshot.artwork.length, 1);
    assert.equal(snapshot.artwork[0].src, "https://example.com/a.jpg");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      value: original,
      configurable: true,
      writable: true
    });
  }
});

test("setPlaybackState only accepts the three real states", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaSession: { playbackState: "none" } },
    configurable: true,
    writable: true
  });

  try {
    assert.equal(setPlaybackState("playing"), true);
    assert.equal(globalThis.navigator.mediaSession.playbackState, "playing");
    assert.equal(setPlaybackState("paused"), true);
    assert.equal(setPlaybackState("buffering"), false, "buffering is not a MediaSession state");
    assert.equal(setPlaybackState(null), false);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      value: original,
      configurable: true,
      writable: true
    });
  }
});

test("availability explains itself instead of returning a bare false", () => {
  const original = globalThis.navigator;

  Object.defineProperty(globalThis, "navigator", {
    value: {}, configurable: true, writable: true
  });
  const noApi = mediaSessionAvailability();
  assert.equal(noApi.available, false);
  assert.ok(noApi.reason.length > 20, "the reason must be user-readable, not a code");

  Object.defineProperty(globalThis, "navigator", {
    value: { mediaSession: {} }, configurable: true, writable: true
  });
  const withApi = mediaSessionAvailability();
  assert.equal(withApi.available, true);
  assert.equal(withApi.reason, "");

  Object.defineProperty(globalThis, "navigator", {
    value: original, configurable: true, writable: true
  });
});

// ======================================== H4: fetch failures read as English

test("a CORS rejection is described, not shown as a TypeError", () => {
  // A blocked cross-origin response surfaces from inside the page as a bare
  // "TypeError: Failed to fetch" with no status and no header. Rendering that
  // verbatim puts a developer string on a desk display.
  const message = describeFetchFailure(new TypeError("Failed to fetch"));

  assert.ok(!/typeerror/i.test(message), `"${message}" still exposes the exception type`);
  assert.ok(!/failed to fetch/i.test(message), `"${message}" still exposes the raw message`);
  assert.ok(message.length > 20, "the description must be a sentence, not a code");
});

test("every fetch failure shape maps to a readable sentence", () => {
  const cases = [
    new TypeError("Failed to fetch"),
    new TypeError("NetworkError when attempting to fetch resource"),
    new TypeError("Load failed"),
    new Error("Request timed out after 8000ms"),
    new Error("HTTP 404"),
    new Error("HTTP 503"),
    new Error("something nobody anticipated"),
    null,
    undefined
  ];

  for (const error of cases) {
    const message = describeFetchFailure(error);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 10, `"${error}" produced "${message}"`);
    assert.ok(!/^HTTP \d/.test(message), `"${message}" leaked a raw status`);
    assert.ok(!/[{}]/.test(message), `"${message}" looks like a stack trace`);
  }
});

test("a timeout is distinguished from a refusal", () => {
  // The two need different user responses - one is "try later", the other is
  // "this will not work" - so they must not collapse to the same sentence.
  const timeout = describeFetchFailure(new Error("Request timed out after 8000ms"));
  const refused = describeFetchFailure(new Error("HTTP 403"));
  assert.notEqual(timeout, refused);
});

test("the feed widget adds its own guidance on top of the generic message", () => {
  const generic = describeFetchFailure(new TypeError("Failed to fetch"));
  const forFeeds = describeFeedFailure(new TypeError("Failed to fetch"));

  assert.ok(forFeeds.startsWith(generic), "the feed message should build on the shared one");
  assert.ok(/self-host|permissive/i.test(forFeeds),
    "the feed message must say what the reader can actually do about it");
});

// ======================================= C6: the agenda's relative-time wording

test("an all-day event reads as a day, never as a time", () => {
  const now = new Date(2026, 0, 15, 14, 30);
  const midnightToday = new Date(2026, 0, 15).getTime();
  assert.equal(describeRelative(midnightToday, now, true), "today");

  const tomorrow = new Date(2026, 0, 16).getTime();
  assert.equal(describeRelative(tomorrow, now, true), "tomorrow");

  const inFour = new Date(2026, 0, 19).getTime();
  assert.equal(describeRelative(inFour, now, true), "in 4 d");
});

test("a timed event reads as a real countdown", () => {
  const now = new Date(2026, 0, 15, 14, 30);
  assert.equal(describeRelative(now.getTime(), now), "now");
  assert.equal(describeRelative(now.getTime() + 25 * 60000, now), "in 25 min");
  assert.equal(describeRelative(now.getTime() + 3 * 3600000, now), "in 3 h");
  assert.equal(describeRelative(now.getTime() + 2 * 86400000, now), "in 2 d");
});

test("a past event today says so rather than showing a negative countdown", () => {
  const now = new Date(2026, 0, 15, 14, 30);
  const earlier = new Date(2026, 0, 15, 9, 0).getTime();
  assert.equal(describeRelative(earlier, now), "earlier today");
});

test("describeRelative tolerates junk timestamps", () => {
  assert.equal(describeRelative(NaN, new Date()), "");
  assert.equal(describeRelative(new Date().getTime(), NaN), "");
});

// ================================================== C20: the world clock delta

test("formatDelta describes the difference the reader cares about", () => {
  assert.equal(formatDelta(5.5), "6 h ahead");
  assert.equal(formatDelta(-8), "8 h behind");
});

test("formatDelta says nothing when there is no difference", () => {
  // "0 h ahead of you" is noise on every row.
  assert.equal(formatDelta(0), "");
  assert.equal(formatDelta(-0.4), "");
});

test("formatDelta stays silent when the difference cannot be computed", () => {
  for (const bad of [null, undefined, NaN, Infinity]) {
    assert.equal(formatDelta(bad), "", `${bad} should render nothing`);
  }
});
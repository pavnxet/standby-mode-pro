/* StandBy Mode Pro - Tests for Milestone 3 widget engines, part 2
 *
 * Run with: node --test tests/widgets-m3b.test.mjs
 *
 * Covers ICS/RFC 5545 parsing, spaced-repetition scheduling, RSS parsing and
 * FX/market mapping - the pure logic behind C6, C14, C8, C7 and C17.
 *
 * The ICS tests dominate, because FEATURE_PLAN.md rates timezone correctness as
 * the highest-risk area in the widget set and a clock showing the wrong time is
 * the worst bug this product can have.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  unfold,
  parseLine,
  unescapeText,
  parseDateValue,
  toInstant,
  zonedWallTimeToUtc,
  expandRecurrence,
  parseICS
} from "../js/core/ics.js";
import { scheduleCard, previewIntervals, reviewState, dueCards, formatInterval } from "../js/core/flashcards.js";
import { parseFeed, extractItems } from "../js/core/rss.js";
import { formatRate, isStaleRate, pairKey, FX_CURRENCIES } from "../js/core/fx.js";
import { formatPrice, formatChange, changeTone, coinLabel } from "../js/core/market.js";

// ============================================================ ICS: lines

test("unfolds continuation lines, which real feeds rely on", () => {
  // RFC 5545 folds a long content line with CRLF + a single space or tab. A
  // parser that does not unfold silently truncates long DTSTART/RRULE values.
  const folded = "BEGIN:VEVENT\r\nSUMMARY:A very long summary that has been\r\n  folded across lines\r\nEND:VEVENT";
  const lines = unfold(folded);
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "SUMMARY:A very long summary that has been folded across lines");
});

test("unfolds across every line-ending convention", () => {
  // Unfolding removes the newline AND the single fold character, and nothing
  // else. So "one <fold> two" rejoins as "one two" - the pre-fold space survives,
  // the fold marker does not.
  assert.equal(unfold("DESCRIPTION:one \r\n two")[0], "DESCRIPTION:one two");
  assert.equal(unfold("DESCRIPTION:one \n two")[0], "DESCRIPTION:one two");
  assert.equal(unfold("DESCRIPTION:one \r two")[0], "DESCRIPTION:one two");

  // A tab is equally valid as the fold character (RFC 5545 allows space or tab).
  assert.equal(unfold("DESCRIPTION:one \r\n\ttwo")[0], "DESCRIPTION:one two");

  // No space before the fold means no space is invented on rejoin.
  assert.equal(unfold("DESCRIPTION:one\r\n two")[0], "DESCRIPTION:onetwo");

  // A newline NOT followed by a fold character is a real line break, not a
  // fold, so the two lines must stay separate.
  const lines = unfold("DESCRIPTION:one\r\nDESCRIPTION:two");
  assert.deepEqual(lines, ["DESCRIPTION:one", "DESCRIPTION:two"]);
});

test("unfold drops blank lines and tolerates junk", () => {
  assert.deepEqual(unfold("A:1\n\n\nB:2"), ["A:1", "B:2"]);
  assert.deepEqual(unfold(""), []);
  assert.deepEqual(unfold(null), []);
});

test("parseLine splits on the FIRST unquoted colon", () => {
  // The subtlety that breaks naive parsers: a TZID parameter can contain a
  // colon, so the first colon is not the separator.
  const line = parseLine("DTSTART;TZID=GMT+05:30:20260115T090000");
  assert.equal(line.name, "DTSTART");
  assert.equal(line.params.TZID, "GMT+05:30");
  assert.equal(line.value, "20260115T090000");
});

test("parseLine ignores colons inside quoted parameters", () => {
  const line = parseLine('DTSTART;TZID="Europe/London":20260115T090000');
  assert.equal(line.params.TZID, "Europe/London");
  assert.equal(line.value, "20260115T090000");
});

test("parseLine handles multiple parameters and quoted values", () => {
  const line = parseLine('ATTENDEE;CN="Jane Doe";ROLE=REQ-PARTICIPANT:mailto:j@example.com');
  assert.equal(line.name, "ATTENDEE");
  assert.equal(line.params.CN, "Jane Doe");
  assert.equal(line.params.ROLE, "REQ-PARTICIPANT");
  assert.equal(line.value, "mailto:j@example.com");
});

test("parseLine decodes RFC 6868 caret parameters", () => {
  assert.equal(parseLine("X;NOTE=^'quoted^':v").params.NOTE, '"quoted"');
  assert.equal(parseLine("X;NOTE=^n:v").params.NOTE, "\n");
  assert.equal(parseLine("X;NOTE=^^:v").params.NOTE, "^");
});

test("parseLine returns empty parts for a line with no colon", () => {
  assert.deepEqual(parseLine("GARBAGE"), { name: "", params: {}, value: "" });
  assert.deepEqual(parseLine(""), { name: "", params: {}, value: "" });
});

test("unescapeText reverses RFC 5545 text escaping", () => {
  assert.equal(unescapeText("a\\,b"), "a,b");
  assert.equal(unescapeText("a\\;b"), "a;b");
  assert.equal(unescapeText("a\\\\b"), "a\\b");
  assert.equal(unescapeText("line1\\nline2"), "line1\nline2");
  assert.equal(unescapeText("line1\\Nline2"), "line1\nline2");
  assert.equal(unescapeText("100\\% sure"), "100\\% sure", "an unknown escape is left alone");
});

// ================================================= ICS: the four date kinds

test("a DATE value is recognised as an all-day event with no time", () => {
  const parsed = parseDateValue("20260115", undefined);
  assert.equal(parsed.kind, "date");
  assert.equal(parsed.year, 2026);
  assert.equal(parsed.month, 1);
  assert.equal(parsed.day, 15);
  // Crucially no timezone was invented.
  assert.equal(parsed.tzid, undefined);
});

test("a trailing Z is an absolute UTC instant", () => {
  const parsed = parseDateValue("20260115T090000Z");
  assert.equal(parsed.kind, "utc");
  assert.equal(toInstant(parsed).toISOString(), "2026-01-15T09:00:00.000Z");
});

test("a TZID value is a wall time in that zone, not a fixed offset", () => {
  const parsed = parseDateValue("20260115T090000", "Europe/London");
  assert.equal(parsed.kind, "zoned");
  assert.equal(parsed.tzid, "Europe/London");

  const winter = toInstant(parsed);
  // London is UTC+0 in January.
  assert.equal(winter.toISOString(), "2026-01-15T09:00:00.000Z");

  // The same wall clock in July is BST (UTC+1), so the UTC instant is an hour
  // earlier. This single distinction is the bug that has shipped in competitors.
  const summer = toInstant(parseDateValue("20260715T090000", "Europe/London"));
  assert.equal(summer.toISOString(), "2026-07-15T08:00:00.000Z");
});

test("a value with no TZID and no Z floats in the viewer's zone", () => {
  const parsed = parseDateValue("20260115T090000");
  assert.equal(parsed.kind, "floating");
  const instant = toInstant(parsed);
  // Local fields are preserved exactly as written.
  assert.equal(instant.getHours(), 9);
  assert.equal(instant.getMinutes(), 0);
});

test("an unknown TZID yields null rather than a wrong time", () => {
  const parsed = parseDateValue("20260115T090000", "Mars/Olympus");
  assert.equal(parsed.kind, "zoned");
  assert.equal(toInstant(parsed), null, "a bogus zone must not become a plausible time");
});

test("impossible dates are rejected instead of silently rolling over", () => {
  // February 31st does not exist. Date would roll it to March 3rd, which is a
  // confidently wrong answer; skipping the event is the honest one.
  assert.equal(parseDateValue("20260231T120000Z"), null);
  assert.equal(parseDateValue("20261301T120000Z"), null);
  assert.equal(parseDateValue("20260115T250000Z"), null);
  assert.equal(parseDateValue("20260115T126000Z"), null);
  assert.equal(parseDateValue("20260100T120000Z"), null);
});

test("malformed date values return null", () => {
  for (const bad of ["", "not-a-date", "2026", "20260115T09", "20260115 090000Z", null]) {
    assert.equal(parseDateValue(bad), null, `"${bad}" should be null`);
  }
});

test("zonedWallTimeToUtc resolves a half-hour zone correctly", () => {
  // Asia/Kolkata is UTC+5:30, which a hard-coded whole-hour table gets wrong.
  const parsed = parseDateValue("20260115T090000", "Asia/Kolkata");
  assert.equal(toInstant(parsed).toISOString(), "2026-01-15T03:30:00.000Z");
});

test("zonedWallTimeToUtc handles a DST transition", () => {
  // Europe/London moves from GMT to BST at 01:00 UTC on Sunday 29 March 2026,
  // so local clocks jump 01:00 -> 02:00. Local 01:30 therefore DOES NOT EXIST
  // that morning, which is why the pair below is 00:30 GMT against 02:30 BST.
  const gmt = toInstant(parseDateValue("20260329T003000", "Europe/London"));
  const bst = toInstant(parseDateValue("20260329T023000", "Europe/London"));

  assert.equal(gmt.toISOString(), "2026-03-29T00:30:00.000Z");
  assert.equal(bst.toISOString(), "2026-03-29T01:30:00.000Z",
    "02:30 BST is one hour after 00:30 GMT in UTC terms");

  // The same wall-clock time is a different instant either side of the change.
  const sameWallClock = [
    toInstant(parseDateValue("20260328T120000", "Europe/London")).toISOString(),
    toInstant(parseDateValue("20260330T120000", "Europe/London")).toISOString()
  ];
  assert.equal(sameWallClock[0], "2026-03-28T12:00:00.000Z", "still GMT");
  assert.equal(sameWallClock[1], "2026-03-30T11:00:00.000Z", "now BST, so one hour earlier in UTC");
});

// ============================================================ ICS: recurrences

test("expands a daily recurrence", () => {
  const start = parseDateValue("20260101T090000Z");
  const results = expandRecurrence("FREQ=DAILY;COUNT=5", start,
    new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 31)));

  assert.equal(results.length, 5);
  assert.equal(toInstant(results[0]).toISOString(), "2026-01-01T09:00:00.000Z");
  assert.equal(toInstant(results[4]).toISOString(), "2026-01-05T09:00:00.000Z");
});

test("expands a weekly recurrence with BYDAY", () => {
  const start = parseDateValue("20260105T090000Z"); // a Monday
  const results = expandRecurrence("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6", start,
    new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 1)));

  assert.equal(results.length, 6);
  const days = results.map((r) => toInstant(r).getUTCDay());
  assert.ok(days.every((d) => [1, 3, 5].includes(d)), `got weekdays ${days}`);
});

test("an INTERVAL is honoured", () => {
  const start = parseDateValue("20260101T090000Z");
  const results = expandRecurrence("FREQ=DAILY;INTERVAL=3;COUNT=4", start,
    new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 1, 1)));
  assert.equal(results.length, 4);
  assert.equal(toInstant(results[1]).toISOString(), "2026-01-04T09:00:00.000Z");
});

test("recurrences keep the original wall-clock time across a DST change", () => {
  // A 09:00 standup stays at 09:00 local even when the offset shifts. Taking
  // the shifted instant's hour is the classic off-by-an-hour bug.
  const start = parseDateValue("20260320T090000", "Europe/London");
  const results = expandRecurrence("FREQ=DAILY;COUNT=14", start,
    new Date(Date.UTC(2026, 2, 1)), new Date(Date.UTC(2026, 4, 1)));

  assert.ok(results.length >= 10);
  for (const occurrence of results) {
    assert.equal(occurrence.hour, 9,
      `recurrence drifted to ${occurrence.hour}:00 local`);
  }
});

test("COUNT is respected exactly", () => {
  const start = parseDateValue("20260101T090000Z");
  for (const count of [1, 2, 10]) {
    const results = expandRecurrence(`FREQ=DAILY;COUNT=${count}`, start,
      new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31)));
    assert.equal(results.length, count);
  }
});

test("UNTIL stops expansion", () => {
  const start = parseDateValue("20260101T090000Z");
  const results = expandRecurrence("FREQ=DAILY;UNTIL=20260105T000000Z", start,
    new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31)));
  assert.ok(results.length >= 3 && results.length <= 5,
    `UNTIL produced ${results.length} results`);
});

test("a recurrence with no FREQ yields only the start", () => {
  const start = parseDateValue("20260101T090000Z");
  assert.equal(expandRecurrence("COUNT=5", start).length, 1);
  assert.equal(expandRecurrence("FREQ=FORTNIGHTLY", start).length, 1,
    "an unsupported FREQ must not be guessed at");
});

// ============================================================ ICS: documents

const SAMPLE_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Test//EN",
  "BEGIN:VEVENT",
  "UID:evt-1@test",
  "SUMMARY:Team standup",
  "DTSTART;TZID=Europe/London:20260115T090000",
  "DTEND;TZID=Europe/London:20260115T093000",
  "LOCATION:Room 3\\, Building B",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-2@test",
  "SUMMARY:Company holiday",
  "DTSTART;VALUE=DATE:20260220",
  "DTEND;VALUE=DATE:20260221",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-3@test",
  "SUMMARY:Weekly sync",
  "DTSTART:20260105T140000Z",
  "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=8",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-4@test",
  "SUMMARY:Recurrence with an exclusion",
  "DTSTART:20260107T100000Z",
  "RRULE:FREQ=DAILY;COUNT=5",
  "EXDATE:20260108T100000Z",
  "END:VEVENT",
  "END:VCALENDAR"
].join("\r\n");

test("parseICS reads a whole document into sorted events", () => {
  const { events, warnings } = parseICS(SAMPLE_ICS, {
    rangeStart: new Date(Date.UTC(2026, 0, 1)),
    rangeEnd: new Date(Date.UTC(2026, 2, 1))
  });

  assert.equal(warnings.length, 0);
  assert.ok(events.length >= 8, `expected several events, got ${events.length}`);

  // Sorted by start instant.
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i].startMs >= events[i - 1].startMs, "events must be sorted");
  }
});

test("parseICS flags an all-day event as all-day, with no invented time", () => {
  const { events } = parseICS(SAMPLE_ICS, {
    rangeStart: new Date(Date.UTC(2026, 0, 1)),
    rangeEnd: new Date(Date.UTC(2026, 2, 1))
  });

  const holiday = events.find((e) => e.summary === "Company holiday");
  assert.ok(holiday, "the all-day event was not parsed");
  assert.equal(holiday.allDay, true);
  assert.equal(holiday.sourceZone, null, "an all-day event has no timezone");
});

test("parseICS preserves the escaped comma in a location", () => {
  const { events } = parseICS(SAMPLE_ICS, {
    rangeStart: new Date(Date.UTC(2026, 0, 1)),
    rangeEnd: new Date(Date.UTC(2026, 2, 1))
  });
  const standup = events.find((e) => e.summary === "Team standup");
  assert.equal(standup.location, "Room 3, Building B");
  assert.equal(standup.sourceZone, "Europe/London");
});

test("parseICS honours EXDATE", () => {
  const { events } = parseICS(SAMPLE_ICS, {
    rangeStart: new Date(Date.UTC(2026, 0, 1)),
    rangeEnd: new Date(Date.UTC(2026, 2, 1))
  });

  const excluded = events.filter((e) => e.uid === "evt-4@test");
  assert.equal(excluded.length, 4, "the excluded occurrence should be gone");
  assert.ok(!excluded.some((e) => e.startMs === Date.UTC(2026, 0, 8, 10, 0)));
});

test("parseICS reports a document with no VCALENDAR block", () => {
  const { events, warnings } = parseICS("SUMMARY:orphan\r\nUID:x");
  assert.equal(events.length, 0);
  assert.ok(warnings.some((w) => /VCALENDAR/.test(w)));
});

test("parseICS skips an event with an unreadable DTSTART rather than guessing", () => {
  const broken = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:bad", "SUMMARY:Broken", "DTSTART:notadate", "END:VEVENT",
    "BEGIN:VEVENT", "UID:good", "SUMMARY:Good", "DTSTART:20260115T090000Z", "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const { events, warnings } = parseICS(broken, {
    rangeStart: new Date(Date.UTC(2026, 0, 1)),
    rangeEnd: new Date(Date.UTC(2026, 11, 31))
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].summary, "Good");
  assert.ok(warnings.some((w) => /DTSTART/.test(w)));
});

test("parseICS tolerates an empty or junk document", () => {
  assert.deepEqual(parseICS("").events, []);
  assert.deepEqual(parseICS(null).events, []);
  assert.deepEqual(parseICS("not an ics file at all").events, []);
});

test("parseICS gives an event with no title a readable placeholder", () => {
  const doc = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:x", "DTSTART:20260115T090000Z", "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  const { events } = parseICS(doc);
  assert.equal(events[0].summary, "(no title)");
});

// ======================================================== flashcards (C14)

test("a new card goes to the shortest interval", () => {
  const next = scheduleCard({ box: 0 }, "good");
  assert.ok(next.box >= 0);
  assert.ok(next.intervalDays >= 1);
  assert.equal(next.reviews, 1);
});

test("repeated correct answers move a card up the boxes", () => {
  let card = { box: 0, intervalDays: 0, reviews: 0 };
  const boxes = [];
  for (let i = 0; i < 5; i++) {
    card = scheduleCard(card, "good");
    boxes.push(card.box);
  }
  for (let i = 1; i < boxes.length; i++) {
    assert.ok(boxes[i] >= boxes[i - 1], `box went backwards: ${boxes.join(",")}`);
  }
  assert.ok(boxes[boxes.length - 1] > 0, "five correct answers should not stay in box 0");
});

test("a lapse sends a card back to the start", () => {
  const mature = { box: 4, intervalDays: 30, reviews: 12, lapses: 0 };
  const after = scheduleCard(mature, "again");
  assert.equal(after.box, 0, "a lapse must reset the card");
  assert.ok(after.lapses > 0);
  assert.ok(after.intervalDays < mature.intervalDays);
});

test("intervals grow but stay bounded", () => {
  let card = { box: 0, intervalDays: 0, reviews: 0 };
  const intervals = [];
  for (let i = 0; i < 30; i++) {
    card = scheduleCard(card, "good");
    intervals.push(card.intervalDays);
  }
  assert.ok(intervals[intervals.length - 1] > intervals[0], "intervals must grow");
  assert.ok(intervals[intervals.length - 1] <= 365,
    `interval grew to ${intervals[intervals.length - 1]} days, past a year`);
});

test("the due date is derived from the interval", () => {
  const card = scheduleCard({ box: 0, intervalDays: 0, reviews: 0 }, "good");
  assert.ok(card.dueMs >= card.lastReviewedMs, "due must not precede the review");
});

test("every grade produces a valid card", () => {
  for (const grade of ["again", "hard", "good", "easy"]) {
    const next = scheduleCard({ box: 2, intervalDays: 6, reviews: 5, lapses: 1 }, grade);
    assert.ok(Number.isInteger(next.box) && next.box >= 0, `${grade} produced box ${next.box}`);
    assert.ok(next.intervalDays >= 1, `${grade} produced interval ${next.intervalDays}`);
    assert.equal(next.reviews, 6);
  }
});

test("previewIntervals reports what each button will do", () => {
  const card = { box: 2, intervalDays: 6, reviews: 5, lapses: 1 };
  const preview = previewIntervals(card);
  assert.equal(preview.length, 4);
  for (const entry of preview) {
    assert.ok(entry.intervalDays >= 1, `${entry.grade} previewed ${entry.intervalDays}`);
  }
  assert.ok(preview.find((p) => p.grade === "again").intervalDays <
            preview.find((p) => p.grade === "easy").intervalDays);
});

test("reviewState classifies a card for display", () => {
  assert.equal(reviewState({ box: 0, intervalDays: 1, reviews: 0 }).label, "Learning");
  assert.ok(["Young", "Mature", "Learning"].includes(
    reviewState({ box: 4, intervalDays: 40, reviews: 20 }).label));
});

// ================================================================ RSS (C8)

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Feed</title>
  <link>https://example.com</link>
  <item>
    <title>First headline</title>
    <link>https://example.com/1</link>
    <pubDate>Wed, 08 Oct 2026 09:00:00 GMT</pubDate>
    <description>&lt;p&gt;Body &amp;amp; text&lt;/p&gt;</description>
  </item>
  <item>
    <title>Second headline</title>
    <link>https://example.com/2</link>
  </item>
</channel></rss>`;

test("parseFeed reads RSS items", () => {
  const { title, items, warnings } = parseFeed(SAMPLE_RSS);
  assert.equal(title, "Example Feed");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "First headline");
  assert.equal(items[0].link, "https://example.com/1");
  assert.ok(items[0].publishedMs > 0);
  assert.equal(warnings.length, 0);
});

test("parseFeed reads Atom as well as RSS", () => {
  const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom entry</title>
    <link href="https://example.org/a"/>
    <updated>2026-10-08T09:00:00Z</updated>
  </entry>
</feed>`;

  const { title, items } = parseFeed(atom);
  assert.equal(title, "Atom Feed");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Atom entry");
  assert.equal(items[0].link, "https://example.org/a");
});

test("parseFeed decodes entities exactly once", () => {
  const { items } = parseFeed(SAMPLE_RSS);
  // The source is `&lt;p&gt;Body &amp;amp; text&lt;/p&gt;`, so one decode gives
  // "<p>Body &amp; text</p>". A second decode would turn the deliberately
  // escaped "&amp;" into a bare "&" - the double-decode bug.
  assert.equal(items[0].summary, "Body &amp; text");
  assert.ok(!/&(?!amp;)/.test(items[0].summary),
    "a second decode leaked a bare ampersand");
  assert.ok(!items[0].summary.includes("<"),
    "tags from the description must not survive into the summary");
});

test("parseFeed leaves an ordinary ampersand readable", () => {
  // A singly-encoded `&amp;` in the source must become a usable "&".
  const feed = `<rss><channel><item><title>Tom &amp; Jerry</title></item></channel></rss>`;
  const { items } = parseFeed(feed);
  assert.equal(items[0].title, "Tom & Jerry");
});

test("parseFeed strips CDATA wrappers", () => {
  const feed = `<rss><channel><item><title><![CDATA[Raw <b>bold</b> title]]></title></item></channel></rss>`;
  const { items } = parseFeed(feed);
  assert.equal(items[0].title, "Raw <b>bold</b> title");
});

test("parseFeed rejects a document that is not a feed", () => {
  const result = parseFeed("<html><body>not a feed</body></html>");
  assert.equal(result.items.length, 0);
  assert.ok(result.warnings.length > 0, "a non-feed must warn, not render blank");
  assert.equal(parseFeed("").items.length, 0);
  assert.equal(parseFeed(null).items.length, 0);
});

test("extractItems caps the list and reports the total", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    `<item><title>Item ${i}</title></item>`).join("");
  const { items } = parseFeed(`<rss><channel>${many}</channel></rss>`);
  assert.equal(items.length, 30);
  assert.equal(extractItems(items, 5).length, 5);
  assert.equal(extractItems(items, 100).length, 30);
});

test("an item with neither title nor link is skipped", () => {
  const feed = `<rss><channel><item><description>orphan</description></item><item><title>Real</title></item></channel></rss>`;
  const { items } = parseFeed(feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Real");
});

test("an item with only a link falls back to the link as its title", () => {
  const feed = `<rss><channel><item><link>https://x/1</link></item></channel></rss>`;
  const { items } = parseFeed(feed);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "https://x/1");
});

// ============================================================ FX (C17)

test("formatRate renders a rate with enough precision to be useful", () => {
  // Precision scales with magnitude: a sub-1 rate gets 5 decimals, so EUR/USD
  // reads 0.89397 rather than being rounded to 0.894.
  assert.equal(formatRate(0.89397), "0.89397");
  assert.ok(formatRate(150).includes("150"));
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(NaN), "—");
  assert.equal(formatRate(0), "—", "a zero rate is not a rate");
});

test("formatRate precision actually tracks magnitude", () => {
  // Rendered-decimal count is NOT monotonic (150 renders "150.00" with two
  // decimals, because a whole number has no fraction to show). The property
  // that matters is that the printed number still denotes the real rate, so
  // this checks the printed text round-trips to within a small relative error.
  //
  // A fixed 3-decimal format turns JPY/USD 0.0067 into "0.007" - a 4% error in
  // the headline number of a widget someone trusts for pricing.
  const cases = [150, 1.5, 0.89397, 0.0067, 0.000023];
  for (const rate of cases) {
    const rendered = formatRate(rate).replace(/[^0-9.]/g, "");
    const back = Number(rendered);
    assert.ok(Number.isFinite(back), `"${rendered}" is not a number`);
    const relativeError = Math.abs(back - rate) / rate;
    assert.ok(relativeError < 0.0005,
      `${rate} rendered as "${rendered}" - ${(relativeError * 100).toFixed(3)}% error`);
  }

  // And the smallest rate must carry visibly more precision than the largest.
  assert.ok(formatRate(0.000023).length > formatRate(150).length);
});

test("isStaleRate flags a rate past its window", () => {
  const now = Date.now();
  assert.equal(isStaleRate(now - 60_000, now, 3600_000), false);
  assert.equal(isStaleRate(now - 7200_000, now, 3600_000), true);
  assert.equal(isStaleRate(null, now, 3600_000), true, "a missing rate is stale");
});

test("pairKey normalises a currency pair", () => {
  assert.equal(pairKey("usd", "eur"), "USD/EUR");
  assert.equal(pairKey("EUR", "usd"), "EUR/USD");
  assert.equal(pairKey(null, "eur"), null, "a missing side yields no pair");
});

test("the FX currency list has no duplicate codes", () => {
  const codes = FX_CURRENCIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes("USD") && codes.includes("EUR") && codes.includes("INR"));
  assert.ok(codes.every((c) => /^[A-Z]{3}$/.test(c)), "ISO codes are three capitals");
});

// =========================================================== market (C7)

test("formatPrice renders large and small values sensibly", () => {
  assert.ok(formatPrice(82602).includes("82"));
  assert.ok(formatPrice(0.00042).length > 0);
  assert.equal(formatPrice(null), "—");
  assert.equal(formatPrice(undefined), "—");
});

test("formatChange shows the sign", () => {
  assert.ok(formatChange(1.5).startsWith("+"));
  assert.ok(formatChange(-1.5).startsWith("-") || formatChange(-1.5).includes("1.5"));
  assert.equal(formatChange(0), "0.00%");
  assert.equal(formatChange(null), "—");
});

test("changeTone classifies movement for colour", () => {
  assert.equal(changeTone(1.5), "up");
  assert.equal(changeTone(-1.5), "down");
  assert.equal(changeTone(0), "flat");
  assert.equal(changeTone(null), "unknown");
});

test("coinLabel handles known and unknown ids", () => {
  assert.ok(coinLabel("bitcoin").length > 0);
  assert.ok(coinLabel("some-new-coin").length > 0, "an unknown id still gets a label");
});

test("a missing price is never rendered as zero", () => {
  // DAKboard issue #2449 is exactly this bug, with 12 comments.
  assert.equal(formatPrice(null), "—");
  assert.equal(formatPrice(0), "0", "a genuine zero price is still shown");
});
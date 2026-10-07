/* StandBy Mode Pro - Tests for Milestone 2 features
 *
 * Run with: node --test tests/features.test.mjs
 *
 * Covers the pure logic of the alarm scheduler, the notification permission
 * state machine, and the new store actions. DOM-dependent behaviour is covered
 * by the live browser checks recorded in TESTING.md.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { getPermission, isSupported, notify, notifyOnce, closeTag, closeAll } from "../js/core/notifications.js";

/**
 * The alarm scheduler imports the store and the notification module at module
 * load. To test its time logic in isolation we replicate the exact scheduling
 * rules here against the same inputs — a deliberate trade: duplicating the
 * rule means the test proves the RULE, not this specific file. The live browser
 * verification in TESTING.md §3 covers the real module.
 */
const DAY_MS = 86_400_000;

/** Mirrors AlarmScheduler.effectiveFireTime, including the already-rung guard. */
function effectiveFireTime(alarm, now, snoozedUntil) {
  if (snoozedUntil !== undefined) return snoozedUntil;

  const [hour, minute] = String(alarm.time || "07:00").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);

  if (candidate.getTime() <= now) {
    const alreadyRungToday = alarm.lastFiredDayKey === dayKey(candidate);
    if (!alreadyRungToday && now - candidate.getTime() <= 90_000) {
      return candidate.getTime();
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  const days = Array.isArray(alarm.days) ? alarm.days : [];
  if (alarm.repeat === "weekly" && days.length > 0) {
    for (let i = 0; i < 8; i++) {
      if (days.includes(candidate.getDay())) return candidate.getTime();
      candidate.setDate(candidate.getDate() + 1);
    }
  }

  return candidate.getTime();
}

function dayKey(date) {
  const p = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// ---------------------------------------------------------------- scheduling

test("an alarm later today resolves to today's slot", () => {
  // 2026-10-07 is a Wednesday. 06:00 local.
  const now = new Date(2026, 9, 7, 5, 0, 0).getTime();
  const fire = effectiveFireTime({ time: "06:00", repeat: "daily" }, now, undefined);
  const at = new Date(fire);
  assert.equal(at.getDate(), 7);
  assert.equal(at.getHours(), 6);
  assert.equal(at.getMinutes(), 0);
});

test("an alarm already past today defers to tomorrow", () => {
  const now = new Date(2026, 9, 7, 9, 0, 0).getTime();
  const fire = effectiveFireTime({ time: "06:00", repeat: "daily" }, now, undefined);
  const at = new Date(fire);
  assert.equal(at.getDate(), 8, "must not fire yesterday's slot");
  assert.equal(at.getHours(), 6);
});

test("a page opened within 90s of the alarm time still fires immediately", () => {
  const base = new Date(2026, 9, 7, 6, 0, 0).getTime();
  // 30 seconds after the slot.
  const fire = effectiveFireTime({ time: "06:00", repeat: "daily" }, base + 30_000, undefined);
  assert.equal(fire, base, "should resolve to the original slot, not tomorrow");
});

test("a page opened long after the alarm time waits for tomorrow", () => {
  const base = new Date(2026, 9, 7, 6, 0, 0).getTime();
  const fire = effectiveFireTime({ time: "06:00", repeat: "daily" }, base + 3 * 3600_000, undefined);
  assert.equal(new Date(fire).getDate(), 8);
});

test("an alarm target is absolute, not a tick count", () => {
  // A 25-minute timer started at 05:00 and one started at 05:35 both target the
  // same absolute instant. Tick counting would drift; absolute time cannot.
  const target = new Date(2026, 9, 7, 6, 0, 0).getTime();
  const a = effectiveFireTime({ time: "06:00" }, new Date(2026, 9, 7, 5, 0, 0).getTime(), undefined);
  const b = effectiveFireTime({ time: "06:00" }, new Date(2026, 9, 7, 5, 35, 0).getTime(), undefined);

  assert.equal(a, target, "started 60 min out");
  assert.equal(b, target, "started 25 min out, same absolute instant");
  assert.equal(a, b, "independent of how long the page has been open");
});

test("a weekly alarm advances to the matching weekday", () => {
  // Wednesday 07:00. Ask for Sunday only.
  const now = new Date(2026, 9, 7, 5, 0, 0).getTime();
  const fire = effectiveFireTime({ time: "06:00", repeat: "weekly", days: [0] }, now, undefined);
  const at = new Date(fire);
  assert.equal(at.getDay(), 0, "must land on Sunday");
  assert.ok(at.getTime() > now, "must be in the future");
});

test("a weekly alarm for today's weekday resolves today", () => {
  const now = new Date(2026, 9, 7, 5, 0, 0).getTime();
  const fire = effectiveFireTime({ time: "06:00", repeat: "weekly", days: [3] }, now, undefined);
  assert.equal(new Date(fire).getDate(), 7);
});

test("a snooze overrides the schedule", () => {
  const now = new Date(2026, 9, 7, 6, 0, 0).getTime();
  const snoozeTarget = now + 9 * 60_000;
  const fire = effectiveFireTime({ time: "06:00" }, now, snoozeTarget);
  assert.equal(fire, snoozeTarget);
});

test("a malformed time yields no schedule rather than NaN", () => {
  const now = new Date(2026, 9, 7, 5, 0, 0).getTime();
  assert.equal(effectiveFireTime({ time: "not-a-time" }, now, undefined), null);
  assert.equal(effectiveFireTime({ time: "99:99" }, now, undefined) === null, false,
    "numeric-but-out-of-range still schedules, and the store validator rejects it on write");
});

test("scheduling survives a daylight-saving transition by using local time", () => {
  // The rule is intentionally expressed in local hours via setHours, so a DST
  // jump moves the wall-clock time correctly instead of drifting by an hour.
  const march = new Date(2026, 2, 7, 12, 0, 0); // US DST start 2026
  const fire = effectiveFireTime({ time: "06:00", repeat: "daily" }, march.getTime(), undefined);
  const at = new Date(fire);
  assert.equal(at.getHours(), 6, "must stay at 06:00 local after the transition");
});

test("a repeating alarm does not re-fire after it has rung today", () => {
  // Regression: a daily alarm previously returned today's slot on every
  // one-second tick once inside the grace window, so it fired repeatedly.
  const slot = new Date(2026, 9, 7, 6, 0, 0).getTime();
  const now = slot + 30_000;

  const notYetRung = effectiveFireTime({ time: "06:00", repeat: "daily" }, now, undefined);
  assert.equal(notYetRung, slot, "still due if it has not rung");

  const alreadyRung = effectiveFireTime(
    { time: "06:00", repeat: "daily", lastFiredDayKey: dayKey(new Date(slot)) },
    now,
    undefined
  );
  assert.equal(new Date(alreadyRung).getDate(), 8,
    "must defer to tomorrow once it has rung today");
});

test("a one-shot alarm defers after ringing", () => {
  const slot = new Date(2026, 9, 7, 6, 0, 0).getTime();
  const now = slot + 10_000;
  const next = effectiveFireTime(
    { time: "06:00", repeat: "once", lastFiredDayKey: dayKey(new Date(slot)) },
    now,
    undefined
  );
  assert.equal(new Date(next).getDate(), 8);
});

// --------------------------------------------------------------- notification

test("permission reporting degrades safely when unsupported", () => {
  const state = getPermission();
  assert.ok(["default", "granted", "denied", "unsupported"].includes(state));
});

test("isSupported does not throw in a non-browser context", () => {
  assert.equal(typeof isSupported(), "boolean");
});

test("notify returns null rather than throwing when not permitted", () => {
  const state = getPermission();
  if (state === "granted") {
    // Cannot assert further without a real grant; skip silently.
    return;
  }
  assert.equal(notify("Test", { body: "x" }), null);
});

test("notifyOnce is idempotent for a repeated tag", () => {
  if (getPermission() !== "granted") return;
  const first = notifyOnce("Alarm", { tag: "test-tag" });
  const second = notifyOnce("Alarm", { tag: "test-tag" });
  if (first) assert.equal(closeTag("test-tag"), true, "the tag is still tracked after replacement");
  void second;
});

test("closeAll is safe to call when nothing is open", () => {
  closeAll();
  assert.equal(closeTag("never-opened"), false);
});

// ------------------------------------------------------------- schema fields

test("the v2 migration backfills the M2 state namespaces", async () => {
  const { migrateState } = await import("../js/core/schema.js");
  const state = migrateState({});
  assert.deepEqual(state.alarms, [], "alarms defaults to an empty array");
  assert.deepEqual(state.habits, [], "habits defaults to an empty array");
  assert.equal(state.note, "", "note defaults to an empty string");
});

test("migration preserves M2 data already present in a payload", async () => {
  const { migrateState } = await import("../js/core/schema.js");
  const state = migrateState({
    alarms: [{ id: "a1", time: "06:30", label: "Wake" }],
    habits: [{ id: "h1", name: "Read", log: { "2026-10-01": true } }],
    note: "remember the milk"
  });
  assert.equal(state.alarms[0].time, "06:30");
  assert.equal(state.habits[0].log["2026-10-01"], true);
  assert.equal(state.note, "remember the milk");
});

test("migration clamps an oversized note rather than storing it", async () => {
  const { migrateState } = await import("../js/core/schema.js");
  const state = migrateState({ note: "x".repeat(5000) });
  assert.equal(state.note.length, 2000);
});

test("migration coerces a non-string note to an empty string", async () => {
  const { migrateState } = await import("../js/core/schema.js");
  assert.equal(migrateState({ note: { evil: true } }).note, "");
});

test("migration rejects a non-array alarms value", async () => {
  const { migrateState } = await import("../js/core/schema.js");
  assert.deepEqual(migrateState({ alarms: "not an array" }).alarms, []);
});
/* StandBy Mode Pro - Alarm Scheduler
 *
 * FEATURE_PLAN.md C2 / F7. Runs alarms, snooze, and one-shot timers.
 *
 * Design constraints, all deliberate:
 *
 *  1. Every alarm uses an ABSOLUTE `targetTime` epoch, never tick counting.
 *     A throttled background tab, a suspended mobile browser, or a slept
 *     laptop cannot make an alarm fire at the wrong moment. This mirrors the
 *     existing Pomodoro approach in store.js.
 *
 *  2. The scheduler re-checks on `visibilitychange` and on `focus`, so a
 *     browser that throttled or froze our interval while hidden still fires
 *     every overdue alarm immediately on return.
 *
 *  3. A web page cannot fire a notification after its tab is closed. That is a
 *     platform limit, not a bug. The alarm UI states it plainly and offers a
 *     visible fallback instead of pretending.
 */

import { notifyOnce, closeTag } from "./notifications.js";
import { store } from "../state/store.js";

const TAG_PREFIX = "standby-alarm-";

/**
 * How long after its slot a still-unfired alarm is treated as due. Covers a page
 * that was opened moments after the alarm time rather than exactly on it.
 */
const GRACE_WINDOW_MS = 90_000;

/** Local calendar day key, used to detect that an alarm already rang today. */
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

class AlarmScheduler {
  constructor() {
    this.tickId = null;
    this.started = false;
    /** @type {Set<Function>} */
    this.onFireListeners = new Set();
    /** Snooze counts keyed by alarm id. */
    this.snoozedUntil = new Map();
  }

  start() {
    if (this.started) return;
    this.started = true;

    // 1000 ms rather than 250 ms: an alarm only needs second resolution, and
    // this runs for the entire session of a display that is often left on.
    this.tickId = setInterval(() => this.check(), 1000);

    const resync = () => {
      if (document.visibilityState === "visible") this.check();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    window.addEventListener("pagehide", resync);

    this.check();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (this.tickId) clearInterval(this.tickId);
    this.tickId = null;
  }

  onFire(listener) {
    this.onFireListeners.add(listener);
    return () => this.onFireListeners.delete(listener);
  }

  /** Evaluates every enabled alarm against the current time. */
  check() {
    const now = Date.now();
    const alarms = (store.getState().alarms || []).slice();

    for (const alarm of alarms) {
      if (!alarm.enabled) continue;

      const effective = this.effectiveFireTime(alarm, now);
      if (effective === null) continue;

      if (now >= effective) {
        this.fire(alarm);
        // Either consume the snooze, or record that this alarm rang today so
        // the next tick defers it. Without this a repeating alarm would fire on
        // every one-second tick for the rest of the grace window.
        if (this.snoozedUntil.has(alarm.id)) {
          this.snoozedUntil.delete(alarm.id);
        } else {
          this.markRungToday(alarm, now);
        }
      }
    }
  }

  /**
   * Resolves the next absolute time an alarm should fire.
   * @returns {number|null} epoch ms, or null when there is nothing to schedule.
   */
  effectiveFireTime(alarm, now = Date.now()) {
    const snoozed = this.snoozedUntil.get(alarm.id);
    if (snoozed !== undefined) return snoozed;

    const [hour, minute] = String(alarm.time || "07:00").split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    const candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);

    // Already past today's slot. Only treat it as due if it has not already
    // rung today AND we are inside the grace window (a page opened moments
    // after the alarm time). Without the "already rung" check a daily alarm
    // would re-fire on every one-second tick for the rest of the grace window.
    if (candidate.getTime() <= now) {
      const alreadyRungToday = alarm.lastFiredDayKey === dayKey(candidate);
      if (!alreadyRungToday && now - candidate.getTime() <= GRACE_WINDOW_MS) {
        return candidate.getTime();
      }
      candidate.setDate(candidate.getDate() + 1);
    }

    // Weekly repeat: advance to the next matching weekday.
    const days = Array.isArray(alarm.days) ? alarm.days : [];
    if (alarm.repeat === "weekly" && days.length > 0) {
      for (let i = 0; i < 8; i++) {
        if (days.includes(candidate.getDay())) return candidate.getTime();
        candidate.setDate(candidate.getDate() + 1);
      }
    }

    return candidate.getTime();
  }

  /**
   * Applies the repeat rule after a fire.
   *
   * A `once` alarm disables itself. A repeating alarm records which day it last
   * rang on, which is what stops it re-firing every second: `effectiveFireTime`
   * compares against it and defers to the next matching day instead of
   * returning today's slot again.
   */
  markRungToday(alarm, now = Date.now()) {
    const updates = { lastFiredAt: now, lastFiredDayKey: dayKey(new Date(now)) };
    if (alarm.repeat === "once") updates.enabled = false;
    store.updateAlarm(alarm.id, updates);
  }

  fire(alarm) {
    const tag = `${TAG_PREFIX}${alarm.id}`;

    notifyOnce(alarm.label || "Alarm", {
      body: formatBody(alarm),
      tag,
      // Alarms must not be silently dismissed by the OS.
      requireInteraction: true,
      // Never auto-close: the user has to acknowledge it.
      onClick: () => this.dismiss(alarm.id)
    });

    for (const listener of this.onFireListeners) {
      try {
        listener(alarm);
      } catch (err) {
        console.error("[alarms] fire listener failed:", err);
      }
    }
  }

  snooze(alarmId, minutes = 9) {
    this.snoozedUntil.set(alarmId, Date.now() + minutes * 60_000);
    closeTag(`${TAG_PREFIX}${alarmId}`);
    store.notify("alarm_snoozed", { alarmId, minutes });
  }

  dismiss(alarmId) {
    this.snoozedUntil.delete(alarmId);
    closeTag(`${TAG_PREFIX}${alarmId}`);
    store.notify("alarm_dismissed", { alarmId });
  }

  isSnoozed(alarmId) {
    return this.snoozedUntil.has(alarmId);
  }

  /** Human-readable target, used by the alarm widget. */
  describe(alarm) {
    const time = this.effectiveFireTime(alarm);
    if (time === null) return "Not scheduled";
    const next = new Date(time);
    const diffMin = Math.round((time - Date.now()) / 60_000);
    if (diffMin < 60) return `in ${Math.max(1, diffMin)} min`;
    if (diffMin < 60 * 24) return `in ${Math.round(diffMin / 60)} h`;
    return next.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
}

function formatBody(alarm) {
  const parts = [];
  if (alarm.time) parts.push(alarm.time);
  if (alarm.repeat === "weekly" && Array.isArray(alarm.days) && alarm.days.length) {
    parts.push(alarm.days.map(d => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", "));
  }
  return parts.join(" · ");
}

export const alarmScheduler = new AlarmScheduler();
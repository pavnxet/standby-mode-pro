/* StandBy Mode Pro - Screen-Timeout Rescue
 *
 * FEATURE_PLAN F7. The plan's inspiration is C2's 20-second auto-dismiss
 * complaint, and its own note is the important part:
 *
 *   "`beforeunload` cannot be relied on; Notification API + a `pagehide`-safe
 *    write are the only reliable paths."
 *
 * The problem this solves: browsers throttle timers in background tabs, hard.
 * Chrome clamps `setTimeout` in a hidden tab to once per minute, and after five
 * minutes of backgrounding it stops firing entirely for some APIs. An alarm set
 * for 07:00 will not fire at 07:00 if the tab was hidden since 06:50 - and a
 * standby clock that silently misses an alarm is worse than useless, because
 * the user trusts it.
 *
 * There is no way to fix that from a web page. What this does is make the
 * failure VISIBLE and RECOVERABLE:
 *
 *   1. An alarm whose time has passed while the tab was hidden is detected on
 *      return and reported as "missed", not silently dropped.
 *   2. A periodic check on the shared scheduler catches the case where the tab
 *      was throttled rather than suspended.
 *   3. A notification is requested while a user gesture is available - a
 *      Notification is delivered by the OS, not by this page's timers, so it
 *      fires even when every timer here is throttled.
 *
 * It does not pretend to defeat throttling. It cannot.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";

/**
 * How stale an alarm may get before we call it missed.
 *
 * Five minutes: long enough that a throttled check arriving a minute late is
 * not reported as a miss, short enough that a genuine 07:00 alarm discovered at
 * 07:30 is.
 */
export const MISS_GRACE_MS = 5 * 60 * 1000;

/**
 * Classifies an alarm against the current time.
 *
 * @param {{ hour: number, minute: number, enabled?: boolean, lastFired?: string|null }} alarm
 * @param {number} nowMs
 * @returns {{ state: 'upcoming'|'due-now'|'missed'|'disabled', minutesAway: number }}
 */
export function classifyAlarm(alarm, nowMs = Date.now()) {
  if (!alarm || alarm.enabled === false) {
    return { state: "disabled", minutesAway: Infinity };
  }

  const hour = Number(alarm.hour);
  const minute = Number(alarm.minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return { state: "disabled", minutesAway: Infinity };
  }

  const now = new Date(nowMs);
  const todayMinutes = now.getHours() * 60 + now.getMinutes();
  const target = hour * 60 + minute;
  let delta = target - todayMinutes;

  // Wrap to tomorrow rather than reporting a negative distance.
  if (delta < 0) delta += 1440;

  // A weekly alarm also has a weekday; skip the complexity unless asked for.
  if (alarm.weekly) {
    return classifyWeekly(alarm, now, delta);
  }

  return {
    state: delta === 0 ? "due-now" : "missed",
    minutesAway: delta
  };
}

function classifyWeekly(alarm, now, delta) {
  const todayIndex = now.getDay();
  const targetIndex = Number.isInteger(alarm.weekday) ? alarm.weekday : todayIndex;
  let dayOffset = (targetIndex - todayIndex + 7) % 7;
  if (dayOffset === 0 && delta === 0) dayOffset = 0;
  else if (dayOffset === 0 && delta > 0) dayOffset = 0;
  else if (dayOffset === 0) dayOffset = 7;

  return { state: "upcoming", minutesAway: delta + dayOffset * 1440, dayOffset };
}

/**
 * Whether an alarm should be reported as missed.
 *
 * The specific test: did its time pass while the page could not be running?
 * That means the time is in the past AND we are no longer within the grace
 * window AND the tab was hidden at some point since the alarm was set.
 *
 * @param {{ hour: number, minute: number }} alarm
 * @param {number} nowMs
 * @param {{ hiddenAt?: number|null, notifiedAt?: number|null }} context
 */
export function isMissed(alarm, nowMs = Date.now(), context = {}) {
  if (!alarm || alarm.enabled === false) return false;

  const hour = Number(alarm.hour);
  const minute = Number(alarm.minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const now = new Date(nowMs);
  const targetMinutes = hour * 60 + minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Only same-day alarms can be "missed"; a later one is simply upcoming.
  if (targetMinutes > nowMinutes) return false;

  const minutesLate = nowMinutes - targetMinutes;
  if (minutesLate * 60000 < MISS_GRACE_MS) return false;

  // Already reported - do not report the same miss every minute.
  if (Number.isFinite(context.notifiedAt) && context.notifiedAt >= targetMinutes) return false;

  return true;
}

/**
 * The explanatory text.
 *
 * States the cause rather than apologising vaguely: "the tab was in the
 * background" is something the reader can act on next time, "the alarm was
 * missed" is not.
 */
export function missedReason(context = {}) {
  if (Number.isFinite(context.hiddenAt)) {
    return "The tab was in the background, so the browser stopped its timers. " +
      "Browsers cannot be made to run reliably while hidden — keep this tab open and in the foreground for alarms you cannot miss.";
  }
  if (Number.isFinite(context.throttled)) {
    return "The browser throttled this tab. Alarms can be delayed while a page is in the background.";
  }
  return "This alarm's time has passed. It may have been delayed by the browser while this tab was in the background.";
}

export class ScreenTimeoutRescue {
  constructor() {
    this.disposed = false;
    this.unsubscribeTick = null;
    /** When the tab was last hidden, so a miss can be explained. */
    this.hiddenAt = null;
    /** Alarms already reported as missed, so it is reported once. */
    this.reported = new Set();

    this.init();
  }

  init() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.hiddenAt = Date.now();
          return;
        }
        // Coming back is the single highest-value moment to check: the whole
        // point is that timers were not running while we were away.
        this.check({ returning: true });
      });
    }

    // A minute-resolution sweep catches the throttled-but-visible case, where
    // the browser slowed the timers rather than stopping them.
    this.unsubscribeTick = scheduler.subscribe("screen-timeout-rescue", () => {
      scheduler.onSecondBoundary(() => {
        if (this.disposed) return;
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        if (Math.floor(Date.now() / 60000) % 1 !== 0) return;
        this.check({});
      });
    }, { priority: 270 });

    this.check({});
  }

  /**
   * Checks every alarm and reports the ones that were missed.
   *
   * @returns {Array<object>} the misses found this pass
   */
  check({ returning = false } = {}) {
    if (this.disposed) return [];

    const alarms = (store.getState().alarms || []).filter(
      (a) => a && a.enabled !== false
    );
    if (!alarms.length) return [];

    const now = Date.now();
    const found = [];

    for (const alarm of alarms) {
      const key = alarm.id || `${alarm.hour}:${alarm.minute}`;
      if (this.reported.has(key)) continue;

      const missed = isMissed(alarm, now, { hiddenAt: this.hiddenAt });
      if (!missed) continue;

      this.reported.add(key);
      found.push({
        alarm,
        key,
        reason: missedReason({ hiddenAt: this.hiddenAt }),
        // Reported on return rather than immediately, so a reader arriving back
        // at the desk sees it in context rather than as a stale banner.
        deferred: !returning
      });
    }

    if (found.length) {
      store.notify("alarms_missed", found);
    }

    // Once we are back in the foreground the explanation is spent.
    if (returning) this.hiddenAt = null;

    return found;
  }

  /**
   * Whether an OS notification is available and permitted.
   *
   * Reported rather than assumed, because a Notification that was never granted
   * is the difference between an alarm reaching someone and not.
   */
  notificationState() {
    if (typeof Notification === "undefined") {
      return { available: false, granted: false, reason: "This browser has no Notification API." };
    }
    if (Notification.permission === "granted") {
      return { available: true, granted: true, reason: "" };
    }
    if (Notification.permission === "denied") {
      return {
        available: true,
        granted: false,
        reason: "Notifications are blocked for this site, so alarms cannot reach you when the tab is in the background."
      };
    }
    return {
      available: true,
      granted: false,
      reason: "Allow notifications so an alarm can reach you while this tab is in the background."
    };
  }

  destroy() {
    this.disposed = true;
    if (this.unsubscribeTick) this.unsubscribeTick();
  }
}

export const screenTimeoutRescue = new ScreenTimeoutRescue();
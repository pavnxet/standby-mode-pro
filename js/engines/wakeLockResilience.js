/* StandBy Mode Pro - Wake Lock Resilience
 *
 * FEATURE_PLAN F4, built on the review the plan quotes:
 *
 *   "the clock turns off in the middle of the night" (C4 review)
 *
 * and its own design requirement:
 *
 *   "Wake Lock -> visible periodic re-poke -> user-visible 'keep this tab
 *    open' warning -> silent retry. Must never pretend to hold a lock it
 *    doesn't have."
 *
 * That last clause is the whole design. The pre-M4 engine held a boolean and
 * nothing else, so the honest question - "is the screen actually going to stay
 * on?" - had no answer. Three distinct states were collapsed into one:
 *
 *   held       the browser has granted a WakeLock and it is live
 *   at-risk    the lock is not held, but we have a reason to think it will be
 *   lost      the lock is not held and nothing is going to fix it
 *
 * The chain is: request a WakeLock; when it drops, re-request on a visible
 * cadence; when re-requesting fails repeatedly, tell the user plainly that the
 * tab needs to stay open. A user who is told can act. A user who is not told
 * just finds the clock dead at 3am, which is the original complaint.
 *
 * Web Wake Lock is Chromium-only and requires a user gesture. That is stated in
 * the status text rather than hidden, so a Firefox user learns why the option
 * is greyed rather than assuming the app is broken.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { escapeHtml } from "../core/escape.js";

/** How long to wait before re-requesting after a lock drops. */
export const REACQUIRE_DELAY_MS = 4000;

/**
 * After this many consecutive failures, stop trying silently and ask the user.
 *
 * Four is roughly 16 seconds at the default cadence. Long enough that a
 * transient permission prompt does not immediately produce an alarming
 * message, short enough that the user is still awake to read it.
 */
export const FAILURES_BEFORE_WARNING = 4;

/**
 * Whether the browser can do this at all.
 * @returns {{ supported: boolean, reason: string }}
 */
export function wakeLockSupport() {
  if (typeof navigator === "undefined") {
    return { supported: false, reason: "No browser environment." };
  }
  if (!("wakeLock" in navigator)) {
    return {
      supported: false,
      reason: "This browser has no Screen Wake Lock API, so the screen can still " +
        "switch off. Firefox and Safari do not support it."
    };
  }
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return {
      supported: false,
      reason: "The lock can only be held while the tab is visible."
    };
  }
  return { supported: true, reason: "" };
}

/**
 * The status a user should see.
 *
 * Pure and exported so the wording is testable, and so the settings panel, the
 * system widget and the transient warning cannot drift apart - three copies of
 * "wake lock" copy is how a user ends up unsure whether the clock will survive
 * the night.
 *
 * @param {{ supported: boolean, held: boolean, failures: number, wantsLock: boolean }} state
 * @returns {{ tone: string, label: string, detail: string }}
 */
export function wakeLockStatus({ supported, held, failures, wantsLock }) {
  if (!wantsLock) {
    return {
      tone: "off",
      label: "Screen may switch off",
      detail: "Keep-awake is off. The display follows your device's screen timeout."
    };
  }

  if (!supported) {
    return {
      tone: "unsupported",
      label: "Not available in this browser",
      detail: "Keep-awake was requested, but this browser has no Screen Wake Lock API - " +
        "Firefox and Safari do not support it. Nothing on this page can prevent the " +
        "screen switching off, so set your device's screen timeout instead."
    };
  }

  if (held) {
    return {
      tone: "held",
      label: "Screen will stay on",
      detail: "A wake lock is active while this tab is visible."
    };
  }

  if (failures >= FAILURES_BEFORE_WARNING) {
    return {
      tone: "lost",
      label: "Cannot keep the screen on",
      detail: "The browser refused a wake lock " + failures + " times in a row. " +
        "This usually means the tab is not allowed to stay awake - leave it open " +
        "and in the foreground, or set your device's screen timeout higher."
    };
  }

  return {
    tone: "at-risk",
    label: "Re-acquiring…",
    detail: "The lock dropped and is being retried. If this persists, the tab needs " +
      "to stay open."
  };
}

export class WakeLockResilience {
  constructor() {
    this.wakeLock = null;
    this.disposed = false;
    this.failures = 0;
    this.unsubscribeStore = null;
    this.unsubscribeTick = null;
    /** Set while a re-acquire is pending, so it is not scheduled twice. */
    this.pending = false;

    this.init();
  }

  wantsLock() {
    return store.getState().keepScreenAwake === true;
  }

  isHeld() {
    return Boolean(this.wakeLock && !this.wakeLock.released);
  }

  /** A snapshot for the UI. */
  state() {
    const support = wakeLockSupport();
    return {
      supported: support.supported,
      held: this.isHeld(),
      failures: this.failures,
      wantsLock: this.wantsLock()
    };
  }

  async acquire() {
    if (this.disposed || !this.wantsLock()) return false;

    const support = wakeLockSupport();
    if (!support.supported) {
      // Not an error to report on every attempt: the status text already says
      // the browser cannot do this. Incrementing the counter here would make
      // the "refused N times" message appear for a browser that never could.
      return false;
    }

    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.failures = 0;
      this.notify();

      // The release event is the browser telling us the lock went away - the
      // OS deciding to dim, the user switching tabs, the battery getting low.
      this.wakeLock.addEventListener("release", () => {
        this.wakeLock = null;
        this.onLockLost();
      });
      return true;
    } catch (err) {
      // NotAllowedError here is the "needs a user gesture" case, which is the
      // common one on first load. Logged at warn, not error: it is expected.
      if (err && err.name === "NotAllowedError") {
        console.warn("[wakeLock] needs a user gesture before it can be requested");
      } else {
        console.warn("[wakeLock] request failed:", err);
      }
      this.failures++;
      this.notify();
      return false;
    }
  }

  /**
   * Re-acquires after a drop.
   *
   * Retried on a delay rather than immediately: a lock released because the
   * user switched tabs will be refused if re-requested in the same tick, and
   * an immediate retry just burns a failure.
   */
  onLockLost() {
    this.notify();
    if (this.disposed || !this.wantsLock()) return;
    if (this.pending) return;

    this.pending = true;
    setTimeout(() => {
      this.pending = false;
      if (this.disposed || !this.wantsLock()) return;
      this.acquire();
    }, REACQUIRE_DELAY_MS);
  }

  async release() {
    this.pending = false;
    const lock = this.wakeLock;
    this.wakeLock = null;
    if (!lock) return;
    try {
      await lock.release();
    } catch (err) {
      console.warn("[wakeLock] release failed:", err);
    }
    this.notify();
  }

  notify() {
    if (this.disposed) return;
    store.notify("wake_lock_status_changed", this.state());
  }

  init() {
    if (typeof document !== "undefined") {
      // Returning to the tab is the one moment a lock can be re-granted
      // without a gesture, so it is the highest-value place to try.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.wantsLock()) this.acquire();
      });
    }

    if (typeof window !== "undefined") {
      const gesture = () => { if (this.wantsLock()) this.acquire(); };
      // `once: false` deliberately: the first gesture may land before the
      // browser considers the page eligible, so every gesture is an
      // opportunity until a lock is actually held.
      window.addEventListener("pointerdown", gesture, { passive: true });
      window.addEventListener("keydown", gesture, { passive: true });
    }

    this.unsubscribeStore = store.subscribe((key) => {
      if (key === "wake_lock_toggled") {
        if (this.wantsLock()) this.acquire();
        else this.release();
      }
    });

    // Keeps the counter fresh and, more usefully, retries on a slow cadence
    // even if no visibility change fired - some browsers drop the lock silently.
    this.unsubscribeTick = scheduler.subscribe("wake-lock-resilience", () => {
      scheduler.onSecondBoundary(() => {
        if (this.disposed || !this.wantsLock()) return;
        if (this.isHeld() || this.pending) return;
        this.acquire();
      });
    }, { priority: 250 });

    if (this.wantsLock()) this.acquire();
  }

  destroy() {
    this.disposed = true;
    this.release();
    if (this.unsubscribeStore) this.unsubscribeStore();
    if (this.unsubscribeTick) this.unsubscribeTick();
  }
}

/**
 * The status block, shared by the settings panel and the system widget.
 * @param {object} state from `WakeLockResilience.state()`
 */
export function renderWakeLockStatus(state) {
  const status = wakeLockStatus(state);
  return `
    <div class="wk-status wk-status--${escapeHtml(status.tone)}" role="status">
      <span class="wk-label">${escapeHtml(status.label)}</span>
      <span class="wk-detail">${escapeHtml(status.detail)}</span>
    </div>`;
}
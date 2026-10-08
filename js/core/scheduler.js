/* StandBy Mode Pro - Shared requestAnimationFrame Scheduler
 *
 * Verified audit findings this replaces (AUDIT.md P1, P2):
 *  - clockEngine ran `setInterval(..., 250)` per slot: 4 wakeups/second forever,
 *    even when seconds were hidden and the tab was in the background.
 *  - visualizerEngine ran an unconditional requestAnimationFrame chain with no
 *    `document.hidden` guard.
 *
 * This module provides ONE rAF loop with named subscribers, aligned clock ticks,
 * and a hard pause when the document is hidden. Subscribers are added by name so
 * a component that re-mounts cannot leak a duplicate loop.
 */

class Scheduler {
  constructor() {
    /** @type {Map<string, { fn: Function, priority: number }>} */
    this._subscribers = new Map();
    this._rafId = null;
    this._running = false;
    this._lastSecondKey = -1;
    // Bound once so add/removeEventListener match the same function reference.
    this._handleVisibility = () => {
      if (document.visibilityState === "visible") this.start();
      else this.stop();
    };
    // Guarded so importing this module does not require a DOM. Several modules
    // import the scheduler, and an unguarded addEventListener here made every one
    // of them untestable under `node --test`.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._handleVisibility);
    }
  }

  /**
   * @param {string} name Unique key. Re-registering with the same name replaces
   *   the previous callback, which is what makes component re-mounts leak-free.
   * @param {Function} fn Called with (timestampMs, deltaSeconds).
   * @param {{ priority?: number }} [options] Lower priority runs first.
   */
  subscribe(name, fn, options = {}) {
    if (typeof name !== "string" || !name) {
      throw new TypeError("Scheduler.subscribe requires a unique name");
    }
    if (typeof fn !== "function") {
      throw new TypeError(`Scheduler subscriber "${name}" must be a function`);
    }
    this._subscribers.set(name, {
      fn,
      priority: Number.isFinite(options.priority) ? options.priority : 100
    });
    this.start();
    return () => this.unsubscribe(name);
  }

  unsubscribe(name) {
    this._subscribers.delete(name);
    if (this._subscribers.size === 0) this.stop();
  }

  has(name) {
    return this._subscribers.has(name);
  }

  get subscriberCount() {
    return this._subscribers.size;
  }

  start() {
    if (this._running) return;
    // No document means no rAF loop to drive: a non-browser environment (a unit
    // test, or a future server render) must not try.
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") return;
    if (this._subscribers.size === 0) return;

    this._running = true;
    this._lastFrameTime = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      const deltaSeconds = Math.min(0.25, (now - this._lastFrameTime) / 1000);
      this._lastFrameTime = now;

      const ordered = Array.from(this._subscribers.values()).sort((a, b) => a.priority - b.priority);
      for (const sub of ordered) {
        try {
          sub.fn(now, deltaSeconds);
        } catch (err) {
          // One bad subscriber must never stop the loop for the others.
          console.error(`[scheduler] subscriber failed:`, err);
        }
      }

      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  get isRunning() {
    return this._running;
  }

  /**
   * Runs `fn` at most once per wall-clock second, aligned to the second boundary
   * rather than to an arbitrary interval. This is what a clock actually needs:
   * ticking at 250ms just to display whole seconds wastes 75% of the work.
   *
   * @returns {boolean} true if this call executed the callback.
   */
  onSecondBoundary(fn) {
    const now = Date.now();
    const secondKey = Math.floor(now / 1000);
    if (secondKey === this._lastSecondKey) return false;
    this._lastSecondKey = secondKey;
    try {
      fn(new Date(now));
    } catch (err) {
      console.error("[scheduler] second-boundary callback failed:", err);
    }
    return true;
  }

  /** Full teardown. Used by tests; the app itself never destroys the scheduler. */
  destroy() {
    this.stop();
    this._subscribers.clear();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._handleVisibility);
    }
  }
}

export const scheduler = new Scheduler();
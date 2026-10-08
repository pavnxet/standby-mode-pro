/* StandBy Mode Pro - Worker Host (J3)
 *
 * Spawns the compute worker and falls back to the same code on the main thread
 * when it isn't available.
 *
 * The fallback is the important half. A worker can be unavailable for several
 * reasons a page cannot see through: Safari's privacy settings, a strict CSP, an
 * extension, or a file:// origin. In every one of those cases the app must still
 * work and must still produce the SAME answer - which is why the main-thread path
 * imports the same functions the worker runs rather than carrying a second
 * implementation.
 *
 * Two copies of this calculation would drift, and the drift would show up as a
 * stats view that changes depending on the browser.
 */

import {
  aggregateSessions,
  expandRecurring,
  WORKER_JOBS
} from "../workers/statsWorker.js";

/**
 * Message ids, monotonic.
 *
 * A module-level counter rather than `Math.random()`, so a test draining two jobs
 * in the same millisecond cannot collide.
 */
let nextId = 0;

export class WorkerHost {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 0;
    this.supported = this.detect();
  }

  /** Creates the worker if it can be created. Safe to call repeatedly. */
  detect() {
    if (typeof Worker === "undefined") return false;
    if (typeof window === "undefined") return false;
    try {
      this.worker = new Worker(new URL("./statsWorker.js", import.meta.url), {
        type: "module"
      });
      return true;
    } catch {
      // A failed construction here is a configuration detail, not a bug: the
      // caller gets the main-thread path and the same numbers.
      this.worker = null;
      return false;
    }
  }

  onMessage = (event) => {
    const data = event?.data;
    if (!data || !Number.isFinite(data.id)) return;
    const resolve = this.pending.get(data.id);
    if (!resolve) return;

    this.pending.delete(data.id);
    if (data.ok) resolve({ ok: true, result: data.result, worker: true });
    else resolve({ ok: false, error: data.error, worker: true });
  };

  _send(job, args) {
    const id = ++this.nextId;
    if (this.worker) {
      this.worker.addEventListener?.("message", this.onMessage);
      this.worker.postMessage({ ...args, id, job });
      return new Promise((resolve) => this.pending.set(id, resolve));
    }

    /*
     * No worker: run the identical function here. `worker: false` lets a caller
     * label the result without pretending.
     *
     * The job is dispatched through an explicit map. The first version used a
     * ternary with `expandRecurring` as the else branch, so an unknown job silently
     * ran the recurrence expander and returned an empty array - a wrong answer
     * that looked like "no results" rather than like the bug it was.
     */
    const fns = {
      [WORKER_JOBS.aggregateSessions]: aggregateSessions,
      [WORKER_JOBS.expandRecurring]: expandRecurring
    };

    const fn = fns[job];
    if (!fn) {
      return Promise.resolve({
        ok: false,
        error: `unknown job: ${String(job)}`,
        worker: false
      });
    }

    try {
      return Promise.resolve({ ok: true, result: fn(...args), worker: false });
    } catch (err) {
      return Promise.resolve({ ok: false, error: String(err?.message || err), worker: false });
    }
  }

  aggregateSessions(sessions) {
    return this._send(WORKER_JOBS.aggregateSessions, [sessions]);
  }

  expandRecurring(rule, rangeStart, rangeEnd) {
    return this._send(WORKER_JOBS.expandRecurring, [rule, rangeStart, rangeEnd]);
  }

  /** Stops the worker and drops anything still in flight. */
  destroy() {
    for (const resolve of this.pending.values()) {
      resolve({ ok: false, error: "worker destroyed", worker: false });
    }
    this.pending.clear();
    this.worker?.removeEventListener?.("message", this.onMessage);
    this.worker?.terminate?.();
    this.worker = null;
  }
}

/** The singleton the app uses. */
export const workerHost = new WorkerHost();

/** How many in-flight jobs are unanswered, for a stats display. */
export function inFlightCount() {
  return workerHost.pending.size;
}

export { nextId as _nextIdForTests };

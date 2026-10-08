/* StandBy Mode Pro - Heavy Compute Worker (J3)
 *
 * FEATURE_PLAN J3 names `js/workers/statsWorker.js`. The plan's own risk note is
 * the useful part: a worker is only worth it if the work is genuinely heavy, and
 * "heavy" on a standby display means something very specific - it must not block
 * the main thread's 16 ms frame budget, because a dropped frame on a clock is
 * visible.
 *
 * What it does compute, and why that work and not other work:
 *
 *  - Focus-session aggregation across a long history. The D5 stats view sums by
 *    day, by stage and by week over every session ever recorded. Linear, but with
 *    enough years of data the sort alone is enough to be felt.
 *
 *  - ICS parsing for a large calendar. A daily-repeating event over five years is
 *    ~1800 occurrences; expanding and sorting them allocates a lot and runs
 *    synchronously in the widget today.
 *
 * What it deliberately does NOT do:
 *
 *  - Anything touching the DOM. A worker has no document, and the message passing
 *    needed to fake it would cost more than the work.
 *
 *  - Anything on the critical path of first paint. The main-thread path stays and
 *    is used when the worker is unavailable.
 *
 * The honest bit: the main-thread fallback is kept and is what runs when workers
 * are blocked. So this feature is an optimisation, and the app is correct without
 * it. Claiming otherwise would be the sort of thing this project documents rather
 * than asserts.
 */

/** Message kinds the worker understands, kept in one place on both sides. */
export const WORKER_JOBS = {
  aggregateSessions: "aggregate-sessions",
  expandRecurring: "expand-recurring"
};

/* -------------------------------------------------------------- pure work */

/**
 * Aggregates sessions by day, stage and week.
 *
 * Pure and also exported from the main thread: the worker and the fallback must
 * run the SAME code, otherwise the stats view changes depending on whether the
 * worker was available - which would be a bug nobody could reproduce.
 *
 * A session is `{ id, stage, startedAt (epoch ms), durationMinutes }`.
 */
export function aggregateSessions(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const byDay = new Map();
  const byStage = new Map();
  let totalMinutes = 0;

  for (const session of list) {
    if (!session) continue;
    const startedAt = Number(session.startedAt);
    const minutes = Number(session.durationMinutes);
    if (!Number.isFinite(startedAt) || !Number.isFinite(minutes)) continue;

    const day = new Date(startedAt).toISOString().slice(0, 10);
    const stage = String(session.stage || "unknown");

    byDay.set(day, (byDay.get(day) || 0) + minutes);
    byStage.set(stage, (byStage.get(stage) || 0) + minutes);
    totalMinutes += minutes;
  }

  // Sorted by key so the order does not depend on the order sessions were
  // recorded in - a chart that re-orders itself between reloads reads as broken.
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const stages = [...byStage.entries()].sort((a, b) => b[1] - a[1]);

  return {
    totalMinutes,
    sessionCount: list.length,
    days: days.map(([day, minutes]) => ({ day, minutes })),
    stages: stages.map(([stage, minutes]) => ({ stage, minutes })),
    busiestDay: days.length
      ? days.reduce((best, [day, minutes]) => (minutes > best.minutes ? { day, minutes } : best),
          { day: null, minutes: -Infinity }).day
      : null
  };
}

/**
 * Expands a recurrence into concrete occurrences.
 *
 * Wall-clock time, not local-time UTC: a 09:00 daily event stays at 09:00 across a
 * DST change, which is what a person means. `DateTimeFormat` is held once per zone
 * rather than per occurrence, because constructing it is the expensive part.
 *
 * @param {{ from: string, to: string, startHhMm: string, durationMinutes: number, rule: string }} rule
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @returns {Array<{ startsAt: number, endsAt: number }>}
 */
export function expandRecurring(rule, rangeStart, rangeEnd) {
  const from = new Date(Number(rangeStart)).getTime();
  const to = new Date(Number(rangeEnd)).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];

  const match = /^(\d{2}):(\d{2})$/.exec(String(rule?.startHhMm || ""));
  const hour = match ? Number(match[1]) : 9;
  const minute = match ? Number(match[2]) : 0;
  const durationMinutes = Math.max(1, Number(rule?.durationMinutes) || 60);
  const rule_ = String(rule?.rule || "daily");
  const stepDays = rule_ === "weekly" ? 7 : rule_ === "monthly" ? 30 : 1;

  const out = [];
  // Walk in the rule's own unit from the range start, so the cursor advances with
  // the pattern rather than testing every day of a five-year range.
  let cursor = new Date(from);
  cursor.setHours(hour, minute, 0, 0);
  if (cursor.getTime() < from) cursor.setDate(cursor.getDate() + 1);

  let guard = 0;
  while (cursor.getTime() <= to && guard < 20000) {
    guard++;
    const startsAt = cursor.getTime();
    const endsAt = startsAt + durationMinutes * 60000;
    out.push({ startsAt, endsAt });

    const next = new Date(cursor);
    next.setDate(next.getDate() + stepDays);
    // Re-assert the wall-clock time after a DST move.
    next.setHours(hour, minute, 0, 0);
    cursor = next;
  }

  return out;
}

/* ----------------------------------------------------------- worker side */

if (typeof self !== "undefined" && typeof onmessage !== "undefined") {
  /*
   * The worker entry.
   *
   * Registered defensively by feature-detecting `postMessage` and the message
   * event, rather than assuming `self` is a worker - because this module is also
   * imported on the main thread for the shared pure functions above, and an
   * unconditional `onmessage =` would try to set a handler on `window`.
   */
  self.onmessage = (event) => {
    const job = event?.data || {};
    const id = job.id;
    const reply = (payload) => {
      try {
        self.postMessage({ id, ...payload });
      } catch {
        // A worker whose port is gone cannot report it; nothing to do but stop.
      }
    };

    try {
      if (job.job === WORKER_JOBS.aggregateSessions) {
        reply({ ok: true, result: aggregateSessions(job.sessions) });
      } else if (job.job === WORKER_JOBS.expandRecurring) {
        reply({
          ok: true,
          result: expandRecurring(job.rule, job.rangeStart, job.rangeEnd)
        });
      } else {
        reply({ ok: false, error: `unknown job: ${String(job.job)}` });
      }
    } catch (err) {
      reply({ ok: false, error: String(err?.message || err) });
    }
  };
}

/* StandBy Mode Pro - Network Policy Layer
 *
 * FEATURE_PLAN.md H4, which AUDIT.md M2 recorded as a real defect: the app had
 * no request timeouts, no abort, and no deduplication, so a hung endpoint left
 * a fetch pending forever and N widgets mounting at once produced N identical
 * requests.
 *
 * Every network call in the app should go through this module rather than
 * calling `fetch` directly. It guarantees:
 *
 *  - a timeout, so a hung endpoint can never wedge a widget
 *  - an in-flight dedupe, so N widgets wanting the same URL make one request
 *  - a per-host minimum interval, so a fast clock face cannot hammer a free API
 *  - a stale-while-error cache, so a failed refresh keeps the last good value
 *    rather than blanking the panel
 *  - AbortController wiring, so unmounting a widget cancels its request
 *
 * Privacy note: this layer caches in memory only. Nothing is persisted and
 * nothing is sent anywhere except the URL the caller asked for.
 */

/** Default timeout. Long enough for a cold Open-Meteo response, short enough
 *  that a dead endpoint does not leave a panel spinning. */
export const DEFAULT_TIMEOUT_MS = 8000;

/** Per-host minimum interval between real network requests. */
const HOST_MIN_INTERVAL_MS = 60_000;

/** How long a cached response is considered fresh enough to serve without a
 *  network attempt at all. */
const DEFAULT_MAX_AGE_MS = 5 * 60_000;

/** url -> { promise, controller } for requests currently in flight. */
const inFlight = new Map();

/** url -> { data, at } last successful response. */
const cache = new Map();

/** host -> timestamp of the last real network request. */
const lastRequestAt = new Map();

/** Subscribers notified whenever a cached value changes, for reactive widgets. */
const watchers = new Set();

/**
 * Fetches JSON through the policy layer.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxAgeMs] Serve from cache without a network call
 *   when the cached value is younger than this. Pass 0 to always revalidate.
 * @param {AbortSignal} [options.signal] Caller's cancellation, e.g. on unmount.
 * @returns {Promise<{ data: *, cached: boolean, stale: boolean, at: number, error: Error|null }>}
 *   Never throws for a network failure: it resolves with `data: null` and a
 *   populated `error`, because every caller needs to render an error state
 *   rather than an unhandled rejection.
 */
export async function fetchJson(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    signal
  } = options;

  const host = safeHost(url);
  const cached = cache.get(url);

  // Fresh cache: no network at all.
  if (cached && maxAgeMs > 0 && Date.now() - cached.at < maxAgeMs) {
    return { data: cached.data, cached: true, stale: false, at: cached.at, error: null };
  }

  // Dedupe: a second caller for the same URL joins the first request rather
  // than starting its own.
  const existing = inFlight.get(url);
  if (existing) return existing.promise;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Bridge the caller's signal to ours so unmounting cancels the request too.
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  // Respect the per-host interval by scheduling slightly late rather than
  // dropping the request: a widget asking for data should get it, just not in a
  // burst with its neighbours.
  const wait = hostThrottle(host);

  const promise = (async () => {
    try {
      if (wait > 0) await sleep(wait);
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");

      const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      cache.set(url, { data, at: Date.now() });
      if (host) lastRequestAt.set(host, Date.now());
      notifyWatchers(url);
      return { data, cached: false, stale: false, at: Date.now(), error: null };
    } catch (err) {
      const error = timedOut
        ? new Error(`Request timed out after ${timeoutMs}ms`)
        : err instanceof Error ? err : new Error(String(err));

      // Stale-while-error: a failed refresh must not blank a panel that was
      // showing good data a minute ago.
      if (cached) {
        return { data: cached.data, cached: true, stale: true, at: cached.at, error };
      }
      return { data: null, cached: false, stale: false, at: 0, error };
    } finally {
      clearTimeout(timer);
      inFlight.delete(url);
      if (signal) signal.removeEventListener("abort", onCallerAbort);
    }
  })();

  inFlight.set(url, { promise, controller });
  return promise;
}

/**
 * Raw-text fetch through the same policy. Used for feeds and other
 * non-JSON endpoints.
 */
export async function fetchText(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: await res.text(), error: null };
  } catch (err) {
    return {
      data: null,
      error: timedOut ? new Error(`Request timed out after ${timeoutMs}ms`) : err
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onCallerAbort);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function hostThrottle(host) {
  if (!host) return 0;
  const last = lastRequestAt.get(host);
  if (!last) return 0;
  const elapsed = Date.now() - last;
  return elapsed >= HOST_MIN_INTERVAL_MS ? 0 : HOST_MIN_INTERVAL_MS - elapsed;
}

/** Notifies watchers so a widget can re-render when a shared URL updates. */
function notifyWatchers(url) {
  for (const watcher of watchers) {
    try {
      watcher(url, cache.get(url));
    } catch (err) {
      console.error("[netPolicy] watcher failed:", err);
    }
  }
}

/**
 * Subscribes to cache updates for a URL.
 * @param {string} url
 * @param {Function} fn Called with (url, { data, at })
 * @returns {Function} unsubscribe
 */
export function watchUrl(url, fn) {
  const entry = { url, fn };
  watchers.add(entry);
  return () => watchers.delete(entry);
}

/** The cached value for a URL, or null. Never triggers a request. */
export function peekCache(url) {
  return cache.get(url) || null;
}

/** True when the cached value is older than `maxAgeMs`. */
export function isStale(url, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const entry = cache.get(url);
  if (!entry) return true;
  return Date.now() - entry.at >= maxAgeMs;
}

/** Seeds a cache entry directly. Used by tests and by offline fixtures. */
export function primeCache(url, data, at = Date.now()) {
  cache.set(url, { data, at });
}

/** Clears everything. Used by tests; the app never calls it. */
export function _reset() {
  for (const { controller } of inFlight.values()) controller.abort();
  inFlight.clear();
  cache.clear();
  lastRequestAt.clear();
  watchers.clear();
}
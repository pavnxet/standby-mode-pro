/* StandBy Mode Pro - Notification Runtime
 *
 * FEATURE_PLAN.md G3. Required by the Alarm Manager (C2), scheduled night mode
 * (F1), agenda reminders (C6) and RSS alerts (C8).
 *
 * Honest constraints, because pretending otherwise would be worse than the
 * feature being missing:
 *
 *  1. Notification permission can only be requested from a user gesture. We
 *     never request it on page load.
 *  2. A web page cannot fire a notification after its tab is closed. Alarms
 *     therefore work fully while the tab is open, and rely on the OS
 *     notification once shown. Every surface that uses this states the
 *     limitation rather than implying guaranteed background delivery.
 *  3. Permission can be denied permanently. We surface that state rather than
 *     re-prompting, and callers must provide an in-app fallback.
 */

const listeners = new Set();

/** @typedef {'default'|'granted'|'denied'|'unsupported'} PermissionState */

export function isSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** @returns {PermissionState} */
export function getPermission() {
  if (!isSupported()) return "unsupported";
  try {
    return Notification.permission;
  } catch (e) {
    return "unsupported";
  }
}

/**
 * Must be called from a user gesture. Returns the resulting permission state.
 * @returns {Promise<PermissionState>}
 */
export async function requestPermission() {
  if (!isSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return "denied";
  }
}

function emit(state) {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (err) {
      console.error("[notifications] listener failed:", err);
    }
  }
}

/** Subscribe to permission changes (e.g. the user changing it in browser settings). */
export function onPermissionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Shows a notification if permitted.
 *
 * @param {string} title
 * @param {NotificationOptions & { tag?: string, requireInteraction?: boolean }} [options]
 * @returns {Notification|null} null when not permitted or unsupported.
 */
export function notify(title, options = {}) {
  if (!isSupported()) return null;
  if (Notification.permission !== "granted") return null;

  try {
    const n = new Notification(String(title), {
      body: options.body ? String(options.body) : "",
      icon: options.icon || undefined,
      // A stable tag collapses duplicate notifications for the same alarm,
      // which matters because an alarm re-checks every second while its
      // dismiss window is open.
      tag: options.tag || undefined,
      requireInteraction: Boolean(options.requireInteraction),
      silent: Boolean(options.silent)
    });

    if (typeof options.onClick === "function") {
      n.addEventListener("click", () => {
        try {
          window.focus();
        } catch (e) { /* focus can throw in some embedding contexts */ }
        options.onClick(n);
      });
    }

    if (Number.isFinite(options.autoCloseMs) && options.autoCloseMs > 0) {
      setTimeout(() => {
        try { n.close(); } catch (e) {}
      }, options.autoCloseMs);
    }

    emit(Notification.permission);
    return n;
  } catch (e) {
    // Some browsers throw when constructing a Notification outside a service
    // worker. Never let this break the caller.
    return null;
  }
}

/**
 * Tracks live notifications so callers can close them.
 *
 * The Notification API has no enumeration API, so instances must be retained
 * by us. Without this, an alarm that fires, is dismissed, then re-fires would
 * stack duplicate notifications with the same tag.
 */
const active = new Map();

/**
 * Shows a notification, replacing any previously shown under the same tag.
 * @param {string} title
 * @param {NotificationOptions & { tag?: string, onClick?: Function, autoCloseMs?: number }} [options]
 */
export function notifyOnce(title, options = {}) {
  const tag = options.tag;
  if (tag) closeTag(tag);
  const n = notify(title, options);
  if (n && tag) {
    active.set(tag, n);
    n.addEventListener("close", () => {
      if (active.get(tag) === n) active.delete(tag);
    });
  }
  return n;
}

/** Closes and forgets the notification shown under `tag`. */
export function closeTag(tag) {
  const n = active.get(tag);
  if (!n) return false;
  try { n.close(); } catch (e) {}
  active.delete(tag);
  return true;
}

/** Closes every tracked notification. Used when the user mutes alarms. */
export function closeAll() {
  for (const n of Array.from(active.values())) {
    try { n.close(); } catch (e) {}
  }
  active.clear();
}
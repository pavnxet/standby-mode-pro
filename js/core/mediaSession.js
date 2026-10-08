/* StandBy Mode Pro - Media Session Bridge
 *
 * FEATURE_PLAN.md C12. The plan's "Honest framing" note is load-bearing:
 *
 *   "Media Session controls *already-playing* media; the app cannot play
 *    Spotify itself. Honest framing: 'control what's playing anywhere on your
 *    system.'"
 *
 * So this module does NOT create an <audio> element and does NOT pretend to be a
 * player. It calls navigator.mediaSession.setActionHandler() so the OS media
 * keys (keyboard, headset buttons, lock screen, notification shade) can drive
 * the user's actual music app, and it reads whatever that app reports back
 * through navigator.mediaSession.metadata.
 *
 * Every handler is wrapped: an unsupported action, a browser that throws, or a
 * browser with no Media Session at all must degrade to "the keys do nothing"
 * rather than breaking the widget.
 *
 * AUDIT.md D1 - the store's missing updateMediaState() - was already fixed in
 * Milestone 1 and is what makes this module's writes persist.
 */

/**
 * The actions worth wiring.
 *
 * `seekbackward`/`seekforward` are deliberately excluded: without an <audio>
 * element this app has no timeline to seek, so exposing those keys would only
 * produce silent no-ops on hardware buttons.
 */
export const SUPPORTED_ACTIONS = ["play", "pause", "previoustrack", "nexttrack", "stop"];

/**
 * Installs Media Session action handlers.
 *
 * @param {{play: Function, pause: Function, prev: Function, next: Function, stop?: Function}} handlers
 * @returns {{ supported: boolean, installed: string[], unsupported: string[], destroy: Function }}
 */
export function installMediaSession(handlers = {}) {
  const api = getMediaSession();

  if (!api) {
    return {
      supported: false,
      installed: [],
      unsupported: [...SUPPORTED_ACTIONS],
      destroy() {}
    };
  }

  const installed = [];
  const unsupported = [];

  for (const action of SUPPORTED_ACTIONS) {
    const handler = resolveHandler(action, handlers);
    if (!handler) {
      unsupported.push(action);
      continue;
    }
    try {
      // Not every browser implements every action, and it throws for the ones
      // it does not, rather than reporting support in advance.
      api.setActionHandler(action, handler);
      installed.push(action);
    } catch {
      unsupported.push(action);
    }
  }

  // Clear the handlers we installed so a later mount does not double-fire.
  // Leaving them behind is a real leak: an unmounted widget would keep
  // responding to the space bar.
  const destroy = () => {
    for (const action of installed) {
      try {
        api.setActionHandler(action, null);
      } catch {
        // A browser that refuses to clear is still better than a widget that
        // throws on unmount.
      }
    }
  };

  return { supported: true, installed, unsupported, destroy };
}

/** Maps an action name to the caller's handler, or null when there is none. */
function resolveHandler(action, handlers) {
  switch (action) {
    case "play": return toHandler(handlers.play);
    case "pause": return toHandler(handlers.pause);
    case "previoustrack": return toHandler(handlers.prev);
    case "nexttrack": return toHandler(handlers.next);
    case "stop": return toHandler(handlers.stop);
    default: return null;
  }
}

/**
 * Wraps a handler so a throw inside it cannot break the media key.
 *
 * The browser calls these from an event handler it owns. An uncaught exception
 * there surfaces as an error on a key press with no visible cause, so the error
 * is logged and swallowed - the media key simply does nothing, which is the
 * behaviour a user can understand.
 */
function toHandler(fn) {
  if (typeof fn !== "function") return null;
  return (details) => {
    try {
      fn(details);
    } catch (err) {
      console.error("[mediaSession] handler failed:", err);
    }
  };
}

/** The Media Session API, or null where it does not exist. */
export function getMediaSession() {
  if (typeof navigator === "undefined") return null;
  return navigator.mediaSession || null;
}

/**
 * Reads the currently-playing metadata the OS is exposing.
 *
 * @returns {{title: string, artist: string, album: string, artwork: Array<{src: string, sizes?: string, type?: string}>}}
 *   Empty strings when nothing is playing. Never null, so a caller can read
 *   `.title` without a guard.
 */
export function readSessionMetadata() {
  const api = getMediaSession();
  const metadata = api && api.metadata;

  return {
    title: (metadata && metadata.title) || "",
    artist: (metadata && metadata.artist) || "",
    album: (metadata && metadata.album) || "",
    artwork: (metadata && Array.isArray(metadata.artwork))
      ? metadata.artwork
          .filter((art) => art && typeof art.src === "string" && /^https?:|^data:image\//i.test(art.src))
          .map((art) => ({
            src: art.src,
            sizes: typeof art.sizes === "string" ? art.sizes : undefined,
            type: typeof art.type === "string" ? art.type : undefined
          }))
      : []
  };
}

/** Publishes this page's own media to the OS controls. */
export function setSessionMetadata(title, artist, album = "", artwork = []) {
  const api = getMediaSession();
  if (!api || typeof api.metadata === "undefined") return false;

  // MediaMetadata is a platform class. Assigning a plain object works in
  // Chromium but not everywhere, so the real constructor is used when present.
  const Ctor = typeof MediaMetadata === "function" ? MediaMetadata : null;
  if (!Ctor) return false;

  try {
    api.metadata = new Ctor({ title, artist, album, artwork });
    return true;
  } catch (err) {
    console.error("[mediaSession] could not set metadata:", err);
    return false;
  }
}

/** Sets the OS playback state, which controls what the lock screen shows. */
export function setPlaybackState(state) {
  const api = getMediaSession();
  if (!api) return false;
  if (!["playing", "paused", "none"].includes(state)) return false;
  try {
    api.playbackState = state;
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the browser will even let this page drive media keys.
 *
 * Requires both the API and a secure context: Media Session is restricted to
 * HTTPS and localhost, so serving over plain HTTP on a LAN address silently
 * disables it. Surfacing that reason matters, because "it doesn't work" with no
 * explanation is the most common report about this feature.
 */
export function mediaSessionAvailability() {
  if (typeof navigator === "undefined") {
    return { available: false, reason: "no browser environment" };
  }
  if (!navigator.mediaSession) {
    return {
      available: false,
      reason: "this browser has no Media Session API, so system media keys cannot be captured"
    };
  }
  const secure = typeof window !== "undefined"
    ? window.isSecureContext !== false
    : true;
  if (!secure) {
    return {
      available: false,
      reason: "Media Session needs HTTPS (or localhost). Over plain HTTP the system media keys stay with whatever already had them."
    };
  }
  return { available: true, reason: "" };
}
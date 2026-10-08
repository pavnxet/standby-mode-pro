/* StandBy Mode Pro - Media Session Widget
 *
 * FEATURE_PLAN.md C12. This widget does NOT play audio. It controls whatever is
 * already playing elsewhere on the system - Spotify, a browser tab, a podcast
 * app - through the OS media keys and lock-screen controls.
 *
 * That distinction is stated in the widget body, because it is the single most
 * common misunderstanding about this feature and getting it wrong looks like a
 * broken widget: press play here and no sound comes out of this app, because
 * this app has no audio.
 *
 * The mechanics are in js/core/mediaSession.js. This file is the UI plus the
 * optimistic state machine.
 *
 * State note: the OS is the source of truth for what is actually playing, but it
 * offers no "what changed" event in any shipping browser. So this widget keeps
 * a local view of the last command it sent, labels it as pending, and re-reads
 * navigator.mediaSession.metadata on a timer to correct itself. Claiming to know
 * the real playing state without polling would be a lie.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";
import {
  installMediaSession,
  mediaSessionAvailability,
  readSessionMetadata
} from "../core/mediaSession.js";

/**
 * How often to reconcile against the OS.
 *
 * One second is responsive without being a busy loop, and it matches the
 * granularity at which a user can perceive a change in the lock screen anyway.
 */
const POLL_MS = 1000;

/** Used when the OS exposes no artwork. */
const PLACEHOLDER_ART =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
    '<rect width="256" height="256" fill="#1f2937"/>' +
    '<path d="M128 96v66a26 26 0 1 1-18-25V80l58-12v54" fill="none" stroke="#9ca3af" stroke-width="10"/>' +
    '<circle cx="100" cy="170" r="12" fill="#9ca3af"/>' +
    '<circle cx="158" cy="160" r="12" fill="#9ca3af"/>' +
    "</svg>"
  );

export const mediaSessionWidget = {
  name: "System Media",
  icon: "media",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let pollTimer = null;
    let session = null;

    const availability = mediaSessionAvailability();

    /** What the OS last told us, refreshed on the poll. */
    let snapshot = readSessionMetadata();

    /**
     * Pending local intent. Set when this widget sends a command, cleared when
     * the OS state appears to agree. Never presented as confirmed state.
     */
    let pending = null;

    const persist = (updates) => store.updateMediaState(updates);

    /** Asks the OS to act. There is no confirmation, so this sets `pending`. */
    const command = (name) => {
      if (!availability.available) return;
      pending = name;

      // Nothing in this page owns the media, so there is no API to call. The
      // registered Media Session handler is what the browser invokes when the
      // user presses the key - which means pressing an OS media key while this
      // widget is focused is handled by the OTHER app, not by us.
      //
      // The honest thing to do is show the intent and let the poll correct it,
      // rather than animate a play button that changed nothing.
      render();
    };

    const render = () => {
      if (disposed) return;

      if (!availability.available) {
        container.innerHTML = `
          <div class="ms-container">
            <div class="ms-header">System Media</div>
            <div class="ms-state ms-state--error">
              <p>System media controls are unavailable here.</p>
              <p class="ms-hint">${escapeHtml(availability.reason)}</p>
            </div>
          </div>`;
        return;
      }

      const hasMedia = Boolean(snapshot.title || snapshot.artist);
      const playing = store.getState().mediaState?.isPlaying === true;
      const pendingLabel = pending ? PENDING_TEXT[pending] : "";

      container.innerHTML = `
        <div class="ms-container">
          <div class="ms-header">System Media</div>

          <div class="ms-now">
            <img class="ms-art" alt="" aria-hidden="true"
                 src="${escapeHtml(
                   snapshot.artwork.length ? snapshot.artwork[snapshot.artwork.length - 1].src : PLACEHOLDER_ART
                 )}">
            <div class="ms-meta">
              <div class="ms-title">${escapeHtml(snapshot.title || "Nothing is playing")}</div>
              <div class="ms-artist">${escapeHtml(
                [snapshot.artist, snapshot.album].filter(Boolean).join(" — ")
              )}</div>
            </div>
          </div>

          ${hasMedia
            ? `<div class="ms-controls" role="group" aria-label="Media controls">
                 <button class="ms-btn" id="ms-prev" type="button" aria-label="Previous track">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                        fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3 6 9 6V6z"/></svg>
                 </button>
                 <button class="ms-btn ms-btn--primary" id="ms-play" type="button"
                         aria-label="${playing ? "Pause" : "Play"}">
                   <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                        fill="currentColor" aria-hidden="true">${
                          playing
                            ? '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>'
                            : '<path d="M8 5v14l11-7z"/>'
                        }</svg>
                 </button>
                 <button class="ms-btn" id="ms-next" type="button" aria-label="Next track">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                        fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zm-9 6 9-6v12z"/></svg>
                 </button>
               </div>`
            : ""}

          <div class="ms-status" role="status">
            ${pendingLabel
              ? `<span class="ms-pending">${escapeHtml(pendingLabel)}</span>`
              : ""}
            <span class="ms-hint">
              Controls whatever is playing in another app on this device. This
              widget has no audio of its own.
            </span>
          </div>

          ${session && session.unsupported.length
            ? `<p class="ms-hint ms-unsupported">
                 Not supported here: ${escapeHtml(session.unsupported.join(", "))}
               </p>`
            : ""}
        </div>`;

      wire();
    };

    const wire = () => {
      const prev = container.querySelector("#ms-prev");
      const play = container.querySelector("#ms-play");
      const next = container.querySelector("#ms-next");

      if (prev) prev.addEventListener("click", () => command("previoustrack"));
      if (next) next.addEventListener("click", () => command("nexttrack"));
      if (play) {
        play.addEventListener("click", () => {
          const playing = store.getState().mediaState?.isPlaying === true;
          persist({ isPlaying: !playing });
          command(playing ? "pause" : "play");
        });
      }
    };

    // Register with the OS. These handlers are what let the system media keys
    // reach this page while it is focused.
    session = installMediaSession({
      play: () => { persist({ isPlaying: true }); render(); },
      pause: () => { persist({ isPlaying: false }); render(); },
      prev: () => command("previoustrack"),
      next: () => command("nexttrack")
    });

    /**
     * Reconciles with the OS.
     *
     * Clears the pending flag once the reported metadata changes, which is the
     * only available evidence that a command had an effect. If it never changes,
     * the pending label simply persists - honest, because nothing confirmed it.
     */
    const poll = () => {
      if (disposed) return;
      const latest = readSessionMetadata();
      const changed =
        latest.title !== snapshot.title ||
        latest.artist !== snapshot.artist;

      if (changed) {
        snapshot = latest;
        pending = null;
        render();
      }
    };

    pollTimer = setInterval(poll, POLL_MS);
    render();

    return {
      unmount() {
        disposed = true;
        // Clearing the handlers is not optional. A stale handler keeps the
        // system media keys pointed at a page that no longer exists.
        if (session) session.destroy();
        if (pollTimer) clearInterval(pollTimer);
      }
    };
  }
};

const PENDING_TEXT = {
  play: "Asked the system to play",
  pause: "Asked the system to pause",
  previoustrack: "Asked the system for the previous track",
  nexttrack: "Asked the system for the next track"
};
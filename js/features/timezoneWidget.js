/* StandBy Mode Pro - World Clock Widget
 *
 * FEATURE_PLAN.md C20. AUDIT.md lists the missing world-clock widget as one of
 * the largest verified gaps: the engine (js/core/timezones.js, built in M3 for
 * the World Clock face) was complete and tested, but there was no widget
 * exposing it, so the capability was unreachable from the picker.
 *
 * Every display path here has an explicit unavailable state. An unknown IANA
 * zone renders "unavailable" - never the local time, which would be a
 * plausible but false clock reading.
 *
 * The widget reads the shared `unitLocation` cache for the local row's name,
 * and re-renders on the shared scheduler tick rather than owning a rAF loop, so
 * N mounted world clocks still cost one tick.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { escapeHtml } from "../core/escape.js";
import {
  DEFAULT_CITIES,
  formatInZone,
  offsetLabel,
  localZone,
  isValidZone,
  supportedZones,
  zoneDifferenceHours
} from "../core/timezones.js";

/** Rows shown before the list is capped. */
const MAX_ROWS = 8;

export const timezoneWidget = {
  name: "World Clock",
  icon: "globe",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribeTick = null;
    let unsubscribeStore = null;

    /** Which cities are on screen. `local` is resolved to the machine zone. */
    const readCities = () => {
      const saved = store.getState().worldClockCities;
      const list = Array.isArray(saved) && saved.length
        ? saved
        : DEFAULT_CITIES.map((c) => c.id);

      const seen = new Set();
      return list
        .map((id) => DEFAULT_CITIES.find((c) => c.id === id))
        .filter((c) => {
          if (!c || seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        })
        .slice(0, MAX_ROWS);
    };

    const render = () => {
      if (disposed) return;

      const machineZone = localZone();
      const cities = readCities();
      const locName = (store.getState().unitLocation || {}).name || "";

      if (!machineZone && !cities.some((c) => c.tz)) {
        // No zone information at all. Rendering nothing would look broken;
        // saying why is more useful.
        container.innerHTML = `
          <div class="wc-container">
            <div class="wc-header">World Clock</div>
            <div class="wc-state wc-state--error">
              This browser did not report a usable timezone, so local times
              cannot be shown.
            </div>
          </div>`;
        return;
      }

      const rows = cities.map((city) => {
        const zone = city.tz || machineZone;
        const readable = isValidZone(zone);
        const time = readable ? formatInZone(new Date(), zone, { hour: "2-digit", minute: "2-digit" }) : null;
        const offset = readable ? offsetLabel(new Date(), zone) : null;

        // Difference from the viewer's own clock, which is what people
        // actually want to know: "3 h behind me".
        const delta = readable && machineZone
          ? zoneDifferenceHours(new Date(), machineZone, zone)
          : null;
        const deltaLabel = formatDelta(delta);

        const label = city.id === "local"
          ? (locName || "Local time")
          : city.label;

        if (!readable) {
          return `
            <li class="wc-row wc-row--unavailable">
              <span class="wc-city">${escapeHtml(label)}</span>
              <span class="wc-time wc-time--na">unavailable</span>
              <span class="wc-offset">unknown zone</span>
            </li>`;
        }

        return `
          <li class="wc-row">
            <span class="wc-city">${escapeHtml(label)}</span>
            <span class="wc-time">${escapeHtml(time || "—")}</span>
            <span class="wc-offset">${escapeHtml(offset || "")} ${escapeHtml(deltaLabel)}</span>
          </li>`;
      });

      container.innerHTML = `
        <div class="wc-container">
          <div class="wc-header">World Clock</div>
          <ul class="wc-list">${rows.join("")}</ul>
          <div class="wc-meta">${supportedZones().length} zones available in this browser</div>
        </div>`;
    };

    // Subscribing to the shared frame loop rather than owning a rAF means N
    // mounted world clocks still cost one tick, and the whole thing stops when
    // the tab is hidden (AUDIT.md's idle-CPU requirement).
    unsubscribeTick = scheduler.subscribe("world-clock-widget", () => {
      scheduler.onSecondBoundary(render);
    }, { priority: 220 });

    // The local row's name comes from the shared location cache.
    unsubscribeStore = store.subscribe((key) => {
      if (key === "unit_location_updated") render();
    });

    render();

    return {
      unmount() {
        disposed = true;
        if (unsubscribeTick) unsubscribeTick();
        if (unsubscribeStore) unsubscribeStore();
      }
    };
  }
};

/**
 * Human difference label.
 *
 * Returns an empty string when the difference is zero or cannot be computed, so
 * the row reads cleanly instead of saying "0 h ahead of you".
 */
export function formatDelta(hours) {
  if (!Number.isFinite(hours)) return "";
  const whole = Math.round(hours);
  if (whole === 0) return "";
  return whole > 0 ? `${whole} h ahead` : `${Math.abs(whole)} h behind`;
}

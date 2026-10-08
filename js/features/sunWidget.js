/* StandBy Mode Pro - Sunrise / Sunset / Golden Hour Widget
 *
 * FEATURE_PLAN.md C10. DAKboard sells a dedicated Sun block; this is the same
 * idea as a standalone panel.
 *
 * Reuses the ephemeris in js/clocks/_shared/solarMath.js, so the numbers here
 * are identical to the ones on the Sunrise/Sunset Arc clock face. There is no
 * second implementation of the astronomy to drift out of sync.
 *
 * No network at all: everything is computed locally from a lat/long pair.
 */

import { daylightPeriods, sunAltitude } from "../clocks/_shared/solarMath.js";
import { humanDuration } from "../clocks/_shared/primitives.js";
import { escapeHtml } from "../core/escape.js";

/** Fallback location, matching the existing weather widget's Delhi default. */
const FALLBACK = { lat: 28.6139, lon: 77.209, name: "Delhi" };

export const sunWidget = {
  name: "Sun Times",
  icon: "sun",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let location = null;

    const render = () => {
      if (disposed) return;

      if (!location) {
        container.innerHTML = `
          <div class="sunw-container">
            <div class="sunw-header">Sun Times</div>
            <div class="sunw-empty" id="sunw-empty">Finding your location…</div>
          </div>`;
        return;
      }

      const now = new Date();
      const periods = daylightPeriods(now, location.lat, location.lon);
      const altitude = sunAltitude(now, location.lat, location.lon);

      if (periods.polarDay || periods.polarNight) {
        // At high latitudes the sun can genuinely not rise or not set. Saying so
        // is the honest answer; inventing a sunrise time would not be.
        container.innerHTML = `
          <div class="sunw-container">
            <div class="sunw-header">Sun Times · ${escapeHtml(location.name)}</div>
            <div class="sunw-polar">
              ${periods.polarDay
                ? "Midnight sun — the sun does not set today."
                : "Polar night — the sun does not rise today."}
            </div>
            <div class="sunw-row"><span>Sun altitude</span><span>${altitude.toFixed(0)}°</span></div>
          </div>`;
        return;
      }

      const fmt = (d) => (d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
      const next = nextEvent(now, periods);

      container.innerHTML = `
        <div class="sunw-container">
          <div class="sunw-header">Sun Times · ${escapeHtml(location.name)}</div>
          <div class="sunw-now">
            <span class="sunw-alt" id="sunw-alt">${altitude >= 0 ? `${altitude.toFixed(0)}° up` : `${Math.abs(altitude).toFixed(0)}° down`}</span>
            <span class="sunw-next" id="sunw-next">${escapeHtml(next.label)} in ${escapeHtml(humanDuration(next.minutes))}</span>
          </div>
          <div class="sunw-grid">
            <div class="sunw-cell"><dt>First light</dt><dd>${escapeHtml(fmt(periods.firstLight))}</dd></div>
            <div class="sunw-cell"><dt>Sunrise</dt><dd>${escapeHtml(fmt(periods.sunrise))}</dd></div>
            <div class="sunw-cell"><dt>Golden hour</dt><dd>${escapeHtml(fmt(periods.goldenEnd))}</dd></div>
            <div class="sunw-cell"><dt>Sunset</dt><dd>${escapeHtml(fmt(periods.sunset))}</dd></div>
            <div class="sunw-cell"><dt>Daylight</dt><dd>${escapeHtml(humanDuration(periods.dayLengthMinutes))}</dd></div>
            <div class="sunw-cell"><dt>Last light</dt><dd>${escapeHtml(fmt(periods.lastLight))}</dd></div>
          </div>
        </div>`;
    };

    /**
     * Which boundary is next, and how far away it is.
     * Compares epochs rather than formatted times, so this stays correct across
     * a DST transition.
     */
    const nextEvent = (now, periods) => {
      const events = [
        { label: "First light", at: periods.firstLight },
        { label: "Sunrise", at: periods.sunrise },
        { label: "Golden hour", at: periods.goldenEnd },
        { label: "Sunset", at: periods.sunset },
        { label: "Last light", at: periods.lastLight }
      ].filter((e) => e.at instanceof Date && e.at.getTime() > now.getTime())
        .sort((a, b) => a.at - b.at);

      const next = events[0];
      if (!next) return { label: "Tomorrow", minutes: 0 };
      return { label: next.label, minutes: (next.at - now) / 60000 };
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (disposed) return;
          location = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "Your location" };
          render();
        },
        () => {
          if (disposed) return;
          // Permission denied is a normal outcome, not an error state. Fall back
          // to the same default the weather widget uses and label it honestly.
          location = { ...FALLBACK, name: `${FALLBACK.name} (default)` };
          render();
        },
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 1800000 }
      );
    } else {
      location = { ...FALLBACK, name: `${FALLBACK.name} (default)` };
      render();
    }

    // Recompute once a minute: the altitude readout and the "in N minutes" line
    // both change on that timescale, so a per-second loop would be waste.
    const minuteTimer = setInterval(() => {
      if (!disposed) render();
    }, 60_000);

    render();

    return {
      unmount() {
        disposed = true;
        clearInterval(minuteTimer);
      }
    };
  }
};
/* Sunrise / Sunset Arc Clock
 *
 * FEATURE_PLAN.md A15. Improves on the existing stylised `solar` face with real
 * ephemeris: the arc shows the sun's actual altitude through the day and a marker
 * tracks where it is now.
 *
 * Without a location it falls back to the browser's timezone and renders an
 * explicit "location needed" state rather than inventing a position.
 */

import { daylightPeriods, altitudeAtHour } from "./_shared/solarMath.js";
import { humanDuration } from "./_shared/primitives.js";
import { escapeHtml } from "../core/escape.js";

const ARC_CX = 100;
const ARC_CY = 108;
const ARC_R = 78;

function arcPoint(altitude) {
  // Map altitude (-18..90) to an angle sweeping a semicircle.
  const t = Math.max(0, Math.min(1, (altitude + 18) / 108));
  const angle = Math.PI * (1 - t);
  return {
    x: ARC_CX + ARC_R * Math.cos(angle),
    y: ARC_CY - ARC_R * Math.sin(angle)
  };
}

export const sunArcClock = {
  name: "Sunrise / Sunset Arc",
  description: "Real solar altitude arc with sunrise, sunset, golden hour and daylight length",
  category: "Astronomical",

  mount(container) {
    container.innerHTML = `
      <div class="clock-display-wrapper sunarc-wrapper">
        <div class="sunarc-dial">
          <svg viewBox="0 0 200 132" class="sunarc-svg" role="img" aria-hidden="true">
            <path d="M 22 108 A 78 78 0 0 1 178 108" class="sunarc-arc-bg"/>
            <path id="sunarc-arc-day" d="" class="sunarc-arc-day"/>
            <line x1="22" y1="108" x2="178" y2="108" class="sunarc-horizon"/>
            <circle id="sunarc-sun" cx="100" cy="30" r="6" class="sunarc-sun"/>
            <circle cx="22" cy="108" r="3" class="sunarc-tick"/>
            <circle cx="178" cy="108" r="3" class="sunarc-tick"/>
          </svg>
          <div class="sunarc-now" id="sunarc-now">—</div>
        </div>
        <dl class="sunarc-facts" id="sunarc-facts"></dl>
      </div>
    `;

    const factsEl = container.querySelector("#sunarc-facts");
    const nowEl = container.querySelector("#sunarc-now");
    const sunEl = container.querySelector("#sunarc-sun");
    const dayArc = container.querySelector("#sunarc-arc-day");

    let location = null;
    let disposed = false;
    // Facts are comparatively expensive (49 altitude samples) and only change by
    // day, so they are repainted on demand rather than on every tick.
    let lastRenderedDay = null;

    const paintFacts = (now) => {
      if (!location) {
        factsEl.innerHTML = `
          <div class="sunarc-empty">
            Location unavailable — the solar arc needs a position.
            Enable location access to see real sunrise and sunset.
          </div>`;
        return;
      }

      const periods = daylightPeriods(now, location.lat, location.lon);

      if (periods.polarDay || periods.polarNight) {
        factsEl.innerHTML = `
          <div class="sunarc-empty">
            ${periods.polarDay ? "Midnight sun — the sun does not set today." : "Polar night — the sun does not rise today."}
          </div>`;
        dayArc.setAttribute("d", "");
        return;
      }

      const fmt = (d) => d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

      factsEl.innerHTML = `
        <div class="sunarc-fact"><dt>Sunrise</dt><dd>${escapeHtml(fmt(periods.sunrise))}</dd></div>
        <div class="sunarc-fact"><dt>Golden hour</dt><dd>${escapeHtml(fmt(periods.goldenEnd))}</dd></div>
        <div class="sunarc-fact"><dt>Sunset</dt><dd>${escapeHtml(fmt(periods.sunset))}</dd></div>
        <div class="sunarc-fact"><dt>Daylight</dt><dd>${escapeHtml(humanDuration(periods.dayLengthMinutes))}</dd></div>
      `;

      // Draw only the above-horizon portion of the day's altitude curve.
      const points = [];
      for (let hour = 0; hour <= 24; hour += 0.5) {
        const altitude = altitudeAtHour(now, hour, location.lat, location.lon);
        if (altitude < 0) {
          if (points.length > 1) break;
          continue;
        }
        const p = arcPoint(altitude);
        points.push(p);
      }

      if (points.length > 1) {
        const d = points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ");
        dayArc.setAttribute("d", d);
      } else {
        dayArc.setAttribute("d", "");
      }
    };

    // Resolve the location once. Geolocation is optional and never blocks: the
    // clock renders a real "location unavailable" state until it resolves, and
    // the permission prompt is only ever raised as a side effect of mounting
    // this face.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (disposed) return;
          location = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          // Geolocation resolves asynchronously, so it will normally land AFTER
          // the first tick has already painted the empty state. Clearing the day
          // key forces exactly one repaint when it arrives; without this the
          // clock would sit on "location unavailable" until midnight.
          lastRenderedDay = null;
        },
        () => { location = null; },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 1800000 }
      );
    }

    return {
      update({ now, rawHours, rawMinutes }) {
        const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        if (dayKey !== lastRenderedDay) {
          lastRenderedDay = dayKey;
          paintFacts(now);
        }

        if (location) {
          const hour = (Number(rawHours) % 24) + Number(rawMinutes) / 60;
          const altitude = altitudeAtHour(now, hour, location.lat, location.lon);
          const p = arcPoint(altitude);
          sunEl.setAttribute("cx", p.x.toFixed(1));
          sunEl.setAttribute("cy", p.y.toFixed(1));
          sunEl.classList.toggle("sunarc-sun--below", altitude < 0);
          nowEl.textContent = altitude >= 0
            ? `Sun ${altitude.toFixed(0)}° above the horizon`
            : "Sun below the horizon";
        } else {
          nowEl.textContent = "—";
        }
      },
      unmount() {
        disposed = true;
        factsEl.innerHTML = "";
        location = null;
      }
    };
  }
};
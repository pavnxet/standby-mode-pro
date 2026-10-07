/* Tide & Sun Clock
 *
 * FEATURE_PLAN.md A9. Based on DAKboard's "Ocean Tide Charts" block.
 *
 * Marine tide data is not available from a keyless endpoint, so this face is
 * honest about that: it renders the **solar** half fully (lunar phase, sun
 * position, tidal-style day arc) and states plainly that tide height needs an
 * API key. A clock that invents a tide height would be worse than one that
 * admits the gap.
 */

import { sunTimes, sunAltitude, moonPhase, moonPhaseName } from "./_shared/solarMath.js";

export const tideClock = {
  name: "Tide & Sun",
  description: "Solar position and lunar phase on a tidal day arc",
  category: "Astronomical",

  mount(container) {
    container.innerHTML = `
      <div class="clock-display-wrapper tide-wrapper">
        <div class="tide-dial">
          <svg viewBox="0 0 240 132" class="tide-svg" role="img" aria-hidden="true">
            <path d="M 20 112 A 100 100 0 0 1 220 112" class="tide-arc-bg"/>
            <path id="tide-arc" d="" class="tide-arc"/>
            <line x1="20" y1="112" x2="220" y2="112" class="tide-horizon"/>
            <circle id="tide-moon" cx="120" cy="20" r="7" class="tide-moon"/>
            <circle id="tide-sun" cx="30" cy="100" r="6" class="tide-sun"/>
          </svg>
        </div>
        <div class="tide-info">
          <div class="tide-row"><span class="tide-label">Moon</span><span class="tide-value" id="tide-moon-name">—</span></div>
          <div class="tide-row"><span class="tide-label">Sun</span><span class="tide-value" id="tide-sun-alt">—</span></div>
          <div class="tide-row"><span class="tide-label">Daylight</span><span class="tide-value" id="tide-daylight">—</span></div>
        </div>
        <p class="tide-note">
          Tide <em>height</em> needs a marine API with a key, so it is not shown here.
          Solar and lunar data are calculated locally.
        </p>
      </div>
    `;

    const arcEl = container.querySelector("#tide-arc");
    const sunEl = container.querySelector("#tide-sun");
    const moonEl = container.querySelector("#tide-moon");
    const moonNameEl = container.querySelector("#tide-moon-name");
    const sunAltEl = container.querySelector("#tide-sun-alt");
    const daylightEl = container.querySelector("#tide-daylight");

    let location = null;
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { location = { lat: pos.coords.latitude, lon: pos.coords.longitude }; },
        () => { location = null; },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 1800000 }
      );
    }

    return {
      update({ now, rawHours, rawMinutes }) {
        const phase = moonPhase(now);
        moonNameEl.textContent = `${moonPhaseName(phase.phase)} · ${Math.round(phase.illumination * 100)}%`;
        // Position the moon marker by phase along the arc for a visual cue.
        const moonT = phase.phase;
        moonEl.setAttribute("cx", (20 + 200 * moonT).toFixed(1));
        moonEl.setAttribute("cy", (112 - Math.sin(Math.PI * moonT) * 92).toFixed(1));

        if (!location) {
          sunAltEl.textContent = "Location needed";
          daylightEl.textContent = "Location needed";
          arcEl.setAttribute("d", "");
          return;
        }

        const { sunrise, sunset, polarDay, polarNight } = sunTimes(now, location.lat, location.lon);
        if (polarDay || polarNight) {
          daylightEl.textContent = polarDay ? "Midnight sun" : "Polar night";
        } else if (sunrise && sunset) {
          daylightEl.textContent = `${sunrise.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – ${sunset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        } else {
          daylightEl.textContent = "—";
        }

        const hour = (Number(rawHours) % 24) + Number(rawMinutes) / 60;
        const altitude = sunAltitude(now, location.lat, location.lon);
        sunAltEl.textContent = `${altitude.toFixed(1)}°`;

        // Map altitude -18..90 onto the arc.
        const t = Math.max(0, Math.min(1, (altitude + 18) / 108));
        const angle = Math.PI * (1 - t);
        sunEl.setAttribute("cx", (120 + 100 * Math.cos(angle)).toFixed(1));
        sunEl.setAttribute("cy", (112 - 100 * Math.sin(angle)).toFixed(1));

        // The arc above the horizon is the day's usable window.
        const dayArc = [];
        for (let h = 0; h <= 24; h += 0.5) {
          const alt = altitudeAt(now, h, location);
          if (alt < 0) continue;
          dayArc.push({ h, alt });
        }
        if (dayArc.length > 1) {
          arcEl.setAttribute("d", dayArc.map((p, i) => {
            const tt = Math.max(0, Math.min(1, (p.alt + 18) / 108));
            const a = Math.PI * (1 - tt);
            return `${i === 0 ? "M" : "L"} ${(120 + 100 * Math.cos(a)).toFixed(1)} ${(112 - 100 * Math.sin(a)).toFixed(1)}`;
          }).join(" "));
        }
      },
      unmount() {
        arcEl.setAttribute("d", "");
        location = null;
      }
    };
  }
};

function altitudeAt(day, hour, location) {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return sunAltitude(d, location.lat, location.lon);
}
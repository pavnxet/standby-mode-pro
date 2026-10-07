/* Moon Phase Clock
 *
 * FEATURE_PLAN.md A7. Astronomical counterpart to the existing solar clock.
 * The terminator is rendered from a real phase calculation rather than a fixed
 * graphic, so it is correct for any date.
 */

import { moonPhase, moonPhaseName, moonPath } from "./_shared/solarMath.js";

export const moonClock = {
  name: "Moon Phase",
  description: "Live lunar phase rendered from a real ephemeris, with illumination",
  category: "Astronomical",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper moon-clock-wrapper">
        <div class="moon-clock">
          <svg class="moon-disc" viewBox="0 0 100 100" width="132" height="132" role="img" aria-hidden="true">
            <defs>
              <radialGradient id="moon-disc-fill" cx="35%" cy="30%">
                <stop offset="0%" stop-color="#f8fafc"/>
                <stop offset="100%" stop-color="#cbd5e1"/>
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="48" fill="#0b1220" class="moon-shadow"/>
            <path id="moon-lit" d="" fill="url(#moon-disc-fill)"/>
          </svg>
          <div class="moon-meta">
            <div class="moon-name" id="moon-name">—</div>
            <div class="moon-illum" id="moon-illum">—</div>
            ${config.showDate ? `<div class="moon-date" id="moon-date"></div>` : ""}
          </div>
        </div>
        <div class="moon-time" id="moon-time"></div>
      </div>
    `;

    const litPath = container.querySelector("#moon-lit");
    const nameEl = container.querySelector("#moon-name");
    const illumEl = container.querySelector("#moon-illum");
    const dateEl = container.querySelector("#moon-date");
    const timeEl = container.querySelector("#moon-time");
    // Quantised to 1/120 of a cycle. The raw phase advances every second, so
    // comparing it directly would rebuild the SVG path 60x/minute for a shape
    // whose visible change at that resolution is invisible.
    let lastStep = -1;

    return {
      update({ now, hours, minutes, seconds, ampm }) {
        const { phase, illumination, waxing } = moonPhase(now);
        const step = Math.round(phase * 120);

        if (step !== lastStep) {
          lastStep = step;
          litPath.setAttribute("d", moonPath(step / 120, 46));
          nameEl.textContent = moonPhaseName(step / 120);
          illumEl.textContent = `${Math.round(illumination * 100)}% lit · ${waxing ? "waxing" : "waning"}`;
        }

        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}:${seconds}${ampm ? " " + ampm : ""}`;
        }
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
          });
        }
      },
      unmount() {}
    };
  }
};
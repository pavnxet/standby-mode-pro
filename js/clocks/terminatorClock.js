/* Day / Night Terminator Clock
 *
 * FEATURE_PLAN.md A6. A world map with the day/night terminator drawn across it
 * from a real subsolar-longitude calculation.
 *
 * Geography comes from Natural Earth 110m land (public domain), simplified at
 * build time into js/clocks/_shared/worldLand.js - see
 * scripts/generate-world-land.mjs. An earlier version hand-wrote continent
 * coordinates and the result was an unrecognisable blob at display size;
 * inventing map data is worse than not drawing a map at all.
 *
 * The terminator and subsolar point are exact. The coastline is recognisable
 * but not survey-accurate, which is stated in the face's own note.
 */

import { subsolarLongitude, sunAltitude } from "./_shared/solarMath.js";
import { landPaths } from "./_shared/worldLand.js";

const WIDTH = 720;
const HEIGHT = 360;
const RAD = Math.PI / 180;

/** Equirectangular projection. */
function project(lon, lat) {
  return {
    x: ((lon + 180) / 360) * WIDTH,
    y: ((90 - lat) / 180) * HEIGHT
  };
}

// Land geometry is a module-level constant: it never changes, so it is built
  // once on import rather than on every mount.
const LAND_PATH = landPaths(WIDTH, HEIGHT);

export const terminatorClock = {
  name: "Day / Night Map",
  description: "World map with a live solar terminator and the subsolar point",
  category: "Astronomical",

  mount(container) {
    container.innerHTML = `
      <div class="clock-display-wrapper terminator-wrapper">
        <svg class="terminator-map" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-hidden="true">
          <rect width="${WIDTH}" height="${HEIGHT}" class="terminator-ocean"/>
          <path id="terminator-shadow" d="" class="terminator-shadow"/>
          <path d="${LAND_PATH}" class="terminator-land"/>
          <path id="terminator-line" d="" class="terminator-line"/>
          <circle id="terminator-sun" cx="0" cy="0" r="9" class="terminator-sunpoint"/>
        </svg>
        <div class="terminator-readout">
          <div class="terminator-clock" id="terminator-clock"></div>
          <p class="terminator-note" id="terminator-note"></p>
        </div>
      </div>
    `;

    const shadowPath = container.querySelector("#terminator-shadow");
    const terminatorLine = container.querySelector("#terminator-line");
    const sunPoint = container.querySelector("#terminator-sun");
    const clockEl = container.querySelector("#terminator-clock");
    const noteEl = container.querySelector("#terminator-note");

    let location = null;
    let disposed = false;

    // Geolocation is optional and never blocks. The map is drawn from the
    // subsolar point alone, so it is fully useful before this resolves; the
    // location only adds the "your sun" note.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (disposed) return;
          location = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        },
        () => { location = null; },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 1800000 }
      );
    }

    // Sampling the terminator is ~74 projections per tick, so only redo it when
    // the subsolar point has actually moved a visible amount.
    let lastSubsolar = null;
    const TERMINATOR_STEP_DEG = 0.25;

    return {
      update({ now, hours, minutes, seconds, ampm }) {
        clockEl.textContent = `${hours}:${minutes}:${seconds}${ampm ? " " + ampm : ""}`;

        const subsolar = subsolarLongitude(now);
        const sunPx = project(subsolar, 0);

        sunPoint.setAttribute("cx", sunPx.x.toFixed(1));
        sunPoint.setAttribute("cy", sunPx.y.toFixed(1));

        // The terminator is the great circle 90 degrees from the subsolar point.
        // Projected, it is a curve; sampling it is simpler and more robust than
        // deriving the analytic projection.
        //
        // The terminator's longitude offset is 90 / cos(lat) degrees, which
        // diverges at the poles. Capping the divisor at 6 keeps the offset at
        // most 15 degrees there, so the curve closes over the pole instead of
        // shooting off the edge of the projection.
        const offsetAt = (lat) => 90 / Math.max(6, Math.cos(lat * RAD));

        if (lastSubsolar === null || Math.abs(subsolar - lastSubsolar) > TERMINATOR_STEP_DEG) {
          lastSubsolar = subsolar;

          const samples = [];
          for (let lat = -90; lat <= 90; lat += 2) samples.push(project(subsolar + offsetAt(lat), lat));
          for (let lat = 88; lat >= -90; lat -= 2) samples.push(project(subsolar - offsetAt(lat), lat));

          const toPath = (list) =>
            list.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

          // The night side, closed along the map edges.
          shadowPath.setAttribute("d", `${toPath(samples)} Z`);

          // The terminator itself as a visible stroke, so the boundary reads
          // clearly over the ocean as well as over land.
          terminatorLine.setAttribute("d", toPath(samples));
        }

        if (location) {
          const altitude = sunAltitude(now, location.lat, location.lon);
          noteEl.textContent =
            `${altitude >= 0
              ? `Your sun is ${altitude.toFixed(0)}° above the horizon`
              : "The sun is below your horizon"}. ` +
            "Terminator and coastline are approximate.";
        } else {
          noteEl.textContent =
            "Subsolar point shown globally; location not used. " +
            "Terminator and coastline are approximate.";
        }
      },
      unmount() {
        disposed = true;
        shadowPath.setAttribute("d", "");
        terminatorLine.setAttribute("d", "");
        location = null;
      }
    };
  }
};
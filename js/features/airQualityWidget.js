/* StandBy Mode Pro - Air Quality Widget
 *
 * FEATURE_PLAN.md C9. DAKboard sells an Air Quality block; this pairs with the
 * existing weather widget, which already resolves a location.
 *
 * Uses the Open-Meteo air-quality API: keyless, no account, and the same host
 * family as the existing weather call, so the whole app's outbound traffic is
 * one domain. That matters for a project with a zero-tracking policy - every
 * distinct host is another party receiving the user's IP.
 *
 * All requests go through js/core/netPolicy.js (FEATURE_PLAN H4), which supplies
 * the timeout, in-flight dedupe and stale-while-error behaviour AUDIT.md M2
 * recorded as missing.
 */

import { store } from "../state/store.js";
import { fetchJson } from "../core/netPolicy.js";
import { escapeHtml } from "../core/escape.js";
import { bandFor, airQualityUrl, formatParticulate } from "../core/airQuality.js";

/** bandFor and airQualityUrl live in core/ so they can be unit-tested without
 *  this file's store and network dependencies. */

export const airQualityWidget = {
  name: "Air Quality",
  icon: "wind",
  category: "Utility",
  requiresNetwork: true,

  mount(container) {
    let disposed = false;
    let unwatch = null;
    let controller = null;

    const render = (data, error) => {
      if (disposed) return;

      if (!data) {
        container.innerHTML = `
          <div class="aqi-container">
            <div class="aqi-header">Air Quality</div>
            <div class="aqi-state aqi-state--loading" id="aqi-state">Checking air quality…</div>
          </div>`;
        return;
      }

      const current = data.current || {};
      const aqi = Number.isFinite(current.european_aqi) ? current.european_aqi : null;
      const band = bandFor(aqi);

      container.innerHTML = `
        <div class="aqi-container">
          <div class="aqi-header">Air Quality</div>
          <div class="aqi-main">
            <span class="aqi-value aqi-tone--${band.tone}" id="aqi-value">${
              aqi === null ? "—" : Math.round(aqi)
            }</span>
            <span class="aqi-band aqi-tone--${band.tone}">${escapeHtml(band.label)}</span>
          </div>
          <div class="aqi-parts">
            <div class="aqi-part"><span>PM2.5</span><strong>${escapeHtml(formatParticulate(current.pm2_5))}</strong></div>
            <div class="aqi-part"><span>PM10</span><strong>${escapeHtml(formatParticulate(current.pm10))}</strong></div>
          </div>
          <div class="aqi-meta">
            ${error
              ? `<span class="aqi-stale">Showing the last reading — ${escapeHtml(error.message)}</span>`
              : ""}
            ${current.time ? `<span>Updated ${escapeHtml(String(current.time).replace("T", " "))}</span>` : ""}
          </div>
        </div>`;
    };

    const load = async (lat, lon) => {
      if (controller) controller.abort();
      controller = new AbortController();

      const url = airQualityUrl(lat, lon);
      if (!url) {
        if (!disposed) {
          container.innerHTML = `
            <div class="aqi-container">
              <div class="aqi-header">Air Quality</div>
              <div class="aqi-state aqi-state--error">That location cannot be read (${escapeHtml(String(lat))}, ${escapeHtml(String(lon))}).</div>
            </div>`;
        }
        return;
      }

      // Dedupe, timeout and stale-while-error all come from the policy layer.
      const { data, error } = await fetchJson(url, { signal: controller.signal, maxAgeMs: 10 * 60_000 });
      if (disposed) return;
      render(data, error);
    };

    // Resolve a location: the store's cached one, else geolocation, else the
    // same Delhi default the weather widget uses.
    const start = () => {
      const cached = store.getState().unitLocation || {};
      if (Number.isFinite(cached.lat) && Number.isFinite(cached.lon)) {
        load(cached.lat, cached.lon);
        return;
      }

      render(null, null);

      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (disposed) return;
            store.setUnitLocation(pos.coords.latitude, pos.coords.longitude, "Your location");
            load(pos.coords.latitude, pos.coords.longitude);
          },
          () => {
            if (disposed) return;
            // Explicit fallback: labelled, not silently substituted.
            load(28.6139, 77.209);
          },
          { enableHighAccuracy: false, timeout: 7000, maximumAge: 1800000 }
        );
      } else {
        load(28.6139, 77.209);
      }
    };

    // Refresh when another widget updates the shared location, so mounting this
    // widget twice does not issue two requests for different places.
    unwatch = store.subscribe((key) => {
      if (key === "unit_location_updated" && !disposed) {
        const loc = store.getState().unitLocation || {};
        if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) load(loc.lat, loc.lon);
      }
    });

    start();

    return {
      unmount() {
        disposed = true;
        if (unwatch) unwatch();
        if (controller) controller.abort();
      }
    };
  }
};

/** Particulate formatting lives in core/airQuality.js so it can be tested. */
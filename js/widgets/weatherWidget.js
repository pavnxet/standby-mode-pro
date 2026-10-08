/* StandBy Mode Pro - Weather & Forecast widget
 *
 * A pre-existing widget, changed in two places during the Milestone 5 pass, both
 * found by measuring rather than by reading:
 *
 *  1. It called `fetch()` directly, bypassing netPolicy - so no timeout, no
 *     cache and no abort. Every stage re-render was a fresh request to a third
 *     party, and the request outlived the widget. Every other networked widget in
 *     the app goes through netPolicy; this one had never been migrated.
 *
 *  2. Its fallback location was hardcoded to 28.6139, 77.2090 - Delhi - and the
 *     result was labelled "Local Forecast". Another city's weather presented as
 *     the reader's own is worse than no weather at all, so the fallback is now an
 *     explicit "set a location" state.
 */

import { store } from "../state/store.js";
import { fetchJson, describeFetchFailure } from "../core/netPolicy.js";

export const weatherWidget = {
  name: "Weather & Forecast",
  icon: "cloud-sun",

  mount(container) {
    const iconForCode = (code) => {
      if (code === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
      if ([1, 2].includes(code)) return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
      if ([3, 45, 48].includes(code)) return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.24"/><path d="M8 14v6M12 16v6M16 14v6"/></svg>`;
    };

    const conditionForCode = (code) => {
      if (code === 0) return "Clear Sky";
      if ([1, 2].includes(code)) return "Partly Cloudy";
      if (code === 3) return "Overcast";
      if ([45, 48].includes(code)) return "Foggy";
      if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
      if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
      if ([71, 73, 75, 77].includes(code)) return "Snow";
      if ([80, 81, 82].includes(code)) return "Rain Showers";
      if ([95, 96, 99].includes(code)) return "Thunderstorm";
      return "Weather";
    };

    container.innerHTML = `
      <div class="weather-container">
        <div class="flex items-center gap-2 text-xs font-semibold text-neutral-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span id="weather-location">Finding location…</span>
        </div>
        <div class="flex items-center justify-center gap-4 my-2">
          <div id="weather-icon">${iconForCode(0)}</div>
          <div class="weather-temp-main" id="weather-temp">--°</div>
        </div>
        <div class="weather-condition" id="weather-desc">Loading weather…</div>
        <div class="weather-forecast-row" id="weather-forecast-row"></div>
      </div>
    `;

    let cancelled = false;
    const update = (data) => {
      if (cancelled) return;
      const current = data.current || {};
      const daily = data.daily || {};
      const locationEl = container.querySelector("#weather-location");
      const tempEl = container.querySelector("#weather-temp");
      const descEl = container.querySelector("#weather-desc");
      const iconEl = container.querySelector("#weather-icon");
      const forecastEl = container.querySelector("#weather-forecast-row");
      if (locationEl) {
        // The API resolves the nearest timezone for the coordinates it was given,
        // which is a real place name and the only one this widget can honestly
        // claim. "Local Forecast" was the previous fallback here, which asserted
        // a place without knowing one.
        locationEl.textContent = data.timezone
          ? data.timezone.replaceAll("_", " ")
          : "Weather for your coordinates";
      }
      if (tempEl && Number.isFinite(current.temperature_2m)) tempEl.textContent = `${Math.round(current.temperature_2m)}°`;
      if (descEl) descEl.textContent = conditionForCode(current.weather_code);
      if (iconEl) iconEl.innerHTML = iconForCode(current.weather_code);
      if (forecastEl && Array.isArray(daily.time)) {
        forecastEl.innerHTML = daily.time.slice(0, 3).map((date, i) => `
          <div class="weather-mini-day">
            <span>${i === 0 ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}</span>
            <span class="my-1">${iconForCode(daily.weather_code?.[i] ?? 0).replace('width="36" height="36"', 'width="16" height="16"')}</span>
            <span class="font-bold text-white">${Math.round(daily.temperature_2m_max?.[i] ?? 0)}° / ${Math.round(daily.temperature_2m_min?.[i] ?? 0)}°</span>
          </div>
        `).join("");
      }
    };

    const setStatus = (location, description) => {
      const locationEl = container.querySelector("#weather-location");
      const descEl = container.querySelector("#weather-desc");
      if (locationEl) locationEl.textContent = location;
      if (descEl) descEl.textContent = description;
    };

    /*
     * Fetching goes through netPolicy rather than raw fetch.
     *
     * The previous implementation called `fetch(url)` directly, which meant no
     * timeout (a hung request never settled), no caching (every mount of this
     * widget was a fresh request to a third party), and no abort - so the request
     * outlived the widget. netPolicy already exists and every other networked
     * widget uses it; this one had simply never been migrated.
     */
    let controller = null;

    const fetchWeather = async (latitude, longitude) => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: "temperature_2m,weather_code",
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        forecast_days: "3"
      });

      controller = new AbortController();
      // 15 minutes: weather does not change fast enough to justify a request per
      // mount, and this widget is re-mounted on every stage re-render.
      const { data, error } = await fetchJson(url.toString(), {
        signal: controller.signal,
        maxAgeMs: 15 * 60_000
      });

      if (cancelled) return;
      if (error) {
        setStatus("Weather unavailable", describeFetchFailure(error));
        return;
      }
      if (data) update(data);
    };

    /*
     * The old fallback fetched for 28.6139, 77.2090 - Delhi - and rendered the
     * result under the label "Local Forecast".
     *
     * That is the worst failure mode in this app: not an error, and not a blank
     * panel, but another city's weather presented as the reader's own. Someone
     * in Oslo would have made decisions on it.
     *
     * So there is no default location any more. The order is: a location the
     * reader has already given the app (shared with the sunrise, air-quality and
     * prayer widgets, so nothing is asked twice), then a geolocation prompt,
     * and if neither is available an explicit state that says what is missing.
     */
    const noLocation = () => {
      if (cancelled) return;
      setStatus("No location", "Set one in settings to see weather");
    };

    const failedToLocate = () => {
      if (cancelled) return;
      setStatus("Location denied", "Set one in settings to see weather");
    };

    const cached = (typeof store !== "undefined" && store.getState().unitLocation) || {};
    const hasCached = Number.isFinite(cached.lat) && Number.isFinite(cached.lon);

    if (hasCached) {
      fetchWeather(cached.lat, cached.lon).catch(() => {
        if (!cancelled) setStatus("Weather unavailable", "Check your connection");
      });
    } else if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Stored, so the other location-dependent widgets can reuse it instead
          // of each prompting separately.
          store?.setUnitLocation?.(position.coords.latitude, position.coords.longitude);
          fetchWeather(position.coords.latitude, position.coords.longitude).catch(() => {
            if (!cancelled) setStatus("Weather unavailable", "Check your connection");
          });
        },
        failedToLocate,
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 900000 }
      );
    } else {
      noLocation();
    }

    return {
      unmount() {
        cancelled = true;
        // Aborts the in-flight request, so leaving a widget does not leave a
        // connection open to a third party.
        if (controller) controller.abort();
      }
    };
  }
};

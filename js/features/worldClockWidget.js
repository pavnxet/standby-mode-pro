/* StandBy Mode Pro - World Clock Widget (C1)
 *
 * FEATURE_PLAN C1, which the milestone audit found was planned, listed as a
 * dependency of C20, and never actually built. C20 is a *converter* - pick a
 * city, read its time - which is a different thing from showing several cities
 * at once, so C20 landing did not deliver C1.
 *
 * Plan: "Inspiration: C5 world clock + per-city weather. Value: top-10
 * requested feature class. Files: js/features/worldClockWidget.js (new).
 * Deps: A14, H4. Risk: LOW. Intl.DateTimeFormat({timeZone}) only - no tz
 * library."
 *
 * The split that makes this safe to ship:
 *
 *   OFFLINE (default, zero external calls). Every row shows the city's local
 *     time, its UTC offset, and a day/night marker derived from the hour in that
 *     city's own zone. That last one is arithmetic on the timezone, not a guess:
 *     23:00 in Tokyo is night, whatever the weather is doing. No network, no
 *     location permission, no stale data, nothing to fail.
 *
 *   WEATHER (opt-in). One bulk Open-Meteo request for every selected city in a
 *     single call, not one per city - nine cities must not be nine requests.
 *     Off by default, which keeps the default posture of this app: nothing
 *     leaves the device unless the reader asks for it.
 *
 * Day/night is deliberately NOT derived from a solar calculation. Doing that
 * properly needs a location and an ephemeris, and a plausible-looking arc for
 * the wrong hemisphere is worse than a marker that only claims what it knows.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";
import { fetchJson, describeFetchFailure } from "../core/netPolicy.js";
import { formatInZone, offsetLabel, isValidZone, localZone } from "../core/timezones.js";

/**
 * The city catalogue.
 *
 * Coordinates are bundled rather than geocoded. Open-Meteo has a geocoding
 * endpoint, but using it would mean a second external service purely to turn a
 * city name into two numbers, and a lookup that fails leaves the row blank.
 * Twelve fixed cities cover every timezone band and cost nothing.
 *
 * `night` boundaries are the conventional civil approximation used by clocks
 * worldwide (sunrise ~06:00, sunset ~18:00), NOT an ephemeris. They shift by up
 * to an hour with season and latitude, and the widget says so - see the legend.
 */
export const WORLD_CITIES = [
  { id: "local",   label: "Here",      tz: null,               lat: null,   lon: null,   country: "" },
  { id: "auckland", label: "Auckland",  tz: "Pacific/Auckland",  lat: -36.85, lon: 174.76, country: "NZ" },
  { id: "sydney",  label: "Sydney",    tz: "Australia/Sydney",  lat: -33.87, lon: 151.21, country: "AU" },
  { id: "tokyo",   label: "Tokyo",     tz: "Asia/Tokyo",        lat: 35.68,  lon: 139.69, country: "JP" },
  { id: "kolkata", label: "Kolkata",   tz: "Asia/Kolkata",      lat: 22.57,  lon: 88.36,  country: "IN" },
  { id: "dubai",   label: "Dubai",     tz: "Asia/Dubai",        lat: 25.20,  lon: 55.27,  country: "AE" },
  { id: "moscow",  label: "Moscow",    tz: "Europe/Moscow",     lat: 55.76,  lon: 37.62,  country: "RU" },
  { id: "london",  label: "London",    tz: "Europe/London",     lat: 51.51,  lon: -0.13,  country: "GB" },
  { id: "paris",   label: "Paris",     tz: "Europe/Paris",      lat: 48.86,  lon: 2.35,   country: "FR" },
  { id: "cairo",   label: "Cairo",     tz: "Africa/Cairo",      lat: 30.04,  lon: 31.24,  country: "EG" },
  { id: "nyc",     label: "New York",  tz: "America/New_York",  lat: 40.71,  lon: -74.01, country: "US" },
  { id: "chicago", label: "Chicago",   tz: "America/Chicago",   lat: 41.88,  lon: -87.63, country: "US" },
  { id: "mexico",  label: "Mexico City", tz: "America/Mexico_City", lat: 19.43, lon: -99.13, country: "MX" },
  { id: "saopaulo", label: "São Paulo", tz: "America/Sao_Paulo", lat: -23.55, lon: -46.63, country: "BR" },
  { id: "lima",    label: "Lima",      tz: "America/Lima",      lat: -12.05, lon: -77.04, country: "PE" },
  { id: "la",      label: "Los Angeles", tz: "America/Los_Angeles", lat: 34.05, lon: -118.24, country: "US" },
  { id: "vancouver", label: "Vancouver", tz: "America/Vancouver", lat: 49.28, lon: -123.12, country: "CA" },
  { id: "honolulu", label: "Honolulu",  tz: "Pacific/Honolulu",  lat: 21.31,  lon: -157.86, country: "US" }
];

const CITY_BY_ID = new Map(WORLD_CITIES.map((c) => [c.id, c]));

/** Shown when the reader has not chosen any cities yet. */
export const DEFAULT_SELECTION = ["local", "london", "nyc", "tokyo"];

/** Capped so a display never becomes an unreadable list. */
export const MAX_CITIES = 8;

/**
 * Resolves a city id to its record.
 *
 * `local` is special: its zone is whatever the device is in, read at call time
 * rather than stored, because the same saved space is opened in two timezones.
 *
 * @returns {object|null}
 */
export function resolveCity(id, deviceZone = localZone()) {
  const city = CITY_BY_ID.get(id);
  if (!city) return null;

  if (id === "local") {
    return { ...city, tz: deviceZone, lat: null, lon: null, resolved: isValidZone(deviceZone) };
  }
  return { ...city, resolved: isValidZone(city.tz) };
}

/**
 * The selected cities, in order, validated.
 *
 * Unknown ids are dropped rather than rendered: a saved space referencing a city
 * from a removed catalogue should show fewer rows, not a row with no time.
 */
export function selectedCities(now = new Date()) {
  const stored = store.getState().worldClockCities;
  const ids = (Array.isArray(stored) && stored.length ? stored : DEFAULT_SELECTION)
    .filter((id) => CITY_BY_ID.has(id))
    .slice(0, MAX_CITIES);

  return ids.map((id) => resolveCity(id)).filter(Boolean);
}

/**
 * Whether it is day or night in a city, from the hour in its own zone.
 *
 * Returns null when the zone is unknown. A null is rendered as an explicit
 * "unknown", never as "day" - defaulting to day would be a claim, and the whole
 * point of this widget is that it does not make claims it cannot support.
 */
export function dayOrNight(city, now = new Date()) {
  if (!city?.resolved) return null;
  const text = formatInZone(now, city.tz, { hour: "2-digit", hour12: false });
  if (!text) return null;

  const hour = Number(String(text).split(":")[0]);
  if (!Number.isFinite(hour)) return null;

  // 06:00-18:00 is the civil approximation; see the note on WORLD_CITIES.
  return hour >= 6 && hour < 18 ? "day" : "night";
}

/** The hour difference from the device, signed and rounded to the hour. */
export function hoursFromLocal(city, now = new Date()) {
  if (!city?.resolved) return null;
  const here = formatInZone(now, localZone(), { hour: "2-digit", minute: "2-digit", hour12: false });
  const there = formatInZone(now, city.tz, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (!here || !there) return null;

  const minutes = (text) => {
    const [h, m] = String(text).split(":").map(Number);
    return h * 60 + m;
  };
  const delta = minutes(there) - minutes(here);

  // Round toward zero, so 5:30 reads as "same" rather than "+0.6 hours".
  return Math.trunc(delta / 60);
}

/**
 * A relative label, in the reader's terms.
 *
 * "Same time" rather than "±0h", and "5h behind" rather than "-5" - the sign is
 * nearly always understood backwards by someone glancing at it.
 */
export function describeOffset(hours) {
  if (!Number.isFinite(hours)) return "—";
  if (hours === 0) return "same time";
  const magnitude = Math.abs(hours);
  const unit = magnitude === 1 ? "hour" : "hours";
  return hours > 0 ? `${magnitude} ${unit} ahead` : `${magnitude} ${unit} behind`;
}

/* -------------------------------------------------------------------------- */
/* Weather - opt-in, and batched                                               */
/* -------------------------------------------------------------------------- */

/**
 * One bulk forecast URL for every city that has coordinates.
 *
 * Open-Meteo accepts comma-separated coordinates and answers with an array, so
 * eight cities cost one request. Building one URL per city would be eight
 * requests to a third party on every refresh - which is precisely the pattern
 * this app's zero-tracking posture rules out.
 *
 * @returns {string|null} null when no city has coordinates
 */
export function weatherUrl(cities, now = new Date()) {
  const located = cities.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  if (!located.length) return null;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: located.map((c) => c.lat).join(","),
    longitude: located.map((c) => c.lon).join(","),
    current: "temperature_2m,weather_code",
    // Only the fields used above; the default response is ~4x larger for nothing.
    temperature_unit: store.getState().unitSystem === "imperial" ? "fahrenheit" : "celsius",
    timezone: "UTC",
    forecast_days: "1"
  });
  return url.toString();
}

/**
 * Weather codes to a short label.
 *
 * WMO codes as published by Open-Meteo. Unknown codes render as an em dash
 * rather than a guess - a wrong label on a clock is the failure mode the whole
 * project is careful about.
 */
export const WMO = {
  0: "clear", 1: "clear", 2: "part cloud", 3: "overcast",
  45: "fog", 48: "rime fog",
  51: "drizzle", 53: "drizzle", 55: "drizzle",
  56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "showers", 81: "showers", 82: "violent showers",
  85: "snow showers", 86: "snow showers",
  95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm"
};

export function describeWeatherCode(code) {
  if (!Number.isFinite(code)) return "—";
  return WMO[code] ?? "—";
}

/**
 * Parses a bulk response into a map from city id to its reading.
 *
 * `local` never appears: it has no bundled coordinates, because the device's own
 * position is not known without asking, and asking is a permission prompt for a
 * row that is already showing the local time.
 */
export function parseBulkWeather(cities, payload) {
  const out = new Map();
  const located = cities.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length !== located.length) return out;

  located.forEach((city, index) => {
    const entry = list[index];
    const current = entry?.current;
    const temperature = current?.temperature_2m;
    out.set(city.id, {
      temperature: Number.isFinite(temperature) ? Math.round(temperature) : null,
      label: describeWeatherCode(current?.weather_code)
    });
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* The widget                                                                  */
/* -------------------------------------------------------------------------- */

export const worldClockWidget = {
  name: "World Clock",
  icon: "world",
  category: "Utility",
  requiresNetwork: false,
  experimental: true,

  mount(container) {
    let disposed = false;
    let weather = new Map();
    let weatherError = "";
    let loadingWeather = false;
    let retry = null;

    const pref = () => store.getState().worldClock || {};
    const is24h = () => store.getState().clockConfig?.timeFormat !== "12h";

    const render = () => {
      if (disposed) return;
      const now = new Date();
      const cities = selectedCities(now);
      const showWeather = pref().showWeather === true;

      const rows = cities.map((city) => {
        const time = city.resolved
          ? formatInZone(now, city.tz, { hour: "2-digit", minute: "2-digit", hour12: !is24h() })
          : null;
        const offset = city.resolved ? offsetLabel(now, city.tz) : null;
        const phase = dayOrNight(city, now);
        const relative = describeOffset(hoursFromLocal(city, now));
        const reading = showWeather ? weather.get(city.id) : null;

        // Every cell degrades independently: an unknown zone must not blank the
        // row, and a missing weather reading must not blank the time.
        return `
          <li class="wc-row" data-city="${escapeHtml(city.id)}">
            <span class="wc-daynight" aria-hidden="true"
                  title="${phase === "day" ? "Daytime" : phase === "night" ? "Nighttime" : "Unknown"}">
              ${phase === "day" ? "\u25CF" : phase === "night" ? "\u25D0" : "?"}
            </span>
            <span class="wc-city">
              ${escapeHtml(city.label)}
              ${city.country ? `<span class="wc-country">${escapeHtml(city.country)}</span>` : ""}
            </span>
            <span class="wc-time${time ? "" : " wc-time--unknown"}">${
              escapeHtml(time ?? "unavailable")
            }</span>
            <span class="wc-meta">
              <span class="wc-offset">${escapeHtml(offset ?? "—")}</span>
              <span class="wc-relative">${escapeHtml(relative)}</span>
            </span>
            ${showWeather
              ? `<span class="wc-weather">${
                  loadingWeather && !reading
                    ? "…"
                    : reading
                      ? `${escapeHtml(String(reading.temperature))}° ${escapeHtml(reading.label)}`
                      : escapeHtml(weatherError ? "unavailable" : "—")
                }</span>`
              : ""}
          </li>`;
      }).join("");

      container.innerHTML = `
        <div class="wc-container">
          <div class="wc-header">
            <span>World clock</span>
            <button class="wc-add" type="button" aria-label="Choose cities">cities</button>
          </div>

          <ul class="wc-rows" role="list">${rows}</ul>

          <div class="wc-footer">
            <label class="wc-toggle">
              <input type="checkbox" data-role="weather" ${showWeather ? "checked" : ""}>
              <span>Show weather</span>
            </label>
            <span class="wc-note">Day/night uses a fixed 06:00–18:00, not your latitude.</span>
          </div>

          ${showWeather && weatherError
            ? `<p class="wc-error" role="status">${escapeHtml(weatherError)}
                 <button class="wc-retry" type="button" data-role="retry">Try again</button>
               </p>`
            : ""}

          <div class="wc-picker" ${store.getState().worldClock?.pickerOpen ? "" : "hidden"}>
            <p class="wc-picker-title">Choose up to ${MAX_CITIES} cities</p>
            <div class="wc-picker-grid">
              ${WORLD_CITIES.filter((c) => c.id !== "local").map((city) => {
                const on = cities.some((c) => c.id === city.id);
                return `
                  <button class="wc-city-btn${on ? " wc-city-btn--on" : ""}" type="button"
                          data-city-toggle="${escapeHtml(city.id)}" aria-pressed="${on}">
                    ${escapeHtml(city.label)}
                  </button>`;
              }).join("")}
            </div>
          </div>
        </div>`;

      wire();
    };

    const loadWeather = async () => {
      if (disposed || loadingWeather) return;
      const cities = selectedCities();
      const url = weatherUrl(cities);
      if (!url) {
        // Nothing to ask about. Not an error - "here" has no bundled position
        // and asking for one would be a permission prompt for a decorative cell.
        weatherError = "";
        return;
      }

      loadingWeather = true;
      render();
      try {
        // 30 minutes: weather does not change fast enough to justify more, and
        // this is the only network call the widget makes.
        const result = await fetchJson(url, { maxAgeMs: 30 * 60 * 1000 });
        if (disposed) return;
        if (result.error) {
          weatherError = describeFetchFailure(result.error);
        } else {
          weather = parseBulkWeather(cities, result.data);
          weatherError = weather.size === 0
            ? "That weather service did not answer in the expected shape."
            : "";
        }
      } catch (err) {
        if (!disposed) weatherError = "Weather could not be loaded.";
      } finally {
        loadingWeather = false;
        if (!disposed) render();
      }
    };

    const wire = () => {
      container.querySelector('[data-role="weather"]')?.addEventListener("change", (event) => {
        const on = event.target.checked;
        store.setWorldClockPrefs({ showWeather: on });
        if (on) loadWeather();
        else {
          weather = new Map();
          weatherError = "";
          render();
        }
      });

      container.querySelector('[data-role="retry"]')?.addEventListener("click", loadWeather);

      container.querySelector(".wc-add")?.addEventListener("click", () => {
        const next = !store.getState().worldClock?.pickerOpen;
        store.setWorldClockPrefs({ pickerOpen: next });
        render();
      });

      container.querySelectorAll("[data-city-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset.cityToggle;
          const current = selectedCities().map((c) => c.id);
          const at = current.indexOf(id);

          if (at === -1) {
            if (current.length >= MAX_CITIES) {
              // Said in the UI rather than silently ignored: a toggle that does
              // nothing is indistinguishable from a broken one.
              store.setWorldClockPrefs({ error: `Up to ${MAX_CITIES} cities. Remove one first.` });
              return;
            }
            current.push(id);
          } else {
            current.splice(at, 1);
          }
          store.setWorldClockCities(current);
          render();
          if (pref().showWeather) loadWeather();
        });
      });
    };

    render();

    // Weather only loads if it was already switched on. A widget must not make a
    // network request merely by being placed on the layout.
    if (pref().showWeather) loadWeather();

    return {
      unmount() {
        disposed = true;
        // An in-flight fetch cannot be cancelled here, so the flag is what stops
        // its result from rendering into a container that is gone.
        if (retry) clearTimeout(retry);
        retry = null;
      }
    };
  }
};

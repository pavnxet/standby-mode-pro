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
      if (locationEl) locationEl.textContent = data.timezone?.replaceAll("_", " ") || "Local Forecast";
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
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather request failed: ${res.status}`);
      update(await res.json());
    };

    const fallback = () => fetchWeather(28.6139, 77.2090).catch(() => {
      const locationEl = container.querySelector("#weather-location");
      const descEl = container.querySelector("#weather-desc");
      if (locationEl) locationEl.textContent = "Weather unavailable";
      if (descEl) descEl.textContent = "Check your connection";
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => fetchWeather(position.coords.latitude, position.coords.longitude).catch(fallback),
        fallback,
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 900000 }
      );
    } else {
      fallback();
    }

    return { unmount() { cancelled = true; } };
  }
};

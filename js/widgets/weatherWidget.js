export const weatherWidget = {
  name: "Weather & Forecast",
  icon: "cloud-sun",
  mount(container) {
    const sunSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
    const miniSunSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>`;
    const miniCloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
    const miniRainSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;

    container.innerHTML = `
      <div class="weather-container">
        <div class="flex items-center gap-2 text-xs font-semibold text-neutral-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span id="weather-location">Local Forecast</span>
        </div>
        <div class="flex items-center justify-center gap-4 my-2">
          <div id="weather-icon">${sunSvg}</div>
          <div class="weather-temp-main" id="weather-temp">24°</div>
        </div>
        <div class="weather-condition" id="weather-desc">Clear Sky</div>
        <div class="weather-forecast-row">
          <div class="weather-mini-day"><span>Today</span><span class="my-1">${miniSunSvg}</span><span class="font-bold text-white">26° / 18°</span></div>
          <div class="weather-mini-day"><span>Tomorrow</span><span class="my-1">${miniCloudSvg}</span><span class="font-bold text-white">25° / 17°</span></div>
          <div class="weather-mini-day"><span>Mon</span><span class="my-1">${miniRainSvg}</span><span class="font-bold text-white">22° / 16°</span></div>
        </div>
      </div>
    `;

    const fetchWeather = async () => {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,weather_code&timezone=auto");
        if (res.ok) {
          const data = await res.json();
          const tempEl = container.querySelector("#weather-temp");
          if (tempEl) tempEl.textContent = `${Math.round(data.current.temperature_2m)}°`;
        }
      } catch (e) {}
    };

    fetchWeather();
    return { unmount() {} };
  }
};

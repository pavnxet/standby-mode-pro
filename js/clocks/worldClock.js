/* World Clock Carousel
 *
 * FEATURE_PLAN.md A14. Competitor evidence: wssc's "Flip Clock: World Clock"
 * (5M+ downloads) lists per-city world clocks as a headline feature, and world
 * clocks appear repeatedly across the dashboard category.
 *
 * Uses Intl.DateTimeFormat with an explicit IANA timezone. No bundled tz data:
 * every target browser already has it, and a bundled copy would be ~100 KB.
 */

import {
  DEFAULT_CITIES,
  formatInZone,
  offsetLabel,
  localZone
} from "../core/timezones.js";

export const worldClock = {
  name: "World Clock",
  description: "Rotating carousel of major cities with live offsets",
  category: "Utility",

  mount(container) {
    let cities = DEFAULT_CITIES;
    let index = 0;
    let disposed = false;
    let intervalId = null;
    // The machine's own zone, used for the "Local" entry in the carousel.
    const homeZone = localZone();

    container.innerHTML = `
      <div class="clock-display-wrapper worldclock-wrapper">
        <div class="worldclock-card" id="worldclock-card">
          <div class="worldclock-city" id="worldclock-city">—</div>
          <div class="worldclock-time" id="worldclock-time">--:--</div>
          <div class="worldclock-offset" id="worldclock-offset"></div>
          <div class="worldclock-dots" id="worldclock-dots"></div>
        </div>
      </div>
    `;

    const cityEl = container.querySelector("#worldclock-city");
    const timeEl = container.querySelector("#worldclock-time");
    const offsetEl = container.querySelector("#worldclock-offset");
    const dotsEl = container.querySelector("#worldclock-dots");

    dotsEl.innerHTML = cities.map((c, i) =>
      `<span class="worldclock-dot" data-dot="${i}"></span>`
    ).join("");
    const dots = Array.from(dotsEl.querySelectorAll(".worldclock-dot"));

    const render = (now, forceCity = false) => {
      if (disposed) return;
      const city = cities[index];
      const zone = city.tz || homeZone;

      const formatted = zone
        ? formatInZone(now, zone, { hour: "2-digit", minute: "2-digit" })
        : null;

      // City name is from our own constant list, not user input.
      if (forceCity || cityEl.dataset.id !== city.id) {
        cityEl.textContent = city.label;
        cityEl.dataset.id = city.id;
      }

      timeEl.textContent = formatted || "—";
      offsetEl.textContent = zone ? (offsetLabel(now, zone) || "") : "";
      dots.forEach((d, i) => d.classList.toggle("worldclock-dot--on", i === index));
    };

    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        index = i;
        render(new Date(), true);
      });
    });

    // Clicking the card advances, which is discoverable without a control.
    container.querySelector("#worldclock-card").addEventListener("click", () => {
      index = (index + 1) % cities.length;
      render(new Date(), true);
    });

    intervalId = setInterval(() => {
      index = (index + 1) % cities.length;
      render(new Date(), true);
    }, 5000);

    render(new Date(), true);

    return {
      unmount() {
        disposed = true;
        if (intervalId) clearInterval(intervalId);
        container.innerHTML = "";
      }
    };
  }
};

export { DEFAULT_CITIES };
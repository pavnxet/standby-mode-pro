/* World Clock Carousel
 *
 * FEATURE_PLAN.md A14. Competitor evidence: wssc's "Flip Clock: World Clock"
 * (5M+ downloads) lists per-city world clocks as a headline feature, and world
 * clocks appear repeatedly across the dashboard category.
 *
 * Uses Intl.DateTimeFormat with an explicit IANA timezone. No bundled tz data:
 * every target browser already has it, and a bundled copy would be ~100 KB.
 */

const DEFAULT_CITIES = [
  { id: "local", label: "Local", tz: null },
  { id: "nyc", label: "New York", tz: "America/New_York" },
  { id: "london", label: "London", tz: "Europe/London" },
  { id: "dubai", label: "Dubai", tz: "Asia/Dubai" },
  { id: "india", label: "India", tz: "Asia/Kolkata" },
  { id: "tokyo", label: "Tokyo", tz: "Asia/Tokyo" },
  { id: "sydney", label: "Sydney", tz: "Australia/Sydney" },
  { id: "la", label: "Los Angeles", tz: "America/Los_Angeles" }
];

/** Formats a time in a named timezone, degrading to null if unsupported. */
export function formatInZone(date, timeZone, options = {}) {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, hour12: false, ...options }).format(date);
  } catch (e) {
    // An unknown zone must render as "unavailable", never as a wrong time.
    return null;
  }
}

/** Short UTC offset label for a zone at a given instant, e.g. "UTC+5:30". */
export function offsetLabel(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset"
    }).formatToParts(date);
    const tz = parts.find(p => p.type === "timeZoneName");
    return tz ? tz.value : null;
  } catch (e) {
    return null;
  }
}

export const worldClock = {
  name: "World Clock",
  description: "Rotating carousel of major cities with live offsets",
  category: "Utility",

  mount(container) {
    let cities = DEFAULT_CITIES;
    let index = 0;
    let disposed = false;
    let intervalId = null;
    const localZone = (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch (e) {
        return null;
      }
    })();

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
      const zone = city.tz || localZone;

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
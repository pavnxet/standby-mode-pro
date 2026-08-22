/* Day / Dementia / Senior-Friendly High Legibility Clock */
export const dayClock = {
  name: "Day & Senior Friendly",
  description: "Ultra-legible high-contrast day name, period, and large date",
  category: "Accessibility",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="day-clock-container">
          <div class="day-name" id="day-name-text">SATURDAY</div>
          <div class="day-period-pill" id="day-period-text">MORNING</div>
          <div class="day-time" id="day-time-text">09:41</div>
          <div class="day-full-date" id="day-full-date-text">August 22, 2026</div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawHours }) {
        const dayEl = container.querySelector("#day-name-text");
        if (dayEl) {
          dayEl.textContent = now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();
        }

        const periodEl = container.querySelector("#day-period-text");
        if (periodEl) {
          if (rawHours >= 5 && rawHours < 12) periodEl.textContent = "MORNING";
          else if (rawHours >= 12 && rawHours < 17) periodEl.textContent = "AFTERNOON";
          else if (rawHours >= 17 && rawHours < 21) periodEl.textContent = "EVENING";
          else periodEl.textContent = "NIGHT TIME";
        }

        const timeEl = container.querySelector("#day-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;
        }

        const dateEl = container.querySelector("#day-full-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
        }
      },
      unmount() {}
    };
  }
};

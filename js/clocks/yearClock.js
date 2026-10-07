/* Clock of the Year
 *
 * FEATURE_PLAN.md A16. Based on StandBy Mode Pro's complication that shows
 * "progress through the year". A large ring of elapsed days with the day of the
 * year as a hero number.
 */

/** Day-of-year, 1-based, using local time. */
export function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

export function daysInYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export const yearClock = {
  name: "Clock of the Year",
  description: "Day-of-year progress ring, the year read as elapsed time",
  category: "Minimal",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper yearclock-wrapper">
        <div class="yearclock-main">
          <svg class="yearclock-ring" viewBox="0 0 200 200" width="220" height="220" role="img" aria-hidden="true">
            <circle cx="100" cy="100" r="86" class="yearclock-track"/>
            <circle cx="100" cy="100" r="86" class="yearclock-progress" id="yearclock-progress"/>
          </svg>
          <div class="yearclock-centre">
            <div class="yearclock-day" id="yearclock-day">—</div>
            <div class="yearclock-of" id="yearclock-of"></div>
          </div>
        </div>
        <div class="yearclock-time" id="yearclock-time"></div>
      </div>
    `;

    const progress = container.querySelector("#yearclock-progress");
    const dayEl = container.querySelector("#yearclock-day");
    const ofEl = container.querySelector("#yearclock-of");
    const timeEl = container.querySelector("#yearclock-time");

    const CIRCUMFERENCE = 2 * Math.PI * 86;
    progress.style.strokeDasharray = String(CIRCUMFERENCE);

    let lastDayKey = null;

    return {
      update({ now, hours, minutes, seconds, ampm }) {
        const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

        if (dayKey !== lastDayKey) {
          lastDayKey = dayKey;
          const day = dayOfYear(now);
          const total = daysInYear(now.getFullYear());
          const fraction = day / total;

          dayEl.textContent = String(day);
          ofEl.textContent = `of ${total}`;
          progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction));

          const left = total - day;
          ofEl.title = `${left} day${left === 1 ? "" : "s"} remaining this year`;
        }

        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${config.showSeconds ? `:${seconds}` : ""}${ampm ? " " + ampm : ""}`;
        }
      },
      unmount() { progress.style.strokeDasharray = ""; }
    };
  }
};
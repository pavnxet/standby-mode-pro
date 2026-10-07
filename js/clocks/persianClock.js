/* Persian / Sliding Numerals Clock
 *
 * FEATURE_PLAN.md A10. A cross-locale desk face paired with the A19 numeral
 * engine. Deliberately scoped to the *time*, not a full Jalali calendar: the
 * calendar belongs to the C19 prayer widget, which is marked experimental.
 *
 * Uses Persian digits via the shared numeral engine and displays a 24-hour
 * face, which is the convention in Iran.
 */

export const persianClock = {
  name: "Persian Numerals",
  description: "Persian digits on a 24-hour face with a midnight-to-noon gradient",
  category: "Cultural",

  mount(container) {
    container.innerHTML = `
      <div class="clock-display-wrapper persian-wrapper" id="persian-stage">
        <div class="persian-time" id="persian-time">۰۰:۰۰</div>
        <div class="persian-period" id="persian-period"></div>
        <!-- Date is intentionally Latin by default; the Jalali calendar is C19. -->
        <div class="persian-date" id="persian-date"></div>
      </div>
    `;

    const timeEl = container.querySelector("#persian-time");
    const periodEl = container.querySelector("#persian-period");
    const dateEl = container.querySelector("#persian-date");
    let lastPeriod = "";

    return {
      update({ now, rawHours, rawMinutes }) {
        // Persian digits are explicit here rather than inherited from the
        // numeral engine: this face exists specifically to display them, so it
        // should not change when the user switches the global numeral system.
        timeEl.textContent = `${toPersian(pad2(rawHours))}:${toPersian(pad2(rawMinutes))}`;

        const period = periodFor(Number(rawHours));
        if (period !== lastPeriod) {
          lastPeriod = period;
          periodEl.textContent = period;
          // Night hours cool, day hours warm, mirroring the local solar cycle.
          const night = Number(rawHours) < 6 || Number(rawHours) >= 19;
          const stage = container.querySelector("#persian-stage");
          stage.classList.toggle("persian-wrapper--night", night);
        }

        dateEl.textContent = now.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long"
        });
      },
      unmount() {}
    };
  }
};

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toPersian(value) {
  return String(value).replace(/[0-9]/g, d => PERSIAN_DIGITS[Number(d)]);
}

function periodFor(hour) {
  if (hour < 6) return "بامداد";
  if (hour < 12) return "صبح";
  if (hour < 15) return "ظهر";
  if (hour < 19) return "بعد از ظهر";
  return "شب";
}
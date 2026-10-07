/* Roman Numeral Clock
 *
 * FEATURE_PLAN.md A4. StandBy Mode Pro (Android) ships Roman numeral faces.
 * Values above 3999 deliberately pass through rather than rendering an
 * unreadable wall of "M"s.
 */

import { toRoman } from "./_shared/numeralMap.js";

export const romanClock = {
  name: "Roman Numeral",
  description: "Split-flap style Roman numerals with a classic serif face",
  category: "Classic",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper roman-clock-wrapper">
        <div class="roman-clock" id="roman-clock-main">
          <span class="roman-part" id="roman-hour"></span>
          <span class="roman-divider">:</span>
          <span class="roman-part" id="roman-minute"></span>
          ${config.showSeconds ? `<span class="roman-seconds" id="roman-second"></span>` : ""}
        </div>
        ${!config.is24Hour ? `<div class="roman-ampm" id="roman-ampm"></div>` : ""}
        ${config.showDate ? `<div class="roman-date" id="roman-date"></div>` : ""}
      </div>
    `;

    const hourEl = container.querySelector("#roman-hour");
    const minuteEl = container.querySelector("#roman-minute");
    const secondEl = container.querySelector("#roman-second");
    const ampmEl = container.querySelector("#roman-ampm");
    const dateEl = container.querySelector("#roman-date");
    const last = { hour: "", minute: "", second: "" };

    return {
      // raw* fields, not the formatted ones: `hours` arrives already run through
      // the numeral engine, so Number("१४") is NaN and toRoman would fall back
      // to printing the localised digits instead of converting them.
      update({ rawHours, rawMinutes, rawSeconds, ampm, is24, now }) {
        // Match the engine's 12/24 decision so the numeral says "IX" at 21:00
        // in 12-hour mode and "IX" again at 09:00, rather than "XXI".
        const hour24 = Number(rawHours) % 24;
        const displayHour = is24 ? hour24 : hour24 % 12 || 12;

        const h = toRoman(displayHour);
        if (h !== last.hour) {
          last.hour = h;
          hourEl.textContent = h;
        }

        const m = toRoman(Number(rawMinutes));
        if (m !== last.minute) {
          last.minute = m;
          minuteEl.textContent = m;
        }

        if (secondEl) {
          const s = String(Number(rawSeconds)).padStart(2, "0");
          if (s !== last.second) {
            last.second = s;
            secondEl.textContent = s;
          }
        }

        if (ampmEl) ampmEl.textContent = ampm;
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
          });
        }
      },
      unmount() {}
    };
  }
};
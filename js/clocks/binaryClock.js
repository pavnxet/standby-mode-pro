/* Binary Clock — LED-style bit matrix
 *
 * FEATURE_PLAN.md A3. No verified competitor ships a binary clock, which makes it
 * the cheapest genuinely distinctive face in the set.
 *
 * Each digit is rendered as 4 LEDs (8, 4, 2, 1) rather than a text character, so
 * the display stays legible at a distance and reads as hardware rather than text.
 */

const ROWS = [8, 4, 2, 1];

/** Turns a raw 0-23 / 0-59 hour or minute into its two decimal digits. */
function twoDigits(value) {
  const n = Math.abs(Math.trunc(Number(value) || 0));
  return [Math.floor(n / 10) % 10, n % 10];
}

export const binaryClock = {
  name: "Binary Clock",
  description: "Time as a binary LED matrix, 8-4-2-1 per digit",
  category: "Digital",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper binary-clock-wrapper">
        <div class="binary-clock" id="binary-clock-main">
          <div class="binary-group" data-group="hours"></div>
          <div class="binary-sep" data-sep="hours" aria-hidden="true"></div>
          <div class="binary-group" data-group="minutes"></div>
          ${config.showSeconds ? `
            <div class="binary-sep" data-sep="minutes" aria-hidden="true"></div>
            <div class="binary-group" data-group="seconds"></div>
          ` : ""}
        </div>
        ${!config.is24Hour ? `<div class="binary-ampm" id="binary-ampm"></div>` : ""}
        ${config.showDate ? `<div class="binary-date" id="binary-date"></div>` : ""}
      </div>
    `;

    const groups = {
      hours: container.querySelector('[data-group="hours"]'),
      minutes: container.querySelector('[data-group="minutes"]'),
      seconds: container.querySelector('[data-group="seconds"]')
    };
    const seps = Array.from(container.querySelectorAll(".binary-sep"));
    const ampmEl = container.querySelector("#binary-ampm");
    const dateEl = container.querySelector("#binary-date");

    // Build the LED grid once; only classes change afterwards, so a clock tick
    // costs no DOM allocation.
    for (const key of Object.keys(groups)) {
      const host = groups[key];
      if (!host) continue;
      host.innerHTML = Array.from({ length: 2 }, (_, digitIndex) => `
        <div class="binary-digit" data-group="${key}" data-digit="${digitIndex}">
          ${ROWS.map(bit => `<span class="binary-led" data-bit="${bit}"></span>`).join("")}
        </div>
      `).join("");
    }

    const ledCache = new Map();
    for (const key of Object.keys(groups)) {
      const host = groups[key];
      if (!host) continue;
      host.querySelectorAll(".binary-led").forEach(led => {
        const id = `${key}:${led.parentElement.dataset.digit}:${led.dataset.bit}`;
        ledCache.set(id, led);
      });
    }

    return {
      // raw* rather than the formatted fields: `hours` and friends arrive
      // already run through the numeral engine, so under Devanagari or Persian
      // digits Number() would be NaN and every LED would read as zero.
      update({ rawHours, rawMinutes, rawSeconds, ampm, now }) {
        const values = {
          hours: Number(rawHours) % 24,
          minutes: Number(rawMinutes),
          seconds: Number(rawSeconds)
        };

        for (const [key, value] of Object.entries(values)) {
          twoDigits(value).forEach((digit, digitIndex) => {
            for (const bit of ROWS) {
              const led = ledCache.get(`${key}:${digitIndex}:${bit}`);
              if (led) led.classList.toggle("binary-led--on", (digit & bit) !== 0);
            }
          });
        }

        // Colon blink driven by the same clock the LEDs read, not a fresh Date,
        // so the two can never disagree by a fraction of a second.
        seps.forEach(sep => sep.classList.toggle("binary-sep--on", values.seconds % 2 === 0));

        if (ampmEl) ampmEl.textContent = ampm;
        if (dateEl) {
          dateEl.textContent = now
            .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
            .toUpperCase();
        }
      },
      unmount() { ledCache.clear(); }
    };
  }
};
/* Minimal Gradient Clock
 *
 * FEATURE_PLAN.md A8. Fills the gap between the pure-black AMOLED face and the
 * heavy Big Crop face. The gradient is derived from the current hour, so the
 * display shifts through the day without any configuration.
 */

export const gradientClock = {
  name: "Minimal Gradient",
  description: "Hour-tinted gradient wash behind hairline numerals",
  category: "Minimal",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper gradient-clock-wrapper" id="gradient-stage">
        <div class="gradient-clock-time" id="gradient-time">00:00</div>
        ${config.showSeconds ? `<div class="gradient-clock-seconds" id="gradient-seconds">00</div>` : ""}
        ${!config.is24Hour ? `<div class="gradient-clock-ampm" id="gradient-ampm"></div>` : ""}
        ${config.showDate ? `<div class="gradient-clock-date" id="gradient-date"></div>` : ""}
      </div>
    `;

    const stage = container.querySelector("#gradient-stage");
    const timeEl = container.querySelector("#gradient-time");
    const secondsEl = container.querySelector("#gradient-seconds");
    const ampmEl = container.querySelector("#gradient-ampm");
    const dateEl = container.querySelector("#gradient-date");

    let lastTint = -1;

    return {
      update({ now, hours, minutes, seconds, ampm, rawHours, rawMinutes }) {
        timeEl.textContent = `${hours}:${minutes}`;
        if (secondsEl) secondsEl.textContent = seconds;
        if (ampmEl) ampmEl.textContent = ampm;
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
          });
        }

        // Twelve tints around the day: night at the extremes, warmth at midday.
        // Raw fields, because the formatted ones are numeral-converted and
        // Number() on those is NaN outside Latin digits.
        const hour = (Number(rawHours) % 24) + Number(rawMinutes) / 60;
        const tint = Math.round(hour) % 12;

        if (tint !== lastTint) {
          lastTint = tint;
          // Hand-picked hue stops rather than a HSL sweep, which avoids the
          // muddy mid-greens an automatic sweep produces.
          const hues = [232, 240, 252, 214, 196, 168, 42, 28, 8, 268, 246, 238];
          const hue = hues[tint];
          const lightness = tint >= 5 && tint <= 7 ? 16 : 10;
          stage.style.background =
            `radial-gradient(120% 90% at 50% 15%, hsl(${hue} 55% ${lightness + 8}%) 0%, hsl(${hue} 45% 6%) 65%, #05060a 100%)`;
          stage.style.setProperty("--gradient-hue", String(hue));
        }
      },
      unmount() {
        stage.style.background = "";
      }
    };
  }
};
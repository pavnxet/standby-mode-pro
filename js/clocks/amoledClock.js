/* AMOLED Ultra-Minimal Pure Black Clock */
export const amoledClock = {
  name: "AMOLED Deep Black",
  description: "Zero-power pure black aesthetic designed for OLED bedtime display",
  category: "Minimal",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper bg-black">
        <div class="amoled-clock-container">
          <div class="amoled-time" id="amoled-time-text">00:00</div>
          ${config.showSeconds ? `<div id="amoled-sec-text" class="text-xs font-mono tracking-widest text-neutral-600">00 SEC</div>` : ""}
          ${config.showDate ? `<div id="amoled-date-text" class="text-xs font-mono tracking-widest text-neutral-600 mt-2"></div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24 }) {
        const timeEl = container.querySelector("#amoled-time-text");
        if (timeEl) timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;

        const secEl = container.querySelector("#amoled-sec-text");
        if (secEl) secEl.textContent = `${seconds} SEC`;

        const dateEl = container.querySelector("#amoled-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
        }
      },
      unmount() {}
    };
  }
};

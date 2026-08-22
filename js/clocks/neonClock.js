/* Cyberpunk Neon Glow Clock */
export const neonClock = {
  name: "Neon Cyberpunk Glow",
  description: "Vibrant glowing multi-tube neon numerals with animated color pulse",
  category: "Modern",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="neon-clock-container">
          <div class="neon-time" id="neon-time-text">00:00</div>
          ${config.showSeconds ? `<div id="neon-seconds-text" class="font-mono text-2xl font-bold tracking-widest text-cyan-400">00</div>` : ""}
          ${config.showDate ? `<div class="neon-date" id="neon-date-text"></div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24 }) {
        const timeEl = container.querySelector("#neon-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;
        }
        const secEl = container.querySelector("#neon-seconds-text");
        if (secEl) secEl.textContent = `${seconds}s`;

        const dateEl = container.querySelector("#neon-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        }
      },
      unmount() {}
    };
  }
};

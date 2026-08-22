/* Matrix Terminal Glyph Clock */
export const matrixClock = {
  name: "Matrix Digital Rain",
  description: "Phosphorescent green glyph terminal display",
  category: "Digital",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="matrix-clock-container">
          <div class="matrix-sub">SYS_TIME // SECURE_NODE</div>
          <div class="matrix-time" id="matrix-time-text">00:00:00</div>
          ${config.showDate ? `<div class="matrix-sub" id="matrix-date-text"></div>` : ""}
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24 }) {
        const timeEl = container.querySelector("#matrix-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${config.showSeconds ? ":" + seconds : ""}${!is24 ? " " + ampm : ""}`;
        }
        const dateEl = container.querySelector("#matrix-date-text");
        if (dateEl) {
          dateEl.textContent = `DATE > ${now.toISOString().split("T")[0]}`;
        }
      },
      unmount() {}
    };
  }
};

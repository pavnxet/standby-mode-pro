/* Radial Sweep Gauge Clock */
export const radialClock = {
  name: "Radial Sweep Gauge",
  description: "Dual concentric circular gauge meters for seconds and minutes",
  category: "Modern",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="radial-clock-container">
          <svg class="absolute inset-0 w-full height-full" viewBox="0 0 300 300">
            <!-- Outer Minutes Track -->
            <circle cx="150" cy="150" r="130" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8" />
            <circle id="radial-min-arc" cx="150" cy="150" r="130" fill="none" stroke="#3b82f6" stroke-width="8" stroke-dasharray="816" stroke-dashoffset="400" stroke-linecap="round" transform="rotate(-90 150 150)" />

            <!-- Inner Seconds Track -->
            <circle cx="150" cy="150" r="110" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="6" />
            <circle id="radial-sec-arc" cx="150" cy="150" r="110" fill="none" stroke="#10b981" stroke-width="6" stroke-dasharray="691" stroke-dashoffset="300" stroke-linecap="round" transform="rotate(-90 150 150)" />
          </svg>

          <div class="radial-center-content">
            <div class="radial-time" id="radial-time-text">00:00</div>
            <div class="radial-date" id="radial-date-text"></div>
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawMinutes, rawSeconds }) {
        const timeEl = container.querySelector("#radial-time-text");
        if (timeEl) timeEl.textContent = `${hours}:${minutes}`;

        const dateEl = container.querySelector("#radial-date-text");
        if (dateEl) {
          dateEl.textContent = `${now.toLocaleDateString(undefined, { weekday: "short" })}, ${now.getDate()} ${now.toLocaleDateString(undefined, { month: "short" })}`;
        }

        const minArc = container.querySelector("#radial-min-arc");
        if (minArc) {
          const minCircumference = 2 * Math.PI * 130;
          const minFraction = (rawMinutes * 60 + rawSeconds) / 3600;
          minArc.setAttribute("stroke-dashoffset", minCircumference * (1 - minFraction));
        }

        const secArc = container.querySelector("#radial-sec-arc");
        if (secArc) {
          const secCircumference = 2 * Math.PI * 110;
          const secFraction = rawSeconds / 60;
          secArc.setAttribute("stroke-dashoffset", secCircumference * (1 - secFraction));
        }
      },
      unmount() {}
    };
  }
};

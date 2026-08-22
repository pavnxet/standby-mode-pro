/* Star Trek LCARS Sci-Fi Tactical Clock */
export const lcarsClock = {
  name: "Star Trek LCARS",
  description: "Futuristic tactical interface with diagnostics telemetry",
  category: "Sci-Fi",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="lcars-clock-container">
          <div class="lcars-elbow">
            <span class="lcars-text-id">LCARS-47</span>
            <span class="text-[10px] font-bold text-black">STANDBY</span>
          </div>
          <div class="lcars-body">
            <div class="text-xs font-mono text-amber-400 tracking-wider">STARDATE <span id="lcars-stardate">84920.4</span></div>
            <div class="lcars-time" id="lcars-time-text">22:04</div>
            <div class="lcars-bar"></div>
            <div class="flex justify-between text-xs font-mono text-indigo-300">
              <span>STATUS: NOMINAL</span>
              <span id="lcars-seconds-text">SEC: 00</span>
            </div>
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds }) {
        const timeEl = container.querySelector("#lcars-time-text");
        if (timeEl) timeEl.textContent = `${hours}:${minutes}`;

        const secEl = container.querySelector("#lcars-seconds-text");
        if (secEl) secEl.textContent = `SEC: ${seconds}`;

        const stardateEl = container.querySelector("#lcars-stardate");
        if (stardateEl) {
          const stardate = (now.getFullYear() - 1900) * 1000 + (now.getMonth() * 30 + now.getDate()) * 2.7;
          stardateEl.textContent = stardate.toFixed(1);
        }
      },
      unmount() {}
    };
  }
};

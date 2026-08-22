/* Celestial Solar Astronomical Clock */
export const solarClock = {
  name: "Solar Astronomical Arc",
  description: "Tracks celestial daylight arc, solar noon and twilight positions",
  category: "Astronomical",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="solar-clock-container">
          <svg class="solar-orbit-svg" viewBox="0 0 300 300">
            <!-- Background Orbit Ring -->
            <circle cx="150" cy="150" r="120" fill="none" stroke="rgba(255, 215, 0, 0.15)" stroke-width="2" stroke-dasharray="4 4" />
            
            <!-- Horizon line -->
            <line x1="20" y1="150" x2="280" y2="150" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1.5" />
            
            <!-- Sunlight Progress Arc -->
            <circle id="solar-progress-arc" cx="150" cy="150" r="120" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="754" stroke-dashoffset="377" stroke-linecap="round" />
            
            <!-- Sun Orb Marker -->
            <circle id="solar-orb" cx="150" cy="30" r="8" fill="#ffd166" filter="drop-shadow(0 0 8px #ffb703)" />
          </svg>

          <div class="solar-time-center">
            <div class="solar-time" id="solar-time-text">12:00</div>
            <div class="solar-period" id="solar-period-text">SOLAR DAY</div>
            ${config.showDate ? `<div class="text-xs font-mono text-amber-200/60 mt-1" id="solar-date-text"></div>` : ""}
          </div>
        </div>
      </div>
    `;

    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawHours, rawMinutes }) {
        const timeEl = container.querySelector("#solar-time-text");
        if (timeEl) {
          timeEl.textContent = `${hours}:${minutes}${!is24 ? " " + ampm : ""}`;
        }

        const dateEl = container.querySelector("#solar-date-text");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        }

        // Calculate solar day progress (0 to 1 over 24h)
        const dayFraction = (rawHours * 3600 + rawMinutes * 60 + now.getSeconds()) / 86400;
        const angle = dayFraction * 2 * Math.PI - Math.PI / 2;
        const sunX = 150 + 120 * Math.cos(angle);
        const sunY = 150 + 120 * Math.sin(angle);

        const orb = container.querySelector("#solar-orb");
        if (orb) {
          orb.setAttribute("cx", sunX);
          orb.setAttribute("cy", sunY);
        }

        const arc = container.querySelector("#solar-progress-arc");
        if (arc) {
          const totalCircumference = 2 * Math.PI * 120;
          arc.setAttribute("stroke-dashoffset", totalCircumference * (1 - dayFraction));
        }

        const periodEl = container.querySelector("#solar-period-text");
        if (periodEl) {
          if (rawHours >= 6 && rawHours < 12) periodEl.textContent = "MORNING SUN";
          else if (rawHours >= 12 && rawHours < 17) periodEl.textContent = "SOLAR AFTERNOON";
          else if (rawHours >= 17 && rawHours < 20) periodEl.textContent = "GOLDEN HOUR";
          else periodEl.textContent = "NIGHT SKY";
        }
      },
      unmount() {}
    };
  }
};

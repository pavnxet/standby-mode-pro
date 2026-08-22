/* 3D Retro Mechanical Flip Clock */
import { soundEngine } from "../engines/soundEngine.js";

export const flipClock = {
  name: "Retro 3D Flip Clock",
  description: "Authentic mechanical split-flap cards with realistic physics and tick sound",
  category: "Classic",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper">
        <div class="flip-clock-container">
          <div class="flip-group" id="flip-hours-group">
            <div class="flip-unit" id="flip-h1">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
            <div class="flip-unit" id="flip-h2">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
          </div>
          <div class="flip-divider">:</div>
          <div class="flip-group" id="flip-minutes-group">
            <div class="flip-unit" id="flip-m1">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
            <div class="flip-unit" id="flip-m2">
              <div class="flip-card-top"><span>0</span></div>
              <div class="flip-card-bottom"><span>0</span></div>
            </div>
          </div>
          ${config.showSeconds ? `
            <div class="flip-divider">:</div>
            <div class="flip-group" id="flip-seconds-group">
              <div class="flip-unit" id="flip-s1" style="width: clamp(2.2rem, 7vw, 5.5rem); font-size: clamp(1.8rem, 6vw, 4.5rem);">
                <div class="flip-card-top"><span>0</span></div>
                <div class="flip-card-bottom"><span>0</span></div>
              </div>
              <div class="flip-unit" id="flip-s2" style="width: clamp(2.2rem, 7vw, 5.5rem); font-size: clamp(1.8rem, 6vw, 4.5rem);">
                <div class="flip-card-top"><span>0</span></div>
                <div class="flip-card-bottom"><span>0</span></div>
              </div>
            </div>
          ` : ""}
        </div>
        ${!config.is24Hour ? `<div id="flip-ampm" class="mt-4 font-mono font-bold text-sm tracking-widest text-neutral-400">AM</div>` : ""}
        ${config.showDate ? `<div id="flip-date-display" class="mt-3 font-sans font-semibold text-base tracking-wide text-neutral-400"></div>` : ""}
      </div>
    `;

    const lastValues = { h1: "", h2: "", m1: "", m2: "", s1: "", s2: "" };

    const updateDigit = (unitId, newVal) => {
      const unit = container.querySelector(`#${unitId}`);
      if (!unit || lastValues[unitId] === newVal) return;

      const oldVal = lastValues[unitId] || newVal;
      lastValues[unitId] = newVal;

      // Remove existing leaves
      unit.querySelectorAll(".flip-leaf").forEach(el => el.remove());

      // Create animated leaves
      const frontLeaf = document.createElement("div");
      frontLeaf.className = "flip-leaf leaf-front";
      frontLeaf.innerHTML = `<span>${oldVal}</span>`;

      const backLeaf = document.createElement("div");
      backLeaf.className = "flip-leaf leaf-back";
      backLeaf.innerHTML = `<span>${newVal}</span>`;

      unit.appendChild(frontLeaf);
      unit.appendChild(backLeaf);

      // Base top and bottom
      unit.querySelector(".flip-card-top span").textContent = newVal;
      unit.querySelector(".flip-card-bottom span").textContent = oldVal;

      // Trigger animation
      requestAnimationFrame(() => {
        unit.classList.add("flipping");
        if (config.tickSound && (unitId === "flip-s2" || unitId === "flip-m2")) {
          soundEngine.playFlipTick();
        }
      });

      setTimeout(() => {
        unit.querySelector(".flip-card-bottom span").textContent = newVal;
        unit.classList.remove("flipping");
        frontLeaf.remove();
        backLeaf.remove();
      }, 450);
    };

    return {
      update({ now, hours, minutes, seconds, ampm }) {
        updateDigit("flip-h1", hours[0]);
        updateDigit("flip-h2", hours[1]);
        updateDigit("flip-m1", minutes[0]);
        updateDigit("flip-m2", minutes[1]);

        if (config.showSeconds) {
          updateDigit("flip-s1", seconds[0]);
          updateDigit("flip-s2", seconds[1]);
        }

        const ampmEl = container.querySelector("#flip-ampm");
        if (ampmEl) ampmEl.textContent = ampm;

        const dateEl = container.querySelector("#flip-date-display");
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        }
      },
      unmount() {}
    };
  }
};

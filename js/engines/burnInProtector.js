/* OLED Burn-In Sub-Pixel Micro Shifting Protector */
import { store } from "../state/store.js";

export class BurnInProtector {
  constructor() {
    this.intervalId = null;
    this.stageEl = document.getElementById("main-stage");
    this.init();
  }

  init() {
    this.startShifting();
  }

  startShifting() {
    if (this.intervalId) clearInterval(this.intervalId);

    // Shift 1-2px every 60 seconds
    this.intervalId = setInterval(() => {
      if (!this.stageEl) return;
      const config = store.getState().burnInProtection;
      if (!config.enabled) {
        this.stageEl.style.transform = "none";
        return;
      }

      const dx = (Math.random() * 4 - 2).toFixed(1);
      const dy = (Math.random() * 4 - 2).toFixed(1);
      this.stageEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stageEl.classList.add("burn-in-shifted");
    }, 60000);
  }
}

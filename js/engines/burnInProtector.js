import { store } from "../state/store.js";

export class BurnInProtector {
  constructor() {
    this.intervalId = null;
    this.stageEl = null;
  }

  start() {
    this.stageEl = document.getElementById("main-stage");
    if (this.intervalId) clearInterval(this.intervalId);

    // Shift 1-2px every 60 seconds
    this.intervalId = setInterval(() => {
      if (!this.stageEl) this.stageEl = document.getElementById("main-stage");
      if (!this.stageEl) return;
      const config = store.getState().burnInProtection;
      if (!config || !config.enabled) {
        this.stageEl.style.transform = "none";
        return;
      }

      const dx = (Math.random() * 4 - 2).toFixed(1);
      const dy = (Math.random() * 4 - 2).toFixed(1);
      this.stageEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stageEl.classList.add("burn-in-shifted");
    }, 60000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.stageEl) this.stageEl.style.transform = "none";
  }
}

export const burnInProtector = new BurnInProtector();

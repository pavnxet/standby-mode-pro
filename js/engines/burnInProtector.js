import { store } from "../state/store.js";

export class BurnInProtector {
  constructor() {
    this.timeoutId = null;
    this.stageEl = null;
  }

  start() {
    this.stageEl = document.getElementById("main-stage");
    this.scheduleNextShift();
  }

  scheduleNextShift() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    const config = store.getState().burnInProtection || {};
    const delayMs = Math.max(1, Number(config.intervalMinutes) || 1) * 60000;
    this.timeoutId = setTimeout(() => {
      this.shift();
      this.scheduleNextShift();
    }, delayMs);
  }

  shift() {
    if (!this.stageEl) this.stageEl = document.getElementById("main-stage");
    if (!this.stageEl) return;

    const config = store.getState().burnInProtection || {};
    if (!config.enabled) {
      this.stageEl.style.transform = "none";
      this.stageEl.classList.remove("burn-in-shifted");
      return;
    }

    const dx = (Math.random() * 4 - 2).toFixed(1);
    const dy = (Math.random() * 4 - 2).toFixed(1);
    this.stageEl.style.transform = `translate(${dx}px, ${dy}px)`;
    this.stageEl.classList.add("burn-in-shifted");
  }

  stop() {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
    if (this.stageEl) {
      this.stageEl.style.transform = "none";
      this.stageEl.classList.remove("burn-in-shifted");
    }
  }
}

export const burnInProtector = new BurnInProtector();

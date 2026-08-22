/* StandBy Mode Pro - Night Mode & Screen Dimming Controller */
import { store } from "../state/store.js";
import { soundEngine } from "../engines/soundEngine.js";

export class NightModeController {
  constructor() {
    this.toggleBtn = document.getElementById("btn-night-mode");
    this.init();
  }

  init() {
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener("click", () => {
        store.toggleNightMode();
        soundEngine.playFlipTick();
      });
    }

    store.subscribe((event, payload) => {
      if (event === "night_mode_toggled") {
        this.applyNightMode(payload.enabled);
      }
    });

    this.applyNightMode(store.getState().nightMode.enabled);
  }

  applyNightMode(enabled) {
    if (enabled) {
      document.body.classList.add("night-mode");
      if (this.toggleBtn) this.toggleBtn.classList.add("active", "text-red-500");
    } else {
      document.body.classList.remove("night-mode");
      if (this.toggleBtn) this.toggleBtn.classList.remove("active", "text-red-500");
    }
  }
}

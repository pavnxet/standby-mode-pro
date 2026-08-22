/* StandBy Mode Pro - Idle Screensaver Engine */
import { store } from "../state/store.js";

export class Screensaver {
  constructor() {
    this.layer = document.getElementById("screensaver-layer");
    this.idleTimer = null;
    this.isActive = false;
    this.activityHandler = () => this.onUserActivity();
    this.storeUnsubscribe = null;
    this.init();
  }

  init() {
    this.resetTimer();
    ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(evt => {
      window.addEventListener(evt, this.activityHandler, { passive: true });
    });

    if (this.layer) this.layer.addEventListener("click", () => this.exitScreensaver());

    this.storeUnsubscribe = store.subscribe((event) => {
      if (event === "space_changed" || event === "space_updated") this.resetTimer();
    });
  }

  onUserActivity() {
    if (this.isActive) this.exitScreensaver();
    this.resetTimer();
    document.body.classList.remove("idle-dim");
  }

  resetTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const config = store.getState().screensaver || {};
    const idleSeconds = Math.max(5, Number(config.idleSeconds) || 120);
    this.idleTimer = setTimeout(() => this.triggerScreensaver(), idleSeconds * 1000);
  }

  triggerScreensaver() {
    const config = store.getState().screensaver || {};
    if (!config.enabled) return;

    this.isActive = true;
    if (this.layer) {
      this.layer.classList.add("active");
      this.renderScreensaverContent();
    }
  }

  exitScreensaver() {
    this.isActive = false;
    if (this.layer) this.layer.classList.remove("active");
    this.resetTimer();
  }

  renderScreensaverContent() {
    if (!this.layer) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    this.layer.innerHTML = `
      <div class="screensaver-float-content text-center">
        <div class="font-sans font-extralight text-7xl md:text-9xl text-white/40 tracking-tighter">${timeStr}</div>
        <div class="text-xs font-mono text-white/20 tracking-widest mt-3">TAP ANYWHERE TO WAKE</div>
      </div>
    `;
  }

  destroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.storeUnsubscribe?.();
    ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(evt => {
      window.removeEventListener(evt, this.activityHandler);
    });
  }
}

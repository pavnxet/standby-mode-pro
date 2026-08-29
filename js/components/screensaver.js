/* StandBy Mode Pro - Idle Screensaver Engine */
import { store } from "../state/store.js";

export class Screensaver {
  constructor() {
    this.layer = document.getElementById("screensaver-layer");
    this.idleTimer = null;
    this.clockInterval = null;
    this.isActive = false;
    this.activityHandler = () => this.onUserActivity();
    this.storeUnsubscribe = null;
    this.init();
  }

  init() {
    this.resetTimer();
    ["mousemove", "mousedown", "pointerdown", "click", "keydown", "touchstart", "scroll"].forEach(evt => {
      window.addEventListener(evt, this.activityHandler, { passive: true });
    });

    if (this.layer) this.layer.addEventListener("click", () => this.exitScreensaver());

    this.storeUnsubscribe = store.subscribe((event) => {
      if (event === "space_changed" || event === "space_updated" || event === "screensaver_updated") {
        this.resetTimer();
      }
      // If Pomodoro or Timer is actively running, keep idle timer reset and dismiss screensaver if open
      if (event === "pomo_updated" || event === "pomo_tick") {
        const pomo = store.getState().pomoState || {};
        if (pomo.isRunning) {
          if (this.isActive) this.exitScreensaver();
          this.resetTimer();
        }
      }
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
    if (!config.enabled) return;

    const idleSeconds = Math.max(5, Number(config.idleSeconds) || 120);
    this.idleTimer = setTimeout(() => this.triggerScreensaver(), idleSeconds * 1000);
  }

  triggerScreensaver() {
    const config = store.getState().screensaver || {};
    if (!config.enabled) return;

    // Suppress screensaver if Pomodoro focus or break timer is actively running
    const pomo = store.getState().pomoState || {};
    if (pomo.isRunning) {
      this.resetTimer();
      return;
    }

    this.isActive = true;
    if (this.layer) {
      this.layer.classList.add("active");
      this.renderScreensaverContent();
      this.startClock();
    }
  }

  exitScreensaver() {
    this.isActive = false;
    this.stopClock();
    if (this.layer) this.layer.classList.remove("active");
    this.resetTimer();
  }

  startClock() {
    this.stopClock();
    this.updateClockDisplay();
    this.clockInterval = setInterval(() => this.updateClockDisplay(), 1000);
  }

  stopClock() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  updateClockDisplay() {
    const timeEl = document.getElementById("screensaver-time-text");
    const dateEl = document.getElementById("screensaver-date-text");
    if (!timeEl) return;

    const now = new Date();
    const clockConfig = store.getState().clockConfig || {};
    const is24h = clockConfig.timeFormat === "24h";

    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    let period = "";

    if (!is24h) {
      period = hours >= 12 ? " PM" : " AM";
      hours = hours % 12 || 12;
    }

    const hoursStr = is24h ? String(hours).padStart(2, "0") : String(hours);
    timeEl.textContent = `${hoursStr}:${minutes}:${seconds}${period}`;

    if (dateEl) {
      const options = { weekday: "short", month: "short", day: "numeric" };
      dateEl.textContent = now.toLocaleDateString(undefined, options);
    }
  }

  renderScreensaverContent() {
    if (!this.layer) return;

    this.layer.innerHTML = `
      <div class="screensaver-float-content text-center">
        <div id="screensaver-time-text" class="font-sans font-extralight text-7xl md:text-9xl text-white/40 tracking-tighter">--:--:--</div>
        <div id="screensaver-date-text" class="text-xs md:text-sm font-mono text-white/30 tracking-wider mt-1 uppercase"></div>
        <div class="text-[11px] font-mono text-white/20 tracking-widest mt-4 flex items-center justify-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-ping"></span>
          TAP ANYWHERE TO WAKE
        </div>
      </div>
    `;
    this.updateClockDisplay();
  }

  destroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.stopClock();
    this.storeUnsubscribe?.();
    ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(evt => {
      window.removeEventListener(evt, this.activityHandler);
    });
  }
}

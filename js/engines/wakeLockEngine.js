import { store } from "../state/store.js";

export class WakeLockEngine {
  constructor() {
    this.wakeLock = null;
    this.isSupported = "wakeLock" in navigator;
    this.init();
  }

  init() {
    if (!this.isSupported) {
      console.warn("Screen Wake Lock API not supported in this browser.");
      return;
    }

    // Auto-acquire lock if enabled in store
    if (store.getState().keepScreenAwake) {
      this.acquire();
    }

    // Re-acquire lock if user switches back to this tab
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && store.getState().keepScreenAwake) {
        this.acquire();
      }
    });

    store.subscribe((event) => {
      if (event === "wake_lock_toggled") {
        if (store.getState().keepScreenAwake) {
          this.acquire();
        } else {
          this.release();
        }
      }
    });
  }

  async acquire() {
    if (!this.isSupported) return false;
    try {
      if (this.wakeLock !== null && !this.wakeLock.released) return true;
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => {
        this.wakeLock = null;
      });
      return true;
    } catch (err) {
      console.warn("WakeLock request failed:", err);
      return false;
    }
  }

  async release() {
    if (this.wakeLock !== null) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {}
    }
  }

  isActive() {
    return this.wakeLock !== null && !this.wakeLock.released;
  }
}

export const wakeLockEngine = new WakeLockEngine();

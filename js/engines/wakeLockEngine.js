import { store } from "../state/store.js";

export class WakeLockEngine {
  constructor() {
    this.wakeLock = null;
    this.isSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;
    this.userGestureHandler = () => {
      if (store.getState().keepScreenAwake) this.acquire();
    };
    this.init();
  }

  init() {
    if (!this.isSupported) {
      console.warn("Screen Wake Lock API not supported in this browser.");
      return;
    }

    if (store.getState().keepScreenAwake) this.acquire();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && store.getState().keepScreenAwake) this.acquire();
    });

    window.addEventListener("pointerdown", this.userGestureHandler, { passive: true, once: false });
    window.addEventListener("keydown", this.userGestureHandler, { passive: true, once: false });

    store.subscribe((event) => {
      if (event === "wake_lock_toggled") {
        if (store.getState().keepScreenAwake) this.acquire();
        else this.release();
      }
    });
  }

  async acquire() {
    if (!this.isSupported || document.visibilityState !== "visible") return false;
    try {
      if (this.wakeLock && !this.wakeLock.released) return true;
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => { this.wakeLock = null; });
      return true;
    } catch (err) {
      console.warn("WakeLock request failed:", err);
      return false;
    }
  }

  async release() {
    if (!this.wakeLock) return;
    try { await this.wakeLock.release(); }
    catch (err) { console.warn("WakeLock release failed:", err); }
    finally { this.wakeLock = null; }
  }

  isActive() { return Boolean(this.wakeLock && !this.wakeLock.released); }
  isWakeLockActive() { return this.isActive(); }
}

export const wakeLockEngine = new WakeLockEngine();

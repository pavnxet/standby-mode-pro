/* StandBy Mode Pro - Modular Clock Engine Registry */
import { scheduler } from "../core/scheduler.js";
import { formatDigits } from "../clocks/_shared/numeralMap.js";

class ClockEngine {
  constructor() {
    this.registry = new Map();
    this.instances = new Map();
  }

  register(id, clockDefinition) {
    this.registry.set(id, clockDefinition);
  }

  getClockList() {
    return Array.from(this.registry.entries()).map(([id, clock]) => ({
      id,
      name: clock.name,
      description: clock.description,
      category: clock.category || "Modern"
    }));
  }

  mount(clockId, containerElement, config, slotId = "default") {
    this.unmount(slotId);
    if (!containerElement) return;

    const clock = this.registry.get(clockId) || this.registry.get("flip");
    if (!clock) return;

    containerElement.innerHTML = "";
    const instance = clock.mount(containerElement, config || {});
    const entry = {
      instance,
      container: containerElement,
      clockId,
      config: config || {},
      unsubscribe: null
    };

    this.instances.set(slotId, entry);

    // Paint once immediately, then subscribe to the shared scheduler.
    this.tick(slotId);

    // AUDIT.md P1: this used to be setInterval(..., 250) per slot - four
    // wakeups per second, forever, even when seconds were hidden and even when
    // the tab was in the background. onSecondBoundary fires at most once per
    // wall-clock second and the scheduler pauses entirely when document.hidden.
    entry.unsubscribe = scheduler.subscribe(`clock:${slotId}`, () => this.tick(slotId));
  }

  tick(slotId = "default") {
    const entry = this.instances.get(slotId);
    if (!entry || !entry.instance) return;

    const config = entry.config || {};

    // Skip the whole update when this clock does not display seconds: there is
    // nothing on screen that can have changed since the last second boundary.
    if (config.showSeconds === false) {
      scheduler.onSecondBoundary(() => this._push(entry));
    } else {
      this._push(entry);
    }
  }

  _push(entry) {
    const now = new Date();
    const is24 = entry.config ? entry.config.is24Hour : false;
    const numerals = (entry.config && entry.config.numeralSystem) || undefined;

    let hours = now.getHours();
    let ampm = "";
    if (!is24) {
      ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
    }

    // A19: numerals are applied here, before any clock sees the payload, so all
    // 11 existing faces gain numeral support without modification.
    const h = formatDigits(String(hours).padStart(2, "0"), numerals);
    const m = formatDigits(String(now.getMinutes()).padStart(2, "0"), numerals);
    const s = formatDigits(String(now.getSeconds()).padStart(2, "0"), numerals);

    try {
      entry.instance.update({
        now,
        hours: h,
        minutes: m,
        seconds: s,
        ampm,
        is24,
        rawHours: now.getHours(),
        rawMinutes: now.getMinutes(),
        rawSeconds: now.getSeconds()
      });
    } catch (err) {
      console.error(`Clock "${entry.clockId}" update failed:`, err);
    }
  }

  unmount(slotId = "default") {
    const entry = this.instances.get(slotId);
    if (!entry) return;

    // Critical: the previous implementation stored a raw interval id here.
    // Clearing it required tracking one timer per slot; the scheduler instead
    // returns an unsubscribe function, so re-mounting can never leave an
    // orphaned subscription behind.
    if (entry.unsubscribe) entry.unsubscribe();
    if (entry.instance && entry.instance.unmount) entry.instance.unmount();
    if (entry.container) entry.container.innerHTML = "";
    this.instances.delete(slotId);
  }

  unmountAll() {
    Array.from(this.instances.keys()).forEach(slotId => this.unmount(slotId));
  }
}

export const clockEngine = new ClockEngine();

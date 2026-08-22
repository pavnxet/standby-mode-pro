/* StandBy Mode Pro - Modular Clock Engine Registry */

class ClockEngine {
  constructor() {
    this.registry = new Map();
    this.activeInstance = null;
    this.activeClockId = null;
    this.container = null;
    this.timerId = null;
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

  mount(clockId, containerElement, config) {
    this.unmount();
    this.container = containerElement;
    this.activeClockId = clockId;

    const clock = this.registry.get(clockId) || this.registry.get("flip");
    if (!clock) return;

    this.container.innerHTML = "";
    this.activeInstance = clock.mount(this.container, config);

    // Immediate first tick
    this.tick(config);

    // High accuracy tick interval (every 250ms for snappy seconds)
    this.timerId = setInterval(() => this.tick(config), 250);
  }

  tick(config) {
    if (!this.activeInstance) return;
    const now = new Date();
    const is24 = config ? config.is24Hour : false;

    let hours = now.getHours();
    let ampm = "";
    if (!is24) {
      ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
    }
    const hoursStr = String(hours).padStart(2, "0");
    const minutesStr = String(now.getMinutes()).padStart(2, "0");
    const secondsStr = String(now.getSeconds()).padStart(2, "0");

    this.activeInstance.update({
      now,
      hours: hoursStr,
      minutes: minutesStr,
      seconds: secondsStr,
      ampm,
      is24,
      rawHours: now.getHours(),
      rawMinutes: now.getMinutes(),
      rawSeconds: now.getSeconds()
    });
  }

  unmount() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.activeInstance && this.activeInstance.unmount) {
      this.activeInstance.unmount();
    }
    this.activeInstance = null;
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}

export const clockEngine = new ClockEngine();

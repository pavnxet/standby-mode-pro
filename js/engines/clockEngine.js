/* StandBy Mode Pro - Modular Clock Engine Registry */

class ClockEngine {
  constructor() {
    this.registry = new Map();
    this.instances = new Map(); // slotId -> { instance, container, clockId, config, timerId }
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
      timerId: null
    };

    this.instances.set(slotId, entry);
    this.tick(slotId);
    entry.timerId = setInterval(() => this.tick(slotId), 250);
  }

  tick(slotId = "default") {
    const entry = this.instances.get(slotId);
    if (!entry || !entry.instance) return;

    const now = new Date();
    const is24 = entry.config ? entry.config.is24Hour : false;

    let hours = now.getHours();
    let ampm = "";
    if (!is24) {
      ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
    }

    entry.instance.update({
      now,
      hours: String(hours).padStart(2, "0"),
      minutes: String(now.getMinutes()).padStart(2, "0"),
      seconds: String(now.getSeconds()).padStart(2, "0"),
      ampm,
      is24,
      rawHours: now.getHours(),
      rawMinutes: now.getMinutes(),
      rawSeconds: now.getSeconds()
    });
  }

  unmount(slotId = "default") {
    const entry = this.instances.get(slotId);
    if (!entry) return;

    if (entry.timerId) clearInterval(entry.timerId);
    if (entry.instance && entry.instance.unmount) entry.instance.unmount();
    if (entry.container) entry.container.innerHTML = "";
    this.instances.delete(slotId);
  }

  unmountAll() {
    Array.from(this.instances.keys()).forEach(slotId => this.unmount(slotId));
  }
}

export const clockEngine = new ClockEngine();

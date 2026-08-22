/* StandBy Mode Pro - Modular Widget Engine Registry */

class WidgetEngine {
  constructor() {
    this.registry = new Map();
    this.activeInstances = new Map(); // key: slotId -> instance
  }

  register(id, widgetDefinition) {
    this.registry.set(id, widgetDefinition);
  }

  getWidgetList() {
    return Array.from(this.registry.entries()).map(([id, widget]) => ({
      id,
      name: widget.name,
      icon: widget.icon || "box"
    }));
  }

  mount(widgetId, containerElement, slotId = "default", options = {}) {
    this.unmount(slotId);

    const widget = this.registry.get(widgetId) || this.registry.get("weather");
    if (!widget) return;

    containerElement.innerHTML = "";
    const instance = widget.mount(containerElement, options);
    this.activeInstances.set(slotId, { instance, container: containerElement, widgetId });
  }

  unmount(slotId) {
    const existing = this.activeInstances.get(slotId);
    if (existing) {
      if (existing.instance && existing.instance.unmount) {
        existing.instance.unmount();
      }
      if (existing.container) {
        existing.container.innerHTML = "";
      }
      this.activeInstances.delete(slotId);
    }
  }

  unmountAll() {
    Array.from(this.activeInstances.keys()).forEach(slotId => this.unmount(slotId));
  }
}

export const widgetEngine = new WidgetEngine();

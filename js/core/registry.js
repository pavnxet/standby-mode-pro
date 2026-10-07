/* StandBy Mode Pro - Central Feature Registry
 *
 * A thin, dependency-free index over every clock, widget, and feature module.
 *
 * Two goals:
 *  1. Give app.js a single, declarative view of what exists, so adding a clock
 *     or widget never requires editing several files in several places.
 *  2. Keep every legacy module working exactly as before. `register()` accepts
 *     either an eager definition object (the legacy contract) or a lazy
 *     descriptor of the form `{ load: () => dynamicImport(path) }`, where
 *     `dynamicImport` is the built-in dynamic import of the given relative path.
 *
 * Registry code is separate from the consuming engines on purpose: clockEngine
 * and widgetEngine keep their existing public API (audited in AUDIT.md §2.3/§2.5)
 * so nothing that already works has to change.
 */

/** @typedef {{ id: string, load: () => Promise<any> }} LazyDescriptor */

/**
 * @param {string} id
 * @param {any|LazyDescriptor} definition - A definition object, or `{ load }`.
 */
function registerInto(map, id, definition) {
  if (!id || typeof id !== "string") {
    throw new TypeError("Registry id must be a non-empty string");
  }
  if (!definition || typeof definition !== "object") {
    throw new TypeError(`Registry definition for "${id}" must be an object`);
  }
  if (map.has(id)) {
    throw new Error(`Duplicate registry id: "${id}". Ids must be unique.`);
  }
  map.set(id, definition);
}

class FeatureRegistry {
  constructor() {
    /** @type {Map<string, any>} */
    this.clocks = new Map();
    /** @type {Map<string, any>} */
    this.widgets = new Map();
    /** @type {Map<string, LazyDescriptor>} */
    this.features = new Map();
    /** Resolved module cache for lazy features. */
    this._featureCache = new Map();
    /** Resolved module cache for lazy clocks/widgets. */
    this._definitionCache = new Map();
  }

  // ---------------------------------------------------------------- registry

  registerClock(id, definition) {
    registerInto(this.clocks, id, definition);
  }

  registerWidget(id, definition) {
    registerInto(this.widgets, id, definition);
  }

  registerFeature(id, descriptor) {
    if (!descriptor || typeof descriptor.load !== "function") {
      throw new TypeError(`Feature "${id}" must be a descriptor with a load() function`);
    }
    registerInto(this.features, id, descriptor);
  }

  // --------------------------------------------------------------- inventory

  /** Synchronous inventory. Only describes modules that are already registered. */
  getInventory() {
    const describe = (definition, id) => ({
      id,
      name: definition.name || id,
      description: definition.description || "",
      category: definition.category || "Modern",
      lazy: typeof definition.load === "function"
    });

    return {
      clocks: Array.from(this.clocks.entries()).map(([id, d]) => describe(d, id)),
      widgets: Array.from(this.widgets.entries()).map(([id, d]) => ({
        id,
        name: d.name || id,
        icon: d.icon || "box",
        description: d.description || "",
        category: d.category || "General",
        size: d.size || "medium",
        requiresNetwork: d.requiresNetwork === true,
        experimental: d.experimental === true,
        lazy: typeof d.load === "function"
      })),
      features: Array.from(this.features.keys())
    };
  }

  /** Used by CI to assert every id is unique and every declared module exists. */
  getAllIds() {
    return {
      clocks: Array.from(this.clocks.keys()),
      widgets: Array.from(this.widgets.keys()),
      features: Array.from(this.features.keys())
    };
  }

  // ------------------------------------------------------------- resolution

  /**
   * Resolves a clock definition, dynamically importing it if it was registered
   * lazily. Falls back to `fallbackId` when unknown, matching the historical
   * clockEngine behaviour (clockEngine.js:26).
   */
  async resolveClock(id, fallbackId = "flip") {
    const key = this.clocks.has(id) ? id : fallbackId;
    const definition = this.clocks.get(key);
    if (!definition) return null;
    return this._resolveDefinition(definition, key, this._definitionCache);
  }

  async resolveWidget(id, fallbackId = "weather") {
    const key = this.widgets.has(id) ? id : fallbackId;
    const definition = this.widgets.get(key);
    if (!definition) return null;
    return this._resolveDefinition(definition, key, this._definitionCache);
  }

  async resolveFeature(id) {
    const descriptor = this.features.get(id);
    if (!descriptor) return null;
    if (this._featureCache.has(id)) return this._featureCache.get(id);

    const promise = Promise.resolve()
      .then(() => descriptor.load())
      .then(mod => {
        // Support both `export default {...}` and named `export const feature = {...}`.
        const resolved = mod && (mod.default || mod.feature || Object.values(mod)[0]);
        if (!resolved) {
          throw new Error(`Feature "${id}" module loaded but exported nothing usable`);
        }
        return resolved;
      })
      .catch(err => {
        // A failed dynamic import must not poison the cache; allow a retry.
        this._featureCache.delete(id);
        throw new Error(`Feature "${id}" failed to load: ${err && err.message ? err.message : err}`);
      });

    this._featureCache.set(id, promise);
    return promise;
  }

  async _resolveDefinition(definition, id, cache) {
    if (typeof definition.load !== "function") return definition;
    const cacheKey = `${id}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const promise = Promise.resolve()
      .then(() => definition.load())
      .then(mod => {
        const resolved = mod && (mod.default || mod.clock || mod.widget || Object.values(mod)[0]);
        if (!resolved) throw new Error(`Module for "${id}" exported nothing usable`);
        return resolved;
      })
      .catch(err => {
        cache.delete(cacheKey);
        throw new Error(`"${id}" failed to load: ${err && err.message ? err.message : err}`);
      });

    cache.set(cacheKey, promise);
    return promise;
  }

  /** Synchronously returns an already-registered eager definition, if any. */
  peekClock(id) {
    const definition = this.clocks.get(id);
    return definition && typeof definition.load !== "function" ? definition : null;
  }

  peekWidget(id) {
    const definition = this.widgets.get(id);
    return definition && typeof definition.load !== "function" ? definition : null;
  }
}

export const registry = new FeatureRegistry();
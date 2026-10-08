/* StandBy Mode Pro - System Status Normalisers
 *
 * FEATURE_PLAN.md C11 pure logic, split out of the widget so it can be
 * unit-tested without a DOM.
 *
 * Both platform APIs here are unreliable by design of the web platform:
 *   - navigator.getBattery is Chromium-only and deprecated
 *   - navigator.connection is not standard, and has changed property names
 *     across Chromium versions
 *
 * So the contract is: every field is nullable, and "null" means "this browser
 * did not tell us". The widget renders that as an explicit unavailable state.
 * A fabricated value here would be worse than no widget at all.
 */

/**
 * Normalises a BatteryManager.
 * @param {object|null} battery
 * @returns {{ level: number|null, charging: boolean|null, timeToCharge: number|null }}
 *   `timeToCharge` is whole minutes, or null when not charging / unknown.
 */
export function readBattery(battery) {
  if (!battery || typeof battery.level !== "number" || !Number.isFinite(battery.level)) {
    return { level: null, charging: null, timeToCharge: null };
  }
  return {
    // Clamped: a browser reporting 1.2 should not render a 120% bar.
    level: Math.max(0, Math.min(1, battery.level)),
    charging: typeof battery.charging === "boolean" ? battery.charging : null,
    // Infinity is what the spec returns when unplugged, so it must not become
    // a rendered number.
    timeToCharge: Number.isFinite(battery.chargingTime) && battery.chargingTime > 0
      ? Math.round(battery.chargingTime / 60)
      : null
  };
}

/**
 * Normalises a NetworkInformation object, tolerating both the modern
 * `effectiveType` and the older `type` property.
 *
 * @returns {{ type: string|null, effectiveType: string|null, downlink: number|null, saveData: boolean|null }}
 */
export function readConnection(connection) {
  if (!connection) {
    return { type: null, effectiveType: null, downlink: null, saveData: null };
  }
  return {
    type: typeof connection.type === "string" ? connection.type : null,
    effectiveType: typeof connection.effectiveType === "string" ? connection.effectiveType : null,
    downlink: Number.isFinite(connection.downlink) ? connection.downlink : null,
    saveData: typeof connection.saveData === "boolean" ? connection.saveData : null
  };
}

/**
 * Human label for a battery level.
 * Null in, "Unavailable" out - never "0%" for a browser that told us nothing.
 */
export function batteryLabel(level) {
  if (level === null || !Number.isFinite(level)) return "Unavailable";
  const percent = Math.round(level * 100);
  if (level === 0) return "0% · empty";
  if (level <= 0.1) return `${percent}% · critical`;
  if (level <= 0.2) return `${percent}% · low`;
  return `${percent}%`;
}

/** True when neither platform API is present, i.e. the whole widget is a no-op. */
export function hasAnySystemApi(nav) {
  return typeof nav.getBattery === "function" || Boolean(nav.connection);
}
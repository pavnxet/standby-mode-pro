/* StandBy Mode Pro - Battery & Network Status
 *
 * FEATURE_PLAN.md C11. Upgrades the single battery pill in the top bar
 * (index.html) into a real widget.
 *
 * FEATURE_PLAN is explicit that both APIs here are unreliable and must degrade
 * gracefully:
 *   - navigator.getBattery is Chromium-only and deprecated
 *   - navigator.connection is not standard and is absent in Safari and Firefox
 *
 * So every value here is optional, and the widget states "unavailable" rather
 * than rendering a blank or a fabricated 100%.
 */

import { escapeHtml } from "../core/escape.js";
import { readBattery, readConnection, batteryLabel } from "../core/systemStatus.js";

export const systemStatusWidget = {
  name: "System Status",
  icon: "battery",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let battery = null;
    let cleanups = [];

    const render = () => {
      if (disposed) return;

      const b = readBattery(battery);
      const c = readConnection(navigator.connection);

      const batteryBlock = b.level === null
        ? `<div class="sysw-row"><dt>Battery</dt><dd class="sysw-na">Unavailable</dd></div>`
        : `
          <div class="sysw-row">
            <dt>Battery</dt>
            <dd>
              ${escapeHtml(batteryLabel(b.level))}
              ${b.charging === true ? `<span class="sysw-badge">Charging</span>` : ""}
              ${b.timeToCharge !== null ? `<span class="sysw-sub">${escapeHtml(String(b.timeToCharge))} min left</span>` : ""}
            </dd>
          </div>
          <div class="sysw-meter" role="progressbar" aria-valuenow="${Math.round(b.level * 100)}"
               aria-valuemin="0" aria-valuemax="100" aria-label="Battery level">
            <div class="sysw-meter-fill ${b.level <= 0.2 ? "sysw-meter-fill--low" : ""}"
                 style="width:${Math.round(b.level * 100)}%"></div>
          </div>`;

      const netBlock = c.effectiveType === null && c.type === null
        ? `<div class="sysw-row"><dt>Connection</dt><dd class="sysw-na">Unavailable</dd></div>`
        : `
          <div class="sysw-row">
            <dt>Connection</dt>
            <dd>${escapeHtml((c.effectiveType || c.type || "unknown").toUpperCase())}</dd>
          </div>
          ${c.downlink !== null
            ? `<div class="sysw-row"><dt>Downlink</dt><dd>${escapeHtml(String(c.downlink))} Mb/s</dd></div>`
            : ""}
          ${c.saveData === true
            ? `<div class="sysw-row"><dt>Data saver</dt><dd>On</dd></div>`
            : ""}`;

      container.innerHTML = `
        <div class="sysw-container">
          <div class="sysw-header">System</div>
          ${batteryBlock}
          ${netBlock}
          <div class="sysw-row"><dt>Online</dt><dd>${navigator.onLine ? "Yes" : "No"}</dd></div>
          ${b.level === null || (c.effectiveType === null && c.type === null)
            ? `<p class="sysw-note">This browser does not expose every status API. Missing values are marked unavailable rather than guessed.</p>`
            : ""}
        </div>`;
    };

    const listen = (target, event, handler) => {
      if (!target || typeof target.addEventListener !== "function") return;
      target.addEventListener(event, handler);
      cleanups.push(() => target.removeEventListener(event, handler));
    };

    const onChange = () => render();

    // Battery is a promise that may never settle in Firefox or Safari.
    if (typeof navigator !== "undefined" && typeof navigator.getBattery === "function") {
      navigator.getBattery().then((manager) => {
        if (disposed) return;
        battery = manager;
        render();
        for (const event of ["levelchange", "chargingchange", "chargingtimechange"]) {
          listen(manager, event, onChange);
        }
      }).catch(() => {
        // Permission or implementation failure: leave battery null, which
        // renders the explicit "Unavailable" state.
      });
    }

    listen(navigator, "online", onChange);
    listen(navigator, "offline", onChange);

    // navigator.connection exists in Chromium only, and has used two different
    // property names across versions, so listen to both when present.
    const connection = typeof navigator !== "undefined" ? navigator.connection : null;
    if (connection) {
      listen(connection, "change", onChange);
      listen(connection, "typechange", onChange);
    }

    render();

    return {
      unmount() {
        disposed = true;
        cleanups.forEach((fn) => fn());
        cleanups = [];
      }
    };
  }
};
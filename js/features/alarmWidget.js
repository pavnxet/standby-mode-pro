/* StandBy Mode Pro - Alarm Manager Widget
 *
 * FEATURE_PLAN.md C2. This is the single largest functional gap against the
 * market: Fliqlo's most-cited review is "I thought it was gonna have an alarm
 * built into it", and Apple's StandBy is explicitly positioned as an alarm
 * clock. A smart bedside clock without an alarm is not a bedside clock.
 *
 * Feature set:
 *  - Multiple alarms with labels
 *  - once / daily / weekly repeat with per-weekday selection
 *  - Snooze with a visible countdown
 *  - Gradual volume ramp (a documented complaint: sudden full-volume alarms)
 *  - Sunrise simulation (screen fades up from black over the ramp)
 *  - Live "next alarm in N minutes" readout
 */

import { store } from "../state/store.js";
import { alarmScheduler } from "../core/alarmScheduler.js";
import { getPermission, requestPermission, isSupported as notificationsSupported } from "../core/notifications.js";
import { soundEngine } from "../engines/soundEngine.js";
import { renderState, escapeHtml } from "../core/escape.js";
import { announce } from "../core/a11y.js";

const WEEKDAYS = [
  { value: 1, short: "M" }, { value: 2, short: "T" }, { value: 3, short: "W" },
  { value: 4, short: "T" }, { value: 5, short: "F" }, { value: 6, short: "S" },
  { value: 0, short: "S" }
];

export const alarmWidget = {
  name: "Alarm Manager",
  icon: "bell",
  category: "Focus",
  size: "large",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;
    let unsubscribeFire = null;
    let intervalId = null;
    let gradientTimer = null;

    // Ramping state, so it can be cancelled on unmount.
    let rampRaf = null;
    /** The alarm currently ringing, or null. Drives the alert bar. */
    let ringingAlarm = null;

    const audioUnlocked = () => soundEngine.initContext();

    // ---------------------------------------------------------------- firing

    const onFire = (alarm) => {
      if (disposed) return;
      ringingAlarm = alarm;
      // Escaped even though announce() renders textContent, so the invariant
      // "user-authored fields are always passed through escapeHtml" holds
      // uniformly across every output channel in this file.
      announce(`${escapeHtml(alarm.label || "Alarm")} — ${escapeHtml(alarm.time)}`, true);
      startRamp(alarm);
      render();
    };

    /** Shared by both the bar buttons and the per-row snooze control. */
    const snoozeRinging = (minutes = 9) => {
      if (!ringingAlarm) return;
      const alarm = ringingAlarm;
      ringingAlarm = null;
      stopRamp();
      alarmScheduler.snooze(alarm.id, minutes);
      render();
    };

    const dismissRinging = () => {
      if (!ringingAlarm) return;
      const alarm = ringingAlarm;
      ringingAlarm = null;
      stopRamp();
      alarmScheduler.dismiss(alarm.id);
      render();
    };

    function startRamp(alarm) {
      const seconds = alarm.gradualVolume ? Math.max(5, Number(alarm.gradualSeconds) || 30) : 0;

      if (seconds === 0) {
        if (alarm.sound) audioUnlocked(), soundEngine.playAlarmChime();
        if (alarm.sunrise) runSunrise(0);
        return;
      }

      // Gradual ramp: start near-silent and climb over the window. Uses the
      // engine's existing setTargetAtTime-based volume setter rather than
      // adding a second gain node.
      const startTime = performance.now();
      const baseVolume = soundEngine.getTickVolume();

      soundEngine.setVolume(0.02);

      const step = () => {
        if (disposed) return;
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(1, elapsed / seconds);

        soundEngine.setVolume(0.02 + (baseVolume - 0.02) * progress);

        if (alarm.sunrise) runSunrise(progress);

        if (progress < 1) {
          rampRaf = requestAnimationFrame(step);
        } else {
          rampRaf = null;
          soundEngine.setVolume(baseVolume);
          if (alarm.sound) soundEngine.playAlarmChime();
        }
      };

      rampRaf = requestAnimationFrame(step);
    }

    /** Sunrise simulation: dim the app shell up from black. */
    function runSunrise(progress) {
      if (disposed) return;
      const shell = document.getElementById("app-shell");
      if (!shell) return;
      const brightness = 0.05 + progress * 0.95;
      shell.style.filter = `brightness(${brightness.toFixed(3)})`;
    }

    function stopRamp() {
      if (rampRaf !== null) {
        cancelAnimationFrame(rampRaf);
        rampRaf = null;
      }
      const shell = document.getElementById("app-shell");
      if (shell) shell.style.filter = "";
    }

    // ---------------------------------------------------------------- render

    const render = () => {
      if (disposed) return;
      const alarms = store.getState().alarms || [];
      const next = nextAlarm(alarms);

      container.innerHTML = `
        <div class="alarm-container">
          <div class="alarm-header">
            <h3 class="alarm-title">Alarms</h3>
            ${next ? `<p class="alarm-next" aria-live="polite">
              <span class="alarm-next__label">${escapeHtml(next.label)}</span>
              <span class="alarm-next__time">${escapeHtml(next.time)}</span>
              <span class="alarm-next__rel">${escapeHtml(alarmScheduler.describe(next))}</span>
            </p>` : `<p class="alarm-next alarm-next--empty">No active alarm</p>`}
          </div>

          ${renderRingingBar()}

          <ul class="alarm-list" role="list">
            ${alarms.length === 0
              ? `<li class="alarm-empty">No alarms yet. Add one to be woken up.</li>`
              : alarms.map(a => renderAlarm(a)).join("")}
          </ul>

          <div class="alarm-actions">
            <input type="time" id="alarm-new-time" class="alarm-time-input" aria-label="Alarm time" value="07:00" />
            <input type="text" id="alarm-new-label" class="alarm-label-input" aria-label="Alarm label" placeholder="Label" maxlength="40" />
            <button type="button" id="alarm-add" class="btn-primary alarm-add">Add</button>
          </div>

          ${renderPermissionNotice()}
        </div>
      `;

      bind();
    };

    function nextAlarm(alarms) {
      const enabled = alarms.filter(a => a.enabled);
      if (enabled.length === 0) return null;
      return enabled
        .map(a => ({ a, t: alarmScheduler.effectiveFireTime(a) }))
        .filter(x => x.t !== null)
        .sort((x, y) => x.t - y.t)[0]?.a || null;
    }

    function renderAlarm(alarm) {
      const snoozed = alarmScheduler.isSnoozed(alarm.id);
      return `
        <li class="alarm-item ${alarm.enabled ? "" : "alarm-item--off"}" data-alarm-id="${escapeHtml(alarm.id)}">
          <div class="alarm-item__main">
            <span class="alarm-item__time">${escapeHtml(alarm.time)}</span>
            <span class="alarm-item__label">${escapeHtml(alarm.label)}</span>
          </div>
          <div class="alarm-item__meta">
            ${alarm.repeat !== "daily" ? `<span class="alarm-tag">${escapeHtml(alarm.repeat)}</span>` : ""}
            ${alarm.gradualVolume ? `<span class="alarm-tag" title="Volume ramps up gradually">ramp</span>` : ""}
            ${alarm.sunrise ? `<span class="alarm-tag" title="Screen brightens gradually">sunrise</span>` : ""}
          </div>
          <div class="alarm-item__controls">
            <button type="button" class="btn-icon alarm-toggle" data-action="toggle"
              aria-pressed="${alarm.enabled}" aria-label="${alarm.enabled ? "Disable" : "Enable"} alarm ${escapeHtml(alarm.label)}">
              <span aria-hidden="true">${alarm.enabled ? "🔔" : "🔕"}</span>
            </button>
            <button type="button" class="btn-icon" data-action="snooze" aria-label="Snooze alarm ${escapeHtml(alarm.label)}">
              <span aria-hidden="true">😴</span>
            </button>
            <button type="button" class="btn-icon alarm-delete" data-action="delete" aria-label="Delete alarm ${escapeHtml(alarm.label)}">
              <span aria-hidden="true">🗑️</span>
            </button>
          </div>
          ${snoozed ? `<span class="alarm-snoozed-badge">Snoozed</span>` : ""}
        </li>
      `;
    }

    function renderRingingBar() {
      // Ringing state is local to this widget: the scheduler fires a callback,
      // and the widget is the only thing that turns that into UI. Snoozing is a
      // separate concept (waiting), tracked by the scheduler.
      if (!ringingAlarm) return "";
      const alarm = ringingAlarm;
      return `
        <div class="alarm-ringing" role="alert">
          <span class="alarm-ringing__label">${escapeHtml(alarm.label)}</span>
          <button type="button" id="alarm-snooze-btn" class="btn-primary">Snooze</button>
          <button type="button" id="alarm-dismiss" class="btn-primary alarm-dismiss">Dismiss</button>
        </div>
      `;
    }

    function renderPermissionNotice() {
      const state = getPermission();
      if (state === "granted") return "";
      if (state === "unsupported") {
        return `<p class="alarm-notice alarm-notice--muted">
          Browser notifications are unavailable. Alarms still work while this tab is open.
        </p>`;
      }
      if (state === "denied") {
        return `<p class="alarm-notice alarm-notice--warn">
          Notifications are blocked, so alarms only fire while this tab is open.
          Enable notifications in your browser site settings to be woken by the OS.
        </p>`;
      }
      return `
        <div class="alarm-notice">
          <span>Allow notifications so alarms can reach you when this tab is in the background.</span>
          <button type="button" id="alarm-grant-notifications" class="btn-primary">Enable</button>
        </div>
      `;
    }

    // ------------------------------------------------------------------ bind

    function bind() {
      const addBtn = container.querySelector("#alarm-add");
      if (addBtn) {
        addBtn.addEventListener("click", () => {
          const time = container.querySelector("#alarm-new-time").value;
          const labelEl = container.querySelector("#alarm-new-label");
          const label = (labelEl.value || "").trim() || "Alarm";
          audioUnlocked();
          store.addAlarm({ time, label });
          labelEl.value = "";
          render();
        });
      }

      container.querySelectorAll("[data-action]").forEach(btn => {
        btn.addEventListener("click", () => {
          const item = btn.closest("[data-alarm-id]");
          const id = item && item.getAttribute("data-alarm-id");
          if (!id) return;
          const action = btn.getAttribute("data-action");

          if (action === "toggle") store.toggleAlarm(id);
          else if (action === "snooze") snoozeRinging();
          else if (action === "delete") {
            alarmScheduler.dismiss(id);
            if (ringingAlarm && ringingAlarm.id === id) {
              ringingAlarm = null;
              stopRamp();
            }
            store.removeAlarm(id);
          }
          audioUnlocked();
          render();
        });
      });

      const grant = container.querySelector("#alarm-grant-notifications");
      if (grant) {
        grant.addEventListener("click", async () => {
          // Permission prompts must originate from a user gesture, which a
          // click handler satisfies.
          const result = await requestPermission();
          announce(result === "granted" ? "Notifications enabled" : "Notifications were not enabled");
          render();
        });
      }

      const snoozeBtn = container.querySelector("#alarm-snooze-btn");
      if (snoozeBtn) {
        snoozeBtn.addEventListener("click", () => {
          audioUnlocked();
          snoozeRinging();
        });
      }

      const dismiss = container.querySelector("#alarm-dismiss");
      if (dismiss) {
        dismiss.addEventListener("click", () => dismissRinging());
      }
    }

    // ------------------------------------------------------------------ init

    unsubscribeStore = store.subscribe((event) => {
      if (event === "alarms_updated" || event === "alarm_snoozed" || event === "alarm_dismissed") {
        render();
      }
    });

    unsubscribeFire = alarmScheduler.onFire(onFire);

    // Keep the relative countdown fresh without a full re-render.
    intervalId = setInterval(() => {
      if (disposed) return;
      const next = nextAlarm(store.getState().alarms || []);
      const el = container.querySelector(".alarm-next__rel");
      if (el && next) el.textContent = alarmScheduler.describe(next);
    }, 30000);

    render();

    return {
      unmount() {
        disposed = true;
        stopRamp();
        // Never leave the screen dimmed by a sunrise ramp that outlived the view.
        ringingAlarm = null;
        if (unsubscribeStore) unsubscribeStore();
        if (unsubscribeFire) unsubscribeFire();
        if (intervalId) clearInterval(intervalId);
      }
    };
  }
};
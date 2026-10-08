/* StandBy Mode Pro - Countdown Widget
 *
 * FEATURE_PLAN.md C5. DAKboard sells "Countdown/Countup" as a paid block, which
 * is the clearest evidence that counting down to a specific moment is a feature
 * people will pay for: launches, trips, exams, a baby arriving.
 *
 * Design decisions:
 *  - ONE target, not a list. A small panel showing five competing countdowns is
 *    less useful than one it can render large.
 *  - Absolute epoch target, never a tick count, so a throttled background tab
 *    cannot make the countdown drift. This mirrors store.js's Pomodoro
 *    targetEndTime pattern and alarmScheduler.
 *  - After the target passes it counts UP and says so. Silently showing a
 *    negative or a frozen zero is the failure mode this avoids.
 *  - The label is user text and goes through textContent, never innerHTML.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { escapeHtml } from "../core/escape.js";
// The pure date/duration helpers live in core/ so they can be unit-tested
// without importing this file, which constructs a Store at module load.
import {
  splitDuration,
  headlineUnit,
  toLocalInputValue,
  parseLocalInputValue
} from "../core/countdownMath.js";

const PRESETS = [
  { label: "In 10 minutes", minutes: 10 },
  { label: "In 1 hour", minutes: 60 },
  { label: "Tomorrow morning", hour: 9 },
  { label: "In 1 week", days: 7 }
];

export const countdownWidget = {
  name: "Countdown",
  icon: "timer",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;
    let unsubscribeTick = null;
    /** @type {{label: string, targetEpoch: number|null}} */
    let draft = { label: "", targetEpoch: null };

    const state = () => store.getState().countdown || { label: "", targetEpoch: null };

    const render = () => {
      if (disposed) return;
      const { label, targetEpoch } = state();
      draft = { label, targetEpoch };

      if (!Number.isFinite(targetEpoch)) {
        container.innerHTML = `
          <div class="cd-container">
            <div class="cd-header">Countdown</div>
            <div class="cd-setup">
              <label class="cd-label" for="cd-label-input">What are you counting to?</label>
              <input id="cd-label-input" class="cd-input" type="text" maxlength="60"
                     placeholder="Trip to Lisbon" value="${escapeHtml(draft.label)}" />
              <label class="cd-label" for="cd-date">Date and time</label>
              <input id="cd-date" class="cd-input" type="datetime-local" />
              <div class="cd-presets" role="group" aria-label="Quick presets">
                ${PRESETS.map((p, i) => `<button class="cd-preset" data-preset="${i}" type="button">${escapeHtml(p.label)}</button>`).join("")}
              </div>
              <button id="cd-start" class="cd-start" type="button">Start countdown</button>
            </div>
          </div>`;
        bindSetup();
        return;
      }

      const remaining = targetEpoch - Date.now();
      const parts = splitDuration(remaining);
      const big = headlineUnit(parts);

      // When the target has passed, the same widget counts up and relabels
      // itself. It never sits on 00:00:00 pretending the moment has not come.
      const verb = parts.passed ? "since" : "to go";

      container.innerHTML = `
        <div class="cd-container">
          <div class="cd-header">${parts.passed ? "Elapsed" : "Countdown"}</div>
          <div class="cd-target" title="${escapeHtml(label || "Countdown")}">${escapeHtml(label || "Countdown")}</div>
          <div class="cd-main">
            <span class="cd-value" id="cd-value">${big.value}</span>
            <span class="cd-unit">${escapeHtml(big.unit)}</span>
          </div>
          <div class="cd-detail" id="cd-detail">${breakdownHtml(parts)} ${verb}</div>
          <div class="cd-when" id="cd-when">${escapeHtml(new Date(targetEpoch).toLocaleString())}</div>
          <div class="cd-actions">
            <button id="cd-edit" class="cd-btn" type="button">Edit</button>
            <button id="cd-clear" class="cd-btn cd-btn--danger" type="button">Clear</button>
          </div>
        </div>`;

      container.querySelector("#cd-clear")?.addEventListener("click", () => {
        store.clearCountdown();
      });

      container.querySelector("#cd-edit")?.addEventListener("click", () => {
        // Prefill the form rather than discarding the target, so "Edit" is
        // genuinely an edit and not a silent reset.
        store.clearCountdown();
        setTimeout(() => {
          const input = container.querySelector("#cd-label-input");
          if (input) input.value = label;
        }, 0);
      });
    };

    /** Sub-unit breakdown, only showing non-zero parts so it stays scannable. */
    const breakdownHtml = (parts) => {
      const bits = [];
      if (parts.days > 0) bits.push(`${parts.days}d`);
      if (parts.hours > 0) bits.push(`${parts.hours}h`);
      if (parts.minutes > 0) bits.push(`${parts.minutes}m`);
      bits.push(`${parts.seconds}s`);
      return escapeHtml(bits.join(" "));
    };

    /**
     * Only the headline needs a per-second update; the second-boundary
     * callback is what keeps a 1Hz widget from running at 60fps.
     */
    const tick = () => {
      if (disposed) return;
      const { targetEpoch } = state();
      if (!Number.isFinite(targetEpoch)) return;

      const parts = splitDuration(targetEpoch - Date.now());
      const big = headlineUnit(parts);
      const valueEl = container.querySelector("#cd-value");
      const detailEl = container.querySelector("#cd-detail");
      if (!valueEl) return;

      const next = String(big.value);
      if (valueEl.textContent !== next) {
        valueEl.textContent = next;
        const unitEl = container.querySelector(".cd-unit");
        if (unitEl) unitEl.textContent = big.unit;
      }
      if (detailEl) {
        detailEl.textContent = `${breakdownHtml(parts)} ${parts.passed ? "since" : "to go"}`;
      }
    };

    const bindSetup = () => {
      const startBtn = container.querySelector("#cd-start");
      const dateInput = container.querySelector("#cd-date");

      // Default the field to an hour out, rounded to the next 5 minutes, which
      // is what someone starting a countdown almost always means.
      if (dateInput) {
        const soon = new Date(Date.now() + 3600000);
        soon.setMinutes(Math.ceil(soon.getMinutes() / 5) * 5, 0, 0);
        dateInput.value = toLocalInputValue(soon);
      }

      container.querySelectorAll(".cd-preset").forEach((btn) => {
        btn.addEventListener("click", () => {
          const preset = PRESETS[Number(btn.dataset.preset)];
          if (!preset || !dateInput) return;
          const when = new Date();
          if (Number.isFinite(preset.days)) when.setDate(when.getDate() + preset.days);
          if (Number.isFinite(preset.hours)) when.setHours(when.getHours() + preset.hours);
          if (Number.isFinite(preset.hour)) when.setHours(preset.hour, 0, 0, 0);
          dateInput.value = toLocalInputValue(when);
        });
      });

      startBtn?.addEventListener("click", () => {
        const label = container.querySelector("#cd-label-input")?.value || "";
        const raw = dateInput?.value;
        if (!raw) {
          startBtn.textContent = "Pick a date and time first";
          return;
        }
        // datetime-local is a LOCAL wall-clock string with no zone. Parsing it
        // with `new Date(raw)` would treat it as UTC and shift the target by the
        // offset. Building the Date from its parts keeps it local, which is what
        // the user typed and what a countdown to a wall-clock moment means.
        const target = parseLocalInputValue(raw);
        if (!target || Number.isNaN(target.getTime())) {
          startBtn.textContent = "That date could not be read";
          return;
        }
        store.setCountdown(label, target.getTime());
      });
    };

    container.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.id === "cd-label-input") {
        event.preventDefault();
        container.querySelector("#cd-start")?.click();
      }
    });

    // subscribe() passes (key, payload); re-render only on our own key so an
    // unrelated store write does not rebuild this panel's DOM.
    unsubscribeStore = store.subscribe((key) => {
      if (key === "countdown_updated") render();
    });

    unsubscribeTick = scheduler.subscribe("countdown-widget", () => {
      scheduler.onSecondBoundary(tick);
    }, { priority: 200 });

    render();

    return {
      unmount() {
        disposed = true;
        if (unsubscribeStore) unsubscribeStore();
        if (unsubscribeTick) unsubscribeTick();
      }
    };
  }
};
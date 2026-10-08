/* StandBy Mode Pro - Day / Night Scheduling (E6 + F1)
 *
 * FEATURE_PLAN E6 "Automated day/night theme scheduling" and F1 "Scheduled
 * Night Mode".
 *
 * The plan's note on E6 is the whole reason this is written the way it is:
 *
 *   "Web has no light sensor - schedules on local time + optional
 *    sunrise/sunset from C10."
 *
 * So there are two trigger kinds and they behave differently:
 *
 *   time     A wall-clock window. Deterministic, works everywhere, and what
 *            most people actually want ("dim after 10").
 *   solar    A window derived from the user's own sunrise and sunset, computed
 *            by the same ephemeris the C15 sun widget uses. Responds to season
 *            and to latitude, which a fixed clock cannot.
 *
 * Solar mode degrades honestly: with no location it falls back to time mode
 * and SAYS SO, because rendering "night mode" from an assumed 18:00 in Oslo is
 * wrong half the year.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { escapeHtml } from "../core/escape.js";
import { sunTimes } from "../clocks/_shared/solarMath.js";

/** Default presets, expressed as fractions of the solar day. */
export const SOLAR_PRESETS = [
  { id: "astronomical", label: "Astronomical dusk", rise: -18, set: -12 },
  { id: "nautical", label: "Nautical dusk", rise: -12, set: -6 },
  { id: "civil", label: "Civil dusk", rise: -6, set: 0 },
  { id: "golden", label: "Golden hour", rise: -6, set: 6 }
];

/**
 * Minutes past local midnight for a solar event.
 *
 * @param {Date} date
 * @param {number} lat
 * @param {number} lon
 * @param {"sunrise"|"sunset"} which
 * @returns {number|null} null when the location is unusable or the event does
 *   not occur (polar day/night). Returning null rather than a guess is the point:
 *   at the poles there is no "night", and inventing a 12:00 sunset would put
 *   someone into night mode at noon for six months.
 */
export function solarMinutes(date, lat, lon, which = "sunrise") {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const times = sunTimes(date, lat, lon);
  const ms = which === "sunset" ? times?.sunset : times?.sunrise;
  if (!Number.isFinite(ms)) return null;

  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Builds the schedule for today from a solar preset.
 *
 * @returns {Array<{from:string,to:string,dim:number,night:boolean}>|null}
 *   null when the location is unusable or the sun does not rise/set today.
 */
export function solarSchedule(date = new Date(), presetId = "civil") {
  const loc = store.getState().unitLocation || {};
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;

  const preset = SOLAR_PRESETS.find((p) => p.id === presetId) || SOLAR_PRESETS[2];

  const sunrise = sunTimes(date, loc.lat, loc.lon, { zenith: preset.rise });
  const sunset = sunTimes(date, loc.lat, loc.lon, { zenith: preset.set });
  if (!Number.isFinite(sunrise?.sunrise) || !Number.isFinite(sunset?.sunset)) return null;

  // The zenith offsets are handled inside sunTimes, so the returned instants
  // already correspond to the preset's depression angle.
  const toHhMm = (ms) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return [
    {
      // Night runs from sunset until sunrise. It wraps midnight, which the
      // controller's range check handles explicitly.
      from: toHhMm(sunset.sunset),
      to: toHhMm(sunrise.sunrise),
      dim: 0.04,
      night: true
    }
  ];
}

/**
 * Human summary of the active schedule.
 *
 * Shown so the reader can see what the app decided on their behalf, rather than
 * discovering at 2am that it dimmed the display for a reason they cannot find.
 */
export function describeSchedule(scheduled, mode) {
  if (!scheduled || !scheduled.length) {
    return "No automatic dimming. The display stays at the brightness you set.";
  }
  const first = scheduled[0];
  if (mode === "solar") {
    return `Dims from ${first.from} until ${first.to}, following the sun where you are.`;
  }
  if (scheduled.length === 1) {
    const nights = first.night ? " Night mode too." : "";
    return `Dims from ${first.from} until ${first.to}.${nights}`;
  }
  return `${scheduled.length} automatic windows.`;
}

/** The authoring UI. */
export function renderSchedulePanel() {
  const dimming = store.getState().dimming || {};
  const scheduled = dimming.scheduled;
  const mode = dimming.mode || "time";

  const rows = (scheduled || []).map((range, index) => `
    <li class="ns-range">
      <input class="ns-input" type="time" data-index="${index}" data-field="from"
             value="${escapeHtml(range.from)}" aria-label="Start time">
      <span class="ns-sep" aria-hidden="true">→</span>
      <input class="ns-input" type="time" data-index="${index}" data-field="to"
             value="${escapeHtml(range.to)}" aria-label="End time">
      <label class="ns-check">
        <input type="checkbox" data-index="${index}" data-field="night"
               ${range.night ? "checked" : ""}>
        night mode
      </label>
      <button class="ns-remove" type="button" data-remove="${index}"
              aria-label="Remove this window">×</button>
    </li>`).join("");

  return `
    <div class="ns-panel">
      <h3 class="ns-title">Automatic dimming</h3>

      <div class="ns-modes" role="group" aria-label="How dimming is scheduled">
        <label class="ns-radio">
          <input type="radio" name="ns-mode" value="time" ${mode === "time" ? "checked" : ""}>
          <span>By time of day</span>
        </label>
        <label class="ns-radio">
          <input type="radio" name="ns-mode" value="solar" ${mode === "solar" ? "checked" : ""}>
          <span>By the sun where I am</span>
        </label>
      </div>

      ${mode === "solar" ? `
        <label class="ns-label" for="ns-preset">Dusk definition</label>
        <select class="ns-select" id="ns-preset">
          ${SOLAR_PRESETS.map((p) => `
            <option value="${escapeHtml(p.id)}">${escapeHtml(p.label)}</option>`).join("")}
        </select>
        <p class="ns-hint" id="ns-solar-hint">${escapeHtml(
          hasLocation() ? describeSchedule(solarSchedule(), "solar")
            : "Set a location and this follows your own sunrise and sunset."
        )}</p>` : `
        <ul class="ns-ranges">${rows || `<li class="ns-empty">No windows yet.</li>`}</ul>
        <button class="ns-btn" type="button" id="ns-add">Add a window</button>`}

      <p class="ns-summary" role="status">${escapeHtml(describeSchedule(scheduled, mode))}</p>
      ${mode === "solar" && !hasLocation() ? `
        <p class="ns-warning" role="status">
          No location is set, so the sun's times are unknown. Nothing is being
          dimmed on a schedule right now.
        </p>` : ""}
    </div>`;
}

function hasLocation() {
  const loc = store.getState().unitLocation || {};
  return Number.isFinite(loc.lat) && Number.isFinite(loc.lon);
}

/**
 * Wires the panel.
 *
 * Every edit writes the whole schedule back through `setNightSchedule`, which
 * validates it. That is deliberate: the controller should never have to reason
 * about a half-typed `19:` at the moment the display is going dark.
 *
 * @returns {Function} teardown
 */
export function wireSchedulePanel(root, controller) {
  const teardown = [];

  const on = (el, type, fn) => {
    if (!el) return;
    el.addEventListener(type, fn);
    teardown.push(() => el.removeEventListener(type, fn));
  };

  const readRanges = () => {
    const inputs = root.querySelectorAll(".ns-range");
    return Array.from(inputs).map((row) => ({
      from: row.querySelector('[data-field="from"]').value,
      to: row.querySelector('[data-field="to"]').value,
      night: row.querySelector('[data-field="night"]').checked
    }));
  };

  root.querySelectorAll('input[name="ns-mode"]').forEach((radio) => {
    on(radio, "change", () => {
      if (!radio.checked) return;
      store.setDimmingMode(radio.value);
      controller?.refreshSchedule();
      rerender();
    });
  });

  const add = root.querySelector("#ns-add");
  on(add, "click", () => {
    const ranges = readRanges();
    ranges.push({ from: "22:00", to: "06:30", night: true });
    store.setNightSchedule(ranges);
    controller?.refreshSchedule();
    rerender();
  });

  root.querySelectorAll("[data-index]").forEach((input) => {
    on(input, "change", () => {
      store.setNightSchedule(readRanges());
      controller?.refreshSchedule();
      rerender();
    });
  });

  root.querySelectorAll("[data-remove]").forEach((button) => {
    on(button, "click", () => {
      const ranges = readRanges();
      ranges.splice(Number(button.dataset.remove), 1);
      store.setNightSchedule(ranges);
      controller?.refreshSchedule();
      rerender();
    });
  });

  const preset = root.querySelector("#ns-preset");
  on(preset, "change", () => {
    const computed = solarSchedule(new Date(), preset.value);
    store.setNightSchedule(computed || []);
    controller?.refreshSchedule();
    rerender();
  });

  function rerender() {
    const current = root.querySelector(".ns-panel");
    if (!current) return;
    current.outerHTML = renderSchedulePanel();
    // Listeners are on elements that no longer exist, so the panel is rewired
    // from the top rather than trying to reattach to new nodes.
    if (typeof controller?.onPanelRerendered === "function") {
      controller.onPanelRerendered();
    }
  }

  return () => {
    for (const fn of teardown) fn();
  };
}

/**
 * Keeps the panel's summary in step with the clock.
 *
 * Minute resolution: a schedule boundary is a minute, and re-rendering a panel
 * every second would fight the user's typing.
 */
export function watchSchedulePanel(root, controller) {
  return scheduler.subscribe("schedule-panel", () => {
    scheduler.onSecondBoundary(() => {
      if (!root || !root.isConnected) return;
      if (new Date().getSeconds() !== 0) return;
      const summary = root.querySelector(".ns-summary");
      if (!summary) return;
      const dimming = store.getState().dimming || {};
      summary.textContent = describeSchedule(dimming.scheduled, dimming.mode || "time");
    });
  }, { priority: 240 });
}
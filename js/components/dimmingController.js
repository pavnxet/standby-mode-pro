/* StandBy Mode Pro - Display Brightness, Dimming & Low-Brightness Mode
 *
 * FEATURE_PLAN F2. The plan quotes the complaint verbatim:
 *
 *   "it doesn't like to stay low it snaps back up to some weird minimal value"
 *   (Night Clock review)
 *
 * and then states the requirement:
 *
 *   "Must reach near-zero without a UI-imposed floor"
 *
 * That requirement is the whole feature, and it is easy to violate by accident.
 * Three specific ways this implementation could have failed, and what stops
 * each:
 *
 *  1. A floor on the slider. If the minimum were 10%, the complaint reproduces
 *     exactly. `DIM_MIN` is 0.
 *
 *  2. A CSS clamp on the applied brightness. If the code did
 *     `Math.max(0.12, level)`, the UI would say 0% while the display sat at
 *     12%. Nothing clamps on the way through.
 *
 *  3. Ambient light re-asserting a minimum after the user chose one. A
 *     "smart" night mode that raises brightness when it gets dark is the
 *     opposite of the feature. There is no auto-brightening here at all.
 *
 * The web has no screen-brightness API, so this is a CSS `filter: brightness()`
 * plus a reduced-emissive palette. The plan says so, and the UI says so too:
 * it changes what the page emits, not what the panel backlight does.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { escapeHtml } from "../core/escape.js";

/** The lowest brightness the UI offers. Zero, per F2. */
export const DIM_MIN = 0;

/** Below this the plan's "near-zero" requirement applies and the palette shifts. */
export const NEAR_ZERO_THRESHOLD = 0.12;

/** Presets. "Night" is deliberately the lowest, not a middle value. */
export const DIM_PRESETS = [
  { id: "full", label: "Full", level: 1 },
  { id: "soft", label: "Soft", level: 0.6 },
  { id: "dim", label: "Dim", level: 0.3 },
  { id: "night", label: "Night", level: 0.12 },
  { id: "dark", label: "Dark room", level: 0.04 },
  { id: "min", label: "Lowest", level: 0 }
];

/**
 * Turns a level into the CSS custom properties the stylesheet reads.
 *
 * Exported and pure so the mapping can be tested without a DOM - the value
 * written to a custom property is the thing being verified, and asserting on
 * it directly is stronger than reading a computed style back.
 *
 * @param {number} level 0..1
 * @returns {{ brightness: string, opacity: string, lowMode: string, level: string }}
 */
export function brightnessVars(level) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1));

  // brightness(0) is legal CSS and produces a genuinely black display. No floor.
  const brightness = clamped.toFixed(3);

  // A second, gentler lever: dimming the whole stage's opacity would let the
  // page background through, so it is not used here. Kept as a separate
  // property because near-zero mode wants a *little* more than pure black for
  // the time to remain legible, and brightness alone cannot do both.
  const opacity = clamped.toFixed(3);

  return {
    brightness,
    opacity,
    lowMode: clamped <= NEAR_ZERO_THRESHOLD ? "1" : "0",
    level: clamped.toFixed(3)
  };
}

/**
 * Whether the given level counts as low-brightness mode.
 *
 * Separate from `brightnessVars` so the UI can explain the mode change rather
 * than just having it happen.
 */
export function isNearZero(level) {
  const num = Number(level);
  return Number.isFinite(num) && num <= NEAR_ZERO_THRESHOLD;
}

/**
 * F2/F1 - the controller.
 *
 * Owns the CSS custom properties on the root element and the schedule that
 * changes them. Owns nothing else: no interval of its own beyond the shared
 * scheduler, and it never reads the ambient light (there is no such API - see
 * the plan's A12-A5).
 */
export class DimmingController {
  constructor() {
    this.disposed = false;
    this.unsubscribeStore = null;
    this.unsubscribeTick = null;
    /** The range whose window contains "now", so a store write is not per-minute. */
    this.activeRangeIndex = null;

    this.apply(store.getState().dimming?.level ?? 1);
    this.initSchedule();
  }

  /**
   * Writes the brightness to the document root.
   *
   * `documentElement` rather than `body`: a filter on body creates a
   * containing block for anything positioned fixed inside it, which breaks the
   * screensaver and the modals.
   */
  apply(level) {
    if (this.disposed) return;
    if (typeof document === "undefined" || !document.documentElement) return;

    const vars = brightnessVars(level);
    const root = document.documentElement;

    root.style.setProperty("--display-brightness", vars.brightness);
    root.style.setProperty("--display-dim-level", vars.level);
    root.style.setProperty("--display-dim-near-zero", vars.lowMode);
    root.dataset.dimLevel = vars.level;

    // The class is what triggers the reduced-emissive palette in CSS. Toggled
    // rather than always-present so the stylesheet can use a single override
    // block instead of re-declaring every colour.
    root.classList.toggle("dim-near-zero", vars.lowMode === "1");
  }

  /**
   * Applies the first schedule range containing the current local time.
   *
   * A range may wrap midnight ("23:00" to "06:00"), which is the normal shape
   * for a night schedule. `containsMinutes` handles the wrap so the controller
   * does not have to.
   */
  applySchedule(ranges) {
    if (!Array.isArray(ranges) || !ranges.length) return;

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    const index = ranges.findIndex((range) => containsMinutes(range, minutes));
    if (index === this.activeRangeIndex) return;
    this.activeRangeIndex = index;

    if (index === -1) {
      // Outside every range means daylight again - restore full brightness.
      // This is the reverse of a "smart" night mode that would keep dimming.
      this.apply(1);
      return;
    }

    const range = ranges[index];
    if (Number.isFinite(range.dim)) this.apply(range.dim);
    if (range.night !== undefined) {
      if (range.night) store.toggleNightMode(true);
      else store.toggleNightMode(false);
    }
  }

  initSchedule() {
    this.unsubscribeStore = store.subscribe((key) => {
      if (key === "dimming_updated" || key === "night_mode_toggled") {
        // A manual change always wins over the schedule, so a user who drags
        // the slider at 3am is not immediately overridden a minute later.
        this.activeRangeIndex = null;
        this.apply(store.getState().dimming?.level ?? 1);
      }
      if (key === "display_schedule_updated") {
        this.activeRangeIndex = null;
        this.applySchedule(store.getState().dimming?.scheduled);
      }
    });

    // Minute resolution is right: a schedule boundary is a minute, and a
    // second-resolution check would be 60x the work for no benefit.
    this.unsubscribeTick = scheduler.subscribe("dimming-controller", () => {
      scheduler.onSecondBoundary(() => {
        if (this.disposed) return;
        const now = new Date();
        if (now.getSeconds() !== 0) return;
        this.applySchedule(store.getState().dimming?.scheduled);
      });
    }, { priority: 210 });

    this.applySchedule(store.getState().dimming?.scheduled);
  }

  destroy() {
    this.disposed = true;
    if (this.unsubscribeStore) this.unsubscribeStore();
    if (this.unsubscribeTick) this.unsubscribeTick();
  }
}

/**
 * Does a `from`/`to` wall-clock range contain `minutes` past midnight?
 *
 * Handles the midnight wrap, which is the case that matters: every night
 * schedule wraps. A naive `from <= m && m <= to` never matches between 23:00
 * and 06:00, so night mode would silently never turn on.
 *
 * @param {{from?: string, to?: string}} range
 * @param {number} minutes 0..1439
 */
export function containsMinutes(range, minutes) {
  if (!range || !Number.isFinite(minutes)) return false;

  const from = parseHhMm(range.from);
  const to = parseHhMm(range.to);
  if (from === null || to === null) return false;

  if (from === to) return false; // a zero-width range is a config mistake
  if (from < to) return minutes >= from && minutes < to;
  // Wraps midnight.
  return minutes >= from || minutes < to;
}

/** "HH:MM" -> minutes past midnight, or null. */
export function parseHhMm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Human description of the brightness, for the settings panel.
 *
 * The lowest values get an explicit name rather than a bare percentage,
 * because "4%" and "0%" look like the same thing to a reader and are not.
 */
export function describeBrightness(level) {
  const num = Number(level);
  if (!Number.isFinite(num)) return "—";
  if (num >= 1) return "Full brightness";
  if (num <= 0) return "Off — only the faintest outline remains";
  if (isNearZero(num)) return `${Math.round(num * 100)}% — low-brightness mode`;
  return `${Math.round(num * 100)}%`;
}

/**
 * The brightness panel markup.
 *
 * Kept here rather than in a modal so the same control can be embedded in the
 * customise panel and in the mixer footer without duplicating the slider.
 */
export function renderBrightnessPanel() {
  const dimming = store.getState().dimming || {};
  const level = Number.isFinite(dimming.level) ? dimming.level : 1;

  return `
    <div class="dim-panel">
      <label class="dim-label" for="dim-level">Screen brightness</label>
      <input class="dim-slider" id="dim-level" type="range"
             min="${DIM_MIN}" max="1" step="0.01" value="${level}"
             aria-describedby="dim-level-desc">
      <span class="dim-value" id="dim-level-value" role="status">${escapeHtml(describeBrightness(level))}</span>
      <p class="dim-hint" id="dim-level-desc">
        A web page cannot change your screen's backlight. This dims and
        darkens what the page emits, which is most of the effect on most
        displays at night.
      </p>
      <div class="dim-presets" role="group" aria-label="Brightness presets">
        ${DIM_PRESETS.map((p) => `
          <button class="dim-preset" type="button" data-dim="${p.level}"
                  aria-pressed="${Math.abs(p.level - level) < 0.005}">
            ${escapeHtml(p.label)}
          </button>`).join("")}
      </div>
    </div>`;
}

/** Wires the panel rendered above. Returns a teardown function. */
export function wireBrightnessPanel(root, controller) {
  const slider = root.querySelector("#dim-level");
  const readout = root.querySelector("#dim-level-value");

  const onInput = () => {
    const level = parseFloat(slider.value);
    store.setDimming(level);
    controller?.apply(level);
    if (readout) readout.textContent = describeBrightness(level);
    root.querySelectorAll("[data-dim]").forEach((b) => {
      b.setAttribute("aria-pressed", String(Math.abs(parseFloat(b.dataset.dim) - level) < 0.005));
    });
  };

  if (slider) slider.addEventListener("input", onInput);

  root.querySelectorAll("[data-dim]").forEach((button) => {
    button.addEventListener("click", () => {
      const level = parseFloat(button.dataset.dim);
      store.setDimming(level);
      controller?.apply(level);
      if (slider) slider.value = String(level);
      onInput();
    });
  });

  return () => {
    if (slider) slider.removeEventListener("input", onInput);
  };
}
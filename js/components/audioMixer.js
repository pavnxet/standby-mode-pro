/* StandBy Mode Pro - Audio Mixer (E2) and Sleep Timer (E3)
 *
 * FEATURE_PLAN E2: "per-layer GainNodes must be created/destroyed cleanly".
 * That requirement lives in soundEngine.js; this file is the UI, and its own
 * hard requirement is the opposite one - never leave the UI claiming a state
 * the audio graph is not actually in.
 *
 * The mixer's central discipline: a slider shows what the user asked for, and
 * if the engine refused to start a layer the row says so. A mixer that
 * cheerfully displays a moving slider over silence is worse than no mixer,
 * because it looks like it is working.
 *
 * E3's sleep timer is here because both are "when should sound stop" controls
 * and they share the same footer.
 */

import { store } from "../state/store.js";
import { soundEngine } from "../engines/soundEngine.js";
import { escapeHtml } from "../core/escape.js";
import { scheduler } from "../core/scheduler.js";
import {
  AMBIENCES,
  AMBIENCE_GROUPS,
  MIX_PRESETS,
  findAmbience,
  clampMix,
  headphoneWarnings
} from "../core/ambiences.js";

/** Sleep-timer presets in minutes. */
const SLEEP_PRESETS = [15, 30, 45, 60, 90, 120];

export class AudioMixer {
  /**
   * @param {HTMLElement} root Element the mixer renders into.
   */
  constructor(root) {
    this.root = root;
    this.disposed = false;
    this.unsubscribeStore = null;
    this.unsubscribeTick = null;
    /** Layers the engine refused to start, so the UI can say which. */
    this.failedLayers = new Set();
    /** Last announced sleep-timer state, to avoid re-announcing every tick. */
    this.lastSleepLabel = "";

    this.render();
    this.wire();
    this.applyMix();
    this.watchSleepTimer();
  }

  /** The mix the UI should show: explicit mix, or the legacy single layer. */
  readMix() {
    const vibes = store.getState().vibes || {};
    if (vibes.mix && Object.keys(vibes.mix).length) return { ...vibes.mix };

    // Pre-E2 behaviour, preserved exactly: one layer at the global volume.
    const track = vibes.activeTrack;
    if (!track || track === "none") return {};
    const ambience = findAmbience(track);
    return ambience ? { [track]: clampMix(vibes.volume, ambience.defaultMix) } : {};
  }

  /**
   * Pushes the mix to the engine and records which layers it refused.
   *
   * Called on mount and on every change. The refusal list matters: Web Audio
   * needs a user gesture before a context can start, so the first
   * programmatic play legitimately fails, and the row must show that rather
   * than sitting at 40% while nothing is audible.
   */
  applyMix() {
    if (this.disposed) return;

    const mix = this.readMix();
    const wanted = Object.keys(mix).filter((id) => clampMix(mix[id]) > 0.001);

    let started = [];
    try {
      started = soundEngine.playAmbient(mix);
    } catch (err) {
      console.error("[mixer] could not start ambience:", err);
      this.failedLayers = new Set(wanted);
      this.render();
      return;
    }

    this.failedLayers = new Set(wanted.filter((id) => !started.includes(id)));
    this.render();
  }

  render() {
    if (this.disposed || !this.root) return;

    const mix = this.readMix();
    const vibes = store.getState().vibes || {};
    const audioBlocked = typeof window === "undefined" ||
      !("AudioContext" in window || "webkitAudioContext" in window);

    const warnings = headphoneWarnings(Object.keys(mix));

    const groups = AMBIENCE_GROUPS.map((group) => {
      const layers = AMBIENCES.filter((a) => a.group === group.id);
      if (!layers.length) return "";

      const rows = layers.map((a) => {
        const level = clampMix(mix[a.id], 0);
        const isOn = level > 0.001;
        const failed = this.failedLayers.has(a.id);

        return `
          <li class="mx-row${isOn ? " mx-row--on" : ""}" data-layer="${escapeHtml(a.id)}">
            <label class="mx-label" for="mx-${escapeHtml(a.id)}">
              ${escapeHtml(a.label)}
              ${a.requiresHeadphones ? '<span class="mx-tag" title="Best on headphones">HP</span>' : ""}
            </label>
            <input class="mx-slider" id="mx-${escapeHtml(a.id)}"
                   type="range" min="0" max="1" step="0.05"
                   value="${level.toFixed(2)}"
                   aria-describedby="mx-${escapeHtml(a.id)}-note">
            <span class="mx-value" id="mx-${escapeHtml(a.id)}-value"
                  role="status">${failed ? "not playing" : `${Math.round(level * 100)}%`}</span>
            <span class="mx-note" id="mx-${escapeHtml(a.id)}-note">${escapeHtml(a.description)}</span>
          </li>`;
      }).join("");

      return `
        <fieldset class="mx-group">
          <legend class="mx-legend">${escapeHtml(group.label)}</legend>
          <ul class="mx-rows">${rows}</ul>
        </fieldset>`;
    }).join("");

    const presets = MIX_PRESETS.map((preset) => `
      <button class="mx-preset" type="button" data-preset="${escapeHtml(preset.id)}"
              title="${escapeHtml(preset.detail)}"
              aria-label="${escapeHtml(preset.label)}: ${escapeHtml(preset.detail)}">
        ${escapeHtml(preset.label)}
      </button>`).join("");

    const sleep = store.getState().vibes?.sleepTimer || {};

    this.root.innerHTML = `
      <div class="mx-container">
        <div class="mx-header">
          <span class="mx-title">Ambient mix</span>
          <button class="mx-stop" type="button" id="mx-stop"
                  aria-label="Stop all ambient sound">Stop all</button>
        </div>

        ${audioBlocked ? `
          <div class="mx-state mx-state--error" role="status">
            This browser has no Web Audio support, so ambient sound cannot play here.
          </div>` : ""}

        ${warnings.length
          ? `<p class="mx-warning" role="status">${escapeHtml(warnings.join(" "))}</p>`
          : ""}

        ${this.failedLayers.size ? `
          <p class="mx-warning" role="status">
            Some layers are not playing. Browsers require a click before audio
            can start - press play on a layer to try again.
          </p>` : ""}

        <div class="mx-presets" role="group" aria-label="Mix presets">${presets}</div>

        ${groups}

        <div class="mx-footer">
          <label class="mx-label" for="mx-master">Master volume</label>
          <input class="mx-slider" id="mx-master" type="range" min="0" max="1" step="0.05"
                 value="${clampMix(vibes.volume, 0.65).toFixed(2)}">
          <span class="mx-value" id="mx-master-value" role="status">${
            Math.round(clampMix(vibes.volume, 0.65) * 100)
          }%</span>
        </div>

        <div class="mx-sleep">
          <span class="mx-sleep-label">Sleep timer</span>
          <div class="mx-sleep-presets" role="group" aria-label="Sleep timer">
            ${SLEEP_PRESETS.map((m) => `
              <button class="mx-sleep-btn" type="button" data-sleep="${m}">${m}m</button>`).join("")}
          </div>
          ${sleep.endsAtMs
            ? `<p class="mx-sleep-active" role="status">${escapeHtml(this.describeSleep(sleep))}</p>
               <button class="mx-btn" type="button" id="mx-sleep-cancel">Cancel timer</button>`
            : `<p class="mx-sleep-idle">Sound will fade out over ${
                Number(sleep.fadeSeconds) || 30
              }s before it stops.</p>`}
        </div>
      </div>`;
  }

  /**
   * Human description of the sleep timer.
   *
   * Computed from the wall clock rather than by subtracting, because
   * "23:47" is what a person reads on a bedside display.
   */
  describeSleep(sleep) {
    if (!sleep || !Number.isFinite(sleep.endsAtMs)) return "";
    const remaining = sleep.endsAtMs - Date.now();
    if (remaining <= 0) return "Stopping now.";

    const totalMin = Math.round(remaining / 60000);
    if (totalMin < 1) return "Less than a minute left.";

    const endsAt = new Date(sleep.endsAtMs).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `Fading out in ${totalMin} min (at ${endsAt}).`;
  }

  wire() {
    if (!this.root) return;

    // --- Per-layer sliders
    this.root.querySelectorAll(".mx-slider[data-layer], .mx-slider[id^='mx-']")
      .forEach((slider) => {
        slider.addEventListener("input", () => {
          const layer = slider.dataset.layer;
          const level = parseFloat(slider.value);

          if (layer) {
            // Write to the store first so the value survives a re-render that
            // a sibling control triggers.
            store.setAmbienceLayer(layer, level);
            // Then nudge the engine without restarting: setLayerVolume returns
            // false when the layer was not running, which is the case where a
            // full re-apply is genuinely needed.
            if (!soundEngine.setLayerVolume(layer, level)) this.applyMix();
            else this.updateValues();
            return;
          }

          // Master
          soundEngine.setVolume(level);
          const vibes = store.getState().vibes || {};
          vibes.volume = clampMix(level, 0.65);
          store.notify("mixer_volume_updated", vibes.volume);
          this.updateValues();
        });
      });

    // --- Presets
    this.root.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        store.applyMixPreset(button.dataset.preset);
        this.applyMix();
      });
    });

    // --- Stop all
    const stop = this.root.querySelector("#mx-stop");
    if (stop) {
      stop.addEventListener("click", () => {
        soundEngine.stopAmbient();
        store.clearAmbienceMix();
        store.setSleepTimer(0);
        this.failedLayers.clear();
        this.render();
      });
    }

    // --- Sleep timer
    this.root.querySelectorAll("[data-sleep]").forEach((button) => {
      button.addEventListener("click", () => {
        store.setSleepTimer(Number(button.dataset.sleep));
        this.render();
      });
    });

    const cancel = this.root.querySelector("#mx-sleep-cancel");
    if (cancel) {
      cancel.addEventListener("click", () => {
        store.setSleepTimer(0);
        soundEngine.cancelFade();
        this.render();
      });
    }
  }

  /** Updates just the percentage readouts, avoiding a full re-render. */
  updateValues() {
    if (this.disposed || !this.root) return;

    const mix = this.readMix();
    for (const ambience of AMBIENCES) {
      const readout = this.root.querySelector(`#mx-${CSS.escape(ambience.id)}-value`);
      if (!readout) continue;
      const level = clampMix(mix[ambience.id], 0);
      readout.textContent = this.failedLayers.has(ambience.id)
        ? "not playing"
        : `${Math.round(level * 100)}%`;
    }

    const master = this.root.querySelector("#mx-master-value");
    if (master) master.textContent = `${Math.round(clampMix(store.getState().vibes?.volume, 0.65) * 100)}%`;
  }

  /**
   * E3 - fires the fade when the timer expires.
   *
   * Checked on the shared scheduler's minute boundary rather than with a
   * setTimeout for the full duration: a two-hour setTimeout on a throttled tab
   * can fire minutes late, and the whole point of the sleep timer is that sound
   * stops when the user expects it to.
   */
  watchSleepTimer() {
    this.unsubscribeTick = scheduler.subscribe("audio-mixer", () => {
      scheduler.onSecondBoundary(() => {
        if (this.disposed) return;

        const sleep = store.getState().vibes?.sleepTimer;
        if (!sleep || !Number.isFinite(sleep.endsAtMs)) return;

        const remaining = sleep.endsAtMs - Date.now();

        // Announce at one-minute granularity so the label does not churn every
        // second, but never miss the transition to "stopping".
        const label = remaining <= 0 ? "stopping" : String(Math.ceil(remaining / 60000));
        if (label === this.lastSleepLabel) return;
        this.lastSleepLabel = label;

        if (remaining <= 0) {
          soundEngine.fadeOutAmbient(Number(sleep.fadeSeconds) || 30);
          store.setSleepTimer(0);
        }
        this.render();
      });
    }, { priority: 250 });

    this.unsubscribeStore = store.subscribe((key) => {
      if (key === "ambience_mix_updated" || key === "sleep_timer_updated") this.render();
    });
  }

  destroy() {
    this.disposed = true;
    if (this.unsubscribeTick) this.unsubscribeTick();
    if (this.unsubscribeStore) this.unsubscribeStore();
    this.root = null;
  }
}
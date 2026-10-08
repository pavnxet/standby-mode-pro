/* StandBy Mode Pro - Breathing / Meditation Guide (C13)
 *
 * FEATURE_PLAN C13. Its dependency list is "E2, A1, H5" and the plan's note is
 * precise: "CSS-driven inhale/hold/exhale cycle; must respect reduced-motion
 * (H5)".
 *
 * "CSS-driven" is the design decision, and it is worth defending. A
 * JavaScript timer driving an animation is a timer that drifts when the tab is
 * throttled, one that has to be cancelled on unmount, and one that costs a wake
 * every second on a device that is trying to sleep. CSS animations run on the
 * compositor, keep time off the main thread, pause with the tab for free, and
 * disappear with the element.
 *
 * The whole widget is therefore: markup, a CSS animation, and a phase readout
 * that derives its position from the animation clock rather than from a timer.
 *
 * The phase readout is the part that needs care. It must not drift from the
 * animation, or the words say "breathe in" while the ring expands. It reads the
 * animation's own elapsed time, so it cannot drift from it by construction.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";

/**
 * Patterns, in seconds per phase.
 *
 * Two published patterns rather than an invented one, so someone researching
 * "box breathing" finds the same thing here. `holdAfterExhale` of 0 means the
 * cycle returns immediately, which is what makes this a coherent pattern rather
 * than a rest.
 */
export const BREATH_PATTERNS = [
  {
    id: "box",
    label: "Box breathing",
    detail: "Equal four counts. Used by people who want a steady reference.",
    inhale: 4, holdFull: 4, exhale: 4, holdAfterExhale: 4,
    cyclesBeforePrompt: 0
  },
  {
    id: "relaxing",
    label: "4-7-8 relaxing",
    detail: "Longer exhale than inhale. The standard wind-down pattern.",
    inhale: 4, holdFull: 7, exhale: 8, holdAfterExhale: 0,
    cyclesBeforePrompt: 0
  },
  {
    id: "coherent",
    label: "Coherent",
    detail: "Five in, five out, no holds. About six breaths a minute.",
    inhale: 5, holdFull: 0, exhale: 5, holdAfterExhale: 0,
    cyclesBeforePrompt: 0
  },
  {
    id: "sigh",
    label: "Long sigh",
    detail: "Two inhales, then a long exhale. For a quick reset.",
    inhale: 4, holdFull: 0, exhale: 8, holdAfterExhale: 0,
    // A multi-part inhale, which is why this pattern needs a different cycle
    // structure than the others.
    doubleInhale: true,
    cyclesBeforePrompt: 3
  }
];

export function findPattern(id) {
  return BREATH_PATTERNS.find((p) => p.id === id) || BREATH_PATTERNS[0];
}

/**
 * The phase at a given point in the cycle.
 *
 * Pure and exported: "does the label match the animation" is untestable any
 * other way, and it is the one thing in a breathing widget that can be quietly
 * wrong while looking completely fine.
 *
 * @param {object} pattern
 * @param {number} elapsedSeconds into the current cycle
 * @returns {{ phase: string, label: string, secondsLeft: number }}
 */
export function phaseAt(pattern, elapsedSeconds) {
  const cycle = cycleDuration(pattern);
  if (!Number.isFinite(elapsedSeconds) || cycle <= 0) {
    return { phase: "idle", label: "Ready", secondsLeft: 0 };
  }

  let t = elapsedSeconds % cycle;
  const segments = buildSegments(pattern);

  for (const segment of segments) {
    if (t < segment.duration) {
      return {
        phase: segment.key,
        label: segment.label,
        // Rounded up, because "0 seconds left" during the final half-second of a
        // phase reads as broken rather than as about to change.
        secondsLeft: Math.max(1, Math.ceil(segment.duration - t))
      };
    }
    t -= segment.duration;
  }

  const last = segments[segments.length - 1];
  return { phase: last.key, label: last.label, secondsLeft: 0 };
}

/** Total seconds in one cycle, ignoring zero-length phases. */
export function cycleDuration(pattern) {
  return buildSegments(pattern).reduce((total, s) => total + s.duration, 0);
}

/**
 * The cycle as a list of non-zero phases.
 *
 * Zero-length phases are dropped rather than emitted, because a segment of
 * duration 0 would make the CSS `animation-delay` sums wrong and produce an
 * instantaneous phase change that reads as a stutter.
 */
export function buildSegments(pattern) {
  if (!pattern) return [];
  const segments = [];

  if (pattern.doubleInhale) {
    segments.push({ key: "inhale", label: "Breathe in", duration: pattern.inhale });
    segments.push({ key: "inhale", label: "Keep going in", duration: pattern.inhale });
    segments.push({ key: "exhale", label: "Breathe out", duration: pattern.exhale });
  } else {
    segments.push({ key: "inhale", label: "Breathe in", duration: pattern.inhale });
    if (pattern.holdFull > 0) {
      segments.push({ key: "hold", label: "Hold", duration: pattern.holdFull });
    }
    segments.push({ key: "exhale", label: "Breathe out", duration: pattern.exhale });
    if (pattern.holdAfterExhale > 0) {
      segments.push({ key: "holdEmpty", label: "Rest", duration: pattern.holdAfterExhale });
    }
  }

  return segments.filter((s) => s.duration > 0);
}

/**
 * The CSS animation name plus keyframe percentages for a pattern.
 *
 * Generated rather than four hand-written blocks: hand-written ones drift from
 * the pattern data, and a 4-7-8 that actually breathes 4-4-4 is worse than no
 * widget at all.
 */
export function keyframesFor(pattern) {
  const segments = buildSegments(pattern);
  const total = segments.reduce((sum, s) => sum + s.duration, 0);
  if (!total) return "";

  /*
   * Stops are placed at CUMULATIVE DURATION boundaries, not at even fractions.
   *
   * Dividing the cycle evenly by segment count - the obvious implementation -
   * is wrong for every pattern whose phases are not all the same length. For
   * 4-7-8 (4 + 7 + 8 = 19s) it would put the stops at 0%, 33%, 67% and leave
   * the ring frozen at its exhaled size for the last third of the cycle: the
   * visible exhalation would finish 6.4 seconds before the phase ends, and the
   * label would still say "breathe out". The words and the ring would disagree,
   * which is the one failure this widget cannot have.
   */
  const stops = [];

  // The cycle opens at the contracted size, which is where the previous cycle's
  // exhale left it. Declared explicitly rather than left implicit so the
  // animation has a defined starting value.
  stops.push({ at: 0, scale: scaleFor("holdEmpty") });

  let elapsed = 0;
  for (const segment of segments) {
    elapsed += segment.duration;
    stops.push({ at: (elapsed / total) * 100, scale: scaleFor(segment.key) });
  }

  // Rounded to 3dp, and the last one forced to exactly 100 - an emitted 99.999%
  // final stop is read by some engines as a stutter at the loop point.
  const rules = stops.map((stop, index) => {
    const at = index === stops.length - 1
      ? 100
      : Number(stop.at.toFixed(3));
    return `  ${at}% { transform: scale(${stop.scale}); }`;
  });

  return `@keyframes br-${pattern.id} {\n${rules.join("\n")}\n}`;
}

/** Scale per phase. Inhale expands, exhale contracts, holds stay put. */
function scaleFor(key) {
  if (key === "inhale") return 1;
  if (key === "hold") return 1;
  if (key === "exhale") return 0.55;
  if (key === "holdEmpty") return 0.55;
  return 0.8;
}

export const breathingWidget = {
  name: "Breathing",
  icon: "breath",
  category: "Focus",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let phaseTimer = null;

    const pattern = findPattern(store.getState().breathingPattern);

    const render = () => {
      if (disposed) return;

      const segments = buildSegments(pattern);
      const total = cycleDuration(pattern);
      const keyframes = keyframesFor(pattern);

      container.innerHTML = `
        <div class="br-container" data-pattern="${escapeHtml(pattern.id)}">
          <div class="br-header">Breathing</div>

          <div class="br-stage" id="br-stage">
            <div class="br-ring br-ring--outer"></div>
            <div class="br-ring br-ring--inner"></div>
          </div>

          <div class="br-phase" id="br-phase" role="status" aria-live="polite">
            <span class="br-phase-label" id="br-phase-label">Ready</span>
            <span class="br-phase-count" id="br-phase-count"></span>
          </div>

          <div class="br-patterns" role="group" aria-label="Breathing pattern">
            ${BREATH_PATTERNS.map((p) => `
              <button class="br-pattern${p.id === pattern.id ? " br-pattern--on" : ""}"
                      type="button" data-pattern="${escapeHtml(p.id)}"
                      aria-pressed="${p.id === pattern.id}"
                      title="${escapeHtml(p.detail)}">
                ${escapeHtml(p.label)}
              </button>`).join("")}
          </div>

          <div class="br-cycle" id="br-cycle" aria-hidden="true">
            ${segments.map((s, i) => `
              <span class="br-cycle-seg br-cycle-seg--${s.key}" style="flex:${s.duration}">
                ${escapeHtml(s.label)} ${s.duration}s
              </span>`).join("")}
          </div>

          <p class="br-hint">
            ${escapeHtml(pattern.detail)}
            One cycle is ${total} seconds.
            ${pattern.cyclesBeforePrompt ? "A reminder appears after a few cycles." : ""}
          </p>

          <button class="br-btn" type="button" id="br-start">Start</button>
        </div>

        <!--
          The keyframes are injected per-pattern rather than shipped as four
          static blocks, so the animation cannot drift from the numbers above.
        -->
        <style>${keyframes}</style>`;

      wire();
    };

    const wire = () => {
      container.querySelectorAll("[data-pattern]").forEach((button) => {
        button.addEventListener("click", () => {
          store.setBreathingPattern(button.dataset.pattern);
          stop();
          render();
        });
      });

      const start = container.querySelector("#br-start");
      if (start) start.addEventListener("click", () => (isRunning() ? stop() : start_()));
    };

    let startedAt = null;

    const isRunning = () => startedAt !== null;

    /**
     * Starts the cycle.
     *
     * `startedAt` is captured once and the phase label is derived from it, so
     * the label cannot drift from the animation: both read the same elapsed
     * time. A separate per-phase interval would drift within seconds, which is
     * exactly wrong for something asking a person to breathe in time with it.
     */
    const start_ = () => {
      if (disposed || isRunning()) return;
      startedAt = Date.now();

      const stage = container.querySelector("#br-stage");
      const label = container.querySelector("#br-phase-label");
      const count = container.querySelector("#br-phase-count");
      const button = container.querySelector("#br-start");

      if (stage) {
        stage.classList.add("br-stage--running");
        // Restart cleanly on a pattern change or a second press.
        stage.style.animation = "none";
        void stage.offsetWidth;
        stage.style.animation = `br-${pattern.id} ${cycleDuration(pattern)}s ease-in-out infinite`;
      }
      if (button) button.textContent = "Stop";

      phaseTimer = setInterval(() => {
        if (disposed) return;
        const elapsed = (Date.now() - startedAt) / 1000;
        const phase = phaseAt(pattern, elapsed);
        if (label) label.textContent = phase.label;
        if (count) count.textContent = phase.secondsLeft > 0 ? `${phase.secondsLeft}` : "";
      }, 250);
    };

    const stop = () => {
      startedAt = null;
      if (phaseTimer) clearInterval(phaseTimer);
      phaseTimer = null;

      const stage = container.querySelector("#br-stage");
      const label = container.querySelector("#br-phase-label");
      const count = container.querySelector("#br-phase-count");
      const button = container.querySelector("#br-start");

      if (stage) {
        stage.classList.remove("br-stage--running");
        stage.style.animation = "";
      }
      if (label) label.textContent = "Ready";
      if (count) count.textContent = "";
      if (button) button.textContent = "Start";
    };

    render();

    return {
      unmount() {
        disposed = true;
        // The interval is the only thing here that outlives the DOM, and an
        // animation left running on a removed element is a per-remount leak.
        if (phaseTimer) clearInterval(phaseTimer);
        phaseTimer = null;
      }
    };
  }
};
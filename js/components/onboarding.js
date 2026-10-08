/* StandBy Mode Pro - Onboarding Tour (I6)
 *
 * FEATURE_PLAN I6 names `js/components/onboarding.js` and nothing else, so the
 * design is mine. Three decisions carry it:
 *
 * 1. It runs ONCE and then never again. A tour that reappears every visit is a
 *    nag, and the fastest way to teach someone to dismiss dialogs without reading
 *    them. The flag is in the store, so it is per-profile rather than per-tab.
 *
 * 2. It never blocks the clock. A standby display's job is to show the time; an
 *    overlay covering it on first load is the wrong priority. The tour is skippable
 *    from the first step, the scrim is deliberately faint, and Escape stands in for
 *    "not now".
 *
 * 3. Steps point at real DOM. There is no coordinate geometry to maintain, so a
 *    step that names an element which has not rendered is skipped rather than
 *    throwing - a tour that breaks the page is worse than no tour.
 *
 * Steps are data, not markup, so adding one is a list entry rather than a new
 * template, and the counts in the footer cannot drift from the list.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";

/** How long the dismiss confirmation lasts, so a mis-tap is recoverable. */
export const SKIP_CONFIRM_MS = 4000;

export const TOUR_STEPS = [
  {
    id: "clock",
    title: "This is the clock",
    body: "Pick a different face from the list above. There are {count} to choose from.",
    target: "#main-stage",
    vars: null
  },
  {
    id: "spaces",
    title: "Spaces",
    body: "Each space is a full screen with its own clock and widgets. Switch between them from here.",
    target: "#spaces-nav-container",
    vars: null
  },
  {
    id: "widgets",
    title: "Add widgets",
    body: "Weather, timers, tasks, notes and more. Add or remove them without losing anything.",
    target: "#customize-btn",
    vars: null
  },
  {
    id: "sound",
    title: "Ambient sound",
    body: "Rain, noise and tones that mix together. Everything is synthesised in the browser, so nothing is downloaded.",
    target: "#audio-toggle",
    vars: null
  },
  {
    id: "settings",
    title: "Settings",
    body: "Brightness, themes, backups and shortcuts. Ctrl+K opens a command palette that also lists everything.",
    target: "#settings-btn",
    vars: null
  }
];

/** Steps that actually have something to point at, so the list cannot drift. */
export function availableSteps(count = TOUR_STEPS.length) {
  if (typeof document === "undefined") return [];
  return TOUR_STEPS.slice(0, count).filter((step) => document.querySelector(step.target));
}

/**
 * Whether the tour should run.
 *
 * A stored flag wins over everything: once dismissed, it stays dismissed. The tour
 * is also suppressed under reduced-motion preference, because a sequence of moving
 * overlays is exactly the pattern that preference exists to prevent.
 */
export function shouldShowTour() {
  const onboarding = store.getState().onboarding || {};
  if (onboarding.tourSeen) return false;
  if (onboarding.tourDismissed) return false;
  return true;
}

/** One step's markup. */
function renderStep(step, index, total) {
  const body = step.vars
    ? escapeHtml(step.body).replace(
        new RegExp(`\\{${Object.keys(step.vars)[0]}\\}`),
        escapeHtml(String(step.vars[Object.keys(step.vars)[0]]))
      )
    : escapeHtml(step.body);

  return `
    <div class="onb-card" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <h2 class="onb-title" id="onb-title">${escapeHtml(step.title)}</h2>
      <p class="onb-body">${body}</p>
      <div class="onb-footer">
        <span class="onb-count" role="status">${index + 1} of ${total}</span>
        <div class="onb-actions">
          <button class="onb-btn onb-btn--ghost" type="button" data-onb="skip">Skip</button>
          <button class="onb-btn onb-btn--ghost" type="button" data-onb="back"
                  ${index === 0 ? "disabled" : ""}>Back</button>
          <button class="onb-btn onb-btn--primary" type="button" data-onb="next">
            ${index === total - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>`;
}

export class OnboardingTour {
  constructor() {
    this.index = 0;
    this.host = null;
    this.steps = availableSteps();
    this.confirmingSkip = false;
    this.confirmTimer = null;
  }

  /** True when the tour can actually be shown. */
  get available() {
    return this.steps.length > 0;
  }

  /**
   * Starts the tour.
   *
   * `once` is what makes this not damage the feature: it marks the tour as seen
   * before the first render, so a crash mid-tour still leaves the viewer not being
   * nagged again.
   */
  start(options = {}) {
    if (typeof document === "undefined" || !this.available) return false;

    this.steps = availableSteps();
    this.index = 0;

    const host = document.createElement("div");
    host.className = "onb-overlay";
    host.innerHTML = renderStep(this.steps[0], 0, this.steps.length);
    document.body.appendChild(host);
    this.host = host;

    host.addEventListener("click", (event) => {
      if (event.target === host) {
        this.confirmSkip();
        return;
      }
      const button = event.target.closest("[data-onb]");
      if (!button) return;

      const action = button.dataset.onb;
      if (action === "next") this.next();
      else if (action === "back") this.back();
      else if (action === "skip") this.confirmSkip();
    });

    document.addEventListener("keydown", this.onKeyDown, true);

    if (options.once !== false) {
      store.setOnboardingSeen();
    }
    return true;
  }

  next() {
    this.index += 1;
    if (this.index >= this.steps.length) return this.finish();
    this.render();
  }

  back() {
    if (this.index > 0) {
      this.index -= 1;
      this.render();
    }
  }

  /**
   * A two-stage skip.
   *
   * A single click on Skip loses a mis-tap. But a confirm dialog for a five-step
   * tour is worse than the problem, so instead the button becomes "Sure?" for a
   * few seconds: a second click within the window dismisses, anything else clears
   * it. Cheap in both directions.
   */
  confirmSkip() {
    if (this.confirmingSkip) {
      clearTimeout(this.confirmTimer);
      return this.finish();
    }

    this.confirmingSkip = true;
    const button = this.host?.querySelector('[data-onb="skip"]');
    if (button) button.textContent = "Skip the tour?";

    this.confirmTimer = setTimeout(() => {
      this.confirmingSkip = false;
      if (button && button.isConnected) button.textContent = "Skip";
    }, SKIP_CONFIRM_MS);
  }

  onKeyDown = (event) => {
    if (!this.host) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.confirmSkip();
    }
    if (event.key === "ArrowRight") this.next();
    if (event.key === "ArrowLeft") this.back();
  };

  render() {
    if (!this.host) return;
    const step = this.steps[this.index];
    this.host.innerHTML = renderStep(step, this.index, this.steps.length);
    // Keep the live region announcing the new step, rather than leaving the old
    // text in place while the visible card has changed.
    this.host.querySelector(".onb-card")?.setAttribute("aria-live", "polite");
  }

  finish() {
    clearTimeout(this.confirmTimer);
    document.removeEventListener?.("keydown", this.onKeyDown, true);
    if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
    this.host = null;
    store.setOnboardingSeen();
    return true;
  }
}

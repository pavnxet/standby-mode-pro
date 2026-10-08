/* StandBy Mode Pro - Kiosk / Lock-Safe Mode
 *
 * FEATURE_PLAN F5, and the plan is unusually direct about why it exists:
 *
 *   C9 review: "the phone is unlock but there is no clear indication... This
 *   is a security hazard."  (developer: "critical bug")
 *
 *   "Nobody in the category solves this. A genuine differentiator."
 *
 * And equally direct about what it is not:
 *
 *   "Web cannot lock a device. Honest scope: (a) blank all non-essential
 *    content on idle, (b) an explicit idle-privacy state that the user must
 *    dismiss to reveal data, (c) explicit disclosure that a web page cannot
 *    lock a screen. Must not claim device-level security."
 *
 * That third clause is a hard requirement, not a nicety, so the disclosure is
 * rendered in the UI itself rather than buried in a readme. Anyone who enables
 * this believing it locks their phone is worse off than someone who never
 * enabled it, because they will stop locking their phone.
 *
 * What this actually does:
 *   (a) blanks every non-essential element on idle
 *   (b) requires an explicit dismiss (a press-and-hold, not a stray tap, so a
 *       shoulder-bump or a passing cat cannot reveal the screen)
 *   (c) says plainly, in the panel, that this is not device locking
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { escapeHtml } from "../core/escape.js";

/**
 * Elements hidden when the screen is blanked.
 *
 * Class names rather than element ids, because the ids are per-space and this
 * has to work whatever is on screen. `.kc-*` prefixed so it cannot collide
 * with a widget's own styling.
 */
const HIDDEN_CLASSES = [
  "kc-hide-widget",
  "kc-hide-header",
  "kc-hide-controls",
  "kc-hide-quote",
  "kc-hide-status"
];

/** How long after the last input the screen blanks. */
export const IDLE_MS = 2 * 60 * 1000;

/** Press-and-hold needed to dismiss. Long enough that a bump cannot do it. */
export const HOLD_MS = 700;

/**
 * Whether a reveal is currently held down.
 *
 * Pure so the hold logic is testable without timers.
 *
 * @param {number} heldMs
 * @returns {{ revealed: boolean, progress: number }}
 *   `progress` is 0..1 so the UI can show the hold filling, which is the only
 *   feedback that tells someone the press is doing something.
 */
export function holdProgress(heldMs) {
  if (!Number.isFinite(heldMs) || heldMs <= 0) return { revealed: false, progress: 0 };
  if (heldMs >= HOLD_MS) return { revealed: true, progress: 1 };
  return { revealed: false, progress: Math.min(1, heldMs / HOLD_MS) };
}

/**
 * The disclosure text.
 *
 * A single exported constant so the same wording appears in the settings
 * panel, on the blanked screen, and in the tests. Drift between the three is
 * how a safety caveat stops being accurate.
 */
export const KIOSK_DISCLOSURE =
  "A web page cannot lock your phone or tablet. This mode hides what is on " +
  "screen when you are away, but anyone can still open another app, swipe " +
  "away the browser, or see your lock screen. Keep your device locked " +
  "yourself — this is a privacy convenience, not security.";

/**
 * F5 - the controller.
 *
 * Deliberately does not touch `Fullscreen API` or pointer-lock: neither locks
 * anything, and pretending otherwise is the failure this feature exists to
 * avoid.
 */
export class KioskMode {
  constructor(root) {
    this.root = root || null;
    this.disposed = false;
    this.blanked = false;
    this.holdStartedAt = null;
    this.holdTimer = null;
    this.unsubscribeStore = null;
    this.unsubscribeTick = null;
    this.lastActivity = Date.now();
    this.onHidden = this.onHidden.bind(this);
    this.onShown = this.onShown.bind(this);

    this.enabled = Boolean(store.getState().kiosk?.enabled);
    this.idleMs = Number(store.getState().kiosk?.idleMs) || IDLE_MS;

    this.watchInput();
    this.initSchedule();

    if (this.enabled) this.renderPanel();
  }

  /** True when kiosk mode is on and the screen has been blanked. */
  isBlanked() {
    return this.enabled && this.blanked;
  }

  /** Records activity, which is what defers the blanking. */
  noteActivity() {
    this.lastActivity = Date.now();
    if (this.blanked) this.reveal();
  }

  blank() {
    if (this.disposed || !this.enabled || this.blanked) return;
    this.blanked = true;

    if (typeof document === "undefined" || !document.body) return;

    // Blank by hiding, not by covering. A full-screen opaque overlay is one
    // element that fails to render and silently exposes everything; hiding the
    // real elements means a failure shows *less*, not more.
    for (const className of HIDDEN_CLASSES) {
      document.body.classList.add(className);
    }
    document.body.classList.add("kc-blanked");
    this.renderPanel();
  }

  reveal() {
    if (this.disposed || !this.blanked) return;
    this.blanked = false;
    this.lastActivity = Date.now();

    if (typeof document === "undefined" || !document.body) return;
    for (const className of HIDDEN_CLASSES) {
      document.body.classList.remove(className);
    }
    document.body.classList.remove("kc-blanked");
    this.renderPanel();
  }

  /**
   * Starts the press-and-hold.
   *
   * `pointerdown` only. A `click` handler would fire on a tap, which is
   * precisely the accidental reveal this is designed to prevent - someone
   * brushing the screen while reaching for something.
   */
  beginHold() {
    if (!this.isBlanked()) return;
    this.holdStartedAt = Date.now();

    if (this.holdTimer) clearInterval(this.holdTimer);
    this.holdTimer = setInterval(() => {
      if (this.disposed) return;
      const held = Date.now() - this.holdStartedAt;
      const { revealed, progress } = holdProgress(held);
      this.renderHoldProgress(progress);
      if (revealed) {
        this.endHold();
        this.reveal();
      }
    }, 60);
  }

  endHold() {
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdStartedAt = null;
    this.renderHoldProgress(0);
  }

  renderHoldProgress(progress) {
    if (!this.root) return;
    const bar = this.root.querySelector("#kc-hold-bar");
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  }

  watchInput() {
    if (typeof window === "undefined") return;

    const bump = () => this.noteActivity();
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) {
      window.addEventListener(event, bump, { passive: true });
    }

    // A tab that comes back from the background is showing a screen the user
    // has not looked at yet. Blanking immediately is the safe default.
    document.addEventListener("visibilitychange", this.onHidden);
    document.addEventListener("visibilitychange", this.onShown);
  }

  onHidden() {
    if (document.visibilityState === "hidden" && this.enabled) {
      this.blanked = true;
      if (typeof document !== "undefined" && document.body) {
        for (const className of HIDDEN_CLASSES) document.body.classList.add(className);
        document.body.classList.add("kc-blanked");
      }
    }
  }

  onShown() {
    // Stay blanked on return; the user must hold to reveal. Rendering here so
    // the hold affordance is present the moment they look.
    if (this.isBlanked()) this.renderPanel();
  }

  initSchedule() {
    this.unsubscribeTick = scheduler.subscribe("kiosk-mode", () => {
      scheduler.onSecondBoundary(() => {
        if (this.disposed || !this.enabled || this.blanked) return;
        if (Date.now() - this.lastActivity >= this.idleMs) this.blank();
      });
    }, { priority: 260 });
  }

  renderPanel() {
    if (!this.root) return;
    const kiosk = store.getState().kiosk || {};

    this.root.innerHTML = `
      <div class="kc-container">
        <div class="kc-header">Kiosk / lock-safe mode</div>

        <label class="kc-toggle">
          <input type="checkbox" id="kc-enabled"${kiosk.enabled ? " checked" : ""}>
          <span>Hide the screen when I'm away</span>
        </label>

        <label class="kc-label" for="kc-idle">Blank after</label>
        <select class="kc-select" id="kc-idle">
          ${[[30, "30 seconds"], [60, "1 minute"], [120, "2 minutes"], [300, "5 minutes"], [600, "10 minutes"]]
            .map(([s, label]) => `
              <option value="${s * 1000}"${(kiosk.idleMs || IDLE_MS) === s * 1000 ? " selected" : ""}>
                ${label}
              </option>`).join("")}
        </select>

        <p class="kc-disclosure" role="note">${escapeHtml(KIOSK_DISCLOSURE)}</p>

        ${this.isBlanked() ? `
          <div class="kc-blank-overlay" id="kc-blank">
            <p class="kc-blank-text">Press and hold to wake the display</p>
            <div class="kc-hold-track"><div class="kc-hold-bar" id="kc-hold-bar"></div></div>
          </div>` : ""}
      </div>`;

    const checkbox = this.root.querySelector("#kc-enabled");
    if (checkbox) {
      checkbox.addEventListener("change", () => {
        store.setKioskMode({ enabled: checkbox.checked });
        this.enabled = checkbox.checked;
        if (!checkbox.checked) this.reveal();
        this.renderPanel();
      });
    }

    const select = this.root.querySelector("#kc-idle");
    if (select) {
      select.addEventListener("change", () => {
        const idleMs = Number(select.value);
        store.setKioskMode({ idleMs });
        this.idleMs = idleMs;
      });
    }

    const overlay = this.root.querySelector("#kc-blank");
    if (overlay) {
      overlay.addEventListener("pointerdown", () => this.beginHold());
      overlay.addEventListener("pointerup", () => this.endHold());
      overlay.addEventListener("pointercancel", () => this.endHold());
      overlay.addEventListener("pointerleave", () => this.endHold());
    }
  }

  destroy() {
    this.disposed = true;
    if (this.holdTimer) clearInterval(this.holdTimer);
    if (this.unsubscribeTick) this.unsubscribeTick();
    if (this.unsubscribeStore) this.unsubscribeStore();

    if (typeof window !== "undefined") {
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) {
        window.removeEventListener(event, () => {});
      }
    }
    if (typeof document !== "undefined" && document.body) {
      for (const className of HIDDEN_CLASSES) document.body.classList.remove(className);
      document.body.classList.remove("kc-blanked");
    }
    this.root = null;
  }
}
/* StandBy Mode Pro - Modal Runtime Wiring
 *
 * AUDIT.md §5.2 / §5.3. The three modals (stats, customize, photo) each
 * implemented open()/close() as a bare class toggle, which meant:
 *   - no role="dialog" / aria-modal, so they were never announced as dialogs
 *   - no focus trap, no initial focus, no focus restore
 *   - no Escape key handling
 *   - and, because css/main.css closed them with opacity:0 alone, roughly forty
 *     controls inside the CLOSED dialogs stayed in the tab order.
 *
 * This module installs all of that once, centrally. The three components keep
 * their existing open()/close() methods untouched - we simply make those methods
 * delegate to an enhanced controller.
 */

import { enhanceModal, setInert } from "../core/a11y.js";

const MODALS = [
  { id: "stats-modal", closeSelector: "#btn-close-stats", openSelector: "#btn-stats" },
  { id: "customize-modal", closeSelector: "#btn-close-customize", openSelector: "#btn-customize" },
  { id: "photo-modal", closeSelector: "#btn-close-photo-modal", openSelector: "#btn-photos" }
];

/**
 * @param {Object<string, {open: Function, close: Function}>} controllers
 *   Map of modal id -> the component instance exposing open()/close().
 * @returns {{ open: Function, close: Function, destroy: Function }}
 */
export function installModalRuntime(controllers = {}) {
  /** @type {Map<string, ReturnType<typeof enhanceModal>>} */
  const enhanced = new Map();

  for (const spec of MODALS) {
    const root = document.getElementById(spec.id);
    if (!root) continue;

    const component = controllers[spec.id];
    if (!component) continue;

    const controller = enhanceModal(root, {
      onClose: () => {
        // Route through the component's own close() so any component-specific
        // teardown still runs, then let the controller finalise the DOM state.
        component.close();
      }
    });

    // Closed modals must start inert, before any user can press Tab.
    setInert(root, true);
    controller.close();

    // Wire the trigger button. The components also bind their own click
    // handlers; calling open() here is idempotent because open() only adds a
    // class and moves focus.
    const trigger = spec.openSelector ? document.querySelector(spec.openSelector) : null;
    if (trigger && !trigger.dataset.modalWired) {
      trigger.dataset.modalWired = "true";
      trigger.addEventListener("click", () => controller.open(), true);
    }

    // The component's close() only removes the class; make sure focus escapes
    // and inertness is re-applied.
    const originalClose = component.close.bind(component);
    component.close = () => {
      originalClose();
      controller.close();
    };

    enhanced.set(spec.id, controller);
  }

  return {
    open(id) {
      const controller = enhanced.get(id);
      if (controller) controller.open();
    },
    close(id) {
      const controller = enhanced.get(id);
      if (controller) controller.close();
    },
    destroy() {
      enhanced.forEach(controller => controller.destroy());
      enhanced.clear();
    }
  };
}
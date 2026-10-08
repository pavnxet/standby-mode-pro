/* StandBy Mode Pro - Quick Calculator Widget
 *
 * FEATURE_PLAN.md C16: "Must not use eval() - implement a small shunting-yard
 * parser." That parser is js/core/calculator.js; this file is the keypad and
 * the display, nothing more.
 *
 * Why the keypad and not just a text field: this is a desk widget operated at
 * arm's length, often without a keyboard attached (kiosk and TV use are named
 * markets in COMPETITOR_MATRIX.md). A text-only calculator is unusable there.
 */

import { evaluate, tryEvaluate, formatResult, ExpressionError } from "../core/calculator.js";
import { escapeHtml } from "../core/escape.js";

const KEYS = [
  ["C", "(", ")", "back"],
  ["7", "8", "9", "/"],
  ["4", "5", "6", "*"],
  ["1", "2", "3", "-"],
  ["0", ".", "=", "+"]
];

const ACTIONS = ["C", "back", "="];

export const calculatorWidget = {
  name: "Calculator",
  icon: "calculator",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    /** The raw expression text, which may be mid-edit and not yet evaluable. */
    let expression = "";
    /** The last successful result, so "=" is idempotent rather than re-running. */
    let lastResult = null;
    /**
     * The last parse error. Held as state rather than written straight to the
     * DOM, because pressing "=" renders again immediately afterwards - writing
     * the message directly meant the very next render overwrote it with the
     * stale preview and the user saw "0" instead of what was wrong.
     */
    let lastError = null;

    const renderResult = () => {
      const resultEl = container.querySelector("#calc-result");
      const exprEl = container.querySelector("#calc-expr");
      if (!resultEl || !exprEl) return;

      exprEl.textContent = expression || "0";

      // An error set by "=" survives until the expression changes again.
      if (lastError && expression.trim() !== "") {
        resultEl.textContent = lastError;
        return;
      }

      if (expression.trim() === "") {
        resultEl.textContent = lastResult === null ? "0" : formatResult(lastResult);
        return;
      }

      // Live preview while typing, so the user sees the answer before pressing
      // "=". An in-progress expression simply shows its last good result.
      const preview = tryEvaluate(expression);
      resultEl.textContent = preview.ok ? formatResult(preview.value) : formatResult(lastResult ?? 0);
    };

    const render = () => {
      if (disposed) return;
      container.innerHTML = `
        <div class="calc-container">
          <div class="calc-display">
            <div class="calc-expr" id="calc-expr">0</div>
            <div class="calc-result" id="calc-result" role="status" aria-live="polite">0</div>
          </div>
          <div class="calc-pad" role="group" aria-label="Calculator keypad">
            ${KEYS.flat().map((key) => `
              <button type="button" class="calc-key calc-key--${
                ACTIONS.includes(key) ? "action" : "digit"
              }" data-key="${escapeHtml(key)}"
                aria-label="${escapeHtml(keyLabel(key))}">${escapeHtml(key)}</button>
            `).join("")}
          </div>
          ${!supportsKeyboardCapture() ? `
            <p class="calc-hint">Use the keypad above; typing is not captured here.</p>
          ` : ""}
        </div>`;

      container.querySelectorAll(".calc-key").forEach((btn) => {
        btn.addEventListener("click", () => press(btn.dataset.key));
      });

      renderResult();
    };

    const press = (key) => {
      switch (key) {
        case "C":
          expression = "";
          lastResult = null;
          lastError = null;
          break;
        case "back":
          expression = expression.slice(0, -1);
          lastError = null;
          break;
        case "=":
          commit();
          break;
        default:
          // Typing a new character means the user is fixing the expression, so
          // any previous error is stale.
          expression += key;
          lastError = null;
      }
      renderResult();
    };

    const commit = () => {
      try {
        lastResult = evaluate(expression);
        lastError = null;
        // Keep the expression visible rather than collapsing to the answer, so
        // the user can see what produced the number.
      } catch (err) {
        lastError = err instanceof ExpressionError ? err.message : "Could not read that";
      }
    };

    // Only capture keystrokes when focus is nowhere else, so the widget does not
    // swallow typing meant for another control on the page.
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const active = document.activeElement;
      if (active && active !== document.body && !container.contains(active)) return;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;

      if (event.key === "Enter" || event.key === "=") { event.preventDefault(); press("="); return; }
      if (event.key === "Backspace") { event.preventDefault(); press("back"); return; }
      if (event.key === "Escape") { event.preventDefault(); press("C"); return; }

      // "x" as a convenience for "*", which is what a desk user types.
      const normalised = event.key === "x" ? "*" : event.key;
      if (/^[0-9+\-*/.()^%]$/.test(normalised) && normalised.length === 1) {
        event.preventDefault();
        press(normalised);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    render();

    return {
      unmount() {
        disposed = true;
        document.removeEventListener("keydown", onKeyDown);
      }
    };
  }
};

function keyLabel(key) {
  if (key === "back") return "Delete last character";
  if (key === "C") return "Clear";
  if (key === "=") return "Equals";
  return key;
}

function supportsKeyboardCapture() {
  return typeof document !== "undefined";
}
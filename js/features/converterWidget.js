/* StandBy Mode Pro - Unit Converter Widget
 *
 * FEATURE_PLAN.md C15. C1's converter, as a self-contained desk utility.
 *
 * All arithmetic lives in js/core/units.js so it can be unit-tested without a
 * DOM, and so this file is only presentation.
 *
 * The input is a text field rather than a number input: a number input silently
 * discards non-numeric input, so typing "-" or "1e" leaves the user with a blank
 * box and no idea why. Here the raw text is kept and the result updates live.
 */

import { store } from "../state/store.js";
import { CATEGORIES, convert, unitsFor, formatValue, unitSymbol } from "../core/units.js";
import { escapeHtml } from "../core/escape.js";
import { parseNumericInput } from "../core/inputParse.js";

/** parseNumericInput lives in core/inputParse.js so it can be unit-tested
 *  without this file's store dependency. */

export const converterWidget = {
  name: "Unit Converter",
  icon: "repeat",
  category: "Utility",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;

    const prefs = () => store.getState().converter || { category: "length", fromUnit: "m", toUnit: "ft" };

    const render = () => {
      if (disposed) return;
      const { category, fromUnit, toUnit } = prefs();
      const group = CATEGORIES[category];

      if (!group) {
        container.innerHTML = `
          <div class="conv-container">
            <div class="conv-header">Converter</div>
            <div class="conv-error">Unknown category "${escapeHtml(String(category))}"</div>
          </div>`;
        return;
      }

      const units = unitsFor(category);
      const value = parseNumericInput(container.querySelector("#conv-input")?.value ?? "");

      const result = value === null
        ? "—"
        : formatValue(convert(category, value, fromUnit, toUnit), toUnit);
      const resultUnit = unitSymbol(category, toUnit);

      container.innerHTML = `
        <div class="conv-container">
          <div class="conv-header">Converter</div>

          <div class="conv-controls">
            <label class="visually-hidden" for="conv-category">Category</label>
            <select id="conv-category" class="conv-select">
              ${Object.entries(CATEGORIES).map(([id, def]) =>
                `<option value="${escapeHtml(id)}"${id === category ? " selected" : ""}>${escapeHtml(def.label)}</option>`
              ).join("")}
            </select>

            <label class="visually-hidden" for="conv-from">From unit</label>
            <select id="conv-from" class="conv-select">
              ${units.map(u => `<option value="${escapeHtml(u.id)}"${u.id === fromUnit ? " selected" : ""}>${escapeHtml(u.label)}</option>`).join("")}
            </select>

            <label class="visually-hidden" for="conv-to">To unit</label>
            <select id="conv-to" class="conv-select">
              ${units.map(u => `<option value="${escapeHtml(u.id)}"${u.id === toUnit ? " selected" : ""}>${escapeHtml(u.label)}</option>`).join("")}
            </select>
          </div>

          <label class="visually-hidden" for="conv-input">Value to convert</label>
          <input id="conv-input" class="conv-input" type="text" inputmode="decimal"
                 autocomplete="off" spellcheck="false" placeholder="Enter a value" />

          <div class="conv-result" id="conv-result" aria-live="polite">
            ${escapeHtml(result)}${resultUnit ? escapeHtml(resultUnit) : ""}
          </div>
        </div>`;

      // Preserve the typed value across a re-render, which the input event below
      // triggers on every keystroke.
      const input = container.querySelector("#conv-input");
      if (input) input.value = container.dataset.convValue ?? "";

      bindControls();
    };

    const bindControls = () => {
      const categoryEl = container.querySelector("#conv-category");
      const fromEl = container.querySelector("#conv-from");
      const toEl = container.querySelector("#conv-to");
      const inputEl = container.querySelector("#conv-input");

      // Changing category resets both units to that category's first and last
      // entry, because e.g. "ft" does not exist in the temperature category.
      categoryEl?.addEventListener("change", () => {
        const id = categoryEl.value;
        const units = unitsFor(id);
        if (!units.length) return;
        store.setConverterPrefs({
          category: id,
          fromUnit: units[0].id,
          toUnit: units[Math.min(1, units.length - 1)].id
        });
      });

      fromEl?.addEventListener("change", () => {
        store.setConverterPrefs({ fromUnit: fromEl.value });
      });

      toEl?.addEventListener("change", () => {
        store.setConverterPrefs({ toUnit: toEl.value });
      });

      inputEl?.addEventListener("input", () => {
        container.dataset.convValue = inputEl.value;
        updateResultOnly();
      });

      };

    /** Updates just the result line, so typing does not rebuild the controls. */
    const updateResultOnly = () => {
      const { category, fromUnit, toUnit } = prefs();
      const inputEl = container.querySelector("#conv-input");
      const resultEl = container.querySelector("#conv-result");
      if (!inputEl || !resultEl) return;

      const value = parseNumericInput(inputEl.value);
      const resultUnit = unitSymbol(category, toUnit);

      if (value === null) {
        resultEl.textContent = inputEl.value.trim() ? "Not a number" : "—";
        return;
      }
      resultEl.textContent = formatValue(convert(category, value, fromUnit, toUnit), toUnit) + resultUnit;
    };

    unsubscribeStore = store.subscribe((key) => {
      if (key === "converter_updated") render();
    });

    render();

    return {
      unmount() {
        disposed = true;
        if (unsubscribeStore) unsubscribeStore();
      }
    };
  }
};
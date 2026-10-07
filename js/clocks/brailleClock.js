/* Braille Clock
 *
 * FEATURE_PLAN.md A11. A genuinely accessible face: Braille reads without light,
 * which is the one display property no emissive screen can offer. Paired with the
 * C14 flashcards and H5 accessibility work for blind and low-vision users.
 */

import { toBraille } from "./_shared/numeralMap.js";

export const brailleClock = {
  name: "Braille",
  description: "Time in Braille cells, readable without light",
  category: "Accessibility",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper braille-wrapper">
        <div class="braille-cells" id="braille-cells" role="img" aria-label="Time in Braille"></div>
        <div class="braille-digital" id="braille-digital" aria-hidden="true"></div>
        ${!config.is24Hour ? `<div class="braille-ampm" id="braille-ampm"></div>` : ""}
        ${config.showDate ? `<div class="braille-date" id="braille-date"></div>` : ""}
        <p class="braille-hint">Raised cells read as Braille. The line below is the same time in digits.</p>
      </div>
    `;

    const cellsEl = container.querySelector("#braille-cells");
    const digitalEl = container.querySelector("#braille-digital");
    const ampmEl = container.querySelector("#braille-ampm");
    const dateEl = container.querySelector("#braille-date");

    const CELLS = 8; // HH:MM:SS

    // Build the cells once; only the glyph characters change on tick.
    cellsEl.innerHTML = Array.from({ length: CELLS }, (_, i) =>
      `<span class="braille-cell" data-cell="${i}">⠀</span>`
    ).join("");
    const cellEls = Array.from(cellsEl.querySelectorAll(".braille-cell"));

    let lastText = null;

    return {
      // Raw fields only. toBraille maps ASCII digits, so feeding it the engine's
      // numeral-converted strings would emit Devanagari characters into a
      // Braille cell and render nonsense dots.
      update({ now, rawHours, rawMinutes, rawSeconds, ampm, is24 }) {
        const hh = String(Number(rawHours) % (is24 ? 24 : 12) || (is24 ? 0 : 12)).padStart(2, "0");
        const mm = String(Number(rawMinutes)).padStart(2, "0");
        const ss = String(Number(rawSeconds)).padStart(2, "0");

        const text = config.showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;

        if (text !== lastText) {
          lastText = text;
          const chars = Array.from(text);
          cellEls.forEach((cell, i) => {
            const char = chars[i] === undefined ? " " : chars[i];
            cell.textContent = toBraille(char);
          });
          // The accessible name must carry the same information as the cells,
          // since a screen reader cannot interpret Braille glyphs.
          cellsEl.setAttribute("aria-label", `${hh}${is24 ? "" : " " + ampm} ${mm}`);
        }

        if (digitalEl) {
          digitalEl.textContent = text;
        }
        if (ampmEl) ampmEl.textContent = ampm;
        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
          });
        }
      },
      unmount() { cellsEl.innerHTML = ""; }
    };
  }
};
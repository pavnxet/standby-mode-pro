/* Dot-Matrix Split-Flap Clock
 *
 * FEATURE_PLAN.md A13. The same character-per-card idea as the departure board,
 * rendered as a 5x7 LED matrix per character using the shared dot-matrix glyph
 * table, so it reads as hardware rather than text.
 */

import { dotMatrixGrid } from "./_shared/primitives.js";

export const dotMatrixClock = {
  name: "Dot Matrix",
  description: "5x7 LED matrix per character, Solari-style split-flap motion",
  category: "Digital",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper dotmatrix-wrapper">
        <div class="dotmatrix-clock" id="dotmatrix-clock" role="img" aria-label="Time"></div>
        ${!config.is24Hour ? `<div class="dotmatrix-ampm" id="dotmatrix-ampm"></div>` : ""}
        ${config.showDate ? `<div class="dotmatrix-date" id="dotmatrix-date"></div>` : ""}
      </div>
    `;

    const clockEl = container.querySelector("#dotmatrix-clock");
    const ampmEl = container.querySelector("#dotmatrix-ampm");
    const dateEl = container.querySelector("#dotmatrix-date");

    // Fixed at mount: every cell uses the same cell size and gap, so these are
    // module constants rather than per-tick options objects.
    const MATRIX_OPTIONS = { cell: 7, gap: 2, charGap: 8 };
    const charCells = [];

    let lastText = null;

    return {
      // The glyph table is Latin-only, so this face renders ASCII digits built from
      // the raw fields rather than the engine's numeral-converted strings. That
      // is a deliberate constraint of a 5x7 LED matrix, not an oversight.
      update({ now, rawHours, rawMinutes, rawSeconds, ampm, is24 }) {
        const hour12 = Number(rawHours) % 12 || 12;
        const hh = String(is24 ? Number(rawHours) : hour12).padStart(2, "0");
        const mm = String(Number(rawMinutes)).padStart(2, "0");
        const ss = String(Number(rawSeconds)).padStart(2, "0");

        const text = config.showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;

        if (text !== lastText) {
          const previous = lastText;
          lastText = text;
          clockEl.setAttribute("aria-label", text.replace(/:/g, " "));

          // Only re-render the characters that actually changed. Rebuilding all
          // 5-8 SVGs every second was the obvious implementation and the wrong
          // one: it is ~200 detached nodes per tick for a display that changes
          // one cell most of the time.
          if (previous === null || previous.length !== text.length) {
            clockEl.innerHTML = Array.from(text).map(char =>
              `<span class="dotmatrix-char ${char === ":" ? "dotmatrix-char--colon" : ""}">${dotMatrixGrid(char, MATRIX_OPTIONS)}</span>`
            ).join("");
            charCells.length = 0;
            clockEl.querySelectorAll(".dotmatrix-char").forEach(el => charCells.push(el));
          } else {
            Array.from(text).forEach((char, i) => {
              if (previous[i] === char) return;
              const cell = charCells[i];
              if (cell) cell.innerHTML = dotMatrixGrid(char, MATRIX_OPTIONS);
            });
          }
        }

        if (ampmEl) ampmEl.textContent = ampm;
        if (dateEl) {
          dateEl.textContent = now
            .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
            .toUpperCase();
        }
      },
      unmount() { clockEl.innerHTML = ""; }
    };
  }
};


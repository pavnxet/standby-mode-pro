/* Split-Flap Departure Board
 *
 * FEATURE_PLAN.md A12. A transport-terminal aesthetic applied to the clock: each
 * character on its own hinged card. Built on the same flip physics as the
 * existing Retro 3D face rather than re-implementing it.
 */

const CHARS = "0123456789:";

export const departureBoardClock = {
  name: "Departure Board",
  description: "Split-flap character cards in a transport-terminal layout",
  category: "Retro",

  mount(container, config) {
    const text = config.showSeconds ? "00:00:00" : "00:00";

    container.innerHTML = `
      <div class="clock-display-wrapper departure-wrapper">
        <div class="departure-board" id="departure-board" role="img" aria-label="Flip clock"></div>
        ${config.showDate ? `<div class="departure-date" id="departure-date"></div>` : ""}
      </div>
    `;

    const boardEl = container.querySelector("#departure-board");
    const dateEl = container.querySelector("#departure-date");

    boardEl.innerHTML = Array.from(text).map((char, i) => {
      const isColon = char === ":";
      return `
        <div class="departure-cell ${isColon ? "departure-cell--colon" : ""}" data-index="${i}">
          <span class="departure-char" data-value="${CHARS.indexOf(char) >= 0 ? char : " "}">${isColon ? ":" : char}</span>
        </div>
      `;
    }).join("");

    const cells = Array.from(boardEl.querySelectorAll(".departure-cell"));

    const setChar = (index, char) => {
      const cell = cells[index];
      if (!cell) return;
      const holder = cell.querySelector(".departure-char");
      if (holder.textContent === char) return;

      // The character is written SYNCHRONOUSLY and the animation is layered on
      // top via a class. The previous version deferred the text swap into a
      // requestAnimationFrame callback, which meant the board stayed on its
      // initial "00:00:00" whenever rAF never ran - a hidden or background tab,
      // and any environment that throttles it. Correctness must not depend on
      // an animation frame arriving.
      holder.textContent = char;

      // Restart the CSS animation on every change by removing the class, forcing
      // a reflow, then re-adding it. Without the reflow a repeated flip on the
      // same card would not re-trigger.
      holder.classList.remove("departure-char--flipping");
      void holder.offsetWidth;
      holder.classList.add("departure-char--flipping");
    };

    const clearFlips = () => {
      for (const cell of cells) {
        cell.querySelector(".departure-char")?.classList.remove("departure-char--flipping");
      }
    };

    return {
      // Raw fields: the board's card set is 0-9 plus ":", so it renders ASCII
      // digits directly rather than the engine's numeral-converted strings.
      update({ rawHours, rawMinutes, rawSeconds, is24, now }) {
        const hour12 = Number(rawHours) % 12 || 12;
        const hh = String(is24 ? Number(rawHours) : hour12).padStart(2, "0");
        const mm = String(Number(rawMinutes)).padStart(2, "0");
        const ss = String(Number(rawSeconds)).padStart(2, "0");

        let idx = 0;
        setChar(idx++, hh[0]);
        setChar(idx++, hh[1]);
        setChar(idx++, ":");
        setChar(idx++, mm[0]);
        setChar(idx++, mm[1]);
        if (config.showSeconds) {
          setChar(idx++, ":");
          setChar(idx++, ss[0]);
          setChar(idx++, ss[1]);
        }

        if (dateEl) {
          dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric"
          }).toUpperCase();
        }
      },
      unmount() {
        clearFlips();
        boardEl.innerHTML = "";
      }
    };
  }
};
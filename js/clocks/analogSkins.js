/* Analog Skins Suite — 4 faces sharing one dial renderer
 *
 * FEATURE_PLAN.md A5. We ship exactly one analog face against a competitor with
 * 27 colour options. These four cover the common tastes without four copies of
 * the same SVG code, thanks to js/clocks/_shared/primitives.js.
 *
 * All four are registered under distinct ids and share `createAnalogClock`.
 */

import {
  analogDialSvg,
  handAngles,
  handPath
} from "./_shared/primitives.js";

/**
 * @param {object} skin
 * @param {string} skin.name
 * @param {string} skin.description
 * @param {string} skin.category
 * @param {'arabic'|'roman'} skin.numerals
 * @param {boolean} skin.sweepSeconds Continuous second hand.
 * @param {boolean} skin.minimal Hides the numerals.
 */
export function createAnalogClock(skin) {
  return {
    name: skin.name,
    description: skin.description,
    category: skin.category,

    mount(container, config) {
      const size = 280;

      container.innerHTML = `
        <div class="clock-display-wrapper analog-wrapper analog-skin--${skin.id}">
          <div class="analog-stage" id="analog-stage">
            ${analogDialSvg({ size, style: skin.numerals })}
          </div>
          ${!config.is24Hour ? `<div class="analog-ampm" id="analog-ampm"></div>` : ""}
          ${config.showDate ? `<div class="analog-date" id="analog-date"></div>` : ""}
        </div>
      `;

      const svg = container.querySelector("#analog-stage svg");
      const hourHand = svg.querySelector(".dial-hand--hour");
      const minuteHand = svg.querySelector(".dial-hand--minute");
      const secondHand = svg.querySelector(".dial-hand--second");
      const ampmEl = container.querySelector("#analog-ampm");
      const dateEl = container.querySelector("#analog-date");

      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.42;

      if (skin.minimal) {
        svg.querySelector(".dial-numerals")?.remove();
      }

      return {
        // raw* only. The formatted `hours`/`minutes`/`seconds` have already been run
        // through the numeral engine, so under Devanagari or Persian digits
        // Number() yields NaN and every hand would collapse to 12 o'clock.
        update({ rawHours, rawMinutes, rawSeconds, ampm, now }) {
          const angles = handAngles({
            hours: Number(rawHours),
            minutes: Number(rawMinutes),
            seconds: Number(rawSeconds)
          });

          hourHand.setAttribute("d", handPath(cx, cy, radius * 0.55, "hour", angles.hour));
          minuteHand.setAttribute("d", handPath(cx, cy, radius * 0.82, "minute", angles.minute));

          if (config.showSeconds) {
            // A sweep second hand reads as a mechanical movement; a stepped one
            // reads as a quartz watch. Both are legitimate, so it is a skin choice.
            const secondAngle = skin.sweepSeconds
              ? angles.second
              : Math.floor(Number(rawSeconds)) * 6;
            secondHand.setAttribute("d", handPath(cx, cy, radius * 0.9, "second", secondAngle));
            // A class rather than .hidden: SVGElement has no `hidden` IDL
            // attribute, so the property would be silently ignored.
            secondHand.classList.remove("dial-hand--hidden");
          } else {
            secondHand.classList.add("dial-hand--hidden");
          }

          if (ampmEl) ampmEl.textContent = ampm;
          if (dateEl) {
            dateEl.textContent = now.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric"
            });
          }
        },
        unmount() {}
      };
    }
  };
}

export const classicAnalogClock = createAnalogClock({
  id: "classic",
  name: "Classic Analog",
  description: "Traditional roman-numeral railway dial with a sweeping second hand",
  category: "Classic",
  numerals: "roman",
  sweepSeconds: true,
  minimal: false
});

export const sportAnalogClock = createAnalogClock({
  id: "sport",
  name: "Sport Analog",
  description: "High-contrast chronograph dial with a stepped second hand",
  category: "Sport",
  numerals: "arabic",
  sweepSeconds: false,
  minimal: false
});

export const minimalAnalogClock = createAnalogClock({
  id: "minimal",
  name: "Minimal Analog",
  description: "Numeral-free dial reduced to three hands on a hairline face",
  category: "Minimal",
  numerals: "arabic",
  sweepSeconds: false,
  minimal: true
});

export const vintageAnalogClock = createAnalogClock({
  id: "vintage",
  name: "Vintage Analog",
  description: "Cream patinated face with arabic numerals and a counterweight tail",
  category: "Classic",
  numerals: "arabic",
  sweepSeconds: false,
  minimal: false
});
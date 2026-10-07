/* Word Clock — "It is half past nine"
 *
 * FEATURE_PLAN.md A2. Inspired by StandBy Mode Pro (Android), which ships a word
 * clock, and by the MagicMirror MMM-text-clock module.
 *
 * Reading a word clock from across a room is far easier than reading digits,
 * which makes it a genuinely different display mode rather than a variation.
 */

import { wordsFor } from "./_shared/words.js";

export const wordClock = {
  name: "Word Clock",
  description: "Reads the time aloud in words, legible from across a room",
  category: "Classic",

  mount(container, config) {
    container.innerHTML = `
      <div class="clock-display-wrapper word-clock-wrapper">
        <div class="word-clock" id="word-clock-main" role="img" aria-label="Current time in words">
          <span class="word-clock__lead">It is</span>
          <span class="word-clock__phrase" id="word-clock-phrase">…</span>
          ${config.is24Hour ? "" : `<span class="word-clock__ampm" id="word-clock-ampm"></span>`}
        </div>
        ${config.showDate ? `<div class="word-clock__date" id="word-clock-date"></div>` : ""}
      </div>
    `;

    const phraseEl = container.querySelector("#word-clock-phrase");
    const ampmEl = container.querySelector("#word-clock-ampm");
    const dateEl = container.querySelector("#word-clock-date");
    let lastPhrase = "";

    return {
      update({ now, rawHours, rawMinutes, is24, ampm }) {
        const phrase = wordsFor({ hours: rawHours, minutes: rawMinutes, is24 });

        if (phrase !== lastPhrase) {
          lastPhrase = phrase;
          phraseEl.textContent = phrase;
          // aria-live is deliberately off: this face repaints on every minute
          // and a live region would interrupt a screen reader mid-sentence.
          // The label is updated instead so the time is available on demand.
          container.querySelector("#word-clock-main")
            .setAttribute("aria-label", `It is ${phrase}${is24 ? "" : " " + ampm}`);
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
      unmount() {}
    };
  }
};
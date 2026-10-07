/* StandBy Mode Pro - Notes / Sticky Widget
 *
 * FEATURE_PLAN.md C4. Competitive evidence: Dashy issue #636 ("Taking Notes on
 * Dashy Startpage") has been open since 2022 with 11 comments.
 *
 * Text is written with textContent / value only, never innerHTML, so a note
 * containing markup is inert by construction (AUDIT S2 lesson applied).
 */

import { store } from "../state/store.js";

const MAX_NOTE_LENGTH = 2000;

export const noteWidget = {
  name: "Notes",
  icon: "note",
  category: "Utility",
  size: "medium",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribe = null;

    const render = () => {
      if (disposed) return;
      const note = store.getState().note || "";
      const count = note.length;

      container.innerHTML = `
        <div class="note-container">
          <label for="note-body" class="sr-only">Note text</label>
          <textarea id="note-body" class="note-input" rows="6" maxlength="${MAX_NOTE_LENGTH}"
            placeholder="Jot something down…">${escapeText(note)}</textarea>
          <div class="note-footer">
            <span class="note-count">${count}/${MAX_NOTE_LENGTH}</span>
            <span class="note-status" id="note-status" aria-live="polite"></span>
          </div>
        </div>
      `;

      const input = container.querySelector("#note-body");
      const status = container.querySelector("#note-status");

      input.addEventListener("input", () => {
        const value = input.value.slice(0, MAX_NOTE_LENGTH);
        store.setNote(value);
        const counter = container.querySelector(".note-count");
        if (counter) counter.textContent = `${value.length}/${MAX_NOTE_LENGTH}`;
      });

      // Persist on blur rather than on every keystroke. store.notify() writes
      // the entire state to localStorage, so typing directly would serialise
      // the whole app state on every character (AUDIT M4).
      input.addEventListener("blur", () => {
        status.textContent = "Saved";
        setTimeout(() => {
          if (!disposed && status) status.textContent = "";
        }, 1600);
      });
    };

    unsubscribe = store.subscribe((event) => {
      if (event === "note_updated") {
        const input = container.querySelector("#note-body");
        // Never clobber what the user is actively typing.
        if (input && document.activeElement === input) return;
        render();
      }
    });

    render();

    return {
      unmount() {
        disposed = true;
        if (unsubscribe) unsubscribe();
      }
    };
  }
};

/** Escapes only the characters that matter inside a textarea's text content. */
function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
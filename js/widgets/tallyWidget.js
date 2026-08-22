/* Tally Counter Widget */
import { store } from "../state/store.js";
import { soundEngine } from "../engines/soundEngine.js";

export const tallyWidget = {
  name: "Tally Counter",
  icon: "hash",

  mount(container) {
    let key = "focusSessions";

    const render = () => {
      const tallies = store.getState().tallies || {};
      const count = tallies[key] || 0;

      container.innerHTML = `
        <div class="tally-container">
          <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Session Reps / Count</div>
          <div class="tally-number" id="tally-val">${count}</div>

          <div class="flex items-center gap-3">
            <button class="btn-icon" id="tally-dec" aria-label="Decrease">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>

            <button class="btn-primary flex items-center justify-center w-14 h-14 rounded-2xl text-2xl font-bold" id="tally-inc" aria-label="Count +1">
              +1
            </button>

            <button class="btn-icon" id="tally-res" aria-label="Reset">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>
        </div>
      `;

      container.querySelector("#tally-inc").addEventListener("click", () => {
        store.incrementTally(key, 1);
        soundEngine.playFlipTick();
        render();
      });

      container.querySelector("#tally-dec").addEventListener("click", () => {
        if (count > 0) {
          store.incrementTally(key, -1);
          render();
        }
      });

      container.querySelector("#tally-res").addEventListener("click", () => {
        store.resetTally(key);
        render();
      });
    };

    render();

    return {
      unmount() {}
    };
  }
};

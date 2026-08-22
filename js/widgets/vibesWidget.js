import { store } from "../state/store.js";
import { soundEngine } from "../engines/soundEngine.js";

export const vibesWidget = {
  name: "Vibes & Atmosphere",
  icon: "sparkles",
  mount(container) {
    const vibesList = [
      { id: "rain", name: "Rain & Thunder", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>` },
      { id: "waves", name: "Ocean Waves", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>` },
      { id: "fire", name: "Campfire Glow", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>` },
      { id: "binaural", name: "Binaural Lo-Fi", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>` },
      { id: "none", name: "Mute Ambience", svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>` }
    ];

    const render = () => {
      const active = store.getState().vibes.activeTrack;
      container.innerHTML = `
        <div class="flex flex-col w-full h-full justify-between">
          <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Select Focus Atmosphere</div>
          <div class="grid grid-cols-2 gap-2 flex-1">
            ${vibesList.map(v => `
              <button class="flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold transition-all ${active === v.id ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10"}" data-vibe="${v.id}">
                <span class="text-blue-400">${v.svg}</span>
                <span>${v.name}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `;

      container.querySelectorAll("[data-vibe]").forEach(btn => {
        btn.addEventListener("click", () => {
          const vid = btn.getAttribute("data-vibe");
          store.setVibe(vid);
          soundEngine.playAmbient(vid);
          render();
        });
      });
    };

    render();
    return { unmount() {} };
  }
};

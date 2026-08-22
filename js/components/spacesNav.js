import { store } from '../state/store.js';
import { soundEngine } from '../engines/soundEngine.js';

export class SpacesNav {
  constructor(containerElement) {
    this.container = containerElement;
    if (!this.container) return;
    this.render();
    store.subscribe((event) => {
      if (event === "space_changed" || event === "space_updated") {
        this.render();
      }
    });
  }

  getIconSvg(iconName) {
    if (iconName === "home") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    }
    if (iconName === "briefcase") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
    }
    if (iconName === "target") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  }

  render() {
    const state = store.getState();
    const activeSpaceId = state.activeSpaceId;
    const spaces = Object.values(state.spaces);

    this.container.innerHTML = `
      <div class="flex items-center gap-1.5 p-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
        ${spaces.map(s => `
          <button class="glass-pill px-3.5 py-1.5 text-xs font-semibold flex items-center gap-2 transition-all ${s.id === activeSpaceId ? "active text-white font-bold" : "text-neutral-400 hover:text-white"}" data-space-id="${s.id}">
            <span class="opacity-80">${this.getIconSvg(s.icon)}</span>
            <span>${s.name}</span>
          </button>
        `).join("")}
      </div>
    `;

    this.container.querySelectorAll("[data-space-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const spaceId = btn.getAttribute("data-space-id");
        store.setActiveSpace(spaceId);
        soundEngine.playFlipTick();
      });
    });
  }
}

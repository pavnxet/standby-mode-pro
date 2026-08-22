/* Smart Photo Frame Upload & Wallpaper Manager Modal */
import { photoDB } from "../state/db.js";
import { store } from "../state/store.js";
import { soundEngine } from "../engines/soundEngine.js";

const presetWallpapers = [
  { id: "p1", title: "Cyberpunk City", url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&q=80" },
  { id: "p2", title: "Starry Alpine", url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&q=80" },
  { id: "p3", title: "Misty Forest", url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1600&q=80" },
  { id: "p4", title: "Cosmic Nebula", url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=80" }
];

export class PhotoModal {
  constructor() {
    this.modalEl = document.getElementById("photo-modal");
    this.init();
  }

  init() {
    const openBtn = document.getElementById("btn-photos");
    const closeBtn = document.getElementById("btn-close-photo-modal");

    if (openBtn) openBtn.addEventListener("click", () => this.open());
    if (closeBtn) closeBtn.addEventListener("click", () => this.close());

    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }
  }

  open() {
    this.render();
    if (this.modalEl) this.modalEl.classList.add("open");
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove("open");
  }

  async render() {
    const content = document.getElementById("photo-modal-content");
    if (!content) return;

    const photos = await photoDB.getAllPhotos();
    const wp = store.getState().wallpaper || { enabled: false, activeUrl: "", blur: 6, dim: 0.5 };

    content.innerHTML = `
      <div class="space-y-5 text-sm text-neutral-200">
        
        <!-- Wallpaper Background Master Controls -->
        <div class="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="text-sm font-bold text-white">Ambient Wallpaper Background</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full ${wp.enabled && wp.activeUrl ? "bg-emerald-500/20 text-emerald-400 font-bold" : "bg-white/10 text-neutral-400"} font-mono">
                ${wp.enabled && wp.activeUrl ? "Active 🖼️" : "OLED Black"}
              </span>
            </div>
            ${wp.enabled && wp.activeUrl ? `
              <button id="btn-clear-wallpaper" class="px-3 py-1 text-xs rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300 font-semibold transition-colors flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear Background
              </button>
            ` : ""}
          </div>

          <!-- Blur & Dim Sliders -->
          ${wp.enabled && wp.activeUrl ? `
            <div class="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
              <div>
                <div class="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Blur Intensity</span>
                  <span class="font-mono text-blue-400 font-bold" id="blur-val-text">${wp.blur || 0}px</span>
                </div>
                <input type="range" min="0" max="25" step="1" id="range-wp-blur" value="${wp.blur || 6}" class="w-full accent-blue-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer" />
              </div>
              <div>
                <div class="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Background Dim</span>
                  <span class="font-mono text-blue-400 font-bold" id="dim-val-text">${Math.round((wp.dim || 0.5) * 100)}%</span>
                </div>
                <input type="range" min="0.1" max="0.85" step="0.05" id="range-wp-dim" value="${wp.dim || 0.5}" class="w-full accent-blue-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer" />
              </div>
            </div>
          ` : ""}
        </div>

        <!-- Upload Box -->
        <div>
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Upload Your Own Image</label>
          <div class="flex items-center gap-3">
            <input type="file" id="photo-file-input" accept="image/*" class="w-full text-xs text-neutral-400 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer bg-neutral-900 border border-white/10 rounded-xl p-2" />
          </div>
          <p class="text-[11px] text-neutral-500 mt-1.5">Supported: JPG, PNG, WebP, GIF. Saved locally & securely on your device.</p>
        </div>

        <!-- User Gallery -->
        ${photos.length > 0 ? `
          <div class="pt-3 border-t border-white/10">
            <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Your Uploaded Photos (${photos.length})</label>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-48 overflow-y-auto pr-1">
              ${photos.map(p => `
                <div class="relative group rounded-xl overflow-hidden aspect-video border ${wp.activeUrl === p.dataUrl ? "border-blue-500 ring-2 ring-blue-500/50" : "border-white/10"} cursor-pointer bg-neutral-900" data-apply-wp="${p.dataUrl}">
                  <img src="${p.dataUrl}" alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ${wp.activeUrl === p.dataUrl ? `
                    <div class="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
                      Active
                    </div>
                  ` : `
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span class="text-xs font-bold text-white bg-blue-600 px-2.5 py-1 rounded-lg shadow-lg">Set Wallpaper</span>
                    </div>
                  `}
                  <button class="absolute top-1.5 right-1.5 bg-red-600/90 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 shadow-md" data-del-photo="${p.id}" title="Delete Photo">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <!-- Preset High-Res Wallpapers -->
        <div class="pt-3 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Preset Aesthetic Wallpapers</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            ${presetWallpapers.map(p => `
              <div class="relative group rounded-xl overflow-hidden aspect-video border ${wp.activeUrl === p.url ? "border-blue-500 ring-2 ring-blue-500/50" : "border-white/10"} cursor-pointer bg-neutral-900" data-apply-wp="${p.url}">
                <img src="${p.url}" alt="${p.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] font-semibold text-white truncate text-center">
                  ${p.title}
                </div>
                ${wp.activeUrl === p.url ? `
                  <div class="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    Active
                  </div>
                ` : ""}
              </div>
            `).join("")}
          </div>
        </div>

      </div>
    `;

    // Listeners
    const fileInput = content.querySelector("#photo-file-input");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = reader.result;
            await photoDB.addPhoto(dataUrl, file.name);
            store.setWallpaper(dataUrl);
            soundEngine.playFlipTick();
            this.render();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Set Wallpaper click
    content.querySelectorAll("[data-apply-wp]").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-del-photo]")) return;
        const url = card.getAttribute("data-apply-wp");
        store.setWallpaper(url);
        soundEngine.playFlipTick();
        this.render();
      });
    });

    // Clear Wallpaper
    const btnClear = content.querySelector("#btn-clear-wallpaper");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        store.clearWallpaper();
        soundEngine.playFlipTick();
        this.render();
      });
    }

    // Blur & Dim Sliders
    const rangeBlur = content.querySelector("#range-wp-blur");
    const textBlur = content.querySelector("#blur-val-text");
    if (rangeBlur) {
      rangeBlur.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        if (textBlur) textBlur.textContent = `${val}px`;
        store.updateWallpaperSettings({ blur: val });
      });
    }

    const rangeDim = content.querySelector("#range-wp-dim");
    const textDim = content.querySelector("#dim-val-text");
    if (rangeDim) {
      rangeDim.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        if (textDim) textDim.textContent = `${Math.round(val * 100)}%`;
        store.updateWallpaperSettings({ dim: val });
      });
    }

    // Delete photo
    content.querySelectorAll("[data-del-photo]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute("data-del-photo"));
        await photoDB.deletePhoto(id);
        this.render();
      });
    });
  }
}

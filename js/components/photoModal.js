/* Smart Photo Frame Upload & Gallery Modal */
import { photoDB } from "../state/db.js";

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

    content.innerHTML = `
      <div class="space-y-4 text-sm text-neutral-200">
        <div>
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Upload Custom Image</label>
          <input type="file" id="photo-file-input" accept="image/*" class="w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer" />
        </div>

        <div class="pt-4 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Your Photo Gallery (${photos.length})</label>
          <div class="grid grid-cols-3 gap-2.5 max-h-56 overflow-y-auto">
            ${photos.length === 0 ? `
              <div class="col-span-3 text-center py-6 text-neutral-500 text-xs">No custom photos yet. Using preset scenery.</div>
            ` : photos.map(p => `
              <div class="relative group rounded-xl overflow-hidden aspect-video border border-white/10">
                <img src="${p.dataUrl}" alt="${p.title}" class="w-full h-full object-cover" />
                <button class="absolute top-1 right-1 bg-red-600/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" data-del-photo="${p.id}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    // File upload
    const input = content.querySelector("#photo-file-input");
    if (input) {
      input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async () => {
            await photoDB.addPhoto(reader.result, file.name);
            this.render();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Delete photo
    content.querySelectorAll("[data-del-photo]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-del-photo"));
        await photoDB.deletePhoto(id);
        this.render();
      });
    });
  }
}

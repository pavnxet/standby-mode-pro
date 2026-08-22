import { store } from '../state/store.js';
import { clockEngine } from '../engines/clockEngine.js';
import { widgetEngine } from '../engines/widgetEngine.js';

export class CustomizeModal {
  constructor() {
    this.modalEl = document.getElementById("customize-modal");
    this.contentEl = document.getElementById("customize-modal-content");
    this.openBtn = document.getElementById("btn-customize");
    this.closeBtn = document.getElementById("btn-close-customize");

    this.initEvents();
  }

  initEvents() {
    if (this.openBtn) this.openBtn.addEventListener("click", () => this.open());
    if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.close());
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

  render() {
    if (!this.contentEl) return;
    const state = store.getState();
    const activeSpace = store.getActiveSpace();
    const pomo = state.pomoState;
    const clockList = clockEngine.getClockList();
    const widgetList = widgetEngine.getWidgetList();

    this.contentEl.innerHTML = `
      <div class="space-y-6 text-sm text-neutral-200">
        
        <!-- Layout Selection -->
        <div>
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Dashboard Layout</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "standalone" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="standalone">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="3"/><circle cx="12" cy="12" r="4"/></svg>
              <span class="text-xs">Clock Only</span>
            </button>
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "focus" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="focus">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
              <span class="text-xs">Pomodoro Focus</span>
            </button>
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "duo" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="duo">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="3"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
              <span class="text-xs">Duo Split</span>
            </button>
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "quad" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="quad">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="3"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
              <span class="text-xs">Quad Grid</span>
            </button>
          </div>
        </div>

        <!-- Clock Face Theme (Applied to Clock & Focus Pomodoro) -->
        <div>
          <div class="flex items-center justify-between mb-2.5">
            <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider">Clock & Pomodoro Theme</label>
            <span class="text-[10px] text-blue-400 font-mono">Syncs with Live Corner Clock</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
            ${clockList.map(c => `
              <button class="p-2.5 rounded-xl border text-left transition-all ${activeSpace.clockId === c.id ? "bg-blue-600/30 border-blue-500 text-white shadow-md" : "bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10"}" data-set-clock="${c.id}">
                <div class="font-bold text-xs text-white">${c.name}</div>
                <div class="text-[10px] text-neutral-400 truncate mt-0.5">${c.category}</div>
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Pomodoro Focus Configuration Settings -->
        <div class="pt-4 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Pomodoro Timers & Intervals</label>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div class="p-3 bg-white/5 rounded-xl border border-white/5">
              <label class="text-[11px] text-neutral-400 block mb-1">Focus (min)</label>
              <input type="number" min="5" max="120" id="input-pomo-focus" value="${pomo.settings.focusDuration}" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-sm text-white font-mono text-center font-bold" />
            </div>
            <div class="p-3 bg-white/5 rounded-xl border border-white/5">
              <label class="text-[11px] text-neutral-400 block mb-1">Short Break</label>
              <input type="number" min="1" max="30" id="input-pomo-short" value="${pomo.settings.shortBreakDuration}" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-sm text-white font-mono text-center font-bold" />
            </div>
            <div class="p-3 bg-white/5 rounded-xl border border-white/5">
              <label class="text-[11px] text-neutral-400 block mb-1">Long Break</label>
              <input type="number" min="5" max="60" id="input-pomo-long" value="${pomo.settings.longBreakDuration}" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-sm text-white font-mono text-center font-bold" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-auto-breaks" ${pomo.settings.autoStartBreaks ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Auto-start Breaks</span>
            </label>
            <label class="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-auto-pomo" ${pomo.settings.autoStartPomo ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Auto-start Focus</span>
            </label>
          </div>
        </div>

        <!-- Clock Behavior -->
        <div class="pt-4 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Clock & Sound Behavior</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label class="flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-24h" ${state.clockConfig.is24Hour ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">24-Hour Format</span>
            </label>
            <label class="flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-seconds" ${state.clockConfig.showSeconds ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Show Seconds</span>
            </label>
            <label class="flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
              <input type="checkbox" id="chk-tick" ${state.clockConfig.tickSound ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Tick Audio</span>
            </label>
          </div>
        </div>

        <!-- Duo Mode Widgets -->
        ${activeSpace.layout === "duo" ? `
          <div class="pt-4 border-t border-white/10">
            <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Duo Mode Widgets</label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <span class="text-[11px] text-neutral-400 block mb-1">Left Panel</span>
                <select id="select-duo-w1" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white">
                  <option value="clock" ${activeSpace.widgets[0] === "clock" ? "selected" : ""}>Main Clock</option>
                  ${widgetList.map(w => `<option value="${w.id}" ${activeSpace.widgets[0] === w.id ? "selected" : ""}>${w.name}</option>`).join("")}
                </select>
              </div>
              <div>
                <span class="text-[11px] text-neutral-400 block mb-1">Right Panel</span>
                <select id="select-duo-w2" class="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white">
                  ${widgetList.map(w => `<option value="${w.id}" ${activeSpace.widgets[1] === w.id ? "selected" : ""}>${w.name}</option>`).join("")}
                  <option value="clock" ${activeSpace.widgets[1] === "clock" ? "selected" : ""}>Main Clock</option>
                </select>
              </div>
            </div>
          </div>
        ` : ""}

      </div>
    `;

    // Event Listeners
    this.contentEl.querySelectorAll("[data-set-layout]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.setLayout(btn.getAttribute("data-set-layout"));
        this.render();
      });
    });

    this.contentEl.querySelectorAll("[data-set-clock]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.setClock(btn.getAttribute("data-set-clock"));
        this.render();
      });
    });

    // Pomo inputs
    const inFocus = this.contentEl.querySelector("#input-pomo-focus");
    const inShort = this.contentEl.querySelector("#input-pomo-short");
    const inLong = this.contentEl.querySelector("#input-pomo-long");
    const chkAutoBreaks = this.contentEl.querySelector("#chk-auto-breaks");
    const chkAutoPomo = this.contentEl.querySelector("#chk-auto-pomo");

    const savePomo = () => {
      store.updatePomoSettings({
        focusDuration: parseInt(inFocus.value, 10) || 25,
        shortBreakDuration: parseInt(inShort.value, 10) || 5,
        longBreakDuration: parseInt(inLong.value, 10) || 15,
        autoStartBreaks: chkAutoBreaks.checked,
        autoStartPomo: chkAutoPomo.checked
      });
    };

    if (inFocus) inFocus.addEventListener("change", savePomo);
    if (inShort) inShort.addEventListener("change", savePomo);
    if (inLong) inLong.addEventListener("change", savePomo);
    if (chkAutoBreaks) chkAutoBreaks.addEventListener("change", savePomo);
    if (chkAutoPomo) chkAutoPomo.addEventListener("change", savePomo);

    const chk24 = this.contentEl.querySelector("#chk-24h");
    if (chk24) chk24.addEventListener("change", (e) => store.updateClockConfig({ is24Hour: e.target.checked }));
    const chkSec = this.contentEl.querySelector("#chk-seconds");
    if (chkSec) chkSec.addEventListener("change", (e) => store.updateClockConfig({ showSeconds: e.target.checked }));
    const chkTick = this.contentEl.querySelector("#chk-tick");
    if (chkTick) chkTick.addEventListener("change", (e) => store.updateClockConfig({ tickSound: e.target.checked }));

    const selW1 = this.contentEl.querySelector("#select-duo-w1");
    const selW2 = this.contentEl.querySelector("#select-duo-w2");
    if (selW1 && selW2) {
      const upd = () => store.setWidgets([selW1.value, selW2.value]);
      selW1.addEventListener("change", upd);
      selW2.addEventListener("change", upd);
    }
  }
}

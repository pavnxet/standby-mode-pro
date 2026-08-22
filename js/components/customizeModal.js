/* StandBy Mode Pro - Customization & Settings Modal */
import { store } from "../state/store.js";
import { clockEngine } from "../engines/clockEngine.js";
import { widgetEngine } from "../engines/widgetEngine.js";
import { soundEngine } from "../engines/soundEngine.js";
import { wakeLockEngine } from "../engines/wakeLockEngine.js";

export class CustomizeModal {
  constructor() {
    this.modalEl = document.getElementById("customize-modal");
    this.contentEl = document.getElementById("customize-modal-content");
    this.init();
  }

  init() {
    const openBtn = document.getElementById("btn-customize");
    const closeBtn = document.getElementById("btn-close-customize");

    if (openBtn) openBtn.addEventListener("click", () => this.open());
    if (closeBtn) closeBtn.addEventListener("click", () => this.close());

    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }

    // Only re-render full modal when space itself changes, NOT during active slider drag
    store.subscribe((event) => {
      if (
        (event === "space_changed" || event === "space_updated") &&
        this.modalEl &&
        this.modalEl.classList.contains("open")
      ) {
        this.render();
      }
    });
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
    const clockList = clockEngine.getClockList();
    const widgetList = widgetEngine.getWidgetList();
    const pomo = state.pomoState;
    const isWakeLocked = wakeLockEngine.isActive();
    const currentTickVol = state.clockConfig.tickVolume !== undefined ? state.clockConfig.tickVolume : 0.75;
    const tickPercent = Math.round(currentTickVol * 100);

    this.contentEl.innerHTML = `
      <div class="space-y-6 text-sm text-neutral-200">
        
        <!-- Screen Wake Lock Toggle -->
        <div class="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            </div>
            <div>
              <div class="font-bold text-xs text-white">Always Screen On</div>
              <div class="text-[11px] text-neutral-400">Keep display awake while app is active</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full ${isWakeLocked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-neutral-400'}">
              ${isWakeLocked ? 'Active ⚡' : 'Off'}
            </span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="chk-wake-lock" ${state.keepScreenAwake ? "checked" : ""} class="sr-only peer" />
              <div class="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <!-- Space Selection -->
        <div>
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Current Space</label>
          <div class="grid grid-cols-4 gap-2">
            ${Object.values(state.spaces).map(s => `
              <button class="p-2.5 rounded-xl border text-center font-bold text-xs transition-all ${s.id === state.activeSpaceId ? "bg-blue-600 border-blue-500 text-white shadow-lg" : "bg-white/5 border-white/5 text-neutral-400 hover:bg-white/10"}" data-set-space="${s.id}">
                ${s.name}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Layout Selector -->
        <div>
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Layout Mode</label>
          <div class="grid grid-cols-3 gap-3">
            <button class="p-3 rounded-xl border text-center font-semibold transition-all flex flex-col items-center gap-1.5 ${activeSpace.layout === "standalone" ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10"}" data-set-layout="standalone">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="3"/></svg>
              <span class="text-xs">Fullscreen Clock</span>
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

        <!-- Clock Face Theme -->
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

        <!-- Pomodoro Configuration -->
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

        <!-- Clock Behavior & Sound Customization -->
        <div class="pt-4 border-t border-white/10">
          <label class="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2.5">Clock & Sound Behavior</label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            <label class="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input type="checkbox" id="chk-24h" ${state.clockConfig.is24Hour ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">24-Hour Format</span>
            </label>
            <label class="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input type="checkbox" id="chk-seconds" ${state.clockConfig.showSeconds ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Show Seconds</span>
            </label>
            <label class="flex items-center gap-2 p-2.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
              <input type="checkbox" id="chk-tick" ${state.clockConfig.tickSound ? "checked" : ""} class="rounded" />
              <span class="text-xs font-medium">Tick Audio</span>
            </label>
          </div>

          <!-- Tick Sound Volume Slider & Instant Preview -->
          <div class="p-3.5 bg-white/5 rounded-xl border border-white/5 ${state.clockConfig.tickSound ? "" : "opacity-50 pointer-events-none"} transition-all" id="tick-volume-container">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-neutral-200">Tick Volume</span>
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-mono font-bold" id="tick-volume-badge">${tickPercent}%</span>
              </div>
              <button id="btn-preview-tick" class="px-3 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1.5 font-bold shadow-md active:scale-95 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                <span>Test 🔊</span>
              </button>
            </div>
            <input type="range" min="0" max="1" step="0.05" id="range-tick-volume" value="${currentTickVol}" class="w-full accent-blue-500 h-2 bg-neutral-800 rounded-lg cursor-pointer" />
            <div class="flex justify-between text-[10px] text-neutral-400 mt-1.5 font-mono">
              <span>Mute (0%)</span>
              <span>Subtle (30%)</span>
              <span>Default (75%)</span>
              <span>Max (100%)</span>
            </div>
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

    this.bindEvents();
  }

  bindEvents() {
    // 1. Wake Lock
    const chkWakeLock = this.contentEl.querySelector("#chk-wake-lock");
    if (chkWakeLock) {
      chkWakeLock.addEventListener("change", (e) => {
        store.toggleScreenWakeLock(e.target.checked);
        this.render();
      });
    }

    // 2. Spaces
    this.contentEl.querySelectorAll("[data-set-space]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.setActiveSpace(btn.getAttribute("data-set-space"));
        soundEngine.playFlipTick();
        this.render();
      });
    });

    // 3. Layouts
    this.contentEl.querySelectorAll("[data-set-layout]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.setLayout(btn.getAttribute("data-set-layout"));
        soundEngine.playFlipTick();
        this.render();
      });
    });

    // 4. Clocks
    this.contentEl.querySelectorAll("[data-set-clock]").forEach(btn => {
      btn.addEventListener("click", () => {
        store.setClock(btn.getAttribute("data-set-clock"));
        soundEngine.playFlipTick();
        this.render();
      });
    });

    // 5. Pomodoro inputs
    const inFocus = this.contentEl.querySelector("#input-pomo-focus");
    const inShort = this.contentEl.querySelector("#input-pomo-short");
    const inLong = this.contentEl.querySelector("#input-pomo-long");
    const chkAutoBreaks = this.contentEl.querySelector("#chk-auto-breaks");
    const chkAutoPomo = this.contentEl.querySelector("#chk-auto-pomo");

    const savePomo = () => {
      store.updatePomoSettings({
        focusDuration: parseInt(inFocus?.value, 10) || 25,
        shortBreakDuration: parseInt(inShort?.value, 10) || 5,
        longBreakDuration: parseInt(inLong?.value, 10) || 15,
        autoStartBreaks: chkAutoBreaks ? chkAutoBreaks.checked : false,
        autoStartPomo: chkAutoPomo ? chkAutoPomo.checked : false
      });
    };

    if (inFocus) inFocus.addEventListener("change", savePomo);
    if (inShort) inShort.addEventListener("change", savePomo);
    if (inLong) inLong.addEventListener("change", savePomo);
    if (chkAutoBreaks) chkAutoBreaks.addEventListener("change", savePomo);
    if (chkAutoPomo) chkAutoPomo.addEventListener("change", savePomo);

    // 6. Clock Behavior Checkboxes
    const chk24 = this.contentEl.querySelector("#chk-24h");
    if (chk24) chk24.addEventListener("change", (e) => store.updateClockConfig({ is24Hour: e.target.checked }));

    const chkSec = this.contentEl.querySelector("#chk-seconds");
    if (chkSec) chkSec.addEventListener("change", (e) => store.updateClockConfig({ showSeconds: e.target.checked }));

    const chkTick = this.contentEl.querySelector("#chk-tick");
    const volContainer = this.contentEl.querySelector("#tick-volume-container");

    if (chkTick) {
      chkTick.addEventListener("change", (e) => {
        store.updateClockConfig({ tickSound: e.target.checked });
        store.updatePomoSettings({ tickSound: e.target.checked });
        if (volContainer) {
          if (e.target.checked) volContainer.classList.remove("opacity-50", "pointer-events-none");
          else volContainer.classList.add("opacity-50", "pointer-events-none");
        }
      });
    }

    // 7. Tick Volume Slider & Preview Button
    const rangeTickVol = this.contentEl.querySelector("#range-tick-volume");
    const tickVolBadge = this.contentEl.querySelector("#tick-volume-badge");
    const btnPreviewTick = this.contentEl.querySelector("#btn-preview-tick");

    if (rangeTickVol) {
      const onVolInput = (e) => {
        const val = parseFloat(e.target.value);
        if (tickVolBadge) tickVolBadge.textContent = `${Math.round(val * 100)}%`;
        soundEngine.setTickVolume(val);
      };

      rangeTickVol.addEventListener("input", onVolInput);
      rangeTickVol.addEventListener("change", (e) => {
        const val = parseFloat(e.target.value);
        onVolInput(e);
        store.setTickVolume(val);
        soundEngine.playFlipTick(val);
      });
    }

    if (btnPreviewTick) {
      btnPreviewTick.addEventListener("click", () => {
        const curVol = rangeTickVol ? parseFloat(rangeTickVol.value) : soundEngine.getTickVolume();
        soundEngine.playFlipTick(curVol);
      });
    }

    // 8. Duo Widgets
    const selW1 = this.contentEl.querySelector("#select-duo-w1");
    const selW2 = this.contentEl.querySelector("#select-duo-w2");
    if (selW1 && selW2) {
      const upd = () => store.setWidgets([selW1.value, selW2.value]);
      selW1.addEventListener("change", upd);
      selW2.addEventListener("change", upd);
    }
  }
}

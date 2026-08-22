import { store } from '../state/store.js';
import { clockEngine } from '../engines/clockEngine.js';
import { soundEngine } from '../engines/soundEngine.js';

export class PomoFocusView {
  constructor(containerElement) {
    this.container = containerElement;
    this.timerInterval = null;
    this.cornerClockInterval = null;
    this.init();
  }

  init() {
    this.render();

    // Start background Pomodoro ticker
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const finished = store.tickPomo();
      if (finished) {
        soundEngine.playAlarmChime();
        this.render();
      } else {
        this.updateDigitsOnly();
      }
    }, 1000);

    store.subscribe((event) => {
      if (
        event === 'pomo_updated' ||
        event === 'pomo_settings_updated' ||
        event === 'space_updated' ||
        event === 'clock_config_updated'
      ) {
        this.render();
      }
    });
  }

  formatTime(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return {
      minutes: String(m).padStart(2, '0'),
      seconds: String(s).padStart(2, '0'),
      formatted: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    };
  }

  renderThemedTimer(clockId, minutes, seconds) {
    // 1. Flip Theme
    if (clockId === 'flip') {
      return `
        <div class="flip-clock-container" style="gap: clamp(0.3rem, 1.2vw, 0.8rem);">
          <div class="flip-group">
            <div class="flip-unit"><div class="flip-card-top"><span>${minutes[0]}</span></div><div class="flip-card-bottom"><span>${minutes[0]}</span></div></div>
            <div class="flip-unit"><div class="flip-card-top"><span>${minutes[1]}</span></div><div class="flip-card-bottom"><span>${minutes[1]}</span></div></div>
          </div>
          <div class="flip-divider" style="font-size: clamp(2rem, 6vw, 4.5rem);">:</div>
          <div class="flip-group">
            <div class="flip-unit"><div class="flip-card-top"><span>${seconds[0]}</span></div><div class="flip-card-bottom"><span>${seconds[0]}</span></div></div>
            <div class="flip-unit"><div class="flip-card-top"><span>${seconds[1]}</span></div><div class="flip-card-bottom"><span>${seconds[1]}</span></div></div>
          </div>
        </div>
      `;
    }
    // 2. Neon Theme
    if (clockId === 'neon') {
      return `
        <div class="neon-clock-container">
          <div class="neon-time text-6xl md:text-8xl">${minutes}:${seconds}</div>
        </div>
      `;
    }
    // 3. Matrix Theme
    if (clockId === 'matrix') {
      return `
        <div class="matrix-clock-container">
          <div class="matrix-sub">POMO_STAGE // ACTIVE_CYCLE</div>
          <div class="matrix-time text-6xl md:text-8xl">${minutes}:${seconds}</div>
        </div>
      `;
    }
    // 4. 7-Segment LED Theme
    if (clockId === 'segmented') {
      return `
        <div class="segmented-clock-container" style="font-size: clamp(3.5rem, 11vw, 8rem);">
          <div class="seg-digit-group">${minutes}</div>
          <div class="seg-digit-group animate-pulse">:</div>
          <div class="seg-digit-group">${seconds}</div>
        </div>
      `;
    }
    // 5. AMOLED Theme
    if (clockId === 'minimal') {
      return `
        <div class="amoled-clock-container">
          <div class="amoled-time text-7xl md:text-9xl">${minutes}:${seconds}</div>
        </div>
      `;
    }
    // 6. Star Trek LCARS Theme
    if (clockId === 'lcars') {
      return `
        <div class="lcars-clock-container max-w-lg">
          <div class="lcars-elbow"><span class="lcars-text-id">FOCUS</span><span class="text-[10px] font-bold text-black">POMO</span></div>
          <div class="lcars-body">
            <div class="text-xs font-mono text-amber-400">STAGE TELEMETRY</div>
            <div class="lcars-time text-5xl md:text-7xl">${minutes}:${seconds}</div>
            <div class="lcars-bar"></div>
          </div>
        </div>
      `;
    }
    // Default Clean Display (Solar, Radial, Day, BigCrop, etc.)
    return `
      <div class="font-sans font-extrabold text-7xl md:text-9xl tracking-tight text-white drop-shadow-2xl font-mono">
        ${minutes}:${seconds}
      </div>
    `;
  }

  render() {
    if (!this.container) return;
    const state = store.getState();
    const pomo = state.pomoState;
    const activeSpace = store.getActiveSpace();
    const clockId = activeSpace.clockId || 'flip';
    const { minutes, seconds } = this.formatTime(pomo.remainingSeconds);

    const progressPct = pomo.totalSeconds > 0 ? (pomo.remainingSeconds / pomo.totalSeconds) * 100 : 0;
    const circumference = 2 * Math.PI * 135;
    const strokeDashoffset = circumference * (1 - pomo.remainingSeconds / (pomo.totalSeconds || 1));

    const totalSessionsInCycle = pomo.settings.longBreakInterval || 4;
    const currentInCycle = (pomo.totalCompletedSessions % totalSessionsInCycle) + 1;

    let cycleDotsHtml = '';
    for (let i = 1; i <= totalSessionsInCycle; i++) {
      if (i < currentInCycle) {
        cycleDotsHtml += `<span class="w-3 h-3 rounded-full bg-blue-500 shadow-md"></span>`;
      } else if (i === currentInCycle) {
        cycleDotsHtml += `<span class="w-3.5 h-3.5 rounded-full bg-blue-400 ring-4 ring-blue-500/20 animate-pulse"></span>`;
      } else {
        cycleDotsHtml += `<span class="w-3 h-3 rounded-full bg-white/20"></span>`;
      }
    }

    const stageLabel = pomo.stage === 'focus' ? 'Deep Work Sprint' : pomo.stage === 'shortBreak' ? 'Short Recharge' : 'Long Recovery';

    this.container.innerHTML = `
      <div class="pomo-focus-stage">
        
        <!-- Non-Distracting Live Corner Clock -->
        <div class="pomo-corner-clock" id="pomo-corner-clock-box">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Local Time</span>
          </div>
          <div class="pomo-corner-time font-mono" id="pomo-corner-live-time">12:00:00</div>
          <div class="text-[10px] text-neutral-400" id="pomo-corner-live-date">Sat, Aug 22</div>
        </div>

        <!-- Central Pomodoro Card -->
        <div class="pomo-center-card">
          
          <!-- Stage Selector Pills -->
          <div class="flex items-center gap-2 p-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 mb-4 shadow-xl">
            <button class="px-4 py-1.5 rounded-full text-xs font-bold transition-all ${pomo.stage === 'focus' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}" data-pomo-stage="focus">
              Focus (${pomo.settings.focusDuration}m)
            </button>
            <button class="px-4 py-1.5 rounded-full text-xs font-bold transition-all ${pomo.stage === 'shortBreak' ? 'bg-emerald-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}" data-pomo-stage="shortBreak">
              Short Break (${pomo.settings.shortBreakDuration}m)
            </button>
            <button class="px-4 py-1.5 rounded-full text-xs font-bold transition-all ${pomo.stage === 'longBreak' ? 'bg-purple-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}" data-pomo-stage="longBreak">
              Long Break (${pomo.settings.longBreakDuration}m)
            </button>
          </div>

          <!-- Session Cycle Dots & Subtitle -->
          <div class="flex items-center gap-3 mb-4">
            <div class="flex items-center gap-2">${cycleDotsHtml}</div>
            <span class="text-xs font-mono font-medium text-neutral-400">Session ${currentInCycle} of ${totalSessionsInCycle}</span>
          </div>

          <!-- Circular Themed Timer Display -->
          <div class="relative flex items-center justify-center p-6 my-2">
            <svg class="absolute w-72 h-72 md:w-80 md:h-80 pointer-events-none" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r="135" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" />
              <circle cx="150" cy="150" r="135" fill="none" stroke="${pomo.stage === 'focus' ? '#3b82f6' : pomo.stage === 'shortBreak' ? '#10b981' : '#a855f7'}" stroke-width="6" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" transform="rotate(-90 150 150)" class="transition-all duration-1000 ease-linear" />
            </svg>
            <div id="pomo-digits-wrapper" class="z-10 text-center">
              ${this.renderThemedTimer(clockId, minutes, seconds)}
              <div class="text-xs font-semibold text-neutral-400 uppercase tracking-widest mt-2">${stageLabel}</div>
            </div>
          </div>

          <!-- Quick Duration Presets -->
          <div class="flex items-center gap-2 my-3">
            <button class="px-3 py-1 text-[11px] font-semibold rounded-lg bg-white/5 border border-white/5 text-neutral-300 hover:bg-white/10" data-preset="25">25 / 5m</button>
            <button class="px-3 py-1 text-[11px] font-semibold rounded-lg bg-white/5 border border-white/5 text-neutral-300 hover:bg-white/10" data-preset="50">50 / 10m</button>
            <button class="px-3 py-1 text-[11px] font-semibold rounded-lg bg-white/5 border border-white/5 text-neutral-300 hover:bg-white/10" data-preset="90">90 / 20m</button>
          </div>

          <!-- Primary Control Buttons -->
          <div class="flex items-center gap-4 mt-2">
            <button class="btn-icon" id="pomo-btn-reset" title="Reset Session">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
            <button class="px-8 py-3.5 rounded-full font-bold text-sm text-white shadow-2xl transition-all flex items-center gap-2 ${pomo.isRunning ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}" id="pomo-btn-toggle">
              ${pomo.isRunning ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                <span>Pause</span>
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Start Focus</span>
              `}
            </button>
            <button class="btn-icon" id="pomo-btn-skip" title="Skip to Next Stage">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>
            <button class="btn-icon" id="pomo-btn-settings" title="Pomodoro Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>

        </div>

      </div>
    `;

    this.initListeners();
    this.startCornerClock();
  }

  updateDigitsOnly() {
    const pomo = store.getState().pomoState;
    const { minutes, seconds } = this.formatTime(pomo.remainingSeconds);
    const wrapper = this.container.querySelector('#pomo-digits-wrapper');
    const clockId = store.getActiveSpace().clockId || 'flip';
    if (wrapper) {
      wrapper.innerHTML = `
        ${this.renderThemedTimer(clockId, minutes, seconds)}
        <div class="text-xs font-semibold text-neutral-400 uppercase tracking-widest mt-2">${pomo.stage === 'focus' ? 'Deep Work Sprint' : pomo.stage === 'shortBreak' ? 'Short Recharge' : 'Long Recovery'}</div>
      `;
    }
  }

  startCornerClock() {
    if (this.cornerClockInterval) clearInterval(this.cornerClockInterval);
    const updateCorner = () => {
      const now = new Date();
      const timeEl = this.container.querySelector('#pomo-corner-live-time');
      const dateEl = this.container.querySelector('#pomo-corner-live-date');
      if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: !store.getState().clockConfig.is24Hour });
      }
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      }
    };
    updateCorner();
    this.cornerClockInterval = setInterval(updateCorner, 1000);
  }

  initListeners() {
    // Stage Selector buttons
    this.container.querySelectorAll('[data-pomo-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        const stage = btn.getAttribute('data-pomo-stage');
        store.setPomoStage(stage);
        soundEngine.playFlipTick();
      });
    });

    // Preset buttons
    this.container.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-preset'), 10);
        if (p === 25) store.updatePomoSettings({ focusDuration: 25, shortBreakDuration: 5 });
        else if (p === 50) store.updatePomoSettings({ focusDuration: 50, shortBreakDuration: 10 });
        else if (p === 90) store.updatePomoSettings({ focusDuration: 90, shortBreakDuration: 20 });
        soundEngine.playFlipTick();
      });
    });

    // Start / Pause
    const toggleBtn = this.container.querySelector('#pomo-btn-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        store.togglePomoRunning();
        soundEngine.playFlipTick();
      });
    }

    // Reset
    const resetBtn = this.container.querySelector('#pomo-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        store.resetPomo();
        soundEngine.playFlipTick();
      });
    }

    // Skip
    const skipBtn = this.container.querySelector('#pomo-btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const s = store.getState().pomoState;
        if (s.stage === 'focus') store.setPomoStage('shortBreak');
        else store.setPomoStage('focus');
        soundEngine.playFlipTick();
      });
    }

    // Settings Modal Open
    const setBtn = this.container.querySelector('#pomo-btn-settings');
    if (setBtn) {
      setBtn.addEventListener('click', () => {
        const custBtn = document.getElementById('btn-customize');
        if (custBtn) custBtn.click();
      });
    }
  }

  unmount() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.cornerClockInterval) clearInterval(this.cornerClockInterval);
    if (this.container) this.container.innerHTML = '';
  }
}

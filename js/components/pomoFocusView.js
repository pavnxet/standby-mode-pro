import { store } from '../state/store.js';
import { clockEngine } from '../engines/clockEngine.js';
import { soundEngine } from '../engines/soundEngine.js';

export class PomoFocusView {
  constructor(containerElement) {
    this.container = containerElement;
    this.appShell = document.getElementById('app-shell');
    this.timerInterval = null;
    this.cornerClockInterval = null;
    this.peekTimeout = null;
    this.init();
  }

  init() {
    this.render();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const finished = store.tickPomo();
      if (finished) {
        soundEngine.playAlarmChime();
        this.render();
      } else {
        this.updateTimeOnly();
      }
    }, 1000);

    store.subscribe((event) => {
      if (
        event === 'pomo_updated' ||
        event === 'pomo_settings_updated' ||
        event === 'space_updated' ||
        event === 'clock_config_updated'
      ) {
        this.syncZenState();
        this.render();
      }
    });

    this.syncZenState();
  }

  syncZenState() {
    const isRunning = store.getState().pomoState.isRunning;
    if (this.appShell) {
      if (isRunning) {
        this.appShell.classList.add('zen-focus-active');
      } else {
        this.appShell.classList.remove('zen-focus-active');
        this.appShell.classList.remove('zen-peek-active');
        if (this.peekTimeout) clearTimeout(this.peekTimeout);
      }
    }
  }

  triggerZenPeek() {
    if (!this.appShell || !this.appShell.classList.contains('zen-focus-active')) return;
    this.appShell.classList.add('zen-peek-active');
    if (this.peekTimeout) clearTimeout(this.peekTimeout);
    this.peekTimeout = setTimeout(() => {
      if (this.appShell) this.appShell.classList.remove('zen-peek-active');
    }, 4000);
  }

  formatTime(totalSecs) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return {
      minutes: String(m).padStart(2, '0'),
      seconds: String(s).padStart(2, '0')
    };
  }

  renderThemedTimer(clockId, minutes, seconds) {
    // 1. Retro 3D Flip Clock
    if (clockId === 'flip') {
      return `
        <div class="flip-clock-container" style="gap: 0.4rem;">
          <div class="flip-group">
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${minutes[0]}</span></div><div class="flip-card-bottom"><span>${minutes[0]}</span></div></div>
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${minutes[1]}</span></div><div class="flip-card-bottom"><span>${minutes[1]}</span></div></div>
          </div>
          <div class="flip-divider text-2xl">:</div>
          <div class="flip-group">
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${seconds[0]}</span></div><div class="flip-card-bottom"><span>${seconds[0]}</span></div></div>
            <div class="flip-unit" style="width: 2.8rem; height: 3.8rem; font-size: 2.2rem;"><div class="flip-card-top"><span>${seconds[1]}</span></div><div class="flip-card-bottom"><span>${seconds[1]}</span></div></div>
          </div>
        </div>
      `;
    }
    // 2. Neon Glow
    if (clockId === 'neon') {
      return `<div class="neon-time text-5xl md:text-6xl font-bold tracking-tight">${minutes}:${seconds}</div>`;
    }
    // 3. Matrix Digital
    if (clockId === 'matrix') {
      return `
        <div class="matrix-clock-container py-0">
          <div class="matrix-time text-5xl font-mono">${minutes}:${seconds}</div>
        </div>
      `;
    }
    // 4. 7-Segment LED
    if (clockId === 'segmented') {
      return `
        <div class="segmented-clock-container text-6xl tracking-wider">
          <div class="seg-digit-group">${minutes}</div>
          <div class="seg-digit-group animate-pulse">:</div>
          <div class="seg-digit-group">${seconds}</div>
        </div>
      `;
    }
    // 5. AMOLED Minimal
    if (clockId === 'minimal') {
      return `<div class="amoled-time text-6xl md:text-7xl font-sans tracking-tight">${minutes}:${seconds}</div>`;
    }
    // 6. Star Trek LCARS
    if (clockId === 'lcars') {
      return `
        <div class="text-center font-mono">
          <div class="text-[10px] text-amber-400 tracking-widest uppercase">LCARS POMO</div>
          <div class="lcars-time text-5xl">${minutes}:${seconds}</div>
        </div>
      `;
    }
    // Default Clean Modern Display
    return `<div class="pomo-primary-time">${minutes}:${seconds}</div>`;
  }

  render() {
    if (!this.container) return;
    const state = store.getState();
    const pomo = state.pomoState;
    const activeSpace = store.getActiveSpace();
    const clockId = activeSpace.clockId || 'flip';
    const { minutes, seconds } = this.formatTime(pomo.remainingSeconds);

    const radius = 118;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - pomo.remainingSeconds / (pomo.totalSeconds || 1));

    const totalSessionsInCycle = pomo.settings.longBreakInterval || 4;
    const currentInCycle = (pomo.totalCompletedSessions % totalSessionsInCycle) + 1;

    let cycleDotsHtml = '';
    for (let i = 1; i <= totalSessionsInCycle; i++) {
      if (i < currentInCycle) {
        cycleDotsHtml += `<span class="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm"></span>`;
      } else if (i === currentInCycle) {
        cycleDotsHtml += `<span class="w-3 h-3 rounded-full bg-blue-400 ring-4 ring-blue-500/25 animate-pulse"></span>`;
      } else {
        cycleDotsHtml += `<span class="w-2.5 h-2.5 rounded-full bg-white/20"></span>`;
      }
    }

    const stageLabel = pomo.stage === 'focus' ? 'Deep Work Sprint' : pomo.stage === 'shortBreak' ? 'Short Recharge' : 'Long Recovery';
    const ringColor = pomo.stage === 'focus' ? '#3b82f6' : pomo.stage === 'shortBreak' ? '#10b981' : '#a855f7';
    const btnBg = pomo.isRunning ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/40' : pomo.stage === 'focus' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40' : pomo.stage === 'shortBreak' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/40';

    this.container.innerHTML = `
      <div class="pomo-focus-stage" id="pomo-stage-outer">
        
        <!-- Sleek Corner Live Clock Pill -->
        <div class="pomo-corner-clock" id="pomo-corner-clock-box">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Clock</span>
          </div>
          <span class="pomo-corner-time" id="pomo-corner-live-time">12:00:00</span>
          <span class="pomo-corner-date" id="pomo-corner-live-date">Sat, Aug 22</span>
        </div>

        <!-- Center Focus Dashboard Card -->
        <div class="pomo-center-card" id="pomo-card-main">
          
          <!-- Stage Selector Nav (Auto-fades in Zen mode) -->
          <div class="pomo-stage-nav">
            <button class="pomo-stage-btn ${pomo.stage === 'focus' ? 'active-focus' : ''}" data-pomo-stage="focus">
              Focus (${pomo.settings.focusDuration}m)
            </button>
            <button class="pomo-stage-btn ${pomo.stage === 'shortBreak' ? 'active-short' : ''}" data-pomo-stage="shortBreak">
              Short Break (${pomo.settings.shortBreakDuration}m)
            </button>
            <button class="pomo-stage-btn ${pomo.stage === 'longBreak' ? 'active-long' : ''}" data-pomo-stage="longBreak">
              Long Break (${pomo.settings.longBreakDuration}m)
            </button>
          </div>

          <!-- Session Cycle Dots (Auto-fades in Zen mode) -->
          <div class="pomo-cycle-row">
            <div class="flex items-center gap-1.5">${cycleDotsHtml}</div>
            <span class="text-[11px] font-mono font-medium text-neutral-400">Session ${currentInCycle} of ${totalSessionsInCycle}</span>
          </div>

          <!-- Circular Ring & Timer Viewport (Always visible in Zen mode) -->
          <div class="pomo-circle-wrapper">
            <svg class="pomo-svg-ring" viewBox="0 0 260 260">
              <!-- Background Track -->
              <circle cx="130" cy="130" r="${radius}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="7" />
              <!-- Progress Arc -->
              <circle id="pomo-progress-arc" cx="130" cy="130" r="${radius}" fill="none" stroke="${ringColor}" stroke-width="7" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" class="transition-all duration-1000 ease-linear" />
            </svg>
            <div id="pomo-digits-box" class="pomo-digits-box">
              ${this.renderThemedTimer(clockId, minutes, seconds)}
              <div class="pomo-stage-subtitle" id="pomo-stage-subtitle-text">${stageLabel}</div>
            </div>
          </div>

          <!-- Quick Duration Presets (Auto-fades in Zen mode) -->
          <div class="pomo-presets-bar">
            <button class="pomo-preset-chip" data-preset="25">25 / 5m</button>
            <button class="pomo-preset-chip" data-preset="50">50 / 10m</button>
            <button class="pomo-preset-chip" data-preset="90">90 / 20m</button>
          </div>

          <!-- Action Controls Bar (Essential controls remain visible) -->
          <div class="pomo-controls-bar">
            <button class="btn-icon" id="pomo-btn-reset" title="Reset Session">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
            
            <button class="pomo-btn-main shadow-xl ${btnBg}" id="pomo-btn-toggle">
              ${pomo.isRunning ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                <span>Pause</span>
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>${pomo.stage === 'focus' ? 'Start Focus' : 'Start Break'}</span>
              `}
            </button>

            <button class="btn-icon" id="pomo-btn-skip" title="Skip Stage">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>

            <button class="btn-icon" id="pomo-btn-settings" title="Customize Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>

        </div>

      </div>
    `;

    this.initListeners();
    this.startCornerClock();
  }

  updateTimeOnly() {
    const pomo = store.getState().pomoState;
    const { minutes, seconds } = this.formatTime(pomo.remainingSeconds);
    const box = this.container.querySelector('#pomo-digits-box');
    const clockId = store.getActiveSpace().clockId || 'flip';
    if (box) {
      box.innerHTML = `
        ${this.renderThemedTimer(clockId, minutes, seconds)}
        <div class="pomo-stage-subtitle" id="pomo-stage-subtitle-text">${pomo.stage === 'focus' ? 'Deep Work Sprint' : pomo.stage === 'shortBreak' ? 'Short Recharge' : 'Long Recovery'}</div>
      `;
    }
    const arc = this.container.querySelector('#pomo-progress-arc');
    if (arc) {
      const radius = 118;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference * (1 - pomo.remainingSeconds / (pomo.totalSeconds || 1));
      arc.setAttribute('stroke-dashoffset', offset);
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
    // Tap sideways / background to peek UI in Zen mode
    const outerStage = this.container.querySelector('#pomo-stage-outer');
    if (outerStage) {
      outerStage.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('input')) {
          this.triggerZenPeek();
        }
      });
    }

    this.container.querySelectorAll('[data-pomo-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        const stage = btn.getAttribute('data-pomo-stage');
        store.setPomoStage(stage);
        soundEngine.playFlipTick();
      });
    });

    this.container.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-preset'), 10);
        if (p === 25) store.updatePomoSettings({ focusDuration: 25, shortBreakDuration: 5 });
        else if (p === 50) store.updatePomoSettings({ focusDuration: 50, shortBreakDuration: 10 });
        else if (p === 90) store.updatePomoSettings({ focusDuration: 90, shortBreakDuration: 20 });
        soundEngine.playFlipTick();
      });
    });

    const toggleBtn = this.container.querySelector('#pomo-btn-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        store.togglePomoRunning();
        soundEngine.playFlipTick();
      });
    }

    const resetBtn = this.container.querySelector('#pomo-btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        store.resetPomo();
        soundEngine.playFlipTick();
      });
    }

    const skipBtn = this.container.querySelector('#pomo-btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const s = store.getState().pomoState;
        if (s.stage === 'focus') store.setPomoStage('shortBreak');
        else store.setPomoStage('focus');
        soundEngine.playFlipTick();
      });
    }

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
    if (this.peekTimeout) clearTimeout(this.peekTimeout);
    if (this.appShell) {
      this.appShell.classList.remove('zen-focus-active');
      this.appShell.classList.remove('zen-peek-active');
    }
    if (this.container) this.container.innerHTML = '';
  }
}

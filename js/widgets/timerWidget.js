/* Fullscreen Timer & Stopwatch Widget with Background Tab Synchronization */
import { soundEngine } from "../engines/soundEngine.js";

export const timerWidget = {
  name: "Timer & Stopwatch",
  icon: "timer",

  mount(container) {
    let mode = "timer"; // 'timer' or 'stopwatch'
    let timerDuration = 1500; // 25 min default
    let remaining = 1500;
    let targetEndTime = null;
    let isRunning = false;
    let timerInterval = null;

    let swElapsed = 0;
    let swStartTime = null;
    let swInterval = null;

    const formatTime = (secs) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const formatStopwatch = (ms) => {
      const totalSecs = Math.floor(ms / 1000);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      const cs = Math.floor((ms % 1000) / 10);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    };

    const updateDisplay = () => {
      const el = container.querySelector("#timer-digits-display");
      if (el) {
        el.textContent = mode === "timer" ? formatTime(remaining) : formatStopwatch(swElapsed);
      }
    };

    const syncBackgroundDelta = () => {
      if (mode === "timer" && isRunning && targetEndTime) {
        const now = Date.now();
        const diff = Math.round((targetEndTime - now) / 1000);
        if (diff <= 0) {
          remaining = 0;
          stopTimer();
          isRunning = false;
          soundEngine.playAlarmChime();
          render();
        } else {
          remaining = diff;
          updateDisplay();
        }
      } else if (mode === "stopwatch" && isRunning && swStartTime) {
        swElapsed = Date.now() - swStartTime;
        updateDisplay();
      }
    };

    const render = () => {
      container.innerHTML = `
        <div class="timer-container">
          <div class="flex items-center gap-2 p-1 bg-white/5 rounded-full mb-1">
            <button id="tab-timer" class="px-3 py-1 text-xs font-semibold rounded-full transition-all ${mode === "timer" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}">Pomodoro</button>
            <button id="tab-sw" class="px-3 py-1 text-xs font-semibold rounded-full transition-all ${mode === "stopwatch" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}">Stopwatch</button>
          </div>

          <div class="timer-digits" id="timer-digits-display">
            ${mode === "timer" ? formatTime(remaining) : formatStopwatch(swElapsed)}
          </div>

          <div class="timer-btn-row">
            <button class="btn-icon" id="timer-reset" data-tooltip="Reset">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>

            <button class="btn-primary flex items-center gap-2" id="timer-toggle">
              ${isRunning ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                Pause
              ` : `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Start
              `}
            </button>

            ${mode === "timer" ? `
              <button class="btn-icon" id="timer-preset-btn" data-tooltip="+5 Min">
                <span class="text-xs font-bold font-mono">+5m</span>
              </button>
            ` : ""}
          </div>
        </div>
      `;

      // Events
      container.querySelector("#tab-timer").addEventListener("click", () => {
        if (mode !== "timer") {
          stopTimer();
          stopSW();
          mode = "timer";
          isRunning = false;
          render();
        }
      });

      container.querySelector("#tab-sw").addEventListener("click", () => {
        if (mode !== "stopwatch") {
          stopTimer();
          stopSW();
          mode = "stopwatch";
          isRunning = false;
          render();
        }
      });

      container.querySelector("#timer-toggle").addEventListener("click", () => {
        isRunning = !isRunning;
        if (mode === "timer") {
          if (isRunning) startTimer();
          else stopTimer();
        } else {
          if (isRunning) startSW();
          else stopSW();
        }
        render();
      });

      container.querySelector("#timer-reset").addEventListener("click", () => {
        isRunning = false;
        if (mode === "timer") {
          stopTimer();
          remaining = timerDuration;
          targetEndTime = null;
        } else {
          stopSW();
          swElapsed = 0;
          swStartTime = null;
        }
        render();
      });

      const presetBtn = container.querySelector("#timer-preset-btn");
      if (presetBtn) {
        presetBtn.addEventListener("click", () => {
          remaining += 300;
          timerDuration = remaining;
          if (isRunning && targetEndTime) {
            targetEndTime += 300000;
          }
          render();
        });
      }
    };

    const startTimer = () => {
      stopTimer();
      targetEndTime = Date.now() + (remaining * 1000);
      timerInterval = setInterval(() => {
        const now = Date.now();
        const diff = Math.round((targetEndTime - now) / 1000);
        if (diff > 0) {
          remaining = diff;
          updateDisplay();
        } else {
          remaining = 0;
          targetEndTime = null;
          stopTimer();
          isRunning = false;
          soundEngine.playAlarmChime();
          render();
        }
      }, 1000);
    };

    const stopTimer = () => {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      targetEndTime = null;
    };

    const startSW = () => {
      stopSW();
      swStartTime = Date.now() - swElapsed;
      swInterval = setInterval(() => {
        swElapsed = Date.now() - swStartTime;
        updateDisplay();
      }, 40);
    };

    const stopSW = () => {
      if (swInterval) {
        clearInterval(swInterval);
        swInterval = null;
      }
    };

    // Auto-sync when switching back from other apps
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncBackgroundDelta();
    };
    const onFocus = () => syncBackgroundDelta();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    render();

    return {
      unmount() {
        stopTimer();
        stopSW();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onFocus);
      }
    };
  }
};

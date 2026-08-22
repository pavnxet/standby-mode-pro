import { store } from './state/store.js';
import { tursoSync } from './state/tursoSync.js';
import { clockEngine } from './engines/clockEngine.js';
import { widgetEngine } from './engines/widgetEngine.js';
import { soundEngine } from './engines/soundEngine.js';
import { visualizerEngine } from './engines/visualizerEngine.js';
import { wakeLockEngine } from './engines/wakeLockEngine.js';
import { burnInProtector } from './engines/burnInProtector.js';

// Clocks
import { flipClock } from './clocks/flipClock.js';
import { neonClock } from './clocks/neonClock.js';
import { matrixClock } from './clocks/matrixClock.js';
import { solarClock } from './clocks/solarClock.js';
import { bigCropClock } from './clocks/bigCropClock.js';
import { radialClock } from './clocks/radialClock.js';
import { dayClock } from './clocks/dayClock.js';
import { segmentedClock } from './clocks/segmentedClock.js';
import { analogDigitalClock } from './clocks/analogDigitalClock.js';
import { amoledClock } from './clocks/amoledClock.js';
import { lcarsClock } from './clocks/lcarsClock.js';

// Widgets
import { weatherWidget } from './widgets/weatherWidget.js';
import { calendarWidget } from './widgets/calendarWidget.js';
import { mediaWidget } from './widgets/mediaWidget.js';
import { timerWidget } from './widgets/timerWidget.js';
import { todoWidget } from './widgets/todoWidget.js';
import { tallyWidget } from './widgets/tallyWidget.js';
import { quoteWidget } from './widgets/quoteWidget.js';
import { photoWidget } from './widgets/photoWidget.js';
import { vibesWidget } from './widgets/vibesWidget.js';

// Components
import { SpacesNav } from './components/spacesNav.js';
import { StatsModal } from './components/statsModal.js';
import { CustomizeModal } from './components/customizeModal.js';
import { PhotoModal } from './components/photoModal.js';
import { NightModeController } from './components/nightModeController.js';
import { Screensaver } from './components/screensaver.js';
import { PomoFocusView } from './components/pomoFocusView.js';

class App {
  constructor() {
    this.stageEl = document.getElementById('main-stage');
    this.currentPomoView = null;
    this.init();
  }

  init() {
    // 1. Register All 11 Clock Faces
    clockEngine.register('flip', flipClock);
    clockEngine.register('neon', neonClock);
    clockEngine.register('matrix', matrixClock);
    clockEngine.register('solar', solarClock);
    clockEngine.register('bigcrop', bigCropClock);
    clockEngine.register('radial', radialClock);
    clockEngine.register('day', dayClock);
    clockEngine.register('segmented', segmentedClock);
    clockEngine.register('analogdigital', analogDigitalClock);
    clockEngine.register('minimal', amoledClock);
    clockEngine.register('lcars', lcarsClock);

    // 2. Register All 9 Widgets
    widgetEngine.register('weather', weatherWidget);
    widgetEngine.register('calendar', calendarWidget);
    widgetEngine.register('media', mediaWidget);
    widgetEngine.register('timer', timerWidget);
    widgetEngine.register('todo', todoWidget);
    widgetEngine.register('tally', tallyWidget);
    widgetEngine.register('quote', quoteWidget);
    widgetEngine.register('photo', photoWidget);
    widgetEngine.register('vibes', vibesWidget);

    // 3. Initialize Visualizer & Ambient Canvas
    const canvas = document.getElementById('ambient-canvas-layer');
    if (canvas) {
      visualizerEngine.init(canvas);
      visualizerEngine.setMode(store.getState().vibes.visualizer || 'stars');
    }

    // 4. Initialize Core UI Components
    new SpacesNav(document.getElementById('spaces-nav-container'));
    new StatsModal();
    new CustomizeModal();
    new PhotoModal();
    new NightModeController();
    new Screensaver();

    // 5. Initialize Wallpaper Layer
    this.updateWallpaper();
    store.subscribe((event) => {
      if (event === 'wallpaper_changed') {
        this.updateWallpaper();
      }
    });

    // 6. Initialize Hardware Protection & Screen Wake Lock
    burnInProtector.start();

    // Unlock Web Audio API on first user interaction
    const unlockAudio = () => {
      soundEngine.initContext();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });

    // 6. Bind Global Fullscreen and Keyboard Actions
    this.initGlobalControls();

    // 7. Subscribe to Reactive Store Updates
    store.subscribe((event) => {
      if (
        event === 'space_changed' ||
        event === 'space_updated' ||
        event === 'clock_config_updated'
      ) {
        this.renderStage();
      }
      if (event === 'visualizer_changed') {
        visualizerEngine.setMode(store.getState().vibes.visualizer);
      }
      if (event === 'vibe_changed') {
        soundEngine.playAmbient(store.getState().vibes.activeTrack);
      }
    });

    // 8. Render Initial Active Stage
    this.renderStage();
  }

  initGlobalControls() {
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Battery API Status
    const batteryStatusText = document.getElementById('battery-status-text');
    if (batteryStatusText && 'getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        const updateBattery = () => {
          const level = Math.round(battery.level * 100);
          batteryStatusText.textContent = `${level}% ${battery.charging ? 'PWR' : 'BAT'}`;
        };
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      } else if (e.key === 'n' || e.key === 'N') {
        store.toggleNightMode();
      } else if (e.key === '1') store.setActiveSpace('home');
      else if (e.key === '2') store.setActiveSpace('work');
      else if (e.key === '3') store.setActiveSpace('focus');
      else if (e.key === '4') store.setActiveSpace('night');
    });
  }

  updateWallpaper() {
    const wp = store.getState().wallpaper;
    const layer = document.getElementById('ambient-wallpaper-layer');
    if (!layer) return;
    if (wp && wp.enabled && wp.activeUrl) {
      layer.style.backgroundImage = `url("${wp.activeUrl}")`;
      const blurVal = Number.isFinite(wp.blur) ? wp.blur : 6;
      const dimVal = Number.isFinite(wp.dim) ? wp.dim : 0.5;
      layer.style.filter = `blur(${blurVal}px) brightness(${1 - dimVal * 0.65})`;
      layer.style.opacity = "1";
    } else {
      layer.style.opacity = "0";
      layer.style.backgroundImage = "none";
    }
  }

  renderStage() {
    if (!this.stageEl) return;

    if (this.currentPomoView) {
      this.currentPomoView.unmount();
      this.currentPomoView = null;
    }
    clockEngine.unmount();
    widgetEngine.unmountAll();

    const activeSpace = store.getActiveSpace();
    const clockConfig = store.getState().clockConfig;
    const layout = activeSpace.layout || 'standalone';

    // Layout A: Dedicated Pomodoro Focus Mode
    if (layout === 'focus' || activeSpace.id === 'focus') {
      this.currentPomoView = new PomoFocusView(this.stageEl);
      return;
    }

    // Layout B: Standalone Fullscreen Clock
    if (layout === 'standalone') {
      this.stageEl.innerHTML = `<div class="layout-standalone" id="standalone-clock-slot"></div>`;
      const slot = document.getElementById('standalone-clock-slot');
      clockEngine.mount(activeSpace.clockId || 'flip', slot, clockConfig);
      return;
    }

    // Layout C: Duo Split Mode (2 Panels)
    if (layout === 'duo') {
      this.stageEl.innerHTML = `
        <div class="layout-duo">
          <div class="widget-panel" id="duo-panel-1"></div>
          <div class="widget-panel" id="duo-panel-2"></div>
        </div>
      `;
      const panel1 = document.getElementById('duo-panel-1');
      const panel2 = document.getElementById('duo-panel-2');
      const w1 = activeSpace.widgets[0] || 'clock';
      const w2 = activeSpace.widgets[1] || 'weather';

      if (w1 === 'clock') clockEngine.mount(activeSpace.clockId || 'flip', panel1, clockConfig);
      else widgetEngine.mount(w1, panel1, 'duo-1');

      if (w2 === 'clock') clockEngine.mount(activeSpace.clockId || 'flip', panel2, clockConfig);
      else widgetEngine.mount(w2, panel2, 'duo-2');
      return;
    }

    // Layout D: Quad Grid Mode (4 Panels)
    if (layout === 'quad') {
      this.stageEl.innerHTML = `
        <div class="layout-quad">
          <div class="widget-panel" id="quad-panel-1"></div>
          <div class="widget-panel" id="quad-panel-2"></div>
          <div class="widget-panel" id="quad-panel-3"></div>
          <div class="widget-panel" id="quad-panel-4"></div>
        </div>
      `;
      const quadWidgets = activeSpace.quadWidgets || ['weather', 'calendar', 'media', 'timer'];
      quadWidgets.forEach((widgetId, index) => {
        const slot = document.getElementById(`quad-panel-${index + 1}`);
        if (slot) {
          if (widgetId === 'clock' || (index === 0 && widgetId === activeSpace.clockId)) {
            clockEngine.mount(activeSpace.clockId || 'flip', slot, clockConfig);
          } else {
            widgetEngine.mount(widgetId, slot, `quad-${index + 1}`);
          }
        }
      });
    }
  }
}

// Global Launcher
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.standbyApp = new App();
  });
} else {
  window.standbyApp = new App();
}

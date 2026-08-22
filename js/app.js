import { store } from './state/store.js';
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

    widgetEngine.register('weather', weatherWidget);
    widgetEngine.register('calendar', calendarWidget);
    widgetEngine.register('media', mediaWidget);
    widgetEngine.register('timer', timerWidget);
    widgetEngine.register('todo', todoWidget);
    widgetEngine.register('tally', tallyWidget);
    widgetEngine.register('quote', quoteWidget);
    widgetEngine.register('photo', photoWidget);
    widgetEngine.register('vibes', vibesWidget);

    const canvas = document.getElementById('ambient-canvas-layer');
    if (canvas) {
      visualizerEngine.init(canvas);
      visualizerEngine.setMode(store.getState().vibes.visualizer || 'stars');
    }

    new SpacesNav(document.getElementById('spaces-nav-container'));
    new CustomizeModal();
    new PhotoModal();
    new NightModeController();
    new Screensaver();

    burnInProtector.start();

    const unlockAudio = () => {
      soundEngine.initContext();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });

    this.initGlobalControls();

    store.subscribe((event) => {
      if (event === 'space_changed' || event === 'space_updated' || event === 'clock_config_updated') {
        this.renderStage();
      }
      if (event === 'space_changed' || event === 'vibe_changed') {
        soundEngine.playAmbient(store.getState().vibes.activeTrack || 'none');
      }
      if (event === 'visualizer_changed') {
        visualizerEngine.setMode(store.getState().vibes.visualizer);
      }
    });

    this.renderStage();
  }

  initGlobalControls() {
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenEnabled) return;
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    const batteryStatusText = document.getElementById('battery-status-text');
    if (batteryStatusText && typeof navigator.getBattery === 'function') {
      navigator.getBattery().then(battery => {
        const updateBattery = () => {
          const level = Math.round(battery.level * 100);
          batteryStatusText.textContent = `${level}% ${battery.charging ? 'PWR' : 'BAT'}`;
        };
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
      }).catch(() => {});
    }

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenEnabled) return;
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

  renderStage() {
    if (!this.stageEl) return;

    if (this.currentPomoView) {
      this.currentPomoView.unmount();
      this.currentPomoView = null;
    }
    clockEngine.unmountAll();
    widgetEngine.unmountAll();

    const activeSpace = store.getActiveSpace();
    const clockConfig = store.getState().clockConfig;
    const layout = activeSpace.layout || 'standalone';

    if (layout === 'focus' || activeSpace.id === 'focus') {
      this.currentPomoView = new PomoFocusView(this.stageEl);
      return;
    }

    if (layout === 'standalone') {
      this.stageEl.innerHTML = `<div class="layout-standalone" id="standalone-clock-slot"></div>`;
      const slot = document.getElementById('standalone-clock-slot');
      clockEngine.mount(activeSpace.clockId || 'flip', slot, clockConfig, 'standalone');
      return;
    }

    if (layout === 'duo') {
      this.stageEl.innerHTML = `
        <div class="layout-duo">
          <div class="widget-panel" id="duo-panel-1"></div>
          <div class="widget-panel" id="duo-panel-2"></div>
        </div>
      `;
      const panel1 = document.getElementById('duo-panel-1');
      const panel2 = document.getElementById('duo-panel-2');
      const w1 = activeSpace.widgets?.[0] || 'clock';
      const w2 = activeSpace.widgets?.[1] || 'weather';

      if (w1 === 'clock' || clockEngine.registry.has(w1)) {
        clockEngine.mount(w1 === 'clock' ? (activeSpace.clockId || 'flip') : w1, panel1, clockConfig, 'duo-1');
      } else {
        widgetEngine.mount(w1, panel1, 'duo-1');
      }

      if (w2 === 'clock' || clockEngine.registry.has(w2)) {
        clockEngine.mount(w2 === 'clock' ? (activeSpace.clockId || 'flip') : w2, panel2, clockConfig, 'duo-2');
      } else {
        widgetEngine.mount(w2, panel2, 'duo-2');
      }
      return;
    }

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
      quadWidgets.slice(0, 4).forEach((widgetId, index) => {
        const slot = document.getElementById(`quad-panel-${index + 1}`);
        if (!slot) return;

        if (widgetId === 'clock' || clockEngine.registry.has(widgetId)) {
          clockEngine.mount(
            widgetId === 'clock' ? (activeSpace.clockId || 'flip') : widgetId,
            slot,
            clockConfig,
            `quad-${index + 1}`
          );
        } else {
          widgetEngine.mount(widgetId, slot, `quad-${index + 1}`);
        }
      });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.standbyApp = new App();
  });
} else {
  window.standbyApp = new App();
}

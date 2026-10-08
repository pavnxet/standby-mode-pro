import { store } from './state/store.js';
import { tursoSync } from './state/tursoSync.js';
import { registry } from './core/registry.js';
import { installModalRuntime } from './components/modalRuntime.js';
import { alarmScheduler } from './core/alarmScheduler.js';
import {
  registerServiceWorker,
  initInstallPromptCapture,
  isInstalled,
  onInstallPromptChange,
  promptInstall
} from './core/pwa.js';
import { clockEngine } from './engines/clockEngine.js';
import { widgetEngine } from './engines/widgetEngine.js';
import { soundEngine } from './engines/soundEngine.js';
import { visualizerEngine } from './engines/visualizerEngine.js';
import { wakeLockEngine } from './engines/wakeLockEngine.js';
import { burnInProtector } from './engines/burnInProtector.js';

// Clocks. One declarative index (FEATURE_PLAN.md A1) replaces the previous
// eleven hand-written imports, so adding a face touches exactly one file.
import { CLOCKS } from './clocks/index.js';

// Widgets. One declarative index (FEATURE_PLAN.md A1, applied to widgets) so
// both registries are fed from the same list and adding a widget touches one
// file. Covers the legacy nine, the Milestone 2 trio and the Milestone 3 seven.
import { WIDGETS } from './widgets/index.js';

// Components
import { SpacesNav } from './components/spacesNav.js';
import { StatsModal } from './components/statsModal.js';
import { CustomizeModal } from './components/customizeModal.js';
import { PhotoModal } from './components/photoModal.js';
import { NightModeController } from './components/nightModeController.js';
import { AudioMixer } from './components/audioMixer.js';
import { DimmingController } from './components/dimmingController.js';
import { KioskMode } from './features/kioskMode.js';
import { WakeLockResilience } from './engines/wakeLockResilience.js';
// Milestone 4, second pass.
import { BeatVisualiser } from './engines/beatVisualiser.js';
import { LiveBackgrounds } from './features/liveBackgrounds.js';
import { ScreenTimeoutRescue } from './core/screenTimeoutRescue.js';
import { profileFromEnvironment, applyProfile, columnsFor } from './core/deviceProfile.js';
// Milestone 5: theme engine, command palette, layout grid, permission centre.
import { applyTheme, currentThemeId, exportState, importState } from './core/themeEngine.js';
import { CommandSystem, toasts } from './core/commandPalette.js';
import { LayoutEngine } from './core/layoutEngine.js';
import { renderPermissionCentre } from './core/platform.js';
import { Screensaver } from './components/screensaver.js';
import { PomoFocusView } from './components/pomoFocusView.js';

class App {
  constructor() {
    this.stageEl = document.getElementById('main-stage');
    this.currentPomoView = null;
    this.init();
  }

  init() {
    // 1. Register every clock face.
    //
    // Two registries, one loop. Before this the two lists were written out by
    // hand and could drift; now FEATURE_PLAN.md A1's index is the single source
    // of truth and a face cannot land in one without the other.
    //
    // Registration stays eager so every legacy module keeps loading exactly as
    // before. The central registry exists to give one declarative view of what
    // is available and to accept lazy descriptors later without changing any
    // consumer.
    for (const { id, clock } of CLOCKS) {
      clockEngine.register(id, clock);
      registry.registerClock(id, clock);
    }

    // 2. Widgets reach BOTH registries from one list, for the same reason the
    //    clocks do (FEATURE_PLAN.md A1): a widget landing in one registry and
    //    not the other would render but never appear in the picker.
    for (const { id, widget } of WIDGETS) {
      widgetEngine.register(id, widget);
      registry.registerWidget(id, widget);
    }

    // 3. Initialize Visualizer & Ambient Canvas
    const canvas = document.getElementById('ambient-canvas-layer');
    if (canvas) {
      visualizerEngine.init(canvas);
      visualizerEngine.setMode(store.getState().vibes.visualizer || 'stars');
    }

    this.spacesNav = new SpacesNav(document.getElementById('spaces-nav-container'));
    this.statsModal = new StatsModal();
    this.customizeModal = new CustomizeModal();
    this.photoModal = new PhotoModal();
    this.nightMode = new NightModeController();
    this.screensaver = new Screensaver();

    // --- Milestone 4 controllers.
    //
    // Each mounts into a host element created lazily by mountHost() below, so a
    // page without those elements does not throw. The mixer in particular is
    // created unconditionally because the store subscription above references
    // it; it renders into a detached container when there is nowhere to show it.
    this.audioMixer = new AudioMixer(this.mountHost('audio-mixer-host'));
    this.dimming = new DimmingController();
    this.kiosk = new KioskMode(this.mountHost('kiosk-host'));
    this.wakeLock = new WakeLockResilience();

    // E4: the analyser energy source was built last pass; this draws it.
    // Attached to the same canvas the existing visualiser uses only if that
    // visualiser is not already drawing, so the two never fight over the same
    // pixels.
    this.beatVisualiser = null;
    const visualizerCanvas = document.getElementById('ambient-canvas-layer');
    if (visualizerCanvas && !store.getState().vibes.visualizer) {
      this.beatVisualiser = new BeatVisualiser(visualizerCanvas, {
        mode: store.getState().vibes.visualizer || 'bars'
      });
      this.beatVisualiser.start();
    }

    // E5: live canvas background, on its own layer behind everything.
    this.liveBackground = new LiveBackgrounds(
      document.getElementById('live-background-layer')
    );
    this.liveBackground.start();

    // F7: make tab-throttling failures visible instead of silent.
    this.timeoutRescue = new ScreenTimeoutRescue();

    // B4/F6: type scale and tap targets follow the device.
    this.applyDeviceProfile = this.applyDeviceProfile.bind(this);
    this.applyDeviceProfile();
    window.addEventListener('resize', this.applyDeviceProfile, { passive: true });

    // H2: the theme is applied before anything else reads a token, so the
    // palette, the grid and the widgets all restyle from one source rather
    // than each carrying their own copy of the colours.
    applyTheme(currentThemeId());

    // --- Milestone 5 controllers.
    //
    // `getWidgetIds` is a closure over the registry rather than a module-scope
    // read: the widget index is populated by a side-effecting import, and
    // reading it during construction would depend on import order.
    this.layout = new LayoutEngine({
      getColumns: () => columnsFor(this.deviceProfile || { columns: 3 }, this.layoutColumns),
      getWidgetIds: () => WIDGETS.map((entry) => entry.id)
    });
    this.layoutColumns = 3;

    // I2/I3/I5: one index of named actions, reachable by key and by typing. The
    // cheat sheet is generated from the same index, so it cannot go stale.
    this.commands = new CommandSystem(this.commandActions());
    toasts.mount(document.body);

    // I1/G6: the settings centre and the permission list are rendered into a
    // lazily-created host, so neither costs anything until the panel is opened.
    this.permissionHost = this.mountHost('permissions-host');

    // AUDIT.md §5.2 / §5.3: installs role="dialog", aria-modal, focus trap,
    // focus restore, Escape handling, and `inert` on the three closed modals.
    this.modals = installModalRuntime({
      'stats-modal': this.statsModal,
      'customize-modal': this.customizeModal,
      'photo-modal': this.photoModal
    });

    // Surface any non-fatal state-load problems (migration, corrupt JSON,
    // newer schema, storage unavailable) instead of failing silently.
    this.reportLoadWarnings();

    // 5. Initialize Live View Counter
    this.initViewsCounter();

    // 5. Initialize Wallpaper Layer
    this.updateWallpaper();
    store.subscribe((event) => {
      if (event === 'wallpaper_changed') {
        this.updateWallpaper();
      }
    });

    // 6. Initialize Hardware Protection & Screen Wake Lock
    burnInProtector.start();

    // 6b. Alarms. Absolute-time scheduling, so a throttled or frozen background
    // tab still fires every overdue alarm on return.
    alarmScheduler.start();

    // 6c. PWA: service worker plus the install affordance.
    this.initPwa();

    // Unlock Web Audio API on first user interaction
    const unlockAudio = () => {
      soundEngine.initContext();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });

    // 7. Auto-Sync Timers on Background Tab Resume / App Switch
    const syncOnResume = () => {
      if (document.visibilityState === 'visible') {
        store.syncPomoBackgroundDelta();
      }
    };
    document.addEventListener('visibilitychange', syncOnResume);
    window.addEventListener('focus', syncOnResume);

    // Save partial focus time if user closes tab or navigates away mid-session
    const flushOnLeave = () => {
      store.flushElapsedFocusTime();
    };
    window.addEventListener('beforeunload', flushOnLeave);
    window.addEventListener('pagehide', flushOnLeave);

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
        // E4: hand the mode to the beat visualiser too, so the choice reaches
        // whichever renderer owns the canvas.
        if (this.beatVisualiser) this.beatVisualiser.setMode(store.getState().vibes.visualizer);
      }
      if (event === 'live_background_updated') {
        this.liveBackground?.setStyle(store.getState().liveBackground);
      }
      if (event === 'device_profile_updated') {
        this.applyDeviceProfile();
      }
      if (event === 'theme_changed') {
        // H2: the store records the choice, the engine applies the tokens.
        // Split so that a restore from a backup goes through the same path as a
        // click in the picker - otherwise an imported theme would be recorded
        // but not visible.
        applyTheme(currentThemeId());
      }
      if (event === 'screensaver_updated') {
        // E7: re-render immediately if the screensaver is already up, so
        // changing the style does not require waiting for the next idle.
        if (this.screensaver?.isActive) this.screensaver.renderScreensaverContent();
      }
      if (event === 'breathing_pattern_updated') {
        // C13: the widget owns its own markup, so a pattern change is a
        // remount rather than a mutation of someone else's DOM.
        this.rerenderWidget('breathing');
      }
      if (event === 'layout_reordered' || event === 'layout_resized' ||
          event === 'layout_preset_applied' || event === 'layout_undone' ||
          event === 'layout_redone') {
        this.refreshWidgetOrder();
      }
      if (event === 'alarms_missed') {
        // F7. The rescue reports; the toast is how the reader finds out. Each
        // miss gets its own toast so two alarms are not collapsed into one
        // message that only names the first.
        for (const miss of (event.payload || [])) {
          toasts.show(`Alarm for ${String(miss.alarm.hour).padStart(2, '0')}:${String(miss.alarm.minute).padStart(2, '0')} was missed. ${miss.reason}`, { tone: 'warn' });
        }
      }
      if (event === 'vibe_changed') {
        // E2: a legacy single-track change is translated into a one-layer mix,
        // so the pre-E2 spaces (which store a bare `vibe` string) keep working
        // unchanged while the mixer gains per-layer control.
        this.audioMixer.applyMix();
      }
      if (event === 'ambience_mix_updated' || event === 'mixer_volume_updated') {
        this.audioMixer.applyMix();
      }
      if (event === 'sleep_timer_updated') {
        // The mixer owns the fade; this only needs to stop a ramp in flight
        // when the timer was cancelled rather than fired.
        if (!store.getState().vibes.sleepTimer.endsAtMs) soundEngine.cancelFade();
      }
    });

    // 8. Render Initial Active Stage
    this.renderStage();
  }

  /**
   * B4/F6 - re-derives the device profile and applies it.
   *
   * Bound in the constructor so it can be removed from `resize` by identity.
   */
  applyDeviceProfile() {
    const forced = store.getState().deviceProfile;
    const { profile } = profileFromEnvironment(forced);
    applyProfile(profile);
    this.deviceProfile = profile;

    // The profile is a ceiling on the grid, so a stored three-column layout
    // has to be re-clamped when the viewport crosses a boundary. Without this,
    // rotating a tablet would leave three columns on a phone-width screen.
    this.layoutColumns = columnsFor(profile, this.layoutColumns || profile.columns);
  }

  /**
   * The command index's callbacks (I2/I3).
   *
   * Every one is guarded rather than assumed. A command that throws when its
   * precondition is missing - fullscreen on a browser that refuses it, an
   * export with nothing to export - would surface as a dead key with no
   * explanation, which is worse than a key that reports why it did nothing.
   *
   * @returns {object} the actions object handed to CommandSystem
   */
  commandActions() {
    return {
      openPalette: () => this.commands?.openPalette(),
      showCheatsheet: () => this.commands?.openCheatsheet(),
      openSettings: () => this.openSettingsPanel?.(),

      toggleNight: () => store.toggleNightMode(),

      toggleFullscreen: () => {
        try {
          if (document.fullscreenElement) {
            document.exitFullscreen?.();
          } else if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch((err) => {
              // Fullscreen needs a direct user gesture in some browsers, and a
              // keypress from the palette may not count.
              toasts.show(`Fullscreen was refused: ${err.message}`, { tone: 'warn' });
            });
          } else {
            toasts.show('This browser cannot go fullscreen.', { tone: 'warn' });
          }
        } catch (err) {
          toasts.show('Fullscreen is unavailable here.', { tone: 'warn' });
        }
      },

      toggleKiosk: () => store.setKioskMode({ enabled: !store.getState().kiosk?.enabled }),

      stopAudio: () => {
        store.clearAmbienceMix();
        toasts.show('Ambient sound stopped.', { tone: 'info' });
      },

      setTheme: (id) => {
        store.setTheme(id);
        applyTheme(id);
      },

      // Space navigation walks the declared order rather than incrementing an
      // index, so a removed or reordered space cannot land on a missing one.
      nextSpace: () => this.stepSpace(1),
      prevSpace: () => this.stepSpace(-1)
    };
  }

  /**
   * Moves to the next or previous space in the declared order.
   *
   * Wraps, because a wall display has no scroll gesture to overshoot with.
   */
  stepSpace(direction) {
    const spaces = store.getState().spaces || {};
    const ids = Object.keys(spaces);
    if (ids.length < 2) return false;

    const current = store.getState().activeSpaceId;
    const at = ids.indexOf(current);
    // An unknown active id means the saved space was removed; start from the
    // beginning rather than landing somewhere arbitrary.
    const next = ids[(Math.max(0, at) + direction + ids.length) % ids.length];
    if (!spaces[next]) return false;

    store.setActiveSpace(next);
    this.renderStage();
    return true;
  }

  /**
   * C13 - remounts one widget.
   *
   * `widgetEngine` has no `rerender`, so this is unmount-then-mount. Guarded on
   * the id being present, because a layout that has not added `breathing` yet
   * must not throw here - a pattern change is not worth breaking the page over.
   */
  rerenderWidget(id) {
    const space = store.getActiveSpace();
    if (!Array.isArray(space?.widgets) || !space.widgets.includes(id)) return false;
    try {
      widgetEngine.unmount(id);
      widgetEngine.mount(id);
      return true;
    } catch (err) {
      // A widget that throws on mount should not take the whole layout with it.
      console.error(`[app] remounting "${id}" failed:`, err);
      return false;
    }
  }

  /**
   * B1/B2 - rebuilds the widget grid after an order or span change.
   *
   * Dispatched rather than subscribed per-widget so there is exactly one place
   * that decides what a layout change means.
   */
  refreshWidgetOrder() {
    try {
      widgetEngine.unmountAll();
      this.renderStage();
    } catch (err) {
      console.error('[app] refreshing the layout failed:', err);
    }
  }

  /**
   * Returns the element with the given id, creating it if absent.
   *
   * The Milestone 4 surfaces (mixer, kiosk) need a host in the DOM. Adding them
   * as required elements to index.html would mean every existing page and every
   * test fixture grows two empty divs; creating them on demand keeps the
   * controllers working when they are absent.
   *
   * @param {string} id
   * @returns {HTMLElement|null} null when there is no document at all.
   */
  mountHost(id) {
    if (typeof document === 'undefined' || !document.body) return null;

    let host = document.getElementById(id);
    if (host) return host;

    host = document.createElement('div');
    host.id = id;
    // Hidden by default: the mixer is reachable from the settings panel, and a
    // permanently visible control cluster would compete with the clock.
    host.className = 'm4-host';
    host.hidden = true;
    document.body.appendChild(host);
    return host;
  }

  /**
   * Registers the service worker and wires an install affordance plus an
   * offline indicator. Every path is relative so this resolves identically at
   * the GitHub Pages sub-path and at the Vercel root.
   */
  initPwa() {
    initInstallPromptCapture();

    registerServiceWorker({
      onState: (state) => {
        if (state === 'update-available') {
          // Do not swap the app out mid-session; tell the user instead.
          window.__STANDBY_SW_UPDATE__ = true;
        }
      }
    });

    // Offline indicator. The clock itself keeps working offline; only the
    // networked widgets degrade, which is what this communicates.
    const syncOnline = () => document.body.classList.toggle('is-offline', !navigator.onLine);
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    syncOnline();

    if (isInstalled()) return;

    onInstallPromptChange(({ available, installed }) => {
      if (installed || !available) return;
      this.showInstallBanner();
    });

    // The banner also appears once, on first visit, so a user who never
    // triggers beforeinstallprompt still learns the app is installable.
    if (!localStorage.getItem('standby_install_dismissed')) {
      setTimeout(() => this.showInstallBanner(), 6000);
    }
  }

  showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.className = 'pwa-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Install this app');

    const text = document.createElement('span');
    text.textContent = 'Install for offline use';

    const installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.textContent = 'Install';
    installBtn.addEventListener('click', async () => {
      const { outcome } = await promptInstall();
      if (outcome !== 'accepted') banner.remove();
    });

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'pwa-banner__dismiss';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss install prompt');
    dismiss.addEventListener('click', () => {
      try { localStorage.setItem('standby_install_dismissed', '1'); } catch (e) {}
      banner.remove();
    });

    banner.append(text, installBtn, dismiss);
    document.getElementById('app-shell').prepend(banner);
  }

  reportLoadWarnings() {
    const warnings = typeof store.getLoadWarnings === 'function' ? store.getLoadWarnings() : [];
    if (!warnings.length) return;
    console.warn('[StandBy] Settings load notices:', warnings);
    // The toast system is not built yet (FEATURE_PLAN I5); until it is, the
    // console is the only channel, and this is recorded rather than swallowed.
    window.__STANDBY_LOAD_WARNINGS__ = warnings;
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

  async initViewsCounter() {
    const countEl = document.getElementById('global-views-count');
    if (!countEl) return;

    // 1. Initial immediate display from local cache
    let currentCount = 1;
    try {
      const stored = localStorage.getItem('standby_site_views');
      currentCount = Math.max(1, (parseInt(stored, 10) || 0) + 1);
      localStorage.setItem('standby_site_views', String(currentCount));
    } catch (e) {}
    countEl.textContent = currentCount.toLocaleString();

    // 2. Query Public Shared Cloud Counter (Increment Global Viewers Across All Devices)
    const namespace = "pavnxet_standby_mode_pro";
    const key = "pageviews";
    let globalCount = null;

    // Primary Cloud Provider: CounterAPI.dev (Public CORS REST API)
    try {
      const res = await fetch(`https://api.counterapi.dev/v1/${namespace}/${key}/up`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        mode: "cors"
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.count !== undefined || data.value !== undefined)) {
          globalCount = data.count !== undefined ? data.count : data.value;
        }
      }
    } catch (e) {
      // Secondary Cloud Provider: Abacus Integer API
      try {
        const res2 = await fetch(`https://abacus.jasoncameron.dev/hit/${namespace}/${key}`, {
          method: "GET",
          headers: { "Accept": "application/json" },
          mode: "cors"
        });
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2 && data2.value !== undefined) {
            globalCount = data2.value;
          }
        }
      } catch (e2) {}
    }

    // 3. Update DOM with shared global count if received
    if (globalCount !== null && globalCount > 0) {
      countEl.textContent = Number(globalCount).toLocaleString();
      try {
        localStorage.setItem('standby_site_views', String(globalCount));
      } catch (e) {}
      return;
    }

    // 4. Optional Turso DB Cloud Fallback if user configured their own sync
    const cfg = store.getState().tursoConfig;
    if (cfg && cfg.url && cfg.token) {
      try {
        const cloudCount = await tursoSync.incrementGlobalViews();
        if (cloudCount !== null && cloudCount > 0) {
          countEl.textContent = Number(cloudCount).toLocaleString();
        }
      } catch (e) {}
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

// Global Launcher & Testing Hooks
window.__STANDBY_STORE__ = store;
window.__TURSO_SYNC__ = tursoSync;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.standbyApp = new App();
  });
} else {
  window.standbyApp = new App();
}


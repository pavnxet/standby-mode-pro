const STORAGE_KEY = "standby_mode_pro_v1";

const defaultState = {
  activeSpaceId: "home",
  keepScreenAwake: true,
  tursoConfig: {
    url: "",
    token: "",
    autoSync: true,
    lastSyncedAt: null,
    isConnected: false,
    isSyncing: false,
    lastError: null
  },
  stats: {
    history: [
      { id: "s1", stage: "focus", duration: 25, timestamp: Date.now() - 7200000, dateStr: new Date().toISOString().split('T')[0], timeStr: "02:15 PM" },
      { id: "s2", stage: "focus", duration: 25, timestamp: Date.now() - 3600000, dateStr: new Date().toISOString().split('T')[0], timeStr: "03:00 PM" }
    ],
    dailyTotals: {},
    streakDays: 1
  },
  spaces: {
    home: {
      id: "home",
      name: "Home",
      icon: "home",
      layout: "standalone",
      clockId: "flip",
      widgets: ["weather", "calendar"],
      quadWidgets: ["weather", "calendar", "media", "timer"],
      vibe: "none",
      themeColor: "#3b82f6"
    },
    work: {
      id: "work",
      name: "Work",
      icon: "briefcase",
      layout: "duo",
      clockId: "day",
      widgets: ["calendar", "todo"],
      quadWidgets: ["day", "calendar", "todo", "tally"],
      vibe: "binaural",
      themeColor: "#10b981"
    },
    focus: {
      id: "focus",
      name: "Focus",
      icon: "target",
      layout: "focus",
      clockId: "flip",
      widgets: ["timer", "quote"],
      quadWidgets: ["flip", "timer", "quote", "todo"],
      vibe: "rain",
      themeColor: "#a855f7"
    },
    night: {
      id: "night",
      name: "Night",
      icon: "moon",
      layout: "standalone",
      clockId: "segmented",
      widgets: ["weather", "timer"],
      quadWidgets: ["segmented", "weather", "timer", "vibes"],
      vibe: "waves",
      themeColor: "#ff3b30"
    }
  },
  clockConfig: {
    is24Hour: false,
    showSeconds: true,
    showDate: true,
    fontFamily: "var(--font-sans)",
    accentColor: "#3b82f6",
    glowIntensity: 1,
    tickSound: true,
    tickVolume: 0.85
  },
  pomoState: {
    stage: "focus",
    remainingSeconds: 1500,
    totalSeconds: 1500,
    isRunning: false,
    targetEndTime: null,
    currentCycle: 1,
    totalCompletedSessions: 0,
    settings: {
      focusDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      autoStartBreaks: false,
      autoStartPomo: false,
      tickSound: true,
      tickVolume: 0.85,
      alarmSound: true
    }
  },
  nightMode: {
    enabled: false,
    tint: "red",
    dimLevel: 0.75
  },
  burnInProtection: {
    enabled: true,
    intervalMinutes: 1
  },
  screensaver: {
    enabled: true,
    idleSeconds: 120,
    style: "clock"
  },
  wallpaper: {
    enabled: false,
    activeUrl: "",
    blur: 6,
    dim: 0.5
  },
  vibes: {
    activeTrack: "none",
    volume: 0.65,
    visualizer: "stars"
  },
  mediaState: {
    isPlaying: false,
    currentTrackIndex: 0,
    progressPercent: 35,
    volume: 0.8
  },
  todos: [
    { id: "1", text: "Morning Deep Focus Sprint", completed: true },
    { id: "2", text: "Architecture & Code Review", completed: false },
    { id: "3", text: "Pomodoro Milestone 4/4", completed: false },
    { id: "4", text: "Evening Walk & Recharge", completed: false }
  ],
  tallies: {
    focusSessions: 4,
    water: 3
  }
};

export class Store {
  constructor() {
    this.listeners = new Set();
    this.state = this.loadState();
  }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          keepScreenAwake: parsed.keepScreenAwake !== undefined ? parsed.keepScreenAwake : true,
          tursoConfig: {
            ...defaultState.tursoConfig,
            ...(parsed.tursoConfig || {})
          },
          stats: {
            ...defaultState.stats,
            ...(parsed.stats || {})
          },
          pomoState: {
            ...defaultState.pomoState,
            ...(parsed.pomoState || {}),
            settings: {
              ...defaultState.pomoState.settings,
              ...((parsed.pomoState && parsed.pomoState.settings) || {})
            }
          }
        };
      }
    } catch (e) {
      console.warn("LocalStorage unavailable:", e);
    }
    return defaultState;
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {}
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(key, payload) {
    this.saveState();
    for (const listener of this.listeners) {
      try {
        listener(key, payload, this.state);
      } catch (err) {
        console.error("Store listener error:", err);
      }
    }
  }

  // --- Turso Cloud Sync Actions ---
  updateTursoConfig(updates) {
    this.state.tursoConfig = { ...this.state.tursoConfig, ...updates };
    this.notify("turso_config_updated", this.state.tursoConfig);
  }

  triggerTursoSync() {
    this.notify("turso_sync_triggered", Date.now());
  }

  mergeCloudState(cloudState) {
    if (!cloudState) return;
    if (cloudState.spaces) this.state.spaces = cloudState.spaces;
    if (cloudState.clockConfig) this.state.clockConfig = cloudState.clockConfig;
    if (cloudState.pomoSettings) this.state.pomoState.settings = cloudState.pomoSettings;
    if (cloudState.todos) this.state.todos = cloudState.todos;
    if (cloudState.tallies) this.state.tallies = cloudState.tallies;
    if (cloudState.stats) {
      this.state.stats = {
        ...this.state.stats,
        ...cloudState.stats,
        history: Array.from(new Set([...(this.state.stats.history || []), ...(cloudState.stats.history || [])].map(s => JSON.stringify(s)))).map(s => JSON.parse(s))
      };
    }
    this.notify("cloud_state_merged", this.state);
  }

  // --- Statistics & Progress Recording ---
  recordCompletedSession(stage, durationMinutes) {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (!this.state.stats) {
      this.state.stats = { history: [], dailyTotals: {}, streakDays: 1 };
    }
    if (!this.state.stats.history) this.state.stats.history = [];
    if (!this.state.stats.dailyTotals) this.state.stats.dailyTotals = {};

    const sessionItem = {
      id: "pomo_" + Date.now(),
      stage,
      duration: durationMinutes,
      timestamp: Date.now(),
      dateStr,
      timeStr
    };

    this.state.stats.history.unshift(sessionItem);
    // Keep max 100 in history
    if (this.state.stats.history.length > 100) {
      this.state.stats.history.pop();
    }

    // Update Daily Totals
    if (!this.state.stats.dailyTotals[dateStr]) {
      this.state.stats.dailyTotals[dateStr] = { focusMinutes: 0, sessions: 0, water: 0 };
    }

    if (stage === "focus") {
      this.state.stats.dailyTotals[dateStr].focusMinutes += durationMinutes;
      this.state.stats.dailyTotals[dateStr].sessions += 1;
      this.incrementTally("focusSessions", 1);
    }

    // Calculate Consecutive Day Streak
    const dates = Object.keys(this.state.stats.dailyTotals).sort().reverse();
    let streak = 0;
    let checkDate = new Date();

    for (let i = 0; i < 365; i++) {
      const dStr = checkDate.toISOString().split("T")[0];
      if (this.state.stats.dailyTotals[dStr] && this.state.stats.dailyTotals[dStr].focusMinutes > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (i === 0) {
          // If today has no focus minutes yet, check yesterday before breaking
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
    }
    this.state.stats.streakDays = Math.max(1, streak);

    this.notify("stats_updated", this.state.stats);
  }

  toggleScreenWakeLock(force) {
    this.state.keepScreenAwake = force !== undefined ? force : !this.state.keepScreenAwake;
    this.notify("wake_lock_toggled", this.state.keepScreenAwake);
  }

  setActiveSpace(spaceId) {
    if (this.state.spaces[spaceId]) {
      this.state.activeSpaceId = spaceId;
      const space = this.state.spaces[spaceId];
      if (space.vibe && space.vibe !== "none") {
        this.state.vibes.activeTrack = space.vibe;
      }
      this.notify("space_changed", space);
    }
  }

  getActiveSpace() {
    return this.state.spaces[this.state.activeSpaceId] || this.state.spaces.home;
  }

  updateActiveSpace(updates) {
    const spaceId = this.state.activeSpaceId;
    this.state.spaces[spaceId] = { ...this.state.spaces[spaceId], ...updates };
    this.notify("space_updated", this.state.spaces[spaceId]);
  }

  setLayout(layout) {
    this.updateActiveSpace({ layout });
  }

  setClock(clockId) {
    this.updateActiveSpace({ clockId });
  }

  setWidgets(widgets) {
    this.updateActiveSpace({ widgets });
  }

  // --- Wallpaper Actions ---
  setWallpaper(url, blur = 6, dim = 0.5) {
    this.state.wallpaper = {
      enabled: true,
      activeUrl: url,
      blur: Number.isFinite(blur) ? blur : (this.state.wallpaper.blur || 6),
      dim: Number.isFinite(dim) ? dim : (this.state.wallpaper.dim || 0.5)
    };
    this.notify("wallpaper_changed", this.state.wallpaper);
  }

  clearWallpaper() {
    this.state.wallpaper.enabled = false;
    this.state.wallpaper.activeUrl = "";
    this.notify("wallpaper_changed", this.state.wallpaper);
  }

  updateWallpaperSettings(updates) {
    this.state.wallpaper = { ...this.state.wallpaper, ...updates };
    this.notify("wallpaper_changed", this.state.wallpaper);
  }

  setTickVolume(volume) {
    const val = Math.max(0, Math.min(1, parseFloat(volume) || 0));
    this.state.clockConfig.tickVolume = val;
    if (this.state.pomoState && this.state.pomoState.settings) {
      this.state.pomoState.settings.tickVolume = val;
    }
    this.notify("clock_config_updated", this.state.clockConfig);
  }

  updateClockConfig(updates) {
    this.state.clockConfig = { ...this.state.clockConfig, ...updates };
    this.notify("clock_config_updated", this.state.clockConfig);
  }

  // --- Pomodoro State Actions ---
  setPomoStage(stage, manualMinutes = null) {
    const s = this.state.pomoState;
    s.stage = stage;
    s.isRunning = false;
    s.targetEndTime = null;
    let minutes = manualMinutes;
    if (minutes === null) {
      if (stage === "focus") minutes = s.settings.focusDuration;
      else if (stage === "shortBreak") minutes = s.settings.shortBreakDuration;
      else if (stage === "longBreak") minutes = s.settings.longBreakDuration;
    }
    s.remainingSeconds = minutes * 60;
    s.totalSeconds = minutes * 60;
    this.notify("pomo_updated", s);
  }

  togglePomoRunning(force) {
    const s = this.state.pomoState;
    s.isRunning = force !== undefined ? force : !s.isRunning;
    if (s.isRunning) {
      s.targetEndTime = Date.now() + (s.remainingSeconds * 1000);
    } else {
      s.targetEndTime = null;
    }
    this.notify("pomo_updated", s);
  }

  syncPomoBackgroundDelta() {
    const s = this.state.pomoState;
    if (!s.isRunning || !s.targetEndTime) return false;
    const now = Date.now();
    const diff = Math.round((s.targetEndTime - now) / 1000);

    if (diff <= 0) {
      s.remainingSeconds = 0;
      s.targetEndTime = null;
      return this.tickPomo();
    } else {
      s.remainingSeconds = diff;
      this.notify("pomo_tick", s);
      return false;
    }
  }

  tickPomo() {
    const s = this.state.pomoState;
    if (!s.isRunning) return false;

    if (s.targetEndTime) {
      const now = Date.now();
      const diff = Math.round((s.targetEndTime - now) / 1000);
      s.remainingSeconds = Math.max(0, diff);
    } else {
      s.remainingSeconds = Math.max(0, s.remainingSeconds - 1);
    }

    if (s.remainingSeconds > 0) {
      this.notify("pomo_tick", s);
      return false;
    } else {
      // Stage finished -> Record stats
      s.isRunning = false;
      s.targetEndTime = null;
      const completedStage = s.stage;
      const completedDuration = Math.round(s.totalSeconds / 60);
      this.recordCompletedSession(completedStage, completedDuration);

      if (s.stage === "focus") {
        s.totalCompletedSessions++;
        const isLong = (s.totalCompletedSessions % s.settings.longBreakInterval) === 0;
        s.stage = isLong ? "longBreak" : "shortBreak";
        const nextMin = isLong ? s.settings.longBreakDuration : s.settings.shortBreakDuration;
        s.remainingSeconds = nextMin * 60;
        s.totalSeconds = nextMin * 60;
        if (s.settings.autoStartBreaks) {
          s.isRunning = true;
          s.targetEndTime = Date.now() + (s.remainingSeconds * 1000);
        }
      } else {
        s.stage = "focus";
        s.remainingSeconds = s.settings.focusDuration * 60;
        s.totalSeconds = s.settings.focusDuration * 60;
        if (s.settings.autoStartPomo) {
          s.isRunning = true;
          s.targetEndTime = Date.now() + (s.remainingSeconds * 1000);
        }
      }
      this.notify("pomo_completed", s);
      return true;
    }
  }

  resetPomo() {
    const s = this.state.pomoState;
    s.isRunning = false;
    let minutes = s.settings.focusDuration;
    if (s.stage === "shortBreak") minutes = s.settings.shortBreakDuration;
    else if (s.stage === "longBreak") minutes = s.settings.longBreakDuration;
    s.remainingSeconds = minutes * 60;
    s.totalSeconds = minutes * 60;
    this.notify("pomo_updated", s);
  }

  updatePomoSettings(newSettings) {
    const s = this.state.pomoState;
    s.settings = { ...s.settings, ...newSettings };
    if (!s.isRunning) {
      this.resetPomo();
    }
    this.notify("pomo_settings_updated", s);
  }

  toggleNightMode(forceState) {
    this.state.nightMode.enabled = forceState !== undefined ? forceState : !this.state.nightMode.enabled;
    this.notify("night_mode_toggled", this.state.nightMode);
  }

  updateScreensaverConfig(updates) {
    this.state.screensaver = { ...this.state.screensaver, ...updates };
    this.notify("screensaver_updated", this.state.screensaver);
  }

  setVibe(vibeId) {
    this.state.vibes.activeTrack = vibeId;
    this.updateActiveSpace({ vibe: vibeId });
    this.notify("vibe_changed", this.state.vibes);
  }

  setVisualizer(visId) {
    this.state.vibes.visualizer = visId;
    this.notify("visualizer_changed", visId);
  }

  toggleTodo(id) {
    this.state.todos = this.state.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    this.notify("todos_updated", this.state.todos);
  }

  addTodo(text) {
    if (!text || !text.trim()) return;
    const newTodo = { id: Date.now().toString(), text: text.trim(), completed: false };
    this.state.todos.push(newTodo);
    this.notify("todos_updated", this.state.todos);
  }

  deleteTodo(id) {
    this.state.todos = this.state.todos.filter(t => t.id !== id);
    this.notify("todos_updated", this.state.todos);
  }

  incrementTally(key, step = 1) {
    this.state.tallies[key] = (this.state.tallies[key] || 0) + step;
    this.notify("tally_updated", this.state.tallies);
  }

  resetTally(key) {
    this.state.tallies[key] = 0;
    this.notify("tally_updated", this.state.tallies);
  }
}

export const store = new Store();

/* StandBy Mode Pro - Central Reactive State Manager
 *
 * Persistence is owned by js/core/schema.js (schema versioning + migration).
 * Before that module existed this file had no version field at all and only
 * shallow-merged `currentUser`, `tursoConfig`, `stats` and `pomoState`, which
 * meant a saved payload missing any other key produced `undefined` for that key.
 * loadState() now delegates to the migration engine, which deep-merges every
 * top-level key.
 */
import {
  SCHEMA_VERSION,
  loadPersistedState,
  savePersistedState,
  deepMerge,
  isPlainObject
} from "../core/schema.js";
import { applyAccessibilitySettings } from "../core/a11y.js";

const defaultState = {
  activeSpaceId: "home",
  keepScreenAwake: true,
  currentUser: {
    userId: "",
    displayName: "Focus User",
    createdAt: Date.now()
  },
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
      { id: "s1", stage: "focus", duration: 25, timestamp: Date.now() - 7200000, dateStr: new Date().toISOString().split('T')[0], monthStr: new Date().toISOString().substring(0, 7), yearInt: new Date().getFullYear(), timeStr: "02:15 PM" },
      { id: "s2", stage: "focus", duration: 25, timestamp: Date.now() - 3600000, dateStr: new Date().toISOString().split('T')[0], monthStr: new Date().toISOString().substring(0, 7), yearInt: new Date().getFullYear(), timeStr: "03:00 PM" }
    ],
    dailyTotals: {},
    monthlyTotals: {},
    yearlyTotals: {},
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
    sessionStartTime: null,
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
    /** Non-fatal load problems worth surfacing to the user. */
    this.loadWarnings = [];
    this.state = this.loadState();

    // Apply accessibility preferences from the very first paint of JS so the
    // user never sees a flash of the wrong contrast or motion setting.
    applyAccessibilitySettings(this.state.accessibility);
  }

  loadState() {
    this.loadWarnings = [];

    let storage = null;
    try {
      storage = window.localStorage;
      // Probe once: Safari private mode throws on access, not just on write.
      storage.getItem("standby_user_id");
    } catch (e) {
      this.loadWarnings.push("Browser storage is unavailable. Settings will not persist this session.");
      storage = null;
    }

    if (storage) {
      const result = loadPersistedState(storage, defaultState, SCHEMA_VERSION);

      if (result.error) {
        const isTooNew = result.error.code === "SCHEMA_TOO_NEW";
        this.loadWarnings.push(result.error.message);
        if (isTooNew) {
          // Never reset a newer payload. Boot with defaults and tell the user.
          return this._withIdentity({ ...defaultState });
        }
      }

      if (result.state) {
        if (result.migrated) {
          this.loadWarnings.push("Settings upgraded to the latest format. Your original data was kept.");
          // Write the migrated payload under the new key. The legacy key stays
          // untouched on purpose so a failed write never loses the original.
          savePersistedState(storage, result.state);
        }
        return this._withIdentity(result.state);
      }
    }

    return this._withIdentity({ ...defaultState });
  }

  /** Guarantees a valid, persisted user id on every state object. */
  _withIdentity(state) {
    const next = state;
    const currentUser = isPlainObject(next.currentUser) ? { ...next.currentUser } : {};

    let userId = currentUser.userId;
    if (!userId) {
      try {
        userId = window.localStorage.getItem("standby_user_id");
      } catch (e) { /* storage unavailable */ }

      if (!userId) {
        userId = "usr_" + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).slice(-4);
        try { window.localStorage.setItem("standby_user_id", userId); } catch (e) {}
      }
    }

    next.currentUser = {
      userId,
      displayName: currentUser.displayName || ("User " + String(userId).slice(-4).toUpperCase()),
      createdAt: currentUser.createdAt || Date.now()
    };

    next.keepScreenAwake = next.keepScreenAwake !== undefined ? next.keepScreenAwake : true;
    next.schema = {
      version: SCHEMA_VERSION,
      migratedFrom: (next.schema && next.schema.migratedFrom) || SCHEMA_VERSION,
      migratedAt: (next.schema && next.schema.migratedAt) || null
    };

    return next;
  }

  saveState() {
    try {
      const result = savePersistedState(window.localStorage, this.state);
      if (!result.ok && result.error && result.error.name !== "QuotaExceededError") {
        console.warn("State could not be saved:", result.error);
      }
      return result;
    } catch (e) {
      console.warn("LocalStorage unavailable:", e);
      return { ok: false, error: e };
    }
  }

  /** Returns the list of non-fatal load problems. Empty on a clean load. */
  getLoadWarnings() {
    return this.loadWarnings.slice();
  }

  /** Destructive reset. Used by Settings → Reset and by the Backup module. */
  resetToDefaults() {
    this.state = this._withIdentity({ ...defaultState });
    this.notify("state_reset", this.state);
    return this.state;
  }

  /**
   * Replaces state from a validated backup payload (js/core/backup.js).
   * Refuses unknown schema versions rather than silently discarding user data.
   */
  replaceState(incoming, { preserveIdentity = true } = {}) {
    if (!isPlainObject(incoming)) {
      throw new TypeError("replaceState expects a plain object");
    }
    const incomingVersion = isPlainObject(incoming.schema) ? incoming.schema.version : undefined;
    if (incomingVersion !== undefined && incomingVersion > SCHEMA_VERSION) {
      throw new Error(
        `Backup uses schema v${incomingVersion}; this build supports v${SCHEMA_VERSION}.`
      );
    }
    const preservedId = preserveIdentity ? this.state.currentUser.userId : null;
    const merged = deepMerge(defaultState, incoming);
    this.state = this._withIdentity(merged);
    if (preservedId) this.state.currentUser.userId = preservedId;
    this.notify("state_restored", this.state);
    return this.state;
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

  setUserId(newUserId, newDisplayName) {
    if (!newUserId || !newUserId.trim()) return;
    const cleanId = newUserId.trim();
    this.state.currentUser.userId = cleanId;
    if (newDisplayName) {
      this.state.currentUser.displayName = newDisplayName.trim();
    }
    try {
      localStorage.setItem("standby_user_id", cleanId);
    } catch (e) {}
    this.notify("user_switched", this.state.currentUser);
  }

  // --- Statistics & Progress Recording ---
  recordCompletedSession(stage, durationMinutes) {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const monthStr = dateStr.substring(0, 7); // YYYY-MM
    const yearInt = now.getFullYear();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (!this.state.stats) {
      this.state.stats = { history: [], dailyTotals: {}, monthlyTotals: {}, yearlyTotals: {}, streakDays: 1 };
    }
    if (!this.state.stats.history) this.state.stats.history = [];
    if (!this.state.stats.dailyTotals) this.state.stats.dailyTotals = {};
    if (!this.state.stats.monthlyTotals) this.state.stats.monthlyTotals = {};
    if (!this.state.stats.yearlyTotals) this.state.stats.yearlyTotals = {};

    const sessionItem = {
      id: "pomo_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      stage,
      duration: durationMinutes,
      timestamp: Date.now(),
      dateStr,
      monthStr,
      yearInt,
      timeStr
    };

    this.state.stats.history.unshift(sessionItem);
    // Keep max 200 in local history
    if (this.state.stats.history.length > 200) {
      this.state.stats.history.pop();
    }

    this.recalculateAggregates();
    this.notify("stats_updated", this.state.stats);
  }

  // Recalculate dailyTotals, monthlyTotals, yearlyTotals, and streak from history
  recalculateAggregates() {
    if (!this.state.stats) {
      this.state.stats = { history: [], dailyTotals: {}, monthlyTotals: {}, yearlyTotals: {}, streakDays: 1 };
    }
    const history = this.state.stats.history || [];
    const dailyTotals = {};
    const monthlyTotals = {};
    const yearlyTotals = {};

    for (const s of history) {
      if (s.stage === "focus") {
        const dStr = s.dateStr || new Date(s.timestamp).toISOString().split("T")[0];
        const mStr = s.monthStr || dStr.substring(0, 7);
        const yStr = String(s.yearInt || dStr.substring(0, 4) || new Date().getFullYear());
        const dur = parseInt(s.duration, 10) || 0;

        if (!dailyTotals[dStr]) dailyTotals[dStr] = { focusMinutes: 0, sessions: 0, water: 0 };
        dailyTotals[dStr].focusMinutes += dur;
        dailyTotals[dStr].sessions += 1;

        if (!monthlyTotals[mStr]) monthlyTotals[mStr] = { focusMinutes: 0, sessions: 0 };
        monthlyTotals[mStr].focusMinutes += dur;
        monthlyTotals[mStr].sessions += 1;

        if (!yearlyTotals[yStr]) yearlyTotals[yStr] = { focusMinutes: 0, sessions: 0 };
        yearlyTotals[yStr].focusMinutes += dur;
        yearlyTotals[yStr].sessions += 1;
      }
    }

    // Recalculate streak
    let streak = 0;
    let checkDate = new Date();
    for (let i = 0; i < 365; i++) {
      const dStr = checkDate.toISOString().split("T")[0];
      if (dailyTotals[dStr] && dailyTotals[dStr].focusMinutes > 0) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (i === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
    }

    this.state.stats.dailyTotals = dailyTotals;
    this.state.stats.monthlyTotals = monthlyTotals;
    this.state.stats.yearlyTotals = yearlyTotals;
    this.state.stats.streakDays = Math.max(1, streak);
  }

  // Delete a session (e.g. ghost session recorded by mistake)
  deleteSession(sessionId) {
    if (!sessionId || !this.state.stats || !this.state.stats.history) return false;
    const initialLen = this.state.stats.history.length;
    this.state.stats.history = this.state.stats.history.filter(s => s.id !== sessionId);
    if (this.state.stats.history.length !== initialLen) {
      this.recalculateAggregates();
      this.notify("stats_updated", this.state.stats);
      this.notify("session_deleted", { sessionId });
      return true;
    }
    return false;
  }

  // Edit duration of an existing session
  editSessionDuration(sessionId, newDurationMinutes) {
    if (!sessionId || !this.state.stats || !this.state.stats.history) return false;
    const dur = Math.max(1, parseInt(newDurationMinutes, 10) || 1);
    const session = this.state.stats.history.find(s => s.id === sessionId);
    if (session) {
      session.duration = dur;
      this.recalculateAggregates();
      this.notify("stats_updated", this.state.stats);
      this.notify("session_updated", { sessionId, newDuration: dur });
      return true;
    }
    return false;
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

  // Flush and record elapsed focus time (e.g. if user stops at 20m of a 50m session)
  flushElapsedFocusTime() {
    const s = this.state.pomoState;
    if (s.stage !== "focus" || !s.sessionStartTime) return 0;
    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.round((now - s.sessionStartTime) / 1000));
    s.sessionStartTime = null;

    // Minimum 1 full minute (60s) needed to count as valid focus time
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes >= 1) {
      this.recordCompletedSession("focus", elapsedMinutes);
      return elapsedMinutes;
    }
    return 0;
  }

  // --- Pomodoro State Actions ---
  setPomoStage(stage, manualMinutes = null) {
    const s = this.state.pomoState;
    if (s.isRunning && s.stage === "focus") {
      this.flushElapsedFocusTime();
    }
    s.stage = stage;
    s.isRunning = false;
    s.targetEndTime = null;
    s.sessionStartTime = null;
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
    const willRun = force !== undefined ? force : !s.isRunning;

    if (!willRun && s.isRunning && s.stage === "focus") {
      // User paused or stopped midway -> flush actual elapsed focus time
      this.flushElapsedFocusTime();
    }

    s.isRunning = willRun;
    if (s.isRunning) {
      s.targetEndTime = Date.now() + (s.remainingSeconds * 1000);
      s.sessionStartTime = Date.now();
    } else {
      s.targetEndTime = null;
      s.sessionStartTime = null;
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
      // Stage finished naturally -> Flush elapsed focus or record full duration
      s.isRunning = false;
      s.targetEndTime = null;
      const completedStage = s.stage;

      if (completedStage === "focus") {
        const recorded = this.flushElapsedFocusTime();
        if (recorded === 0) {
          // Fallback if sessionStartTime wasn't set: record entire totalSeconds
          const fullMin = Math.round(s.totalSeconds / 60);
          this.recordCompletedSession("focus", fullMin);
        }
      } else {
        const completedDuration = Math.round(s.totalSeconds / 60);
        this.recordCompletedSession(completedStage, completedDuration);
      }

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
          s.sessionStartTime = Date.now();
        }
      } else {
        s.stage = "focus";
        s.remainingSeconds = s.settings.focusDuration * 60;
        s.totalSeconds = s.settings.focusDuration * 60;
        if (s.settings.autoStartPomo) {
          s.isRunning = true;
          s.targetEndTime = Date.now() + (s.remainingSeconds * 1000);
          s.sessionStartTime = Date.now();
        }
      }
      this.notify("pomo_completed", s);
      return true;
    }
  }

  resetPomo() {
    const s = this.state.pomoState;
    if (s.isRunning && s.stage === "focus") {
      this.flushElapsedFocusTime();
    }
    s.isRunning = false;
    s.sessionStartTime = null;
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

  // --- Media State Actions ---
  // Added to fix AUDIT.md D1: mediaWidget.js:30 called store.updateMediaState(),
  // which did not exist. Play/pause/next/prev threw a TypeError before any
  // state changed, so the media widget was entirely non-functional.

  /**
   * @param {Partial<{isPlaying: boolean, currentTrackIndex: number,
   *   progressPercent: number, volume: number, trackTitle: string,
   *   trackArtist: string}>} updates
   */
  updateMediaState(updates) {
    if (!isPlainObject(updates)) return this.state.mediaState;
    const current = isPlainObject(this.state.mediaState) ? this.state.mediaState : {};
    this.state.mediaState = { ...current, ...updates };
    this.notify("media_state_updated", this.state.mediaState);
    return this.state.mediaState;
  }

  // --- Accessibility Actions ---
  updateAccessibility(updates) {
    this.state.accessibility = { ...this.state.accessibility, ...updates };
    applyAccessibilitySettings(this.state.accessibility);
    this.notify("accessibility_updated", this.state.accessibility);
    return this.state.accessibility;
  }

  // --- Theme Actions ---
  setTheme(themeId, custom = null) {
    this.state.theme = { ...this.state.theme, id: themeId, custom };
    document.documentElement.dataset.theme = themeId;
    this.notify("theme_changed", this.state.theme);
    return this.state.theme;
  }

  // --- Spaces v2 Actions ---
  /** Creates a user-defined space. Built-in ids are protected. */
  addSpace(space) {
    if (!isPlainObject(space) || !space.id) return null;
    if (this.state.spaces[space.id]) return null;
    this.state.spaces[space.id] = {
      name: space.id,
      icon: "grid",
      layout: "standalone",
      clockId: "flip",
      widgets: ["weather"],
      quadWidgets: ["weather", "calendar", "media", "timer"],
      vibe: "none",
      themeColor: "#3b82f6",
      ...space
    };
    this.notify("spaces_updated", this.state.spaces);
    return this.state.spaces[space.id];
  }

  removeSpace(spaceId) {
    // The four canonical spaces are required by the keyboard shortcut bindings
    // (app.js binds 1-4 to home/work/focus/night) and by the migration defaults.
    if (["home", "work", "focus", "night"].includes(spaceId)) return false;
    if (!this.state.spaces[spaceId]) return false;
    delete this.state.spaces[spaceId];
    if (this.state.activeSpaceId === spaceId) this.state.activeSpaceId = "home";
    this.notify("spaces_updated", this.state.spaces);
    return true;
  }

  resetTally(key) {
    this.state.tallies[key] = 0;
    this.notify("tally_updated", this.state.tallies);
  }
}

export const store = new Store();

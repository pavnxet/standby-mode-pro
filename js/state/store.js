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
import { normalizeMix, findAmbience, findPreset } from "../core/ambiences.js";

/**
 * Local calendar-day key, "YYYY-MM-DD".
 *
 * Deliberately NOT `toISOString().slice(0, 10)`: that is UTC, so a goal ticked
 * at 23:30 in IST would be filed under the following day. Goals and habit logs
 * are user-perceived days, so they must follow the user's clock.
 */
function localDayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

/**
 * Size ceiling for a stored ICS document, in characters.
 *
 * localStorage is a ~5 MB budget shared by every feature in this app, so one
 * widget cannot claim all of it. An .ics export from a calendar kept for years
 * can exceed this, which is why the limit is enforced at import time with a
 * visible message rather than discovered later as a silently truncated agenda.
 */
const AGENDA_MAX_CHARS = 512 * 1024;

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
    visualizer: "stars",
    /**
     * E2 multi-layer mixer: ambience id -> 0..1.
     *
     * Empty means "one layer at the volume below", which is what every
     * pre-E2 payload holds. Defaulting to a full mix would surprise anyone
     * upgrading, so the single-layer behaviour is preserved exactly and the
     * mixer is opt-in.
     */
    mix: {},
    /** E3 sleep timer. `endsAtMs` is absolute so a throttled tab cannot drift. */
    sleepTimer: { endsAtMs: null, fadeSeconds: 30 },
    /** F2 dimming. 1 is normal brightness; the low end must reach near zero. */
    dimming: { level: 1, scheduled: null },
    /**
     * F5 kiosk / lock-safe mode.
     *
     * Defaults to off. Enabling it changes what the page shows when idle, and
     * the disclosure that it is not device locking is part of turning it on -
     * so it must be a deliberate act.
     */
    kiosk: { enabled: false, idleMs: 120000 }
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
  },
  // Milestone 3 widget namespaces. These defaults are also backfilled by the
  // v2 -> v3 migration, so a user upgrading from an older build gets the same
  // shape as a fresh install.
  countdown: { label: "", targetEpoch: null, createdAt: null },
  goals: [],
  decks: [],
  converter: { category: "length", fromUnit: "m", toUnit: "ft" },
  unitLocation: { lat: null, lon: null, name: "", resolvedAt: null },
  fxPrefs: { base: "USD", quote: "EUR" },
  // C20 world clock. City ids from timezones.js DEFAULT_CITIES; an empty list
  // means "use the defaults", so a fresh install and a reset agree.
  worldClockCities: [],
  // C6 ICS agenda. `icsText` is the user's own pasted or uploaded file; it is
  // stored locally and never uploaded anywhere.
  agenda: { icsText: "", sourceName: "", importedAt: null },
  // C8 RSS. One user-supplied URL, opt-in only.
  rss: { url: "", itemCount: 5 },
  // C7 market tickers, as CoinGecko ids.
  marketSymbols: ["bitcoin", "ethereum"],
  // C19 prayer calculation school. A user choice, not a constant: schools
  // differ by 10-20 minutes and there is no single correct default.
  prayerMethod: 3
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

  /**
   * E2 - sets one layer's level in the mix.
   *
   * `mix` is the full desired mix rather than a partial update, because the
   * engine needs the complete picture to know which layers to start. Callers
   * read the current mix, change one key, and pass the result back.
   *
   * Every value goes through clampMix, so a slider that emits 1.4 or a stale
   * payload full of junk cannot produce a GainNode outside 0..1.
   */
  setAmbienceMix(mix) {
    const normalized = normalizeMix(isPlainObject(mix) ? mix : {});
    this.state.vibes.mix = normalized;
    this.notify("ambience_mix_updated", normalized);
    return normalized;
  }

  /** E2 - one layer, without the caller having to build the whole map. */
  setAmbienceLayer(id, level) {
    const mix = { ...this.state.vibes.mix, [id]: level };
    return this.setAmbienceMix(mix);
  }

  /** E2 - stops every layer. */
  clearAmbienceMix() {
    this.state.vibes.mix = {};
    this.notify("ambience_mix_updated", this.state.vibes.mix);
    return this.state.vibes.mix;
  }

  /**
   * E2 - applies a named preset.
   *
   * A preset is a full replacement, not an addition: a user who picks "Sleep"
   * after a custom mix expects the custom layers gone, not layered underneath.
   */
  applyMixPreset(presetId) {
    const preset = findPreset(presetId);
    if (!preset) return null;
    const mix = {};
    for (const layer of preset.layers) {
      const found = findAmbience(layer);
      if (found) mix[layer] = found.defaultMix;
    }
    return this.setAmbienceMix(mix);
  }

  /** E3 - arms a sleep timer. `minutes` 0 cancels. */
  setSleepTimer(minutes, fadeSeconds = 30) {
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      this.state.vibes.sleepTimer = { endsAtMs: null, fadeSeconds: 30 };
    } else {
      this.state.vibes.sleepTimer = {
        endsAtMs: Date.now() + mins * 60000,
        fadeSeconds: Math.max(1, Math.min(600, Number(fadeSeconds) || 30))
      };
    }
    this.notify("sleep_timer_updated", this.state.vibes.sleepTimer);
    return this.state.vibes.sleepTimer;
  }

  /**
   * F2 - display brightness.
   *
   * `level` is clamped 0..1 and 0 is a real value, not "off". The plan is
   * explicit that low-brightness mode must reach near-zero: the most-cited
   * night complaint about this category is a display that "snaps back up to
   * some weird minimal value", which is exactly what a floor imposed by the UI
   * would produce.
   */
  setDimming(level) {
    const num = Number(level);
    this.state.dimming.level = Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 1;
    this.notify("dimming_updated", this.state.dimming);
    return this.state.dimming;
  }

  /**
   * F2/F1 - a schedule that drives dimming and night mode.
   *
   * `ranges` is a list of `{ from: "HH:MM", to: "HH:MM", dim: 0..1, night: bool }`.
   * Stored as local wall-clock strings because that is how a person describes
   * "dim after 10pm" - an epoch would be meaningless across devices and zones.
   */
  setDisplaySchedule(ranges) {
    const list = Array.isArray(ranges) ? ranges.slice(0, 6) : [];
    this.state.dimming.scheduled = list.length ? list : null;
    this.notify("display_schedule_updated", this.state.dimming.scheduled);
    return this.state.dimming.scheduled;
  }

  /**
   * F5 kiosk / lock-safe mode.
   *
   * `enabled` hides the screen on idle. The name deliberately pairs "lock" with
   * "safe", because a web page cannot lock a device and the feature must not
   * imply that it does. See KIOSK_DISCLOSURE in features/kioskMode.js.
   */
  setKioskMode(updates) {
    if (!isPlainObject(updates)) return this.state.kiosk;
    const next = { ...this.state.kiosk, ...updates };

    next.enabled = next.enabled === true;
    const idle = Number(next.idleMs);
    // Floor of 30s. A shorter idle would blank the screen while someone is
    // still reading it, which is the fastest way to train them to disable it.
    next.idleMs = Number.isFinite(idle) ? Math.max(30000, Math.min(3600000, idle)) : 120000;

    this.state.kiosk = next;
    this.notify("kiosk_updated", next);
    return next;
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

  // --- Milestone 3 widget actions (FEATURE_PLAN C5, C14, C15, C18) ---
  //
  // Each of these writes one namespaced key and notifies with its own event, so
  // a widget can subscribe to exactly the slice it cares about instead of
  // re-rendering on every unrelated state change.

  /** C5 Countdown. A single target; null clears it. */
  setCountdown(label, targetEpoch) {
    this.state.countdown = {
      label: String(label || "").slice(0, 60),
      targetEpoch: Number.isFinite(targetEpoch) ? targetEpoch : null,
      createdAt: Date.now()
    };
    this.notify("countdown_updated", this.state.countdown);
    return this.state.countdown;
  }

  clearCountdown() {
    return this.setCountdown("", null);
  }

  /** C18 Daily Goals. */
  addGoal(text) {
    const trimmed = String(text || "").trim().slice(0, 80);
    if (!trimmed) return null;
    const goal = {
      id: `goal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      text: trimmed,
      done: false,
      // Local date key, so "today" is a lookup and history is a bounded record
      // of completed days rather than an unbounded list of every goal ever made.
      dayKey: localDayKey()
    };
    this.state.goals = [...this.state.goals, goal];
    this.notify("goals_updated", this.state.goals);
    return goal;
  }

  toggleGoal(id) {
    this.state.goals = this.state.goals.map(g =>
      g.id === id ? { ...g, done: !g.done } : g
    );
    this.notify("goals_updated", this.state.goals);
  }

  deleteGoal(id) {
    this.state.goals = this.state.goals.filter(g => g.id !== id);
    this.notify("goals_updated", this.state.goals);
  }

  /** C14 Flashcards. */
  addDeck(name) {
    const trimmed = String(name || "").trim().slice(0, 40);
    if (!trimmed) return null;
    const deck = { id: `deck_${Date.now().toString(36)}`, name: trimmed, cards: [] };
    this.state.decks = [...this.state.decks, deck];
    this.notify("decks_updated", this.state.decks);
    return deck;
  }

  addCard(deckId, front, back) {
    const f = String(front || "").trim().slice(0, 200);
    const b = String(back || "").trim().slice(0, 200);
    if (!f || !b) return null;
    this.state.decks = this.state.decks.map(d =>
      d.id === deckId
        ? {
            ...d,
            cards: [...d.cards, { id: `card_${Date.now().toString(36)}`, front: f, back: b, box: 0 }]
          }
        : d
    );
    this.notify("decks_updated", this.state.decks);
    return true;
  }

  deleteDeck(deckId) {
    this.state.decks = this.state.decks.filter(d => d.id !== deckId);
    this.notify("decks_updated", this.state.decks);
  }

  /**
   * C14 Flashcards: records one review.
   *
   * The next state is computed by core/flashcards.js (pure, unit-tested) and
   * passed in, so the scheduling rules live in exactly one place. `next` is the
   * full card state returned by scheduleCard(), which is why this action does
   * not import it - the widget owns the decision, the store owns persistence.
   *
   * Returns false when the deck or card is gone, so the caller can re-render
   * rather than optimistically showing a review that did not save.
   */
  reviewCard(deckId, cardId, next) {
    if (!next || typeof next !== "object") return false;

    let found = false;
    this.state.decks = this.state.decks.map((deck) => {
      if (deck.id !== deckId) return deck;
      return {
        ...deck,
        cards: (deck.cards || []).map((card) => {
          if (card.id !== cardId) return card;
          found = true;
          return { ...card, ...next };
        })
      };
    });

    if (!found) return false;
    this.notify("decks_updated", this.state.decks);
    return true;
  }

  deleteCard(deckId, cardId) {
    this.state.decks = this.state.decks.map((deck) =>
      deck.id === deckId
        ? { ...deck, cards: (deck.cards || []).filter((card) => card.id !== cardId) }
        : deck
    );
    this.notify("decks_updated", this.state.decks);
  }

  /** C20 which cities the world clock shows. */
  setWorldClockCities(ids) {
    const list = Array.isArray(ids)
      ? ids.filter((id) => typeof id === "string").slice(0, 8)
      : [];
    this.state.worldClockCities = list;
    this.notify("world_clock_cities_updated", list);
    return list;
  }

  /**
   * C6 the user's own ICS document. Stored locally only.
   *
   * Capped at 512 KB: an .ics export from a long-lived calendar can be large,
   * and localStorage is a 5 MB budget shared with everything else in this app.
   * Silently truncating an ICS file mid-event would be worse than refusing it,
   * so over-size text is rejected and the caller reports it.
   *
   * @returns {{ok: boolean, reason?: string}}
   */
  setAgendaIcs(text, sourceName = "") {
    const value = String(text || "");
    if (value.length > AGENDA_MAX_CHARS) {
      return { ok: false, reason: "that file is too large for browser storage" };
    }
    this.state.agenda = {
      icsText: value,
      sourceName: String(sourceName || "").slice(0, 80),
      importedAt: value ? Date.now() : null
    };
    this.notify("agenda_updated", this.state.agenda);
    return { ok: true };
  }

  clearAgendaIcs() {
    this.state.agenda = { icsText: "", sourceName: "", importedAt: null };
    this.notify("agenda_updated", this.state.agenda);
  }

  /** C8 the user's own feed URL, opt-in. */
  setRssPrefs(updates) {
    if (!isPlainObject(updates)) return this.state.rss;
    const next = { ...this.state.rss, ...updates };
    if (typeof next.itemCount === "number") {
      next.itemCount = Math.max(1, Math.min(20, Math.round(next.itemCount)));
    }
    next.url = String(next.url || "").slice(0, 500);
    this.state.rss = next;
    this.notify("rss_updated", next);
    return next;
  }

  /** C7 which instruments the ticker shows. */
  setMarketSymbols(ids) {
    const list = Array.isArray(ids)
      ? ids.filter((id) => typeof id === "string" && /^[a-z0-9-]+$/i.test(id)).slice(0, 10)
      : [];
    this.state.marketSymbols = list;
    this.notify("market_symbols_updated", list);
    return list;
  }

  /**
   * C19 prayer calculation school.
   *
   * Only ids the picker actually offers are accepted, so persisted state from a
   * future or corrupted value cannot put the widget into an unknown school.
   */
  setPrayerMethod(id) {
    const allowed = [1, 2, 3, 4, 5, 12, 13];
    const method = allowed.includes(Number(id)) ? Number(id) : 3;
    this.state.prayerMethod = method;
    this.notify("prayer_method_updated", method);
    return method;
  }

  /** C15 Converter preferences. Stateless, but persisted so the panel does not
   *  reset to a default every time the space re-renders. */
  setConverterPrefs(updates) {
    if (!isPlainObject(updates)) return this.state.converter;
    this.state.converter = { ...this.state.converter, ...updates };
    this.notify("converter_updated", this.state.converter);
    return this.state.converter;
  }

  /**
   * Caches a resolved location for the location-dependent widgets (C9, C10,
   * C17, C20) so geolocation is requested once rather than once per widget
   * mount. A null lat/lon is a legitimate stored value meaning "not resolved",
   * which each widget renders as an explicit state rather than silently
   * defaulting to somewhere the user did not choose.
   */
  setUnitLocation(lat, lon, name = "") {
    this.state.unitLocation = {
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      name: String(name || "").slice(0, 40),
      resolvedAt: Number.isFinite(lat) ? Date.now() : null
    };
    this.notify("unit_location_updated", this.state.unitLocation);
    return this.state.unitLocation;
  }

  /** C17 FX pair. */
  setFxPrefs(updates) {
    if (!isPlainObject(updates)) return this.state.fxPrefs;
    this.state.fxPrefs = { ...this.state.fxPrefs, ...updates };
    this.notify("fx_updated", this.state.fxPrefs);
    return this.state.fxPrefs;
  }

  // --- Alarm Actions (FEATURE_PLAN C2) ---

  /**
   * Creates an alarm. Times are stored as "HH:MM" local strings so a clock
   * displayed on the wall matches what the user typed, independent of any
   * timezone conversion.
   */
  addAlarm(alarm = {}) {
    const id = alarm.id || `alarm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const record = {
      id,
      time: "07:00",
      label: "Alarm",
      enabled: true,
      // 'once' | 'daily' | 'weekly'
      repeat: "daily",
      // Array of 0-6 (Sun-Sat) used only when repeat === 'weekly'.
      days: [],
      // Gradual volume ramp, matching the "gradual volume" complaint in the
      // Play Store reviews of the competing alarm apps.
      gradualVolume: false,
      gradualSeconds: 30,
      // Sunrise simulation: fade the screen from black over the ramp window.
      sunrise: false,
      // In-app sound is independent of OS notification permission, and always
      // works while the tab is open.
      sound: true,
      lastFiredAt: null,
      // Local day key of the last fire. A repeating alarm defers to the next
      // matching day when this equals today's key, which is what prevents a
      // one-second re-fire loop.
      lastFiredDayKey: null,
      ...alarm
    };

    // Validate the time format rather than trusting the caller.
    if (!/^\d{2}:\d{2}$/.test(String(record.time))) record.time = "07:00";
    if (!["once", "daily", "weekly"].includes(record.repeat)) record.repeat = "daily";
    if (!Array.isArray(record.days)) record.days = [];
    record.days = record.days
      .map(d => Number(d))
      .filter(d => Number.isInteger(d) && d >= 0 && d <= 6);

    this.state.alarms = [...(this.state.alarms || []), record];
    this.notify("alarms_updated", this.state.alarms);
    return record;
  }

  updateAlarm(id, updates) {
    const list = this.state.alarms || [];
    if (!list.some(a => a.id === id)) return null;
    this.state.alarms = list.map(a => {
      if (a.id !== id) return a;
      const next = { ...a, ...updates };
      if (!/^\d{2}:\d{2}$/.test(String(next.time))) next.time = a.time;
      if (!["once", "daily", "weekly"].includes(next.repeat)) next.repeat = a.repeat;
      if (!Array.isArray(next.days)) next.days = [];
      return next;
    });
    this.notify("alarms_updated", this.state.alarms);
    return this.state.alarms.find(a => a.id === id);
  }

  removeAlarm(id) {
    const before = (this.state.alarms || []).length;
    this.state.alarms = (this.state.alarms || []).filter(a => a.id !== id);
    if (this.state.alarms.length === before) return false;
    this.notify("alarms_updated", this.state.alarms);
    return true;
  }

  toggleAlarm(id) {
    const alarm = (this.state.alarms || []).find(a => a.id === id);
    if (!alarm) return null;
    return this.updateAlarm(id, { enabled: !alarm.enabled });
  }

  // --- Habit Actions (FEATURE_PLAN C3) ---

  addHabit(name) {
    const clean = String(name || "").trim().slice(0, 40);
    if (!clean) return null;
    const habit = {
      id: `habit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: clean,
      createdAt: todayKey(),
      log: {}
    };
    this.state.habits = [...(this.state.habits || []), habit];
    this.notify("habits_updated", this.state.habits);
    return habit;
  }

  removeHabit(id) {
    const before = (this.state.habits || []).length;
    this.state.habits = (this.state.habits || []).filter(h => h.id !== id);
    if (this.state.habits.length === before) return false;
    this.notify("habits_updated", this.state.habits);
    return true;
  }

  toggleHabit(id, day) {
    const list = this.state.habits || [];
    const key = day || todayKey();
    let changed = false;

    this.state.habits = list.map(h => {
      if (h.id !== id) return h;
      const log = { ...(h.log || {}) };
      if (log[key]) {
        delete log[key];
      } else {
        log[key] = true;
      }
      changed = true;
      return { ...h, log };
    });

    if (changed) this.notify("habits_updated", this.state.habits);
    return changed;
  }

  // --- Note Actions (FEATURE_PLAN C4) ---

  /**
   * Writes the note. Kept separate from updateNoteDebounced so a caller that
   * needs immediacy (restore, reset) does not have to wait.
   */
  setNote(text) {
    const value = String(text ?? "").slice(0, 2000);
    this.state.note = value;
    this.notify("note_updated", value);
    return value;
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

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @type {Store|null} */
let _storeInstance = null;

/**
 * The singleton Store, constructed on first access.
 *
 * This used to be `export const store = new Store()` at module load. That made
 * every module importing the store untestable under `node --test`, because the
 * constructor calls `applyAccessibilitySettings()`, which touches `document`.
 * Two separate test files hit this and had to work around it by duplicating
 * logic into a DOM-free module instead of testing the real thing.
 *
 * A Proxy keeps `store.getState()` and `store.addGoal(...)` identical at all 22
 * import sites while deferring construction until something actually reads
 * state. Importing a module no longer implies touching the DOM, so the widget
 * index and any future consumer can be imported directly in a test.
 */
export const store = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!_storeInstance) _storeInstance = new Store();
      const value = _storeInstance[prop];
      // Bound, so a destructured method still operates on the real instance.
      return typeof value === "function" ? value.bind(_storeInstance) : value;
    },
    set(_target, prop, value) {
      if (!_storeInstance) _storeInstance = new Store();
      _storeInstance[prop] = value;
      return true;
    },
    has(_target, prop) {
      if (!_storeInstance) _storeInstance = new Store();
      return prop in _storeInstance;
    }
  }
);

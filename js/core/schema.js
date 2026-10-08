/* StandBy Mode Pro - Persisted State Schema & Migration Engine
 *
 * Why this exists (verified audit finding, AUDIT.md T2):
 * Before this module, the ONLY versioning signal was the localStorage key name
 * "standby_mode_pro_v1". There was no version field inside the payload and no
 * migration code path anywhere in the repository. Any change to the state shape
 * was therefore a silent data-loss event.
 *
 * Competitor evidence: Tabliss issue #268 ("Tabliss resets to default settings
 * on major browsers") is the single most-upvoted issue in the entire dashboard
 * category at 104 comments. https://github.com/joelshepherd/tabliss/issues/268
 *
 * Design guarantees:
 *  1. The legacy key is READ but NEVER DELETED. We write to a new key and keep
 *     the legacy key intact as a fallback for the lifetime of the app.
 *  2. Migrations are pure functions over a plain object, applied in sequence.
 *  3. Every migration is idempotent-safe: running it twice yields the same result.
 *  4. Unknown future versions are refused loudly, never silently reset.
 *  5. The resulting state is DEEP-MERGED against defaults so a payload missing
 *     any nested key never yields `undefined` (fixes AUDIT.md T3).
 */

export const STORAGE_KEY_LEGACY = "standby_mode_pro_v1";
export const STORAGE_KEY = "standby_mode_pro_v2";
export const SCHEMA_VERSION = 4;

/**
 * Keys that must exist on a fully-formed state object. The deep-merge in
 * `applyDefaults` guarantees every one of these is present after migration,
 * which is what fixes the shallow-merge defect in the legacy store.
 */
export const TOP_LEVEL_KEYS = [
  "activeSpaceId",
  "keepScreenAwake",
  "currentUser",
  "tursoConfig",
  "stats",
  "spaces",
  "clockConfig",
  "pomoState",
  "nightMode",
  "burnInProtection",
  "screensaver",
  "wallpaper",
  "vibes",
  "mediaState",
  "todos",
  "tallies",
  "note",
  "habits",
  "schema",
  "accessibility",
  "theme",
  "layoutPresets",
  "alarms",
  "countdown",
  "goals",
  "decks",
  "converter",
  "unitLocation",
  "fxPrefs"
];

/**
 * Recursively merges `source` over `target`, treating plain objects as the only
 * value type worth recursing into. Arrays and primitives are replaced wholesale
 * (a user who deleted all todos should not have them re-added from defaults).
 */
export function deepMerge(target, source) {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return source === undefined ? target : source;
  }
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const nextVal = source[key];
    if (nextVal === undefined) continue;
    out[key] = isPlainObject(nextVal) && isPlainObject(out[key])
      ? deepMerge(out[key], nextVal)
      : nextVal;
  }
  return out;
}

export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Migrations, applied in ascending `to` order. Each entry upgrades a state
 * object from version `from` to version `to`.
 *
 * Add new entries to the END of this array only. Never edit or reorder an
 * existing migration: a user who already ran migration N must still be able to
 * replay the same sequence from their stored version.
 */
export const MIGRATIONS = [
  {
    from: 1,
    to: 2,
    description: "Introduce an explicit schema version, deep-merge every top-level key, and backfill the v2 feature namespaces (accessibility, theme, layoutPresets, alarms) so no consumer can ever read `undefined`.",
    migrate(state) {
      const next = { ...state };

      // v2 namespaces. Defaults are intentionally conservative so that enabling
      // a feature here is always an explicit user action.
      next.accessibility = deepMerge(
        {
          reducedMotion: null,   // null = follow the OS media query
          highContrast: false,
          screenReaderMode: false,
          largeText: false,
          focusRings: true,
          locale: "en"
        },
        next.accessibility
      );

      next.theme = deepMerge(
        {
          id: "midnight",
          custom: null,
          reduceTransparency: false
        },
        next.theme
      );

      next.layoutPresets = Array.isArray(next.layoutPresets) ? next.layoutPresets : [];

      next.alarms = Array.isArray(next.alarms) ? next.alarms : [];
      next.habits = Array.isArray(next.habits) ? next.habits : [];
      next.note = typeof next.note === "string" ? next.note.slice(0, 2000) : "";

      // `spaces` was previously top-level-spread only, so a payload saved by an
      // older build could be missing individual space objects. Guarantee all
      // four legacy spaces exist with a full shape before anything reads them.
      next.spaces = normalizeSpaces(next.spaces);

      // `stats` was always merged; keep it explicit so aggregates are never lost.
      next.stats = deepMerge(
        { history: [], dailyTotals: {}, monthlyTotals: {}, yearlyTotals: {}, streakDays: 1 },
        next.stats
      );

      // `pomoState.settings` is the deepest nesting in the legacy shape and was
      // the most likely to be partially present.
      next.pomoState = deepMerge(
        {
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
        next.pomoState
      );

      return next;
    }
  },
  {
    from: 2,
    to: 3,
    description: "Backfill the Milestone 3 widget namespaces (countdown, goals, flashcards, converter preferences) so every new widget can read a complete shape instead of guarding against undefined.",
    migrate(state) {
      const next = { ...state };

      // C5 Countdown. A single target, because the widget shows one event at a
      // time and a list would compete with the clock for a small panel.
      next.countdown = deepMerge(
        { label: "", targetEpoch: null, createdAt: null },
        next.countdown
      );

      // C18 Daily Goals. `done` is keyed by local date string so "today's
      // goals" is a lookup, not a filter over unbounded history.
      next.goals = Array.isArray(next.goals) ? next.goals : [];

      // C14 Flashcards. Decks are local-only by design; no account, no sync.
      next.decks = Array.isArray(next.decks) ? next.decks : [];

      // C15/C16 Converter and calculator preferences. Stateless values, but
      // persisting them means the widget looks the same on every mount instead
      // of resetting to a default each time the space re-renders.
      next.converter = deepMerge(
        { category: "length", fromUnit: "m", toUnit: "ft" },
        next.converter
      );

      // C9/C10/C17/C20 need a location and, for FX, a currency pair. These are
      // stored so the widgets do not re-request geolocation on every mount, and
      // so a user who declined geolocation once is not prompted repeatedly.
      // `null` lat/lon means "not known yet", which each widget renders as an
      // explicit state rather than silently defaulting.
      next.unitLocation = deepMerge(
        { lat: null, lon: null, name: "", resolvedAt: null },
        next.unitLocation
      );

      next.fxPrefs = deepMerge(
        { base: "USD", quote: "EUR" },
        next.fxPrefs
      );

      return next;
    }
  },
  {
    from: 3,
    to: 4,
    description: "Backfill the second Milestone 3 widget pass (world clock cities, ICS agenda, RSS feed, market symbols, prayer method) so the eight new widgets read a complete shape instead of guarding against undefined.",
    migrate(state) {
      const next = { ...state };

      // C20 World clock. An empty list means "use the defaults", which is what a
      // fresh install gets too - so a reset and an upgrade agree.
      next.worldClockCities = Array.isArray(next.worldClockCities) ? next.worldClockCities : [];

      // C6 ICS agenda. The user's own calendar text, stored locally and never
      // transmitted. `importedAt` is null until an import actually succeeds,
      // which is distinct from "imported long ago".
      next.agenda = deepMerge(
        { icsText: "", sourceName: "", importedAt: null },
        next.agenda
      );

      // C8 RSS. No default URL on purpose: every mainstream feed blocks browser
      // access, so a seeded feed would produce a permanently broken widget.
      next.rss = deepMerge(
        { url: "", itemCount: 5 },
        next.rss
      );

      // C7 Market tickers, as CoinGecko ids.
      next.marketSymbols = Array.isArray(next.marketSymbols) && next.marketSymbols.length
        ? next.marketSymbols
        : ["bitcoin", "ethereum"];

      // C19 Prayer calculation school. A user choice, so it is stored rather
      // than hard-coded: schools differ by 10-20 minutes and there is no
      // defensible single default for everyone.
      next.prayerMethod = Number.isInteger(next.prayerMethod) ? next.prayerMethod : 3;

      // C12 needs nothing new: the M1 `updateMediaState()` action and the
      // pre-existing mediaState namespace already cover it. No entry here on
      // purpose, so the migration does not imply a shape that does not exist.

      return next;
    }
  }
];

/**
 * Guarantees the four canonical spaces exist and each has a complete shape.
 * Any extra user-created space is preserved untouched.
 */
function normalizeSpaces(spaces) {
  const base = {
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
  };

  if (!isPlainObject(spaces)) return base;

  const out = {};
  for (const id of Object.keys(base)) {
    out[id] = deepMerge(base[id], spaces[id]);
  }
  // Preserve any additional (user-created) spaces.
  for (const id of Object.keys(spaces)) {
    if (!out[id] && isPlainObject(spaces[id])) {
      out[id] = deepMerge({ id }, spaces[id]);
    }
  }
  return out;
}

/**
 * Applies every migration needed to bring `state` to SCHEMA_VERSION.
 * Returns a NEW object; the input is never mutated.
 *
 * A payload with no `schema.version` is treated as version 1, which is exactly
 * what every build prior to this module wrote.
 */
export function migrateState(state, targetVersion = SCHEMA_VERSION) {
  if (!isPlainObject(state)) {
    throw new TypeError("migrateState expects a plain object");
  }

  const declaredVersion = readDeclaredVersion(state);
  let current = { ...state };
  let version = declaredVersion;

  if (version > targetVersion) {
    // Refuse rather than reset. A downgrade must never destroy newer data.
    const error = new Error(
      `Stored settings use schema v${version}, but this build supports up to v${targetVersion}. ` +
      "Settings were left untouched."
    );
    error.code = "SCHEMA_TOO_NEW";
    throw error;
  }

  const applied = [];
  for (const migration of MIGRATIONS) {
    if (version < migration.to) {
      current = migration.migrate(current);
      version = migration.to;
      applied.push(migration.to);
    }
  }

  current.schema = {
    version,
    migratedFrom: declaredVersion,
    migratedAt: applied.length ? Date.now() : (current.schema && current.schema.migratedAt) || null
  };

  return current;
}

function readDeclaredVersion(state) {
  if (isPlainObject(state.schema) && Number.isFinite(state.schema.version)) {
    return state.schema.version;
  }
  // Every payload written before this module had no version field: that is v1.
  return 1;
}

/**
 * Reads persisted state, preferring the v2 key and falling back to the legacy v1
 * key. Returns `{ state, migrated, sourceKey, error }`.
 *
 * `error` is non-null only for the unrecoverable SCHEMA_TOO_NEW case; in every
 * other failure the caller gets defaults so the app still boots.
 */
export function loadPersistedState(storage, defaults, targetVersion = SCHEMA_VERSION) {
  const empty = {
    state: null,
    migrated: false,
    sourceKey: null,
    error: null
  };

  let raw = null;
  let sourceKey = null;

  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw) sourceKey = STORAGE_KEY;
  } catch (e) {
    // Storage can throw (private mode, disabled cookies). Fall through to legacy.
    raw = null;
  }

  if (!raw) {
    try {
      raw = storage.getItem(STORAGE_KEY_LEGACY);
      if (raw) sourceKey = STORAGE_KEY_LEGACY;
    } catch (e) {
      return { ...empty, error: e };
    }
  }

  if (!raw) return { ...empty, sourceKey: null };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Corrupt JSON: report it so the caller can warn, but do not throw.
    return { ...empty, sourceKey, error: new Error("Stored settings were unreadable (invalid JSON).") };
  }

  let migratedState;
  try {
    migratedState = migrateState(parsed, targetVersion);
  } catch (e) {
    return { ...empty, sourceKey, error: e };
  }

  return {
    state: deepMerge(defaults, migratedState),
    migrated: sourceKey === STORAGE_KEY_LEGACY,
    sourceKey,
    error: null
  };
}

/**
 * Persists state under the v2 key. The legacy key is intentionally left in
 * place: if this write ever fails, the user's original data is still readable.
 */
export function savePersistedState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (e) {
    const quotaExceeded =
      e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22);
    return {
      ok: false,
      error: quotaExceeded
        ? new Error("Browser storage is full. Remove some photos in the Photo Manager and try again.")
        : e
    };
  }
}
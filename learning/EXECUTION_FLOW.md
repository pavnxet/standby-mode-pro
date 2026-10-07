# flip clock Execution Flow & Component Map

Call paths, entry points, and recent changes specific to flip clock.

## Entry Points
- `index.html`: Main application interface — ambient layers, top bar, clock stage, three modal roots, screensaver layer.
- `js/app.js`: **Sole module entry point.** Registers all clocks and widgets, wires the visualizer, constructs UI components, installs the modal runtime, and renders the active stage.
- `js/clocks/index.js`: **Single source of truth for the clock inventory.** Exports `CLOCKS` (`{ id, clock, milestone }[]`, 29 entries). `app.js` iterates it once to feed both `clockEngine` and `registry`; adding a face touches only this file.
- `js/app.bundle.js`: Legacy concatenated bundle. **Not referenced by `index.html`**; CI fails the build if it ever is. Diverged from source (shadowed `store` identifier at lines 1210-1233). Deletion pending owner approval.
- `scripts/serve.mjs`: Zero-dependency dev server. ES modules cannot load over `file://`, so an HTTP origin is required.

## Core Component Map & Data Flow
- `js/core/schema.js`: Persistence contract. Owns `SCHEMA_VERSION`, the ordered `MIGRATIONS` array, `deepMerge`, `migrateState`, `loadPersistedState`, `savePersistedState`. **The legacy key is read-only by design.**
- `js/core/registry.js`: Central declarative inventory of clocks, widgets, and features. Accepts eager or lazy descriptors; enforces unique ids.
- `js/core/scheduler.js`: The single `requestAnimationFrame` loop. Name-keyed subscribers, once-per-second aligned callback, pauses on `visibilitychange`.
- `js/core/escape.js`: `escapeHtml`, `safeUrl`, `setText`, `el`, `renderState`. Single source of truth for output safety.
- `js/core/a11y.js`: `enhanceModal` (role, aria-modal, title, focus trap, focus restore, Escape), `setInert`, `announce`, `applyAccessibilitySettings`, `findClickOnlyDivs`.
- `js/state/store.js`: Central reactive state manager. Single mutable object, listener `Set`, string-keyed events. Delegates persistence to `core/schema.js` and applies accessibility settings in its constructor.
- `js/state/tursoSync.js`: Optional cloud layer (Turso/LibSQL `/v2/pipeline`). Singleton constructed at import time.
- `js/state/db.js`: IndexedDB photo store (`StandByPhotosDB` → `user_photos`).
- `js/engines/clockEngine.js`: Clock registry + tick loop. Falls back to `flip` for unknown ids. Ticks are scheduler-driven.
- `js/engines/widgetEngine.js`: Widget registry. Falls back to `weather` for unknown ids.
- `js/engines/soundEngine.js`: Procedural Web Audio synthesis (flip tick, alarm chime, rain/waves/fire/binaural/pink noise).
- `js/engines/visualizerEngine.js`: Canvas visualizers (stars, matrix, waves, aurora). Scheduler-driven; resize throttled to one frame.
- `js/engines/wakeLockEngine.js`: Screen Wake Lock with gesture re-acquire. Chromium-only; degrades silently.
- `js/engines/burnInProtector.js`: Periodic `translate()` shift of `#main-stage`.
- `js/components/modalRuntime.js`: Installs the shared a11y runtime onto all three modals and wraps each component's `close()`.
- `js/components/pomoFocusView.js`: Full-screen Pomodoro. **Must unsubscribe from the store on unmount** (AUDIT D2).
- `js/components/statsModal.js`: 4-tab analytics + cloud profile. 907 lines; hand-rolled SVG charts.
- `js/components/customizeModal.js`: Settings panel. Renders on every `space_updated`, which resets input focus (known UX gap).
- `js/clocks/_shared/numeralMap.js`: Digit conversion applied centrally in `clockEngine._push()`, plus Roman and Braille helpers.

## Call Graph

```
index.html
  └─ js/app.js
       ├─ state/store.js ──► core/schema.js   (migrate + persist)
       │                   └─► core/a11y.js   (apply settings on boot)
       ├─ core/registry.js                    (inventory of all modules)
       ├─ core/scheduler.js ──┬─► engines/clockEngine.js  (per-slot subscriber)
       │                      └─► engines/visualizerEngine.js
       ├─ components/modalRuntime.js ──► core/a11y.js
       ├─ state/tursoSync.js ──► state/store.js
       ├─ engines/{sound,wakeLock,burnIn}Engine.js ──► state/store.js
       ├─ clocks/*.js ──► engines/soundEngine.js   (flip only)
       ├─ widgets/*.js ──► state/store.js, state/db.js, engines/soundEngine.js
       └─ components/*.js ──► state/store.js (+ db / tursoSync / engines)

store.notify(event)
  ├─► saveState() ──► core/schema.savePersistedState ──► localStorage[v2]
  └─► each listener:
        app.js              space_* | clock_config_updated ──► renderStage()
                            visualizer_changed | vibe_changed ──► engines
        scheduler-backed    clock:<slot> ──► clockEngine.tick ──► _push ──► clock.update()
        components/screensaver  pomo_* ──► suppress idle timeout
        components/*Modal   their own events ──► re-render if open
        engines/wakeLockEngine   wake_lock_toggled ──► acquire/release
        state/tursoSync.js  7 event names ──► debounced cloud push (1500 ms)
```

## Storage Keys

| Store | Key / name | Written by | Notes |
|---|---|---|---|
| localStorage | `standby_mode_pro_v2` | `core/schema.savePersistedState` | Current. Carries `schema.version`. |
| localStorage | `standby_mode_pro_v1` | *(legacy builds only)* | **Read-only now. Never deleted.** |
| localStorage | `standby_user_id` | `store._withIdentity` | `usr_<random>` |
| localStorage | `standby_site_views` | `app.js` | Cosmetic view counter |
| IndexedDB | `StandByPhotosDB` v1 → `user_photos` | `state/db.js` | keyPath `id`, autoIncrement |

## Event Names Emitted by `store.notify()`
`turso_config_updated` · `turso_sync_triggered` · `cloud_state_merged` · `user_switched` · `stats_updated` · `session_deleted` · `session_updated` · `wake_lock_toggled` · `space_changed` · `space_updated` · `spaces_updated` · `wallpaper_changed` · `clock_config_updated` · `pomo_updated` · `pomo_tick` · `pomo_completed` · `pomo_settings_updated` · `night_mode_toggled` · `screensaver_updated` · `vibe_changed` · `visualizer_changed` · `todos_updated` · `tally_updated` · `media_state_updated` · `accessibility_updated` · `theme_changed` · `state_reset` · `state_restored`

## Milestone 2 additions

- `manifest.webmanifest`: installability metadata, 4 icons, 4 app shortcuts. `start_url`/`scope` relative.
- `sw.js`: service worker. 59 precached shell assets. Cache-first same-origin; network-first navigations + Open-Meteo; SWR for the font/Tailwind CDNs; **non-GET passes straight through** so the Turso POST sync is never cached.
- `js/core/pwa.js`: registration, update lifecycle, install prompt capture, cache clearing.
- `js/core/notifications.js`: permission runtime. Never prompts on load; gesture-only request; live instances tracked by tag.
- `js/core/alarmScheduler.js`: absolute-epoch alarm scheduling, repeat rules, snooze, `lastFiredDayKey` re-fire guard.
- `js/features/alarmWidget.js`, `noteWidget.js`, `habitWidget.js`: three new widgets, registered in both `registry` and `widgetEngine`.
- `css/widgets-m2.css`: styling for the new widgets, install banner and offline badge. Loads before `a11y.css` so reduced-motion and contrast rules still win.
- `assets/icons/`: `icon.svg` + three PNGs generated by `scripts/generate-icons.mjs`.
- `tests/features.test.mjs`: 29 tests for alarm scheduling, notification states and the new schema fields.

## Recent Changes

### 2026-10-07 — Phase 1 Foundation overhaul (branch `phase-1-foundation`)
- **Audit & research:** Added `AUDIT.md`, `COMPETITOR_MATRIX.md`, `FEATURE_PLAN.md`, `TESTING.md`, `CHANGELOG.md`, and a rewritten `README.md` with a Mermaid architecture diagram.
- **New `js/core/`:** `schema.js` (versioning + migration), `registry.js` (central inventory, eager + lazy), `scheduler.js` (single rAF loop, visibility pause), `escape.js` (shared output safety), `a11y.js` (dialog focus management, inert, live regions, motion).
- **New:** `js/components/modalRuntime.js`, `js/clocks/_shared/numeralMap.js`, `js/core/../components/*` unchanged contracts.
- **`store.js`:** Persistence delegated to `core/schema.js`; added `getLoadWarnings()`, `resetToDefaults()`, `replaceState()`, `updateMediaState()` (**fixes AUDIT D1**), `updateAccessibility()`, `setTheme()`, `addSpace()`, `removeSpace()`. Accessibility applied in the constructor.
- **`clockEngine.js`:** `setInterval(250)` → scheduler subscription; added `_push()` with numeral conversion and per-clock error containment.
- **`visualizerEngine.js`:** Unconditional rAF chain → scheduler subscription; resize throttled; added `destroy()`.
- **`pomoFocusView.js`:** Store subscription captured and unsubscribed in `unmount()` (**fixes AUDIT D2**).
- **`statsModal.js` / `customizeModal.js` / `photoModal.js`:** XSS sinks escaped; labels associated; real buttons replace click-only divs; `aria-pressed` added.
- **`api/sync.js`:** Fails closed when `OWNER_SECRET_KEY` is unset.
- **`quoteWidget.js`:** Re-encoded cp1252 → UTF-8; mojibake fixed.
- **`index.html`:** `user-scalable=no` removed; `css/a11y.css` added.
- **New tooling:** `package.json`, `scripts/serve.mjs`, `tests/store.test.mjs` (22 tests), `tests/audit.test.mjs` (21 tests), extended `.github/workflows/validate.yml`.
- **Measured:** Lighthouse Accessibility 0.92 → **1.00**; Best Practices 1.00; SEO 1.00. Performance and PWA **not reported by the available tooling** — no score claimed.
- **Milestone reached:** M1 (Foundation). 12 features shipped, 1 partial, 43 planned.

### 2026-10-07 — Milestone 2: PWA, Alarm Manager, Habits & Notes (branch `phase-2-pwa-alarm-focus`)
- **PWA:** `manifest.webmanifest`, `sw.js` (59 precached assets), `js/core/pwa.js`, `assets/icons/` (3 generated PNGs + 1 SVG), install banner, offline badge.
- **Alarms:** `js/core/alarmScheduler.js` (absolute epoch targets, `lastFiredDayKey` guard), `js/core/notifications.js` (gesture-only permission, tag-tracked instances), `js/features/alarmWidget.js` (repeat rules, gradual volume ramp, sunrise simulation, honest platform-limit messaging).
- **Widgets:** `js/features/noteWidget.js`, `js/features/habitWidget.js`.
- **State:** `alarms`, `habits`, `note` namespaces added to the v2 schema and migration; validated store actions for all three.
- **Bug fixed:** repeating alarm re-fired 7× in 6s (grace-window loop). `lastFiredDayKey` guard + regression test.
- **Contrast fixed:** install banner button was white on `#3b82f6` at 10.4px (3.67:1).
- **Tests:** 43 → 80. CI extended with `sw.js` syntax, precache integrity, and manifest/SW relative-path checks.
- **Measured:** Lighthouse Accessibility 1.00, Best Practices 1.00, SEO 1.00, zero failing audits. 11/11 clocks, 12/12 widgets, 4/4 layouts verified. 59/59 precached assets resolve from cache.
- **Milestone reached:** M2 (partial). 16 features shipped, 1 partial, 39 planned.

### 2026-10-07 — Milestone 3 (clocks): 15 new clock faces (branch `phase-3-clocks`)
- **Entry point change:** `js/app.js` no longer imports clock modules individually. It imports `CLOCKS` from `js/clocks/index.js` and registers both `clockEngine` and `registry` in one loop.
- **New `js/clocks/index.js`:** The single source of truth for clock inventory (`{ id, clock, milestone }[]`), plus `M3_CLOCKS` and `CLOCK_CATEGORIES`. 29 faces total.
- **New shared modules:**
  - `js/clocks/_shared/solarMath.js` — `solarPosition`, `sunTimes`, `daylightPeriods`, `sunAltitude`, `subsolarLongitude`, `moonPhase`, `moonPhaseName`, `moonPath`, `altitudeAtHour`. Local, dependency-free ephemeris.
  - `js/clocks/_shared/primitives.js` — `polarToXY`, `arcPath`, `handPath`, `tickMarks`, `dialNumerals`, `analogDialSvg`, `handAngles`, `dotMatrixGlyph/Grid`, `humanDuration`.
  - `js/clocks/_shared/words.js` — `numberToWords`, `wordsFor` (word-clock grammar).
  - `js/clocks/_shared/worldLand.js` — **generated**, 14.2 KB world outline.
- **New clock modules:** `wordClock`, `binaryClock`, `romanClock`, `analogSkins` (4 faces from one factory), `terminatorClock`, `moonClock`, `gradientClock`, `tideClock`, `persianClock`, `brailleClock`, `departureBoardClock`, `dotMatrixClock`, `worldClock`, `sunArcClock`, `yearClock`.
- **New CSS:** `css/clocks-m3.css` (19.2 KB). `css/clocks.css` is **byte-identical to master** — asserted by test.
- **New tooling:** `scripts/generate-world-land.mjs` (Natural Earth 110m land → simplified JS asset).
- **Call path for a new face:** `index.html` → `js/app.js` → `js/clocks/index.js` → face module → `clockEngine.mount()` → `scheduler.subscribe()` → `face.update({ now, hours, ..., rawHours, ... })`. **A face doing arithmetic must use the `raw*` fields.**
- **Bugs fixed (all caught by verification, all with regression tests):** `sunTimes` epoch/unit errors (every result was `Invalid Date`); `daylightPeriods` wall-clock subtraction (day length −441 min); `toBraille` mapping `0` to the number sign; `departureBoardClock` deferring its text swap into rAF (stuck on `00:00:00` in hidden tabs); M3 faces calling `Number()` on numeral-converted strings (all hands collapsed to 12 o'clock under Devanagari/Persian digits).
- **Tests:** 80 → 132. `tests/clocks-m3.test.mjs` (45) plus 6 new guards in `tests/audit.test.mjs` (index integrity, legacy-id survival, no legacy selector in M3 CSS, `cqi` not `vw`, precache completeness, stylesheet linkage).
- **CI:** required-files list extended; precache grew 59 → 80 entries.
- **Measured:** 29/29 faces mount and render in 12h and 24h mode. 0 horizontal overflow for all 15 M3 faces at 180/240/320/480/640/900 px. Sunrise verified to the minute for 6 cities; worst lunar error 0.72 days. Lighthouse **not re-run**.
- **Milestone reached:** M3 **clock half only**. The widget half (C6–C20) is **not started**. Shipped JS is 438 KB against the 400 KB budget — reported, not met by deleting working code.
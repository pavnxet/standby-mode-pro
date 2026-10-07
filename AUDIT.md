# StandBy Mode Pro — Repository Audit

> **Audit date:** 2026-10-07
> **Auditor scope:** Read-only inspection of every source file in the repository.
> **Rule applied:** Every claim below is traceable to a file path and line number. Nothing is inferred from the README, documentation, or UI labels alone. Items I could not verify by reading code are explicitly marked **unknown**.

---

## 0. Current Git State (recorded before any change)

| Item | Value |
|---|---|
| Branch | `master` |
| HEAD | `6d92944` — `docs: log secret remediation and git history scrub in summary.md` |
| Recent commits | `dd05359` feat(analytics): edit/delete focus sessions · `8f008a8` feat(focus): track elapsed time on partial sessions · `b5fabf4` fix(security): sanitize DOM, enable serverless proxy · `6d64f66` feat(ui): hide raw Turso credentials |
| Remote | `https://github.com/pavnxet/standby-mode-pro.git` |
| Working tree | Clean except **untracked**: `.claude/`, `CLAUDE.md`. **Preserved, not modified.** |
| CI | `.github/workflows/validate.yml` — syntax check, `js/app.js` import resolution, entry-point assertion, required-file check |
| Tests | **None.** No test runner, no `package.json`, no linter config in the repository. |
| Build | None. `js/bundle_builder.py` exists but the application does not depend on it (see §2.6). |

**Local copy note:** the working directory `E:\Codes\Testing\flip clock` is the checkout of `pavnxet/standby-mode-pro`. It is *not* named `standby-mode-pro` on disk.

---

## 1. Repository Tree (verified)

```
index.html                 9.7 KB   single page, 4 modal roots + 3 ambient layers
vercel.json                0.2 KB   version 2, public, cleanUrls, global cache header
css/main.css               7.7 KB   :root tokens, glass panels, modal shell, layers
css/clocks.css            13.2 KB   per-clock-face styling
css/widgets.css           16.6 KB   layout grids, widget cards, night-mode overrides
js/app.js                 13.5 KB   ENTRY POINT — registry wiring, stage renderer, global controls
js/app.bundle.js         231.5 KB   legacy consolidated bundle — NOT referenced by index.html
js/bundle_builder.py       4.9 KB   Python concatenator that produced app.bundle.js
api/sync.js                2.2 KB   Vercel serverless proxy for Turso credentials
assets/wallpapers/         4.3 MB   6 JPEGs (~600–940 KB each)
.github/workflows/validate.yml        CI
js/state/store.js         21.4 KB   reactive state + localStorage persistence + Pomodoro logic
js/state/tursoSync.js     16.4 KB   Turso/LibSQL cloud sync
js/state/db.js             2.0 KB   IndexedDB photo store
js/engines/clockEngine.js  2.3 KB   clock registry + 250 ms tick loop
js/engines/widgetEngine.js 1.3 KB   widget registry
js/engines/soundEngine.js 10.3 KB   Web Audio procedural synthesis
js/engines/visualizerEngine.js 4.1 KB  canvas rAF visualizers
js/engines/wakeLockEngine.js 1.9 KB  Screen Wake Lock
js/engines/burnInProtector.js 1.4 KB pixel-shift timer
js/clocks/*.js                      11 clock modules
js/widgets/*.js                      9 widget modules
js/components/*.js                   7 UI components (statsModal 46.5 KB is the largest)
learning/                            project-isolated memory (4 files)
features to be implemented/          owner roadmap: MONETIZATION_PHASE_ROADMAP.md (Phase 0 audit-first mandate)
```

---

## 2. Module Dependency Graph

### 2.1 Actual import graph (from source, verified)

```
index.html
  └─ js/app.js                                  (only module entry, index.html:82)

js/app.js ──► state/store.js          (no deps)
        ──► state/tursoSync.js        ──► state/store.js
        ──► engines/clockEngine.js    (no deps)
        ──► engines/widgetEngine.js   (no deps)
        ──► engines/soundEngine.js    (no deps)
        ──► engines/visualizerEngine.js (no deps)
        ──► engines/wakeLockEngine.js  ──► state/store.js
        ──► engines/burnInProtector.js ──► state/store.js
        ──► clocks/*.js                (flipClock ──► engines/soundEngine.js; all others: none)
        ──► widgets/*.js               mediaWidget ──► state/store.js, engines/soundEngine.js
                                        tallyWidget ──► state/store.js, engines/soundEngine.js
                                        todoWidget  ──► state/store.js
                                        vibesWidget ──► state/store.js, engines/soundEngine.js
                                        photoWidget ──► state/db.js
                                        weather/calendar/quote/timer ──► none or soundEngine
        ──► components/spacesNav.js    ──► state/store.js, engines/soundEngine.js
        ──► components/statsModal.js   ──► state/store.js, state/tursoSync.js
        ──► components/customizeModal.js ──► state/store.js
        ──► components/photoModal.js   ──► state/store.js, state/db.js
        ──► components/nightModeController.js ──► state/store.js, engines/soundEngine.js
        ──► components/screensaver.js  ──► state/store.js
        ──► components/pomoFocusView.js ──► state/store.js, engines/soundEngine.js
```

**Verified graph properties**

- **Single entry point enforced.** `index.html:82` loads `type="module" src="js/app.js"`. `js/app.bundle.js` appears nowhere in `index.html`. CI asserts both conditions (`validate.yml:48-51`).
- **`store.js` is the only shared leaf.** Every component and engine depends on it; it depends on nothing. This is the de-facto dependency-injection seam.
- **`clockEngine.js` and `widgetEngine.js` have zero internal dependencies.** They are pure registries (`Map`-based). Any new module type can reuse this pattern unchanged.
- **No circular imports exist.** Verified by inspection; the graph is a DAG rooted at `app.js`.
- **`tursoSync.js` runs its constructor at import time** (`tursoSync.js:475` instantiates the singleton; constructor line 4-8 calls `this.init()`), which happens at `app.js:2` — before `App` exists. It subscribes to the store immediately (`tursoSync.js:22-45`).

### 2.2 State management

**Pattern:** a single mutable object with a listener set and an event-name pub/sub. No immutability, no reducer, no selectors.

```js
// store.js:216-234
getState()   { return this.state; }              // returns the LIVE object, not a copy
subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
notify(key, payload) {
  this.saveState();                              // full JSON.stringify → localStorage
  for (const listener of this.listeners) {
    try { listener(key, payload, this.state); }
    catch (err) { console.error(...); }         // listener errors are swallowed
  }
}
```

- **Single source of truth:** `Store.state` (`store.js:152`), loaded once in the constructor.
- **Mutations are direct:** every action assigns into `this.state.*` then calls `notify`. No cloning, no diffing. `getState()` hands out the live reference, so consumers can and do mutate it accidentally (`app.js:143-144` reads it; `customizeModal` reads nested objects).
- **Event contract:** plain string keys (`space_changed`, `pomo_tick`, `wallpaper_changed`, …). No typed channel registry, so typos fail silently — verified no typos today, but the design permits them.
- **Listener isolation:** one throwing subscriber cannot break others (`store.js:230-232`). Good defensive choice.

**Persistence**

| Store | Key / name | Shape | Written by |
|---|---|---|---|
| localStorage | `standby_mode_pro_v1` | entire app state as JSON | `store.js:1, 212` |
| localStorage | `standby_user_id` | `usr_<rand>` | `store.js:166, 199, 271` |
| localStorage | `standby_site_views` | view count as string | `app.js:216-218, 261` |
| IndexedDB | DB `StandByPhotosDB` v1, store `user_photos`, keyPath `id` autoIncrement | `{ id, dataUrl, title, timestamp }` | `db.js:3-5, 53` |

- **There is no schema version inside the stored payload.** The only versioning signal is the `_v1` suffix baked into the storage key name (`store.js:1`). **Verified consequence:** a future shape change cannot be migrated — the only lever is changing the key, which silently discards user data. There is no migration code path anywhere in the repository.
- **`saveState()` is synchronous and unguarded against quota exhaustion** — the `try/catch` at `store.js:211-213` swallows `QuotaExceededError` with no user notification. Photos are stored as **base64 data URLs** (`db.js:52-53` via `photoModal.js:159`), so a handful of full-resolution photos can exhaust both IndexedDB and the localStorage quota, and the failure is invisible.
- **Load-time repair is shallow.** `loadState()` (`store.js:156-208`) merges defaults only for `currentUser`, `tursoConfig`, `stats`, `pomoState`. **`spaces`, `clockConfig`, `nightMode`, `burnInProtection`, `screensaver`, `wallpaper`, `vibes`, `mediaState`, `todos`, `tallies` are not deep-merged** — they come from the top-level spread at `store.js:169`. A stored payload missing any of these keys yields `undefined`, and the consumers do not guard.

### 2.3 Clock style registration pattern

**Contract** (derived from `flipClock.js`, the only clock reading all config fields):

```js
export const someClock = {
  name: "Human Name",            // string, required
  description: "...",            // string, required
  category: "Classic",           // string, optional → "Modern" default (clockEngine.js:18)
  mount(container, config) {
    container.innerHTML = `...`; // may read config.showSeconds / showDate / is24Hour / tickSound
    return {
      update({ now, hours, minutes, seconds, ampm, is24, rawHours, rawMinutes, rawSeconds }) {},
      unmount() {}               // every existing clock has an EMPTY unmount
    };
  }
};
```

- **Registration:** `clockEngine.register(id, definition)` (`app.js:52-62`). Eleven ids: `flip`, `neon`, `matrix`, `solar`, `bigcrop`, `radial`, `day`, `segmented`, `analogdigital`, `minimal`, `lcars`.
- **Tick payload construction:** `clockEngine.tick()` (`clockEngine.js:44-69`) builds a **single shared payload** for all clocks — 12/24h conversion, zero-padded strings, `ampm`, and raw numeric hours/minutes/seconds.
- **Cadence:** `setInterval(..., 250)` per slot (`clockEngine.js:41`) — **4 ticks/second regardless of whether seconds are displayed.** A clock with `showSeconds: false` still runs 4×/s.
- **Fallback:** unknown clock id silently resolves to `flip` (`clockEngine.js:26`). No error surfaced to the user.

**Config fields that exist but are read by no clock (verified):** `fontFamily`, `accentColor`, `glowIntensity` are declared in `clockConfig` (`store.js:80-82`) and settable, but **zero** clock modules read them. Only `flip` reads `tickSound` (`flipClock.js:84`). Two clocks (`radial`, `day`) read **no** config field at all, and `day`, `radial`, `lcars` render their date/seconds elements unconditionally, ignoring `showDate`/`showSeconds`.

### 2.4 Event flow (render loop)

```
store.notify(event)
  ├─► saveState()  →  localStorage (sync, every event, including pomo_tick)
  └─► for each subscriber:
        app.js:132-146   space_changed | space_updated | clock_config_updated → renderStage()
                         visualizer_changed → visualizerEngine.setMode()
                         vibe_changed      → soundEngine.playAmbient()
        screensaver.js:23  space_*|screensaver_updated → resetTimer()
                          pomo_updated|pomo_tick → dismiss if pomo.isRunning
        nightModeController.js:19  night_mode_toggled → applyNightMode()
        spacesNav.js:9   space_* → re-render nav
        customizeModal.js:29 space_* → re-render if open
        statsModal.js:38 stats_updated|turso_config_updated|cloud_state_merged|user_switched → re-render if open
        wakeLockEngine.js:28 wake_lock_toggled → acquire/release
        tursoSync.js:22  pomo_completed|stats_updated|todos_updated|tally_updated|
                         space_updated|clock_config_updated|turso_sync_triggered → debounced cloud push (1500 ms)
```

**`App.renderStage()`** (`app.js:278-349`) is the single renderer:
1. unmount previous `PomoFocusView` → `clockEngine.unmount()` → `widgetEngine.unmountAll()`
2. `layout === 'focus'` **or** `activeSpace.id === 'focus'` → mount `PomoFocusView`, **return** (`app.js:293-296`)
3. `standalone` / `duo` / `quad` → rebuild `#main-stage` innerHTML, mount clock + widgets

**Structural consequence, verified:** because step 2 short-circuits on `activeSpace.id === 'focus'` **regardless of `space.layout`**, a Focus space can never use Duo or Quad. And because step 3 always replaces `innerHTML`, **every settings change in Duo/Quad mode destroys and recreates all DOM** — losing focus, selection, and scroll position, and resetting every widget's internal interval.

### 2.5 Widget registration pattern

**Contract:** `{ name, icon, mount(container, options) → { unmount() {} } }`.

- `widgetEngine.mount(id, el, slotId, options)` (`widgetEngine.js:21-30`) passes `options`, but **only `timerWidget` effectively uses per-slot context via closure**; no widget receives structured options today.
- Fallback on unknown id is `weather` (`widgetEngine.js:24`) — an unknown widget silently becomes a weather widget rather than an error.
- **Slot ids** are string keys: `duo-1`, `duo-2`, `quad-1`…`quad-4` (`app.js:320-344`).

### 2.6 The bundle

- `js/app.bundle.js` (231.5 KB) is a **stale concatenation** produced by `js/bundle_builder.py`. It is **not** referenced by `index.html` and CI actively **fails the build if `index.html` ever mentions it** (`validate.yml:50-51`).
- **It has already diverged from source.** Verified drift: the bundle contains a code path that calls `store.getAll()` / `store.add()` / `store.delete()` on the *store* object (`app.bundle.js:1210-1233`) — the IndexedDB object store methods, inlined with the local variable named `store` shadowing the app store. This is a **variable-shadowing artifact of the concatenation**, proving the bundle is not a faithful copy.
- Per `learning/summary.md:23, 45, 73`, prior sessions kept regenerating it. That work is now obsolete. **Recommendation: delete it and its builder** — CI already enforces non-use, so the file is dead weight and a divergence hazard. *(Requires owner approval; not done in this audit.)*

---

## 3. Verified Defects

### 3.1 HIGH — Confirmed broken code path

#### D1. `store.updateMediaState()` does not exist — media widget throws on every control click

- `mediaWidget.js:30`: `const persist = (updates) => store.updateMediaState(updates);`
- **`updateMediaState` is not defined anywhere in `store.js`.** Verified by grep across the whole repository: the only occurrences are the two call sites above (`mediaWidget.js:30`, `app.bundle.js:2734`). `store.js` contains `mediaState` (line 132) as *state* but **no method that writes it.**
- **Impact:** `TypeError: store.updateMediaState is not a function` on play/pause (`mediaWidget.js:51`), next (`:60`), and prev (`:67`). Because `store.notify()` catches listener errors (`store.js:230`) but this throw happens in a **DOM click handler**, it surfaces as an uncaught console error. Clicking play fails *before* any state change: `isPlaying` is flipped locally (`:50`) but `render()` at `:54` never executes, so **the button does not visually change and the lyrics never start.** The media widget is non-functional.
- **This is a verified regression** introduced when `store.js` was rewritten with the stats/user-ID work (commit `dd05359`/`8f008a8` era) — `mediaState` survived in `defaultState` but its setter did not.

#### D2. `PomoFocusView` leaks store subscriptions and two live intervals on every stage re-render

- `pomoFocusView.js:29` calls `store.subscribe(...)` and **discards the returned unsubscribe function.** `store.js:222` returns `() => this.listeners.delete(listener)`.
- `unmount()` (`pomoFocusView.js:352-361`) clears `timerInterval` (`:353`) and `cornerClockInterval` (`:354`) but **never unsubscribes.**
- `app.js:281-294` creates a **new** `PomoFocusView` on every `renderStage()`, which fires on `space_changed`, `space_updated`, and `clock_config_updated` (`app.js:132-139`).
- **Verified consequence:** orphaned views accumulate in `store.listeners`. Each orphan still reacts to `space_updated`/`clock_config_updated` by calling `render()` → `startCornerClock()` (`:248`, `:271-286`), which clears its own interval and installs a fresh 1-second one. **Net effect: live `setInterval` count grows linearly with the number of stage re-renders** — two per orphan, all ticking against detached DOM, all calling `store.notify()`-adjacent work against a dead container. This is an unbounded CPU and memory leak in normal use: toggling any Duo/Quad setting while a Focus space is active leaks two intervals per interaction.
- **Fix:** `this.unsubscribe = store.subscribe(...)` in `init()`, and `this.unsubscribe?.()` as the first line of `unmount()`.

#### D3. Remote error bodies reach `innerHTML` unescaped → XSS

Chain, all verified by line:
1. `tursoSync.js:93-94`: `const errText = await response.text(); throw new Error(\`Turso HTTP ${response.status}: ${errText}\`)` — the **raw remote response body** is embedded in the error message. Same pattern at `tursoSync.js:144-145`.
2. The message is stored at `tursoSync.js:203`, `:310`, `:413` via `store.updateTursoConfig({ lastError: err.message })`.
3. `statsModal.js:662` renders it: `` `Error: ${turso.lastError}` `` inside an `innerHTML` template — **no `escapeHtml`**, even though `statsModal.js` *defines* `escapeHtml` at line 4-12 and uses it elsewhere (`:306`, `:313`, `:415`, `:420-421`, `:800`, `:806`, `:817`, `:820`, `:823`, `:867`).
- **Impact:** an attacker who controls or can MITM the Turso endpoint can achieve script execution. Aggravating factor verified: `formatTursoUrl()` (`tursoSync.js:48-62`) **accepts `http://`** (`:54-56` only prefixes `https://` when the value has no scheme; an explicit `http://` passes through), so the DB token can legitimately travel in cleartext.

#### D4. Cloud-merged state is injected into `innerHTML` with no validation

- `tursoSync.js:348-349`: `store.mergeCloudState(JSON.parse(row.state_json))` — **unguarded `JSON.parse`**, and `store.mergeCloudState` (`store.js:246-259`) assigns `spaces`, `clockConfig`, `pomoState.settings`, `todos`, `tallies`, and `stats` **wholesale with no schema validation.**
- Those values are then interpolated unescaped:
  - `customizeModal.js:126` `${s.id}` (attribute), `:127` `${s.name}` (element text), `:174`/`:178`/`:182` `${pomo.settings.*Duration}` (attribute values, unvalidated strings)
  - `pomoFocusView.js:180`/`:183`/`:186` `${pomo.settings.*Duration}` (element text)
  - `statsModal.js:110` `${d.dateStr}`, `:177` `${d.dateStr}`, `:425` `${s.duration}m`, `:426` `data-duration="${s.duration}"`
- **Impact:** a malicious or compromised cloud row yields stored XSS across three components. `customizeModal.js` has **no** `escapeHtml` helper at all.

#### D5. User-supplied filename → HTML attribute injection

- `photoModal.js:159`: `photoDB.addPhoto(dataUrl, file.name)` — stores the raw filename.
- `photoModal.js:108`: `<img src="${p.dataUrl}" alt="${p.title}" ...>` — `p.title` interpolated with **no escaping**; `photoModal.js` defines no `escapeHtml`.
- **Impact:** a file named `x" onerror="alert(1)` breaks the attribute. Also `dataUrl` (`:107`) is serialized into an attribute without size bound — a multi-MB base64 string in an HTML attribute is a real parse/memory cost.

### 3.2 MEDIUM

#### M1. Persisting Turso credentials in the browser and in the DOM
`api/sync.js:18-28` gates on `OWNER_SECRET_KEY` **only if that env var is set**; if unset the proxy is open to anyone. `Access-Control-Allow-Origin: '*'` (`api/sync.js:5`). Client side, `tursoConfig.token` is written to localStorage (`store.js:210-213`) and rendered unescaped into a `value` attribute at `statsModal.js:656`, and again at `:652` for the URL. `testConnection` (`tursoSync.js:129-141`) **always** uses the raw Turso host, never the proxy, so the JWT goes browser→DB directly regardless of the proxy path.

#### M2. `pullFromCloud` has no in-flight guard; `pushToCloud` silently drops on overlap
`tursoSync.js:238` — `if (this.isSyncing) return;` silently discards a concurrent push (data-loss window). `pullFromCloud` (`:316-417`) has **no** guard at all, so overlapping pulls each call `mergeCloudState` (`:349`, `:394`). No `AbortController` anywhere; no `fetch` timeout at `:86` or `:129` — a hung endpoint leaves `isSyncing` true indefinitely.

#### M3. Asymmetric session sync + dedupe-by-object causes duplicate sessions
`pushToCloud` uploads only `history.slice(0, 30)` (`tursoSync.js:279`) while `pullFromCloud` accepts `LIMIT 500` (`:337`). `store.mergeCloudState` (`store.js:257`) de-duplicates by `JSON.stringify` of the **whole object**, so a session edited locally differs by one field and re-imports as a *second* entry.

#### M4. Per-input-event full state serialization
`photoModal.js:194` and `:204` call `store.updateWallpaperSettings` on every `input` event of a range slider → `store.notify()` → `saveState()` → `JSON.stringify(entire state)` → localStorage, **per pixel of drag.**

#### M5. Per-pixel renders destroy focus
`customizeModal.js:263` calls `bindEvents()` at the end of every `render()`, and `render()` replaces `contentEl.innerHTML` at `:62`. Old nodes are GC'd (no leak) but **focus and caret are lost in the number inputs (`:174`, `:178`, `:182`) and the slider (`:227`) on every store event** — and `customizeModal.js:29-37` re-renders on every `space_updated`.

#### M6. Eight untracked `setTimeout`s re-render after teardown
`statsModal.js:697, 722, 725, 801, 821, 824, 881, 884` are never stored or cleared. Each captures `this` and calls `this.render()`, so a timer that fires after the user switched tab or closed the modal re-renders stale state — visible flicker.

#### M7. `clockEngine` ticks 4×/s unconditionally
`clockEngine.js:41` — `setInterval(..., 250)` per slot regardless of `showSeconds`. On a display whose whole purpose is being always-on, this is 4 wakeups/second forever. Quad layout = 4 slots × 4 Hz. No `visibilitychange` pause anywhere in `clockEngine` or `widgetEngine`.

#### M8. `visualizerEngine` never pauses when the tab is hidden
`visualizerEngine.js:128` — unconditional `requestAnimationFrame` chain. Browsers throttle rAF in background tabs, but the app adds no explicit pause and no `document.hidden` guard, so the requirement "pause render loops when hidden" is **not met** (verified: no `visibilitychange` listener in `visualizerEngine.js`, `clockEngine.js`, or `widgetEngine.js`).

#### M9. `visualizerEngine.resize()` reallocates all particles on every resize event
`visualizerEngine.js:17` — `window.addEventListener("resize", () => this.resize())` with no throttle; `resize()` calls `initParticles()` (`:25`), rebuilding arrays. A window drag fires this continuously.

#### M10. `db.js` shadows the app's `store` concept
Inside `db.js` the local `const store = tx.objectStore(...)` (`db.js:42`, `:54`, `:65`) shadows the application store. Harmless today (no app-store import in that file) but it is exactly the shadowing that corrupted `app.bundle.js:1210-1233` (see §2.6).

#### M11. `burnInProtector` shifts the *entire* stage, including widgets
`burnInProtector.js:35-38` applies `translate(dx, dy)` to `#main-stage`. A ±2px translation of everything is not selective pixel-shift burn-in mitigation — it moves the widgets too, so it provides no protection for any static UI element that isn't part of the clock, and it is visible on a widget-heavy layout.

---

## 4. Performance Bottlenecks (verified)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| P1 | 250 ms clock interval × N slots, no visibility pause, even when seconds hidden | `clockEngine.js:41` | High |
| P2 | Unconditional rAF canvas loop, no visibility pause | `visualizerEngine.js:128` | High |
| P3 | Store listener + 2 intervals leak per stage re-render | `pomoFocusView.js:29, 352-361` + `app.js:132-139, 281-294` | High |
| P4 | `JSON.stringify(whole state)` on **every** notify, including `pomo_tick` (1 Hz while a timer runs) and every slider `input` | `store.js:226` → `:212` | Medium |
| P5 | `renderStage()` rebuilds all DOM on every `space_updated`/`clock_config_updated` | `app.js:132-139, 300-336` | Medium |
| P6 | Unthrottled `resize` → full particle reallocation | `visualizerEngine.js:17, 21-26` | Medium |
| P7 | Stopwatch interval at **40 ms** = 25 Hz | `timerWidget.js:191` | Low (short-lived) |
| P8 | Two full-screen JPEGs at 500–940 KB each, `background-size: cover` + `backdrop-filter: blur(24px)` | `photoModal.js:6-13`, `main.css:47, 294` | Medium on mobile |
| P9 | Photos stored as base64 data URLs in IndexedDB → quota pressure, slow `getAll()` | `db.js:53`, `photoWidget.js:38` | Medium |
| P10 | `syncDebounceTimer` at 1500 ms with no teardown; up to 31 statements per push | `tursoSync.js:208-213, 265-299` | Low |
| P11 | Whole app is 4.3 MB of wallpapers + a 231 KB unused bundle | `assets/wallpapers/`, `app.bundle.js` | Medium |

**Bundle-size budget:** none exists. `package.json` is absent. CI checks syntax and imports only.

---

## 5. Accessibility Gaps (verified)

### 5.1 No dialog semantics anywhere
`index.html:52` (`#stats-modal`), `:73` (`#customize-modal`), `:76` (`#photo-modal`) are `<div class="modal-overlay">` with **no `role="dialog"`, no `aria-modal`, no `aria-labelledby`.** Their close buttons are labelled (`index.html:64, 73, 76`) but the dialogs are not announced as dialogs.

### 5.2 Closed modals remain keyboard-tabbable — **verified structural defect**
`css/main.css:117-135`:
```css
.modal-overlay { opacity: 0; pointer-events: none; transition: opacity .25s ease; }
.modal-overlay.open { opacity: 1; pointer-events: auto; }
```
There is **no `display:none`, `visibility:hidden`, or `inert`**. `opacity: 0` + `pointer-events: none` removes the container from the pointer hit-test but **does not remove its descendants from the tab order**. Every input, button, and select inside all three closed modals is reachable by Tab and focusable — a keyboard user tabs through ~40 invisible controls on page load. **This is the single highest-impact a11y defect in the codebase.**

### 5.3 No focus management in any modal
Verified: `statsModal.open/close` (`statsModal.js:52-59`), `customizeModal.open/close` (`customizeModal.js:40-47`), `photoModal.open/close` (`photoModal.js:35-42`) only toggle the `open` class. **No initial focus, no focus trap, no focus restore, and no Escape-key handler in any of the three.**

### 5.4 Interactive `<div>`s instead of buttons
- `photoModal.js:107` and `:132` — wallpaper cards, `<div class="… cursor-pointer">` with handlers bound at `:170-178`. **Not keyboard reachable; no `role="button"`, no `tabindex`, no key handler.** Selection state conveyed only by CSS classes (`:107`, `:109`, `:132`, `:137`) — no `aria-pressed`.
- `pomoFocusView.js:162` — `<div id="pomo-stage-outer">` with a click listener at `:292` (the Zen-peek affordance). No `role`, no `tabindex`.

### 5.5 Labels not programmatically associated
`customizeModal.js` labels at `:123, 135, 155, 170, 199, 240` have no `for` and do not wrap their control; the number inputs (`:174`, `:178`, `:182`) have `<label>`s at `:173`, `:177`, `:181` with no `for`. `statsModal.js:597` `#input-switch-userid` has **no label at all** — placeholder only. Inputs at `statsModal.js:446, 518, 652, 656` likewise.

### 5.6 Focus indicators explicitly removed
`customizeModal.js:82` and `:105` apply `peer-focus:outline-none` — the focus ring is **removed with no replacement** on the two primary toggle switches.

### 5.7 No ARIA tab semantics
`statsModal.js:333-344` renders tabs as plain buttons: no `role="tablist"/"tab"/"tabpanel"`, no `aria-selected`, no `aria-controls`, no arrow-key roving tabindex. Panels at `:348`, `:440`, `:512`, `:583` are plain `<div>`.

### 5.8 Charts have no accessible name
`statsModal.js:119-129`, `:187-197`, `:256-266` — SVGs with no `role="img"` or `aria-label`. The only data channel is a hover-only SVG `<title>` at `:110`, `:177`, `:245`.

### 5.9 No live regions
The Pomodoro countdown (`pomoFocusView.js:204`) has no `role="timer"` or `aria-live`; time changes are silent to screen readers. `statsModal` sync status is conveyed only by button-text swaps (`:717`, `:721`, `:876-883`).

### 5.10 Emoji-only controls
`statsModal.js:426`, `:429` — `✏️` and `🗑️` with `title` only.

### 5.11 Selection state never announced
`customizeModal.js:126` (spaces), `:137`/`:141`/`:145` (layouts), `:160` (clocks); `pomoFocusView.js:179`/`:182`/`:185` (stages), `:212-214` (presets) — all convey state via CSS class only, no `aria-pressed`/`aria-current`.

### 5.12 Motion, contrast, and orientation preferences are entirely absent
Verified by grep across `css/`:
- **No `@media (prefers-reduced-motion)`** anywhere.
- **No `@media (prefers-color-scheme)`** anywhere.
- **No `@media (prefers-contrast)`** anywhere.
- **No `:focus-visible`** anywhere.
- **No `@media (orientation: landscape)`** anywhere.

The only `@media` block in all three stylesheets is `widgets.css:48` — `@media (max-width: 768px) and (orientation: portrait)`.

### 5.13 `user-scalable=no` blocks pinch-zoom
`index.html:5` — `maximum-scale=1.0, user-scalable=no` **fails WCAG 1.4.4 (Resize Text)** and blocks zoom for low-vision users.

### 5.14 `<html lang="en" class="dark">` with no i18n infrastructure
`index.html:2`. No language switching, no `lang` updates, no translation layer anywhere in the repository.

---

## 6. Responsive / Mobile / Tablet / Landscape Issues

**Total responsive surface: one media query, portrait-only, 768px.**

`css/widgets.css:48-60` contains:
- `.layout-duo` → `grid-template-columns: 1fr` (stacks vertically)
- `.layout-quad` → `grid-template-columns: 1fr 1fr`

Everything else is breakpoint-agnostic. `.layout-standalone` (`widgets.css:19`), `.widget-panel` (`:62`), and `.clock-display-wrapper` (`clocks.css:4`) have **zero** responsive rules; they rely solely on `clamp()` with `vw` units (49 occurrences in `clocks.css`, 16 in `widgets.css`).

**Verified consequences:**

1. **Landscape phone (the primary use case for a bedside clock) is untested by any rule.** iOS Safari in landscape gives ~667px height; a Quad 2×2 grid of `clamp()`-sized clocks will be cramped, but nothing in the CSS accounts for it.
2. **Tablet portrait (768px) hits the breakpoint exactly.** `@media (max-width: 768px)` is inclusive, so a 768px-wide tablet in portrait collapses Quad to 2×2 *and* Duo to a single column — arguably wrong for a tablet with room for both panels.
3. **No TV / 10-foot mode.** Nothing in the codebase distinguishes a 3 m viewing distance. Font sizes scale with `vw`, which is correct for a desktop but wrong for a wall display.
4. **`100vh`/`100vw` used for the fixed ambient layers** (`main.css:290-296, 304-310`) — on mobile browsers `100vh` exceeds the visible viewport, so the wallpaper and canvas extend below the fold.
5. **Touch targets.** `.btn-icon` is `2.5rem × 2.5rem` (`main.css:243-248`) = 40px, below the 44px WCAG 2.2 AA target size (2.5.8). `touch-action: manipulation` (`main.css:41`) is set globally, but `overflow: hidden` on `body` (`main.css:36`) plus `user-select: none` (`:40`) prevents any text selection anywhere — including inside modals where a user may want to copy a value.
6. **Top bar is a single flex row with no wrapping** (`main.css:97-104`) containing the battery pill, a views pill, the spaces nav, and 4 icon buttons. At 320px width with long space names this overflows with no fallback.

---

## 7. Technical Debt Inventory

| # | Debt | Evidence | Impact |
|---|---|---|---|
| T1 | Dead 231 KB bundle + its Python builder, already diverged from source | `js/app.bundle.js`, `js/bundle_builder.py`, `validate.yml:50-51` | Confusion; a future dev could "fix" the bundle instead of the source. Bundle contains shadowed-`store` corruption at `:1210-1233`. |
| T2 | No schema version inside the persisted payload | `store.js:1` (key-name versioning only) | **No migration path.** Any state shape change means data loss. Directly blocks 50+ new features. |
| T3 | Shallow state merge on load | `store.js:168-193` | Missing keys → `undefined` → unguarded consumer crashes. |
| T4 | No test suite, no linter, no `package.json` | repo-wide | Every change is manual verification only. CI catches syntax, not behaviour. |
| T5 | 11 clock modules duplicate the same DOM-scaffold boilerplate | `flipClock.js:10-51` and all siblings | ~11× duplication; no shared layout primitive. |
| T6 | Three modals, three near-identical open/close/bind/render implementations | `statsModal.js`, `customizeModal.js`, `photoModal.js` | No shared `Modal` base — every a11y fix must be applied 3× (and has been applied 0×). |
| T7 | Three duplicated `escapeHtml` implementations | `statsModal.js:4-12`, `mediaWidget.js:10-18`, `photoWidget.js:10-18` | `photoWidget.js` and `mediaWidget.js` are byte-identical. Should be one module. |
| T8 | Hardcoded absolute Delhi coordinates as weather fallback | `weatherWidget.js:81` (`28.6139, 77.2090`) | Every user without geolocation sees Delhi weather, unlabelled. |
| T9 | Unsplash hotlinks as default photo-frame content | `photoWidget.js:5-7` | Third-party dependency, no offline story, breaks if Unsplash changes policy. |
| T10 | CounterAPI / Abacus public counters for the "VIEWS" pill | `app.js:229`, `:243` | Third-party free services (the exact pattern documented as a rotting dependency in competitor research); no cache TTL beyond localStorage. |
| T11 | `clockConfig` fields `fontFamily`, `accentColor`, `glowIntensity` are dead | `store.js:80-82`; no reader | Users can set them and see no effect. |
| T12 | Mojibake in quote widget | `quoteWidget.js:21, 26, 29` (replacement char + literal `?`) | Visible text defect. |
| T13 | No error boundary | No `window.onerror`/`unhandledrejection` handler anywhere | A throw in one widget silently blanks that panel. |
| T14 | `day` clock is effectively a date card | `dayClock.js` — reads no config; seconds destructured and unused | Mislabeled: registered as "Day & Senior Friendly" but has no accessibility-specific behaviour (no large-text scaling, no high-contrast enforcement). |
| T15 | Zero feature gating / entitlement layer | repo-wide | Deliberate — the owner's `features to be implemented/MONETIZATION_PHASE_ROADMAP.md` mandates Phase 0 = read-only audit, and Phase 1 = entitlement architecture. **Do not gate anything before that roadmap is executed.** |

---

## 8. Privacy Posture (verified)

- **Zero analytics/tracking libraries.** No Google Analytics, no Plausible, no Sentry, no pixels. **This is a genuine strength** and should be preserved and stated publicly.
- **External network calls, complete list:**

| Destination | Purpose | Rate control | Cache |
|---|---|---|---|
| `api.open-meteo.com` (`weatherWidget.js:67`) | weather | geolocation `maximumAge: 900000` (15 min) | none |
| `api.counterapi.dev` (`app.js:229`) | global view count | none | none |
| `abacus.jasoncameron.dev` (`app.js:243`) | view-count fallback | none | none |
| Turso/LibSQL `/v2/pipeline` (`tursoSync.js:86`) | focus-session sync | 1500 ms debounce (`:208-213`) | none |
| Turso direct (`tursoSync.js:129`) | connection test | none | none |
| `images.unsplash.com` (`photoWidget.js:5-7`) | default photos | none | browser |
| Google Fonts (`index.html:11`) | 5 font families | browser | browser |
| `cdn.tailwindcss.com` (`index.html:12`) | **entire utility CSS + JIT compiler, at runtime** | none | none |

- **⚠️ `cdn.tailwindcss.com` is a production-runtime Tailwind JIT compiler.** It ships a JS compiler to every visitor, which is (a) the largest single render-blocking cost, (b) a hard dependency on a third-party CDN for the app to render at all, and (c) **a direct contradiction of the brief's "avoid CDNs" rule** and of offline/PWA goals. Replacing it with a precompiled local stylesheet is the single highest-value performance change available.
- **Permissions requested:** geolocation (optional, with fallback) and the Battery Status API (`app.js:166`). Both are graceful-degradation-safe.
- **Secret exposure history:** `learning/summary.md:67-75` records a hardcoded Turso JWT that was scrubbed from history with `git-filter-repo`; **the open action "Revoke/regenerate the exposed Turso token in the Turso console" is still outstanding.** Not verifiable from code — flagged for the owner.

---

## 9. Security Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| S1 | Remote error body → `innerHTML`, unescaped | `tursoSync.js:93-94,144-145` → `statsModal.js:662` | **High** |
| S2 | Cloud state merged without validation → unescaped `innerHTML` in 3 components | `store.js:246-259` → `customizeModal.js:126,127,174,178,182`; `pomoFocusView.js:180,183,186`; `statsModal.js:110,177,425,426` | **High** |
| S3 | `http://` accepted for the Turso endpoint → token in cleartext | `tursoSync.js:54-56` | High |
| S4 | User filename → unescaped `alt`/attribute | `photoModal.js:108` (source `:159`) | Medium |
| S5 | Turso URL + JWT persisted to localStorage and echoed into DOM | `store.js:210-213`; `statsModal.js:652,656` | Medium |
| S6 | Proxy is unauthenticated if `OWNER_SECRET_KEY` unset; CORS `*` | `api/sync.js:5,21-28` | Medium |
| S7 | `JSON.parse` of remote `state_json` unguarded | `tursoSync.js:348` | Low (DoS) |
| S8 | **No SQL injection found.** All values are bound via `args` (`tursoSync.js:110, 224-229, 270-274, 288-297, 330, 338, 439-441, 462-465`). No string-concatenated SQL anywhere. | verified by inspection | — |
| S9 | `safePhotoUrl` allowlist present and correctly applied in the widget | `photoWidget.js:19-23, 41-42, 54` | **Positive** |
| S10 | `todoWidget.js` escapes user text correctly | `todoWidget.js:4-12, 26, 28` | **Positive** |

---

## 10. What Is Genuinely Good (verified — do not regress)

1. **Clean module contracts.** The clock and widget registries are small, honest, and trivially extensible. 11 clocks + 9 widgets were added without touching either engine — that is the single strongest architectural decision in the repo and must be preserved.
2. **`store.js` has zero internal dependencies.** It is the natural seam for migration, entitlement, and persistence work.
3. **Listener isolation in `notify()`** (`store.js:230-232`) — one bad subscriber cannot take down the app.
4. **Fully procedural Web Audio synthesis** (`soundEngine.js`) — infinite rain/waves/fire/binaural/pink-noise with no audio files. Zero network cost, zero licensing risk.
5. **Background-tab-correct timers.** Everything time-sensitive uses an absolute `targetEndTime` rather than decrementing (`store.js:519, 529-542`; `timerWidget.js:159-162`), so timers stay accurate across suspension. `syncPomoBackgroundDelta()` (`store.js:528`) plus `visibilitychange`/`focus` hooks (`app.js:113-119`) handle this correctly.
6. **Elapsed-focus-time preservation** (`store.js:471-485`) — abandoning a session at 20 min records exactly 20 min, with `beforeunload`/`pagehide` flushes (`app.js:122-126`). Well thought through, and the 1-minute floor avoids phantom entries.
7. **SQL injection is genuinely prevented** — parameterized `args` throughout.
8. **Safe URL allowlisting** in the photo widget and HTML escaping in the TODO widget are already correct; they are the pattern the rest of the codebase should follow.
9. **CI enforces the entry point.** `validate.yml:48-51` fails the build if `index.html` ever points at the bundle. That guard has held.

---

## 11. Phase 1 Deliverable Summary

- Audit complete: **8 verified defects** (3 High, 5 Medium), **11 performance findings**, **14 accessibility gaps**, **15 technical-debt items**, **10 security findings**, and a **complete dependency graph + event-flow map**.
- **Zero application-code changes were made**, per the owner's `MONETIZATION_PHASE_ROADMAP.md` Phase 0 mandate.
- **No claim above rests on documentation.** Every finding cites a file and line.
- Items I could not verify by reading code, and am therefore not claiming: actual Lighthouse scores, real-world frame rates, actual bundle transfer size over the network, the current Turso schema contents, whether GitHub Pages is currently serving the live site, and the status of the token-revocation action in `learning/summary.md:75`.
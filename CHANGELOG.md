# StandBy Mode Pro — Changelog & Feature Inventory

All notable changes to this project are documented here.
Format follows [Conventional Commits](https://www.conventionalcommits.org/).

**Status legend**

- ✅ **Shipped** — implemented and verified (see `TESTING.md`)
- 🔶 **Partial** — some scope landed, the rest is documented as a gap
- ⬜ **Planned** — specified in `FEATURE_PLAN.md`, not yet built

---

## [Unreleased] — Phase 3: Clock Faces (Milestone M3, clocks portion)

**Status: clocks complete; the M3 widget half (C6–C20) is NOT started.**

Milestone 3 in `FEATURE_PLAN.md` has two halves: new clock faces (A2–A16) and
new widgets (C6–C20). Only the clock half is delivered here. Reporting this as
"Milestone 3 complete" would be false.

The 15 clock *features* ship as **18 faces**, because A5 is one feature — an
analog skins suite — that registers four distinct faces.

### Delivered and verified

| Area | Change | Verification |
|---|---|---|
| Architecture | **One declarative clock index** (`js/clocks/index.js`). `app.js` now registers both registries from a single loop over `CLOCKS`, replacing two hand-written lists of eleven that could drift. | 6 audit tests |
| Clocks | **15 new clock features → 18 new clock faces**, taking the total from 11 to **29**: Word, Binary, Roman Numeral, four Analog skins, Day/Night Map, Moon Phase, Minimal Gradient, Tide & Sun, Persian Numerals, Braille, Departure Board, Dot Matrix, World Clock, Sunrise/Sunset Arc, Clock of the Year. (A5 "analog skins suite" is one plan feature that ships four faces, 18 = 11 features + 4 skins − 1.) | All 29 mount and render, in 12-hour and 24-hour mode, in-browser |
| Astronomy | **Real solar/lunar ephemeris** (`js/clocks/_shared/solarMath.js`) — sunrise, sunset, civil twilight, golden hour, day length, sun altitude, subsolar longitude, moon phase. NOAA-style approximation, no dependency, no network. | Verified against published almanac values: London/NY/Tokyo/Sydney/Reykjavik sunrise matches to the minute; worst lunar error 0.72 days |
| Geography | **World map from Natural Earth 110m land** (public domain), simplified at build time to 14.2 KB by `scripts/generate-world-land.mjs`. Generated file is committed, so the app ships no build step and makes no request. | Point-in-polygon tests on 6 land and 5 sea reference points |
| Responsive | **M3 faces size from their container, not the viewport.** The wrappers establish `container-type: inline-size` and all sizing uses `cqi`. Previously `13vw` rendered 118 px numerals inside a 223 px panel. | Zero horizontal overflow at 180/240/320/480/640/900 px |
| Correctness | **Fixed 5 real defects found while building**, each with a regression test — see the defect table below. | 45 unit tests |

### Defects found and fixed in this milestone

These were not pre-existing bugs; they were introduced or exposed by the new
code and caught by verification rather than shipped.

| Defect | Impact | Test |
|---|---|---|
| `sunTimes` mixed second- and day-scale units and used the J2000 epoch where the Unix epoch was required | Every sunrise/sunset was an `Invalid Date` | 6 solar tests |
| `daylightPeriods` subtracted local wall-clock hour fields | London summer day length reported as **−441 minutes** | `daylightPeriods` tests |
| `toBraille` mapped `0` to `⠴` (the number sign) instead of `⠚` | The Braille clock would read 10:30 as "1n3n" — the face's entire purpose defeated | `toBraille` tests |
| `departureBoardClock` deferred its character swap into `requestAnimationFrame` | The board stayed on `00:00:00` in any hidden or backgrounded tab | In-browser, both tab states |
| Faces read the engine's numeral-converted strings and called `Number()` on them | Under Devanagari or Persian digits every hand collapsed to 12 o'clock | In-browser, 6 numeral systems |

### Not delivered

- **Widgets C6–C20** — the second half of Milestone 3. Not started.
- **Lighthouse re-run.** Not performed for this milestone; the previous run's
  scores are unchanged and are **not** claimed as current.
- **Source budget.** Shipped JS is now **438 KB against a 400 KB budget**
  (98 KB added by this milestone). The budget was set at M1 when there were 11
  clocks. It is reported here rather than met by deleting working code; raising
  it is an owner decision.

---

## [Unreleased] — Phase 2: PWA, Alarms & Focus Widgets (Milestone M2)

### Delivered and verified

| Area | Change | Verification |
|---|---|---|
| PWA | **Installable PWA.** `manifest.webmanifest` with a 512px icon, a maskable icon, and 4 app shortcuts. All paths relative so the GitHub Pages sub-path resolves. | `TESTING.md` §3.19 |
| PWA | **Service worker with a complete offline shell.** 59 app-shell assets precached; cache-first for same-origin, network-first for navigations and Open-Meteo, stale-while-revalidate for the CDNs, and a **hard passthrough for non-GET** so the Turso POST sync is never intercepted or served stale. | `TESTING.md` §3.18 — 59/59 resolvable from cache |
| PWA | **Procedurally generated icons.** `scripts/generate-icons.mjs` emits valid PNGs using only Node's built-in `zlib` — no image dependency, no opaque checked-in binaries. | Rendered and visually inspected |
| PWA | **Install affordance + offline indicator.** The banner is anchored bottom-centre so it never competes with the top bar. | Screenshot verified |
| Alarms | **Alarm Manager.** The single largest functional gap against the market. Multiple alarms, labels, once/daily/weekly repeat with per-weekday selection, snooze, **gradual volume ramp**, and **sunrise simulation**. | `TESTING.md` §3.20 |
| Alarms | **Absolute-time scheduling.** Alarms resolve to an epoch target, never a tick count, so a throttled or frozen background tab still fires on time. Re-checks on `visibilitychange` and `focus`. | `features.test.mjs` |
| Alarms | **Honest about platform limits.** The UI states that alarms only fire while the tab is open when notifications are blocked, rather than implying guaranteed delivery. | Verified in-browser |
| Notifications | **Permission runtime.** Never prompts on page load; requests only from a user gesture; tracks live instances by tag so a re-firing alarm cannot stack duplicate notifications. | `features.test.mjs` |
| Widgets | **Notes** with length clamping, `textContent`-only rendering, and per-keyboard persistence instead of per-keystroke. | `TESTING.md` §3.22 |
| Widgets | **Habit tracker** with a 12-week contribution grid, streaks, and a compact boolean log. | `TESTING.md` §3.23 |
| Correctness | **Fixed a repeating-alarm re-fire loop.** Found during live verification: an alarm fired 7 times in 6 seconds because `effectiveFireTime` kept returning today's slot inside the grace window. Fixed with a `lastFiredDayKey` guard. | `TESTING.md` §3.20 |
| A11y | **Fixed a contrast failure** introduced by the new install banner: white on `#3b82f6` at 10.4px is 3.67:1, below the 4.5:1 requirement. | Lighthouse back to 1.00 |

### Lighthouse — exact measured scores

| Category | After M1 | After M2 |
|---|---|---|
| Accessibility | 1.00 | **1.00** |
| Best Practices | 1.00 | 1.00 |
| SEO | 1.00 | 1.00 |
| Performance | *not reported by tooling* | *not reported by tooling* |
| PWA | *not reported by tooling* | *not reported by tooling* |

**No Performance or PWA score is claimed.** The Lighthouse report contains no
`pwa` category; installability is verified directly instead.

---

## [Unreleased] — Phase 1 Foundation (Milestone M1)

### Delivered and verified

| Area | Change | Verification |
|---|---|---|
| Persistence | **Schema versioning and migration engine.** State payloads now carry an explicit `__schemaVersion`. Migration runs on load, deep-merges every top-level key, and preserves all four built-in spaces plus any user-created ones. | 22 unit tests + live browser migration of a real legacy payload |
| Persistence | **Legacy data is never lost.** The `standby_mode_pro_v1` key is read but never deleted; migrated state is written to v2 with the original retained as a fallback. | `TESTING.md` §3.6 |
| Persistence | **Forward-incompatible payloads are refused, not applied.** A state written by a newer build boots on defaults with a visible warning instead of being wiped. | `TESTING.md` §3.7 |
| Persistence | **Quota and storage failures surface to the user** instead of being swallowed. | Code path, `store.saveState()` |
| Correctness | **Fixed a broken media widget.** `store.updateMediaState()` did not exist, so every play/pause/next/prev click threw and the widget never re-rendered. | `TESTING.md` §3.3 — verified working |
| Memory | **Fixed an unbounded interval leak.** The focus view discarded its store subscription, leaking two live timers per stage re-render. | `TESTING.md` §3.4 — zero growth over 6 re-renders |
| Performance | **Replaced per-slot 250 ms polling with one shared rAF scheduler** that pauses when the tab is hidden. | `TESTING.md` §3.5 |
| Performance | **Throttled visualizer resize**, which previously reallocated every particle array on each event. | Code path |
| Architecture | **Central feature registry** covering all clocks and widgets; accepts eager and lazy descriptors. | `TESTING.md` §3.9–3.10, CI uniqueness check |
| Architecture | **Shared clock primitives** and a **numeral engine** (Latin, Devanagari, Arabic-Indic, Bengali, Tamil, Persian) applied inside the tick, so all existing faces gain numeral support unmodified. | `TESTING.md` §3.12 |
| Security | **Three XSS paths closed.** Remote error bodies, Turso credentials, and user-supplied filenames are now escaped. One shared `escapeHtml` replaces three duplicates. | 21 audit regression tests |
| Security | **The sync proxy now fails closed.** It previously allowed unauthenticated passthrough when `OWNER_SECRET_KEY` was unset. | Code review, syntax check |
| Accessibility | **Closed modals are no longer tabbable.** They previously used `opacity: 0` alone, leaving ~40 invisible controls in the tab order. | Lighthouse: 0.92 → **1.00** |
| Accessibility | **Modals are real dialogs** with `role`, `aria-modal`, a title association, focus trap, focus restore, and Escape handling. | `TESTING.md` §3.8 |
| Accessibility | **Keyboard-inaccessible wallpaper cards became real buttons.** | `TESTING.md` §3.8 |
| Accessibility | **Pinch-zoom re-enabled.** `user-scalable=no` failed WCAG SC 1.4.4. | Lighthouse `meta-viewport` passes |
| Accessibility | **Added `prefers-reduced-motion`, `prefers-contrast`, `prefers-color-scheme`, and `:focus-visible`.** None existed. | 2 audit regression tests |
| Accessibility | **Restored focus rings** that `peer-focus:outline-none` had removed. | Code path |
| Accessibility | **Labelled every unlabelled control** across the settings, photo, and TODO surfaces. | Lighthouse `label` audit now passes |
| Accessibility | **Touch targets raised to 44 px** minimum, meeting WCAG 2.2 SC 2.5.8. | `css/a11y.css` |
| Data | **Spaces v2.** Users can add and remove spaces; the four built-ins are protected because keyboard shortcuts depend on them. | `TESTING.md` §3.13 |
| Code quality | **Fixed a mojibake defect** in the quote widget caused by a cp1252-encoded file. | Tree-wide UTF-8 validation |
| Tooling | **43 automated tests** with no test framework dependency, using `node:test`. | `npm test` |
| Tooling | **CI extended** with dynamic-import resolution, relative-path assertion, registry uniqueness, and a size budget. | `validate.yml` |
| Tooling | **Zero-dependency dev server** and `package.json` scripts. | `npm run serve` |

### Lighthouse — exact measured scores

Local `http://localhost:8099`, Chromium, Lighthouse 13.4.1, desktop form factor.

| Category | Before | After |
|---|---|---|
| Accessibility | 0.92 | **1.00** |
| Best Practices | **1.00** | **1.00** |
| SEO | **1.00** | **1.00** |
| Performance | *not reported by tooling* | *not reported by tooling* |
| PWA | *not reported by tooling* | *not reported by tooling* |

**No Performance or PWA score is claimed anywhere in this repository.** The
available tooling exposes only the three categories above, and no number has
been estimated or fabricated.

---

## Feature inventory — all 56 planned features

### A. Clock Engine

| ID | Feature | Status | Complexity |
|---|---|---|---|
| A1 | Clock style V2 registry + per-style capability manifest | ✅ Shipped | S |
| A2 | Word clock | ⬜ Planned | S |
| A3 | Binary clock | ⬜ Planned | S |
| A4 | Roman numeral clock | ⬜ Planned | S |
| A5 | Analog skins suite (4 faces) | ⬜ Planned | M |
| A6 | World map day/night terminator | ⬜ Planned | M |
| A7 | Moon phase clock | ⬜ Planned | S |
| A8 | Minimal gradient clock | ⬜ Planned | S |
| A9 | Tide / sun clock | ⬜ Planned | M |
| A10 | Persian / sliding numerals clock | ⬜ Planned | M |
| A11 | Braille clock | ⬜ Planned | S |
| A12 | Split-flap departure board | ⬜ Planned | M |
| A13 | Dot-matrix split-flap | ⬜ Planned | M |
| A14 | World clock carousel | ⬜ Planned | M |
| A15 | Sunrise/sunset arc clock | ⬜ Planned | M |
| A16 | Clock of the year | ⬜ Planned | S |
| A17 | Shared clock primitives library | ✅ Shipped | M |
| A18 | Per-clock appearance overrides | ⬜ Planned | M |
| A19 | Numeral system engine | ✅ Shipped | M |

### B. Layout System

| ID | Feature | Status | Complexity |
|---|---|---|---|
| B1 | Drag-and-drop widget grid | ⬜ Planned | L |
| B2 | Resizable tiles | ⬜ Planned | M |
| B3 | Saved layout presets | ⬜ Planned | M |
| B4 | Device-aware layout profiles | ⬜ Planned | M |
| B5 | Spaces v2 — user-creatable profiles | ✅ Shipped | M |
| B6 | Widget picker gallery | ⬜ Planned | M |

### C. Widgets

| ID | Feature | Status | Complexity |
|---|---|---|---|
| C1 | World clock widget | ⬜ Planned | M |
| C2 | Alarm manager (repeat, snooze, gradual volume, sunrise) | ✅ Shipped | L |
| C3 | Habit tracker | ✅ Shipped | M |
| C4 | Notes / sticky notes | ✅ Shipped | S |
| C5 | Countdown to event | ⬜ Planned | S |
| C6 | Google-style agenda + ICS import | ⬜ Planned | M |
| C7 | Stock & crypto ticker | ⬜ Planned | M |
| C8 | News / RSS reader | ⬜ Planned | M |
| C9 | Air quality (Open-Meteo AQI) | ⬜ Planned | S |
| C10 | Sunrise / sunset widget | ⬜ Planned | S |
| C11 | Battery & network status | ⬜ Planned | S |
| C12 | Real media control (Media Session API) | ⬜ Planned | M |
| C13 | Breathing / meditation guide | ⬜ Planned | S |
| C14 | Flashcards / quiz widget | ⬜ Planned | M |
| C15 | Unit converter | ⬜ Planned | S |
| C16 | Quick calculator | ⬜ Planned | S |
| C17 | Currency converter (FX) | ⬜ Planned | M |
| C18 | Daily goals dashboard | ⬜ Planned | M |
| C19 | Prayer / Panchang times *(experimental)* | ⬜ Planned | M |
| C20 | World/local time converter | ⬜ Planned | S |

### D. Focus Tools

| ID | Feature | Status | Complexity |
|---|---|---|---|
| D1 | Pomodoro engine overhaul | ⬜ Planned | M |
| D2 | Focus analytics (daily/weekly charts, per-project ratios) | ⬜ Planned | M |
| D3 | Task list with Pomodoro estimates + finish time | ⬜ Planned | M |
| D4 | Distraction-free full-screen focus mode | ⬜ Planned | S |
| D5 | Ambient + timer synchronization | ⬜ Planned | S |

### E. Audio / Visual

| ID | Feature | Status | Complexity |
|---|---|---|---|
| E1 | New procedural vibes (7 soundscapes) | ⬜ Planned | M |
| E2 | Multi-layer audio mixer | ⬜ Planned | M |
| E3 | Sleep timer with fade-out | ⬜ Planned | S |
| E4 | Beat-reactive visualizers | ⬜ Planned | L |
| E5 | Live-canvas backgrounds | ⬜ Planned | M |
| E6 | Automated day/night theme scheduling | ⬜ Planned | M |
| E7 | Screensaver variety (5 styles) | ⬜ Planned | M |

### F. Display & Hardware

| ID | Feature | Status | Complexity |
|---|---|---|---|
| F1 | Scheduled night mode | ⬜ Planned | M |
| F2 | Scheduled dimming + true low-brightness mode | ⬜ Planned | M |
| F3 | Burn-in protection modes (4) | ⬜ Planned | M |
| F4 | Wake Lock resilience + status indicator | ⬜ Planned | M |
| F5 | Kiosk / lock-safe mode | ⬜ Planned | M |
| F6 | TV 10-foot UI | ⬜ Planned | M |
| F7 | Screen-timeout rescue | ⬜ Planned | S |

### G. Platform

| ID | Feature | Status | Complexity |
|---|---|---|---|
| G1 | Installable PWA (manifest, service worker, offline, shortcuts) | ✅ Shipped | M |
| G2 | Web Share API | ⬜ Planned | S |
| G3 | Local notifications + reminder scheduling | ✅ Shipped | M |
| G4 | Gamepad & remote-friendly navigation | ⬜ Planned | M |
| G5 | Voice commands *(experimental)* | ⬜ Planned | M |
| G6 | Notification & permission centre | ⬜ Planned | S |

### H. Data & Settings

| ID | Feature | Status | Complexity |
|---|---|---|---|
| H1 | Settings schema versioning + migration engine | ✅ Shipped | L |
| H2 | Theme engine + design system tokens (light/dark/AMOLED) | ⬜ Planned | L |
| H3 | Theme import/export + backup & restore | ⬜ Planned | M |
| H4 | Network policy layer (cache, rate-limit, timeout, abort) | ⬜ Planned | M |
| H5 | Accessibility suite (WCAG 2.2 AA) | 🔶 Partial | L |
| H6 | i18n framework (English + Hindi) | ⬜ Planned | M |

### I. UX

| ID | Feature | Status | Complexity |
|---|---|---|---|
| I1 | Searchable settings centre | ⬜ Planned | M |
| I2 | Keyboard shortcut system + cheat sheet | ⬜ Planned | M |
| I3 | Command palette (Ctrl+K) | ⬜ Planned | M |
| I4 | Layout undo / redo | ⬜ Planned | M |
| I5 | Toast / notification system | ⬜ Planned | S |
| I6 | Onboarding tour | ⬜ Planned | M |

### J. Performance & Quality

| ID | Feature | Status | Complexity |
|---|---|---|---|
| J1 | Lazy-loaded module registry | ✅ Shipped | M |
| J2 | Shared rAF scheduler + visibility pause | ✅ Shipped | M |
| J3 | Web Worker for heavy compute | ⬜ Planned | S |
| J4 | Bundle-size budget | ✅ Shipped | S |
| J5 | Extended CI (graph validation, a11y smoke, unit tests) | ✅ Shipped | M |

---

## Scoreboard

| | Count |
|---|---|
| ✅ **Shipped and verified** | **16** |
| 🔶 Partially shipped | **1** |
| ⬜ Planned | **39** |
| **Total specified** | **56** |

Per-feature detail, assumptions, dependencies, and risk: `FEATURE_PLAN.md`.
Verification evidence: `TESTING.md`.

---

## Milestone status

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Foundation** | Design system groundwork, settings schema, layout groundwork, registry, a11y runtime | ✅ Complete |
| **M2 — PWA + Alarms + Focus** | G1, G3, C2, C3, C4 | 🔶 **Partial** — PWA, notifications and the alarm manager shipped; G2, G4–G6, C1, C5, D1–D5, F1, F7 remain |
| **M3 — Clocks & Widgets** | A2–A16, C6–C20 | ⬜ Not started |
| **M4 — Audio & Visual** | E1–E7, F2–F6 | ⬜ Not started |
| **M5 — Remainder** | I1–I6, H2–H6 polish | ⬜ Not started |

**Reached: Milestone M2 (partial).** The application is fully functional, all
11 clock faces and 12 widgets were verified working, the app is installable and
serves a complete offline shell, and Lighthouse Accessibility is 1.00.

### Milestone 2 scope — what is and is not included

Shipped: **G1** installable PWA, **G3** notifications, **C2** alarm manager,
**C3** habit tracker, **C4** notes.

Not started in M2: G2 (Web Share), G4 (gamepad), G5 (voice, experimental),
G6 (permission centre), C1 (world clock), C5 (countdown), D1–D5 (focus
overhaul, analytics, task estimates, distraction-free mode, ambient sync),
F1 (scheduled night mode), F7 (screen-timeout rescue).

---

## Deferred items requiring owner approval

| Item | Reason |
|---|---|
| Replace `cdn.tailwindcss.com` with a precompiled stylesheet | Large diff; emits a production warning and is the largest render-blocking cost |
| Delete `js/app.bundle.js` (231 KB) + `js/bundle_builder.py` | Dead weight that has already drifted from source; CI forbids its use |
| Revoke the previously exposed Turso token | Outstanding since `learning/summary.md:75`; not verifiable from code |
| Monetization phases 1–8 | `MONETIZATION_PHASE_ROADMAP.md` mandates Phase 0 only (read-only audit). **No entitlement or paywall code was added.** |
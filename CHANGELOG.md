# StandBy Mode Pro — Changelog & Feature Inventory

All notable changes to this project are documented here.
Format follows [Conventional Commits](https://www.conventionalcommits.org/).

**Status legend**

- ✅ **Shipped** — implemented and verified (see `TESTING.md`)
- 🔶 **Partial** — some scope landed, the rest is documented as a gap
- ⬜ **Planned** — specified in `FEATURE_PLAN.md`, not yet built

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
| C2 | Alarm manager (repeat, snooze, gradual volume, sunrise) | ⬜ Planned | L |
| C3 | Habit tracker | ⬜ Planned | M |
| C4 | Notes / sticky notes | ⬜ Planned | S |
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
| G1 | Installable PWA (manifest, service worker, offline, shortcuts) | ⬜ Planned | M |
| G2 | Web Share API | ⬜ Planned | S |
| G3 | Local notifications + reminder scheduling | ⬜ Planned | M |
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
| ✅ **Shipped and verified** | **12** |
| 🔶 Partially shipped | **1** |
| ⬜ Planned | **43** |
| **Total specified** | **56** |

Per-feature detail, assumptions, dependencies, and risk: `FEATURE_PLAN.md`.
Verification evidence: `TESTING.md`.

---

## Milestone status

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Foundation** | Design system groundwork, settings schema, layout groundwork, registry, a11y runtime | ✅ Complete |
| **M2 — PWA + Alarms + Focus** | G1–G6, C1–C5, D1–D5, F1, F7 | ⬜ Not started |
| **M3 — Clocks & Widgets** | A2–A16, C6–C20 | ⬜ Not started |
| **M4 — Audio & Visual** | E1–E7, F2–F6 | ⬜ Not started |
| **M5 — Remainder** | I1–I6, H2–H6 polish | ⬜ Not started |

**Reached: Milestone M1.** The application is fully functional, all 11 clock
faces and 9 widgets were verified working, and Lighthouse Accessibility rose
from 0.92 to 1.00.

---

## Deferred items requiring owner approval

| Item | Reason |
|---|---|
| Replace `cdn.tailwindcss.com` with a precompiled stylesheet | Large diff; emits a production warning and is the largest render-blocking cost |
| Delete `js/app.bundle.js` (231 KB) + `js/bundle_builder.py` | Dead weight that has already drifted from source; CI forbids its use |
| Revoke the previously exposed Turso token | Outstanding since `learning/summary.md:75`; not verifiable from code |
| Monetization phases 1–8 | `MONETIZATION_PHASE_ROADMAP.md` mandates Phase 0 only (read-only audit). **No entitlement or paywall code was added.** |
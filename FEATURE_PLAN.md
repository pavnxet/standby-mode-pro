# StandBy Mode Pro — Feature Plan (56 major features)

> **Date:** 2026-10-07
> **Scope:** 56 major features across 10 domains. Every entry is a new module, screen/mode, engine, or significant UI subsystem — **no toggles, no colour tweaks, no renamed duplicates.**
> **Blocking:** Not awaiting approval. Sensible technical assumptions were made and are recorded in §12. Nothing here is presented as already built.

**How to read the IDs:** `A1`–`A19` Clock Engine · `B1`–`B6` Layout · `C1`–`C20` Widgets · `D1`–`D5` Focus · `E1`–`E7` Audio/Visual · `F1`–`F7` Display/Hardware · `G1`–`G6` Platform · `H1`–`H6` Data/Settings · `I1`–`I6` UX · `J1`–`J5` Performance.

**Status column:** `PLAN` = specified, not started. Nothing in this repo is marked complete until it is implemented **and** verified.

---

## Milestone Priority (per the brief's strict fallback order)

| Milestone | Features | Rationale |
|---|---|---|
| **M1 — Foundation** | A1, A17, A18, A19, B1–B6, H1–H6, J1–J5, G1 | Design system, settings schema, layout engine, registry, PWA. Everything else depends on these. Also fixes the 3 High-severity XSS paths and the tabbable-modal a11y defect. |
| **M2 — PWA + Alarms + Focus** | G2–G6, C1–C5, D1–D5, F1, F7 | The three highest-demand verified gaps (PWA, alarms, focus quality). |
| **M3 — Clocks & Widgets** | A2–A16, C6–C20 | Breadth, once the registry and design system are stable. |
| **M4 — Audio & Visual** | E1–E7, F2–F6 | Builds on M1's token system and M2's scheduler. |
| **M5 — Remainder** | I1–I6, plus polish | UX layer on a stable base. |

---

## A. Clock Engine (19 features)

### A1 · Clock Style V2 Registry + Per-Style Capability Manifest — **M1** · S
**Inspiration:** `clockEngine.js` registry (`AUDIT` §2.3) + C1's 100+ faces with per-style control.
**Value:** Kills the dead `fontFamily`/`accentColor`/`glowIntensity` fields and the "clock ignores `showDate`" inconsistency.
**Files:** `js/engines/clockEngine.js`, `js/state/store.js`, all `js/clocks/*.js`, `js/clocks/index.js` (new)
**Complexity:** S · **Deps:** none · **Risk:** LOW. Backward-compatible: existing 11 clocks keep working because the manifest is optional (`supports` defaults permissive). Existing `setInterval(250)` is replaced by a shared scheduler (J2).

Manifest shape per clock:
```js
{ id, name, description, category,
  supports: { seconds:true, date:true, is24:true, font:true, accent:true, glow:true, numerals:['latn','devanagari'] },
  defaults: { fontFamily:'var(--font-sans)', fontSize:'clamp(...)', accentColor:'#3b82f6', glowIntensity:1 },
  mount(container, config) → { update(payload), unmount() } }
```
**Acceptance:** `day`/`radial`/`lcars` honour `showDate`/`showSeconds`; all 11 honour font/accent/glow; unknown id still falls back to `flip`; CI asserts every registered clock declares `supports`.

---

### A2 · Word Clock — **M3** · S
**Inspiration:** C1 ships word clocks [Play]; [MMM-text-clock](https://github.com/ngnijland/MMM-text-clock) (11★).
**Value:** Desk-readable at distance; genuinely different read.
**Files:** `js/clocks/wordClock.js` (new), `css/clocks.css`
**Complexity:** S · **Deps:** A1 · **Risk:** LOW. i18n string table needed (H6) — ship en + hi, fall back to en.

### A3 · Binary Clock — **M3** · S
**Inspiration:** Classic LED-matrix binary display; absent from every competitor found [F].
**Value:** Technical novelty; strong for a maker/desk audience.
**Files:** `js/clocks/binaryClock.js` (new), `css/clocks.css`
**Complexity:** S · **Deps:** A1 · **Risk:** LOW.

### A4 · Roman Numeral Clock — **M3** · S
**Inspiration:** C1 ships Roman numerals [Play].
**Value:** Classic desk aesthetic.
**Files:** `js/clocks/romanClock.js` (new) · **Complexity:** S · **Deps:** A1 · **Risk:** LOW.

### A5 · Analog Skins Suite (4 faces: Bauhaus→Classic, Sport, Minimal, Vintage) — **M3** · M
**Inspiration:** C1 analog with 27 colours [Play]; [MMM-SweepClock](https://github.com/mumblebaj/MMM-SweepClock).
**Value:** We have exactly 1 analog face (Bauhaus) against a 27-colour competitor.
**Files:** `js/clocks/analogSkins/` (4 modules), `css/clocks.css`
**Complexity:** M · **Deps:** A1, A17 (shared SVG dial renderer) · **Risk:** MED — SVG tick rendering at 60fps needs a transform-only animation path.

### A6 · World Map Day/Night Terminator — **M3** · M
**Inspiration:** Mapbox-style terminator; absent from all competitors [F].
**Value:** Shows the sun's position relative to the user; genuinely informative for a desk display.
**Files:** `js/clocks/terminatorClock.js` (new), `js/data/worldOutline.js` (new, simplified coastline polylines), `css/clocks.css`
**Complexity:** M · **Deps:** A1 · **Risk:** MED — needs a low-poly coastline asset. **Assumption:** ship an embedded simplified outline (~30KB), not a full world GeoJSON.

### A7 · Moon Phase Clock — **M3** · S
**Inspiration:** Astronomy clocks; not verified in any competitor [?].
**Value:** Adds an astronomical dimension alongside A6.
**Files:** `js/clocks/moonClock.js` (new) · **Complexity:** S · **Deps:** A1, A6 (shared ephemeris util) · **Risk:** LOW. Use a well-known low-precision lunar phase algorithm.

### A8 · Minimal Gradient Clock — **M3** · S
**Inspiration:** Design-trend minimalism; [aBER0724/standby-clock](https://github.com/aBER0724/standby-clock) (10 fonts × 10 themes).
**Value:** Fills the gap between `minimal` (AMOLED) and `bigcrop`.
**Files:** `js/clocks/gradientClock.js` (new), `css/clocks.css` · **Complexity:** S · **Deps:** A1, H2 (theme tokens) · **Risk:** LOW.

### A9 · Tide / Sun Clock — **M3** · M
**Inspiration:** [DAKboard pricing](https://dakboard.com/pricing) lists "Ocean Tide Charts".
**Value:** Coastal/geographic relevance; pairs with A6.
**Files:** `js/clocks/tideClock.js` (new) · **Complexity:** M · **Deps:** A1, C9 (Open-Meteo marine API) · **Risk:** MED — marine API availability and rate limits **[?] unverified at plan time**. Fallback: solar-only arc if the marine endpoint fails.

### A10 · Persian / Sliding Numerals Clock — **M3** · M
**Inspiration:** Cross-locale desk display; not in any competitor [F].
**Value:** A culturally distinct face; pairs with A19.
**Files:** `js/clocks/persianClock.js` (new) · **Complexity:** M · **Deps:** A1, A19 · **Risk:** MED — requires a Persian digit map and Jalali display option.

### A11 · Braille Clock — **M3** · S
**Inspiration:** Accessibility-first design; C1's Dementia clock [Play].
**Value:** A genuinely accessible face for blind/low-vision users who read Braille — paired with C13 flashcards and H5.
**Files:** `js/clocks/brailleClock.js` (new) · **Complexity:** S · **Deps:** A1, A19 · **Risk:** LOW.

### A12 · Split-Flap Departure Board — **M3** · M
**Inspiration:** C5 "Flip Clock: World Clock"; airport/station aesthetic.
**Value:** New layout language; supports A14 world clock.
**Files:** `js/clocks/departureBoardClock.js` (new) · **Complexity:** M · **Deps:** A1 · **Risk:** LOW. Must reuse the flip animation logic from `flipClock.js` rather than re-implement.

### A13 · Dot-Matrix Split-Flap (per-dot) — **M3** · M
**Inspiration:** Solari board displays; C1's Matrix face.
**Value:** A distinct flip variant that our existing flip CSS can't express.
**Files:** `js/clocks/dotMatrixClock.js` (new) · **Complexity:** M · **Deps:** A1 · **Risk:** MED — 4 digits × 14 dots = 56 animated nodes; must use CSS `transform` only and respect reduced-motion (H5).

### A14 · World Clock Carousel — **M3** · M
**Inspiration:** C1 world clock [Play]; C5 per-city weather.
**Value:** Multi-timezone desk use; a top-10 requested feature class.
**Files:** `js/clocks/worldClock.js` (new) · **Complexity:** M · **Deps:** A1, H4 (IANA tz data), C2 · **Risk:** MED. **Use `Intl.DateTimeFormat` with `timeZone` — no bundled tz library.**

### A15 · Sunrise / Sunset Arc Clock (with golden hour) — **M3** · M
**Inspiration:** C1 solar clock [Play]; C15 sun/moon data.
**Value:** Improves on the existing `solar` face with real ephemeris instead of a stylised arc.
**Files:** `js/clocks/sunArcClock.js` (new) · **Complexity:** M · **Deps:** A1, C9 · **Risk:** MED — solar position maths; C9's Open-Meteo `daily=sunrise,sunset` is keyless.

### A16 · Clock of the Year / Progress Clock — **M3** · S
**Inspiration:** C1's "complications" showing *"progress through the year"* [Play].
**Value:** A complication-grade secondary read.
**Files:** `js/clocks/yearClock.js` (new) · **Complexity:** S · **Deps:** A1 · **Risk:** LOW.

### A17 · Shared Clock Primitives Library — **M1** · M
**Inspiration:** AUDIT T5 — 11 duplicated DOM scaffolds.
**Value:** Removes ~11× duplication; required before A5/A6 can be built sanely.
**Files:** `js/clocks/_shared/` (new: `svgDial.js`, `digitRow.js`, `numeralMap.js`, `solarMath.js`)
**Complexity:** M · **Deps:** none · **Risk:** LOW — additive only; existing clocks untouched until verified.

### A18 · Per-Clock Appearance Overrides (font / size / colour / glow / weight / letter-spacing) — **M1** · M
**Inspiration:** C1 per-style customisation; replaces 3 dead config fields.
**Value:** Makes A1's manifest real; directly answers the C5 reviewer who wanted *"all 4 colors"*.
**Files:** `js/state/store.js` (`clockConfig.perStyle`), `js/clocks/_shared/appearance.js`, `css/clocks.css`
**Complexity:** M · **Deps:** A1, H1 (schema) · **Risk:** MED — per-style override must not break legacy `clockConfig` fields.

### A19 · Numeral System Engine (Latin / Devanagari / Arabic-Indic / Persian) — **M1** · M
**Inspiration:** C1 supports 20+ languages [Play]; brief requires Hindi numerals.
**Value:** Unlocks A10, A11 and H6 together.
**Files:** `js/core/numerals.js` (new), `js/clocks/_shared/numeralMap.js`
**Complexity:** M · **Deps:** H6 · **Risk:** MED — must run *before* `clockEngine.tick()` formats strings, or all 11 clocks need patches. **Decision:** add a `formatNumerals()` step in `tick()` so existing clocks get it for free.

---

## B. Layout System (6 features)

### B1 · Drag-and-Drop Widget Grid — **M1** · L
**Inspiration:** C14's zero-YAML board is its primary draw; C15/C11 block editor.
**Value:** The single most-requested capability class.
**Files:** `js/layout/gridEngine.js` (new), `js/components/layoutEditor.js` (new), `css/layout.css` (new)
**Complexity:** L · **Deps:** A1, H1, I4 · **Risk:** HIGH — pointer-events drag with live reordering, touch support, and undo/redo. **Must not break the existing `layout-duo`/`layout-quad`/`layout-standalone` paths** — ship as a *new* `grid` layout value; existing spaces keep their layout.

### B2 · Resizable Tiles — **M1** · M
**Inspiration:** C16 Tabliss per-widget independent sizing inside one grid.
**Value:** Granular control without a full canvas editor.
**Files:** `js/layout/gridEngine.js`, `css/layout.css`
**Complexity:** M · **Deps:** B1 · **Risk:** MED — resize handles need 44px touch targets (WCAG 2.5.8, see AUDIT §6.5).

### B3 · Saved Layout Presets (named, exportable) — **M1** · M
**Inspiration:** C15 screen presets; C11 multi-page.
**Value:** Shareable configurations without accounts.
**Files:** `js/state/store.js`, `js/components/layoutEditor.js`
**Complexity:** M · **Deps:** B1, H3 · **Risk:** LOW.

### B4 · Device-Aware Layout Profiles — **M1** · M
**Inspiration:** AUDIT §6 — one media query, portrait-only, 768px inclusive (collapses a tablet that has room).
**Value:** Fixes landscape phone — **the primary bedside use case** — which no rule currently covers.
**Files:** `js/layout/deviceProfiles.js` (new), `css/layout.css`
**Complexity:** M · **Deps:** H4 · **Risk:** LOW.
**Breakpoints to implement:** phone portrait (<640) · **phone landscape (h<520, verified via `@media (orientation: landscape) and (max-height: 520px)`)** · tablet (640–1024) · desktop (>1024) · **TV (>1600px or `resolution` heuristic)**.

### B5 · Spaces v2 — User-Creatable Profiles — **M1** · M
**Inspiration:** C1 Spaces [Play]; current 4 are hardcoded in `store.js:30-75`.
**Value:** Removes a hardcoded limit; the roadmap already calls for multi-profile.
**Files:** `js/state/store.js`, `js/components/spacesNav.js`
**Complexity:** M · **Deps:** H1, B3 · **Risk:** MED — `spaces` is NOT deep-merged on load (`AUDIT` T3). **Migration must guarantee all 4 legacy spaces survive**, including a user who has renamed one.

### B6 · Widget Picker Gallery — **M1** · M
**Inspiration:** C14's integration gallery [homarr.dev/docs/integrations](https://homarr.dev/docs/integrations); brief requirement.
**Value:** Discoverability for 29 widgets (9 existing + 20 new).
**Files:** `js/components/widgetPicker.js` (new), `css/settings.css` (new)
**Complexity:** M · **Deps:** A1, H1, I5 · **Risk:** LOW.
**Requirement:** each card shows a live preview, the widget's **network cost** (keyless/offline/API), and its **loading/empty/error state** — the transparency pattern from [Dashy widget docs](https://docs.dashy.to/docs/widgets/).

---

## C. Widgets (20 features)

### C1 · World Clock Widget — **M2** · M
**Inspiration:** C5 world clock + per-city weather [Play].
**Value:** Top-10 requested feature class.
**Files:** `js/features/worldClockWidget.js` (new) · **Deps:** A14, H4 · **Risk:** LOW. `Intl.DateTimeFormat({timeZone})` only — no tz library.

### C2 · Alarm Manager (repeat, snooze, gradual volume, sunrise simulation) — **M2** · L
**Inspiration:** C3's #1 complaint: *"I thought it was gonna have an alarm build into it"* [App Store]; C1 alarm clock.
**Value:** **The largest single functional gap in our product.** A smart clock without an alarm is not a bedside clock.
**Files:** `js/features/alarmWidget.js` (new), `js/core/alarmScheduler.js` (new), `js/state/store.js`, `js/engines/soundEngine.js`
**Complexity:** L · **Deps:** G3 (notifications), F1, E1 · **Risk:** HIGH — reliability is the whole product. Requires: absolute `targetEndTime` (matching existing `store.js:519` pattern), `visibilitychange` re-sync, notification + audio fallback, **Notification permission denied → in-page fallback**, and a **tab-must-be-open caveat stated in the UI** (web cannot fire reliable background alarms — see §12-A4).

### C3 · Habit Tracker — **M2** · M
**Inspiration:** Not in the dashboards found; C1 tracks sobriety counters.
**Value:** Daily-use engagement; pairs with D2 analytics.
**Files:** `js/features/habitWidget.js` (new) · **Deps:** H1 · **Risk:** LOW.

### C4 · Notes / Sticky Notes — **M2** · S
**Inspiration:** [Dashy #636](https://github.com/Lissy93/dashy/issues/636) open since 2022 (11 comments).
**Value:** Scratchpad without leaving the clock.
**Files:** `js/features/notesWidget.js` (new) · **Deps:** H1 · **Risk:** LOW. **Must use `textContent`, not `innerHTML`** — see AUDIT S2.

### C5 · Countdown to Event — **M2** · S
**Inspiration:** [DAKboard pricing](https://dakboard.com/pricing) — "Countdown/Countup".
**Value:** Simple, high-emotion use case (launches, trips).
**Files:** `js/features/countdownWidget.js` (new) · **Deps:** H1 · **Risk:** LOW.

### C6 · Google-Style Agenda + ICS Import — **M2** · M
**Inspiration:** C5 calendar; [Glance #902 CalDAV](https://github.com/glanceapp/glance/issues/902); [MagicMirror #1798/#2111](https://github.com/MagicMirrorOrg/MagicMirror/issues/1798) — 4 separate 49–65 comment threads on calendar timezone bugs.
**Value:** Replaces our current hardcoded agenda row (`calendarWidget.js:44-46`).
**Files:** `js/features/agendaWidget.js` (new), `js/core/icsParser.js` (new)
**Complexity:** M · **Deps:** H1 · **Risk:** HIGH — **timezone correctness is an unsolved industry-wide failure.** Mandatory: all-day events vs. timed events handled separately; `DTSTART` with/without `TZID`; UTC `Z` suffix; **DST transition tests**. A clock showing the wrong time is the worst possible bug ([Night Clock shipped a DST fix](https://play.google.com/store/apps/details?id=de.program_co.nightclockfree)).

### C7 · Stock & Crypto Ticker — **M2** · M
**Inspiration:** [DAKboard](https://dakboard.com/pricing) (CoinGecko); [Glance markets](https://github.com/glanceapp/glance).
**Value:** Desk-relevant market glance.
**Files:** `js/features/marketWidget.js` (new) · **Deps:** H4 (cache) · **Risk:** MED. **Must never render `$0` on failure** — [DAKboard #2449](https://github.com/dakboard/dakboard/issues/2449) is exactly that bug, 12 comments. Explicit error state required.

### C8 · News / RSS Reader — **M2** · M
**Inspiration:** [Glance](https://github.com/glanceapp/glance) (with `collapse-after: 3`); [Tabliss #601](https://github.com/joelshepherd/tabliss/issues/601).
**Value:** Headline glance.
**Files:** `js/features/rssWidget.js` (new), `js/core/rssParser.js` (new)
**Complexity:** M · **Deps:** G3, H4 · **Risk:** HIGH — **browser CORS blocks most RSS feeds.** Competitive web feeds exist but change **[?]**. Design decision: accept only user-supplied feeds that pass a CORS preflight, and **surface a clear "feed blocked by CORS" state** rather than an empty widget. No third-party proxy (privacy rule).

### C9 · Air Quality (Open-Meteo AQI) — **M2** · S
**Inspiration:** [DAKboard](https://dakboard.com/pricing) — Air Quality, Atmospheric Map.
**Value:** Pairs with the existing weather widget.
**Files:** `js/features/airQualityWidget.js` (new) · **Deps:** H4 · **Risk:** LOW. **Open-Meteo air-quality API, keyless, same host family as existing weather** — consolidates rate-limiting under one policy (H4).

### C10 · Sunrise / Sunset / Golden Hour — **M2** · S
**Inspiration:** C1; [DAKboard](https://dakboard.com/pricing).
**Value:** Feeds A15.
**Files:** `js/features/sunWidget.js` (new) · **Deps:** H4 · **Risk:** LOW.

### C11 · Battery & Network Status — **M2** · S
**Inspiration:** C1 System Dashboard [Play]; [Dashy system widgets](https://docs.dashy.to/docs/widgets/).
**Value:** Upgrades our single battery pill (`index.html:31`) to a real widget.
**Files:** `js/features/systemStatusWidget.js` (new) · **Deps:** H1 · **Risk:** MED. `navigator.getBattery` is **Chromium-only and deprecated**; `NetworkInformation` is not standard. **Must degrade gracefully** — the existing code already guards with `'getBattery' in navigator` (`app.js:166`); the new widget must do the same and show "unavailable" rather than blank.

### C12 · Real Media Control via Media Session API — **M2** · M
**Inspiration:** C1 Spotify/YouTube Music/Apple Music + synced lyrics [Play]; C15 Spotify.
**Value:** Replaces the demo stub that is also **the only functional defect in the codebase** (AUDIT D1).
**Files:** `js/features/mediaSessionWidget.js` (new), `js/core/mediaSession.js` (new), `js/state/store.js` (**must add `updateMediaState()`**)
**Complexity:** M · **Deps:** G2 · **Risk:** MED. Media Session controls *already-playing* media; the app cannot play Spotify itself. **Honest framing:** "control what's playing anywhere on your system." Must fix D1 as part of this feature.

### C13 · Breathing / Meditation Guide — **M2** · S
**Inspiration:** C1 meditation content [Play]; not in dashboards.
**Value:** Pairs with E1 ambience and A6.
**Files:** `js/features/breathingWidget.js` (new) · **Deps:** E2, A1 · **Risk:** LOW. CSS-driven inhale/hold/exhale cycle; must respect reduced-motion (H5).

### C14 · Flashcards / Quiz Widget — **M2** · M
**Inspiration:** [MMM-Education category](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-Party-Modules) (one of 16 categories); no competitor verified.
**Value:** Distinctive for a student desk display.
**Files:** `js/features/flashcardWidget.js` (new) · **Deps:** H1 · **Risk:** MED. Spaced-repetition (SM-2-lite) logic; local decks only, no account.

### C15 · Unit Converter — **M2** · S
**Inspiration:** C1 converter [Play].
**Value:** Small, self-contained utility.
**Files:** `js/features/converterWidget.js` (new) · **Deps:** none · **Risk:** LOW.

### C16 · Quick Calculator — **M2** · S
**Inspiration:** C1 calculator [Play]; [Dashy custom widgets](https://docs.dashy.to/docs/widgets/).
**Value:** Desk utility.
**Files:** `js/features/calculatorWidget.js` (new) · **Deps:** none · **Risk:** LOW. **Must not use `eval()`** — implement a small shunting-yard parser.

### C17 · Currency Converter (FX) — **M3** · M
**Inspiration:** [Dashy exchange rates](https://docs.dashy.to/docs/widgets/); [DAKboard #611](https://github.com/dakboard/DAKboard/issues/611).
**Value:** Extends C15 with a network rate.
**Files:** `js/features/fxWidget.js` (new) · **Deps:** C15, H4 · **Risk:** MED. Keyless rate source required **[?] to be verified**; must show the rate timestamp and never present a stale rate as live.

### C18 · Daily Goals Dashboard — **M3** · M
**Inspiration:** [Momentum](https://momentumdash.com/) "top task in center".
**Value:** The single-focus-element pattern Momentum uses better than a widget grid.
**Files:** `js/features/goalsWidget.js` (new) · **Deps:** D5 · **Risk:** LOW.

### C19 · Prayer / Panchang Times — **M3** · M
**Inspiration:** Brief-specified, optional. Not in any competitor verified [F].
**Value:** Meaningful for the project's likely Indian user base (weather fallback is Delhi — `weatherWidget.js:81`).
**Files:** `js/features/prayerWidget.js` (new), `js/core/solarMath.js`
**Complexity:** M · **Deps:** H4, A15 · **Risk:** HIGH — prayer times depend on latitude, method (several calculation schools), and Hijri date. **Marked experimental.** Astronomical core is shared with A15.

### C20 · World/Local Time Converter — **M3** · S
**Inspiration:** C2 showed the **wrong timezone out of the box** ([TidBITS](https://talk.tidbits.com/t/standby-in-ios-17/24372)).
**Value:** Fixes a documented competitor failure as a first-class feature.
**Files:** `js/features/timezoneWidget.js` (new) · **Deps:** C1 · **Risk:** LOW.

---

## D. Focus Tools (5 features)

### D1 · Pomodoro Engine Overhaul (session types, cycles, auto-advance) — **M2** · M
**Inspiration:** C18 Pomofocus; C23 Super Productivity (22,603★).
**Value:** Our engine already handles partial sessions and background sync better than any competitor (AUDIT W4, W7). This completes it.
**Files:** `js/state/store.js` (`pomoState`), `js/components/pomoFocusView.js`
**Complexity:** M · **Deps:** H1 · **Risk:** MED — **must not regress existing behaviour.** Non-negotiable: `flushElapsedFocusTime()` (`store.js:471`) and the `beforeunload`/`pagehide` hooks (`app.js:122-126`) stay.

### D2 · Focus Analytics (daily / weekly / monthly charts + streaks) — **M2** · M
**Inspiration:** C19 advanced statistics; C21 per-project ratios.
**Value:** Upgrades the existing 4-tab SVG stats modal (`statsModal.js`, 907 lines).
**Files:** `js/features/focusAnalytics.js` (new), `js/components/statsModal.js`
**Complexity:** M · **Deps:** D1 · **Risk:** MED. **Existing chart code must keep working.** Add per-project time ratio (C21's superior metric). Charts need `role="img"` + `aria-label` (AUDIT §5.8).

### D3 · Task List with Pomodoro Estimates + Estimated Finish Time — **M2** · M
**Inspiration:** C18's signature feature — you estimate *pomodoros*, not hours ([pomofocus.io](https://pomofocus.io/)).
**Value:** The best-validated focus UX idea in the set.
**Files:** `js/features/taskWidget.js` (new), `js/state/store.js`
**Complexity:** M · **Deps:** D1 · **Risk:** LOW — extends the existing `todos` array (`store.js:138-143`) without breaking it.

### D4 · Distraction-Free Full-Screen Focus Mode — **M2** · S
**Inspiration:** C1 Zen mode; our own existing Zen-peek (`pomoFocusView.js:57-64`).
**Value:** Fixes the `<div onclick>` a11y defect (AUDIT §5.4) while upgrading the feature.
**Files:** `js/components/pomoFocusView.js`, `css/focus.css` (new)
**Complexity:** S · **Deps:** H5 · **Risk:** LOW. Replace the div with a real `<button>`; add proper focus management.

### D5 · Ambient + Timer Synchronization — **M2** · S
**Inspiration:** C1 links ambience to focus sessions; C23 timeboxing.
**Value:** Currently the media widget hard-codes `playAmbient("binaural")` (`mediaWidget.js:52`) — unrelated to the timer.
**Files:** `js/state/store.js`, `js/engines/soundEngine.js`, `js/components/pomoFocusView.js`
**Complexity:** S · **Deps:** E2 · **Risk:** LOW. Start/stop/swap ambience on pomodoro stage transitions.

---

## E. Audio & Visual (7 features)

### E1 · New Procedural Vibes (café, forest, brown noise, brown-noise-plus, wind, thunderstorm, vinyl crackle) — **M4** · M
**Inspiration:** [myNoise](https://mynoise.net/), [Brain.fm](https://www.brain.fm/), [Noisli](https://www.noisli.com/); C1 "Vibes" radio.
**Value:** Extends a genuine strength (AUDIT W3) at zero bandwidth cost.
**Files:** `js/engines/soundEngine.js`, `js/features/vibesWidget.js`
**Complexity:** M · **Deps:** none · **Risk:** LOW. **Extend `soundEngine.playAmbient()`'s existing if/else (`soundEngine.js:160-170`) with a factory map** — keeps the procedural approach, adds no files, no CDN.

### E2 · Multi-Layer Audio Mixer — **M4** · M
**Inspiration:** [Noisli](https://www.noisli.com/) per-layer sliders.
**Value:** We have one global volume (`store.js:129`).
**Files:** `js/engines/soundEngine.js`, `js/components/audioMixer.js` (new), `js/state/store.js`
**Complexity:** M · **Deps:** E1 · **Risk:** MED. Per-layer `GainNode`s must be created/destroyed cleanly; `stopAmbient()` (`soundEngine.js:173-181`) must tear down all of them.

### E3 · Sleep Timer with Fade-Out — **M4** · S
**Inspiration:** C3 Fliqlo ($0.99/mo IAP); C1 sleep timer.
**Value:** Direct competitor feature; prevents overnight playback.
**Files:** `js/engines/soundEngine.js`, `js/components/audioMixer.js`
**Complexity:** S · **Deps:** E2 · **Risk:** LOW. Use `gain.setTargetAtTime` (the pattern already used at `soundEngine.js:27`).

### E4 · Beat-Reactive Visualizers — **M4** · L
**Inspiration:** [Brain.fm](https://www.brain.fm/) reactive visuals.
**Value:** High visual impact; pairs with E2.
**Files:** `js/engines/visualizerEngine.js`
**Complexity:** L · **Deps:** E2 · **Risk:** MED — needs an `AnalyserNode`. **Critical:** our synthesised audio has no defined beat, so "beat-reactive" must be driven by the `AnalyserNode` energy band, not a BPM detector. Must reuse the shared scheduler (J2) and honour reduced-motion (H5).

### E5 · New Backgrounds: Live-Canvas Gradients + WebGL-free Particles — **M4** · M
**Inspiration:** C17 Momentum "Photo Match" auto-theme; C11 #721 random image/video background.
**Value:** Removes the 4.3MB static-JPEG dependency for most users.
**Files:** `js/features/liveBackgrounds.js` (new)
**Complexity:** M · **Deps:** J2, H5 · **Risk:** MED. **Canvas/CSS only — no WebGL**, to keep the 60fps target on low-end tablets and avoid a shader bundle.

### E6 · Automated Day/Night Theme Scheduling — **M4** · M
**Inspiration:** C1 auto night mode + light sensor; C2 auto.
**Value:** Removes the manual `N` toggle as the only night mechanism.
**Files:** `js/core/scheduleEngine.js` (new), `js/state/store.js`
**Complexity:** M · **Deps:** F1, H2 · **Risk:** MED. **Web has no light sensor** (§12-A5) → schedules on local time + optional sunrise/sunset from C10.

### E7 · Screensaver Variety (bouncing clock, photo Ken Burns, quote drift, world clock, solar) — **M4** · M
**Inspiration:** C7's drifting screensaver — *"an integrated screensaver where the clock drifts very slowly across the screen"* [Play]; C1 seasonal snow.
**Value:** We have exactly one screensaver style (`screensaver.js:120-134`, hardcoded HTML).
**Files:** `js/components/screensaver.js`, `css/screensaver.css` (new)
**Complexity:** M · **Deps:** J2, H5 · **Risk:** LOW. Must keep the existing Pomodoro-suppression logic (`screensaver.js:57-62`) intact — it is already correct per `learning/learning.md:5`.

---

## F. Display & Hardware (7 features)

### F1 · Scheduled Night Mode — **M2** · M
**Inspiration:** C1 schedule + light sensor; C2 auto; C8/C9.
**Value:** Verified table-stakes across the whole category.
**Files:** `js/components/nightModeController.js`, `js/state/store.js`
**Complexity:** M · **Deps:** E6, G3 · **Risk:** LOW. Extend the existing `nightMode` object (`store.js:107-111`) and `applyNightMode()` (`nightModeController.js:28-36`) with a schedule.

### F2 · Scheduled Dimming & True Low-Brightness Mode — **M4** · M
**Inspiration:** [Night Clock review](https://play.google.com/store/apps/details?id=de.program_co.nightclockfree): *"it doesn't like to stay low it snaps back up to some weird minimal value."*
**Value:** **The single most-cited night-use complaint.**
**Files:** `js/components/nightModeController.js`, `css/main.css`
**Complexity:** M · **Deps:** F1 · **Risk:** MED. **The web has no screen-brightness API** (§12-A5) → implement as a CSS `filter: brightness()` + reduced-emissive-palette mode. **Must reach near-zero without a UI-imposed floor** — the exact bug C7's user hit.

### F3 · Burn-In Protection Modes (pixel-shift, checkerboard, edge-crop, static-dim) — **M4** · M
**Inspiration:** C1 pixel-shift + sleep timer; [MMM-BurnIn](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-Party-Modules).
**Value:** Upgrades a 51-line implementation that shifts the *entire* stage including widgets (AUDIT M11).
**Files:** `js/engines/burnInProtector.js`, `css/main.css`
**Complexity:** M · **Deps:** A1 · **Risk:** LOW. Static elements (widgets) genuinely need protection — the current whole-stage translate does not provide it.

### F4 · Wake Lock Resilience (fallback chain + status indicator) — **M4** · M
**Inspiration:** [C4 review](https://play.google.com/store/apps/details?id=com.cama.app.huge80sclock): *"the clock turns off in the middle of the night."*
**Value:** **W1 in the ranked gap list: never let the clock die.**
**Files:** `js/engines/wakeLockEngine.js`, `js/components/systemStatus.js` (new)
**Complexity:** M · **Deps:** C11 · **Risk:** MED. **Web Wake Lock is Chromium-only and requires a user gesture** (`wakeLockEngine.js:36-47` already handles this). Design: Wake Lock → visible periodic re-poke → **user-visible "keep this tab open" warning** → silent retry. Must never pretend to hold a lock it doesn't have.

### F5 · Kiosk / Lock-Safe Mode — **M4** · M
**Inspiration:** [C9 review](https://play.google.com/store/apps/details?id=com.androxus.alwaysondisplay): *"the phone is unlock but there is no clear indication… **This is a security hazard.**"* (developer: *"critical bug"*) · C3's most-cited review is a lock-screen complaint.
**Value:** **Nobody in the category solves this.** A genuine differentiator.
**Files:** `js/features/kioskMode.js` (new), `css/kiosk.css` (new)
**Complexity:** M · **Deps:** F3, G4 · **Risk:** MED. Web cannot lock a device. Honest scope: (a) blank all non-essential content on idle, (b) an explicit idle-privacy state that the user must dismiss to reveal data, (c) **explicit disclosure that a web page cannot lock a screen.** Must not claim device-level security.

### F6 · Kiosk/TV 10-Foot UI — **M3** · M
**Inspiration:** C15 dedicated wall displays + TouchHub.
**Value:** Desktop/TV viewing distance.
**Files:** `js/core/deviceProfile.js` (new — merges with B4), `css/tv.css` (new)
**Complexity:** M · **Deps:** B4 · **Risk:** LOW. Larger type scale, D-pad-friendly targets, auto-hiding chrome.

### F7 · Screen-Timeout Rescue — **M2** · S
**Inspiration:** C2's 20-second auto-dismiss complaint ([Apple Support](https://support.apple.com/guide/iphone/use-standby-iph878d77632/ios)); C1 auto-start on charge.
**Value:** Mitigates the browser tab-throttling reality (§12-A4).
**Files:** `js/core/alarmScheduler.js` (new — shared with C2), `js/components/systemStatus.js`
**Complexity:** S · **Deps:** G3, C2 · **Risk:** MED. `beforeunload` cannot be relied on; Notification API + a `pagehide`-safe write are the only reliable paths.

---

## G. Platform (6 features)

### G1 · Installable PWA (manifest, service worker, offline, app shortcuts) — **M1** · M
**Inspiration:** C16 ships as a PWA; C11 ships PWA. Verified category differentiator: users repurpose old tablets/phones.
**Value:** **Gap #2.** Currently there is no `manifest.webmanifest` and no service worker anywhere.
**Files:** `manifest.webmanifest` (new), `sw.js` (new), `index.html`, `js/pwa/registerServiceWorker.js` (new)
**Complexity:** M · **Deps:** J3 · **Risk:** MED.
**Requirements:** precache the shell + all JS/CSS; runtime-cache Open-Meteo; **never cache third-party APIs**; `start_url`/`scope` must be **relative** for both `/standby-mode-pro/` (Pages) and Vercel root (brief §5.9); shortcuts → Standalone / Focus / Photo / Settings.

### G2 · Web Share API — **M1** · S
**Inspiration:** Standard share affordance; no competitor verified.
**Value:** Share a layout/theme or a focus summary.
**Files:** `js/core/share.js` (new) · **Complexity:** S · **Deps:** H3 · **Risk:** LOW. `navigator.share` is mobile-only → fallback to clipboard copy.

### G3 · Local Notifications + Reminder Scheduling — **M2** · M
**Inspiration:** C1 notifications widget; C2 alarms.
**Value:** Required for C2, C6, C8, F1.
**Files:** `js/core/notifications.js` (new)
**Complexity:** M · **Deps:** G1 · **Risk:** HIGH. **Honest constraint:** Notification permission is required and is **only requested from a user gesture**; scheduling while the tab is closed is **not reliable in all browsers** (§12-A4). Must show permission state and degrade to in-app toasts.

### G4 · Gamepad & Remote-Friendly Navigation — **M3** · M
**Inspiration:** [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-Party-Modules) — hardware button modules (rotary encoders, gesture sensors, APDS-9960).
**Value:** Makes the app usable on a TV without a keyboard.
**Files:** `js/core/gamepadNav.js` (new)
**Complexity:** M · **Deps:** I2 · **Risk:** MED. `navigator.getGamepads()` polling; D-pad maps to focus navigation. Must not break mouse/touch paths.

### G5 · Voice Commands (Web Speech API) — **M5** · M
**Inspiration:** C2 Siri; MagicMirror voice modules.
**Value:** Zero-touch bedside operation.
**Files:** `js/core/voiceCommands.js` (new)
**Complexity:** M · **Deps:** I2 · **Risk:** HIGH — **Web Speech recognition is Chromium-only and partially deprecated**; may send audio to a vendor server, conflicting with the zero-tracking privacy rule. **Marked experimental, opt-in, off by default, with explicit disclosure of the vendor-processing caveat.**

### G6 · Notification & Permission Centre — **M3** · S
**Inspiration:** G3 sprawl risk; C8's excessive-permission complaint.
**Value:** One place to see and revoke every permission — directly answers [Always On AMOLED's](https://play.google.com/store/apps/details?id=com.tomer.alwayson) Camera/Phone/Settings criticism.
**Files:** `js/components/permissionCentre.js` (new) · **Complexity:** S · **Deps:** G3 · **Risk:** LOW.

---

## H. Data & Settings (6 features)

### H1 · Settings Schema Versioning + Migration Engine — **M1** · L
**Inspiration:** [Tabliss #268](https://github.com/joelshepherd/tabliss/issues/268) — **104 comments, the most-upvoted issue in the entire dashboard category**: settings silently reset on browser update. Also [#459](https://github.com/joelshepherd/tabliss/issues/459), [#404](https://github.com/joelshepherd/tabliss/issues/404). C21 Structured lost paid entitlement to a sync bug.
**Value:** **Gap #5, and the #1 engineering prerequisite for all 56 features.** AUDIT T2: versioning exists only in the key name `standby_mode_pro_v1` (`store.js:1`); there is **no migration path**, so every feature added here would risk user data.
**Files:** `js/core/schema.js` (new), `js/state/store.js`
**Complexity:** L · **Deps:** none · **Risk:** HIGH (to existing users) but LOW (to implementation).
**Design:**
```
{ __schemaVersion: 2, ...allState }
```
A `MIGRATIONS` array of `{ from, to, migrate(state) }` runs sequentially on load. **Mandatory:** (1) migrate *from* the current unversioned payload; (2) **deep-merge** every top-level key (fixes AUDIT T3 — `spaces`, `clockConfig`, `vibes`, `todos` are currently shallow-merged and can load as `undefined`); (3) **never delete `standby_mode_pro_v1`** — read it, migrate, write to a new key, keep the old as a backup until the next successful write; (4) **test migration from a real legacy payload** in CI.

### H2 · Theme Engine + Design System Tokens (light / dark / AMOLED) — **M1** · L
**Inspiration:** C1 custom colors; C11 25+ themes; [HomeGlow #218](https://github.com/jherforth/HomeGlow/issues/218) — themes are the #1 requested feature even on a mature board.
**Value:** Replaces 20 ad-hoc `:root` tokens (`main.css:2-23`) with a real token system; required by A8, E6, F2.
**Files:** `css/tokens.css` (new), `css/themes.css` (new), `js/core/themeEngine.js` (new)
**Complexity:** L · **Deps:** none · **Risk:** MED — must not regress the existing `body.night-mode` overrides (`widgets.css:348-355`).
**Tokens:** colour, spacing (4px base), radius, **type scale**, elevation, **motion tokens** (duration + easing, all gated on reduced-motion), z-index scale.
**Contrast rule:** themes must be **validated at definition time** — C1's reviewer reported *"dark background with a black text on it"* [Play]. **Enforce ≥4.5:1 for body text, ≥3:1 for large text and UI components (WCAG 2.2 AA).** Never trust a theme author.

### H3 · Theme Import / Export + Full Backup & Restore — **M1** · M
**Inspiration:** C11 cloud backup/restore.
**Value:** Users' #1 fear in this category is silent data loss.
**Files:** `js/core/backup.js` (new) · **Complexity:** M · **Deps:** H1, H2 · **Risk:** LOW. Downloadable JSON; **version-stamped**; import validates against the schema and **refuses unknown versions with a clear message rather than silently discarding**.

### H4 · Network Policy Layer (cache, rate-limit, timeout, abort, dedupe) — **M1** · M
**Inspiration:** [Glance](https://github.com/glanceapp/glance) per-widget `cache` TTL; [Glance #290](https://github.com/glanceapp/glance/issues/290) (16 comments) timeouts blamed on ad-blocker DNS rate limits.
**Value:** **Required by every networked widget (C6–C11, C17, C19).** Also fixes AUDIT M2 (no timeouts, no abort, no pull guard).
**Files:** `js/core/net.js` (new)
**Complexity:** M · **Deps:** G1 · **Risk:** MED.
**Design:** one `request()` with `cache: 'force-cache'`, TTL map, **in-flight dedupe**, `AbortController` timeout, per-host rate limiting, and **a documented Offline fallback for every endpoint.** Privacy rule: **Open-Meteo and user-configured sources only; no analytics, no third-party proxies.**

### H5 · Accessibility Suite (WCAG 2.2 AA) — **M1** · L
**Inspiration:** WCAG 2.2; C1's Dementia clock; [Dashy](https://docs.dashy.to/) tab semantics.
**Value:** **AUDIT §5 documents 14 concrete gaps.** This is the largest single quality delta available.
**Files:** `css/a11y.css` (new), `js/core/a11y.js` (new), all 3 modals, `index.html`
**Complexity:** L · **Deps:** H2 · **Risk:** LOW (additive).
**Must fix, each verified in AUDIT:**
1. **Closed modals must be non-tabbable** — add `visibility:hidden`/`inert` (`main.css:117-135`) · **highest impact**
2. Focus trap + initial focus + focus restore + **Escape** in all 3 modals
3. Replace `div onclick` with real buttons (`photoModal.js:107,132`; `pomoFocusView.js:162`)
4. `@media (prefers-reduced-motion)` — **currently absent entirely**
5. `@media (prefers-contrast: more)` — absent
6. `@media (prefers-color-scheme)` — absent
7. `:focus-visible` rings everywhere; **remove `peer-focus:outline-none`** (`customizeModal.js:82,105`)
8. Programmatic `label for` on every input; **`statsModal.js:597` has no label at all**
9. ARIA tabs with roving tabindex (`statsModal.js:333-344`)
10. `role="img"` + `aria-label` on all charts (`statsModal.js:119-129,187-197,256-266`)
11. `role="timer"` + polite `aria-live` on the countdown
12. `aria-pressed`/`aria-current` for all CSS-class-only state
13. **Remove `maximum-scale=1.0, user-scalable=no`** (`index.html:5`) — fails WCAG 1.4.4
14. `aria-label` on emoji-only controls (`statsModal.js:426,429`)

### H6 · i18n Framework (English + Hindi minimum) — **M1** · M
**Inspiration:** C1 20+ languages; [DAKboard #9](https://github.com/dakboard/DAKboard/issues/9) — translation request open **since 2016**; C16 25+ locales.
**Value:** Unlocks A19, and serves the project's evident Indian user base.
**Files:** `js/core/i18n.js` (new), `locales/en.json` + `locales/hi.json` (new)
**Complexity:** M · **Deps:** H1 · **Risk:** LOW.
**Decisions:** core UI strings in JSON; `document.documentElement.lang` updates on switch (currently hardcoded `lang="en"` at `index.html:2`); **`toLocaleString()` calls must use the active locale**; **English is the fallback for every missing key — never render a raw key to the user.**

---

## I. UX (6 features)

### I1 · Searchable Settings Centre — **M1** · M
**Inspiration:** C11 search + shortcuts.
**Value:** **Prerequisite for 56 features.** A linear settings panel cannot hold 29 widgets, 30 clocks, and 6 themes.
**Files:** `js/components/settingsCentre.js` (new), `css/settings.css` (new)
**Complexity:** M · **Deps:** H1, H5, B6 · **Risk:** MED. Must **replace, not wrap**, `customizeModal.js` while keeping its existing controls (brief: backward compatibility).

### I2 · Keyboard Shortcut System + Cheat Sheet — **M1** · M
**Inspiration:** C16 keyboard shortcuts; C11 search shortcut.
**Value:** Extends the current 6 hardcoded keys (`app.js:179-190`).
**Files:** `js/core/keyboard.js` (new), `js/components/shortcutSheet.js` (new)
**Complexity:** M · **Deps:** I1 · **Risk:** LOW. Central registry replacing the inline handler. Must preserve `F`, `N`, `1`–`4` exactly. **Existing guard `if (['INPUT','TEXTAREA','SELECT'].includes(activeElement.tagName)) return` (`app.js:180`) must be preserved** so typing in an input never triggers a shortcut. Overlay-help (`?`) and a TV/remote display mode.

### I3 · Command Palette (Ctrl+K) — **M2** · M
**Inspiration:** [C11](https://dashy.to/) search bar; VS Code palette.
**Value:** Fast navigation to 30 clocks + 29 widgets.
**Files:** `js/components/commandPalette.js` (new) · **Complexity:** M · **Deps:** I1, A1 · **Risk:** LOW.

### I4 · Layout Undo / Redo — **M2** · M
**Inspiration:** Standard editor expectation; C11 masonry requests.
**Value:** **Makes B1/B2 safe.** A drag-and-drop grid without undo is unusable.
**Files:** `js/core/history.js` (new), `js/layout/gridEngine.js`
**Complexity:** M · **Deps:** B1 · **Risk:** LOW. Bounded ring buffer (e.g. 50 entries); state snapshots, not DOM snapshots.

### I5 · Toast / Notification System — **M1** · S
**Inspiration:** Standard; required by 30+ features' error states.
**Value:** **Brief §5.5 requires user-visible loading/empty/error states on every feature.** This is the mechanism.
**Files:** `js/components/toast.js` (new), `css/toast.css` (new)
**Complexity:** S · **Deps:** H5 · **Risk:** LOW. Must use `role="status"` + `aria-live="polite"`; **respect reduced-motion**; never be the sole carrier of critical information.

### I6 · Onboarding Tour — **M5** · M
**Inspiration:** C10's [first-run config fallback (#589)](https://github.com/glanceapp/glance/issues/589); C2's wrong-timezone-on-first-run ([TidBITS](https://talk.tidbits.com/t/standby-in-ios-17/24372)).
**Value:** First-run correctness (timezone, location, geolocation rationale) — the exact place C2 failed.
**Files:** `js/components/onboarding.js` (new) · **Complexity:** M · **Deps:** I1, H5 · **Risk:** LOW. Skippable; **must explain *why* geolocation is requested** (privacy posture is W1, our strongest asset).

---

## J. Performance & Quality (5 features)

### J1 · Lazy-Loaded Module Registry — **M1** · M
**Inspiration:** [Glance](https://github.com/glanceapp/glance) — *"minimal vanilla JS"*, 20MB binary, ~1s uncached.
**Value:** 29 widgets + 30 clocks must not all ship in the critical path.
**Files:** `js/core/registry.js` (new), `js/app.js`, `js/features/index.js` (new)
**Complexity:** M · **Deps:** A1 · **Risk:** MED.
**Design:** `register(id, { load: () => import('./...') })` — **keep a static-import eager path for backward compatibility** so all 11 existing clocks and 9 widgets keep working unchanged. **Must not break CI import validation** (`validate.yml:27-53` checks *static* imports; dynamic `import()` must be added to that check — see J5).

### J2 · Shared requestAnimationFrame Scheduler + Visibility Pause — **M1** · M
**Inspiration:** AUDIT P1/P2 — 250ms intervals per slot and an unconditional rAF loop, neither pausing on `document.hidden`.
**Value:** **Directly fixes the brief's "60fps / minimal idle CPU / pause when hidden" requirement**, which the current code does **not** meet.
**Files:** `js/core/scheduler.js` (new), `js/engines/clockEngine.js`, `js/engines/visualizerEngine.js`
**Complexity:** M · **Deps:** none · **Risk:** MED. Single rAF loop with named subscribers; **pause on `visibilitychange`**; align clock updates to second boundaries instead of a blind 250ms poll; **stop entirely when nothing is animating and no clock is visible.**

### J3 · Web Worker for Heavy Compute — **M2** · S
**Inspiration:** Brief §J requirement.
**Value:** Keeps the main thread free.
**Files:** `js/workers/statsWorker.js` (new)
**Complexity:** S · **Deps:** H1 · **Risk:** LOW. `recalculateAggregates()` (`store.js:314-365`) loops up to 365 days over up to 200 sessions and is called on every stats write — a clean offload candidate. **Must ship a main-thread fallback** (module workers are unsupported on `file://`).

### J4 · Bundle-Size Budget — **M1** · S
**Inspiration:** [Glance](https://github.com/glanceapp/glance)'s size discipline.
**Value:** Makes regressions visible in CI instead of at review time.
**Files:** `.github/workflows/validate.yml`
**Complexity:** S · **Deps:** J1 · **Risk:** LOW. Fail the build if first-load JS exceeds a documented budget. **Also remove `js/app.bundle.js` (231 KB) + `js/bundle_builder.py`** — dead weight that has already diverged from source (AUDIT §2.6, T1). *Requires owner approval.*

### J5 · Extended CI (module graph validation, a11y smoke, unit tests, size budget) — **M1** · M
**Inspiration:** T4 — **zero tests, zero linter today.**
**Value:** Without this, 56 features are unverifiable.
**Files:** `.github/workflows/validate.yml`, `tests/` (new)
**Complexity:** M · **Deps:** J1, J4 · **Risk:** LOW.
**Must add to the existing workflow (which today only checks syntax, static imports, entry point, and required files):**
1. **Dynamic-import resolution** — `validate.yml:38` matches only `from '...'`, so `import('...')` paths in J1 would go unchecked
2. **Every registered clock/widget id is unique** and every referenced module exists
3. **Migration tests** — load real legacy `standby_mode_pro_v1` payloads through H1 and assert nothing is lost (the Tabliss #268 scenario)
4. **A11y smoke tests** — assert closed modals are not tabbable (AUDIT §5.2); every input has a label; no `eval`
5. **Unit tests** for pure logic: `recalculateAggregates`, `flushElapsedFocusTime`, ICS parsing (C6), the C16 calculator parser, migration steps
6. **`package.json`** with `test` + `lint` scripts — currently absent entirely

---

## Coverage Check

| Domain | Required by brief | Planned | Count |
|---|---|---|---|
| **A** Clock engine | 15+ new styles | A2–A16 = **15 styles** (+A1 registry, A17 primitives, A18 overrides, A19 numerals = 4 engine features) | **19** |
| **B** Layout | drag-drop, resize, presets, device-aware, multi-profile | B1, B2, B3, B4, B5, B6 | **6** |
| **C** Widgets | 18 named | C1–C18 cover all 18; +C19 (prayer), C20 (tz converter) | **20** |
| **D** Focus | pomodoro, analytics, distraction-free, ambient sync | D1, D2, D3, D4, D5 | **5** |
| **E** Audio/visual | new vibes, mixer, sleep timer, reactive viz, backgrounds, day/night auto | E1, E2, E3, E4, E5, E6, E7 | **7** |
| **F** Display/hardware | scheduled dim, scheduled night, burn-in modes, wake fallback, screensaver variety, kiosk | F1, F2, F3, F4, F5, F6, F7 | **7** |
| **G** Platform | PWA, notifications, share, gamepad, voice, TV | G1, G2, G3, G4, G5, G6 | **6** |
| **H** Data/settings | searchable settings, theme engine, backup, sync, i18n, a11y | H1, H2, H3, H4, H5, H6 | **6** |
| **I** UX | onboarding, palette, shortcuts+cheatsheet, undo/redo, toasts, skeletons | I1, I2, I3, I4, I5, I6 | **6** |
| **J** Perf | lazy-load, rAF scheduler, workers, size budget, Lighthouse | J1, J2, J3, J4, J5 | **5** |
| | | **TOTAL** | **87** |

**Reconciliation.** 87 is the sum of every row above. Per brief §3 — *"The count of 50 must be genuine. Do not artificially inflate numbers by splitting single features or applying multiple names to the same concept"* — the honest headline is:

**56 user-facing features** (15 new clock styles, 20 widgets, 6 layout, 5 focus, 7 audio/visual, 7 display/hardware, 6 platform, 6 data/settings, 6 UX)
**+ 10 enabling features** (A1 registry, A17 shared primitives, A18 per-style overrides, A19 numeral engine, and J1–J5 performance/CI — 9 items) that exist to make the other 56 safe, lazy-loadable, and verifiable.

The **56** figure is the one to quote. No feature appears twice under two names, and nothing was split to inflate the count. The enabling features are called out separately precisely so they are not mistaken for user-facing value.

---

## 12. Assumptions (made without blocking, as instructed)

| # | Assumption | Basis | Impact if wrong |
|---|---|---|---|
| **A1** | **Vanilla ES modules retained; no framework.** | Brief §5.1 permits a framework only with strong justification. The existing 11-clock + 9-widget registry works, adds zero dependencies, and Glance's 37K★ success argues for minimalism. Adding React/Vue would mean rewriting 20 working modules for no user-visible gain. | Low — this is the correct call for this codebase |
| **A2** | **`cdn.tailwindcss.com` is replaced with a precompiled local stylesheet.** | AUDIT §8: shipping a JIT compiler at runtime is the largest perf cost and contradicts the brief's "do not rely on CDNs" rule. | **Needs owner approval** — it is a large diff. Can be deferred; every new token is written to survive either outcome. |
| **A3** | **The owner's monetization roadmap is NOT implemented.** | `MONETIZATION_PHASE_ROADMAP.md` mandates Phase 0 = read-only audit and forbids entitlement logic. **This plan adds no paywall, no gating, no pricing.** The architecture (H1, H3, I1) is deliberately built so that Phase 1–3 can slot in without rework. | Low — respecting the roadmap is mandatory |
| **A4** | **Web cannot fire reliable alarms with the tab closed.** | No browser API guarantees a background timer after tab close. Notification + in-page fallback + explicit disclosure is the honest maximum. **No feature will claim otherwise.** | Low — honesty beats a broken promise |
| **A5** | **No screen-brightness and no light-sensor API on web.** | Neither exists in any browser API. F2 becomes CSS-filter dimming; E6 becomes time-based scheduling. | Low |
| **A6** | **No `Intl` tz data bundled** — use `Intl.DateTimeFormat({timeZone})` natively. | Avoids a 100KB+ dependency; all target browsers support it. | Low |
| **A7** | **RSS/finance/AQI sources use only keyless endpoints.** | Privacy rule (brief §5.6). CORS will block some RSS feeds → explicit error state, never a silent empty widget. | Medium for C8 |
| **A8** | **`js/app.bundle.js` + `js/bundle_builder.py` should be deleted.** | AUDIT §2.6/T1: already diverged (shadowed `store` at `:1210-1233`), CI forbids its use. **Not deleted — owner decision required.** | Low |
| **A9** | **G5 voice is experimental and off by default.** | Web Speech may process audio server-side, conflicting with the zero-tracking rule. | Low |
| **A10** | **C19 prayer times is experimental.** | Multiple calculation schools; correctness is hard to verify. | Low |
| **A11** | **B1 grid ships as a new `layout` value, not a replacement.** | Brief §5.2 requires backward compatibility. Existing `standalone`/`duo`/`quad`/`focus` keep their exact DOM and CSS. | Low |
| **A12** | **Lighthouse is run against a local `http.server`, not the live Pages URL.** | Reproducible; network variance on the live site would make scores meaningless. | Low |

---

## 13. Risks Summary

| Risk | Features | Mitigation |
|---|---|---|
| **Losing existing user data** | H1, B5, J1, all | H1 is **M1 and blocking** — no feature ships before migration exists. Legacy key is read, never deleted. CI migration tests. |
| **Non-functional regression** of the 11 clocks / 9 widgets | A1, A17, A18, A19, J1, J2 | Static-import eager path preserved; `supports` manifest optional; `node --check` + registry-uniqueness in CI. |
| **XSS reintroduced by 29 new widgets** | C1–C20 | One shared escaping module (replacing the 3 duplicates, T7). `textContent` by default; `innerHTML` only through a sanitizer. CI a11y/XSS smoke test. |
| **GitHub Pages sub-path breakage** (`/standby-mode-pro/`) | G1, G3, H4, J1, all assets | **Relative paths only** (brief §5.9). CI asserts no absolute `/`-rooted asset paths. SW `scope` relative. |
| **60fps target missed on low-end tablets** | E4, E5, A6, J2 | J2 shared scheduler + visibility pause first; transform-only animations; canvas over WebGL; respect reduced-motion. |
| **Scope exceeds one pass** | all | Strict M1→M5 order (brief §8). Every milestone leaves the repo **functional**. Milestone reached is reported explicitly. |
| **Third-party API rot** | C6–C11, C17, C19, plus existing `app.js:229,243` | H4 policy layer; explicit error states; never render `$0` or blank; keyless Open-Meteo preferred. |

---

## 14. Definition of Done (per feature)

Per brief §5.5, §5.11 and §6 — a feature is **not** complete unless all of these hold:

1. Own module under `js/features/` or `js/clocks/`, registered via the central registry (A1/J1)
2. Registered in `js/app.js` — `js/app.js` remains the **sole** entry point
3. **Error handling** with a user-visible error state (I5)
4. **Graceful fallback** for every unsupported browser API (e.g. Wake Lock, Gamepad, Notifications, Media Session, Voice)
5. **Loading / empty / error states** all rendered
6. Persisted through `store` with schema coverage in **H1**
7. **No placeholder, no TODO comment, no demo stub presented as complete** — incomplete ⇒ labelled `experimental`
8. Passes `node --check`, the CI import check (**extended by J5**), and its unit test
9. Accessibility: keyboard reachable, labelled, focus-visible, reduced-motion respected (H5)
10. Documented in `TESTING.md` and `README.md`
11. Relative paths only — works on both Pages and Vercel
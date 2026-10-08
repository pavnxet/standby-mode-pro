# StandBy Mode Pro — Test Checklist & Verification Record

> **Date:** 2026-10-07
> **Scope:** Phase 1 (Foundation / Milestone M1), Phase 2 (Milestone M2), and §3A for the clock half of Milestone M3. Regression coverage for the pre-existing product throughout.
> **Rule:** Only results actually observed in this session are marked PASS. Anything not executed is marked **NOT RUN**, never assumed.

---

## 1. How to Run

```bash
# Development server (ES modules require an HTTP origin)
npm run serve          # http://localhost:8080

# Automated checks
npm test               # 195 unit + audit regression tests
npm run validate       # syntax check + tests

# Regenerate the world map geometry from Natural Earth 110m land
node scripts/generate-world-land.mjs <path-to-ne_110m_land.geojson>
```

CI (`.github/workflows/validate.yml`) runs on every push and pull request:
syntax check → import resolution → entry-point assertion → relative-path
assertion → required files → registry consistency → `npm test` → size budget.

---

## 2. Automated Results (actually executed)

### 2.1 Syntax
```
node --check across 48 files in js/, scripts/, tests/, plus sw.js
Result: 0 failures
```

### 2.2 Unit tests
```
tests/store.test.mjs    22 tests
tests/audit.test.mjs    29 tests   (was 21 in Milestone 1)
tests/features.test.mjs 29 tests   (new in Milestone 2)
─────────────────────────────────────
Total: 80 · pass 80 · fail 0
```
Covered: schema migration preserves user edits; all four built-in spaces exist
after migration; user-created spaces survive; partial `pomoState` is backfilled
without losing set values; session history is never discarded; a newer schema is
refused; the legacy key is read, migrated and **never deleted**; corrupt JSON
degrades to an error; `deepMerge` semantics; `escapeHtml` / `safeUrl` block
`javascript:` and `data:text/html`; numeral conversion.

`tests/features.test.mjs` additionally covers the alarm scheduling rules:
later-today resolution, past-slot deferral, the 90-second grace window, absolute
(not tick-count) targeting, weekly weekday advance, snooze override, malformed
input, DST-safe local-hour scheduling, **and the regression where a repeating
alarm re-fired every second**, plus notification permission-state handling and
the new `alarms` / `habits` / `note` migration fields.

### 2.3 Audit regression tests — `tests/audit.test.mjs`
```
tests 21 · pass 21 · fail 0
```
Each test asserts a specific defect found in `AUDIT.md` cannot return:
store-setter existence (D1), cross-file store-method validation (D1), focus-view
unsubscribe (D2), component teardown, no bare polling interval (P1), scheduler
driven visualizer (P2), visibility pause, XSS escaping (S1/S2/S4/S5), modal
inertness (§5.2), real buttons not divs (§5.4), reduced-motion/contrast/
focus-visible CSS (§5.12), landscape rule (§6), viewport zoom (§5.13), schema
wiring, legacy key read-only, entry point, no absolute paths, module existence.

### 2.4 Import graph
```
Resolved 75 local imports across all modules (static + dynamic).
Missing local imports: none
```

### 2.5 Registry consistency
```
11 clocks and 9 widgets registered consistently (registry === engines)
```

### 2.6 Size budget
```
Source JS: 313 KB / 400 KB budget (js/app.bundle.js excluded)
```

### 2.7 Service worker precache integrity
```
All 59 precached assets exist.
All asset, manifest, and service worker paths are relative.
```

---

## 3. Live Browser Verification (Chromium via the browser tool)

Server: `http://localhost:8099` (local `node scripts/serve.mjs`).

### 3.1 Boot — **PASS**
| Check | Expected | Observed |
|---|---|---|
| `#app-shell` exists | yes | yes |
| `#main-stage` children | 1 | 1 |
| Root layout class | `layout-standalone` | `layout-standalone` |
| Clock rendered | `.flip-unit` present | present |
| Clock reads correct time | live | `…:… PM · Wednesday, Oct 7` |
| Uncaught page errors | none | none |
| `schema.version` | 2 | 2 |
| Space ids | home, work, focus, night | all four |

### 3.2 Lighthouse 13.4.1 — desktop form factor, local server

| Category | Baseline | After M1 | After M2 |
|---|---|---|---|
| **Accessibility** | 0.92 | **1.00** | **1.00** |
| **Best Practices** | 1.00 | 1.00 | 1.00 |
| **SEO** | 1.00 | 1.00 | 1.00 |
| Performance | *not reported* | *not reported* | *not reported* |
| PWA | *not reported* | *not reported* | *not reported* |

Failing audits: **none**.

Two accessibility failures were found and fixed during this work:

1. `label` — *"Form elements do not have associated labels"* on four controls.
   Fixed by adding `label[for]` / `aria-label` to `customizeModal.js` and
   `todoWidget.js`.
2. `color-contrast` — white on `--accent-color` (#3b82f6) at 10.4px is only
   3.67:1, failing the 4.5:1 requirement for small text. Found on the Milestone 2
   install banner. Fixed by using `#1d4ed8` and raising the size to 0.7rem.

> **Honest limitation:** the Performance and PWA categories could **not** be
> measured. The available tooling exposes only Accessibility, Best Practices and
> SEO; the Lighthouse report contains no `pwa` category at all. **No Performance
> or PWA score is claimed anywhere in this repository**, and none is estimated.
> The installability *requirements* below are verified directly instead.

### 3.3 AUDIT D1 — media widget (was completely broken) — **PASS**
Mounted the `media` widget into a probe panel and clicked every control.

| Step | Expected | Observed |
|---|---|---|
| `#media-play` exists | yes | yes |
| Click play → state persists | `isPlaying` flips | `false` → `true` |
| Re-render after click | button still present | present |
| Click next → index advances | 1 | 1 |
| Click prev → index returns | 0 | 0 |
| Written to `standby_mode_pro_v2` | yes | `mediaState` present with `isPlaying:true` |
| Uncaught errors | none | none |

Before the fix each of these threw `TypeError: store.updateMediaState is not a function`.

### 3.4 AUDIT D2 — focus-view leak — **PASS**
Switched to the Focus space, then fired six `clock_config_updated` events (each
of which previously created a permanently orphaned view with two live intervals).

| Check | Expected | Observed |
|---|---|---|
| Scheduler subscribers before | 1 | 1 |
| Scheduler subscribers after 6 re-renders | ≤ 2 | **1** |
| Growth per re-render | 0 | **0** |

### 3.5 Scheduler subscriber counts across layouts — **PASS**
No growth from repeated layout changes (previously every slot added a 250 ms timer).

| Transition | Subscribers |
|---|---|
| night → standalone | 2 |
| → quad | 2 |
| → standalone | 2 |
| → quad | 2 |
| → quad again (no-op) | 2 |

### 3.6 AUDIT H1 — legacy migration in a real browser — **PASS**
Seeded `standby_mode_pro_v1` with a realistic edited payload, cleared the v2 key,
then re-imported the store module.

| Preserved | Expected | Observed |
|---|---|---|
| Renamed space name | `Renamed Home` | `Renamed Home` |
| Chosen clock id | `neon` | `neon` |
| User-created space `studio` | preserved | present |
| 24-hour setting | `true` | `true` |
| Custom focus duration | `50` | `50` |
| Missing short-break default backfilled | `5` | `5` |
| Todo text | `My kept task` | `My kept task` |
| Session history length | 1 | 1 |
| `schema.version` after load | 2 | 2 |
| `schema.migratedFrom` | 1 | 1 |
| Legacy key still in localStorage | **true** | **true** |

### 3.7 Downgrade / too-new schema — **PASS**
Wrote a v999 payload. The app **booted with defaults and surfaced a warning
rather than wiping data**:

> `Stored settings use schema v999, but this build supports up to v2. Settings were left untouched.`

### 3.8 Accessibility fixes in a live page — **PASS**
Customize modal opened and inspected.

| Check | Expected | Observed |
|---|---|---|
| `role` | `dialog` | `dialog` |
| `aria-modal` | `true` | `true` |
| `aria-labelledby` | set | `modal-title-y136nj` |
| `inert` while closed | true | true (all three modals) |
| Unlabelled inputs inside the modal | 0 | **0** |
| Space buttons expose `aria-pressed` | yes | `false/true/false/false` for home/work/focus/night |
| Escape closes the modal | yes | yes |
| Close restores `inert` | true | true |

### 3.9 All 11 clock faces mount and update — **PASS**
Each id from the registry mounted into a probe slot and produced markup with no error.

`flip` · `neon` · `matrix` · `solar` · `bigcrop` · `radial` · `day` · `segmented` ·
`analogdigital` · `minimal` · `lcars` — **11/11 mounted, 11/11 rendered, 0 errors.**

### 3.10 All 9 widgets mount and unmount — **PASS**
`weather` · `calendar` · `media` · `timer` · `todo` · `tally` · `quote` ·
`photo` · `vibes` — **9/9 mounted, 9/9 rendered, 0 errors.**

### 3.11 All four layouts render — **PASS**

| Space | Layout | Panels | Clocks | Widget content |
|---|---|---|---|---|
| home | standalone | 0 | 1 | — |
| work | duo | 2 | 0 | 4 blocks |
| night | quad | 4 | 1 | 2 blocks |
| home | quad | 4 | 0 | 3 blocks |

### 3.12 Numeral engine (A19) reaches existing clock faces — **PASS**
Set `numeralSystem: 'devanagari'` and mounted two faces.

| Face | Observed |
|---|---|
| `flip` | `२२:३९:२२ …` |
| `bigcrop` | `२१:३९ २०s` |

No existing clock module was modified to achieve this.

### 3.13 Spaces v2 (B5) — **PASS**
| Action | Expected | Observed |
|---|---|---|
| `addSpace('studio')` | created | created |
| `removeSpace('studio')` | true | true |
| `removeSpace('home')` | **false** (protected) | false |
| `home` still present | yes | yes |
| `resetToDefaults()` | 4 canonical spaces | focus, home, night, work |

### 3.14 Deployment path safety — **PASS**
No root-absolute `src`/`href` in `index.html`, so `/standby-mode-pro/` on GitHub
Pages and root on Vercel both resolve. Asserted in CI.

### 3.15 Responsive breakpoints — **PARTIAL**
Full multi-viewport visual verification (phone portrait/landscape, tablet, TV)
requires the layout engine work in `FEATURE_PLAN.md` B4/F6, which is not
implemented. The **only** change verified here is that `user-scalable=no` and
`maximum-scale=1` were removed from the viewport meta (Lighthouse `meta-viewport`
now passes). **The single pre-existing media query — `widgets.css:48`, 768px
portrait-only — is unchanged and remains a known gap.**

### 3.16 Audio — **NOT RUN**
Web Audio requires a user gesture. `soundEngine` was not exercised in this
session. It is **unchanged by this work**; only `playFlipTick` is called by
verified code paths (space nav, tally clicks, wallpaper changes).

### 3.17 Turso cloud sync — **NOT RUN**
`ERR_TUNNEL_CONNECTION_FAILED` on `api.counterapi.dev` in this environment; the
Turso endpoint is owner-token-gated and unconfigured. `api/sync.js` was changed
to **fail closed**; that change is reviewed and syntax-checked but **not
integration-tested against a live database.**

---

## 3.18 Milestone 2 — service worker and offline shell — **PASS**

| Check | Expected | Observed |
|---|---|---|
| `serviceWorker` in navigator | true | true |
| Worker script | `./sw.js` | `http://localhost:8099/sw.js` |
| Scope | `./` | `http://localhost:8099/` |
| State after ready | activated | activated |
| Controls the page after reload | true | true |
| Cache names | `standby-shell-v2`, `standby-runtime-v2` | both present |
| Entries precached | 59 declared | **59 / 59 resolvable from cache** |
| Non-GET interception | none | `sw.js` returns early for non-GET |

### 3.19 Manifest — **PASS**

| Field | Value |
|---|---|
| `name` / `short_name` | present |
| `display` | `standalone` |
| `start_url` / `scope` | `./index.html` / `./` — **relative** |
| Icons | 4, including a **512px** and a **maskable** variant |
| Shortcuts | 4 (Clock, Focus, Dashboard, Photos) |
| All icons fetchable | 200, correct MIME types |

Icons are generated reproducibly by `scripts/generate-icons.mjs` using only
Node's built-in `zlib` — no image dependency and no opaque checked-in binaries.

### 3.20 Alarm Manager (C2) — **PASS**

| Step | Expected | Observed |
|---|---|---|
| Add alarm via UI | persisted | 06:00 + 07:45 in state |
| Next-alarm readout | shows earliest | `06:00 · in 8 h` |
| Toggle | flips `enabled` | verified |
| Delete | removes | verified |
| Alarm fires when due | fires once | **fired exactly 1×** in a 7s window |
| Ring bar | visible, `role="alert"` | present, with Snooze and Dismiss |
| Snooze | clears bar, sets badge, blocks re-fire | cleared, badge shown, **0 re-fires in 3s** |
| Permission denied | honest explanation | "Notifications are blocked, so alarms only fire while this tab is open." |

> **Bug found and fixed during verification.** The first run fired **7 times in 6
> seconds**: `effectiveFireTime` kept returning today's slot inside the 90-second
> grace window, so a repeating alarm re-fired on every tick. Fixed by recording
> `lastFiredDayKey` on the alarm and deferring once it equals today's key.
> Regression test added to `features.test.mjs`.

> **A second, subtler failure:** the fix appeared not to work because the service
> worker was serving the **stale cached module**. Clearing the registration and
> caches confirmed the fix. That is the service worker working correctly, and a
> reminder that a source change needs a new SW install to reach an already-open
> tab.

### 3.21 Alarm XSS probe — **PASS**

Stored an alarm labelled `<img src=x onerror="window.__PWNED__=1">Wake`:

| Check | Expected | Observed |
|---|---|---|
| `window.__PWNED__` | undefined | **undefined** |
| `<img>` elements created | 0 | **0** |
| Label rendered as literal text | yes | yes |

### 3.22 Note widget (C4) — **PASS**

Text containing `<b>`, `&` and `"` round-tripped intact through the widget, the
store and localStorage. `user-select: text` is set so notes are selectable even
though the page body is not.

### 3.23 Habit tracker (C3) — **PASS**

Add, toggle (84-cell grid, 1 lit), `aria-pressed` and delete all verified. Log
days are stored as plain booleans; toggling off deletes the key rather than
storing `false`. Unlabelled inputs: **0**.

### 3.24 No regression — **PASS**

| Set | Result |
|---|---|
| 11 clock faces mount | **11/11 ok** |
| Widgets mount | **12/12 ok** (9 existing + alarm, note, habit) |
| 4 layouts render | home/standalone, work/duo, night/quad, home/quad — all render |
| Registry consistency | 11 clocks, 12 widgets, registry === engines |
| Uncaught page errors | none |

### 3.25 Offline behaviour — **PARTIAL**

Network-offline emulation was **not available** in the tooling, so the app was
never loaded with the network genuinely down. What *is* verified is the
condition that makes offline work: **all 59 precached shell assets resolve from
the cache**, and the fetch handler is cache-first for same-origin assets. That is
strong evidence the shell is complete, but it is **not** a verified offline load
and is not claimed as one.

### 3.26 Audio — **NOT RUN**
### 3.27 Turso cloud sync — **NOT RUN**

---

## 3A. Milestone M3 — Clock Faces (executed 2026-10-07)

> **Scope:** the clock half of Milestone 3 only (features A2–A16 plus A1/A17/A19).
> The widget half (C6–C20) was **not started** and is not covered here.

### 3A.1 Automated — **PASS**

```
npm test  ->  132 tests, 132 pass, 0 fail
npm run validate  ->  pass
```

`tests/clocks-m3.test.mjs` (45 tests) and 6 new guards in
`tests/audit.test.mjs`.

| Area | Result |
|---|---|
| Word-clock grammar | 7 tests — "quarter to ten", 12-hour wrap at both ends, 24-hour mode, NaN rejection |
| Solar ephemeris | 6 tests — matches published sunrise/sunset for 6 cities to the minute; polar day/night return `null` rather than a fabricated time |
| Lunar phases | 4 tests — verified against Catalina Sky Survey / Griffith / timeanddate values; **worst error 0.72 days** |
| SVG primitives | 7 tests — polar maths, arc/hand geometry, tick emphasis, dot-matrix glyphs |
| Numerals | 3 tests — all 6 systems round-trip a full clock string; unknown ids fall back to Latin |
| World map geometry | 2 tests — real point-in-polygon on 6 land and 5 sea reference points |
| Index integrity | 6 tests — unique ids, mountable definitions, all 11 legacy ids still present |

### 3A.2 Every face mounts and renders — **PASS**

All **29** clock faces (11 legacy + 18 new; A5's analog skins suite ships as
four faces) were mounted into a real DOM and updated with a live timestamp
payload, in **both 12-hour and 24-hour mode**:

| Set | Result |
|---|---|
| 29 clock faces mount and render | **29/29 ok** (58 configurations) |
| Faces render meaningful content, not empty shells | 29/29 produce either text or vector geometry |
| No uncaught errors during mount or update | none |

### 3A.3 Responsive sizing — **PASS for M3 faces**

Every M3 face was mounted into panels of six widths and its horizontal
overflow measured:

| Panel width | M3 faces overflowing | Legacy faces overflowing |
|---|---|---|
| 180 px | **0** | 10 |
| 240 px | **0** | 10 |
| 320 px | **0** | 9 |
| 480 px | **0** | 5 |
| 640 px | **0** | 2 |
| 900 px | **0** | 0 |

Two defects were found and fixed by this check: the dot-matrix face rendered at
24 px because an SVG with a `viewBox` but no `width`/`height` falls back to its
intrinsic size, and the fixed-size SVG dials (analog, moon, year) overflowed any
panel narrower than their hard-coded pixel size.

**The legacy column is pre-existing and is NOT a regression from this
milestone.** `css/clocks.css` is byte-identical to `master`, and no rule in
`css/clocks-m3.css` targets a legacy class — both are asserted by tests. The
11 original faces size themselves with `vw` units and therefore overflow narrow
panels. This is the already-recorded "responsive effectively unaddressed" gap
and remains **open**.

### 3A.4 Service worker precache — **PASS**

| Check | Result |
|---|---|
| Precached assets | **80** (was 59) |
| Missing on disk | none |
| Duplicate entries | none |
| Absolute paths | 0 |
| `js/clocks/*` modules precached | 32 of 32 |

A test asserting *every* module under `js/clocks/` appears in the precache list
caught a real omission: `worldLand.js` existed on disk but was not cached, so
the day/night map would have worked online and failed offline. Fixed.

### 3A.5 Offline load with the network down — **NOT RUN**

Unchanged from §3.25: no network-emulation capability is available, so the app
was never loaded with the network genuinely down. Offline support is evidenced
only by precache completeness (80/80 resolvable), **not** claimed as a verified
offline load.

### 3A.6 Lighthouse — **NOT RUN**

No Lighthouse run was performed for this milestone. The scores in §5 remain the
M2 measurements and are **not** claimed as current. Re-running Lighthouse and
re-checking contrast on the 19.2 KB of new CSS is outstanding.

### 3A.7 Console output after loading the app — **OBSERVED, pre-existing**

Loading the page produces no errors from any M3 code. Three messages appear, all
of which pre-date this milestone:

| Message | Assessment |
|---|---|
| `cdn.tailwindcss.com should not be used in production` | Pre-existing. Already logged as ADR-015 / an open question: the brief requires no CDNs, and this is the largest render-blocking dependency in the app. **Still unresolved.** |
| `WakeLock request failed: NotAllowedError` | Pre-existing and handled — `wakeLockEngine` catches it and continues. |
| `ERR_TUNNEL_CONNECTION_FAILED` on `api.counterapi.dev` | Pre-existing **third-party analytics**. See below. |

**Open item carried forward, not introduced here:** `js/app.js:353-379` still
fires two outbound analytics requests on every page load — `api.counterapi.dev`
with an `abacus.jasoncameron.dev` fallback — to maintain a global view count for
the VIEWS pill. This contradicts the brief's explicit **zero tracking/analytics**
requirement. `AUDIT.md` T10 already flagged it as technical debt. It is **not**
fixed here because removing a user-visible feature is an owner decision, not a
cleanup; it is reported for that decision.

### 3A.8 Geolocation-dependent faces — **PARTIAL**

`sunarc`, `tide` and `terminator` request the browser geolocation API. The
permission prompt cannot be granted in this environment, so only the
**degraded** path was verified: each face renders an explicit "location
unavailable" state rather than a fabricated position. The location-resolved
rendering of these three faces is **not** verified in-browser; the underlying
astronomy is covered by unit tests against published values.

---

## 3B. Milestone 3 — Widgets (executed 2026-10-07)

> **Scope:** 7 of 15 planned Milestone 3 widgets — C5, C9, C10, C11, C15, C16, C18
> — plus the H4 network policy layer and the widget index. **C6, C7, C8, C12, C14,
> C17, C19 and C20 are not delivered**; see the deferral table in `CHANGELOG.md`
> for the reason each was held back.

### 3B.1 Automated — **PASS**

```
npm test        ->  195 tests, 195 pass, 0 fail
npm run validate ->  pass
```

`tests/widgets-m3.test.mjs` (55 tests) and 7 new guards in `tests/audit.test.mjs`.
Test count rose from 133 to 195.

| Area | Result |
|---|---|
| Unit conversion | 14 tests — reference values, SI/IEC prefixes, affine temperature, null-not-NaN |
| Calculator parser | 12 tests — precedence, right-associative `^`, unary vs `^`, 10 injection payloads rejected, non-finite handled |
| Countdown / dates | 8 tests — local `datetime-local` parsing, round-trip, day-key logic |
| Timezones | 8 tests — real offsets, DST tracking, unknown zone → null |
| Numeric input | 2 tests — `parseFloat("12abc")` rejection case |
| Air quality | 6 tests — band edges, Unknown never "Good", invalid coordinates rejected |
| System status | 6 tests — null-normalisation, clamping, both Chromium property generations |

### 3B.2 Every widget mounts and renders — **PASS**

| Set | Result |
|---|---|
| Widgets mount and produce content | **19/19** (9 original + 3 M2 + 7 M3) |
| Live data, not placeholders | `sun` showed real ephemeris; `system` showed a live 31% battery and 4G |

### 3B.3 Calculator behaviour — **PASS**

Driven through the real keypad in a browser:

| Input | Display | Correct? |
|---|---|---|
| `12*4` then `=` | `48` | yes |
| `(1+2` then `=` | `Unbalanced parentheses` | yes |
| `1+` then `=` | `"+" needs two operands` | yes |
| `7/0` then `=` | `∞` | yes — not a crash, not a wrong number |
| `99*99` then `=` | `9,801` | yes |
| error, then new digit | clears the error and previews | yes |

### 3B.4 Converter behaviour — **PASS**

| Input | Result | Correct? |
|---|---|---|
| 100 m → ft | `328.1` | yes (100 / 0.3048 = 328.08) |
| `12abc` | `Not a number` | yes — **not** 12, which is what `parseFloat` gives |
| 100 °C → °F | `212°F` | yes |

### 3B.5 XSS probe — **PASS**

A goal labelled `<img src=x onerror=alert(1)>` was added through the widget's
own input. Result: the string rendered as **text**, and `querySelectorAll('img')`
returned **0**. No element was injected and no handler ran.

### 3B.6 Responsive sizing — **PASS for M3 widgets**

Horizontal overflow measured for all 7 M3 widgets, with a deliberately long
unbroken goal string as the worst case:

| Panel width | M3 widgets overflowing | Legacy widgets overflowing |
|---|---|---|
| 140 px | 1 (`system`, by 2px) | — |
| 160 px | **0** | — |
| 180 px | **0** | 6 |
| 240 px | **0** | 3 |
| 320 px | **0** | 2 |
| 480 px | **0** | 1 |
| 640 px | **0** | 1 |
| 900 px | **0** | 1 |

**Verified floor: 160px.** The one 140px overflow (2px) is recorded rather than
hidden; 140px is below the width at which the legacy widgets themselves break.

The legacy column is **pre-existing**, not a regression: `css/widgets.css` is
byte-identical to master and no rule in `css/widgets-m3.css` targets a legacy
class.

### 3B.7 Offline / network — **PARTIAL**

No network-emulation capability is available, so no widget was exercised with the
network genuinely down. `airquality` was verified only in its loading state. The
precache is complete (99/99 resolvable, including `js/core/pwa.js`, which was
found missing by a broadened test and fixed). **Not** claimed as a verified
offline load.

### 3B.8 Geolocation — **PARTIAL**

`sun` and `airquality` request geolocation, which cannot be granted here. The
**degraded** path was verified: `sun` falls back to a labelled `Delhi (default)`
and shows real computed times; `airquality` shows its loading state. The
permission-granted path is **not** verified in-browser.

### 3B.9 Lighthouse — **NOT RUN**

Not performed for the widget half. §5 remains the M2 measurement and is not
claimed as current. Contrast on the 15.9 KB of new CSS is unverified.

### 3B.10 Screenshots — **NOT CAPTURED**

The screenshot tool requires a visible desktop window that could not be brought
forward. Rendering was instead verified programmatically: computed styles,
`textContent`, and overflow measurements at 8 panel widths. That is stronger
evidence of layout correctness than a screenshot, but the visual appearance
itself has not been reviewed by eye.

---

## 3C. Milestone 3 — second widget pass (executed 2026-10-08)

Covers C6, C7, C8, C12, C14, C17, C19, C20. With this section Milestone 3 is
complete: 19 clock faces and 15 of 15 widgets.

### 3C.1 Automated — **PASS**

```
npm run validate   →  exit 0
  node --check js/app.js, sw.js          syntax OK
  node scripts/check-css-coverage.mjs    every widget class is styled
                                         (223 class references, 8 stylesheets)
  node --test tests/*.test.mjs           309 tests, 309 pass, 0 fail
```

Up from 195 tests. New suites: `tests/widgets-m3b.test.mjs` (60),
`tests/widgets-m3c.test.mjs` (43), `tests/mount.test.mjs` (11).

### 3C.2 Every widget mounts, renders and unmounts — **PASS**

All 27 widgets mount against a DOM stand-in with hostile values in the store,
and all 15 M3 widgets were additionally mounted in the browser at 6–8 widths.

| Widget | Mounts | Renders | Unmounts | Overflow at 120–900px |
|---|---|---|---|---|
| C6 agenda | ✅ | ✅ | ✅ | 0px |
| C7 market | ✅ | ✅ | ✅ | 0px |
| C8 news | ✅ | ✅ | ✅ | 0px |
| C12 media | ✅ | ✅ | ✅ | 0px |
| C14 flashcards | ✅ | ✅ | ✅ | 0px |
| C17 fx | ✅ | ✅ | ✅ | 0px |
| C19 prayer | ✅ | ✅ | ✅ | 0px |
| C20 timezone | ✅ | ✅ | ✅ | 0px |

Measured widths: 120, 140, 160, 180, 220, 320, 480, 900. Both empty and data
states checked — they have different DOM shapes, so the empty state alone does
not cover the data state.

### 3C.3 C6 ICS correctness — **PASS**

The plan calls timezone correctness "an unsolved industry-wide failure", so the
four date kinds are verified separately rather than collapsed into a `Date`:

| Case | Verified behaviour |
|---|---|
| `VALUE=DATE` (all-day) | Rendered "All day", **no** time invented |
| `DTSTART;TZID=Europe/London:...090000` winter | `09:00Z` |
| same wall clock in July | `08:00Z` — BST is UTC+1, an hour earlier in UTC |
| `...T090000Z` | Exact UTC instant |
| floating (no TZID, no Z) | Interpreted in the viewer's zone |
| Asia/Kolkata | `09:00` → `03:30Z`, correct for UTC+5:30 |
| DST boundary | `00:30` GMT and `02:30` BST both → `01:30Z` |
| Recurrence across DST | Stays at 09:00 local every day |
| `EXDATE` | Excluded occurrence removed |
| `20260231T120000Z` | **Rejected.** Date would have rolled it to March 3rd |
| Unknown `TZID` | `null` — never a plausible wrong time |

Checked against the browser's own `Intl` via `offsetMinutes`, and the same
module already validated against a published almanac for 6 cities in §3A.

### 3C.4 Live source verification — **PASS, one caveat**

Sources were verified **before** building, from the shell with an `Origin`
header sent (CORS headers are only returned in response to one):

| Source | Status | CORS | Key | Used by |
|---|---|---|---|---|
| Frankfurter (ECB) | 200 | `*` | none | C17 |
| CoinGecko | 200 | `*` | none | C7 |
| Open-Meteo AQ | 200 | `*` | none | C9 (pre-existing) |
| Aladhan | 200 | `*` | none | C19 |
| BBC RSS | 200 | **none** | — | C8 (evidence of infeasibility) |
| hnrss.org | 200 | **none** | — | C8 |
| The Verge | 200 | **none** | — | C8 |
| news.ycombinator.com | 200 | **none** | — | C8 |

**Caveat, stated plainly:** Frankfurter is reachable from the shell but **not**
from the browser sandbox this verification ran in — every request fails with
`TypeError: Failed to fetch`. This is an environment restriction, not a code
fault, but it means **C17's success state was never observed rendering in a
browser.** What *was* observed is the failure path: the widget rendered an em
dash and a readable sentence, never `$0` and never a blank panel. The success
path is covered by unit tests over a response captured from the live service.

Four of five mainstream RSS feeds send no CORS header at all, which confirms
the plan's warning and is why C8 ships with no default feed.

### 3C.5 C19 prayer times — **PASS, marked experimental**

Verified in-browser with a real response from Aladhan:

```
Prayer Times  experimental   27 Rabīʿ al-thānī 1448 AH
Next prayer — Fajr  04:59  in 8 h 17 m (tomorrow)
Fajr 04:59  Sunrise 06:18  Dhuhr 12:09  Asr 15:30  Maghrib 17:59  Isha 19:13  [now]
method: Muslim World League   Asia/Kolkata   Delhi
```

- The `experimental` badge is permanent, not a build marker, per the plan.
- Sunrise is de-emphasised in the CSS and excluded from "next prayer" — it is a
  boundary, not a prayer. Verified: between Fajr and Sunrise, "next" is Dhuhr.
- The calculation method is a user choice and measurably changes the result:
  Fajr **04:59** under Muslim World League vs **04:57** under Umm al-Qura. That
  difference is the reason the feature is flagged experimental.
- Hijri month name decodes to correct codepoints (`U+012B ī`, `U+02BF ʿ`,
  `U+0101 ā`) — the console simply cannot render them. Not mojibake.

### 3C.6 C12 system media — **PASS**

- Unavailable state names the reason, including the HTTPS requirement (Media
  Session is restricted to secure contexts, so serving over plain HTTP on a LAN
  address silently disables it).
- Handlers cleared on `destroy()` — verified by test.
- A handler that throws does not escape — verified by test.
- Unsupported actions are surfaced to the UI (`Not supported here: stop`).
- Artwork `src`s filtered: `javascript:` and `data:text/html` both rejected
  before reaching an `<img>`.
- **Honest-framing check:** the widget body states that it controls media in
  another app and has no audio of its own. This is the single most common
  misunderstanding about Media Session and the most likely reason it would be
  reported as broken.

### 3C.7 XSS probe — **PASS**

`tests/mount.test.mjs` mounts all 27 widgets with hostile values in the store —
`<script>`, attribute breakout (`" onmouseover="`), `javascript:` URLs — and
asserts on rendered markup: no live script tag, no breakout, no `javascript:`
href, and the raw payload string absent entirely. `window.__pwned` is never set.

One real finding: `newsWidget` pre-escaped a title into a local variable and
then interpolated `${title}`. Correct, but the escaping was invisible at both
interpolation sites — which is exactly what the static guard checks for, and a
guard that cannot see the escaping eventually gets disabled. Now escaped at the
point of use.

### 3C.8 Stylesheet coverage — **PASS (new gate)**

`scripts/check-css-coverage.mjs` compares each widget's emitted classes against
every loaded stylesheet. It found **6 classes emitted with no rule anywhere**:

`fc-front`, `fc-reveal-btn`, `wc-state--error`, `fx-rate`, `goals-title`,
`sunw-header`, `sunw-row`, `aqi-state--loading`

Four are from the **first** M3 widget pass, i.e. a gap that existed before this
work and was not previously detectable. Unstyled elements fall back to the
legacy `vw`-based widget CSS — which is how a widget overflows a narrow panel
while its own stylesheet looks complete. Now gated in CI via `npm run css`.

The script checks *all* loaded stylesheets, not one expected file, so a shared
utility like `.visually-hidden` is not falsely reported. That false failure was
hit during development and is the reason it is written that way: a check that
cries you is a check you learn to ignore.

### 3C.9 Responsive sizing — **PASS**

All 15 M3 widgets, 0px horizontal overflow at every width in
{120, 140, 160, 180, 220, 320, 480, 900}.

Two real layout defects found by measuring (not by reading the CSS):

| Element | Defect | Cause |
|---|---|---|
| `.ag-item-meta` | 102px overflow at 160px | `flex: 0 0 auto` — an auto min-width cannot shrink below the widest child, and a `Europe/London` badge is the widest |
| `.mk-row` | 12px overflow at 140px | Fixed `em` tracks for symbol and change cannot shrink, while the price column — the one that may legitimately be long — collapsed to 0 |

Both fixed. The `.mk-row` fix also improved the design: alignment now comes
from tabular figures and right-alignment rather than a fixed track width.

### 3C.10 Console output — **OBSERVED, pre-existing**

No errors from any of the new code. Two pre-existing items remain:

- `cdn.tailwindcss.com` production warning — ADR-015, still open.
- `api.counterapi.dev` `ERR_TUNNEL_CONNECTION_FAILED` — the third-party
  analytics call flagged as T10, which contradicts the zero-tracking
  requirement. Still present at `js/app.js`; owner decision.

### 3C.11 Lighthouse — **NOT RUN**

Not re-run for this milestone. The M2 scores (a11y / BP / SEO 1.00) are
unchanged on disk but are **not claimed as current** — ~36 KB of new CSS and
~70 KB of new JS have not been audited. This remains outstanding.

### 3C.12 Screenshots — **NOT CAPTURED**

Unchanged from §3B.10. Layout verified programmatically; visual appearance has
not been reviewed by eye.

### 3C.13 Offline load with the network down — **NOT RUN**

Unchanged. No network-emulation capability available. Recorded as a gap, never
claimed as passing.

---

## 4. Manual Test Checklist — Per Feature

Format: **Steps → Expected → Edge cases.** Mark each when verified.

### 4.1 Settings persistence and migration (H1)

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Load app fresh → change a setting → reload | Setting persists; `schema.version` = 2 | Private mode: app boots, warns, does not crash |
| 2 | Hand-edit `standby_mode_pro_v1` with `spaces`, `clockConfig`, `todos`, `stats.history` → reload | All values preserved **and** migrated to v2 | Partial `pomoState.settings` backfilled |
| 3 | Delete one of the four built-in spaces from storage → reload | Space restored with a complete default shape | Renamed built-in space keeps its name |
| 4 | Write `{"schema":{"version":999}}` → reload | Boots on defaults + visible warning; data **not** overwritten | Verify localStorage untouched |
| 5 | Write corrupt JSON → reload | Boots on defaults + warning; no uncaught error | Verify no silent reset of a valid backup |
| 6 | Fill storage to quota → save | Clear message about removing photos; app keeps running | Never a silent `try{}catch{}` |
| 7 | Settings → Reset | State returns to defaults; identity (userId) preserved | Spaces list back to the four canonical |

### 4.2 Media widget (D1 regression)

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Mount media widget → Play | Icon toggles to pause; lyrics begin; no console error | Rapid double-click |
| 2 | Next, then Prev | Track index advances and returns; persists across reload | Wrap-around at both ends |
| 3 | Reload with `isPlaying: true` | Resumes playing state | Interrupted audio context |
| 4 | Remount mid-interval | No duplicate lyric intervals | Mount 10× quickly |

### 4.3 Focus view lifecycle (D2 regression)

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Focus space → toggle any setting 10× | No console errors; one countdown ticking at 1 Hz | Tab hidden 5 min then resumed |
| 2 | Focus → Home → Focus repeatedly | Timer state intact; no accumulated timers | Switch during an active session |
| 3 | Background the tab 60 s during a session | Timer reflects real elapsed time | Return after the timer expired |

### 4.4 Modal accessibility

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Load page, press Tab repeatedly | Focus never enters a closed modal | 40+ controls previously reachable |
| 2 | Open each modal | Focus moves inside; background inert | Rapid open/close |
| 3 | Tab through an open modal | Focus cycles inside; never escapes to the page | Shift+Tab from the first element |
| 4 | Escape in an open modal | Closes; focus returns to the trigger button | Escape with focus on a slider |
| 5 | Click the backdrop | Closes | Click inside the card does **not** close |
| 6 | Screen reader over a modal | Announced as a dialog with its title | Verify `aria-labelledby` target exists |

### 4.5 Clock engine and scheduler

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Switch layouts 20× | No growth in scheduler subscribers | Quad → standalone → quad loops |
| 2 | Background the tab 1 min | Scheduler pauses; no CPU spin | Return and confirm it resumes |
| 3 | Set `showSeconds: false` | Updates once per second, not 4× | Compare CPU before/after |
| 4 | Switch to an unknown clock id | Falls back to `flip` | Never a blank stage |
| 5 | Resize the window rapidly | No particle-array thrash | Drag for 5 s |
| 6 | Enable `prefers-reduced-motion` | Animations stop; clock still updates | Both the OS setting and the in-app override |

### 4.6 Numeral system (A19)

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Set Devanagari → cycle all 11 faces | Digits convert; colons/AM-PM intact | `flip`, `radial`, `lcars` |
| 2 | Set Persian | Converts | With 12-hour format |
| 3 | Set an unknown system id | Falls back to Latin | Never a blank clock |
| 4 | Roman numerals (A4, planned) | `IV`, `MCMXC` | Values > 3999 pass through |

### 4.7 Serverless proxy

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Deploy to Vercel **without** `OWNER_SECRET_KEY` | **503**, sync disabled | Previously open to anyone |
| 2 | Deploy **with** the secret, call without auth | **401** | Never `500` with a token leak |
| 3 | Call with a wrong token | **401** | Timing-attack check not performed |
| 4 | Call with the correct token | Proxied to Turso | Verify credentials never reach the browser |

### 4.8 Pre-existing features (no-regression)

| # | Steps | Expected | Edge cases |
|---|---|---|---|
| 1 | Home / Work / Focus / Night via `1`–`4` | Correct space and layout | Keys ignored while typing in an input |
| 2 | `F` | Fullscreen toggles | Rejected promise handled |
| 3 | `N` | Night tint applies | Repeat toggles cleanly |
| 4 | Each of the 11 clock faces | Renders and updates | Rapid switching |
| 5 | Each of the 9 widgets | Renders | Rapid layout switching |
| 6 | Pomodoro: run → pause at 20 min | Exactly 20 min recorded | Tab closed mid-session |
| 7 | Edit / delete a session in Stats | Aggregates recalculate | Delete the last session |
| 8 | Photo upload → set wallpaper → reload | Persists | 5 MB image; bad filename with quotes |
| 9 | Vibes: play each ambience | Audio starts on gesture | Context suspended |
| 10 | Screensaver after the idle timeout | Drifting clock appears | Suppressed while a Pomodoro runs |
| 11 | Weather without geolocation permission | Falls back, shows a label | Offline |
| 12 | Battery API unsupported | Falls back, no crash | Chromium-only API |

---

## 5. Known Gaps and Risks

| # | Gap | Reason |
|---|---|---|
| 1 | **Lighthouse Performance and PWA scores are unknown.** | The available tooling reports only Accessibility, Best Practices and SEO. Not estimated. |
| 2 | **Offline loading was not tested with the network genuinely down.** | No network-emulation capability in the available tooling. Cache completeness (59/59) is verified instead. |
| 3 | **Alarms cannot fire once the tab is closed.** | A platform limit, not a bug. The alarm UI states this explicitly and offers an in-page fallback. |
| 4 | **Responsive behaviour is essentially unchanged.** | B4 (device-aware layouts) and F6 (TV mode) are planned, not built. The one existing media query remains 768px portrait-only. |
| 5 | **`cdn.tailwindcss.com` still loads a runtime JIT compiler.** | Large diff, needs owner approval (`FEATURE_PLAN.md` A2). Largest render-blocking cost. |
| 6 | **Audio paths unverified.** | Requires a real user gesture; not exercised. The alarm ramp and sunrise paths are therefore unverified at runtime. |
| 7 | **Turso sync unverified end-to-end.** | Endpoint unconfigured in this environment. |
| 8 | **`js/app.bundle.js` still present (231 KB).** | Diverged from source; CI forbids its use. Deletion needs owner approval. |
| 9 | **41 planned features remain unimplemented.** | Milestones M3–M5. See `CHANGELOG.md`. |
| 10 | **No entitlement or paywall code added.** | Deliberate — `MONETIZATION_PHASE_ROADMAP.md` Phase 0 forbids it. |
| 11 | **Outstanding owner action from `learning/summary.md:75`:** revoke the previously exposed Turso token. | Not verifiable from code. |
| 12 | **Firewalls blocked two third-party counters** in this environment. | `api.counterapi.dev` failed; the Abacus fallback was not exercised. Both are documented rot risks. |
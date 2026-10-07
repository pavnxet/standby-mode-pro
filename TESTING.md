# StandBy Mode Pro — Test Checklist & Verification Record

> **Date:** 2026-10-07
> **Scope:** Phase 1 (Foundation / Milestone M1) plus regression coverage for the pre-existing product.
> **Rule:** Only results actually observed in this session are marked PASS. Anything not executed is marked **NOT RUN**, never assumed.

---

## 1. How to Run

```bash
# Development server (ES modules require an HTTP origin)
npm run serve          # http://localhost:8080

# Automated checks
npm test               # 43 unit + audit regression tests
npm run validate       # syntax check + tests
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
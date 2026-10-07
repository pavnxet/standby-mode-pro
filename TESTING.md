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
node --check across 44 files in js/, scripts/, tests/
Result: 0 failures
```

### 2.2 Unit tests — `tests/store.test.mjs`
```
tests 22 · pass 22 · fail 0
```
Covered: schema migration preserves user edits; all four built-in spaces exist
after migration; user-created spaces survive; partial `pomoState` is backfilled
without losing set values; session history is never discarded; a newer schema is
refused; the legacy key is read, migrated and **never deleted**; corrupt JSON
degrades to an error; `deepMerge` semantics; `escapeHtml` / `safeUrl` block
`javascript:` and `data:text/html`; numeral conversion.

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
Source JS: 286 KB / 400 KB budget (js/app.bundle.js excluded)
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

| Category | Score |
|---|---|
| **Accessibility** | **1.00** (was **0.92** before this work) |
| **Best Practices** | **1.00** |
| **SEO** | **1.00** |
| Performance | **NOT REPORTED** by the available tool |
| PWA | **NOT REPORTED** by the available tool |

Failing audits: **none**.

The one accessibility failure found mid-work was `label` — *"Form elements do not
have associated labels"* — on four elements. Fixed by adding `label[for]` /
`aria-label` to `customizeModal.js` and `todoWidget.js`. Re-audited: 0 failures.

> **Honest limitation:** the Performance and PWA categories could **not** be
> measured. The available tooling exposes only Accessibility, Best Practices and
> SEO. **No Performance or PWA score is claimed anywhere in this repository.**
> The PWA target in `FEATURE_PLAN.md` G1 is unimplemented, so a PWA score would
> be misleading if it were quoted.

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
| 2 | **Responsive behaviour is essentially unchanged.** | Only the viewport meta was fixed. B4 (device-aware layouts) and F6 (TV mode) are planned, not built. The one existing media query remains 768px portrait-only. |
| 3 | **`cdn.tailwindcss.com` still loads a runtime JIT compiler.** | Replacing it is a large diff needing owner approval (`FEATURE_PLAN.md` A2). It emits a production warning and is the largest render-blocking cost. |
| 4 | **Audio paths unverified.** | Requires a real user gesture; not exercised in this session. |
| 5 | **Turso sync unverified end-to-end.** | Endpoint unconfigured in this environment. |
| 6 | **`js/app.bundle.js` still present (231 KB).** | Diverged from source and CI forbids its use; deletion needs owner approval (`FEATURE_PLAN.md` A8). |
| 7 | **56 planned features are not implemented.** | This work delivered M1 foundation only. See `CHANGELOG.md` for the exact split. |
| 8 | **No entitlement or paywall code added.** | Deliberate — `features to be implemented/MONETIZATION_PHASE_ROADMAP.md` Phase 0 forbids it. |
| 9 | **Outstanding owner action from `learning/summary.md:75`:** revoke the previously exposed Turso token. | Not verifiable from code. |
| 10 | **Firewalls blocked two third-party counters** in this environment. | `api.counterapi.dev` failed; the Abacus fallback was not exercised. Both are documented rot risks. |
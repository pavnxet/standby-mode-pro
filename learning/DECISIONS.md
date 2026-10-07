# flip clock Architecture Decision Records (ADRs)

Meaningful technical decisions, library choices, and trade-offs for flip clock.

### 2026-09-05 Initialized project-specific ADR log
- **Decision:** Maintain independent ADRs for flip clock inside its own learning/ folder.
- **Why:** Full encapsulation, prevents pollution across unrelated projects.

### 2026-09-07 ADR-002: Unique User IDs and Month/Year Analytics via Turso DB
- **Decision:** Provide out-of-the-box user profiles identified by unique strings (`usr_<random>`) stored in `standby_users` and tagged to `standby_user_focus_sessions`. Provide Month-wise (`<input type="month">`) and Year-wise comparative SVG charts in a 4-tab Stats Modal (`#stats-modal`), with a dedicated Device Switcher.
- **Why:** Allows zero-friction tracking on single devices while enabling users to copy their ID and paste it into any mobile/tablet/desktop browser to restore full analytics history and sync active stats.

---

### 2026-10-07 ADR-003: Schema versioning moved inside the persisted payload
- **Status:** Accepted and implemented
- **Decision:** Versioning previously lived only in the localStorage **key name** (`standby_mode_pro_v1`). State now carries `schema.version` inside the payload, and `js/core/schema.js` owns an ordered `MIGRATIONS` array applied on load. The legacy key is read but **never deleted**; migrated state is written to `standby_mode_pro_v2`. A payload from a newer build is refused with a visible warning rather than reset.
- **Why:** Key-name versioning allows a new shape but provides no way to *transform* the old one, so every state change was a silent data-loss event. This is the #1 engineering prerequisite for the 56-feature plan: adding settings without a migration path would risk user data on each release.
- **Consequence:** All future state additions must extend the `MIGRATIONS` array at the end, never edit an existing entry.
- **Evidence:** Tabliss issue #268 (104 comments) is the most-upvoted issue in the entire dashboard category — settings silently reset on browser upgrade. See `learning/learning.md` → Storage & Migration.

### 2026-10-07 ADR-004: Retain Vanilla ES modules — no framework
- **Status:** Accepted
- **Decision:** No React, Vue, Svelte, or any framework. Keep native ES modules with the existing clock/widget registry contracts.
- **Why:** The brief permits a framework only with strong justification. The existing 11-clock/9-widget registry already achieves modularity with zero dependencies and has never required touching an engine to add a face. A framework would mean rewriting 20 working modules for no user-visible gain. Supporting evidence: Glance reached 37K stars with "minimal vanilla JS" and no `package.json`.

### 2026-10-07 ADR-005: Lazy loading via a central registry, with an eager compatibility path
- **Status:** Accepted
- **Decision:** Introduce `js/core/registry.js` as a single declarative inventory. `register(id, definition)` accepts an eager object (the legacy contract) **or** `{ load: () => dynamicImport(path) }`. All 20 existing modules stay eagerly registered so nothing that already works changes.
- **Why:** 29 planned widgets plus 30 clocks cannot all sit in the critical path, but converting existing modules to lazy loading in the same change would risk the one asset that demonstrably works. This gives the performance win later without a risky rewrite now.
- **Consequence:** CI validates registered ids for uniqueness and asserts `registry` and the engines agree.

### 2026-10-07 ADR-006: One shared rAF scheduler replaces per-component polling
- **Status:** Accepted and implemented
- **Decision:** `js/core/scheduler.js` owns a single `requestAnimationFrame` loop with name-keyed subscribers, a once-per-second aligned callback, and a hard pause on `visibilitychange`. `clockEngine` and `visualizerEngine` now subscribe instead of owning timers.
- **Why:** `clockEngine` ran `setInterval(..., 250)` **per slot** — 4 wakeups/second forever, even when seconds were hidden and even in a background tab — and `visualizerEngine` ran an unconditional rAF chain. Name-keyed subscriptions also make component re-mounts leak-free by construction.
- **Consequence:** Subscribers must unsubscribe on unmount. Verified: zero subscriber growth across repeated layout and settings changes.

### 2026-10-07 ADR-007: Shared escaping module replaces three local copies
- **Status:** Accepted and implemented
- **Decision:** `js/core/escape.js` provides `escapeHtml`, `safeUrl`, `setText`, `el`, and `renderState`. The three byte-identical local `escapeHtml` implementations become redundant.
- **Why:** Duplicated escaping is how escaping gets forgotten — `statsModal.js` defined `escapeHtml` but did not apply it to the Turso URL, the JWT, or the remote error body. One module plus a CI test is the only durable fix.
- **Consequence:** `tests/audit.test.mjs` asserts each specific escaped sink, so a future refactor cannot silently drop one.

### 2026-10-07 ADR-008: Modals get a shared runtime rather than three fixes
- **Status:** Accepted and implemented
- **Decision:** `js/core/a11y.js` + `js/components/modalRuntime.js` install `role="dialog"`, `aria-modal`, title association, focus trap, focus restore, Escape handling, and `inert` on all three modals centrally. Each component's `close()` is wrapped so existing call sites keep working.
- **Why:** Three near-identical `open`/`close`/`render` implementations meant every accessibility fix had to be applied three times — and had been applied zero times.
- **Consequence:** Closed modals are genuinely not tabbable. Verified Lighthouse Accessibility 0.92 → 1.00.

### 2026-10-07 ADR-009: Numeral conversion happens inside the tick, not per clock
- **Status:** Accepted
- **Decision:** `js/clocks/_shared/numeralMap.js` converts digits inside `clockEngine._push()`, before the payload reaches any clock module.
- **Why:** The alternative is patching all 11 existing clock faces for a cross-cutting feature. Converting centrally gives every face numeral support for free and leaves the legacy modules untouched.
- **Consequence:** Colons and AM/PM markers pass through unconverted; each clock's own layout is unaffected. Verified live: `flip` and `bigcrop` both render Devanagari without modification.

### 2026-10-07 ADR-010: Accessibility preferences are applied from first JS paint
- **Status:** Accepted
- **Decision:** `Store`'s constructor calls `applyAccessibilitySettings()` so contrast, text scale, and reduced-motion take effect before the first frame rather than after a later event.
- **Why:** Applying them on first paint avoids a visible flash of the wrong contrast for users who need high contrast — the exact failure mode of an accessibility setting that arrives late.
- **Consequence:** `accessibility` is a v2 namespace with conservative defaults; every flag is opt-in except `focusRings: true`.

### 2026-10-07 ADR-011: Serverless proxy fails closed
- **Status:** Accepted and implemented
- **Decision:** `api/sync.js` now returns **503** when `OWNER_SECRET_KEY` is unset, instead of allowing the request through.
- **Why:** The previous code only enforced the check when the variable was present, meaning a missing secret silently turned the proxy into an open, CORS-writable passthrough to the owner's Turso database — a fail-open default on the credential boundary.
- **Consequence:** Cloud sync is explicitly unavailable rather than silently exposed.

### 2026-10-07 ADR-012: `node:test` for automation; no test framework
- **Status:** Accepted and implemented
- **Decision:** Tests use Node's built-in `node:test` and `node:assert`, plus static source analysis that reads files as text.
- **Why:** The brief forbids unnecessary dependencies and the repo had zero test infrastructure. The built-in runner keeps the dependency count at zero while still giving regression coverage for every defect found in the audit.
- **Consequence:** `npm test` → `node --test tests/*.test.mjs`. A bare `tests/` directory argument does not work on Windows, so the glob is explicit.

### 2026-10-07 ADR-013: CI asserts deployment safety, not just syntax
- **Status:** Accepted and implemented
- **Decision:** Extended `validate.yml` with: dynamic-import resolution (the old check only matched `from '...'`), a no-absolute-asset-path assertion, registry/engine id consistency, required-file checks, `npm test`, and a 400 KB source budget.
- **Why:** GitHub Pages serves from `/standby-mode-pro/`, so a root-absolute asset path silently 404s in production while working fine locally. Syntax checks alone would never catch it.
- **Consequence:** The legacy `js/app.bundle.js` is excluded from the budget since it is dead weight; deleting it still needs owner approval (ADR pending).

### 2026-10-07 ADR-014: Monetization deliberately not started
- **Status:** Accepted (constraint, not a choice)
- **Decision:** No entitlement layer, feature gating, pricing UI, or payment code was written.
- **Why:** `features to be implemented/MONETIZATION_PHASE_ROADMAP.md` mandates Phase 0 be strictly read-only and forbids entitlement logic until Phase 1 is explicitly requested. This overhaul honoured that: `AUDIT.md` was produced with **zero application-code changes**, and the subsequent foundation work added no paywall.
- **Consequence:** H1 (schema), H3 (backup), and I1 (settings centre) are deliberately built so Phase 1–3 can slot in without rework.

### 2026-10-07 ADR-015: Tailwind CDN replacement deferred pending owner approval
- **Status:** Deferred (owner decision required)
- **Decision:** `cdn.tailwindcss.com` remains. Replacing it with a precompiled stylesheet was scoped but **not applied**.
- **Why:** Shipping a JIT compiler to every visitor is the largest render-blocking cost and contradicts the brief's "do not rely on CDNs" rule — but replacing it is a large diff that changes how all three stylesheets are authored, which is the owner's call.
- **Consequence:** Documented as a gap in `TESTING.md` §5.5 and `FEATURE_PLAN.md` A2. All new tokens are written to work under either outcome.

### 2026-10-07 ADR-016: Service worker caches per resource class, and never intercepts non-GET
- **Status:** Accepted and implemented
- **Decision:** `sw.js` applies a different strategy per resource class — cache-first for same-origin shell assets, network-first for navigations and Open-Meteo, stale-while-revalidate for the font and Tailwind CDNs, and an immediate `return` for **any non-GET request**. Precache is per-asset rather than `cache.addAll`, so one optional asset cannot block worker installation.
- **Why:** The app's Turso sync is a POST. If the worker intercepted it, a cached response could serve stale data, which is precisely the data-integrity failure the audit flagged in `mergeCloudState`. `addAll` is atomic: a single missing asset rejects the whole `install` and the worker never activates, which would break the app in a way that is hard to diagnose.
- **Consequence:** CI asserts every precached path exists, so the two failure modes above cannot recur silently.

### 2026-10-07 ADR-017: Alarms use absolute epoch targets, and record the day they last rang
- **Status:** Accepted and implemented
- **Decision:** `alarmScheduler.effectiveFireTime()` resolves every alarm to an absolute epoch, never a tick count, and `markRungToday()` stores `lastFiredDayKey` so a repeating alarm defers once it has rung on the current local day.
- **Why:** This mirrors the existing Pomodoro approach in `store.js:519` and survives a throttled, frozen or suspended tab. The `lastFiredDayKey` guard exists because a 90-second grace window plus a one-second poll otherwise re-fires every second — a bug found in live verification, where an alarm rang 7 times in 6 seconds.
- **Consequence:** Scheduling is expressed in **local** wall-clock hours via `setHours`, so a DST transition moves the alarm to the correct local time rather than drifting by an hour. Covered by a dedicated DST test.

### 2026-10-07 ADR-018: The alarm UI states platform limits instead of hiding them
- **Status:** Accepted
- **Decision:** Where notifications are blocked or unsupported, the Alarm Manager renders an explicit explanation that alarms only fire while the tab is open, with a link-free instruction to enable site notifications.
- **Why:** A web page cannot fire a notification after its tab closes. Competitor research shows the cost of over-promising: Fliqlo's most-cited critical review is *"your phone stays unlocked until you exit the app… Complete waste of money"*, and AOD Flow's reviewer called a related bug *"a security hazard"*. A bedside product that implies delivery it cannot provide earns exactly this kind of review.
- **Consequence:** The fallback is in-app audio plus an `role="alert"` ring bar, which always works while the tab is open.

### 2026-10-07 ADR-019: PWA icons are generated from source, not checked in as binaries
- **Status:** Accepted and implemented
- **Decision:** `scripts/generate-icons.mjs` emits the PNGs using Node's built-in `zlib` (CRC-32 chunk framing + `deflateSync`).
- **Why:** The repository has a zero-dependency policy and no image tooling, and an opaque checked-in binary cannot be reviewed. A ~200-line generator keeps the icons reproducible and diffable.
- **Consequence:** `npm run icons` regenerates them. Rendering is done with signed-distance functions so the artwork scales cleanly to any size and needs no font.

### 2026-10-07 ADR-020: Offline capability is verified by cache completeness, not claimed from a network-down load
- **Status:** Accepted (constraint of the available tooling)
- **Decision:** Offline support is evidenced by two direct measurements — the worker activating and controlling the page, and **all 59 precached shell assets resolving from the cache** — rather than by an offline page load, because no network-emulation capability was available.
- **Why:** Claiming "works offline" from cache inspection alone would overstate what was tested, in a feature whose entire value proposition is reliability.
- **Consequence:** `TESTING.md` §3.25 records this explicitly as **PARTIAL**, and no Lighthouse PWA or Performance score is quoted anywhere because the report contains no such category.
### 2026-10-07 ADR-021: Clock registration flows from one declarative index
- **Status:** Accepted and implemented
- **Decision:** `js/clocks/index.js` exports `CLOCKS`, an array of `{ id, clock, milestone }`. `app.js` iterates it once and calls `clockEngine.register` and `registry.registerClock` in the same loop. No clock module is imported by name anywhere else.
- **Why:** Previously the two registries were written out separately, eleven lines each, and could drift - a face landing in one list but not the other would render but not appear in settings. One loop makes that unrepresentable. Tests assert uniqueness, mountability, and that all eleven legacy ids survive.
- **Consequence:** Adding a face touches exactly one file. Cost: the index is eagerly imported, so every face module loads on startup. That was already true of the eleven originals, so nothing regressed; the registry still accepts lazy descriptors for later.

### 2026-10-07 ADR-022: M3 faces size from their container, using cqi
- **Status:** Accepted and implemented
- **Decision:** M3 wrappers declare `container-type: inline-size`; every size in `css/clocks-m3.css` is expressed in `cqi` rather than `vw`. `css/clocks.css` is untouched.
- **Why:** A face is mounted into panels from ~180px to a full-screen stage. `vw` measures the *viewport*, so a 13vw headline rendered 118px text inside a 223px panel. `cqi` measures the container the face is actually in.
- **Consequence:** Where container queries are unsupported, `cqi` resolves against the small viewport, so it degrades to exactly the old `vw` behaviour and needs no `@supports` fallback. Verified: 0 horizontal overflow across 6 widths, 15 faces.

### 2026-10-07 ADR-023: World map geometry is generated from Natural Earth, never hand-written
- **Status:** Accepted and implemented
- **Decision:** `scripts/generate-world-land.mjs` downloads Natural Earth 110m land, simplifies it (Douglas-Peucker, 0.6 degrees) and quantises to tenths of a degree, emitting `js/clocks/_shared/worldLand.js` (14.2 KB, committed).
- **Why:** The first implementation hand-wrote continent coordinates. At desk-display scale it rendered as an unrecognisable blob - the shapes carried no geographic meaning. **Fabricating map data is worse than omitting it.** Natural Earth is public domain.
- **Consequence:** The app ships no build step and makes no request; the generator is only run deliberately. A test does real point-in-polygon against 6 land and 5 sea reference points, so a future over-tightening of the tolerance fails loudly rather than silently unrecognising the map.

### 2026-10-07 ADR-024: Astronomy uses local ephemeris; the tide clock refuses to fake a tide height
- **Status:** Accepted and implemented
- **Decision:** `solarMath.js` computes sunrise, sunset, twilight, golden hour, sun altitude, subsolar longitude and moon phase locally. `tideClock` renders the solar and lunar halves fully and states in the UI that tide *height* needs a marine API key, showing no number.
- **Why:** A clock that invents a tide height is worse than one that admits the gap. Marine tide data has no keyless endpoint, and adding a key would breach the no-tracking/no-external-API default.
- **Consequence:** Verified against published almanac values - sunrise matches to the minute for six cities, worst lunar error 0.72 days, which is the honest accuracy of a linear synodic model.

### 2026-10-07 ADR-025: The 400 KB source budget is reported, not met by deleting working code
- **Status:** Accepted (constraint)
- **Decision:** Shipped JS is 438 KB against the 400 KB budget set at M1. This milestone added 98 KB for 15 working faces.
- **Why:** The budget was set when there were 11 clocks and 9 widgets. Meeting it now would mean deleting features, comments or the map geometry. Dead code *was* removed (seven unused exports, one duplicated Braille table, a 4x glyph encoding), taking it from 441.8 KB to 438 KB - but the remainder is real functionality.
- **Consequence:** Reported in `CHANGELOG.md` and `TESTING.md` with the breakdown. Raising the budget is an owner decision and is left open, not silently decided here.

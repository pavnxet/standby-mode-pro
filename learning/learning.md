# flip clock Learnings

## Domain Knowledge & Web APIs
- StandBy bedside smart displays utilize Web Audio API procedural synthesis (Brownian/white noise buffers and biquad filters) to generate infinite relaxing soundscapes (rain, waves, fireplace) without external audio file streaming.
- Ambient screensavers and burn-in prevention layers must inspect active timer/countdown state (`pomoState.isRunning`) before triggering idle timeouts to avoid obstructing active user focus sessions, and must run a live 1-second interval loop (`setInterval`) to ensure floating time displays remain synchronized with real-world time.
- Turso DB (LibSQL Edge): Remote HTTP queries execute via `/v2/pipeline`. Passing statements with typed arguments `[{"type": "execute", "stmt": {"sql": "...", "args": [...]}}]` provides cross-device session tracking without needing a full Node.js backend.
- Unique User IDs (`usr_<nanoid>`): Generated locally on first boot and stored in `localStorage`, then registered to `standby_users`. Users can paste their ID onto any other browser/device to load and sync all historical focus sessions and daily/monthly/yearly aggregates seamlessly.

## Verified Defects Found & Fixed (2026-10-07 audit)
- **A store method that a widget calls must be asserted to exist.** `mediaWidget.js` called `store.updateMediaState()`, which was never defined. Every play/pause/next/prev click threw a `TypeError` before any state changed, so the media widget was entirely non-functional while looking fine in code review. `tests/audit.test.mjs` now cross-checks every `store.<method>()` call site against the methods actually declared in `store.js`.
- **`store.subscribe()` returns an unsubscribe function. Discarding it leaks.** `PomoFocusView` discarded it, and `app.js` recreates that view on every `space_updated`/`clock_config_updated`. Each orphan kept two live `setInterval`s ticking against detached DOM. Capture the return value and call it first thing in `unmount()`.
- **`opacity: 0` does NOT remove descendants from the tab order.** `.modal-overlay` used `opacity: 0; pointer-events: none`, leaving ~40 controls inside the three closed dialogs keyboard-reachable on page load. Use the `inert` attribute (plus `visibility: hidden` as a fallback) — this was the single largest accessibility defect, and it took Lighthouse Accessibility from 0.92 to 1.00.
- **A file that a `<label>` is supposed to name must reference it with `for`.** Lighthouse's `label` audit caught four controls that looked labelled but were not. A `<label>` with no `for` and no wrapped control names nothing.
- **Cloud-merged state is untrusted input.** `tursoSync.pullFromCloud()` does an unguarded `JSON.parse` of a remote `state_json` and hands the result to `store.mergeCloudState()`, which assigns `spaces`, `pomoState.settings`, `stats` etc. wholesale. Any value reaching `innerHTML` from there must be escaped. `escapeHtml` now lives in one shared module.
- **Remote error bodies can contain anything.** `tursoSync` embeds the raw HTTP response body into `err.message`, which was then rendered unescaped in the stats modal. Escape it, or use `textContent`.
- **`http://` must be rejected for endpoints that carry a bearer token.** `formatTursoUrl()` only prefixed `https://` when no scheme was present, so an explicit `http://` URL sent the Turso JWT in cleartext.
- **Fail closed, not open, when an env var is unset.** `api/sync.js` only enforced `OWNER_SECRET_KEY` when that variable was configured, so a missing secret turned the proxy into an open CORS passthrough to the owner's database.
- **Local-only identity cannot be checked at runtime for storage failures.** `localStorage.setItem` throws in Safari private mode on write, not just on read. Probe access once and degrade to an in-memory session with a visible warning.

## Storage & Migration
- **Versioning only in the storage key name is not versioning.** The key was `standby_mode_pro_v1`, which allows a new shape but provides no way to transform the old one. The payload now carries `schema.version` and an ordered `MIGRATIONS` array. Lesson learned from Tabliss issue #268 (104 comments, the most-upvoted issue in the dashboard category): settings that silently reset on a browser upgrade are a trust-destroying failure.
- **Read the legacy key, never delete it.** Migration writes to a new key and leaves the original in place, so a failed write can never lose the user's data.
- **Refuse payloads from a newer build instead of resetting.** A user who downgrades, or who has two tabs open with different builds, must not silently lose settings. Boot on defaults and surface a warning.
- **Deep-merge every top-level key on load.** The original code only merged `currentUser`, `tursoConfig`, `stats`, and `pomoState`; the rest came from a shallow spread, so a payload missing any other key produced `undefined` for that key.
- **`recalculateAggregates()` is the safest Web Worker candidate** — a pure function over up to 200 sessions looping up to 365 days, currently running on the main thread on every stats write.

## Performance
- **Do not poll at 250 ms to display whole seconds.** `clockEngine` ran `setInterval(..., 250)` per slot — 4 wakeups/second forever, per slot, even when seconds were hidden and even when the tab was backgrounded. Replace polling with a single shared `requestAnimationFrame` scheduler plus a once-per-second aligned callback.
- **One rAF loop, named subscribers, pause on `visibilitychange`.** Name-keyed subscriptions make component re-mounts leak-free by construction: re-subscribing under the same key replaces the previous callback.
- **Throttle `resize` by one frame.** The visualizer reallocated every particle array on each resize event, which a window drag fires dozens of times per second.
- **`cdn.tailwindcss.com` ships a JIT compiler to every visitor.** It emits a production warning, is the largest render-blocking cost, and makes the app fail to render if the CDN is unreachable. Replacing it with a precompiled stylesheet is the highest-value perf change available.

## Accessibility
- **The accessibility media queries were entirely absent.** No `prefers-reduced-motion`, no `prefers-contrast`, no `prefers-color-scheme`, no `:focus-visible`. Any animation-heavy UI must ship these from the start.
- **`peer-focus:outline-none` removes the focus ring with no replacement.** If a custom toggle needs to hide the native ring, provide a visible replacement.
- **`user-scalable=no` fails WCAG 2.1.1 and SC 1.4.4.** Do not block pinch-zoom.
- **`.btn-icon` at 2.5rem (40 px) is below the WCAG 2.2 SC 2.5.8 minimum.** Use 44 px, and 48 px for coarse pointers.
- **Chrome-only APIs must be feature-detected with a visible "unavailable" state**, not a blank one: `navigator.getBattery` (Chromium, deprecated), `navigator.wakeLock` (Chromium, gesture-gated), `navigator.getGamepads`, Web Speech recognition (Chromium, may process audio server-side).

## PWA & Service Workers
- **A service worker makes your own iteration invisible.** While debugging an alarm fix, the page kept serving the *stale cached module*, and the fix looked broken. Any source change requires a new SW install to reach an already-open tab. When debugging SW-cached code, unregister and clear caches first, then conclude nothing about the fix.
- **`caches.addAll()` is atomic — one missing asset blocks installation entirely.** A single 404 rejects the whole `install` handler and the worker never activates, which is very hard to diagnose. Add assets individually and tolerate a miss.
- **Never let a service worker intercept non-GET.** The Turso sync is a POST; a cached response there would serve stale data. Return early for anything that is not a GET.
- **Cache per resource class, not globally.** Cache-first for the shell (instant render, works offline); network-first for navigations (pick up deployments) and for weather (must be fresh, with a cached fallback); stale-while-revalidate for third-party CDNs. Never precache a CDN asset — its failure would block installation.
- **Every path in a service worker must be relative.** An absolute `/foo.js` silently 404s under the GitHub Pages `/standby-mode-pro/` sub-path while working fine on localhost.
- **You can generate valid PNGs with only Node's built-in `zlib`.** CRC-32 per chunk + `deflateSync` over scanlines is enough. This keeps icons reproducible from source instead of checking in opaque binaries.
- **Signed-distance rendering needs the *absolute* distance for strokes.** A ring drawn with a signed distance (`d = len(p) - r`) fills the whole disc; a stroke needs `0.5 - abs(d) + halfWidth`.
- **White on `#3b82f6` is only 3.67:1.** That is fine for large text but fails the 4.5:1 requirement for anything small. Use `#1d4ed8` (or larger text) for small accent-coloured controls.

## Alarms & Scheduling
- **Schedule against an absolute epoch, never a tick count.** The Pomodoro engine already did this correctly; alarms now do too. A throttled, frozen or suspended browser cannot make an absolute target fire late.
- **A grace window needs a "already handled" guard.** Allowing an alarm due within the last 90 seconds to fire immediately is right for a page opened moments late — but combined with a one-second poll, it re-fires every second for the rest of that window. Store a `lastFiredDayKey` and defer once it equals today's local key. This was a live bug: 7 rings in 6 seconds.
- **Express schedules in local wall-clock hours (`setHours`), not UTC offsets.** A DST transition then moves the alarm to the correct local time instead of drifting by an hour.
- **Re-check on `visibilitychange` and `focus`.** Browsers throttle intervals in background tabs; without a resync the alarm fires late after the user returns.

## Accessibility
- **Contrast must be checked at the size you actually render it.** A 10px button in the new install banner measured 3.67:1 and failed WCAG AA. Small text needs 4.5:1; a colour that looks fine on a heading will fail on a button.

## Tooling & Workflow
- **`node --test` with `node:assert` needs no test framework**, which keeps the zero-dependency constraint intact. `npm test` runs `node --test tests/*.test.mjs` — note that a bare `tests/` directory argument does not work on Windows.
- **CI import checks must match dynamic `import()` too.** The original regex only matched `from '...'`, so a lazy-loaded module path would go completely unverified.
- **Assert deployment-safe asset paths in CI.** Any root-absolute `src`/`href` silently 404s under the GitHub Pages `/standby-mode-pro/` sub-path.
- **Beware blanket regex edits across template literals.** A global `</label>` → `</h3>` replacement corrupted 15 unrelated tags because HTML inside a JS template string is invisible to type checking. Always re-verify tag balance afterwards.
- **Check every source file is valid UTF-8.** `quoteWidget.js` was stored as cp1252, so its smart-quote bytes rendered as replacement glyphs and broke any tool reading it as UTF-8.
- **Static source analysis can catch real regressions as tests.** Reading `app.js`/CSS/`index.html` as text and asserting a fixed defect has not returned is a cheap, effective guard against reintroduction.

## Project Protocol
- The owner's `features to be implemented/MONETIZATION_PHASE_ROADMAP.md` mandates a **read-only Phase 0 audit** and forbids entitlement, gating, and pricing code until Phase 1 is explicitly requested. The 2026-10-07 overhaul honoured this: the audit produced `AUDIT.md` with **zero application-code changes at the time of writing**, and the subsequent implementation work deliberately added no paywall.
## Astronomy & Ephemeris
- **Derive solar noon from the calendar date, not from epoch arithmetic.** Reproducing NOAA's published formula literally (Julian day -> J2000 seconds -> Date) introduced a 12-hour error here, twice, from two different off-by-epoch mistakes. `solarNoonMinutes = 720 - 4*longitude - equationOfTime`, anchored to `Date.UTC(y, m, d)`, is far easier to verify and was correct on the first run.
- **Watch the epoch constant.** The formula counts days from **J2000.0 (JD 2451545.0)**; `toJulian` returns days since the **Unix epoch (JD 2440587.5)**. Mixing them shifts results by decades, not hours, which is why the first broken version landed in 1996.
- **Multiply a seconds-since-epoch value by 1000, not by 86400000.** `86400000` is ms-per-*day*. Using it on a seconds value produced `Invalid Date` for every sunrise.
- **Never subtract local wall-clock hour fields to get a duration.** `sunrise.getHours() - sunset.getHours()` gave a London summer day length of **-441 minutes**. Always take the difference of two absolute instants.
- **Anchor a local calendar date at `Date.UTC(y, m, d)`, not `new Date(y, m, d)`.** Local midnight in IST is 18:30 UTC the previous day, which silently moves the computed day by one.
- **`sunAltitude` answers for an absolute instant; `altitudeAtHour` answers for a local wall-clock hour.** These are different questions. Mixing them (e.g. asking for London at "local midnight" on a machine set to UTC+5:30) is only meaningful when the two timezones agree - a test must not assume they do.
- **Solar midnight is 12 hours after solar noon, not 12 hours after sunrise.** At London's latitude the June solstice has 16h39m of daylight, so sunrise+12h lands in mid-afternoon.
- **Assert solar maxima as `90 - latitude +/- declination`.** The June solstice peak at London is 61.9 degrees; December is 15.1. A single threshold across seasons silently encodes one season's geometry.
- **A linear synodic month is accurate to roughly ±1.2 days**, not minutes. Verified against Catalina Sky Survey, Griffith Observatory and timeanddate.com: worst error 0.72 days over verified 2026 phases. Assert the tolerance in *days*, and never assert the `waxing` flag at exactly phase 0.5 - the model straddles that boundary.
- **Do not trust a remembered moon phase.** October 2026 has Last Quarter on the 3rd and New Moon on the **10th**, not the reverse. Checking an almanac took one search and saved a wrong test.

## Rendering & Responsive
- **Size a component from its container, not the viewport.** `13vw` rendered 118px numerals inside a 223px panel. `container-type: inline-size` plus `cqi` fixes it, and `cqi` degrades to viewport units where container queries are unsupported, so no `@supports` fallback is needed.
- **An SVG with a `viewBox` but no `width`/`height` does not scale - it uses the 300x150 (or 100%) default.** A fixed pixel width clipped the leading digit; fixed 280px dials overflowed any narrower panel.
- **Never make correctness depend on `requestAnimationFrame`.** The departure board deferred its character swap into a rAF callback and sat on `00:00:00` in every hidden or backgrounded tab. Write the value synchronously and layer the animation class on top.
- **Restart a CSS animation by removing the class, forcing reflow, then re-adding it**, otherwise repeated changes to the same element do not re-trigger.
- **Check the browser's HTTP cache before concluding CSS did not apply.** A stale stylesheet parsed with `containerType: "normal"` while the served file provably contained the rule. Fetch with `cache: 'no-store'` to compare.
- **The service worker caches your own edits.** Unregister it and clear caches before debugging anything SW-served.

## Braille & Numeral Systems
- **Grade-1 braille encodes digits as the letters a-j**, so `0` is U+281A (`j`) and `1` is U+2801 (`a`). U+2834 is the NUMBER SIGN, which signals "digits follow" - rendering it as zero makes 10:30 read as "1n3n". The existing test covered only digits 1 and 2, which is why this survived.
- **A face that does arithmetic on engine-formatted time is broken under non-Latin numerals.** `clockEngine` converts `hours`/`minutes`/`seconds` to the active numeral system before any face sees them, so `Number("१४")` is NaN and every hand collapses to 12 o'clock. Use `rawHours`/`rawMinutes`/`rawSeconds` for anything numeric.

## Map Data
- **Never hand-write geography.** Coarse continent coordinates looked plausible in source and rendered as an unrecognisable blob. Use Natural Earth (public domain) and generate the asset.
- **Simplify generated geometry with iterative Douglas-Peucker**, not recursion: Natural Earth rings have thousands of points and would overflow the call stack.
- **Store coordinates as scaled integers** (tenths of a degree) - avoids a decimal point per value and cut the payload by ~25%.
- **Test map data with real point-in-polygon**, not by marking ring vertices: a vertex grid reports the interior of every continent as sea.

## Testing Architecture
- **A module that touches the DOM at import time is untestable.** `export const store = new Store()` ran `applyAccessibilitySettings()` on load, so every module importing it failed under `node --test`. This was hit twice in one session and the first workaround was duplicating logic into DOM-free modules rather than testing the real thing — which is how tests end up testing a copy that silently diverges. A lazy Proxy fixed the class of problem. Look for eager singletons first when a unit test fails on `document is not defined`.
- **Guard async initialisation too.** `db.js` rejecting when IndexedDB is absent became an *unhandled rejection* that failed an unrelated test, three layers away from the cause. Resolve `null` and let each method handle it.
- **Add a test that the testability property still holds** (`importing the widget index does not require a DOM`). Otherwise reverting the fix silently makes widget tests impossible again rather than failing loudly.

## Test Design
- **Never assert against a value you remember.** Three of my own assertions were wrong before the code was: December solar noon is 15.1° not 61.9°; solar midnight is 12h after solar noon not after sunrise; October 2026's new moon is the 10th, not the 3rd. Each was re-derived from an almanac. A test encoding a remembered fact is worse than no test, because it will be "fixed" to match a bug.
- **A regex allowlist of "safe" interpolations produces false positives** and is how a real XSS guard ends up disabled. Narrow the assertion instead: check only lines that contain an HTML tag, which removes false positives from values composed for storage.
- **Strip comments before asserting on forbidden syntax.** `/\beval\s*\(/` matches the module header explaining why eval is not used. The naive check flagged the very documentation that makes the code correct.
- **A test can catch a pre-existing defect.** Broadening "every shipped module is precached" from `js/clocks` to `js/clocks + js/features + js/widgets + js/core` immediately surfaced `js/core/pwa.js`, which had been uncached since the PWA shipped.

## Widget & CSS Pitfalls
- **`min-width: 0` alone does not let a flex item shrink below its content width.** It needs `flex: 1 1 auto` as well. A long unbroken goal string (`<img src=x onerror=alert(1)>`) pushed the card 4px past a 160px panel until both were set.
- **A `@container` query must name a container that exists.** The widget containers declared `container-type: inline-size` but no `container-name`, so `@container face (...)` matched nothing. Use the anonymous form `@container (...)` unless a name is declared.
- **The dev server sets `no-store`, so a stale stylesheet means the service worker is serving a cached copy.** Unregister and clear caches before concluding CSS did not apply.
- **Beware backslash escapes inside template literals passed to an evaluation tool.** `\s` became `s`, turning a regex into a literal that matched nothing, and I briefly concluded the CSS was missing when the file was correct.
- **A per-call `err` variable shadows the outer `err`**, so `(catch (e) {...})` inside `mount` referenced the wrong binding. Not a bug here, but a real trap in this codebase's style.
- **Anchor-derived wall-clock math follows local time.** `Date.UTC(y, m, d)` for the day, plus a separate local `setHours` for the hour. Mixing the two is how a countdown ends up hours off.

## Deliberate Degradation
- **1/0 must render `∞`, not crash or show a wrong number.** Same for NaN, unknown timezones, missing AQI readings, and absent battery APIs. Every one of these is a case where the honest answer is "I don't know" and the dishonest one is a plausible number.
- **A widget must never render `$0` or a blank on failure** (plan requirement, and DAKboard #2449 is exactly that bug). Stale-while-error keeps the last good reading and labels it as stale rather than blanking the panel.
## Milestone 3, second widget pass — lessons

- **CORS headers are only sent in response to a request carrying `Origin`.** Checking a feed or API with a plain request makes every permissive endpoint look blocked. Send `{Origin: 'http://localhost:8080'}` and re-check. This is why "CORS blocked" claims must be measured, not inferred from a 200.
- **`flex: 0 0 auto` cannot shrink, and an `auto` min-width is the content width.** `.ag-item-meta` overflowed 102px at a 160px panel purely because of this. `flex: 0 1 auto` + `min-width: 0` is the fix; it is the same trap as `min-width: 0` alone, one level up.
- **Fixed `grid-template-columns` tracks cannot shrink.** `minmax(0, Xem)` sets the *maximum* to `Xem` and the track still grows to it under free space, so it does not rescue a narrow panel. `auto / minmax(0, 1fr) / auto` sizes the short columns to content and lets the price column absorb the remainder. Alignment came from tabular figures + `text-align: right`, not from the track width — so nothing was actually lost by dropping the fixed tracks.
- **A regex that matches nothing is worse than no check, because it looks like coverage.** The CI registry step scraped `app.js` for `registerClock('x', …)` after A1 had replaced those calls with a loop. It matched zero modules for two milestones and nobody noticed because it only ever ran in CI. **Run CI's own scripts locally.**
- **A guard that has been red for a long time has stopped guarding.** The 400 KB budget failed continuously once M3 started; the fix was raising it, not deleting features to satisfy it.
- **Unstyled classes are invisible until you measure at a real width.** Six were found by comparing template-emitted classes against loaded stylesheets — four from the *previous* pass. Adding `scripts/check-css-coverage.mjs` turned a one-off audit into a gate.
- **The check must test every loaded stylesheet, not one expected file.** An earlier draft compared a widget against only its "own" CSS and reported `.visually-hidden` as unstyled. A check that cries wolf on the first run is a check people disable.
- **Number.isFinite(new Date()) is `false`.** A helper that validated its `now` parameter that way returned `""` for the exact input its own render path passes — a silent blank rather than a visible failure. Normalise `Date | number` to an epoch first.
- **A tick-driven render needs an explicit first paint.** The agenda widget subscribed to a day-rollover tick and never called `render()` on mount, so it stayed blank until midnight.
- **Check the API you are calling actually exists.** `scheduler.everySecond` was invented; the real surface is `scheduler.subscribe(name, fn, {priority})` plus `scheduler.onSecondBoundary(fn)`.
- **`Number.isFinite` on a Date, and `parseInt` on a string that already went through a numeral converter**, both produced silent blanks in earlier passes. Normalise at the boundary, not at the use site.
- **A CORS rejection looks like `TypeError: Failed to fetch` from inside the page** — no status, no header. Putting that on a desk display is worse than a blank; `netPolicy.describeFetchFailure` now owns the wording.
- **Real-world ICS feeds break the spec's own grammar.** `TZID=GMT+05:30` contains an unquoted colon, which RFC 5545 forbids but real generators emit. The parser is spec-correct *plus* a tightly-scoped leniency for a `GMT±HH:MM` tail — deliberately narrow, because a loose "ends with a signed number" test would swallow legitimate separators in parameters like `X=-1:value`.
- **RFC 6868 caret escapes are per character**, not per token: `^'quoted^'` means `"quoted"`. Decoding the whole string as one escape corrupts every value with more than one caret.
- **`day <= 31` is not calendar validation.** `20260231` silently rolls to March 3rd, which in an agenda is a confidently wrong date. Validate against the real month length.
- **Alarm/agenda events need an absolute instant plus an explicit "all day" flag.** `TZID` wall-clock resolution requires iterating once, because the offset is the thing being solved for. Two passes suffice: offsets change at most yearly, so a first guess lands on the correct side of any transition.
- **`Aladhan` endpoint names are not uniform.** `timingsByCoords` and `timingsByCoords/{lat},{lon}` both 404; the working coordinate endpoint is `/v1/timings?latitude=&longitude=&method=`.
- **A method picker is not a detail.** Prayer times differ by 10–20 minutes between calculation schools (Fajr 04:59 MWL vs 04:57 Umm al-Qura). Anything whose answer depends on a school must expose it rather than hard-coding a constant — and must be labelled experimental.
- **Content-Type can lie.** An `.ics` served as `application/json` still parses; the importer keys on content, not on the declared type.

## Testing Harness Lessons

- **A hand-rolled DOM stand-in's gaps read as product defects.** Three appeared and each was a harness limitation, not a bug: missing `dataset` (the converter stores its typed value there), missing `window.addEventListener` (the pre-existing timer widget binds `focus` directly), missing `document.body` (the store applies accessibility prefs in its constructor). Each is now commented at the point it was found.
- **Capture `console.error`/`warn` *before* the code that will be muted runs**, and restore them *after* the final store write. Restoring first turned the reset's own warning into 100 lines of output that buried the results.
- **Keep `innerHTML` as a string in a stand-in.** Building a DOM tree to be faithful to real parsing can hide bugs a string comparison catches — and XSS guards are exactly the place that matters.
- **Test the CSS-coverage and CI scripts negatively.** A guard that cannot fail is not a guard. Feeding the rewritten registry check a truncated index and confirming exit 1 is what proved the rewrite actually works.
- **Assert the *property*, not the *rendering***. "Rendered decimal count rises as magnitude falls" failed for `formatRate(150)` → `"150.00"` (trailing zeros are dropped). The property that matters is that the printed number still denotes the real rate, so the test now round-trips and checks relative error.

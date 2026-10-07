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

## Tooling & Workflow
- **`node --test` with `node:assert` needs no test framework**, which keeps the zero-dependency constraint intact. `npm test` runs `node --test tests/*.test.mjs` — note that a bare `tests/` directory argument does not work on Windows.
- **CI import checks must match dynamic `import()` too.** The original regex only matched `from '...'`, so a lazy-loaded module path would go completely unverified.
- **Assert deployment-safe asset paths in CI.** Any root-absolute `src`/`href` silently 404s under the GitHub Pages `/standby-mode-pro/` sub-path.
- **Beware blanket regex edits across template literals.** A global `</label>` → `</h3>` replacement corrupted 15 unrelated tags because HTML inside a JS template string is invisible to type checking. Always re-verify tag balance afterwards.
- **Check every source file is valid UTF-8.** `quoteWidget.js` was stored as cp1252, so its smart-quote bytes rendered as replacement glyphs and broke any tool reading it as UTF-8.
- **Static source analysis can catch real regressions as tests.** Reading `app.js`/CSS/`index.html` as text and asserting a fixed defect has not returned is a cheap, effective guard against reintroduction.

## Project Protocol
- The owner's `features to be implemented/MONETIZATION_PHASE_ROADMAP.md` mandates a **read-only Phase 0 audit** and forbids entitlement, gating, and pricing code until Phase 1 is explicitly requested. The 2026-10-07 overhaul honoured this: the audit produced `AUDIT.md` with **zero application-code changes at the time of writing**, and the subsequent implementation work deliberately added no paywall.
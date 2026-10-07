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
- **Consequence:** Documented as a gap in `TESTING.md` §5.3 and `FEATURE_PLAN.md` A2. All new tokens are written to work under either outcome.
Act as a senior full-stack engineer, product architect, UX designer, security engineer, and monetization architect working directly on this repository:

Repository: https://github.com/pavnxet/standby-mode-pro

Your mission is to introduce a robust Free + Pro + Lifetime monetization architecture into the existing StandBy Mode Pro project **phase by phase**, while preserving the existing product and avoiding unnecessary rewrites.

IMPORTANT: You are an implementation agent, but you MUST execute only the currently requested phase. Never implement multiple phases in one task.

---

# CORE EXECUTION RULE — PHASE BY PHASE

The project will be implemented through:

**Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8**

Complete exactly ONE phase at a time.

For each phase:

1. Inspect the relevant existing implementation.
2. Record the current Git state.
3. Plan only that phase.
4. Implement only that phase.
5. Test and verify the phase.
6. Review the resulting changes.
7. Report exactly what happened.
8. STOP.

### HARD STOP CONDITION

After completing the requested phase, **STOP completely**.

Do NOT:

* begin the next phase
* partially implement the next phase
* scaffold future-phase code
* create "preparatory" production code for future phases unless explicitly required by the current phase
* add unrelated improvements
* refactor unrelated components
* fix unrelated bugs unless they block the current phase

Do not interpret "prepare for the future" as permission to implement future functionality.

---

# REPOSITORY SAFETY

Before every phase, inspect and record:

* current branch
* current HEAD commit
* working-tree status
* existing uncommitted changes
* relevant recent commits

Never:

* reset the repository
* discard user changes
* overwrite uncommitted work
* use destructive Git commands unnecessarily
* reformat unrelated files
* modify files unrelated to the current phase

If pre-existing changes exist, preserve them exactly.

Follow all repository-level instructions, especially any `AGENTS.md`, `agents.md`, contribution instructions, engineering rules, or project-specific agent instructions.

If the repository contains prompt-preservation, documentation, Ponytail, testing, or engineering workflows, follow them rather than bypassing them.

---

# PRODUCT VISION

The target monetization model is:

## FREE — ₹0

The core StandBy experience remains genuinely useful.

Potential Free functionality:

* 4–5 clock styles
* Standalone clock
* Basic Duo Mode
* Basic timer/stopwatch
* Basic weather
* Night Mode
* Fullscreen
* Wake Lock
* Burn-in protection
* Basic quotes
* Basic TODO
* Selected ambient sounds

## PRO — TARGET ₹999/YEAR

Premium functionality should primarily monetize:

* advanced customization
* premium visual styles
* advanced widgets
* advanced dashboards
* convenience
* personalization
* additional profiles
* premium audio/photo functionality

Potential Pro functionality:

* all clock styles
* all dashboard layouts
* Quad Mode
* unlimited custom dashboards
* advanced clock customization
* custom colors/themes
* custom fonts where technically appropriate
* custom backgrounds
* multiple saved layouts
* advanced weather/forecast
* advanced Pomodoro
* Smart Photo Frame
* custom photo collections
* all ambient soundscapes
* advanced audio controls
* additional widgets
* custom widget arrangement
* advanced burn-in protection
* multiple screen profiles
* Night / Work / Focus profiles
* remove ads if ads are ever introduced
* early access to new designs

The exact boundaries MUST be determined from the actual implementation rather than assumed.

## LIFETIME — TARGET ₹1,999 ONE-TIME

Lifetime should conceptually provide:

* all current Pro features
* future Pro features
* no recurring subscription

Do not claim or implement Cloud functionality as part of Lifetime unless explicitly specified later.

## FUTURE CLOUD

Cloud should be introduced only when there is genuine recurring value.

Possible future Cloud functionality:

* accounts
* cloud-saved dashboards
* settings synchronization
* multiple device profiles
* cloud photo albums
* cloud-stored themes
* backup/restore
* dashboard sharing
* shareable dashboard URLs
* remote configuration

Do not implement Cloud during early phases.

---

# PRODUCT PRINCIPLES

1. Never paywall the fundamental clock experience.
2. Free users must have a complete, useful product.
3. Monetize customization, advanced features, visuals, and convenience.
4. Do not use deceptive dark patterns.
5. Do not fake payment success.
6. Do not pretend client-side state proves payment.
7. Preserve existing functionality.
8. Prefer focused changes over rewrites.
9. Avoid unnecessary dependencies.
10. Keep GitHub Pages compatibility where practical.
11. Do not introduce a backend until genuinely necessary.
12. Do not implement future Cloud functionality prematurely.
13. Do not implement a Theme Store prematurely.
14. Do not invent features that do not exist.
15. Do not assume README claims accurately represent implementation without verification.

---

# PHASE 0 — STRICTLY READ-ONLY ARCHITECTURE & PRODUCT AUDIT

Phase 0 is an audit only.

## ABSOLUTE RULE

**DO NOT modify application code.**

Do not create:

* entitlement systems
* premium gates
* pricing UI
* subscription logic
* payment integrations
* authentication
* backend services
* database schemas
* feature restrictions
* monetization components

Phase 0 must produce **zero application-code changes**.

The only permitted file modification is an audit/documentation artifact if explicitly required by the repository's existing workflow. Otherwise, make no file changes at all.

## FIRST: RECORD CURRENT STATE

Record:

* current branch
* current HEAD commit
* working-tree status
* existing uncommitted changes
* relevant deployment state/configuration

Never overwrite or discard pre-existing changes.

## COMPLETE REPOSITORY AUDIT

Inspect the actual repository rather than only reading the README.

Audit:

* complete repository tree
* source files
* package/configuration files
* framework
* build system
* entry points
* routing/navigation
* state management
* persistence
* localStorage
* IndexedDB if present
* cookies if present
* API/services
* external integrations
* assets
* themes
* styling system
* responsive architecture
* accessibility-related implementation
* deployment configuration
* GitHub Pages configuration
* GitHub Actions workflows
* tests
* linting
* type checking
* existing authentication
* existing payment/backend infrastructure
* environment variables
* feature flags
* all clock styles
* all dashboard modes
* all widgets
* timers
* stopwatch
* Pomodoro
* weather
* photo frame
* audio/vibes
* burn-in protection
* themes
* customization
* saved layouts/profiles
* any existing ads or monetization

### IMPORTANT

Never classify a feature as implemented merely because:

* it appears in the README
* it appears in documentation
* it is mentioned in comments
* a UI label exists without working logic

Verify each claimed feature against the actual source implementation.

---

# PHASE 0 FEATURE MATRIX

Create a verified feature inventory using these categories:

**FREE / FREE WITH LIMIT / PRO / LIFETIME / FUTURE CLOUD / UNDECIDED**

For every relevant feature, determine:

* feature name
* whether it actually exists
* implementation status
* relevant source/component/file
* current user-facing behavior
* current persistence mechanism
* dependencies
* proposed monetization tier
* proposed free limitation, if applicable
* monetization rationale
* implementation complexity
* technical risk
* authentication requirement
* backend requirement
* payment requirement
* migration concerns

Use **FREE WITH LIMIT** where a feature should remain available but with reasonable restrictions.

Examples:

* 5 clock styles free / all styles Pro
* 1 saved dashboard free / unlimited Pro
* limited photo collection free / expanded Pro
* selected sounds free / all sounds Pro
* 1 profile free / multiple profiles Pro

Do not assume these exact limits are correct; recommend limits based on the actual product.

---

# PHASE 0 ARCHITECTURAL ANALYSIS

Determine:

1. Cleanest entitlement architecture for this codebase.
2. Which functionality should permanently remain Free.
3. Which functionality is appropriate for Free With Limit.
4. Which functionality is appropriate for Pro.
5. Which functionality is appropriate for Lifetime.
6. Which functionality genuinely requires a backend.
7. Which functionality can remain entirely client-side.
8. What would require authentication.
9. What would require secure server-side verification.
10. What should NOT be monetized.
11. What architectural changes may eventually be necessary.
12. What migration risks exist.
13. What existing persistence/data formats must be preserved.
14. Whether GitHub Pages can remain the frontend deployment target.

Do not implement any recommendation.

---

# PHASE 0 OUT-OF-SCOPE FINDINGS

If unrelated bugs, technical debt, or opportunities are discovered:

* do not fix them
* do not refactor them
* record them under **Out-of-Scope Findings**

Only investigate/fix an unrelated issue if it directly prevents completion of Phase 0.

---

# PHASE 0 REQUIRED REPORT

After the audit, report:

1. Phase completed
2. Current Git state
3. Repository architecture summary
4. Verified feature inventory
5. FREE / FREE WITH LIMIT / PRO / LIFETIME / FUTURE CLOUD / UNDECIDED matrix
6. Recommended entitlement architecture
7. Backend/auth/payment requirements
8. Storage and migration considerations
9. Security considerations
10. Risks and technical concerns
11. Out-of-scope findings
12. Verification performed
13. Exact files changed — expected result: none, unless an explicitly permitted audit artifact was required

Then:

**STOP. Do not begin Phase 1.**

---

# PHASE 1 — ENTITLEMENT ARCHITECTURE

Only execute this phase after explicit instruction to begin Phase 1.

Build the internal entitlement abstraction based on the verified Phase 0 findings.

Support conceptually:

* Free
* Pro
* Lifetime
* Cloud

Requirements:

* centralize entitlement checks
* avoid scattered premium conditionals
* support stable feature identifiers
* support Free With Limit
* support future server-verified entitlements
* support development/testing overrides separately from production logic
* do not require authentication for Free usage
* do not treat localStorage as secure payment proof
* preserve existing behavior

Do not integrate real payments yet unless explicitly requested.

Test thoroughly.

STOP.

---

# PHASE 2 — FREE/PRO FEATURE GATING

Introduce only the verified Free/Pro boundaries from Phase 0.

Create reusable locked-feature/upgrade UI where needed.

Requirements:

* Free remains genuinely useful
* Pro features clearly communicate their value
* locked features do not crash
* existing settings remain safe
* downgrading from Pro does not corrupt data
* limits are enforced consistently

Do not implement payment processing.

Test Free and development Pro states.

STOP.

---

# PHASE 3 — PREMIUM CUSTOMIZATION

Implement verified Pro customization such as:

* custom colors
* themes
* fonts where technically appropriate
* backgrounds
* advanced clock appearance
* multiple saved layouts
* multiple profiles
* advanced widget arrangement

Preserve existing customization.

Handle:

* responsive layouts
* accessibility
* persistence
* reset/default behavior
* invalid configuration
* old saved settings

STOP.

---

# PHASE 4 — PREMIUM DASHBOARDS, PHOTO FRAME & AUDIO

Implement verified premium functionality around:

* Quad Mode
* advanced dashboard layouts
* unlimited dashboards
* Smart Photo Frame
* custom photo collections
* premium ambient sounds
* advanced audio controls
* additional widgets
* advanced widget arrangements

Do not artificially restrict features merely to create a paywall.

Handle empty states, permissions, storage limits, corrupted data, and unavailable assets.

STOP.

---

# PHASE 5 — PRICING & UPGRADE EXPERIENCE

Create polished upgrade/pricing UX.

Initial conceptual pricing:

* Free — ₹0
* Pro — ₹999/year
* Lifetime — ₹1,999 one-time

Architecture should allow future:

* monthly pricing
* yearly pricing
* introductory pricing
* promotional pricing
* regional pricing
* lifetime pricing

Do not hardcode pricing into unrelated components.

If real payments are unavailable, build only the UI and provider abstraction necessary for future integration.

Never fake successful payment.

STOP.

---

# PHASE 6 — REAL PAYMENT & ENTITLEMENT INTEGRATION

Only execute after a real payment provider/backend has been explicitly selected.

Architecture:

**GitHub Pages Frontend**
→ **Authentication / Backend**
→ **Payment Provider**
→ **Server-side Verification**
→ **Entitlement**
→ **Frontend Feature Access**

Implement only the provider-supported secure architecture.

Potential requirements:

* authentication
* checkout
* payment verification
* Pro activation
* Lifetime activation
* subscription status
* expiration
* cancellation
* restore purchases
* login synchronization
* logout handling
* webhook verification
* server-side entitlement checks

Never:

* expose secret keys
* trust `localStorage.isPro`
* use fake endpoints
* use placeholder credentials as production credentials
* claim payment succeeded without provider evidence

STOP.

---

# PHASE 7 — LIFETIME & FUTURE CLOUD ARCHITECTURE

Implement Lifetime entitlement behavior based on the verified architecture.

Lifetime should provide:

* current Pro functionality
* future Pro functionality
* no recurring subscription

Do not automatically include Cloud.

Only architect or implement Cloud functionality explicitly requested in this phase.

Potential future Cloud capabilities:

* account synchronization
* cloud dashboards
* profiles
* photo albums
* themes
* backup/restore
* dashboard sharing
* remote configuration

Avoid unnecessary infrastructure.

STOP.

---

# PHASE 8 — OPTIONAL THEME STORE

Only execute this phase after the core monetization system is stable.

Potential premium visual packs:

* Cyberpunk
* Space
* AMOLED
* Retro
* Productivity
* Ultimate Bundle

Possible capabilities:

* individual purchases
* bundles
* ownership
* entitlements
* asset versioning
* downloadable assets

Do not build a fake marketplace.

If the architecture is not ready for a real marketplace, document the recommended design instead of pretending it is production-ready.

STOP.

---

# PAYMENT SECURITY RULES

When payment functionality eventually exists:

* never trust client-only entitlement state
* never expose secret keys
* never commit credentials
* validate payment server-side
* verify webhook signatures
* protect authorization endpoints
* minimize sensitive data
* avoid logging tokens/payment secrets
* handle subscription expiration
* handle cancellation
* handle refunds where provider supports them
* support restore/reconciliation
* fail closed for invalid paid entitlements where appropriate

Never claim secure payment verification without actual evidence.

---

# TESTING REQUIREMENTS

At the end of every implementation phase:

* run available automated tests
* run lint
* run type checks if available
* run production build
* inspect affected UI
* test relevant Free behavior
* test relevant Pro behavior
* test Lifetime behavior when applicable
* test responsive behavior
* test persistence
* test error states
* test downgrade behavior where applicable
* verify existing functionality
* inspect the final Git diff
* verify no unrelated files were changed

The exact commands must be discovered from the repository rather than invented.

---

# ERROR HANDLING

If implementation fails:

1. Identify the exact failure.
2. Inspect logs/errors/evidence.
3. Determine likely root cause.
4. Apply a focused fix if it belongs to the current phase.
5. Re-run verification.
6. Report unresolved blockers honestly.

Do not abandon a phase after the first failure.

Do not silently work around failures.

---

# SCOPE CONTROL

Prioritize:

**Required current phase > correctness > security > valuable improvements > optional extras**

Do not:

* rewrite the application unnecessarily
* introduce unnecessary dependencies
* create speculative abstractions
* refactor unrelated code
* redesign unrelated UI
* fix unrelated bugs
* implement future phases early

If a future requirement influences an architectural decision, document the consideration rather than implementing future functionality prematurely.

---

# SELF-REVIEW

Before completing every phase, compare the implementation against the requirements for that phase.

Verify:

* every mandatory requirement was addressed
* no requirement was silently omitted
* no future phase was accidentally implemented
* no unnecessary complexity was introduced
* existing functionality remains intact
* user data/settings remain safe
* security is appropriate
* relevant edge cases were considered
* actual verification was performed
* final claims are supported by evidence
* unrelated files were not changed

Fix discovered problems before reporting completion.

---

# FINAL RESPONSE FORMAT AFTER EACH PHASE

Return:

### Phase

What phase was completed.

### Changes

Files/components actually changed.

### Implementation

What was implemented.

### Verification

Exact tests/build/lint/type checks/manual checks performed and their actual results.

### Git Safety

Current branch/state and confirmation that pre-existing changes were preserved.

### Findings

Important limitations, blockers, or out-of-scope findings.

### Next

State only which phase is next.

Then **STOP**.

---

# MOST IMPORTANT INSTRUCTION

**START WITH PHASE 0 ONLY.**

Phase 0 is strictly read-only.

Inspect the actual repository thoroughly, verify the real implementation rather than trusting documentation, create the complete monetization feature matrix, analyze the architecture, report your findings, and make **zero application-code changes**.

Do not implement entitlement logic.

Do not implement premium gates.

Do not implement pricing.

Do not implement payments.

Do not implement authentication.

Do not implement backend services.

Do not begin Phase 1.

**When Phase 0 is finished, STOP and wait for explicit instruction to continue.**

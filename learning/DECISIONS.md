# flip clock Architecture Decision Records (ADRs)

Meaningful technical decisions, library choices, and trade-offs for flip clock.

### 2026-09-05 Initialized project-specific ADR log
- **Decision:** Maintain independent ADRs for flip clock inside its own learning/ folder.
- **Why:** Full encapsulation, prevents pollution across unrelated projects.

### 2026-09-07 ADR-002: Unique User IDs and Month/Year Analytics via Turso DB
- **Decision:** Provide out-of-the-box user profiles identified by unique strings (`usr_<random>`) stored in `standby_users` and tagged to `standby_user_focus_sessions`. Provide Month-wise (`<input type="month">`) and Year-wise comparative SVG charts in a 4-tab Stats Modal (`#stats-modal`), with a dedicated Device Switcher.
- **Why:** Allows zero-friction tracking on single devices while enabling users to copy their ID and paste it into any mobile/tablet/desktop browser to restore full analytics history and sync active stats.


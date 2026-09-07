# flip clock Execution Flow & Component Map

Call paths, entry points, and recent changes specific to flip clock.

## Entry Points
- `index.html`: Main application interface, containing the HUD, clock stages, screensaver, and modals.
- `js/app.js`: Application bootstrap, clock registration, event listeners, and global hooks.
- `js/app.bundle.js`: Consolidated production distribution bundle.

## Core Component Map & Data Flow
- `js/state/store.js`: Central reactive state manager holding user profile (`currentUser`), pomo timers, space configurations, and focus statistics (`dailyTotals`, `monthlyTotals`, `yearlyTotals`).
- `js/state/tursoSync.js`: Cloud communication layer with Turso Edge database (`/v2/pipeline`), syncing `standby_users`, `standby_user_focus_sessions`, and cross-device profile switching (`loginWithUserId`).
- `js/components/statsModal.js`: 4-tab analytics interface displaying Overview (7-day activity, active user card), Month-wise (daily distribution bar chart, month picker), Year-wise (12-month bar chart), and Turso Cloud & Devices (ID switcher and cloud status).

## Recent Changes
- **2026-09-07**: Implemented Unique User ID system, Month-wise and Year-wise focus duration tracking, and Turso DB cross-device analytics sync. Rebuilt `js/app.bundle.js` and verified with Playwright end-to-end tests.


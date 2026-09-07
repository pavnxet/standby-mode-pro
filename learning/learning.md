# flip clock Learnings

## Domain Knowledge & Web APIs
- StandBy bedside smart displays utilize Web Audio API procedural synthesis (Brownian/white noise buffers and biquad filters) to generate infinite relaxing soundscapes (rain, waves, fireplace) without external audio file streaming.
- Ambient screensavers and burn-in prevention layers must inspect active timer/countdown state (`pomoState.isRunning`) before triggering idle timeouts to avoid obstructing active user focus sessions, and must run a live 1-second interval loop (`setInterval`) to ensure floating time displays remain synchronized with real-world time.
- Turso DB (LibSQL Edge): Remote HTTP queries execute via `/v2/pipeline`. Passing statements with typed arguments `[{"type": "execute", "stmt": {"sql": "...", "args": [...]}}]` provides cross-device session tracking without needing a full Node.js backend.
- Unique User IDs (`usr_<nanoid>`): Generated locally on first boot and stored in `localStorage`, then registered to `standby_users`. Users can paste their ID onto any other browser/device to load and sync all historical focus sessions and daily/monthly/yearly aggregates seamlessly.


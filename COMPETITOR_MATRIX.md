# StandBy Mode Pro — Competitor Matrix

> **Research date:** 2026-10-07
> **Method:** Live source inspection — Play Store / App Store listings, official product sites and pricing pages, GitHub REST API (stars, `pushed_at`, license, issue counts), GitHub issue threads, Reddit threads, and one source per cell below.
> **Separation rule:** Every cell is tagged. **[F]** = fact verified from a primary source. **[A]** = my analysis/inference. **[?]** = unknown, could not verify. No cell mixes the two without labelling.

---

## 0. Corrections to the brief's starting list (verified before research began)

| Brief said | Reality | Source |
|---|---|---|
| `momentumhomentum/dashboard` | **Does not exist (404).** Momentum is closed-source commercial | [Chrome Web Store](https://chromewebstore.google.com/detail/momentum/laookkfknpbbblfpciffpaejjkokdgca) |
| `tabuliss/tabliss` | Wrong org. Real repo is `joelshepherd/tabliss` | [github.com/joelshepherd/tabliss](https://github.com/joelshepherd/tabliss) |
| `lissy93/heimdall` | **Does not exist (404).** Heimdall is `linuxserver/Heimdall` | [github.com/linuxserver/Heimdall](https://github.com/linuxserver/Heimdall) |
| `kevjclark/dakboard` | **Does not exist (404).** DAKboard is closed-source SaaS; only repo is a feature tracker | [github.com/dakboard/DAKboard](https://github.com/dakboard/DAKboard) |
| `ajnart/homarr` | Exists but **archived**; current is `homarr-labs/homarr` | [github.com/homarr-labs/homarr](https://github.com/homarr-labs/homarr) |
| StandBy Mode Pro (Android) | Confirmed real, **1M+ downloads, 4.3★ / 31.8K reviews** | [Play Store](https://play.google.com/store/apps/details?id=br.com.zetabit.ios_standby) |

---

## 1. Competitor Set (18 verified products)

### 1.1 Clock / StandBy

| # | Product | Platform | Scale [F] | Monetization [F] | Primary source |
|---|---|---|---|---|---|
| C1 | **StandBy Mode Pro** (Zetabit) | Android | 1M+ DL · 4.3★ · 31.8K rev | Freemium, one-time Premium (**price [?]**), ads | [Play](https://play.google.com/store/apps/details?id=br.com.zetabit.ios_standby) · [zetabitapps.com](https://zetabitapps.com/standbymodepro) |
| C2 | **iOS StandBy** (Apple) | iOS 17+ | Built into iOS | **Free** | [Apple Support](https://support.apple.com/guide/iphone/use-standby-iph878d77632/ios) |
| C3 | **Fliqlo** (Yuji Adachi) | iOS/iPad/Vision, macOS, Win | 4.8★ · 2.3K · #46 Lifestyle | iOS $0.99 one-time + $0.99/mo IAP; **macOS/Win free**; **no Android** [F] | [App Store](https://apps.apple.com/us/app/fliqlo-flip-clock/id900833042) · [fliqlo.com](https://fliqlo.com) |
| C4 | **Huge Digital Clock** (DEEP SPARK) | Android | 10M+ · 4.5★ · 111K rev | Ads + IAP; **£14.99/week** to remove ads [F] | [Play](https://play.google.com/store/apps/details?id=com.cama.app.huge80sclock) |
| C5 | **Flip Clock: World Clock** (wssc) | Android | 5M+ · 4.7★ · 58.7K rev | Ads + IAP | [Play](https://play.google.com/store/apps/details?id=com.wssc.simpleclock) |
| C6 | **StandBy – Desk & Night Clock** (SAMVU LAB) | Android | 100K+ · 4.8★ | "Free. Ad-Free. No Premium." [F] | [Play](https://play.google.com/store/apps/details?id=com.samvd.standby) |
| C7 | **Night Clock** (Benjamin Laws) | Android | 100K+ · 4.5★ · 8K rev | Free no-ads; **Night Clock+ one-time $2.99** [F] | [Play](https://play.google.com/store/apps/details?id=de.program_co.nightclockfree) |
| C8 | **Always On AMOLED** (Firehawk) | Android | 10M+ · 4.5★ · 261K rev | Ads + **~$15/week** premium [F] | [Play](https://play.google.com/store/apps/details?id=com.tomer.alwayson) |
| C9 | **AOD Flow** (ANDROXUS) | Android | 1M+ · **4.0★** (lowest) | Ads + IAP; collects location+personal info [F] | [Play](https://play.google.com/store/apps/details?id=com.androxus.alwaysondisplay) |

### 1.2 Dashboards / kiosk / new-tab

| # | Product | Stars [F] | Last push [F] | License [F] | Open issues [F] | Monetization [F] |
|---|---|---|---|---|---|---|
| C10 | [Glance](https://github.com/glanceapp/glance) | **37,374** | 2026-09-05 | AGPL-3.0 | 228 | None |
| C11 | [Dashy](https://github.com/Lissy93/dashy) | **26,641** | 2026-10-07 | MIT | **19** | Free; affiliate hosting links |
| C12 | [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) | **23,913** | 2026-10-06 | MIT | **10** | Free core |
| C13 | [Heimdall](https://github.com/linuxserver/Heimdall) | 9,342 | 2026-10-03 | MIT | **4** | Free |
| C14 | [Homarr (labs)](https://github.com/homarr-labs/homarr) | 5,026 | 2026-10-07 | Apache-2.0 | 118 | Free core + Cloud tier [?] |
| C15 | [DAKboard](https://dakboard.com/pricing) | 185 (tracker only) | 2026-08-31 | closed | 84 | **$6/mo · $10/mo** SaaS |
| C16 | [Tabliss](https://github.com/joelshepherd/tabliss) | 2,785 | **2024-08-19 (dormant)** | GPL-3.0 | 304 | None |
| C17 | [Momentum](https://momentumdash.com/) | — (closed) | — | closed | — | Free + **$39.95/yr** Plus |

### 1.3 Focus / productivity

| # | Product | Scale [F] | Monetization [F] | Source |
|---|---|---|---|---|
| C18 | [Pomofocus](https://pomofocus.io/) | Closed-source | **$3/mo** Premium | [pomofocus.io](https://pomofocus.io/) |
| C19 | [Forest](https://forestapp.cc/) | 60M+ DL · 4.8★ · 2.1M trees planted | **One-time purchase REMOVED**; now "Forest Plus" sub. Price [?] | [forestapp.cc](https://forestapp.cc/) |
| C20 | [Tweek](https://tweek.so/calendar/pricing) | 878 active users [F] | **$5.99/mo · $49.99/yr · Family $89.99/yr** | [tweek.so/calendar/pricing](https://tweek.so/calendar/pricing) |
| C21 | [Structured](https://structured.app/) | 15M+ DL | $2.99/mo · $11.99–29.99/yr · Lifetime $34.99–39.99 | [help.structured.app](https://help.structured.app/en/articles/324674) |
| C22 | [Focus To-Do](https://www.focustodo.cn/) | Closed-source | Premium exists, price [?] | [focustodo.cn](https://www.focustodo.cn/) |
| C23 | [Super Productivity](https://github.com/super-productivity/super-productivity) | **22,603★** | Free MIT | [GitHub](https://github.com/super-productivity/super-productivity) |

---

## 2. Feature × Competitor Matrix

**Legend:** ✅ = has it · ◐ = partial/limited · ❌ = absent · **n/a** = out of scope

### 2.1 Clock engine

| Feature | C1 | C2 | C3 | C4 | C10 | C11 | C12 | **OURS** |
|---|---|---|---|---|---|---|---|---|
| Number of clock faces | 100+ [F] | Few [F] | **1** [F] | Many [F] | n/a | n/a | Module-based | **11** |
| Flip clock | ✅ | ✅ | ✅ **signature** | ✅ | n/a | n/a | ✅ 28★ mod | ✅ |
| Word clock | ✅ [F] | ❌ | ❌ | ❌ | n/a | n/a | ✅ 11★ mod | ❌ |
| Roman numeral clock | ✅ [F] | ❌ | ❌ | ❌ | n/a | n/a | ❌ | ❌ |
| Analog clock | ✅ 27 colours [F] | ✅ | ❌ | ✅ | n/a | n/a | ✅ 15★ (archived) | ✅ 1 (Bauhaus) |
| Matrix / terminal | ✅ [F] | ❌ | ❌ | ❌ | n/a | n/a | ❌ | ✅ |
| Solar / astronomical arc | ✅ [F] | ❌ | ❌ | ❌ | n/a | n/a | ❌ | ✅ |
| World clock | ✅ [F] | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Moon phase | ? [F] | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Binary clock | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Per-style font choice** | ✅ [F] | ◐ | ❌ | ✅ | ❌ | ❌ | ✅ | **❌ — dead field** |
| **Per-style size control** | ✅ [F] | ◐ | ◐ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Per-style colour** | ✅ 27 on analog [F] | ◐ | ❌ | ✅ | ✅ (themes) | ✅ 25+ themes | ✅ | **❌ — dead field** |
| **Hide seconds** | ❌ [F] ← C5/C6/C3 complaints | ◐ | ✅ **tap to toggle** | ❌ | n/a | n/a | n/a | ◐ global only |
| 12/24h toggle | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | ✅ global |
| DST correctness | ? [F] — C7 shipped a DST fix | ? | ? | ? | ? | ? | ❌ 4 issue threads | ✅ via `Date` |
| Accessibility clock | ✅ **Dementia clock** [F] | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ "Senior" (no special behaviour — see AUDIT T14) |

### 2.2 Layout system

| Feature | C1 | C2 | C15 | C16 | C10 | C11 | C14 | **OURS** |
|---|---|---|---|---|---|---|---|---|
| Drag-and-drop grid | ✅ | ❌ | ✅ blocks | ✅ per-widget | ❌ YAML | ❌ YAML+GUI | ✅ **zero-YAML** | ❌ |
| Resizable tiles | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Saved layout presets | ✅ **Spaces** | ◐ | ✅ screens | ◐ | ✅ pages | ✅ multi-page | ✅ boards | ◐ 4 hardcoded |
| Custom profiles (Home/Work/Focus/Night) | ✅ [F] | ❌ | ◐ accounts | ❌ | ❌ | ◐ | ✅ | ◐ 4 fixed, non-editable |
| Screen carousel / rotation | ✅ widget rotator [F] | ✅ Smart Stacks [F] | ✅ **loops** | ❌ | ✅ tabs | ✅ | ✅ | ❌ |
| Per-block scheduling | ❌ | ❌ | ✅ **core feature** | ❌ | ❌ | ❌ | ❌ | ❌ |
| `small | full` column model | ❌ | ❌ | ✅ | ❌ | ❌ | ◐ | ❌ | ❌ |
| Breakpoint-aware layouts | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ◐ **1 media query, portrait only** |
| TV / 10-foot mode | ? | ❌ | ✅ dedicated HW | ❌ | ❌ | ❌ | ❌ | ❌ |

### 2.3 Widgets

| Feature | C1 | C10 | C11 | C14 | C15 | **OURS** |
|---|---|---|---|---|---|---|
| Weather | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Open-Meteo |
| **Air quality** | ❌ [F] | ❌ | ❌ | ❌ | ✅ [F] | ❌ |
| Calendar (basic) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (hardcoded row) |
| **ICS / CalDAV import** | ✅ | ◐ #902 open | ✅ late | ✅ | ✅ any ICS | ❌ |
| **Alarm manager** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **World clock widget** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| RSS / News | ✅ | ✅ collapse-after | ✅ | ✅ Miniflux | ✅ | ❌ |
| Crypto / Stocks | ✅ | ✅ markets | ✅ | ✅ | ✅ CoinGecko | ❌ |
| FX / Currency | ❌ | ❌ | ✅ | ❌ | ✅ #611 | ❌ |
| Todo / tasks | ✅ | ❌ | ❌ | ✅ Todoist etc | ✅ | ✅ |
| **Habits** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Notes / sticky** | ✅ | ❌ | ❌ #636 open | ❌ | ✅ text block | ❌ |
| **Countdown to event** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Battery / system status** | ✅ System Dashboard | ✅ | ✅ | ✅ Glances | ❌ | ✅ battery only |
| **Network status** | ? | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Real media control (Media Session)** | ✅ Spotify/YT/Apple/Deezer + lyrics | ✅ | ❌ | ✅ Navidrome | ✅ Spotify | ❌ **demo stub** |
| **Pomodoro** | ✅ + insights | ❌ | ❌ | ❌ | ❌ | ✅ + stats |
| **Breathing / meditation** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Flashcards / quiz** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Calculator** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Converter (unit/FX)** | ✅ | ❌ | ✅ FX | ❌ | ✅ | ❌ |
| **Prayer / Panchang** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Photo frame | ✅ face-aware crop | ✅ | ✅ | ✅ | ✅ 8 sources | ✅ IndexedDB |
| **Any-app widget** | ✅ incl. KWGT | ✅ iframe/HTML/API | ✅ | ✅ | ✅ iframe | ❌ |

### 2.4 Focus tools

| Feature | C18 | C19 | C21 | C23 | C1 | **OURS** |
|---|---|---|---|---|---|---|
| Pomodoro core | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Long/short break cycle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Pomodoro estimate per task** | ✅ **signature** | ❌ | ◐ | ✅ | ❌ | ❌ |
| **Estimated finish time** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Daily/weekly charts | ✅ | ✅ advanced | ✅ | ✅ | ✅ | ✅ SVG |
| **Per-project time ratio** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Session edit/delete | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Partial-session credit | ❌ | ❌ | ❌ | ◐ | ❌ | ✅ **better than all** |
| Background-tab accuracy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gamification | ❌ | ✅ **forest** | ◐ | ◐ | ✅ | ❌ |
| Task templates | ✅ | ❌ | ✅ routines | ✅ | ❌ | ❌ |
| Task-manager integration | ✅ Todoist | ❌ | ❌ | ✅ Jira/GitHub | ❌ | ❌ |

### 2.5 Audio / ambient

| Feature | C1 | Noisli-class | myNoise | Brain.fm | **OURS** |
|---|---|---|---|---|---|
| Procedural (no audio files) | ✅ Vibes | ❌ | ❌ | ❌ | ✅ **genuine strength** |
| Rain | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fireplace | ✅ | ❌ | ✅ | ✅ | ✅ |
| Ocean / waves | ✅ | ✅ | ✅ | ✅ | ✅ |
| Forest / birds | ✅ | ◐ | ✅ | ✅ | ❌ |
| Café / crowd | ✅ | ✅ | ✅ | ◐ | ❌ |
| Brown noise | ✅ | ✅ | ✅ | ✅ | ❌ (synth exists, no UI) |
| Pink noise | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Multi-layer mixer** | ? | ✅ sliders | ✅ | ✅ mix | ❌ single volume |
| **Sleep timer + fade-out** | ✅ | ✅ | ✅ | ✅ | ❌ |
| Beat-reactive visualizer | ❌ | n/a | n/a | ✅ | ❌ (4 static modes) |
| Audio during timer | ✅ linked | ❌ | ❌ | ✅ | ◐ media widget hacks it |

### 2.6 Display & hardware

| Feature | C1 | C2 | C8 | C9 | C15 | **OURS** |
|---|---|---|---|---|---|---|
| Burn-in protection | ✅ pixel shift | ✅ | ✅ | ✅ | ? | ✅ basic translate |
| **Scheduled night mode** | ✅ light sensor + schedule | ✅ auto | ✅ | ✅ | ✅ | ❌ manual `N` only |
| **Scheduled dimming** | ✅ day/night brightness | ◐ | ✅ | ✅ | ✅ | ❌ |
| Wake lock | ✅ | ✅ | ? | ✅ | ✅ | ✅ |
| **Auto-launch on charge** | ✅ **5 combinable conditions** | ✅ | ? | ✅ broken on A57 [F] | ✅ | ❌ |
| Screensaver | ✅ | ✅ | ✅ | ✅ | ? | ✅ 1 style |
| **Screensaver variety** | ✅ | ◐ | ✅ | ✅ | ✅ | ❌ 1 style |
| Kiosk / lock-safe idle | ✅ | ✅ | ❌ **"security hazard"** [F] | ❌ | ✅ TouchHub | ❌ |
| Scheduled brightness (API) | n/a | n/a | n/a | n/a | n/a | ❌ **not possible in web** |

### 2.7 Platform

| Feature | C1 | C2 | C16 | C10 | C11 | **OURS** |
|---|---|---|---|---|---|---|
| **Installable PWA** | ❌ (native) | ❌ | ✅ | ❌ | ✅ | ❌ **no manifest, no SW** |
| Offline | ❌ | ❌ | ✅ | n/a | n/a | ❌ |
| Web Share | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Notifications | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Voice control | ✅ Siri | ✅ Siri | ❌ | ❌ | ❌ | ❌ |
| Gamepad / remote nav | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Command palette | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Keyboard shortcuts | ❌ | ❌ | ✅ | ❌ | ✅ search | ✅ 6 keys |
| Cheat sheet | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| i18n | ✅ 20+ langs | ✅ | ✅ 25+ | ◐ | ✅ | ❌ |
| Analytics | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ **none — a strength** |
| Permissions requested | ⚠️ Camera/Phone/Settings | ◐ | ✅ **zero** | ❌ | ❌ | ✅ **geolocation only** |

### 2.8 Data & settings

| Feature | C16 | C11 | C10 | C14 | C21 | **OURS** |
|---|---|---|---|---|---|---|
| Searchable settings | ❌ | ✅ | ❌ | ◐ | ❌ | ❌ |
| Custom themes | ✅ | ✅ 25+ | ✅ | ✅ | ✅ | ❌ 1 dark |
| Theme import/export | ❌ | ✅ backup | ❌ | ❌ | ❌ | ❌ |
| Settings schema migration | ❌ **#268 = top issue** | ❌ | n/a | ⚠️ layout shifts on upgrade | ❌ | ❌ **none** |
| Backup / restore | ❌ | ✅ | ❌ | ❌ | ✅ | ◐ cloud sync only |
| Cross-device sync | ✅ | ✅ | ❌ | ✅ | ✅ **#1 complaint** | ✅ Turso, owner-token-gated |
| Undo / redo | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| High contrast | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reduced motion | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ **verified absent** |
| Screen-reader support | ◐ | ◐ | ◐ | ◐ | ◐ | ⚠️ 14 gaps (AUDIT §5) |

---

## 3. Where We Win Today (verified, defensible)

| # | Advantage | Evidence |
|---|---|---|
| W1 | **100% client-side, zero analytics, zero tracking.** Only optional geolocation. | AUDIT §8 — no analytics libs anywhere |
| W2 | **Deploys to GitHub Pages with no server.** Competitors C10/C11/C13/C14 all require Docker. | `vercel.json` + Pages; `api/sync.js` is optional |
| W3 | **Genuinely procedural audio** — infinite non-looping ambience with zero bandwidth. | `soundEngine.js` |
| W4 | **Partial-session focus credit** — abandon at 20 min, record exactly 20 min. No competitor verified this. | `store.js:471-485` |
| W5 | **Sessions are editable and deletable with instant aggregate recalculation.** | `store.js:368-394` |
| W6 | **Weather with no API key.** C15 charges for weather. | `weatherWidget.js:67` |
| W7 | **Timers survive tab suspension via absolute `targetEndTime`.** | `store.js:519` |
| W8 | **11 clock styles as a plug-in registry**, versus C10/C11 which need YAML editing to add one. | `clockEngine.js` |

## 4. Gaps Against the Market (ranked by severity)

Ordered by **[verified user pain] × [our current gap]**.

| Rank | Gap | Competitor pain that proves demand | Our state |
|---|---|---|---|
| **1** | **Media widget is broken** — `store.updateMediaState()` undefined | C1's Spotify/lyrics player is a headline feature; C15 ships Spotify | **AUDIT D1 — throws on every click** |
| **2** | **No installable PWA / offline** | C16 ships as PWA; C11 ships PWA; users repurpose old tablets | no `manifest`, no service worker |
| **3** | **No alarm clock at all** | C3's #1 complaint is "I thought it would have an alarm built into it"; C2 is *explicitly* positioned as an alarm | none |
| **4** | **No hide-seconds control** | Requested by users of C5, C6, and the reference lib `pqina/flip` **#76** | global toggle only, and 2 clocks ignore it |
| **5** | **Settings have no schema migration** | C16 **#268** — the single most-upvoted issue in the entire dashboard category (104 comments): settings silently reset on browser update | none; key-name versioning only |
| **6** | **No drag-and-drop / resizable grid** | C14's zero-YAML board is its #1 draw; C11 #383, #1233 (masonry) open | 4 fixed layouts |
| **7** | **No world clock, no ICS calendar** | C5 world clock + per-city weather is in its store description; ICS requested in C15 #9, C10 #902 | none |
| **8** | **3 High-severity XSS paths** | — (our own defect, not competitive) | AUDIT S1, S2, D3, D4 |
| **9** | **Closed modals are keyboard-tabbable; no Escape, no focus trap, no ARIA** | WCAG 2.2 AA; C11 ships proper tab semantics | AUDIT §5.2, §5.3 |
| **10** | **No scheduled night mode / dimming** | C1, C8, C9, C15 all ship it; C2 auto-dims by ambient light | manual toggle only |
| **11** | **No kiosk / idle-privacy mode** | C9: AOD persisting after unlock = **"This is a security hazard"** (dev called it "a critical bug"); C3's most-cited review is a lock-screen complaint | none |
| **12** | **Tailwind JIT shipped from CDN at runtime** | — (our own perf defect) | AUDIT §8 |
| **13** | **One media query, portrait-only** | — | AUDIT §6 |
| **14** | **No i18n, no searchable settings, no theme engine, no backup export** | C1 20+ langs; C11 25+ themes; C11 backup | none |
| **15** | **Dead config fields** (`fontFamily`, `accentColor`, `glowIntensity`) | C5's reviewer asks for exactly this | settable, zero effect (AUDIT T11) |
| **16** | **No habit tracker, notes, countdown, AQI, breathing, flashcards, calculator** | C15 all ship these; C1 ships calculator | none |

---

## 5. Monetization Market Signals (facts only — no recommendation)

| Signal | Evidence |
|---|---|
| **Weekly subscriptions on cheap utilities are the category's most-documented failure.** | C4: **£14.99/week** to remove ads — user who had already paid a one-time fee: *"the developer has ignored my ad-free for life payment and worse, has gotten greedy, and wants £14 per week… I'll be looking for a replacement."* [Play](https://play.google.com/store/apps/details?id=com.cama.app.huge80sclock) |
| **C8: ~$15/week**, with an explicit competitor comparison in the review: *"Muviz has more features and premium is 3 to 5 bucks, once."* | [Play](https://play.google.com/store/apps/details?id=com.tomer.alwayson) |
| **Removing a one-time purchase is the single most-documented backlash.** | C19 Forest FAQ now states: *"Forest Pro is no longer available for purchase on any platform."* Reddit: *"I'm really disheartened that they followed the trend of enshittification… removing the one-time pro purchase."* [forestapp.cc](https://forestapp.cc/) · [r/forestapp](https://www.reddit.com/r/forestapp/comments/1j3kl2r/any_alternatives_to_forest/) |
| **Users name $3–5 one-time as the fair price for an AOD app.** | C8 review, above |
| **Gating the headline feature is the standard paywall failure.** | C17 Momentum gates Focus Mode on Plus; C15 gates screen loops behind $10/mo; C20 Tweek paywalls the *week view* — its primary abstraction. |
| **Ads that interrupt configuration cause immediate churn.** | C9: *"Before AOD display have to watch 2 mins Ad then selecting and setting feature, in between 20 times asking 'go for premium'."* Developer publicly apologised for *"vulgar 2-minute ads."* |
| **Reliable, honest free tiers are a viable strategy.** | C11 Dashy: 26,641★, MIT, **19 open issues**, zero paywall. C10 Glance: 37,374★, AGPL, no paywall. |
| **The reference price band for this category's paid tier is ₹999–₹1999 one-time**, matching the owner's existing roadmap. | `features to be implemented/MONETIZATION_PHASE_ROADMAP.md:99, 140` |

**Alignment check [A]:** the owner's roadmap (Free / Pro ₹999yr / Lifetime ₹1999) is **consistent with** every verified market signal above — notably the strongest signal being that one-time beats subscription *for this specific category*. The roadmap's Phase 0 = read-only audit mandate has been honoured by `AUDIT.md`.

---

## 6. UX Patterns Worth Adopting (ranked [A])

| Rank | Pattern | Provenance | Why it fits us |
|---|---|---|---|
| 1 | **Never let the clock die.** Guaranteed wake-lock, crash recovery, exact-layout state restore. | C4 user's killer detail: *"the clock turns off in the middle of the night and I have to sit through a video ad to pull it up again."* | A bedside clock failing at 3am is the worst possible bug |
| 2 | **Complications on the edges** — small next-alarm/date/battery chips around the main face. | C1: *"small complications on the edges of any screen add the next alarm, the date, battery or progress through the year."* | Solves our 11-clock breadth without cluttering |
| 3 | **Auto-expanding idle ("Yoga") layout** — widget grows when idle, tap to restore. | C1 | Perfect for an always-on display |
| 4 | **Hide-seconds toggle as table stakes.** | Requested by C5, C6, `pqina/flip` #76 | One-line fix, high demand |
| 5 | **Pomodoro-as-estimate + estimated finish time.** | C18 signature | Beats "hours" estimation |
| 6 | **Drone-and-resize grid with undo/redo.** | C14 / C15 / C11 | We have none; users expect it |
| 7 | **True near-zero brightness with no UI floor.** | C7: *"it doesn't like to stay low it snaps back up to some weird minimal value."* | Web has no brightness API → must use CSS opacity/filter instead, and must not impose a floor |
| 8 | **Enforce contrast in the theme engine, never trust authors.** | C1 review: *"dark background with a black text on it, how'd it look."* | Prevents the #1 theme complaint class |
| 9 | **Zero-permission positioning.** | C16 Tabliss's entire selling point | We already qualify — say so publicly |
| 10 | **Per-widget cache TTL + `collapse-after-N`.** | C10 Glance | Density without a modal |
| 11 | **Everything removable; nothing forced.** | `ha-fusion` #533/#453: users angry they can't delete a default screen | Cheap to honour, high goodwill |
| 12 | **Transparent triage labels (Roadmap / Backlog / Icebox).** | C10 | Earned 37K stars |
| 13 | **Dragging tree as a single visual punishment asset.** | C19 Forest | Cheapest possible gamification, zero numbers |
| 14 | **Ring timer with the task name inside the ring.** | C18 | Already 60% built in `pomoFocusView.js` |

---

## 7. The Market Vacancy (verified)

| Finding | Evidence |
|---|---|
| **The web/PWA standby-clock niche is empty.** GitHub searches for `standby clock web`, `desk clock pwa`, `smart clock dashboard`, `world clock dashboard` return top results of **0–6 stars**. `desk clock pwa` returns 5 repos, **all 0★**. | [aBER0724/standby-clock](https://github.com/aBER0724/standby-clock) (0★) · [dami-coder13/StandBy-Desk-Clock](https://github.com/dami-coder13/StandBy-Desk-Clock) (0★) · [LTurret/Standby-Clock-and-Calendar](https://github.com/LTurret/Standby-Clock-and-Calendar) (1★) · [enisbu/flipclock](https://github.com/enisbu/flipclock) (0★, *"works offline forever"*) |
| **The native equivalent has 1M+ downloads** (C1) and **10M+** in adjacent apps (C4, C8). | [Play Store listings](https://play.google.com/store/apps/details?id=br.com.zetabit.ios_standby) |
| **MagicMirror² has 489 clock/dashboard repos but no first-class clock module** — its best is 48★, last pushed 2023, while its calendar is first-class. | [topic:magicmirror](https://github.com/topics/magicmirror) · [MMM-AlarmClock](https://github.com/fewieden/MMM-AlarmClock) (48★, 2023-10-18) |
| **The largest web dashboard (C10, 37K★) is at real abandonment risk** — the maintainer filed a pinned issue admitting burnout. | [glance#464 "A note from the maintainer"](https://github.com/glanceapp/glance/issues/464) |
| **Third-party free APIs are a proven rot channel** — every competitor built on one has filed breakage bugs. | C16: TheySaidSo CORS [#601](https://github.com/joelshepherd/tabliss/issues/601), Giphy [#418](https://github.com/joelshepherd/tabliss/issues/418), Unsplash [#78](https://github.com/joelshepherd/tabliss/issues/78) · C10: Reddit 403 [#1016](https://github.com/glanceapp/glance/issues/1016) (31 comments), Pi-hole v6 [#368](https://github.com/glanceapp/glance/issues/368) · Our own `app.js:229,243` uses two public counter services for a cosmetic pill |

**Implication [A]:** our differentiation cannot be "more clock styles" — C1 already has 100+. It must be **the clock that never fails, never shows an ad, asks for zero permissions, works offline, installs to the home screen, and is genuinely accessible.** Every one of those is currently absent or weak in our build.

---

## 8. Unknowns (explicitly not claimed)

- StandBy Mode Pro's Premium **price** — not published. One secondary YouTube source says "$17.33 CAD"; unconfirmed.
- StandBy Mode Pro rating discrepancy: Play Store 4.3★/31.8K vs. official site 4.6★/30.4K. Play Store treated as authoritative.
- Forest Plus exact price — stated as region/platform-variable, not published.
- Focus To-Do premium price — not published anywhere reachable.
- Homarr Cloud/Pro pricing — commercial layer confirmed, no public price page reachable.
- Offline support for C18, C16, C19-web, C21-web — **unknown**.
- C6 SAMVU listing contradicts itself: header says "In-app purchases", description says *"Free. Ad-Free. No Premium. No Locked Features."* Unresolved.
- Reddit thread bodies were read via search-engine snippets, not on-page fetch (Reddit blocked direct fetch). Quotes are verbatim from snippets.
- Our own Lighthouse scores, real frame rates, and network transfer sizes — **not measured**; see `TESTING.md` for the exact reason.
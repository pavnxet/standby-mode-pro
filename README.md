# StandBy Mode Pro — Smart Clock & Desk Display

A high-performance, responsive **StandBy Smart Display & Desk Dashboard** web application inspired by the StandBy Mode Pro Android app and iOS StandBy experience.

---

## Key Features

### 11 Modular Clock Styles
1. **Retro 3D Flip Clock**: Realistic split-flap cards with 3D mechanical rotation physics and synthesized click audio.
2. **Neon Cyberpunk Glow**: Multi-tube neon numerals with animated color pulsing and text glow.
3. **Matrix Digital Rain**: Phosphorescent green glyph terminal display.
4. **Solar Astronomical Arc**: Tracks celestial daylight arc, solar noon, and golden hour positions.
5. **Big Crop Typographic**: Oversized bold cropped numerals with high-contrast edge impact.
6. **Radial Sweep Gauge**: Dual concentric circular gauge meters for seconds and minutes.
7. **Day & Senior Friendly**: Ultra-legible high-contrast day name, period pill, and large date.
8. **7-Segment Retro LED**: Classic bedside digital alarm clock with phosphor red segments.
9. **Bauhaus Analog & Digital**: Swiss railway minimalist analog dial paired with digital time.
10. **AMOLED Deep Black**: Zero-power pure black aesthetic for bedtime dock displays.
11. **Star Trek LCARS**: Futuristic tactical diagnostics clock with stardates and telemetry.

### Flexible Dashboard Layouts
- **Standalone (Clock Only)**: Fullscreen immersive clock face.
- **Duo Mode (2 Panels)**: Side-by-side split screen with independent swappable widgets or clocks.
- **Quad Mode (4 Panels)**: 2x2 grid for tablets and desktop monitors.
- **Focus Mode**: Dedicated Pomodoro workspace.

### 9 Interactive Widgets
- **Live Weather & Forecast**: Open-Meteo integration with browser geolocation and fallback coordinates.
- **Calendar & Schedule**: Interactive monthly calendar.
- **Universal Media Player**: Demo track simulator with synchronized lyrics and ambient audio.
- **Fullscreen Timer & Stopwatch**: Pomodoro countdown timer + stopwatch.
- **TODO & Protocols**: Persistent task checklist.
- **Tally Counter**: Quick clicker counter.
- **Daily Wisdom & Quotes**: Curated focus cards.
- **Smart Photo Frame**: Slideshow with IndexedDB custom photo storage.
- **Vibes Atmosphere Selector**: Ambient soundscape controls.

### Procedural Vibes & Audio-Visual Engine
- Web Audio API sound synthesis.
- Canvas visualizers including stars, Matrix rain, waves, and aurora.

### Bedside Display & Hardware Protection
- Night Mode (`N` shortcut).
- OLED burn-in protection with configurable displacement interval.
- Idle screensaver with configurable timeout.
- Fullscreen mode (`F` shortcut).
- Screen Wake Lock where supported.

## Keyboard Shortcuts
- `F`: Toggle Fullscreen Mode
- `N`: Toggle Night Mode Tint
- `1`: Switch to Home Space
- `2`: Switch to Work Space
- `3`: Switch to Focus Space
- `4`: Switch to Night Space

## Running Locally
The application now uses native ES modules as its maintained browser entry point. Serve the repository over HTTP rather than opening `index.html` directly with `file://`:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/`.

The legacy `js/app.bundle.js` remains in the repository for reference, but the application entry point intentionally loads `js/app.js` so source and deployed behavior cannot silently diverge.

## Validation
A GitHub Actions workflow at `.github/workflows/validate.yml` performs JavaScript syntax checks, verifies local module imports, confirms the maintained entry point, and checks required application files on pushes and pull requests.

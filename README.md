# StandBy Mode Pro  Smart Clock & Desk Display

A high-performance, responsive **StandBy Smart Display & Desk Dashboard** web application inspired by the StandBy Mode Pro Android app and iOS StandBy experience.

---

##  Key Features & Researched Capabilities

###  11 Modular Clock Styles
1. **Retro 3D Flip Clock**: Realistic split-flap cards with 3D mechanical rotation physics and synthesized click audio.
2. **Neon Cyberpunk Glow**: Multi-tube neon numerals with animated color pulsing and text glow.
3. **Matrix Digital Rain**: Phosphorescent green glyph terminal display.
4. **Solar Astronomical Arc**: Tracks celestial daylight arc, solar noon, and golden hour positions.
5. **Big Crop Typographic**: Oversized bold cropped numerals with high-contrast edge impact.
6. **Radial Sweep Gauge**: Dual concentric circular gauge meters for seconds and minutes.
7. **Day & Senior Friendly**: Ultra-legible high-contrast day name, period pill (Morning/Afternoon/Night), and large date.
8. **7-Segment Retro LED**: Classic bedside digital alarm clock with phosphor red segments.
9. **Bauhaus Analog & Digital**: Swiss railway minimalist analog dial paired with digital time.
10. **AMOLED Deep Black**: Zero-power pure black aesthetic for bedtime dock displays.
11. **Star Trek LCARS**: Futuristic tactical diagnostics clock with stardates and telemetry.

###  Flexible Dashboard Layouts
- **Standalone (Clock Only)**: Fullscreen immersive clock face.
- **Duo Mode (2 Panels)**: Side-by-side split screen with independent swappable widgets.
- **Quad Mode (4 Panels)**: 2x2 grid for tablets and desktop monitors.

###  9 Interactive Widgets
- **Live Weather & Forecast**: Open-Meteo API integration with auto-geolocation and offline fallback.
- **Calendar & Schedule**: Interactive monthly calendar with week agenda and event markers.
- **Universal Media Player**: Track simulator with live synchronized rolling lyrics and synthesizer background beats.
- **Fullscreen Timer & Stopwatch**: Pomodoro countdown timer + high-precision stopwatch with lap counter.
- **TODO & Protocols**: Daily task checklist and habit tracker.
- **Tally Counter**: Quick clicker counter with step controls.
- **Daily Wisdom & Quotes**: Curated focus and stoic philosophy cards.
- **Smart Photo Frame**: Slideshow with face/center-aware crop simulation + custom IndexedDB photo uploads.
- **Vibes Atmosphere Selector**: Quick switch for ambient soundscapes.

###  Procedural Vibes & Audio-Visual Engine
- **Web Audio API Synthesis**: Real-time generative soundscapes (Rain & Thunder, Ocean Waves, Campfire Crackle, Pink Noise, Binaural 432Hz focus beats).
- **Procedural Canvas Visualizers**: Cosmic Starfield, Matrix Rain, Waveform Particles, and Aurora Borealis.

###  Bedside Display & Hardware Protection
- **Night Mode**: Red/amber monochrome tint with dimmed bedside presentation (`N` shortcut).
- **OLED Burn-In Protection**: Subtle 1-2px sub-pixel micro-displacement every 60 seconds.
- **Idle Screensaver**: Inactivity detection with floating clock and tap-to-wake.
- **Fullscreen Mode**: Browser Fullscreen API toggle (`F` shortcut).

---

##  Keyboard Shortcuts
- `F`: Toggle Fullscreen Mode
- `N`: Toggle Night Mode Tint
- `1`: Switch to Home Space
- `2`: Switch to Work Space
- `3`: Switch to Focus Space
- `4`: Switch to Night Space

---

##  Running Locally
Open `index.html` in any modern web browser or serve with a local static server:
```bash
# Using Python
python -m http.server 8080

# Using Node / npx
npx serve .
```

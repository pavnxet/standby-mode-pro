/* StandBy Mode Pro - Tailwind build configuration
 *
 * ADR-015. This file, and the generated stylesheet it produces, replace
 * `cdn.tailwindcss.com`.
 *
 * Why the CDN had to go, measured rather than asserted:
 *
 *   - 124 KB of third-party JavaScript, the single largest transfer on the page
 *   - 885 ms of render-blocking time attributed to it by Lighthouse
 *   - it executes before the app does, so the clock waits on a network round trip
 *     to a host the project does not control
 *   - it contradicts the project's own no-CDN rule
 *
 * The cost of precompiling is that the stylesheet is a build artefact and must be
 * regenerated when a class is added. `npm run css:tailwind` does that, and the
 * coverage check in scripts/check-css-coverage.mjs is what catches it being stale.
 *
 * The theme here is byte-for-byte the configuration that was previously set
 * inline in index.html, so the fonts resolve identically.
 */

module.exports = {
  darkMode: "class",
  // No preflight.
  //
  // The CDN build applied Tailwind's preflight reset by default, which normalises
  // margins, headings and borders across the whole document. The existing
  // stylesheets were written against that reset, so disabling it changes how the
  // legacy faces look. It is kept enabled deliberately - turning it off is a
  // visual change that needs its own review, not a silent side effect of
  // removing a CDN.
  corePlugins: { preflight: true },
  content: [
    "./index.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        serif: ["Instrument Serif", "serif"],
        display: ["Syne", "sans-serif"],
        digital: ["VT323", "monospace"]
      }
    }
  }
};

/* StandBy Mode Pro - Screensaver Styles Engine
 *
 * FEATURE_PLAN E7: five styles. This file picks one and produces its markup.
 *
 * The split is deliberate. `screensaver.js` already owns the idle timer, the
 * Pomodoro suppression and the wake handling, and the plan is explicit that the
 * Pomodoro-suppression logic "is already correct" and must be preserved. So
 * none of that is duplicated here - this module only answers "given a style id,
 * what markup goes in the layer".
 *
 * That also means a new style cannot accidentally break the suppression, which
 * is the failure mode when five styles each own their own idle logic.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";
import { formatInZone, offsetLabel, localZone } from "../core/timezones.js";
import { sunTimes } from "../clocks/_shared/solarMath.js";

export const SCREENSAVER_STYLES = [
  { id: "clock", label: "Drifting clock", hint: "The time, very slowly" },
  { id: "kenburns", label: "Photo", hint: "Your photo, slowly zooming" },
  { id: "quote", label: "Quote", hint: "Words, drifting upward" },
  { id: "world", label: "World times", hint: "Cities scrolling past" },
  { id: "solar", label: "Day and night", hint: "The sun's arc where you are" }
];

/** Cities for the world style. Deliberately spread across every timezone band. */
const WORLD_CITIES = [
  { label: "Auckland", tz: "Pacific/Auckland" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Mumbai", tz: "Asia/Kolkata" },
  { label: "Dubai", tz: "Asia/Dubai" },
  { label: "London", tz: "Europe/London" },
  { label: "New York", tz: "America/New_York" },
  { label: "Mexico City", tz: "America/Mexico_City" },
  { label: "São Paulo", tz: "America/Sao_Paulo" },
  { label: "Los Angeles", tz: "America/Los_Angeles" },
  { label: "Vancouver", tz: "America/Vancouver" }
];

/**
 * A small built-in quote set.
 *
 * Hardcoded rather than fetched: a screensaver that needs the network is a
 * screensaver that shows nothing on a plane, and an idle screen with an error
 * message on it is worse than one with a fixed aphorism. Only the user's own
 * photo is used if they have set one.
 */
const QUOTES = [
  { text: "The night is long, and the clock keeps its own time.", by: "" },
  { text: "What is a clock but a promise we make to the future?", by: "" },
  { text: "Time is the fire we burn and the ash we leave.", by: "" },
  { text: "Nothing is more difficult than the hour before dawn.", by: "" },
  { text: "The clock strikes midnight; the room does not.", by: "" }
];

/** Deterministic quote for a given minute, so it does not flicker per render. */
export function quoteForMinute(minute) {
  const index = Math.abs(Math.floor(minute)) % QUOTES.length;
  return QUOTES[index];
}

/**
 * The shared wake hint.
 *
 * Every style needs it, and its absence is the single most reported
 * screensaver complaint: "I did not know how to get back to the clock."
 */
function wakeHint() {
  return `
    <div class="sa-hint">
      <span class="sa-dot"></span>
      Tap anywhere to wake
    </div>`;
}

/**
 * Builds the markup for one style.
 *
 * @param {string} styleId
 * @param {Date} now
 * @returns {string}
 */
export function renderScreensaverStyle(styleId, now = new Date()) {
  switch (styleId) {
    case "kenburns":
      return renderKenBurns(now);
    case "quote":
      return renderQuote(now);
    case "world":
      return renderWorld(now);
    case "solar":
      return renderSolar(now);
    case "clock":
    default:
      return renderDriftClock(now);
  }
}

function clockText(now, sizeClass = "sa-clock") {
  const is24h = (store.getState().clockConfig || {}).timeFormat === "24h";
  let hours = now.getHours();
  let period = "";
  if (!is24h) {
    period = hours >= 12 ? " PM" : " AM";
    hours = hours % 12 || 12;
  }
  const hoursStr = is24h ? String(hours).padStart(2, "0") : String(hours);
  return `${hoursStr}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}${period}`;
}

function dateText(now) {
  return now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function renderDriftClock(now) {
  return `
    <div class="sa-frame">
      <div class="${"sa-clock"}" id="screensaver-time-text">${escapeHtml(clockText(now))}</div>
      <div class="sa-date" id="screensaver-date-text">${escapeHtml(dateText(now))}</div>
      ${wakeHint()}
    </div>`;
}

function renderKenBurns(now) {
  // Falls back to a gradient when there is no photo. A screensaver that renders
  // an empty box is worse than one showing a plain background.
  const url = store.getState().wallpaper?.url || "";
  const style = url
    ? `background-image: url("${escapeHtml(url)}");`
    : `background: linear-gradient(140deg, #1e293b 0%, #334155 45%, #0f172a 100%);`;

  return `
    <div class="sa-frame">
      <div class="sa-photo" style="${style}"></div>
      <div class="sa-vignette"></div>
      <div class="screensaver-float-content">
        <div class="sa-clock" id="screensaver-time-text">${escapeHtml(clockText(now))}</div>
        <div class="sa-date" id="screensaver-date-text">${escapeHtml(dateText(now))}</div>
        ${wakeHint()}
      </div>
    </div>`;
}

function renderQuote(now) {
  const quote = quoteForMinute(now.getTime() / 60000);
  return `
    <div class="sa-frame">
      <div class="screensaver-float-content">
        <blockquote class="sa-quote">${escapeHtml(quote.text)}</blockquote>
        ${quote.by ? `<div class="sa-attribution">${escapeHtml(quote.by)}</div>` : ""}
        ${wakeHint()}
      </div>
      <div class="sa-small-clock" id="screensaver-time-text">${escapeHtml(clockText(now))}</div>
      <div id="screensaver-date-text" hidden></div>
    </div>`;
}

function renderWorld(now) {
  const rows = WORLD_CITIES.map((city) => {
    const time = formatInZone(now, city.tz, { hour: "2-digit", minute: "2-digit" });
    const offset = offsetLabel(now, city.tz);
    return `
      <div class="sa-world-row">
        <span class="sa-world-city">${escapeHtml(city.label)}</span>
        <span class="sa-world-time">${escapeHtml(time || "—")}</span>
        <span class="sa-world-offset">${escapeHtml(offset || "")}</span>
      </div>`;
  }).join("");

  // Duplicated so the scroll loop is seamless: the list reaches the top again
  // with no visible jump.
  return `
    <div class="sa-frame">
      <div class="screensaver-float-content">
        <div class="sa-rows">${rows}${rows}</div>
        ${wakeHint()}
      </div>
      <div class="sa-local">${escapeHtml(dateText(now))}</div>
      <div id="screensaver-time-text" hidden></div>
      <div id="screensaver-date-text" hidden></div>
    </div>`;
}

function renderSolar(now) {
  const loc = store.getState().unitLocation || {};
  const hasLocation = Number.isFinite(loc.lat) && Number.isFinite(loc.lon);

  // Without a location, a solar arc would be a lie about where the sun is. The
  // sky gradient still renders and says plainly that it does not know.
  let arc;
  if (hasLocation) {
    const times = sunTimes(now, loc.lat, loc.lon);
    if (times && Number.isFinite(times.sunrise) && Number.isFinite(times.sunset)) {
      const dayLength = Math.max(1, times.sunset - times.sunrise);
      const progress = Math.max(0, Math.min(1, (now.getTime() - times.sunrise) / (dayLength * 1000)));
      // Parabola across the arc: the sun peaks at midday, not at the midpoint
      // of the elapsed fraction.
      const arcHeight = 4 * progress * (1 - progress);
      const left = 12 + progress * 76;
      const bottom = 32 + arcHeight * 46;
      arc = `left:${left}%; bottom:${bottom}%;`;
    }
  }

  const sunriseText = hasLocation && Number.isFinite(sunTimes(now, loc.lat, loc.lon)?.sunrise)
    ? new Date(sunTimes(now, loc.lat, loc.lon).sunrise).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return `
    <div class="sa-frame">
      <div class="sa-sky"></div>
      ${arc ? `<div class="sa-sun" style="${arc}"></div>` : ""}
      <div class="sa-horizon"></div>
      <div class="sa-solar-clock">
        <div class="sa-clock" id="screensaver-time-text">${escapeHtml(clockText(now))}</div>
        <div class="sa-date" id="screensaver-date-text">${
          escapeHtml(
            sunriseText
              ? `${sunriseText} sunrise`
              : "Set a location to see the sun's arc"
          )
        }</div>
      </div>
      ${wakeHint()}
    </div>`;
}

/**
 * The active style, validated.
 *
 * An unknown persisted id falls back to `clock` rather than rendering nothing,
 * so removing a style in a later release leaves a working screensaver behind.
 */
export function activeScreensaverStyle() {
  const config = store.getState().screensaver || {};
  return SCREENSAVER_STYLES.some((s) => s.id === config.style) ? config.style : "clock";
}
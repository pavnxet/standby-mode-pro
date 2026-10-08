/* StandBy Mode Pro - Air Quality Mapping
 *
 * FEATURE_PLAN.md C9 pure logic, split out of the widget so it can be
 * unit-tested without a DOM or network.
 *
 * Open-Meteo returns the European AQI by default. The bands below are the
 * European Environment Agency scale, which is what the API's `european_aqi`
 * field is defined against.
 */

/** European AQI bands, lowest to highest. */
export const BANDS = [
  { max: 20, label: "Good", tone: "good" },
  { max: 40, label: "Fair", tone: "fair" },
  { max: 60, label: "Moderate", tone: "moderate" },
  { max: 80, label: "Poor", tone: "poor" },
  { max: 100, label: "Very poor", tone: "very-poor" },
  { max: Infinity, label: "Extremely poor", tone: "extreme" }
];

/**
 * Maps a European AQI value to its band.
 *
 * @param {number|null} aqi
 * @returns {{ label: string, tone: string }} "Unknown" for a non-finite value,
 *   never a band, so a missing reading cannot be mistaken for clean air.
 */
export function bandFor(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) return { label: "Unknown", tone: "unknown" };

  const band = BANDS.find((candidate) => aqi <= candidate.max);
  if (!band) return { label: "Unknown", tone: "unknown" };

  // Only label and tone: `max` is Infinity for the top band, which serialises to
  // null and made callers' deep comparisons against the published band list fail.
  return { label: band.label, tone: band.tone };
}

/** Band edges, for a colour scale in the UI. */
export function bandScale() {
  return BANDS.map((band) => ({ label: band.label, tone: band.tone, max: band.max }));
}

/**
 * Builds the Open-Meteo air-quality URL for a location.
 *
 * Keyless and on the Open-Meteo domain, so the app's entire outbound traffic is
 * one host family - which matters under a zero-tracking policy, since every
 * distinct host is a separate party receiving the user's IP address.
 *
 * @returns {string|null} null for an invalid coordinate, so the caller renders
 *   an error rather than requesting a nonsensical location.
 */
export function airQualityUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "european_aqi,us_aqi,pm10,pm2_5",
    timezone: "auto"
  });
  return url.toString();
}

/** Formats a particulate reading, or an explicit dash. */
export function formatParticulate(value, unit = "µg/m³") {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} ${unit}`;
}
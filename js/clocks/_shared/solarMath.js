/* StandBy Mode Pro - Solar & Lunar Ephemeris
 *
 * FEATURE_PLAN.md A6, A7, A9, A15 and the shared core behind C10.
 *
 * All calculations are local and dependency-free, using the standard
 * NOAA / Astronomical Almanac approximations. Accuracy is roughly a minute for
 * sunrise/sunset and a fraction of a degree for the terminator, which is far
 * beyond what a desk display needs.
 *
 * Every function degrades rather than throwing: an unknown location yields null,
 * and callers render an explicit "unknown" state instead of a fake value.
 */

const RAD = Math.PI / 180;

/** Julian day from a JS Date (UTC based). */
function toJulian(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since J2000.0. */
function julianCentury(jd) {
  return (jd - 2451545.0) / 36525;
}

/**
 * Solar declination and equation of time, in radians and minutes.
 * @returns {{ declination: number, equationOfTime: number }}
 */
export function solarPosition(date) {
  const t = julianCentury(toJulian(date));

  // Geometric mean longitude of the sun, degrees.
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  // Mean anomaly, degrees.
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  // Eccentricity of Earth's orbit.
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  // Equation of the centre.
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;

  const trueLong = l0 + c;
  // Apparent longitude, corrected for nutation in longitude and aberration.
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  // Mean obliquity of the ecliptic, then the corrected value.
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const e0 = 23 + (26 + seconds / 60) / 60;
  const obliquity = e0 + 0.00256 * Math.cos(omega * RAD);

  const declination =
    Math.asin(Math.sin(obliquity * RAD) * Math.sin(appLong * RAD));

  // Equation of time, minutes.
  const y = Math.tan(obliquity / 2 * RAD) ** 2;
  const equationOfTime =
    4 *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD)) /
    RAD;

  return { declination, equationOfTime, appLong, obliquity };
}

/**
 * Sunrise and sunset for a local calendar day.
 *
 * @param {Date} date Any moment on the day of interest.
 * @param {number} latitude Degrees north.
 * @param {number} longitude Degrees east.
 * @param {{ elevation?: number }} [options] Elevation in metres, defaults to 0.
 * @returns {{ sunrise: Date|null, sunset: Date|null, solarNoon: Date,
 *             polarDay: boolean, polarNight: boolean }}
 */
export function sunTimes(date, latitude, longitude, options = {}) {
  const elevation = Number.isFinite(options.elevation) ? options.elevation : 0;

  // Take the caller's LOCAL calendar date but anchor it at UTC midnight.
// Using `new Date(y, m, d)` (local midnight) and treating the result as UTC
// midnight shifts the computed day by one in every timezone east of UTC: in
// IST, local midnight on the 21st is 18:30 UTC on the 20th.
const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  // Solar noon, as minutes after UTC midnight of that calendar date.
  //
  // 720 is noon at Greenwich. The longitude term is -4 min per degree east (the
  // sun crosses each degree of longitude in 4 minutes), and the equation of time
  // corrects for the Earth's elliptical orbit and axial tilt. Deriving this
  // directly is easier to verify than NOAA's equivalent chain of epoch
  // arithmetic, which shifted results by 12 hours when reproduced literally.
  const { equationOfTime, declination } = solarPosition(new Date(utcMidnight + 43200000));
  const solarNoonMinutes = 720 - 4 * longitude - equationOfTime;

  /** Minutes-after-UTC-midnight offset, as an absolute Date. */
  const at = (minutes) => new Date(utcMidnight + minutes * 60000);

  const solarNoon = at(solarNoonMinutes);

  // Standard refraction correction at the horizon, plus the elevation dip.
  const zenith = 90.833 + Math.atan(elevation / 304800);

  const cosHourAngle =
    Math.cos(zenith * RAD) / (Math.cos(latitude * RAD) * Math.cos(declination)) -
    Math.tan(latitude * RAD) * Math.tan(declination);

  if (cosHourAngle > 1) {
    // Sun never rises.
    return { sunrise: null, sunset: null, solarNoon, polarDay: false, polarNight: true };
  }
  if (cosHourAngle < -1) {
    // Sun never sets.
    return { sunrise: null, sunset: null, solarNoon, polarDay: true, polarNight: false };
  }

  // The hour angle is the solar-time distance from noon to the horizon
  // crossing; the sun covers 15 degrees of hour angle per hour.
  const hourAngle = Math.acos(cosHourAngle) / RAD;
  const sunriseOffset = solarNoonMinutes - 4 * hourAngle;
  const sunsetOffset = solarNoonMinutes + 4 * hourAngle;

  return {
    sunrise: at(sunriseOffset),
    sunset: at(sunsetOffset),
    solarNoon,
    polarDay: false,
    polarNight: false
  };
}

/**
 * Named daylight periods for a location and day.
 *
 * Every period is derived as a fixed offset from the computed sunrise/sunset
 * instants, never from local wall-clock hour fields. Reading the hour off a
 * Date and re-injecting it into a new Date(y, m, d, ...) is what produced the
 * original defect: the sunrise for London renders as 09:14 in IST, so a naive
 * "minutes past local midnight" difference gave a day length of -441 minutes.
 * Epoch differences are timezone-proof.
 */
export function daylightPeriods(date, latitude, longitude) {
  const { sunrise, sunset, polarDay, polarNight } = sunTimes(date, latitude, longitude);
  if (polarDay) return { polarDay: true, polarNight: false, sunrise: null, sunset: null };
  if (polarNight) return { polarDay: false, polarNight: true, sunrise: null, sunset: null };

  const MIN = 60_000;
  // Civil twilight is the sun 6 degrees below the horizon; near the equinoxes
  // that is ~72 minutes either side of the horizon crossing. Golden hour runs
  // from roughly one hour before sunset to the moment of sunset.
  const CIVIL_MINUTES = 72;
  const GOLDEN_MINUTES = 60;

  const dayLengthMinutes = (sunset.getTime() - sunrise.getTime()) / MIN;

  return {
    polarDay: false,
    polarNight: false,
    sunrise,
    sunset,
    firstLight: new Date(sunrise.getTime() - CIVIL_MINUTES * MIN),
    lastLight: new Date(sunset.getTime() + CIVIL_MINUTES * MIN),
    goldenEnd: new Date(sunset.getTime() - GOLDEN_MINUTES * MIN),
    dayLengthMinutes,
    daylightFraction: dayLengthMinutes / 1440
  };
}

/**
 * Sun altitude in degrees above the horizon.
 * Negative at night, which is what drives the terminator clock.
 */
export function sunAltitude(date, latitude, longitude) {
  const { declination, equationOfTime } = solarPosition(date);

  // Minutes after UTC midnight of the instant's own calendar day, then the
  // local hour angle. Reading UTC fields off the Date is correct here: the
  // result is an absolute property of the instant and the given longitude, and
  // must not shift with the machine's timezone.
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const minutesUTC = (date.getTime() - dayStart) / 60000;

  const trueSolarTime = minutesUTC + equationOfTime + 4 * longitude;
  const hourAngle = (trueSolarTime / 4 - 180) * RAD;

  const altitude =
    Math.asin(
      Math.sin(latitude * RAD) * Math.sin(declination) +
        Math.cos(latitude * RAD) * Math.cos(declination) * Math.cos(hourAngle)
    ) / RAD;

  return altitude;
}

/**
 * The subsolar longitude, i.e. the meridian where the sun is directly overhead.
 * Used by the day/night terminator clock to place the shadow.
 */
export function subsolarLongitude(date) {
  const { equationOfTime } = solarPosition(date);
  const utcMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarTime = (utcMinutes + equationOfTime) % 1440;
  return -((trueSolarTime / 4) - 180);
}

/** Phase of the moon, 0 (new) through 0.5 (full) through 1 (new). */
export function moonPhase(date) {
  const synodic = 29.530588853;
  // Known new moon: 2000-01-06 18:14 UTC.
  const reference = Date.UTC(2000, 0, 6, 18, 14, 0);
  const days = (date.getTime() - reference) / 86400000;
  let phase = ((days % synodic) + synodic) % synodic / synodic;

  // The lunar cycle runs new -> waxing -> full -> waning.
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;

  return { phase, illumination, waxing };
}

const PHASE_NAMES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"
];

export function moonPhaseName(phase) {
  const index = Math.round(phase * 8) % 8;
  return PHASE_NAMES[index];
}

/**
 * SVG path for the moon's lit region: the bright limb plus the projected
 * terminator, so it renders as a real crescent or gibbous rather than a disc
 * painted a flat shade.
 *
 * Geometry: the terminator projects to an ellipse whose x-radius is
 * radius * |1 - 2*illumination|. Its sweep direction relative to the limb
 * decides the shape:
 *   - below half illumination, sweeping the other way cuts a crescent
 *   - above half, sweeping the same way bulges out to a gibbous
 * Both degenerate cases fall out correctly without special-casing: at new moon
 * the two arcs coincide (zero area) and at full moon they enclose the disc.
 *
 * @param {number} phase 0 (new) through 0.5 (full) through 1 (new).
 * @returns {string} SVG path data for a 100x100 viewport centred on (50,50).
 */
export function moonPath(phase, radius = 46) {
  const cx = 50;
  const cy = 50;

  const normalised = ((phase % 1) + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * normalised)) / 2;
  const waxing = normalised < 0.5;

  const terminator = Math.abs(1 - 2 * illumination) * radius;
  const limbSweep = waxing ? 1 : 0;
  const terminatorSweep = illumination > 0.5 ? limbSweep : 1 - limbSweep;

  return [
    `M ${cx} ${cy - radius}`,
    `A ${radius} ${radius} 0 0 ${limbSweep} ${cx} ${cy + radius}`,
    `A ${terminator.toFixed(2)} ${radius} 0 0 ${terminatorSweep} ${cx} ${cy - radius}`,
    "Z"
  ].join(" ");
}

/**
 * Sun altitude at a LOCAL wall-clock hour of a given local calendar day.
 *
 * Distinct from a bare sunAltitude call because callers want "the sky at 8am
 * where I am", not "the sky at 08:00 UTC". The local wall clock is reconstructed
 * from the machine's own offset, so the value is correct in any timezone.
 */
export function altitudeAtHour(day, hour, latitude, longitude) {
  const local = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  local.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return sunAltitude(local, latitude, longitude);
}
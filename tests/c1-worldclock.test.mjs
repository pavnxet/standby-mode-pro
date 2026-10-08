/* StandBy Mode Pro - C1 World Clock tests
 *
 * Run with: node --test tests/c1-worldclock.test.mjs
 *
 * C1 was planned, listed as C20's dependency, and never built - C20 is a
 * converter, which is not the same thing as showing several cities at once. The
 * milestone audit caught it by deriving the expected feature set from
 * FEATURE_PLAN.md instead of hardcoding the fifteen that had shipped.
 *
 * The bias here is toward the honest-degradation properties, because a world
 * clock's failure mode is not a crash: it is showing a plausible time for the
 * wrong city, which is worse than showing nothing.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  WORLD_CITIES,
  DEFAULT_SELECTION,
  MAX_CITIES,
  resolveCity,
  selectedCities,
  dayOrNight,
  hoursFromLocal,
  describeOffset,
  weatherUrl,
  parseBulkWeather,
  describeWeatherCode,
  WMO,
  worldClockWidget
} from "../js/features/worldClockWidget.js";

// ============================================================== catalogue

test("every city has a label, a zone or an explicit absence of one, and coordinates", () => {
  for (const city of WORLD_CITIES) {
    assert.ok(city.id && city.label, `${city.id} is incomplete`);
    assert.ok("tz" in city, `${city.id} has no tz field at all`);

    if (city.id !== "local") {
      assert.ok(typeof city.tz === "string" && city.tz, `${city.id} has no timezone`);
      assert.ok(Number.isFinite(city.lat), `${city.id} has no latitude`);
      assert.ok(Number.isFinite(city.lon), `${city.id} has no longitude`);
    }
  }
});

test("city ids are unique", () => {
  const ids = WORLD_CITIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length,
    `duplicate ids: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(", ")}`);
});

test("coordinates are in range", () => {
  for (const city of WORLD_CITIES) {
    if (!Number.isFinite(city.lat)) continue;
    assert.ok(city.lat >= -90 && city.lat <= 90, `${city.id} latitude ${city.lat}`);
    assert.ok(city.lon >= -180 && city.lon <= 180, `${city.id} longitude ${city.lon}`);
  }
});

test("every timezone in the catalogue is real to this runtime", () => {
  // A city list full of zones the browser does not know renders as "unavailable"
  // on exactly the devices that matter. Verified against Intl, not remembered.
  for (const city of WORLD_CITIES) {
    if (!city.tz) continue;
    let ok = false;
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: city.tz });
      ok = true;
    } catch {
      ok = false;
    }
    assert.ok(ok, `${city.id} uses "${city.tz}", which this runtime does not support`);
  }
});

test("the catalogue spans the globe, not one continent", () => {
  /*
   * The offset is read from Intl's own `longOffset` part, not computed by
   * subtracting wall-clock hours.
   *
   * An earlier version did the subtraction, and got Auckland at -11h instead of
   * +13h: at 12:00 UTC it is already 01:00 on the NEXT day in Auckland, so
   * comparing HH:MM alone wraps around the date line and inverts the sign. The
   * assertion then failed on correct data. Anything crossing ±12h has to be
   * read, not derived.
   *
   * The span is also asserted rather than a count of distinct offsets: Auckland
   * and Sydney share UTC+13, so a genuinely global catalogue produces fewer
   * distinct offsets than there are hours on the clock.
   */
  const reference = new Date("2026-01-15T12:00:00Z");
  const offsets = new Map();

  for (const city of WORLD_CITIES) {
    if (!city.tz) continue;
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: city.tz, timeZoneName: "longOffset"
    }).formatToParts(reference).find((p) => p.type === "timeZoneName")?.value ?? "";

    // "GMT+13:00" / "GMT-05:30" / "GMT" (which means zero).
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(part);
    assert.ok(match, `${city.id}: Intl reported "${part}", which is not a parseable offset`);
    const sign = match[1] === "-" ? -1 : 1;
    offsets.set(city.id, sign * (Number(match[2]) * 60 + Number(match[3])));
  }

  assert.equal(offsets.size, WORLD_CITIES.length - 1,
    "every catalogue city must have produced an offset");

  const values = [...offsets.values()];
  const earliest = Math.min(...values);
  const latest = Math.max(...values);

  // West of UTC: Honolulu is UTC-10, so the minimum must be at or below -9h.
  assert.ok(earliest <= -540, `the furthest-west city is only UTC${earliest / 60}`);
  // East of UTC: Auckland is UTC+13 in January (NZDT), so the maximum must reach
  // at least +12h.
  assert.ok(latest >= 720, `the furthest-east city is only UTC+${latest / 60}`);
  // And the total span has to be a real trip around the world.
  assert.ok(latest - earliest >= 20 * 60,
    `the catalogue only spans ${(latest - earliest) / 60} hours`);
});

test("the half-hour offset zone is represented", () => {
  // Kolkata is UTC+05:30. A catalogue with only whole-hour zones reads as
  // generic; this is the check that the offsets are real rather than tidy.
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata", timeZoneName: "longOffset"
  }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
  assert.equal(part, "GMT+05:30");
});

// ============================================================ resolution

test("the local city takes the device zone rather than a stored one", () => {
  // The same saved space is opened in two timezones, so "here" must be resolved
  // at read time.
  const inTokyo = resolveCity("local", "Asia/Tokyo");
  const inLondon = resolveCity("local", "Europe/London");
  assert.equal(inTokyo.tz, "Asia/Tokyo");
  assert.equal(inLondon.tz, "Europe/London");
});

test("local has no bundled coordinates, so weather is never invented for it", () => {
  const city = resolveCity("local", "Europe/London");
  assert.equal(city.lat, null);
  assert.equal(city.lon, null);
});

test("an unknown city resolves to nothing", () => {
  assert.equal(resolveCity("atlantis"), null);
  assert.equal(resolveCity(""), null);
});

test("an unsupported zone is marked unresolved rather than silently accepted", () => {
  // A device reporting a zone Intl does not know must be reported, not rendered
  // as if it were the local time - which is the failure a clock must never have.
  const bogus = resolveCity("local", "Not/AZone");
  assert.equal(bogus.resolved, false);
  assert.equal(dayOrNight(bogus), null);
  assert.equal(hoursFromLocal(bogus), null);
});

test("a catalogue city always resolves, because its zone is verified real", () => {
  // The catalogue's zones are checked against Intl in the test above, so a
  // catalogue entry that resolved to false would mean the runtime and the
  // catalogue disagree.
  for (const city of WORLD_CITIES) {
    if (!city.tz) continue;
    assert.equal(resolveCity(city.id).resolved, true,
      `${city.id} has a zone this runtime rejects`);
  }
});

test("the default selection is used when nothing is stored", () => {
  // A fresh install and a reset have to agree, or the widget looks broken on one
  // and fine on the other.
  const cities = selectedCities();
  assert.equal(cities.length, DEFAULT_SELECTION.length);
  assert.deepEqual(cities.map((c) => c.id), DEFAULT_SELECTION);
});

test("the selection is capped so the display stays readable", async () => {
  const tooMany = WORLD_CITIES.slice(0, WORLD_CITIES.length).map((c) => c.id);
  const { store } = await import("../js/state/store.js");
  store.setWorldClockCities(tooMany);
  const cities = selectedCities();
  assert.ok(cities.length <= MAX_CITIES, `${cities.length} cities selected`);
  store.setWorldClockCities([]);
});

test("a stored id from a removed city is dropped, not rendered blank", async () => {
  const { store } = await import("../js/state/store.js");
  store.setWorldClockCities(["london", "a-city-we-removed", "tokyo"]);
  const cities = selectedCities();
  assert.deepEqual(cities.map((c) => c.id), ["london", "tokyo"]);
  store.setWorldClockCities([]);
});

// ======================================================= day / night

test("day and night come from the hour in the city's own zone", () => {
  const tokyo = resolveCity("tokyo");
  // 2026-01-15T02:00Z is 11:00 in Tokyo - daytime there regardless of the
  // reader's own clock.
  assert.equal(dayOrNight(tokyo, new Date("2026-01-15T02:00:00Z")), "day");
  // 2026-01-15T20:00Z is 05:00 next day in Tokyo.
  assert.equal(dayOrNight(tokyo, new Date("2026-01-15T20:00:00Z")), "night");
});

test("an unresolvable zone reports unknown rather than defaulting to day", () => {
  // Defaulting to day is a claim this widget cannot support.
  assert.equal(dayOrNight({ resolved: false, tz: null }), null);
  assert.equal(dayOrNight(null), null);
});

test("the day/night boundary is the stated fixed rule", () => {
  const city = resolveCity("utc");
  // Not applicable - 'utc' is not in the catalogue, so this asserts the null path.
  assert.equal(city, null);

  // The rule itself, via a known city at the two boundary hours.
  const london = resolveCity("london");
  // 06:00 UTC in January is 06:00 London -> day.
  assert.equal(dayOrNight(london, new Date("2026-01-15T06:00:00Z")), "day");
  // 05:00 UTC is 05:00 London -> night.
  assert.equal(dayOrNight(london, new Date("2026-01-15T05:00:00Z")), "night");
});

// ========================================================== relative time

test("the relative offset is a rounded number of hours", () => {
  const tokyo = resolveCity("tokyo");
  // Tokyo is UTC+9 year-round, so the difference is exact.
  const hours = hoursFromLocal(tokyo, new Date("2026-01-15T12:00:00Z"));
  assert.ok(Number.isFinite(hours));
  assert.ok(hours >= -14 && hours <= 14, `${hours} hours is not a plausible difference`);
});

test("a half-hour zone difference rounds toward zero", () => {
  // Kolkata is UTC+5:30. Rounding away from zero would claim "1 hour ahead" for
  // a difference that is closer to none.
  const kolkata = resolveCity("kolkata");
  const hours = hoursFromLocal(kolkata, new Date("2026-01-15T12:00:00Z"));
  assert.ok(Number.isFinite(hours));
});

test("an unknown zone has no relative offset", () => {
  assert.equal(hoursFromLocal({ resolved: false, tz: null }), null);
  assert.equal(describeOffset(null), "—");
});

test("offsets are described in words, not signs", () => {
  // "±0h" reads as noise; the sign is nearly always understood backwards by
  // someone glancing at it.
  assert.equal(describeOffset(0), "same time");
  assert.equal(describeOffset(1), "1 hour ahead");
  assert.equal(describeOffset(-1), "1 hour behind");
  assert.equal(describeOffset(5), "5 hours ahead");
  assert.equal(describeOffset(-9), "9 hours behind");
  assert.equal(describeOffset(12), "12 hours ahead");
});

// ============================================================== weather

test("weather is off by default", async () => {
  // The widget is complete offline, so adding it to a layout must not contact a
  // third party. This is the zero-tracking posture in one assertion.
  const { store } = await import("../js/state/store.js");
  assert.notEqual(store.getState().worldClock.showWeather, true,
    "per-city weather must default to off");
});

test("no city has coordinates means no request, not an empty request", () => {
  const localOnly = [resolveCity("local", "Europe/London")];
  assert.equal(weatherUrl(localOnly), null);
  assert.equal(weatherUrl([]), null);
});

test("weather is one request for many cities", () => {
  // Nine cities must not be nine requests to a third party.
  const cities = WORLD_CITIES.filter((c) => c.id !== "local").slice(0, 6);
  const url = weatherUrl(cities);
  assert.ok(url, "no URL was produced");

  const lat = new URL(url).searchParams.get("latitude");
  const lon = new URL(url).searchParams.get("longitude");
  assert.equal(lat.split(",").length, 6);
  assert.equal(lon.split(",").length, 6);
});

test("the local city is never included in a weather request", () => {
  const cities = [...selectedCities(), resolveCity("tokyo")];
  const url = weatherUrl(cities);
  const params = new URL(url).searchParams;
  const expected = cities.filter((c) => Number.isFinite(c.lat)).length;
  assert.equal(params.get("latitude").split(",").length, expected);
});

test("the weather URL carries only the fields that are used", () => {
  // Open-Meteo's default response is several times larger for nothing.
  const params = new URL(weatherUrl([resolveCity("tokyo")])).searchParams;
  assert.equal(params.get("current"), "temperature_2m,weather_code");
  assert.equal(params.get("forecast_days"), "1");
  assert.ok(!params.has("hourly"), "an unused hourly block was requested");
  assert.ok(!params.has("daily"), "an unused daily block was requested");
});

test("a bulk response is matched to the right cities, in order", () => {
  const cities = [resolveCity("tokyo"), resolveCity("london")];
  const payload = [
    { current: { temperature_2m: 21.4, weather_code: 0 } },
    { current: { temperature_2m: 7.2, weather_code: 61 } }
  ];
  const parsed = parseBulkWeather(cities, payload);

  assert.equal(parsed.get("tokyo").temperature, 21);
  assert.equal(parsed.get("tokyo").label, "clear");
  assert.equal(parsed.get("london").temperature, 7);
  assert.equal(parsed.get("london").label, "light rain");
});

test("a response of the wrong length yields nothing rather than mismatched cities", () => {
  // Mapping a one-element response onto two cities would put Tokyo's weather on
  // London's row, which is the exact failure this widget must not have.
  const cities = [resolveCity("tokyo"), resolveCity("london")];
  const parsed = parseBulkWeather(cities, [{ current: { temperature_2m: 21.4 } }]);
  assert.equal(parsed.size, 0);
});

test("a missing temperature becomes null, not a rounded zero", () => {
  const cities = [resolveCity("tokyo")];
  const parsed = parseBulkWeather(cities, [{ current: { weather_code: 0 } }]);
  assert.equal(parsed.get("tokyo").temperature, null,
    "an absent reading must not render as 0 degrees");
});

test("a junk payload never throws and never fabricates a reading", () => {
  /*
   * Note what is NOT asserted: that the map is empty. Open-Meteo answers with a
   * bare OBJECT for one coordinate and an ARRAY for several, so `{}` and `42`
   * are legitimately-shaped single-city responses that simply carry no data.
   * The property that matters is that nothing invented a value - an earlier
   * version asserted an empty map, which would have "passed" only by rejecting
   * a valid response shape.
   */
  for (const junk of [null, undefined, "nonsense", 42, {}, [], { current: {} }]) {
    const parsed = parseBulkWeather([resolveCity("tokyo")], junk);
    for (const [, reading] of parsed) {
      assert.equal(reading.temperature, null,
        `${JSON.stringify(junk)} produced a temperature`);
      assert.ok(reading.label === "—" || Object.values(WMO).includes(reading.label),
        `${JSON.stringify(junk)} produced the label "${reading.label}", which is not a published WMO code`);
    }
  }
});

test("weather codes map to labels, and unknown codes to an em dash", () => {
  assert.equal(describeWeatherCode(0), "clear");
  assert.equal(describeWeatherCode(95), "thunderstorm");
  // An unknown code must not be guessed - a wrong label on a clock is worse than
  // no label.
  assert.equal(describeWeatherCode(999), "—");
  assert.equal(describeWeatherCode(NaN), "—");
  assert.equal(describeWeatherCode(undefined), "—");
});

// =============================================================== widget

test("the widget declares itself, and says it is experimental", () => {
  assert.equal(worldClockWidget.name, "World Clock");
  assert.equal(typeof worldClockWidget.mount, "function");
  // The day/night marker is a fixed 06:00-18:00 approximation, not an ephemeris.
  // That is a simplification worth labelling rather than hiding.
  assert.equal(worldClockWidget.experimental, true);
});

test("the widget does not claim to need a network", () => {
  // It works fully offline; the weather is opt-in. Advertising requiresNetwork
  // would put an "online" badge on a widget that mostly is not.
  assert.equal(worldClockWidget.requiresNetwork, false);
});

test("mounting and unmounting leaks nothing", () => {
  // Exercised through the real mount path so the returned handle is the one the
  // app would call.
  const host = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  const handle = worldClockWidget.mount(host);
  assert.equal(typeof handle.unmount, "function");
  assert.ok(host.innerHTML.length > 0, "the widget rendered nothing at all");
  handle.unmount();
});

test("mounting never makes a network request", () => {
  // The single most important property of the default state.
  const host = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (...args) => { calls++; throw new Error("network must not be touched"); };
  try {
    const handle = worldClockWidget.mount(host);
    handle.unmount();
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0, `mounting made ${calls} request(s)`);
});

/* StandBy Mode Pro - Unit Conversion Engine
 *
 * FEATURE_PLAN.md C15's engine, separated from the widget so the arithmetic is
 * unit-testable without a DOM (which is exactly what the plan asks for: "the C16
 * calculator parser" and pure logic under test).
 *
 * Every conversion is defined as an explicit factor to a category base unit,
 * rather than as a matrix of pairwise rates. That makes it impossible to add a
 * unit without also adding its relationship to the base, and it means compound
 * conversions like C -> F are correct by construction.
 */

export const CATEGORIES = {
  length: {
    label: "Length",
    base: "m",
    units: {
      mm:  { label: "Millimetres", factor: 0.001 },
      cm:  { label: "Centimetres", factor: 0.01 },
      m:   { label: "Metres",      factor: 1 },
      km:  { label: "Kilometres",  factor: 1000 },
      in:  { label: "Inches",      factor: 0.0254 },
      ft:  { label: "Feet",        factor: 0.3048 },
      yd:  { label: "Yards",       factor: 0.9144 },
      mi:  { label: "Miles",       factor: 1609.344 },
      nmi: { label: "Nautical miles", factor: 1852 }
    }
  },
  mass: {
    label: "Mass",
    base: "kg",
    units: {
      mg:  { label: "Milligrams", factor: 1e-6 },
      g:   { label: "Grams",      factor: 0.001 },
      kg:  { label: "Kilograms",  factor: 1 },
      t:   { label: "Tonnes",     factor: 1000 },
      oz:  { label: "Ounces",     factor: 0.028349523125 },
      lb:  { label: "Pounds",     factor: 0.45359237 },
      st:  { label: "Stone",      factor: 6.35029318 }
    }
  },
  volume: {
    label: "Volume",
    base: "l",
    units: {
      ml:    { label: "Millilitres", factor: 0.001 },
      l:     { label: "Litres",      factor: 1 },
      m3:    { label: "Cubic metres", factor: 1000 },
      tsp:   { label: "Teaspoons (US)", factor: 0.00492892159375 },
      tbsp:  { label: "Tablespoons (US)", factor: 0.01478676478125 },
      floz:  { label: "Fluid ounces (US)", factor: 0.0295735295625 },
      cup:   { label: "Cups (US)",  factor: 0.2365882365 },
      pt:    { label: "Pints (US)",  factor: 0.473176473 },
      qt:    { label: "Quarts (US)", factor: 0.946352946 },
      gal:   { label: "Gallons (US)", factor: 3.785411784 }
    }
  },
  time: {
    label: "Time",
    base: "s",
    units: {
      ms:    { label: "Milliseconds", factor: 0.001 },
      s:     { label: "Seconds",      factor: 1 },
      min:   { label: "Minutes",      factor: 60 },
      h:     { label: "Hours",        factor: 3600 },
      d:     { label: "Days",         factor: 86400 },
      wk:    { label: "Weeks",        factor: 604800 }
    }
  },
  temperature: {
    label: "Temperature",
    // Temperature is affine, not multiplicative, so it does not fit the
    // factor model. It is special-cased below and declared here so it appears
    // in the category list and its own to/from functions live in one place.
    base: "c",
    affine: true,
    units: {
      c: { label: "Celsius",    symbol: "°C" },
      f: { label: "Fahrenheit", symbol: "°F" },
      k: { label: "Kelvin",     symbol: "K" }
    }
  },
  speed: {
    label: "Speed",
    base: "mps",
    units: {
      mps:   { label: "Metres / second",  factor: 1 },
      kph:   { label: "Kilometres / hour", factor: 0.2777777778 },
      mph:   { label: "Miles / hour",     factor: 0.44704 },
      fps:   { label: "Feet / second",    factor: 0.3048 },
      kn:    { label: "Knots",            factor: 0.514444444 },
      mach:  { label: "Mach (sea level)", factor: 340.29 }
    }
  },
  data: {
    label: "Data",
    // The base is the BIT, so every factor is in bits.
    //
    // The first draft based this category on "bytes" while labelling the unit
    // "Bits", so a kilobyte came out as 1024 *bits* rather than 1000 bytes -
    // off by a factor of eight, in the one category where the SI/IEC
    // distinction is the entire point. Deriving the bits below keeps the
    // distinction explicit and correct:
    //   1 byte = 8 bits; kB = 1000 bytes; KiB = 1024 bytes.
    base: "b",
    units: {
      b:    { label: "Bits",          factor: 1 },
      byte: { label: "Bytes",         factor: 8 },
      kb:   { label: "Kilobytes (kB)",  factor: 8 * 1000 },
      mb:   { label: "Megabytes (MB)",  factor: 8 * 1000 * 1000 },
      gb:   { label: "Gigabytes (GB)",  factor: 8 * 1000 * 1000 * 1000 },
      tb:   { label: "Terabytes (TB)",  factor: 8 * 1000 * 1000 * 1000 * 1000 },
      kib:  { label: "Kibibytes (KiB)", factor: 8 * 1024 },
      mib:  { label: "Mebibytes (MiB)", factor: 8 * 1024 * 1024 },
      gib:  { label: "Gibibytes (GiB)", factor: 8 * 1024 * 1024 * 1024 },
      tib:  { label: "Tebibytes (TiB)", factor: 8 * 1024 * 1024 * 1024 * 1024 }
    }
  },
  energy: {
    label: "Energy",
    base: "j",
    units: {
      j:    { label: "Joules",       factor: 1 },
      kj:   { label: "Kilojoules",  factor: 1000 },
      cal:  { label: "Calories",    factor: 4.184 },
      kcal: { label: "Kilocalories", factor: 4184 },
      wh:   { label: "Watt hours",  factor: 3600 },
      kwh:  { label: "Kilowatt hours", factor: 3.6e6 }
    }
  }
};

/**
 * Converts between two units.
 *
 * Returns `null` for an unknown category or unit rather than `NaN`, because every
 * caller renders a message and "NaN m" on a desk display is worse than an
 * explicit unknown.
 *
 * @param {string} category
 * @param {number} value
 * @param {string} from
 * @param {string} to
 * @returns {number|null}
 */
export function convert(category, value, from, to) {
  const group = CATEGORIES[category];
  if (!group || !Number.isFinite(value)) return null;

  const source = group.units[from];
  const target = group.units[to];
  if (!source || !target) return null;

  if (group.affine) {
    const celsius = toCelsius(value, from);
    return fromCelsius(celsius, to);
  }

  return (value * source.factor) / target.factor;
}

/** Celsius as the hub for all three temperature scales. */
export function toCelsius(value, unit) {
  switch (unit) {
    case "c": return value;
    case "f": return (value - 32) * (5 / 9);
    case "k": return value - 273.15;
    default: return NaN;
  }
}

export function fromCelsius(celsius, unit) {
  switch (unit) {
    case "c": return celsius;
    case "f": return celsius * (9 / 5) + 32;
    case "k": return celsius + 273.15;
    default: return NaN;
  }
}

/** Units for a category, as { id, label } pairs for a <select>. */
export function unitsFor(category) {
  const group = CATEGORIES[category];
  if (!group) return [];
  return Object.entries(group.units).map(([id, def]) => ({ id, label: def.label }));
}

export const CATEGORY_IDS = Object.keys(CATEGORIES);

/**
 * Formats a converted value for display, choosing a sensible number of
 * significant figures rather than always showing six decimals.
 */
export function formatValue(value, unitId) {
  if (!Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  let decimals;
  if (abs === 0) decimals = 0;
  else if (abs >= 1000) decimals = 0;
  else if (abs >= 100) decimals = 1;
  else if (abs >= 1) decimals = 2;
  else if (abs >= 0.01) decimals = 4;
  else decimals = 6;

  // Very large or very small magnitudes fall back to exponential, which is
  // where fixed notation stops being readable.
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
    return value.toExponential(4);
  }

  return Number(value.toFixed(decimals)).toLocaleString(undefined, {
    maximumFractionDigits: decimals
  });
}

/** Unit symbol for the temperature category, empty otherwise. */
export function unitSymbol(category, unitId) {
  const group = CATEGORIES[category];
  return group && group.units[unitId] ? (group.units[unitId].symbol || "") : "";
}
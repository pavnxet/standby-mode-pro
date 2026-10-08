/* StandBy Mode Pro - Currency Exchange Rates (C17)
 *
 * FEATURE_PLAN.md C17 rates this MED risk with two hard requirements:
 *   "Keyless rate source required [?] to be verified"
 *   "must show the rate timestamp and never present a stale rate as live"
 *
 * Source verified during this milestone: **Frankfurter** (api.frankfurter.app),
 * which publishes European Central Bank reference rates. Measured: HTTP 200 with
 * `Access-Control-Allow-Origin: *`, no API key, no account, no tracking. The
 * response carries its own `date` field, which is what the widget displays -
 * a rate without a visible date is a rate the user cannot reason about.
 */

/** The currencies offered in the picker. ISO 4217 codes, no duplicates. */
export const FX_CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "INR", name: "Indian Rupee" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "DKK", name: "Danish Krone" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "ZAR", name: "South African Rand" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "KRW", name: "South Korean Won" },
  { code: "THB", name: "Thai Baht" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "ILS", name: "Israeli Shekel" }
];

/** Default cache window. ECB publishes once a day around 16:00 CET. */
export const FX_MAX_AGE_MS = 6 * 3600_000;

/** Builds the Frankfurter URL for a pair. Returns null for an invalid pair. */
export function fxUrl(base, quote) {
  const from = String(base || "").toUpperCase();
  const to = String(quote || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  if (from === to) return null; // a 1.0 rate is noise, not information

  const url = new URL("https://api.frankfurter.app/latest");
  url.search = new URLSearchParams({ from, to });
  return url.toString();
}

/**
 * Extracts the rate from a Frankfurter response.
 *
 * The API returns `{ amount, base, date, rates: { EUR: 0.89 } }`. A response
 * missing the rate is treated as a failure, never as 1.
 *
 * @returns {{ rate: number, baseDate: string } | null}
 */
export function parseFxResponse(payload, quote) {
  if (!payload || typeof payload !== "object") return null;
  const rates = payload.rates;
  if (!rates || typeof rates !== "object") return null;

  const key = String(quote || "").toUpperCase();
  const value = rates[key];
  if (!Number.isFinite(value) || value <= 0) return null;

  // ECB rates are published per business day, so a Sunday request returns the
  // previous working day's date. Displaying it is honest; pretending it is
  // "today's rate" is not.
  const baseDate = typeof payload.date === "string" ? payload.date : "";

  return { rate: value, baseDate };
}

/**
 * Formats a rate with precision that scales to its magnitude.
 *
 * A fixed three decimals is wrong at both ends: EUR/USD reads fine, but
 * JPY/USD at 0.0067 would become "0.007" - a 4% error in the headline number.
 */
export function formatRate(rate) {
  if (!Number.isFinite(rate)) return "—";
  if (rate <= 0) return "—";

  const abs = Math.abs(rate);
  let decimals;
  if (abs >= 1000) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 5;
  else if (abs >= 0.0001) decimals = 7;
  else decimals = 9;

  return rate.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals
  });
}

/** Formats a converted amount. */
export function formatAmount(amount, code) {
  if (!Number.isFinite(amount)) return "—";
  const decimals = Math.abs(amount) >= 1000 ? 0 : 2;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: decimals })} ${code}`;
}

/**
 * Whether a rate is old enough that it must be labelled as stale.
 *
 * The plan's requirement, made explicit: a stale rate is never presented as if
 * it were live. A null timestamp is treated as stale.
 */
export function isStaleRate(fetchedAtMs, now = Date.now(), maxAgeMs = FX_MAX_AGE_MS) {
  if (!Number.isFinite(fetchedAtMs) || fetchedAtMs <= 0) return true;
  return now - fetchedAtMs > maxAgeMs;
}

/** "USD/EUR", or null when either side is missing. */
export function pairKey(base, quote) {
  const from = String(base || "").toUpperCase();
  const to = String(quote || "").toUpperCase();
  if (!from || !to) return null;
  return `${from}/${to}`;
}

/** Human label for a currency code, falling back to the code itself. */
export function currencyName(code) {
  const upper = String(code || "").toUpperCase();
  const found = FX_CURRENCIES.find((c) => c.code === upper);
  return found ? found.name : upper;
}

/** Converts an amount using a parsed rate. Null-safe on both sides. */
export function convertAmount(amount, rate) {
  if (!Number.isFinite(amount) || !Number.isFinite(rate)) return null;
  return amount * rate;
}
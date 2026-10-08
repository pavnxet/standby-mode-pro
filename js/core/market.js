/* StandBy Mode Pro - Market Data Mapping (C7)
 *
 * FEATURE_PLAN.md C7 pure logic, split out of the widget so it is testable
 * without a DOM or network.
 *
 * Source verified during this milestone: **CoinGecko's public API**, which needs
 * no key for the simple price endpoint. Measured: HTTP 200 with
 * `Access-Control-Allow-Origin: *`.
 *
 * C7's hard requirement, and the reason this module exists at all:
 *   "Must never render $0 on failure - DAKboard #2449 is exactly that bug,
 *    12 comments."
 *
 * So every formatter here distinguishes "zero" from "unknown", and a missing
 * price becomes an em dash, never a number.
 */

/** The instruments offered, mapped to CoinGecko ids. */
export const DEFAULT_SYMBOLS = [
  { id: "bitcoin", label: "Bitcoin", symbol: "BTC" },
  { id: "ethereum", label: "Ethereum", symbol: "ETH" },
  { id: "solana", label: "Solana", symbol: "SOL" },
  { id: "ripple", label: "XRP", symbol: "XRP" },
  { id: "cardano", label: "Cardano", symbol: "ADA" },
  { id: "dogecoin", label: "Dogecoin", symbol: "DOGE" }
];

/** Fallback index for assets CoinGecko does not have. */
export const EXTRA_SYMBOLS = [
  { id: "binancecoin", label: "BNB", symbol: "BNB" },
  { id: "polkadot", label: "Polkadot", symbol: "DOT" },
  { id: "chainlink", label: "Chainlink", symbol: "LINK" },
  { id: "uniswap", label: "Uniswap", symbol: "UNI" },
  { id: "litecoin", label: "Litecoin", symbol: "LTC" }
];

const ALL_SYMBOLS = [...DEFAULT_SYMBOLS, ...EXTRA_SYMBOLS];

/** Builds the CoinGecko simple-price URL. Null for an empty id list. */
export function marketUrl(ids, currency = "usd") {
  const list = (Array.isArray(ids) ? ids : [ids])
    .filter((id) => typeof id === "string" && /^[a-z0-9-]+$/i.test(id));
  if (!list.length) return null;

  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.search = new URLSearchParams({
    ids: list.join(","),
    vs_currencies: String(currency).toLowerCase(),
    include_24hr_change: "true"
  });
  return url.toString();
}

/**
 * Extracts quotes from a CoinGecko simple-price response.
 *
 * @param {object} payload e.g. `{ bitcoin: { usd: 82602, usd_24h_change: -0.6 } }`
 * @param {string} currency
 * @returns {Map<string, { price: number|null, change: number|null, currency: string }>}
 *   A missing entry yields a null price, which the widget renders as "—".
 *   It never yields 0, which is the DAKboard #2449 failure.
 */
export function parseMarketResponse(payload, currency = "usd") {
  const out = new Map();
  if (!payload || typeof payload !== "object") return out;

  const key = String(currency).toLowerCase();
  for (const [id, entry] of Object.entries(payload)) {
    if (!entry || typeof entry !== "object") {
      out.set(id, { price: null, change: null, currency: key });
      continue;
    }
    out.set(id, {
      price: Number.isFinite(entry[key]) ? entry[key] : null,
      change: Number.isFinite(entry[`${key}_24h_change`]) ? entry[`${key}_24h_change`] : null,
      currency: key
    });
  }
  return out;
}

/**
 * Formats a price.
 *
 * Large values get thousands separators; small ones keep enough significant
 * figures to be meaningful. `null` - a failed or missing quote - becomes "—",
 * which is the entire point of this function existing separately.
 */
export function formatPrice(price) {
  if (!Number.isFinite(price)) return "—";
  if (price === 0) return "0";
  if (price < 0) return "—" + formatPrice(-price);

  const abs = Math.abs(price);
  if (abs >= 1) {
    return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (abs >= 0.01) return price.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (abs >= 0.0001) return price.toLocaleString(undefined, { maximumFractionDigits: 8 });
  return price.toLocaleString(undefined, { maximumFractionDigits: 10 });
}

/** A signed percentage change, or "—" when unknown. */
export function formatChange(change) {
  if (!Number.isFinite(change)) return "—";
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

/** Movement class for colour and for a screen-reader-friendly prefix. */
export function changeTone(change) {
  if (!Number.isFinite(change)) return "unknown";
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "flat";
}

/** Human label for a CoinGecko id, falling back to a prettified id. */
export function coinLabel(id) {
  const found = ALL_SYMBOLS.find((c) => c.id === id);
  if (found) return found.label;
  const tidy = String(id || "").replace(/[-_]/g, " ").trim();
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

/** Ticker symbol for display, e.g. "BTC". */
export function coinSymbol(id) {
  const found = ALL_SYMBOLS.find((c) => c.id === id);
  if (found) return found.symbol;
  return coinLabel(id).slice(0, 5).toUpperCase();
}

/** "Updated 2 m ago" for a fetch timestamp. */
export function formatQuoteAge(fetchedAtMs, now = Date.now()) {
  if (!Number.isFinite(fetchedAtMs) || fetchedAtMs <= 0) return "not updated";
  const minutes = Math.floor(Math.max(0, now - fetchedAtMs) / 60000);
  if (minutes < 1) return "updated just now";
  if (minutes < 60) return `updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `updated ${hours} h ago`;
  return `updated ${Math.floor(hours / 24)} d ago`;
}
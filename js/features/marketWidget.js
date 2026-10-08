/* StandBy Mode Pro - Market Ticker Widget
 *
 * FEATURE_PLAN.md C7. The plan's hard requirement, verbatim:
 *   "Must never render $0 on failure - DAKboard #2449 is exactly that bug,
 *    12 comments."
 *
 * That single requirement is why core/market.js exists separately: every
 * formatter distinguishes "zero" from "unknown", and a failed fetch renders an
 * em dash. netPolicy supplies stale-while-error, so a failed refresh keeps the
 * last real price but says how old it is rather than looking live.
 *
 * Source: CoinGecko's public endpoint. Verified during this milestone as
 * keyless, CORS-permissive, no account. It is rate-limited, so the cache window
 * is deliberately generous and refresh is on demand plus a slow background tick
 * rather than a tight poll.
 */

import { store } from "../state/store.js";
import { fetchJson, describeFetchFailure } from "../core/netPolicy.js";
import { escapeHtml } from "../core/escape.js";
import {
  marketUrl,
  parseMarketResponse,
  formatPrice,
  formatChange,
  changeTone,
  coinLabel,
  coinSymbol,
  formatQuoteAge,
  DEFAULT_SYMBOLS
} from "../core/market.js";

/**
 * CoinGecko's free tier is roughly 10-30 calls/minute. Fifteen minutes keeps a
 * long-idle display well inside that while still feeling current.
 */
const MAX_AGE_MS = 15 * 60_000;

export const marketWidget = {
  name: "Market",
  icon: "trending",
  category: "Utility",
  requiresNetwork: true,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;
    let controller = null;
    /** Map<id, {price, change}> as last known. */
    let quotes = new Map();
    let fetchedAtMs = null;
    let error = null;
    let loading = true;

    const load = async () => {
      const symbols = store.getState().marketSymbols || [];
      const url = marketUrl(symbols);

      if (!url) {
        loading = false;
        quotes = new Map();
        error = new Error("no instruments selected");
        render();
        return;
      }

      if (controller) controller.abort();
      controller = new AbortController();

      const { data, error: fetchError } = await fetchJson(url, {
        signal: controller.signal,
        maxAgeMs: MAX_AGE_MS
      });
      if (disposed) return;

      const parsed = parseMarketResponse(data);
      if (parsed.size) {
        // Merge rather than replace, so a partial response does not blank rows
        // that were fine a moment ago.
        for (const [id, quote] of parsed) quotes.set(id, quote);
        fetchedAtMs = Date.now();
        error = null;
      } else {
        error = { message: describeFetchFailure(fetchError || new Error("quotes could not be read")) };
      }
      loading = false;
      render();
    };

    const render = () => {
      if (disposed) return;

      const symbols = store.getState().marketSymbols || [];
      if (!symbols.length) {
        container.innerHTML = `
          <div class="mk-container">
            <div class="mk-header">Market</div>
            <div class="mk-state">No instruments selected. Use the panel to add some.</div>
          </div>`;
        return;
      }

      const rows = symbols.map((id) => {
        const quote = quotes.get(id);
        const price = quote ? quote.price : null;
        const change = quote ? quote.change : null;
        const tone = changeTone(change);

        // The requirement, enforced here: an absent price is an em dash. It is
        // never 0, and never blank-because-the-row-failed.
        return `
          <li class="mk-row">
            <span class="mk-symbol" title="${escapeHtml(coinLabel(id))}">${escapeHtml(coinSymbol(id))}</span>
            <span class="mk-price${price === null ? " mk-price--na" : ""}">${escapeHtml(formatPrice(price))}</span>
            <span class="mk-change mk-change--${tone}"
                  ${tone === "unknown" ? "" : `aria-label="${tone === "up" ? "up" : tone === "down" ? "down" : "unchanged"}"`}>
              ${escapeHtml(formatChange(change))}
            </span>
          </li>`;
      }).join("");

      container.innerHTML = `
        <div class="mk-container">
          <div class="mk-header">
            Market
            <button class="mk-refresh" id="mk-refresh" type="button"
                    aria-label="Refresh prices now">↻</button>
          </div>
          ${loading && !quotes.size
            ? '<div class="mk-state mk-state--loading">Loading prices…</div>'
            : `<ul class="mk-list">${rows}</ul>`}
          <div class="mk-meta">
            <span>${escapeHtml(formatQuoteAge(fetchedAtMs))}</span>
            ${error ? `<span class="mk-error-text" role="status">${escapeHtml(error.message)}</span>` : ""}
            <span class="mk-source">source: CoinGecko</span>
          </div>
        </div>`;

      const refresh = container.querySelector("#mk-refresh");
      if (refresh) {
        refresh.addEventListener("click", () => {
          loading = true;
          load();
        });
      }
    };

    unsubscribeStore = store.subscribe((key) => {
      if (key === "market_symbols_updated") load();
    });

    load();

    return {
      unmount() {
        disposed = true;
        if (unsubscribeStore) unsubscribeStore();
        if (controller) controller.abort();
      }
    };
  }
};

/** The default instrument list, exported so the settings panel can offer it. */
export const MARKET_PRESETS = DEFAULT_SYMBOLS;
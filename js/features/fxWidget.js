/* StandBy Mode Pro - Currency Widget
 *
 * FEATURE_PLAN.md C17. Two hard requirements from the plan are enforced here:
 *   "Keyless rate source required" - Frankfurter (ECB reference rates), verified
 *   keyless and CORS-permissive during this milestone, with no account.
 *   "must show the rate timestamp and never present a stale rate as live"
 *
 * So the fetched-at time AND the ECB base date are both displayed, and when the
 * cached rate is older than the window the row switches to a stale treatment
 * instead of looking current. This matters because ECB rates update once per
 * business day: a rate fetched on Sunday morning is correctly dated Friday, and
 * presenting it without a date would be quietly misleading.
 *
 * No proxy, no analytics, no key. The only outbound request is the rate itself.
 */

import { store } from "../state/store.js";
import { fetchJson, describeFetchFailure } from "../core/netPolicy.js";
import { escapeHtml } from "../core/escape.js";
import {
  fxUrl,
  parseFxResponse,
  formatRate,
  formatAmount,
  isStaleRate,
  pairKey,
  currencyName,
  convertAmount,
  FX_CURRENCIES,
  FX_MAX_AGE_MS
} from "../core/fx.js";

/** Amount presets offered as one-tap conversions. */
const PRESETS = [1, 10, 100, 1000];

export const fxWidget = {
  name: "Currency",
  icon: "exchange",
  category: "Utility",
  requiresNetwork: true,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;
    let controller = null;
    /** { rate, baseDate, fetchedAtMs } | null */
    let rate = null;
    let error = null;
    let loading = true;

    const load = async () => {
      const { base, quote } = store.getState().fxPrefs || {};
      const url = fxUrl(base, quote);

      if (!url) {
        rate = null;
        loading = false;
        error = new Error("pick two different currencies");
        render();
        return;
      }

      if (controller) controller.abort();
      controller = new AbortController();

      const { data, error: fetchError } = await fetchJson(url, {
        signal: controller.signal,
        // ECB publishes once per business day, so a longer cache than the
        // default is correct here rather than merely convenient.
        maxAgeMs: FX_MAX_AGE_MS
      });
      if (disposed) return;

      const parsed = parseFxResponse(data, quote);
      if (parsed) {
        rate = { ...parsed, fetchedAtMs: Date.now() };
        error = null;
      } else {
        // Keep whatever we had: netPolicy returns the last good value, and
        // showing a slightly old rate beats showing a blank box.
        // The message is described rather than shown raw, because the raw one
        // for a blocked response is "TypeError: Failed to fetch".
        error = { message: describeFetchFailure(fetchError || new Error("the rate could not be read")) };
      }
      loading = false;
      render();
    };

    const render = () => {
      if (disposed) return;

      const { base, quote } = store.getState().fxPrefs || {};
      const key = pairKey(base, quote) || "—";
      const stale = rate ? isStaleRate(rate.fetchedAtMs) : false;

      const headline = loading && !rate
        ? '<span class="fx-rate fx-rate--pending">Loading…</span>'
        : `<span class="fx-rate">${rate ? escapeHtml(formatRate(rate.rate)) : "—"}</span>`;

      const rows = rate
        ? PRESETS.map((amount) => {
            const converted = convertAmount(amount, rate.rate);
            return `<li class="fx-row"><span>${escapeHtml(formatAmount(amount, base))}</span>
              <strong>${escapeHtml(converted === null ? "—" : formatAmount(converted, quote))}</strong></li>`;
          }).join("")
        : "";

      container.innerHTML = `
        <div class="fx-container">
          <div class="fx-header">
            <span class="fx-pair">${escapeHtml(key)}</span>
            <button class="fx-swap" id="fx-swap" type="button"
                    aria-label="Swap base and quote currency">⇄</button>
          </div>

          <div class="fx-pickers">
            <label class="visually-hidden" for="fx-base">Base currency</label>
            <select class="fx-select" id="fx-base">
              ${currencyOptions(base)}
            </select>
            <label class="visually-hidden" for="fx-quote">Quote currency</label>
            <select class="fx-select" id="fx-quote">
              ${currencyOptions(quote)}
            </select>
          </div>

          <div class="fx-main">${headline}</div>
          <div class="fx-rate-note">${escapeHtml(currencyName(base))} to ${escapeHtml(currencyName(quote))}</div>

          ${rows ? `<ul class="fx-rows">${rows}</ul>` : ""}

          <div class="fx-meta${stale ? " fx-meta--stale" : ""}">
            ${stale
              ? '<span class="fx-stale">This rate may be out of date</span>'
              : ""}
            ${rate && rate.baseDate
              ? `<span>Rate for ${escapeHtml(rate.baseDate)}</span>`
              : ""}
            ${error
              ? `<span class="fx-error-text" role="status">${escapeHtml(error.message)}</span>`
              : ""}
          </div>
        </div>`;

      wire();
    };

    const wire = () => {
      const baseSelect = container.querySelector("#fx-base");
      const quoteSelect = container.querySelector("#fx-quote");

      const onChange = () => {
        const nextBase = baseSelect?.value;
        const nextQuote = quoteSelect?.value;
        if (nextBase === nextQuote) {
          // Swapping back is friendlier than a dead error state.
          const restore = nextQuote === store.getState().fxPrefs.base
            ? store.getState().fxPrefs.quote
            : store.getState().fxPrefs.base;
          if (baseSelect && restore) baseSelect.value = restore;
          return;
        }
        loading = true;
        store.setFxPrefs({ base: nextBase, quote: nextQuote });
        load();
      };

      if (baseSelect) baseSelect.addEventListener("change", onChange);
      if (quoteSelect) quoteSelect.addEventListener("change", onChange);

      const swap = container.querySelector("#fx-swap");
      if (swap) {
        swap.addEventListener("click", () => {
          const { base: b, quote: q } = store.getState().fxPrefs || {};
          loading = true;
          store.setFxPrefs({ base: q, quote: b });
          load();
        });
      }
    };

    unsubscribeStore = store.subscribe((key) => {
      // Only react to our own changes; an unrelated store write must not
      // trigger a network request.
      if (key === "fx_updated") load();
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

function currencyOptions(selected) {
  const chosen = String(selected || "").toUpperCase();
  return FX_CURRENCIES.map((c) =>
    `<option value="${escapeHtml(c.code)}"${c.code === chosen ? " selected" : ""}>${escapeHtml(c.code)}</option>`
  ).join("");
}
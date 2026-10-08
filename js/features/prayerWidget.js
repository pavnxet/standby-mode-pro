/* StandBy Mode Pro - Prayer Times Widget
 *
 * FEATURE_PLAN.md C19. The plan rates this HIGH risk and instructs:
 * **"Marked experimental."** It is labelled that way in the header, permanently,
 * because that instruction is about the nature of the data, not about this
 * implementation being unfinished.
 *
 * The reason is on the widget. Prayer times depend on a calculation school, and
 * schools legitimately differ by 10-20 minutes. This widget therefore:
 *
 *   - does NOT compute times itself (see js/core/prayer.js for why)
 *   - shows the calculation method's own name, and lets the user change it
 *   - shows the Hijri date from the source
 *   - says plainly that the times come from a third-party calculation service
 *
 * Presenting these as authoritative without that framing would be the actual
 * failure mode here.
 */

import { store } from "../state/store.js";
import { scheduler } from "../core/scheduler.js";
import { fetchJson, describeFetchFailure } from "../core/netPolicy.js";
import { escapeHtml } from "../core/escape.js";
import {
  prayerUrl,
  parsePrayerResponse,
  nextPrayer,
  currentPrayer,
  viewerMinutes,
  formatHhMm,
  formatCountdown,
  PRAYER_METHODS,
  DEFAULT_PRAYER_METHOD
} from "../core/prayer.js";

/**
 * Prayer times change by under a minute per day, and the service refreshes daily.
 * An hour of cache is correct rather than merely convenient, and it keeps the
 * widget from re-requesting every time a space re-renders.
 */
const MAX_AGE_MS = 60 * 60_000;

export const prayerWidget = {
  name: "Prayer Times",
  icon: "moon",
  category: "Utility",
  requiresNetwork: true,
  experimental: true,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;
    let unsubscribeTick = null;
    let controller = null;
    let day = null;
    let error = null;
    let loading = true;
    /** Minute bucket of the last render, so the tick can skip redundant work. */
    let lastMinute = null;

    const load = async () => {
      const loc = store.getState().unitLocation || {};
      const method = store.getState().prayerMethod || DEFAULT_PRAYER_METHOD;

      // A null coordinate is a stored value meaning "not resolved", not zero.
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) {
        day = null;
        loading = false;
        error = new Error("set a location first");
        render();
        return;
      }

      const url = prayerUrl(loc.lat, loc.lon, method);
      if (!url) {
        day = null;
        loading = false;
        error = new Error("that location is not valid");
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

      const parsed = parsePrayerResponse(data);
      if (parsed) {
        day = parsed;
        error = null;
      } else {
        error = { message: describeFetchFailure(fetchError || new Error("the times could not be read")) };
      }
      loading = false;
      render();
    };

    const render = () => {
      if (disposed) return;

      const method = store.getState().prayerMethod || DEFAULT_PRAYER_METHOD;
      const loc = store.getState().unitLocation || {};

      // ---- No location: say so instead of defaulting to a place the user
      // never chose and presenting its prayer times as theirs.
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) {
        container.innerHTML = `
          <div class="pr-container">
            <div class="pr-header">Prayer Times <span class="pr-badge">experimental</span></div>
            <div class="pr-state">
              <p>No location set.</p>
              <p class="pr-hint">
                Prayer times depend on where you are. Allow location access, or
                set a place, and this widget will fill in.
              </p>
            </div>
            ${methodPicker(method)}
          </div>`;
        wire();
        return;
      }

      // ---- Failure: no invented numbers.
      if (!day) {
        container.innerHTML = `
          <div class="pr-container">
            <div class="pr-header">Prayer Times <span class="pr-badge">experimental</span></div>
            <div class="pr-state${error ? " pr-state--error" : ""}">
              ${loading
                ? "<p>Loading times…</p>"
                : `<p>${escapeHtml(error ? error.message : "Times unavailable.")}</p>`}
              ${!loading
                ? `<p class="pr-hint">These times come from a third-party calculation
                     service. If it is unreachable, this widget shows nothing rather
                     than guessing.</p>`
                : ""}
            </div>
            ${methodPicker(method)}
          </div>`;
        wire();
        return;
      }

      const now = viewerMinutes();
      const next = nextPrayer(day, now);
      const active = currentPrayer(day, now);

      const rows = day.entries.map((entry) => {
        const isNext = next && !next.tomorrow && next.entry.key === entry.key;
        const isActive = active && active.key === entry.key;

        return `
          <li class="pr-row${entry.isPrayer ? "" : " pr-row--marker"}${isNext ? " pr-row--next" : ""}">
            <span class="pr-name">${escapeHtml(entry.label)}</span>
            <span class="pr-time">${escapeHtml(formatHhMm(entry.minutes))}</span>
            ${isActive ? '<span class="pr-flag">now</span>' : ""}
          </li>`;
      }).join("");

      const hijri = day.hijri.day && day.hijri.month
        ? `${escapeHtml(day.hijri.day)} ${escapeHtml(day.hijri.month)} ${escapeHtml(day.hijri.year)} AH`
        : "";

      container.innerHTML = `
        <div class="pr-container">
          <div class="pr-header">
            Prayer Times <span class="pr-badge">experimental</span>
            ${hijri ? `<span class="pr-hijri">${hijri}</span>` : ""}
          </div>

          ${next
            ? `<div class="pr-next">
                 <div class="pr-next-label">Next${next.entry.isPrayer ? " prayer" : ""} — ${escapeHtml(next.entry.label)}</div>
                 <div class="pr-next-time">${escapeHtml(formatHhMm(next.entry.minutes))}</div>
                 <div class="pr-next-count">in ${escapeHtml(formatCountdown(next.minutesAway))}${
                   next.tomorrow ? " (tomorrow)" : ""
                 }</div>
               </div>`
            : ""}

          <ul class="pr-list">${rows}</ul>

          <div class="pr-meta">
            ${day.methodName
              ? `<span>method: ${escapeHtml(day.methodName)}</span>`
              : ""}
            ${day.timezone ? `<span>${escapeHtml(day.timezone)}</span>` : ""}
            ${loc.name ? `<span>${escapeHtml(loc.name)}</span>` : ""}
            ${error ? `<span class="pr-error-text" role="status">${escapeHtml(error.message)}</span>` : ""}
          </div>

          <p class="pr-disclaimer">
            Calculation schools differ, so times vary by minutes between
            communities. These are computed by a third-party service, not by
            this app.
          </p>

          ${methodPicker(method)}
        </div>`;

      wire();
    };

    const wire = () => {
      const select = container.querySelector("#pr-method");
      if (select) {
        select.addEventListener("change", () => {
          loading = true;
          day = null;
          store.setPrayerMethod(Number(select.value));
          load();
        });
      }

      const refresh = container.querySelector("#pr-refresh");
      if (refresh) {
        refresh.addEventListener("click", () => { loading = true; render(); load(); });
      }
    };

    // The countdown has minute resolution, so the tick fires on every second
    // boundary but the render is skipped unless the minute actually rolled over.
    // Re-rendering a minute-resolution widget 60 times a minute is waste.
    unsubscribeTick = scheduler.subscribe("prayer-widget", () => {
      scheduler.onSecondBoundary(() => {
        const minute = Math.floor(Date.now() / 60000);
        if (minute === lastMinute) return;
        lastMinute = minute;
        render();
      });
    }, { priority: 240 });

    unsubscribeStore = store.subscribe((key) => {
      if (key === "unit_location_updated" || key === "prayer_method_updated") load();
    });

    lastMinute = Math.floor(Date.now() / 60000);
    load();

    return {
      unmount() {
        disposed = true;
        if (unsubscribeTick) unsubscribeTick();
        if (unsubscribeStore) unsubscribeStore();
        if (controller) controller.abort();
      }
    };
  }
};

function methodPicker(selected) {
  return `
    <details class="pr-settings">
      <summary class="pr-summary">Calculation method</summary>
      <label class="pr-label" for="pr-method">School</label>
      <select class="pr-select" id="pr-method">
        ${PRAYER_METHODS.map((m) => `
          <option value="${m.id}"${m.id === Number(selected) ? " selected" : ""}>
            ${escapeHtml(m.label)}${m.hint ? ` — ${escapeHtml(m.hint)}` : ""}
          </option>`).join("")}
      </select>
      <p class="pr-hint">
        Different schools give different Fajr and Isha times, often by 10–20
        minutes. Pick the one your community uses.
      </p>
      <button class="pr-btn" id="pr-refresh" type="button">Refresh</button>
    </details>`;
}
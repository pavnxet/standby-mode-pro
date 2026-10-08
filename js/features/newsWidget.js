/* StandBy Mode Pro - News Feed Widget
 *
 * FEATURE_PLAN.md C8, and the plan's own instruction is the design: "accept
 * only user-supplied feeds that pass a CORS preflight, and surface a clear
 * 'feed blocked by CORS' state rather than an empty widget."
 *
 * That second half is the whole reason this widget is honest. Measured during
 * this milestone, four mainstream feeds (bbc.co.uk, hnrss.org, theverge.com,
 * news.ycombinator.com) all return HTTP 200 with NO Access-Control-Allow-Origin
 * header. A browser will not hand those bodies to the page, so a widget
 * pre-loaded with a default feed would be permanently empty. The privacy rule
 * forbids the proxy that would fix it.
 *
 * So: no default feed, user supplies their own, and a blocked feed says so in
 * plain words instead of looking like an empty list. Some feeds - self-hosted,
 * or served from a Cloudflare Worker - do send the header and will work.
 */

import { store } from "../state/store.js";
import { fetchText, describeFetchFailure as describeFetchFailureShared } from "../core/netPolicy.js";
import { escapeHtml } from "../core/escape.js";
import { parseFeed, extractItems, formatAge, safeFeedLink } from "../core/rss.js";

/** How often to refetch a feed that works. */
const MAX_AGE_MS = 10 * 60_000;

export const newsWidget = {
  name: "News Feed",
  icon: "rss",
  category: "Utility",
  requiresNetwork: true,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;
    let controller = null;
    let items = [];
    let feedTitle = "";
    let fetchedAtMs = null;
    /** A user-facing message, or null. Drives the error states. */
    let problem = null;
    let loading = true;

    const load = async () => {
      const { url, itemCount } = store.getState().rss || {};

      if (!url) {
        items = [];
        feedTitle = "";
        problem = null;
        loading = false;
        render();
        return;
      }

      // A non-http(s) URL is rejected before any request: it can never work,
      // and some schemes are a redirect/XSS vector rather than a feed.
      if (!/^https?:\/\//i.test(url)) {
        items = [];
        problem = "That address is not an http(s) URL, so it cannot be read.";
        loading = false;
        render();
        return;
      }

      if (controller) controller.abort();
      controller = new AbortController();

      let text;
      try {
        const result = await fetchText(url, {
          signal: controller.signal,
          maxAgeMs: MAX_AGE_MS
        });
        text = result.data;
        if (!text) {
          problem = describeFetchFailure(result.error);
          loading = false;
          render();
          return;
        }
      } catch (err) {
        problem = describeFetchFailure(err);
        loading = false;
        render();
        return;
      }
      if (disposed) return;

      const parsed = parseFeed(text);

      if (!parsed.items.length) {
        items = [];
        feedTitle = parsed.title;
        // parseFeed's own warnings distinguish "not a feed" from "no entries".
        problem = parsed.warnings[0] || "The feed contained no entries.";
        loading = false;
        render();
        return;
      }

      items = parsed.items;
      feedTitle = parsed.title;
      fetchedAtMs = Date.now();
      problem = null;
      loading = false;
      render();
    };

    const render = () => {
      if (disposed) return;

      const { url, itemCount } = store.getState().rss || {};

      // ---- No feed configured: explain the CORS reality up front.
      if (!url) {
        container.innerHTML = `
          <div class="news-container">
            <div class="news-header">News Feed</div>
            <div class="news-state">
              <p>No feed set.</p>
              <p class="news-hint">
                Most public RSS feeds block browser access (they send no
                CORS header), so this widget will not work with most sites.
                A feed you host yourself, or one served with permissive CORS,
                will. There is no proxy here by design — nothing you enter is
                sent anywhere but the feed's own host.
              </p>
              ${feedForm(url, itemCount)}
            </div>
          </div>`;
        wire();
        return;
      }

      // ---- A problem that prevented any content.
      if (problem && !items.length) {
        container.innerHTML = `
          <div class="news-container">
            <div class="news-header">News Feed</div>
            <div class="news-state news-state--error">
              <p><strong>This feed cannot be read.</strong></p>
              <p class="news-hint">${escapeHtml(problem)}</p>
              ${feedForm(url, itemCount)}
            </div>
          </div>`;
        wire();
        return;
      }

      const shown = extractItems(items, itemCount);

      container.innerHTML = `
        <div class="news-container">
          <div class="news-header">
            ${escapeHtml(feedTitle || "News Feed")}
            <button class="news-refresh" id="news-refresh" type="button"
                    aria-label="Refresh feed now">↻</button>
          </div>
          ${loading && !items.length
            ? '<div class="news-state news-state--loading">Loading feed…</div>'
            : `<ol class="news-list">
                 ${shown.map((item) => renderItem(item)).join("")}
               </ol>`}
          ${problem && items.length
            ? `<p class="news-hint news-stale">Showing the last ${items.length} items — ${escapeHtml(problem)}</p>`
            : ""}
          <div class="news-meta">
            <span>${escapeHtml(formatAge(fetchedAtMs)) || "not updated"}</span>
            <span>${items.length} item${items.length === 1 ? "" : "s"}</span>
          </div>
          ${feedForm(url, itemCount)}
        </div>`;

      wire();
    };

    const wire = () => {
      const form = container.querySelector("#news-form");
      if (form) {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const input = container.querySelector("#news-url");
          const count = container.querySelector("#news-count");
          loading = true;
          problem = null;
          store.setRssPrefs({
            url: (input?.value || "").trim(),
            itemCount: count ? Number(count.value) : 5
          });
          load();
        });
      }

      const refresh = container.querySelector("#news-refresh");
      if (refresh) {
        refresh.addEventListener("click", () => {
          loading = true;
          render();
          load();
        });
      }
    };

    unsubscribeStore = store.subscribe((key) => {
      if (key === "rss_updated") load();
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

/**
 * One headline.
 *
 * The href is filtered through safeFeedLink, so a `javascript:` URL in a feed
 * can never reach an anchor. This is the only place a feed value becomes an
 * href, which makes it the choke point for that whole class of problem.
 */
function renderItem(item) {
  const link = safeFeedLink(item.link);
  // Escaped at the point of use rather than pre-escaped into a variable. The
  // pre-escaped version was correct but the escaping was invisible at both
  // interpolation sites, which is exactly what the XSS guard checks for - a
  // guard that cannot see the escaping eventually gets disabled.
  const age = formatAge(item.publishedMs);

  const body = link
    ? `<a class="news-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"
            title="Opens in a new tab">${escapeHtml(item.title)}</a>`
    : `<span class="news-link news-link--plain">${escapeHtml(item.title)}</span>`;

  return `
    <li class="news-item">
      ${body}
      ${age ? `<span class="news-age">${escapeHtml(age)}</span>` : ""}
    </li>`;
}

function feedForm(url, itemCount) {
  return `
    <details class="news-form-panel">
      <summary class="news-summary">Feed settings</summary>
      <form class="news-form" id="news-form">
        <label class="news-label" for="news-url">Feed URL</label>
        <input class="news-input" id="news-url" type="url" maxlength="500"
               value="${escapeHtml(url || "")}"
               placeholder="https://example.org/feed.xml"
               aria-describedby="news-url-hint" required>
        <p class="news-hint" id="news-url-hint">
          Must be an https address whose server allows cross-origin reads.
        </p>
        <label class="news-label" for="news-count">Headlines to show</label>
        <select class="news-select" id="news-count">
          ${[3, 5, 8, 10, 15].map((n) =>
            `<option value="${n}"${n === itemCount ? " selected" : ""}>${n}</option>`
          ).join("")}
        </select>
        <button class="news-btn news-btn--primary" type="submit">Save and load</button>
      </form>
    </details>`;
}

/**
 * Turns a fetch failure into something a user can act on, with the feed-specific
 * consequence spelled out.
 *
 * The generic wording comes from netPolicy; what is added here is what a reader
 * of this particular widget needs to know, which is that a self-hosted feed
 * with permissive headers will work. Most public feeds will not, so the single
 * most useful fact about this failure is that it is not the user's fault.
 */
export function describeFetchFailure(error) {
  const generic = describeFetchFailureShared(error);
  return `${generic} Most public feeds block browser access; a feed you host yourself, or one served with permissive CORS headers, will work.`;
}
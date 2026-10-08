/* StandBy Mode Pro - RSS / Atom Parsing
 *
 * FEATURE_PLAN.md C8 pure logic, split out of the widget so it is testable
 * without a DOM.
 *
 * A note on feasibility, because it shapes the whole design: **browser CORS
 * blocks effectively every mainstream RSS feed.** Measured during this milestone:
 * feeds.bbci.co.uk, hnrss.org, theverge.com and news.ycombinator.com all serve
 * 200 OK with NO Access-Control-Allow-Origin header, so a browser refuses to
 * hand the body to the page.
 *
 * The no-proxy privacy rule means we cannot route around that. So this module
 * parses whatever the user supplies, and the widget renders an explicit "this
 * feed is blocked by CORS" state rather than an empty box. A feed the user
 * hosts themselves, or one behind a permissive server, will work.
 *
 * DOMParser is deliberately NOT used: it does not exist outside a browser, and
 * these functions are the part worth testing. A small tag scanner is enough for
 * well-formed feeds, which RSS in the wild generally is.
 */

/** Decodes the five XML entities plus numeric references, exactly once. */
export function decodeEntities(text) {
  return String(text || "")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // &amp; LAST, so "&amp;lt;" decodes to "&lt;" and not to "<".
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Strips a CDATA wrapper if present. */
function unwrapCData(text) {
  const match = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(String(text || ""));
  return match ? match[1] : String(text || "");
}

/**
 * Trims tags from an HTML-bearing description, leaving readable text.
 *
 * Does NOT decode entities: the caller already did that when extracting the
 * tag. Decoding twice turns "&amp;amp;" into "&" rather than "&amp;", and a
 * double decode is how deliberately-escaped markup ends up live in a summary.
 */
export function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads the text content of the first <tag>...</tag>, CDATA aware. */
function tagText(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = pattern.exec(xml);
  if (!match) return "";
  return decodeEntities(unwrapCData(match[1])).trim();
}

/** Reads an attribute from the first <tag ...> occurrence. */
function tagAttribute(xml, tag, attribute) {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attribute}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = pattern.exec(xml);
  return match ? decodeEntities(match[1]).trim() : "";
}

/** Parses an RFC 822 date (RSS pubDate) into an epoch, or null. */
export function parseRfc822Date(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Parses an RSS 2.0 or Atom document.
 *
 * @param {string} xml
 * @returns {{ title: string, link: string, items: Array<object>, warnings: string[] }}
 *   `warnings` is non-empty when the document is not a feed, so the widget can
 *   say so instead of rendering an empty list.
 */
export function parseFeed(xml) {
  const text = String(xml || "");
  const warnings = [];

  if (!text.trim()) {
    return { title: "", link: "", items: [], warnings: ["The feed was empty."] };
  }

  const isAtom = /<feed[\s>]/i.test(text);
  const isRss = /<rss[\s>]/i.test(text) || /<rdf:RDF[\s>]/i.test(text);

  if (!isAtom && !isRss) {
    warnings.push("This document is not an RSS or Atom feed.");
    return { title: "", link: "", items: [], warnings };
  }

  const title = tagText(text, "title") || (isAtom ? "Atom feed" : "RSS feed");
  const link = tagAttribute(text, "link", "href") || tagText(text, "link");

  const blocks = isAtom
    ? matchAll(text, "entry")
    : matchAll(text, "item");

  const items = [];
  for (const block of blocks) {
    const itemTitle = tagText(block, "title");
    const itemLink = tagAttribute(block, "link", "href") || tagText(block, "link");

    // An entry with neither a title nor a link is not renderable.
    if (!itemTitle && !itemLink) continue;

    const published = isAtom
      ? parseRfc822Date(tagText(block, "updated") || tagText(block, "published"))
      : parseRfc822Date(tagText(block, "pubDate"));

    items.push({
      title: itemTitle || itemLink,
      link: itemLink,
      publishedMs: published,
      summary: stripHtml(tagText(block, "description") || tagText(block, "summary") || tagText(block, "content"))
    });
  }

  if (!items.length && !warnings.length) {
    warnings.push("The feed parsed, but contained no entries.");
  }

  // Newest first, entries without a date last.
  items.sort((a, b) => (b.publishedMs || 0) - (a.publishedMs || 0));

  return { title, link, items, warnings };
}

/** Non-overlapping matches of <name ...>...</name> or <name .../>. */
function matchAll(xml, tag) {
  const pattern = new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`, "gi");
  return Array.from(String(xml).matchAll(pattern)).map((m) => m[0]);
}

/** The first `count` items, for a collapsed display. */
export function extractItems(items = [], count = 5) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, Math.max(0, count));
}

/** "2 h ago", "just now", "3 d ago" for a publication timestamp. */
export function formatAge(timestampMs, now = Date.now()) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "";
  const delta = Math.max(0, now - timestampMs);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/**
 * Only http(s) links are usable. `javascript:` in a feed is both an XSS vector
 * and a dead link, and this is the choke point that stops it reaching an href.
 */
export function safeFeedLink(link) {
  const value = String(link || "").trim();
  if (!/^https?:\/\//i.test(value)) return null;
  return value;
}
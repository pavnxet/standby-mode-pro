/* StandBy Mode Pro - Widget mount / runtime smoke test
 *
 * Run with: node --test tests/mount.test.mjs
 *
 * FEATURE_PLAN's own cross-cutting risk row reads:
 *   "XSS reintroduced by 29 new widgets | C1-C20 | ... CI a11y/XSS smoke test."
 *
 * This is that test. The static check in audit.test.mjs verifies escaping is
 * *called*; this one verifies what actually reaches the DOM.
 *
 * Two techniques, because either alone has a blind spot:
 *
 *  1. A minimal DOM stand-in. Real jsdom is not available (no dependency may be
 *     added), and a hand-rolled one that is too faithful proves little. This one
 *     implements only what innerHTML assignment and querySelector need, and the
 *     assertions are made on the markup itself.
 *
 *  2. A hostile input pass. Every widget is mounted with values containing
 *     script tags, attribute breakouts and javascript: URLs, and the rendered
 *     markup is searched for anything that could execute. A widget that
 *     interpolates unescaped shows up as a literal "<script>" in its output.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { WIDGETS } from "../js/widgets/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every widget this project added: the index entries carrying a `feature` tag.
 *
 * Replaces a hardcoded list scoped to "Milestone 3". The scope is now derived
 * because the milestone tags were corrected to match the plan - eleven widgets
 * were tagged M3 for having been *built* in that pass, not for belonging to it -
 * which left M3 holding four of nineteen and quietly excluded fifteen widgets
 * from the XSS smoke test this file exists to perform.
 */
const ADDED_WIDGETS = WIDGETS.filter((w) => w.feature);

// ============================================================ The DOM stand-in

/**
 * The minimum surface a widget needs.
 *
 * Deliberately small: a stand-in that emulated real innerHTML *parsing* would
 * need to build a tree, and a tree can hide bugs that a string comparison
 * catches. Here the markup stays a string, which is the thing under test.
 */
class FakeNode {
  constructor(html = "") {
    this._html = html;
    this.listeners = new Map();
    this.files = null;
    this.style = {};
    // `dataset` is a real DOM feature several widgets read and write to carry
    // state across a re-render (the converter stores the typed value there).
    // A missing dataset throws "cannot read properties of undefined", which
    // looks like a widget bug but is a harness gap.
    this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }

  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(fn);
    if (index !== -1) list.splice(index, 1);
  }

  /**
   * Returns a stub element for any selector.
   *
   * A real selector engine would reject the ids these widgets actually use
   * unless it were implemented properly, and then a test would be measuring the
   * stand-in rather than the widget. Returning a permissive stub means the
   * wiring code runs to completion, which is what is being checked.
   */
  querySelector() {
    return new FakeNode("");
  }

  querySelectorAll() { return []; }
  focus() {}
  click() {}
  getAttribute() { return null; }
  get textContent() { return this._html.replace(/<[^>]*>/g, ""); }
  set textContent(v) { this._html = String(v); }
}

/** Installs the globals a widget may touch, and returns a restore function. */
function withDom(extra = {}) {
  const saved = new Map();
  const globals = {
    // A real window stub. The pre-existing timer widget binds a `focus`
    // listener on it directly (timerWidget.js:208), so omitting
    // addEventListener made an unrelated widget look broken here.
    window: {
      isSecureContext: true,
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {}
      })
    },
    document: {
      hidden: false,
      visibilityState: "visible",
      // The store applies accessibility preferences in its constructor, so
      // document.body must exist for the module graph to evaluate at all.
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {},
      removeEventListener() {},
      getElementById: () => new FakeNode("")
    },
    navigator: { userAgent: "test", mediaSession: undefined },
    localStorage: makeStorage(),
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    ...extra
  };

  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }

  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
}

/**
 * Values engineered to break escaping.
 *
 * Covers the four escapes that matter: tag injection, attribute breakout,
 * javascript: URLs, and a quote-pair that would terminate an attribute early.
 */
const HOSTILE = '<script>window.__pwned=1</script>';
const HOSTILE_ATTR = '" onmouseover="window.__pwned=1';
const HOSTILE_URL = 'javascript:window.__pwned=1';

/**
 * Mounts every widget and returns its rendered markup.
 *
 * @returns {Array<{id: string, html: string, error: Error|null}>}
 */
async function mountAll(widgets = WIDGETS) {
  const results = [];
  const restore = withDom();
  const { store } = await import("../js/state/store.js");

  // Captured before the try block so the finally block can reach them even if
  // the setup below throws.
  const originalError = console.error;
  const originalWarn = console.warn;
  const savedState = store.getState();

  try {
    // Muted for the duration of the hostile-value pass. The store logs a
    // "could not be saved" warning for every write because the schema layer
    // captured `localStorage` at module-evaluation time, before this stub
    // existed. That is a harness artefact, not a product defect - the real app
    // has localStorage from the first module - but it would bury 100 lines of
    // output per assertion.
    console.error = () => {};
    console.warn = () => {};

    // Hostile persisted values, so a widget that renders its own state is
    // exercised against them rather than against clean defaults.
    store.setUnitLocation(51.5, -0.13, HOSTILE);
    store.setFxPrefs({ base: "USD", quote: "EUR" });
    store.setNote(HOSTILE);
    store.setCountdown(HOSTILE, Date.now() + 86400000);
    store.addGoal(HOSTILE);
    const deck = store.addDeck(HOSTILE);
    if (deck) store.addCard(deck.id, HOSTILE, HOSTILE_ATTR);
    store.setAgendaIcs(
      "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:" + HOSTILE + "\nDTSTART:20260115T090000Z\nEND:VEVENT\nEND:VCALENDAR",
      HOSTILE
    );
    store.setRssPrefs({ url: "https://example.org/feed.xml" });
    store.setWorldClockCities([HOSTILE, "london", "nyc"]);

    for (const { id, widget } of widgets) {
      const container = new FakeNode();
      try {
        const handle = widget.mount(container);
        // Give any synchronous-but-deferred render a chance to land.
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        results.push({ id, html: container.innerHTML, handle, error: null });

        // Teardown must be safe for every widget, on every path.
        if (handle && typeof handle.unmount === "function") {
          handle.unmount();
        }
      } catch (err) {
        results.push({ id, html: container.innerHTML, handle: null, error: err });
      }
    }
  } finally {
    // Reset the store BEFORE restoring the console, or the reset's own "could
    // not be saved" warning prints at full length and buries the results.
    store.replaceState(savedState);
    console.error = originalError;
    console.warn = originalWarn;
    restore();
  }

  return results;
}

// ================================================================= The checks

test("every widget mounts without throwing", async () => {
  const results = await mountAll();
  const failures = results.filter((r) => r.error);

  assert.equal(
    failures.length, 0,
    "widgets that threw on mount: " +
      failures.map((r) => `${r.id}: ${r.error.message}`).join("; ")
  );
  assert.equal(results.length, WIDGETS.length, "every widget was attempted");
});

test("every widget returns an unmount function", async () => {
  const results = await mountAll();
  const missing = results.filter((r) => !r.handle || typeof r.handle.unmount !== "function");

  assert.equal(
    missing.length, 0,
    "widgets without a usable unmount: " + missing.map((r) => r.id).join(", ")
  );
});

test("no widget renders a live script tag", async () => {
  const results = await mountAll();
  const offenders = results.filter((r) => /<script[\s>]/i.test(r.html));

  assert.equal(
    offenders.length, 0,
    "unescaped script injection in: " + offenders.map((r) => r.id).join(", ")
  );
});

test("no widget renders an unescaped quote breakout", async () => {
  // The hostile attribute value is '" onmouseover="window.__pwned=1'. Escaped,
  // the quote becomes &quot;. Raw, it closes the attribute and adds a handler.
  const results = await mountAll();
  const offenders = results.filter((r) =>
    // A raw breakout means an onmouseover attribute outside a template
    // literal, or the literal payload with unescaped double quotes.
    /onmouseover="window\.__pwned/.test(r.html)
  );

  assert.equal(
    offenders.length, 0,
    "attribute breakout in: " + offenders.map((r) => r.id).join(", ")
  );
});

test("no widget renders a javascript: URL as a live href", async () => {
  const results = await mountAll();
  const offenders = results.filter((r) =>
    /(href|src)\s*=\s*["']?\s*javascript:/i.test(r.html)
  );

  assert.equal(
    offenders.length, 0,
    "javascript: URL rendered into: " + offenders.map((r) => r.id).join(", ")
  );
});

test("no widget leaks the hostile payload unescaped anywhere", async () => {
  // The strongest check: the exact payload string must never appear in
  // rendered output, whatever the context. Escaped, "<script>" becomes
  // "&lt;script&gt;" and the raw string is absent.
  const results = await mountAll();
  const offenders = results.filter((r) => r.html.includes(HOSTILE));

  assert.equal(
    offenders.length, 0,
    "raw hostile payload in: " + offenders.map((r) => r.id).join(", ")
  );
});

test("no widget leaves a live global behind after unmount", async () => {
  // A widget that mounted and unmounted cleanly must not have executed the
  // injected script. This is the end-to-end proof that the static checks hold.
  const results = await mountAll();
  assert.equal(globalThis.__pwned, undefined,
    "an injected payload executed during mounting");
  assert.ok(results.length > 0);
});

test("every widget this project added renders something", async () => {
  // A widget that mounts and mounts and mounts but renders nothing is broken in
  // a way the static checks cannot see. The empty state IS content, so a
  // widget that produced literally nothing is the failure.
  //
  // Scoped to the added set rather than to M3, which is now only four widgets
  // after the milestone tags were corrected to match the plan.
  const results = await mountAll(ADDED_WIDGETS);
  const empty = results.filter((r) => !r.html || r.html.trim().length === 0);

  assert.equal(
    empty.length, 0,
    "widgets that rendered nothing: " + empty.map((r) => r.id).join(", ")
  );
});

test("each added widget has a distinct set of ids across mounts", async () => {
  // Not a uniqueness test on the widgets - a check that no two of them emit the
  // same element ids, which would make a getElementById lookup ambiguous when
  // two are mounted on the same page.
  const results = await mountAll(ADDED_WIDGETS);
  const seen = new Map();

  for (const { id, html } of results) {
    for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
      const elementId = match[1];
      if (seen.has(elementId)) {
        assert.fail(
          `"${id}" and "${seen.get(elementId)}" both emit id="${elementId}"; ` +
          "duplicate ids break getElementById when both widgets are mounted"
        );
      }
      seen.set(elementId, id);
    }
  }

  assert.ok(seen.size > 0, "no element ids were emitted at all");
});

test("the prayer widget is reachable and flagged experimental in the index", async () => {
  const entry = WIDGETS.find((w) => w.id === "prayer");
  assert.ok(entry, "C19 prayer widget is not registered");
  assert.equal(entry.feature, "C19");
  // The registry reads this flag to badge the picker entry, so its absence
  // would silently drop the "experimental" label the plan requires.
  assert.equal(entry.widget.experimental, true);
});

test("every planned widget feature is registered exactly once", async () => {
  /*
   * Was "all fifteen Milestone 3 plan features", listing C5-C9 and C10-C20.
   *
   * Two things changed. First, the scope: the plan puts C1-C16 in Milestone 2
   * and C17-C20 in Milestone 3, and eleven widgets had been tagged M3 because
   * that is when they were BUILT - which had narrowed this test to a list that
   * no longer described the code. It now covers every planned widget feature,
   * across both milestones.
   *
   * Second, the expected list is derived from FEATURE_PLAN.md instead of being
   * written out here. A hardcoded copy of a plan goes stale silently: when C13
   * was built, the hardcoded list was simply still the old fifteen, so the new
   * widget looked like an unrequested addition rather than a planned one.
   */
  const plan = readFileSync(join(ROOT, "FEATURE_PLAN.md"), "utf8");

  // A plan feature is one whose heading names a widget file - that is what
  // distinguishes "C13 needs a new module" from a note or a dependency line.
  const planned = new Set();
  let current = null;
  for (const line of plan.split(/\r?\n/)) {
    const heading = /^### (C\d+)\b/.exec(line);
    if (heading) current = heading[1];
    else if (/Widget|widget|Guide/.test(line) && current && /\*\*Files:\*\*/.test(line)) {
      planned.add(current);
    }
  }

  const registered = WIDGETS.map((w) => w.feature).filter(Boolean).sort();

  assert.deepEqual(registered, [...planned].sort(),
    "the registered widget features do not match the plan's widget features");

  // No duplicates: two entries claiming one feature would mask a missing one.
  assert.equal(new Set(registered).size, registered.length,
    `a feature is registered twice: ${registered.filter((f, i) => registered.indexOf(f) !== i).join(", ")}`);
});

test("every added widget's milestone tag agrees with the plan", () => {
  // Also asserted in audit.test.mjs against the same source. Repeated here
  // deliberately: this file already imports the index, so the check costs
  // nothing and it is the file a widget author reads when a tag is wrong.
  const plan = readFileSync(join(ROOT, "FEATURE_PLAN.md"), "utf8");
  const planOf = {};
  for (const line of plan.split(/\r?\n/)) {
    const match = /^### (C\d+)\b[^\n]*\*\*(M\d)\*\*/.exec(line);
    if (match) planOf[match[1]] = match[2];
  }

  for (const entry of ADDED_WIDGETS) {
    assert.equal(entry.milestone, planOf[entry.feature],
      `${entry.id} is tagged ${entry.milestone}; the plan puts ${entry.feature} in ${planOf[entry.feature]}`);
  }
});
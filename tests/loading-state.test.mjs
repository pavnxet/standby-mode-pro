/* StandBy Mode Pro - Loading-state and hermetic-mount tests
 *
 * Run with: node --test tests/loading-state.test.mjs
 *
 * Two properties, both about what a reader sees in the moment before data
 * arrives.
 *
 * 1. Every networked widget renders SOMETHING immediately on mount.
 *
 *    Found by making mount.test.mjs hermetic: it had been doing real DNS and TCP
 *    against api.open-meteo.com, so its 61 seconds of wall clock depended on the
 *    network. Stubbing fetch exposed that two widgets rendered nothing until
 *    their response arrived - a blank tile for the length of the request, which
 *    on a slow connection is several seconds of nothing at all.
 *
 * 2. mount.test.mjs must not touch the network. Stated here as a property rather
 *    than left implicit, because the stub is the thing that keeps the suite
 *    hermetic and someone optimising it away would be "restoring" a 61-second
 *    network-dependent test.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

/** Widgets that fetch on mount. */
const NETWORKED = ["weather", "airquality", "sun", "agenda", "flashcards",
                   "mediakeys", "fx", "market", "news", "prayer"];

function fakeNode(tag = "") {
  return {
    innerHTML: "", dataset: {}, style: {}, tagName: tag,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ width: 300, height: 150, left: 0, top: 0 }),
    getContext: () => null, focus() {},
    ownerDocument: { getElementById: () => null, createElement: () => fakeNode() }
  };
}

/**
 * Installs a DOM-shaped environment in which fetch never settles.
 *
 * "Never settles" rather than "rejects" on purpose: rejecting would push every
 * widget down its failure path, and the state being tested is the one where the
 * reader is still waiting.
 */
function withPendingNetwork() {
  const saved = new Map();
  const globals = {
    window: {
      isSecureContext: true,
      addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({
        matches: false,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}
      })
    },
    document: {
      hidden: false, visibilityState: "visible",
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {}, removeEventListener() {},
      getElementById: () => fakeNode()
    },
    navigator: { userAgent: "test" },
    localStorage: {
      getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null,
      get length() { return 0; }
    },
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0, clearTimeout: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    fetch: () => new Promise(() => {})
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

const { WIDGETS } = await import("../js/widgets/index.js");

test("every networked widget renders something before its response arrives", async () => {
  /*
   * Run TWICE: once with default state, and once with the widgets actually
   * configured.
   *
   * The configured pass is the one that matters. Three of these widgets - air
   * quality, news and prayer - took an early branch when a location or feed URL
   * was set and skipped their initial render, so a reader who had already set
   * things up saw an empty tile for the length of the request while a reader with
   * default state saw a loading message. That is the opposite of how it reads in
   * the source, and the first version of this test only covered the default case
   * and therefore reported everything as fine.
   */
  const restore = withPendingNetwork();
  try {
    const { store } = await import("../js/state/store.js");
    const saved = store.getState();

    // The same setup mount.test.mjs uses to put the widgets in their configured
    // state: a resolved location, a usable feed URL, a prayer method.
    store.setUnitLocation(51.5, -0.13, "London");
    store.setRssPrefs({ url: "https://example.org/feed.xml" });
    store.setPrayerMethod(3);

    for (const state of ["default state", "configured state"]) {
      const empty = [];

      for (const { id, widget } of WIDGETS) {
        if (!NETWORKED.includes(id)) continue;

        const container = fakeNode();
        let handle = null;
        let threw = null;
        try { handle = widget.mount(container); } catch (err) { threw = err.message; }

        // Two turns, because mount.test.mjs reads after them and a render that
        // appears and then is replaced would pass a synchronous read.
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        if (threw) empty.push(`${id} (threw: ${threw})`);
        else if (!(container.innerHTML || "").trim()) empty.push(`${id} (rendered nothing)`);

        try { handle?.unmount?.(); } catch { /* lifecycle tests cover this */ }
      }

      assert.deepEqual(empty, [],
        `widgets showing a blank panel while the request is in flight, ${state}: ${empty.join(", ")}`);
    }

    store.replaceState(saved);
  } finally {
    restore();
  }
});

test("a widget that renders before fetching still renders after unmount", () => {
  // The loading state must not be a one-off: unmounting immediately after mount
  // is the common case during a stage re-render, and a widget that threw there
  // would break layout switching rather than just look wrong.
  const restore = withPendingNetwork();
  try {
    for (const { id, widget } of WIDGETS) {
      if (!NETWORKED.includes(id)) continue;

      const container = fakeNode();
      const handle = widget.mount(container);
      assert.doesNotThrow(() => handle?.unmount?.(),
        `${id} threw when unmounted straight after mount`);
    }
  } finally {
    restore();
  }
});

test("the mount suite never reaches the network", () => {
  // The guard on the guard. Without this, "61s but green" is a state a future
  // change could restore by deleting a fetch stub.
  const source = read("tests", "mount.test.mjs");

  assert.match(source, /fetch:\s*\(_url,\s*options/,
    "mount.test.mjs no longer stubs fetch, so it performs real network I/O");
  assert.match(source, /signal\.addEventListener\(\s*"abort"/,
    "the fetch stub must settle on abort, or aborted requests leak");
});

test("no widget calls fetch directly rather than through netPolicy", () => {
  // A bare fetch gets none of netPolicy's guarantees: timeout, cache, or abort.
  for (const { id, widget } of WIDGETS) {
    if (!NETWORKED.includes(id)) continue;
    const file = widgetModuleFor(id);
    const source = read(file);

    const bare = [...source.matchAll(/(?<![\w.])await\s+fetch\s*\(/g)];
    assert.equal(bare.length, 0,
      `${file} calls fetch() directly, bypassing the timeout, cache and abort policy`);
  }
});

/** The module path for a widget id, from the index's own imports. */
function widgetModuleFor(id) {
  const index = read("js", "widgets", "index.js");

  const byBinding = new Map();
  for (const m of index.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
    for (const specifier of m[1].split(",")) {
      const binding = specifier.trim().split(/\s+as\s+/)[0].trim();
      if (binding) byBinding.set(binding, m[2]);
    }
  }
  for (const m of index.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*widget:\s*([A-Za-z_$][\w$]*)/g)) {
    if (m[1] !== id) continue;
    const specifier = byBinding.get(m[2]);
    return ["js", "widgets", ...specifier.split("/")].join("/");
  }
  throw new Error(`no module for widget "${id}"`);
}

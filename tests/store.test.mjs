/* StandBy Mode Pro - Unit tests for pure logic
 *
 * Run with:  node tests/store.test.mjs
 *
 * Scope: these tests cover pure, DOM-free logic only. No test framework is
 * added, because the repository has no package.json and the brief forbids
 * unnecessary dependencies. This file uses node:test and node:assert, both of
 * which ship with Node 18+.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  migrateState,
  loadPersistedState,
  savePersistedState,
  deepMerge,
  isPlainObject,
  SCHEMA_VERSION,
  STORAGE_KEY,
  STORAGE_KEY_LEGACY
} from "../js/core/schema.js";

import { escapeHtml, safeUrl } from "../js/core/escape.js";
import { formatDigits, toRoman, toBraille, setNumeralSystem } from "../js/clocks/_shared/numeralMap.js";

/** In-memory localStorage stand-in. */
class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const DEFAULTS = {
  spaces: { home: { id: "home", layout: "standalone" } },
  clockConfig: { is24Hour: false },
  schema: {}
};

// ---------------------------------------------------------------- schema

test("migration stamps the current schema version", () => {
  const state = migrateState({});
  assert.equal(state.schema.version, SCHEMA_VERSION);
});

test("migration preserves user edits to a space", () => {
  const state = migrateState({ spaces: { home: { name: "My Home", clockId: "neon" } } });
  assert.equal(state.spaces.home.name, "My Home");
  assert.equal(state.spaces.home.clockId, "neon");
});

test("migration guarantees all four built-in spaces", () => {
  const state = migrateState({});
  for (const id of ["home", "work", "focus", "night"]) {
    assert.ok(state.spaces[id], `missing space ${id}`);
  }
  assert.equal(state.spaces.focus.layout, "focus");
  assert.equal(state.spaces.night.clockId, "segmented");
});

test("migration preserves user-created spaces", () => {
  const state = migrateState({ spaces: { studio: { name: "Studio", layout: "quad" } } });
  assert.equal(state.spaces.studio.layout, "quad");
});

test("migration backfills missing pomo settings without losing set ones", () => {
  const state = migrateState({ pomoState: { settings: { focusDuration: 50 } } });
  assert.equal(state.pomoState.settings.focusDuration, 50);
  assert.equal(state.pomoState.settings.shortBreakDuration, 5);
  assert.equal(state.pomoState.settings.longBreakInterval, 4);
});

test("migration never discards focus session history", () => {
  const state = migrateState({ stats: { history: [{ id: "a", stage: "focus", duration: 25 }] } });
  assert.equal(state.stats.history.length, 1);
  assert.deepEqual(state.stats.dailyTotals, {});
});

test("a payload from a newer build is refused rather than reset", () => {
  assert.throws(() => migrateState({ schema: { version: 999 } }), /SCHEMA_TOO_NEW|schema v999/i);
});

test("the legacy storage key is read, migrated, and never deleted", () => {
  const storage = new MemStorage();
  storage.setItem(STORAGE_KEY_LEGACY, JSON.stringify({ spaces: { home: { name: "Legacy" } } }));

  const result = loadPersistedState(storage, DEFAULTS);
  assert.equal(result.migrated, true);
  assert.equal(result.sourceKey, STORAGE_KEY_LEGACY);
  assert.equal(result.state.spaces.home.name, "Legacy");

  savePersistedState(storage, result.state);
  assert.ok(storage.getItem(STORAGE_KEY_LEGACY), "legacy key must survive");
  assert.ok(storage.getItem(STORAGE_KEY), "v2 key must be written");
});

test("corrupt JSON degrades to an error instead of throwing", () => {
  const storage = new MemStorage();
  storage.setItem(STORAGE_KEY, "{ not json");
  const result = loadPersistedState(storage, DEFAULTS);
  assert.ok(result.error);
  assert.equal(result.state, null);
});

test("an empty storage returns no state and no error", () => {
  const result = loadPersistedState(new MemStorage(), DEFAULTS);
  assert.equal(result.state, null);
  assert.equal(result.error, null);
});

test("deepMerge recurses objects but replaces arrays", () => {
  const merged = deepMerge(
    { nested: { a: 1, b: 2 }, list: [1, 2, 3] },
    { nested: { b: 9 }, list: [] }
  );
  assert.equal(merged.nested.a, 1);
  assert.equal(merged.nested.b, 9);
  assert.deepEqual(merged.list, []);
});

test("deepMerge ignores undefined source values", () => {
  const merged = deepMerge({ a: 1 }, { a: undefined });
  assert.equal(merged.a, 1);
});

test("isPlainObject rejects arrays and null", () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
});

// ---------------------------------------------------------------- escape

test("escapeHtml neutralises attribute and tag breakouts", () => {
  const attr = escapeHtml('x" onerror="alert(1)');
  assert.ok(!attr.includes('"'));
  const tag = escapeHtml("<script>alert(1)</script>");
  assert.ok(!tag.includes("<"));
  assert.ok(!tag.includes(">"));
});

test("escapeHtml handles nullish and non-string input", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(typeof escapeHtml({ a: 1 }), "string");
});

test("safeUrl blocks javascript and html data URIs", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<script>"), "");
});

test("safeUrl allows image data URIs unless explicitly denied", () => {
  const uri = "data:image/png;base64,AAAA";
  assert.equal(safeUrl(uri), uri);
  assert.equal(safeUrl(uri, { allowDataImage: false }), "");
});

test("safeUrl allows http and https only", () => {
  assert.equal(safeUrl("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(safeUrl("http://example.com/a.jpg"), "http://example.com/a.jpg");
  assert.equal(safeUrl(""), "");
});

// ---------------------------------------------------------------- numerals

test("formatDigits converts only digits, leaving separators alone", () => {
  assert.equal(formatDigits("14:30", "devanagari"), "१४:३०");
  assert.equal(formatDigits("07", "latn"), "07");
  assert.equal(formatDigits("no digits here", "devanagari"), "no digits here");
});

test("setNumeralSystem falls back to latin for unknown ids", () => {
  assert.equal(setNumeralSystem("not-a-system"), "latn");
  assert.equal(setNumeralSystem("devanagari"), "devanagari");
  setNumeralSystem("latn");
});

test("toRoman renders standard numerals and refuses out-of-range values", () => {
  assert.equal(toRoman(4), "IV");
  assert.equal(toRoman(1990), "MCMXC");
  assert.equal(toRoman(4000), "4000", "out of range passes through");
  assert.equal(toRoman(0), "0");
});

test("toBraille maps digits and colons", () => {
  assert.equal(toBraille("12"), "⠁⠃");
  assert.equal(toBraille("1:2"), "⠁⠒⠃");
});
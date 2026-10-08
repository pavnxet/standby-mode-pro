/* Probe: which widget mount leaves a live handle behind?
 *
 * Run: node scripts/probe-open-handles.mjs
 *
 * mount.test.mjs takes 61s of wall clock while its slowest test is 100ms, so
 * something is keeping the event loop alive after the tests finish. This
 * mounts each widget in turn, waits a tick, and reports what is still scheduled.
 *
 * The point is to find WHICH widget, rather than to accept the suite duration as
 * the cost of testing.
 */

import { getActiveResourcesInfo } from "node:process";

const { WIDGETS } = await import("../js/widgets/index.js");

/** The minimum DOM surface a widget needs to mount. */
function makeContainer() {
  return {
    innerHTML: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    query: () => null,
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ width: 300, height: 150, left: 0, top: 0 }),
    getContext: () => null,
    ownerDocument: { getElementById: () => null, createElement: () => makeContainer() }
  };
}

const baseline = new Set(getActiveResourcesInfo());
console.log(`baseline handles: ${[...baseline].join(", ")}\n`);

for (const { id, widget } of WIDGETS) {
  const before = new Set(getActiveResourcesInfo());

  let handle = null;
  let error = null;
  try {
    handle = widget.mount(makeContainer());
  } catch (err) {
    error = err.message;
  }
  try { handle?.unmount?.(); } catch { /* reported below */ }

  // Let any microtasks and zero-delay timers settle.
  await new Promise((r) => setTimeout(r, 0));

  const after = getActiveResourcesInfo().filter((r) => !before.has(r) && r !== "TTYWrap");
  if (error) {
    console.log(`  ${id.padEnd(14)} threw: ${error}`);
  } else if (after.length) {
    console.log(`  ${id.padEnd(14)} LEFT OPEN: ${after.join(", ")}`);
  }
}

console.log("\ndone");

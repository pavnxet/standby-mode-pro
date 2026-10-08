/* Probe: find the source of a leaked timer by capturing setTimeout stacks.
 *
 * Run: node scripts/probe-timer-source.mjs
 *
 * The handle probe reports that mounting `alarm` leaves a Timeout open even
 * though alarmWidget.js clears its own interval in unmount(). So the timer is
 * coming from something the mount reaches indirectly. This records the stack at
 * every setTimeout/clearTimeout during one mount so the caller is identifiable
 * rather than guessed at.
 */

const stacks = new Set();

const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

globalThis.setTimeout = function (fn, ms, ...rest) {
  const stack = new Error("timer created here").stack
    .split("\n")
    .slice(1, 7)
    .filter((l) => !l.includes("probe-timer-source") && !l.includes("node:internal"))
    .join("\n    ");
  stacks.add(`setTimeout(${ms}ms)\n    ${stack}`);
  return realSetTimeout(fn, ms, ...rest);
};

globalThis.clearTimeout = function (id) {
  stacks.add("clearTimeout()");
  return realClearTimeout(id);
};

const { alarmWidget } = await import("../js/features/alarmWidget.js");
const { weatherWidget } = await import("../js/widgets/weatherWidget.js");

function container() {
  return {
    innerHTML: "", dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    querySelector: () => null, querySelectorAll: () => [],
    appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ width: 300, height: 150, left: 0, top: 0 }),
    getContext: () => null,
    ownerDocument: { getElementById: () => null, createElement: () => container() }
  };
}

for (const [label, widget] of [["alarm", alarmWidget], ["weather", weatherWidget]]) {
  stacks.clear();
  let handle = null;
  try { handle = widget.mount(container()); } catch (err) { console.log(`${label}: threw ${err.message}`); }
  try { handle?.unmount?.(); } catch { /* ignore */ }

  console.log(`\n=== ${label} ===`);
  for (const entry of stacks) console.log("  " + entry.replace(/\n/g, "\n  "));
  if (!stacks.size) console.log("  (no timers created)");
}

process.exit(0);

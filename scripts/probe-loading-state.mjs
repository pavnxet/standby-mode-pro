/* Probe: do the networked widgets render anything before their fetch settles?
 *
 * Run: node scripts/probe-loading-state.mjs
 *
 * Five widgets reported "rendered nothing" once mount.test.mjs stopped doing
 * real network I/O. Either they genuinely render nothing until the response
 * arrives - a blank tile for the length of the request - or something else is
 * going on. This mounts each one with a fetch that never settles and prints what
 * the container holds immediately afterwards, which is the reader's experience
 * during a slow request.
 */

const node = { innerHTML: "" };

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

globalThis.window = {
  isSecureContext: true,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
};
globalThis.document = {
  hidden: false, visibilityState: "visible",
  body: { classList: { add() {}, remove() {} } },
  addEventListener() {}, removeEventListener() {},
  getElementById: () => fakeNode()
};
// Node defines `navigator` as a getter-only global, so it needs defineProperty
// rather than assignment - the same reason mount.test.mjs uses descriptors.
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "test" }, configurable: true, writable: true
});
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
// Never settles: this is the "reader is waiting for the network" state.
globalThis.fetch = () => new Promise(() => {});

const { WIDGETS } = await import("../js/widgets/index.js");

const NETWORKED = ["airquality", "fx", "market", "news", "prayer"];

for (const { id, widget } of WIDGETS) {
  if (!NETWORKED.includes(id)) continue;

  const container = fakeNode();
  let handle = null;
  let error = null;
  try { handle = widget.mount(container); } catch (err) { error = err.message; }

  const html = container.innerHTML || "";
  const status = error
    ? `THREW: ${error}`
    : html.trim().length === 0
      ? "EMPTY  <-- nothing rendered while the request is in flight"
      : `ok     ${html.trim().length} chars`;

  console.log(`  ${id.padEnd(12)} ${status}`);
  if (html.trim().length) {
    console.log(`               ${html.trim().replace(/\s+/g, " ").slice(0, 90)}`);
  }
  try { handle?.unmount?.(); } catch { /* ignore */ }
}

process.exit(0);

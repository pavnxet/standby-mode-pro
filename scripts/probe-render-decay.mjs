/* Probe: when does a networked widget's render disappear?
 *
 * Run: node scripts/probe-render-decay.mjs
 *
 * airquality, news and prayer render synchronously on mount, yet mount.test.mjs
 * - which waits two setImmediate turns before reading innerHTML - sees them
 * empty. Something clears the render during those turns. This reads the
 * container after each turn to find out what, rather than guessing from the
 * widget source.
 */

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
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "test" }, configurable: true, writable: true
});
globalThis.localStorage = {
  getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null,
  get length() { return 0; }
};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.fetch = () => new Promise(() => {});

const { WIDGETS } = await import("../js/widgets/index.js");

const target = new Set(["airquality", "news", "prayer"]);

for (const { id, widget } of WIDGETS) {
  if (!target.has(id)) continue;

  const container = fakeNode();
  const handle = widget.mount(container);

  const read = (n) => `${String((container.innerHTML || "").trim().length).padStart(5)} chars`;
  const t0 = read(0);
  await new Promise((r) => setImmediate(r));
  const t1 = read(1);
  await new Promise((r) => setImmediate(r));
  const t2 = read(2);
  await new Promise((r) => setImmediate(r));
  const t3 = read(3);

  console.log(`${id.padEnd(11)} sync=${t0}  after 1=${t1}  after 2=${t2}  after 3=${t3}`);
  console.log(`             now: ${JSON.stringify((container.innerHTML || "").trim().slice(0, 70))}`);

  try { handle?.unmount?.(); } catch { /* ignore */ }
}

process.exit(0);

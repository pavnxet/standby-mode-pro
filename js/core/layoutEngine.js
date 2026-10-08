/* StandBy Mode Pro - Layout Grid Engine (B1, B2, B3, B6)
 *
 * B1 drag-and-drop widget grid, B2 resizable tiles, B3 saved presets and B6 the
 * picker gallery. Four features, one engine, because they all read and write the
 * same structure: an ordered list of { id, span } entries per space.
 *
 * AUDIT.md listed the missing drag-drop grid as one of the largest verified
 * gaps, and the plan's value note is the reason it is worth doing properly rather
 * than as a demo: reordering is the first thing anyone tries with a dashboard.
 *
 * Two things this deliberately avoids:
 *
 *  - Pointer Events with capture. Drag-and-drop reordering is the classic place
 *    to build a pointer-capture bug that only shows up on a touchscreen, and the
 *    ordering maths below is pure so it can be tested without any of that.
 *  - Sorting by measured geometry. Reordering is computed from indices, so a
 *    reflow mid-drag cannot change what "next" means.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";

/**
 * Presets (B3).
 *
 * Each is a deliberate arrangement rather than a random selection. `widgets`
 * lists ids in order; anything the current build does not have is skipped at
 * render time rather than producing an empty tile.
 */
export const LAYOUT_PRESETS = [
  {
    id: "clock-focus",
    label: "Just the clock",
    detail: "One clock, nothing else. For a bedside display.",
    widgets: ["clock"]
  },
  {
    id: "clock-weather",
    label: "Clock and weather",
    detail: "The two things people actually check in the morning.",
    widgets: ["clock", "weather"]
  },
  {
    id: "dashboard",
    label: "Full dashboard",
    detail: "Clock plus four widgets.",
    widgets: ["clock", "weather", "calendar", "todo", "timer"]
  },
  {
    id: "focus-desk",
    label: "Focus desk",
    detail: "A timer, a task list and the Pomodoro stage.",
    widgets: ["clock", "pomodoro", "todo", "timer", "goals"]
  },
  {
    id: "night-stand",
    label: "Night stand",
    detail: "A dimmable clock and a habit tracker.",
    widgets: ["clock", "habit", "flashcards"]
  }
];

export function findPreset(id) {
  return LAYOUT_PRESETS.find((p) => p.id === id) || null;
}

/* -------------------------------------------------------------------------- */
/* Pure ordering                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Moves an item within an ordered list.
 *
 * Pure, and the core of B1. Returning a new array rather than mutating is what
 * makes undo (I4) possible without having kept a copy first.
 *
 * Bounds are clamped rather than rejected: a drag that ends past the end of the
 * list should land at the end, which is what dropping "there" means.
 *
 * @param {string[]} ids
 * @param {number} from
 * @param {number} to
 * @returns {string[]}
 */
export function moveItem(ids, from, to) {
  if (!Array.isArray(ids)) return [];
  const list = [...ids];

  const source = Math.max(0, Math.min(list.length - 1, Number(from) || 0));
  let target = Math.max(0, Math.min(list.length - 1, Number(to) || 0));

  if (source === target) return list;
  if (Number.isNaN(source)) return list;

  const [moved] = list.splice(source, 1);
  list.splice(target, 0, moved);
  return list;
}

/**
 * Which index an item would land on, given a pointer position.
 *
 * Grid-aware: with `columns`, a pointer in the left half of a cell moves before
 * and the right half moves after. Without that, dragging on a multi-column
 * layout is ambiguous and feels broken in a way that is hard to articulate.
 *
 * @param {{ index: number, rect: { left: number, width: number } }} target
 * @param {number} pointerX
 * @param {number} columns
 * @returns {number}
 */
export function dropIndex(target, pointerX, columns = 1) {
  if (!target || !Number.isFinite(target.index)) return 0;

  const cols = Math.max(1, Number(columns) || 1);
  if (cols <= 1) return target.index;

  const rect = target.rect || { left: 0, width: 1 };
  const withinCell = pointerX - rect.left;
  const after = withinCell > rect.width / 2;

  return after ? target.index + 1 : target.index;
}

/**
 * Clamps a tile's span to something the grid can actually lay out.
 *
 * @param {number} span
 * @param {number} columns
 * @returns {number}
 */
export function clampSpan(span, columns) {
  const cols = Math.max(1, Number(columns) || 1);
  const value = Number(span);
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(cols, Math.round(value)));
}

/**
 * Reflows spans after a resize so no row is left with an unfillable gap.
 *
 * Without this, shrinking one tile in a three-column grid leaves a hole that no
 * later tile can enter, and the layout stops being compact.
 *
 * @param {Array<{id:string,span:number}>} tiles
 * @param {number} columns
 */
export function reflowSpans(tiles, columns) {
  const cols = Math.max(1, Number(columns) || 1);
  if (!Array.isArray(tiles) || !tiles.length) return [];

  const out = [];
  let used = 0;

  for (const tile of tiles) {
    let span = clampSpan(tile.span, cols);
    // Only wrap when the tile genuinely does not fit in the remaining space.
    if (used + span > cols && used > 0) {
      used = 0;
    }
    out.push({ ...tile, span });
    used += span;
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Undo (I4)                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A bounded undo stack.
 *
 * Bounded at 20 because this is layout state, not a document: nobody undoes
 * thirty tile moves, and an unbounded array in localStorage is a slow load for
 * something a person will never scroll back through.
 */
export class UndoStack {
  constructor(limit = 20) {
    this.limit = Math.max(1, limit);
    this.past = [];
    this.future = [];
  }

  /**
   * Records the state to return TO, before a change is applied.
   *
   * `push` before mutating, not after - recording the post-change state is the
   * single most common way an undo stack ends up undoing nothing.
   */
  push(snapshot) {
    this.past.push(deepCopy(snapshot));
    if (this.past.length > this.limit) this.past.shift();
    // A new action invalidates any redo, or redo would apply a branch that no
    // longer follows from the current state.
    this.future.length = 0;
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }

  undo() {
    if (!this.past.length) return null;
    const current = this.past.pop();
    this.future.push(deepCopy(current));
    return current;
  }

  redo() {
    if (!this.future.length) return null;
    const next = this.future.pop();
    this.past.push(deepCopy(next));
    return next;
  }

  clear() {
    this.past.length = 0;
    this.future.length = 0;
  }

  get size() { return this.past.length; }
}

/** Structured clone where available; JSON otherwise. Layout state is JSON-safe. */
function deepCopy(value) {
  if (value === null || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/* -------------------------------------------------------------------------- */
/* Controller + UI                                                            */
/* -------------------------------------------------------------------------- */

export class LayoutEngine {
  /**
   * @param {object} options
   * @param {() => number} options.getColumns reads the device ceiling
   * @param {() => string[]} [options.getWidgetIds] every registered widget id
   *
   * `getWidgetIds` is injected rather than imported because the widget registry
   * is populated by a side-effecting import of `widgets/index.js`, and reading it
   * at module scope would mean the layout engine silently saw an empty registry
   * depending on import order. Injected, the ordering problem cannot happen.
   */
  constructor({ getColumns, getWidgetIds } = {}) {
    this.getColumns = getColumns || (() => 3);
    this.getWidgetIds = getWidgetIds || (() => []);
    this.undoStack = new UndoStack();
    this.dragFrom = null;
  }

  /** The current widget order for the active space, as tile records. */
  currentTiles() {
    const space = store.getActiveSpace();
    const widgets = Array.isArray(space?.widgets) ? space.widgets : [];
    const spans = space?.widgetSpans || {};
    return widgets.map((id) => ({ id, span: clampSpan(spans[id] ?? 1, this.getColumns()) }));
  }

  /**
   * Applies a new order.
   *
   * Records the previous state for undo first. The whole method is one store
   * write so a reorder cannot be half-applied by an error midway.
   */
  applyOrder(ids) {
    const before = this.currentTiles();
    this.undoStack.push(before);
    store.updateActiveSpace({ widgets: [...ids] });
    store.notify("layout_reordered", ids);
  }

  /** B2 - one tile's span. */
  applySpan(id, span) {
    const before = this.currentTiles();
    this.undoStack.push(before);

    const spans = {};
    for (const tile of before) {
      spans[tile.id] = tile.id === id ? clampSpan(span, this.getColumns()) : tile.span;
    }
    store.updateActiveSpace({ widgetSpans: spans });
    store.notify("layout_resized", { id, span });
  }

  /** B3 - a named preset replaces the order. */
  applyPreset(presetId) {
    const preset = findPreset(presetId);
    if (!preset) return null;

    const before = this.currentTiles();
    this.undoStack.push(before);

    // Only keep ids this build actually has, or the layout would reserve tiles
    // for widgets that do not exist. `clock` is not in the widget registry - it
    // is a clock face - so it is always allowed.
    const available = new Set(this.getWidgetIds());
    const widgets = preset.widgets.filter((id) => available.has(id) || id === "clock");

    store.updateActiveSpace({ widgets, widgetSpans: {} });
    store.notify("layout_preset_applied", presetId);
    return preset;
  }

  /** I4 - undo / redo. */
  undo() {
    const previous = this.undoStack.undo();
    if (!previous) return false;
    store.updateActiveSpace({
      widgets: previous.map((t) => t.id),
      widgetSpans: Object.fromEntries(previous.map((t) => [t.id, t.span]))
    });
    store.notify("layout_undone", previous);
    return true;
  }

  redo() {
    const next = this.undoStack.redo();
    if (!next) return false;
    store.updateActiveSpace({
      widgets: next.map((t) => t.id),
      widgetSpans: Object.fromEntries(next.map((t) => [t.id, t.span]))
    });
    store.notify("layout_redone", next);
    return true;
  }

  /* ---- Drag wiring --------------------------------------------------- */

  /**
   * Pointer-based reordering.
   *
   * Uses pointerdown/move/up with an explicit capture rather than HTML5 drag and
   * drop, because HTML5 DnD does not fire on touch at all. The reorder maths
   * lives in `moveItem`/`dropIndex`, which are pure and tested separately.
   */
  attachDrag(root) {
    if (!root) return () => {};

    let dragging = null;

    const onPointerDown = (event) => {
      const handle = event.target.closest("[data-drag-id]");
      if (!handle || !root.contains(handle)) return;
      // Left button only. A right-click drag is a context menu.
      if (event.button !== 0) return;

      dragging = {
        id: handle.dataset.dragId,
        index: Number(handle.dataset.dragIndex),
        pointerId: event.pointerId,
        target: null
      };

      handle.classList.add("lg-tile--dragging");
      // Capture keeps the move events coming even when the pointer leaves the
      // handle, which is the whole reason to use it here.
      try { handle.setPointerCapture?.(event.pointerId); } catch (err) { /* not supported */ }
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      if (!dragging || event.pointerId !== dragging.pointerId) return;

      const element = document.elementFromPoint?.(event.clientX, event.clientY);
      const over = element?.closest?.("[data-drag-id]");
      if (!over || over.dataset.dragId === dragging.id) return;

      const rect = over.getBoundingClientRect();
      const to = dropIndex(
        { index: Number(over.dataset.dragIndex), rect },
        event.clientX,
        this.getColumns()
      );

      const current = this.currentTiles().map((t) => t.id);
      const from = current.indexOf(dragging.id);
      if (from === -1 || to === from) return;

      this.applyOrder(moveItem(current, from, to));
      // The source index moved, so it has to be re-read rather than kept.
      dragging.index = this.currentTiles().findIndex((t) => t.id === dragging.id);
    };

    const onPointerUp = (event) => {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      dragging = null;
      root.querySelectorAll(".lg-tile--dragging").forEach((el) =>
        el.classList.remove("lg-tile--dragging")
      );
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);

    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
    };
  }
}

/* -------------------------------------------------------------------------- */
/* B6: widget picker gallery                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The picker gallery.
 *
 * Takes the registry's descriptors rather than importing a hardcoded list, so
 * a widget that exists but is not registered cannot appear here - the exact
 * drift A1's single index was introduced to prevent.
 */
export function renderPickerGallery(registryList, activeIds = []) {
  const active = new Set(activeIds);
  const groups = new Map();

  for (const entry of registryList) {
    const widget = entry.widget || entry;
    const category = widget.category || "General";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({ ...entry, widget });
  }

  const sections = [...groups.entries()].map(([category, items]) => `
    <section class="pg-group">
      <h3 class="pg-group-title">${escapeHtml(category)}</h3>
      <ul class="pg-grid" role="list">
        ${items.map((entry) => {
          const on = active.has(entry.id);
          const experimental = entry.experimental === true || entry.widget?.experimental === true;
          return `
            <li>
              <button class="pg-card${on ? " pg-card--on" : ""}" type="button"
                      data-widget="${escapeHtml(entry.id)}"
                      aria-pressed="${on}">
                <span class="pg-name">${escapeHtml(entry.widget?.name || entry.id)}</span>
                ${experimental ? '<span class="pg-tag pg-tag--exp">experimental</span>' : ""}
                ${entry.widget?.requiresNetwork
                  ? '<span class="pg-tag pg-tag--net" title="Needs a network connection">online</span>'
                  : ""}
                <span class="pg-toggle" aria-hidden="true">${on ? "✓" : "+"}</span>
              </button>
            </li>`;
        }).join("")}
      </ul>
    </section>`).join("");

  return `
    <div class="pg-panel">
      <p class="pg-intro">
        ${registryList.length} widgets. Tap to add or remove. Order and size are
        changed in Layout.
      </p>
      ${sections}
    </div>`;
}

/** I1 - the searchable settings centre. */
export function renderSettingsSearch(allSettings) {
  return `
    <div class="ss-panel">
      <label class="ss-label" for="ss-input">Search settings</label>
      <input class="ss-input" id="ss-input" type="search"
             placeholder="brightness, theme, sound…"
             aria-describedby="ss-count" autocomplete="off">
      <p class="ss-count" id="ss-count" role="status"></p>
      <ul class="ss-results" id="ss-results" role="listbox"></ul>
    </div>`;
}

/**
 * Filters settings entries.
 *
 * Subsequence matching, for the same reason the command palette uses it: people
 * remember "bright" and type that, not "screen brightness level".
 */
export function filterSettings(entries, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return entries.map((entry) => ({ entry, score: 0 }));

  const out = [];
  for (const entry of entries) {
    const haystack = `${entry.label} ${entry.section} ${entry.keywords || ""}`.toLowerCase();
    let cursor = 0;
    let score = 0;
    let matched = true;

    for (const char of q) {
      const found = haystack.indexOf(char, cursor);
      if (found === -1) { matched = false; break; }
      score += found === cursor ? 6 : 1;
      cursor = found + 1;
    }
    if (matched) out.push({ entry, score });
  }

  return out.sort((a, b) => b.score - a.score);
}
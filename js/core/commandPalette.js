/* StandBy Mode Pro - Command Palette (I3) + Keyboard Shortcuts (I2)
 *
 * Two features in one module because they are the same mechanism: an index of
 * named actions, reachable by typing (the palette) and by key (the shortcuts).
 * Building them separately would mean two indexes that drift, and a shortcut
 * that works while the palette shows a different action is the classic symptom.
 *
 * I2's value is stated plainly in the plan's inspiration - Dashy/Dashboards ship
 * a cheat sheet because nobody memorises shortcuts - so the sheet is generated
 * FROM this index rather than written by hand and left to rot.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";

/**
 * Every command. `keys` are matched as a set, so "ctrl+k" and "meta+k" are one
 * binding with two spellings.
 *
 * `when` optionally gates the action; a command whose gate is false is not
 * offered in the palette and does not fire. That is what stops a "toggle
 * night mode" appearing on a build with no night mode.
 */
export function buildCommands(actions) {
  return [
    { id: "palette", label: "Open command palette", keys: ["ctrl+k", "meta+k"], group: "General", run: () => actions.openPalette?.() },
    { id: "cheatsheet", label: "Show keyboard shortcuts", keys: ["shift+/", "f1"], group: "Help", run: () => actions.showCheatsheet?.() },
    { id: "toggle-night", label: "Toggle night mode", keys: ["n"], group: "Display", run: () => actions.toggleNight?.() },
    { id: "fullscreen", label: "Toggle fullscreen", keys: ["f"], group: "Display", run: () => actions.toggleFullscreen?.() },
    { id: "next-space", label: "Next space", keys: ["arrowright"], group: "Navigation", run: () => actions.nextSpace?.() },
    { id: "prev-space", label: "Previous space", keys: ["arrowleft"], group: "Navigation", run: () => actions.prevSpace?.() },
    { id: "open-settings", label: "Open settings", keys: ["ctrl+,"], group: "Settings", run: () => actions.openSettings?.() },
    { id: "stop-audio", label: "Stop all ambient sound", keys: ["ctrl+shift+s"], group: "Audio", run: () => actions.stopAudio?.() },
    { id: "toggle-kiosk", label: "Toggle kiosk mode", keys: ["ctrl+shift+k"], group: "Display", run: () => actions.toggleKiosk?.() },
    { id: "theme-dark", label: "Theme: dark", keys: [], group: "Theme", run: () => actions.setTheme?.("dark") },
    { id: "theme-light", label: "Theme: light", keys: [], group: "Theme", run: () => actions.setTheme?.("light") },
    { id: "theme-amoled", label: "Theme: AMOLED black", keys: [], group: "Theme", run: () => actions.setTheme?.("amoled") }
  ].filter((command) => !command.when || command.when());
}

/**
 * Normalises a keyboard event into a binding string.
 *
 * `ctrl+` / `meta+` / `alt+` / `shift+` prefixes, then the key lowercased. Two
 * reasons it is explicit rather than using `event.key`: `Shift+/` produces "?"
 * on a US layout but "?" on many others, and Ctrl+N on some layouts produces
 * a control character rather than the letter.
 *
 * @returns {string} e.g. "ctrl+k", "shift+/"
 */
export function bindingFromEvent(event) {
  if (!event || !event.key) return "";

  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  // Meta maps Cmd on macOS. Treated as equivalent to Ctrl because a shortcut
  // that only works on one platform is a shortcut nobody finds.
  if (event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");

  // Every key name is normalised to lower case, not just single characters.
  // `event.key` spells the arrow keys "ArrowRight", which would never match a
  // binding declared as "arrowright" - so those two commands would look
  // correct in the cheat sheet and be completely dead.
  let key = String(event.key);
  if (key === " ") key = "space";
  else key = key.toLowerCase();

  parts.push(key);
  return parts.join("+");
}

/** Human form of a binding, for the cheat sheet. */
export function describeBinding(binding) {
  const parts = String(binding).split("+");
  const isMac = typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  return parts
    .map((part) => {
      if (part === "ctrl") return isMac ? "⌃" : "Ctrl";
      if (part === "meta") return isMac ? "⌘" : "Win";
      if (part === "alt") return isMac ? "⌥" : "Alt";
      if (part === "shift") return isMac ? "⇧" : "Shift";
      if (part === "arrowleft") return "←";
      if (part === "arrowright") return "→";
      if (part === "arrowup") return "↑";
      if (part === "arrowdown") return "↓";
      if (part === "space") return "Space";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(isMac ? "" : "+");
}

/**
 * Ranked fuzzy search over the command list.
 *
 * Subsequence matching rather than substring, because people remember "tog night"
 * and not "toggle night mode". Subsequence is scored by contiguity so an exact
 * prefix still wins.
 *
 * @returns {Array<{ command: object, score: number }>}
 */
export function searchCommands(commands, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return commands.map((command) => ({ command, score: 0 }));

  const out = [];
  for (const command of commands) {
    const haystack = `${command.label} ${command.group} ${command.id}`.toLowerCase();
    const index = subsequenceScore(haystack, q);
    if (index > 0) out.push({ command, score: index });
  }

  return out.sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label));
}

/**
 * Subsequence match score. 0 means no match.
 *
 * Bonus for a match at the start of the label, and for consecutive characters,
 * so "tn" ranks "Toggle night mode" above "Screen timeout notification".
 */
function subsequenceScore(haystack, needle) {
  let cursor = 0;
  let score = 0;
  let streak = 0;

  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return 0;

    if (found === cursor && cursor > 0) {
      streak++;
      score += 6 + streak * 2;
    } else {
      streak = 0;
      score += 1;
    }
    // A hit in the first few characters is much more likely to be the intent.
    if (found < 4) score += 4;

    cursor = found + 1;
  }
  return score;
}

/** The palette markup. */
export function renderPalette(commands, query = "") {
  const results = searchCommands(commands, query).slice(0, 40);

  const groups = new Map();
  for (const { command } of results) {
    if (!groups.has(command.group)) groups.set(command.group, []);
    groups.get(command.group).push(command);
  }

  const body = groups.size
    ? [...groups.entries()].map(([group, items]) => `
        <div class="cp-group">
          <div class="cp-group-label">${escapeHtml(group)}</div>
          <ul class="cp-list" role="listbox" aria-label="${escapeHtml(group)}">
            ${items.map((item, index) => `
              <li class="cp-item" role="option" data-command="${escapeHtml(item.id)}"
                  aria-selected="false" id="cp-item-${escapeHtml(item.id)}">
                <span class="cp-item-label">${escapeHtml(item.label)}</span>
                ${item.keys.length
                  ? `<kbd class="cp-key">${escapeHtml(describeBinding(item.keys[0]))}</kbd>`
                  : ""}
              </li>`).join("")}
          </ul>
        </div>`).join("")
    : `<p class="cp-empty">Nothing matches "${escapeHtml(query)}".</p>`;

  return `
    <div class="cp-panel" role="dialog" aria-modal="true" aria-label="Command palette">
      <input class="cp-input" id="cp-input" type="text" role="combobox"
             aria-expanded="true" aria-controls="cp-listbox"
             aria-autocomplete="list" placeholder="Type a command…"
             value="${escapeHtml(query)}" spellcheck="false" autocomplete="off">
      <div class="cp-results" id="cp-listbox">${body}</div>
      <div class="cp-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>Enter</kbd> run</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </div>`;
}

/** The cheat sheet, generated from the same index so it cannot rot. */
export function renderCheatsheet(commands) {
  const groups = new Map();
  for (const command of commands) {
    if (!command.keys.length) continue;
    if (!groups.has(command.group)) groups.set(command.group, []);
    groups.get(command.group).push(command);
  }

  return `
    <div class="cs-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <h2 class="cs-title">Keyboard shortcuts</h2>
      ${[...groups.entries()].map(([group, items]) => `
        <section class="cs-group">
          <h3 class="cs-group-label">${escapeHtml(group)}</h3>
          <dl class="cs-list">
            ${items.map((item) => `
              <div class="cs-row">
                <dt>${escapeHtml(item.label)}</dt>
                <dd>${item.keys.map((k) => `<kbd>${escapeHtml(describeBinding(k))}</kbd>`).join("</kbd> <span>or</span> <kbd>")}</dd>
              </div>`).join("")}
          </dl>
        </section>`).join("")}
      <button class="cs-close" type="button" data-close-cheatsheet>Close</button>
    </div>`;
}

/**
 * The controller: owns the palette, the cheat sheet and the key handler.
 */
export class CommandSystem {
  /**
   * @param {object} actions callbacks into the app
   */
  constructor(actions = {}) {
    this.actions = actions;
    this.commands = buildCommands(actions);
    this.paletteRoot = null;
    this.sheetRoot = null;
    this.query = "";
    this.cursor = 0;
    this.disposed = false;
    this.keyHandler = this.onKeyDown.bind(this);

    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.keyHandler);
    }
  }

  refresh() {
    this.commands = buildCommands(this.actions);
  }

  /** Runs a command by id. Unknown ids are ignored, not thrown. */
  run(id) {
    const command = this.commands.find((c) => c.id === id);
    if (!command) return false;
    try {
      command.run?.();
      return true;
    } catch (err) {
      console.error("[commands] failed:", id, err);
      return false;
    }
  }

  onKeyDown(event) {
    if (this.disposed) return;

    const binding = bindingFromEvent(event);

    // The palette owns the keyboard while it is open.
    if (this.paletteRoot) {
      this.handlePaletteKey(event);
      return;
    }
    if (this.sheetRoot && (binding === "escape" || binding === "f1")) {
      event.preventDefault();
      this.closeCheatsheet();
      return;
    }

    // Never steal a key from something the user is typing into.
    const target = event.target;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
      // ...except the palette's own bindings, which must work from a field.
      if (!/^(ctrl|meta)\+/.test(binding)) return;
    }
    if (event.isComposing) return;

    const command = this.commands.find((c) =>
      c.keys.length && c.keys.includes(binding)
    );
    if (!command) return;

    // Do not fire a bare letter key while a modifier-free field has focus.
    event.preventDefault();
    this.run(command.id);
  }

  handlePaletteKey(event) {
    const binding = bindingFromEvent(event);

    if (binding === "escape") {
      event.preventDefault();
      this.closePalette();
      return;
    }
    if (binding === "enter") {
      event.preventDefault();
      const results = searchCommands(this.commands, this.query);
      if (results.length) this.run(results[this.cursor]?.command.id || results[0].command.id);
      this.closePalette();
      return;
    }
    if (binding === "arrowdown" || binding === "arrowup") {
      event.preventDefault();
      const results = searchCommands(this.commands, this.query);
      if (!results.length) return;
      const step = binding === "arrowdown" ? 1 : -1;
      this.cursor = (this.cursor + step + results.length) % results.length;
      this.rerender();
    }
  }

  openPalette() {
    if (this.paletteRoot || typeof document === "undefined") return;
    this.query = "";
    this.cursor = 0;

    const host = document.createElement("div");
    host.className = "cp-overlay";
    host.innerHTML = renderPalette(this.commands);
    document.body.appendChild(host);
    this.paletteRoot = host;

    const input = host.querySelector("#cp-input");
    if (input) {
      input.addEventListener("input", () => {
        this.query = input.value;
        this.cursor = 0;
        this.rerender();
        host.querySelector("#cp-input")?.focus();
      });
    }
    host.addEventListener("click", (event) => {
      if (event.target === host) return this.closePalette();
      const item = event.target.closest("[data-command]");
      if (item) {
        this.run(item.dataset.command);
        this.closePalette();
      }
    });
    input?.focus();
  }

  rerender() {
    if (!this.paletteRoot) return;
    this.paletteRoot.innerHTML = renderPalette(this.commands, this.query);
    const items = this.paletteRoot.querySelectorAll(".cp-item");
    items.forEach((item, index) => {
      const selected = index === this.cursor;
      item.setAttribute("aria-selected", String(selected));
      if (selected) {
        item.classList.add("cp-item--active");
        this.paletteRoot.querySelector("#cp-input")?.setAttribute("aria-activedescendant", item.id);
      }
    });
    const input = this.paletteRoot.querySelector("#cp-input");
    if (input && this.query) input.value = this.query;
  }

  closePalette() {
    if (this.paletteRoot?.parentNode) this.paletteRoot.parentNode.removeChild(this.paletteRoot);
    this.paletteRoot = null;
    this.query = "";
    this.cursor = 0;
  }

  openCheatsheet() {
    if (this.sheetRoot || typeof document === "undefined") return;
    const host = document.createElement("div");
    host.className = "cp-overlay";
    host.innerHTML = renderCheatsheet(this.commands);
    document.body.appendChild(host);
    this.sheetRoot = host;

    host.addEventListener("click", (event) => {
      if (event.target === host || event.target.closest("[data-close-cheatsheet]")) {
        this.closeCheatsheet();
      }
    });
  }

  closeCheatsheet() {
    if (this.sheetRoot?.parentNode) this.sheetRoot.parentNode.removeChild(this.sheetRoot);
    this.sheetRoot = null;
  }

  destroy() {
    this.disposed = true;
    this.closePalette();
    this.closeCheatsheet();
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this.keyHandler);
    }
  }
}

/** I5 - the toast surface, used by the palette, import/export and the rescue. */
export const toasts = {
  _root: null,

  mount(parent) {
    if (this._root || typeof document === "undefined") return this._root;
    const host = document.createElement("div");
    host.className = "toast-region";
    // A live region, so a screen reader announces the message as it appears.
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    (parent || document.body).appendChild(host);
    this._root = host;
    return host;
  },

  /**
   * @param {string} message
   * @param {{ tone?: 'info'|'success'|'warn'|'error', durationMs?: number }} [options]
   */
  show(message, options = {}) {
    const root = this.mount();
    if (!root) return null;

    const tone = ["info", "success", "warn", "error"].includes(options.tone)
      ? options.tone
      : "info";
    // Errors stay longer: they usually need acting on, and 4s is not enough to
    // read and act on one.
    const duration = options.durationMs || (tone === "error" ? 8000 : 4000);

    const toast = document.createElement("div");
    toast.className = `toast toast--${tone}`;
    toast.innerHTML = `<span class="toast-text">${escapeHtml(message)}</span>`;
    root.appendChild(toast);

    const remove = () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    };
    const timer = setTimeout(remove, duration);
    // Dismissible, because an error the reader missed is worse than no error.
    toast.addEventListener("click", () => {
      clearTimeout(timer);
      remove();
    });

    // Never let a queue of toasts cover the clock.
    while (root.children.length > 4) root.removeChild(root.firstChild);

    return { dismiss: () => { clearTimeout(timer); remove(); } };
  }
};
/* StandBy Mode Pro - Habit Tracker Widget
 *
 * FEATURE_PLAN.md C3. A 12-week contribution grid, modelled on the GitHub
 * contribution graph, because a dense visual record is far more motivating
 * than a percentage and cannot be trivially gamed the way a streak counter can
 * (a lesson taken from Forest's design analysis).
 */

import { store } from "../state/store.js";

const WEEKS = 12;

export const habitWidget = {
  name: "Habit Tracker",
  icon: "grid",
  category: "Productivity",
  size: "large",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribe = null;

    const render = () => {
      if (disposed) return;

      const habits = store.getState().habits || [];
      const today = todayKey();

      container.innerHTML = `
        <div class="habit-container">
          <h3 class="habit-title">Habits</h3>

          <div class="habit-grid-wrap">
            ${habits.length === 0
              ? `<p class="habit-empty">No habits yet. Add one below.</p>`
              : habits.map(h => renderHabit(h, today)).join("")}
          </div>

          <form id="habit-add-form" class="habit-add-form">
            <label for="habit-name" class="sr-only">Habit name</label>
            <input type="text" id="habit-name" maxlength="40" placeholder="New habit…" class="habit-name-input" />
            <button type="submit" class="btn-primary" aria-label="Add habit">Add</button>
          </form>
        </div>
      `;

      bind();
    };

    function renderHabit(habit, today) {
      const done = habit.log && habit.log[today];
      const cells = [];
      for (let i = WEEKS * 7 - 1; i >= 0; i--) {
        const day = dayKeyOffset(i);
        const filled = habit.log && habit.log[day];
        const future = day > today;
        cells.push(
          `<span class="habit-cell ${filled ? "habit-cell--on" : ""} ${future ? "habit-cell--future" : ""}"
            title="${day}${filled ? " — done" : ""}"></span>`
        );
      }

      const streak = computeStreak(habit.log || {}, today);

      return `
        <div class="habit-row" data-habit-id="${escapeAttr(habit.id)}">
          <button type="button" class="habit-toggle ${done ? "habit-toggle--on" : ""}"
            aria-pressed="${Boolean(done)}" aria-label="Toggle ${escapeAttr(habit.name)} for today">
            ${escapeText(habit.name)}
          </button>
          <span class="habit-streak" title="Current streak">${streak > 0 ? `🔥 ${streak}` : ""}</span>
          <div class="habit-cells" role="img" aria-label="${escapeAttr(habit.name)}: ${Object.keys(habit.log || {}).filter(d => d <= today).length} of the last ${WEEKS * 7} days complete">
            ${cells.join("")}
          </div>
          <button type="button" class="habit-remove" data-action="remove" aria-label="Delete habit ${escapeAttr(habit.name)}">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      `;
    }

    function bind() {
      container.querySelectorAll(".habit-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
          const row = btn.closest("[data-habit-id]");
          const id = row && row.getAttribute("data-habit-id");
          if (id) store.toggleHabit(id, todayKey());
        });
      });

      container.querySelectorAll("[data-action='remove']").forEach(btn => {
        btn.addEventListener("click", () => {
          const row = btn.closest("[data-habit-id]");
          const id = row && row.getAttribute("data-habit-id");
          if (id) store.removeHabit(id);
        });
      });

      const form = container.querySelector("#habit-add-form");
      if (form) {
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const input = form.querySelector("#habit-name");
          const name = (input.value || "").trim();
          if (!name) return;
          store.addHabit(name);
          input.value = "";
        });
      }
    }

    unsubscribe = store.subscribe((event) => {
      if (event === "habits_updated") render();
    });

    render();

    return {
      unmount() {
        disposed = true;
        if (unsubscribe) unsubscribe();
      }
    };
  }
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayKeyOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function computeStreak(log, today) {
  let streak = 0;
  const cursor = new Date();
  // Today not being done yet should not break the streak, so start from
  // yesterday if today is missing.
  if (!log[today]) cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 400; i++) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (log[key]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function escapeText(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const escapeAttr = escapeText;
/* StandBy Mode Pro - Daily Goals Dashboard
 *
 * FEATURE_PLAN.md C18. Inspired by Momentum's "top task in centre" pattern.
 *
 * The insight from Momentum is not "show a list of tasks" - the app already has
 * a TODO widget. It is that ONE thing, rendered large, beats a list of eight
 * rendered small. So this widget leads with the single most important
 * uncompleted goal and demotes the rest.
 *
 * Goals are filed under a LOCAL calendar day key. The completed count rolls
 * into `stats.dailyTotals`, which the existing focus analytics already read, so
 * finishing goals contributes to the streak rather than living in a silo.
 */

import { store } from "../state/store.js";
import { escapeHtml } from "../core/escape.js";

/** Local calendar-day key, "YYYY-MM-DD". Deliberately not toISOString(), which
 *  is UTC and would file a 23:30 completion under tomorrow. */
export function localDayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

/** Goals for one day, newest last. */
export function goalsForDay(goals, dayKey) {
  return (goals || []).filter((g) => g.dayKey === dayKey);
}

export const goalsWidget = {
  name: "Daily Goals",
  icon: "target",
  category: "Focus",
  requiresNetwork: false,

  mount(container) {
    let disposed = false;
    let unsubscribeStore = null;

    const render = () => {
      if (disposed) return;

      const all = store.getState().goals || [];
      const today = localDayKey();
      const todays = goalsForDay(all, today);
      const done = todays.filter((g) => g.done).length;
      const percent = todays.length ? Math.round((done / todays.length) * 100) : 0;

      // The Momentum pattern: the first uncompleted goal is the hero.
      const featured = todays.find((g) => !g.done) || null;
      const rest = todays.filter((g) => g.id !== (featured && featured.id));

      container.innerHTML = `
        <div class="goals-container">
          <div class="goals-header">
            <span class="goals-title">Today's goals</span>
            <span class="goals-progress" id="goals-progress">${done}/${todays.length}</span>
          </div>

          <div class="goals-bar" role="progressbar" aria-valuenow="${percent}"
               aria-valuemin="0" aria-valuemax="100"
               aria-label="${done} of ${todays.length} goals complete">
            <div class="goals-bar-fill" style="width:${percent}%"></div>
          </div>

          ${featured ? `
            <button class="goals-feature" id="goals-feature" type="button"
                    aria-label="Mark complete: ${escapeHtml(featured.text)}">
              <span class="goals-feature-check" aria-hidden="true"></span>
              <span class="goals-feature-text">${escapeHtml(featured.text)}</span>
            </button>
          ` : `
            <div class="goals-empty">
              ${todays.length ? "All done for today." : "No goals yet — add one below."}
            </div>
          `}

          ${rest.length ? `
            <ul class="goals-list">
              ${rest.map((g) => `
                <li class="goals-item ${g.done ? "goals-item--done" : ""}">
                  <label class="goals-check">
                    <input type="checkbox" data-goal="${escapeHtml(g.id)}"${g.done ? " checked" : ""} />
                    <span class="visually-hidden">Mark "${escapeHtml(g.text)}" complete</span>
                  </label>
                  <span class="goals-item-text">${escapeHtml(g.text)}</span>
                  <button class="goals-delete" data-delete="${escapeHtml(g.id)}" type="button"
                          aria-label="Delete goal">×</button>
                </li>
              `).join("")}
            </ul>
          ` : ""}

          <div class="goals-add">
            <label class="visually-hidden" for="goals-input">New goal</label>
            <input id="goals-input" class="goals-input" type="text" maxlength="80"
                   placeholder="Add a goal for today" autocomplete="off" />
            <button id="goals-add" class="goals-add-btn" type="button">Add</button>
          </div>
        </div>`;

      bind();
    };

    const bind = () => {
      // The featured goal is derived at render time, so the handler looks it up
      // rather than closing over an id that a re-render would invalidate.
      container.querySelector("#goals-feature")?.addEventListener("click", () => {
        const next = (store.getState().goals || []).find((g) => !g.done);
        if (next) store.toggleGoal(next.id);
      });

      container.querySelectorAll("input[data-goal]").forEach((input) => {
        input.addEventListener("change", () => store.toggleGoal(input.dataset.goal));
      });

      container.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => store.deleteGoal(btn.dataset.delete));
      });

      const input = container.querySelector("#goals-input");
      const submit = () => {
        const text = input?.value || "";
        if (!text.trim()) return;
        store.addGoal(text);
      };

      container.querySelector("#goals-add")?.addEventListener("click", submit);

      // Enter submits; the click handler above covers the button.
      input?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        submit();
      });
    };

    unsubscribeStore = store.subscribe((key) => {
      if (key === "goals_updated") render();
    });

    render();

    return {
      unmount() {
        disposed = true;
        if (unsubscribeStore) unsubscribeStore();
      }
    };
  }
};
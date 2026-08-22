/* TODO Checklist & Protocol Habits Widget */
import { store } from "../state/store.js";

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const todoWidget = {
  name: "TODO & Protocols",
  icon: "check-square",

  mount(container) {
    const render = () => {
      const todos = store.getState().todos || [];

      container.innerHTML = `
        <div class="flex flex-col w-full h-full justify-between">
          <div class="todo-list-box" id="todo-items-container">
            ${todos.map(t => `
              <div class="todo-item-row ${t.completed ? "completed" : ""}" data-id="${escapeHtml(t.id)}">
                <input type="checkbox" ${t.completed ? "checked" : ""} class="rounded border-neutral-700 text-blue-600 focus:ring-0 cursor-pointer pointer-events-none" />
                <span class="text-sm font-medium text-neutral-200 flex-1">${escapeHtml(t.text)}</span>
              </div>
            `).join("")}
          </div>

          <form id="todo-add-form" class="mt-2 flex gap-2">
            <input type="text" id="todo-input" placeholder="New Protocol item..." class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500" />
            <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg text-xs font-semibold">+</button>
          </form>
        </div>
      `;

      container.querySelectorAll(".todo-item-row").forEach(row => {
        row.addEventListener("click", () => {
          store.toggleTodo(row.getAttribute("data-id"));
          render();
        });
      });

      const form = container.querySelector("#todo-add-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = container.querySelector("#todo-input");
        if (input && input.value.trim()) {
          store.addTodo(input.value);
          render();
        }
      });
    };

    render();
    return { unmount() {} };
  }
};

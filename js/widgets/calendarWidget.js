/* Interactive Calendar & Agenda Widget */
export const calendarWidget = {
  name: "Calendar & Schedule",
  icon: "calendar",

  mount(container) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const todayDate = now.getDate();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    let gridHtml = "";
    ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach(d => {
      gridHtml += `<div class="calendar-day-header">${d}</div>`;
    });

    for (let i = 0; i < firstDayIndex; i++) {
      gridHtml += `<div></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
      const isToday = day === todayDate;
      gridHtml += `<div class="calendar-day-cell ${isToday ? "today" : ""}">${day}</div>`;
    }

    container.innerHTML = `
      <div class="flex flex-col w-full h-full justify-between">
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-sm text-neutral-200">${monthNames[currentMonth]} ${currentYear}</span>
          <span class="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">Week ${Math.ceil(todayDate / 7)}</span>
        </div>

        <div class="calendar-widget-grid">
          ${gridHtml}
        </div>

        <div class="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-xs text-neutral-400">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>StandBy Deep Focus</span>
          </div>
          <span class="font-mono">10:30 AM</span>
        </div>
      </div>
    `;

    return {
      unmount() {}
    };
  }
};

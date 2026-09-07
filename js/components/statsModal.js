import { store } from '../state/store.js';
import { tursoSync } from '../state/tursoSync.js';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class StatsModal {
  constructor() {
    this.modalEl = document.getElementById("stats-modal");
    this.contentEl = document.getElementById("stats-modal-content");
    this.openBtn = document.getElementById("btn-stats");
    this.closeBtn = document.getElementById("btn-close-stats");

    this.activeTab = "overview"; // "overview" | "monthly" | "yearly" | "cloud"
    this.selectedMonth = new Date().toISOString().substring(0, 7); // "YYYY-MM"
    this.selectedYear = new Date().getFullYear(); // YYYY
    this.showAdminControls = false;

    this.initEvents();
  }

  initEvents() {
    if (this.openBtn) this.openBtn.addEventListener("click", () => this.open());
    if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.close());
    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }

    store.subscribe((event) => {
      if (
        event === 'stats_updated' ||
        event === 'turso_config_updated' ||
        event === 'cloud_state_merged' ||
        event === 'user_switched'
      ) {
        if (this.modalEl && this.modalEl.classList.contains("open")) {
          this.render();
        }
      }
    });
  }

  open() {
    this.render();
    if (this.modalEl) this.modalEl.classList.add("open");
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove("open");
  }

  formatMinutes(min) {
    if (!min || min <= 0) return "0m";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  formatHoursDecimal(min) {
    if (!min || min <= 0) return "0.0";
    return (min / 60).toFixed(1);
  }

  getLast7DaysData() {
    const dailyTotals = (store.getState().stats && store.getState().stats.dailyTotals) || {};
    const result = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = days[d.getDay()];
      const dayData = dailyTotals[dateStr] || { focusMinutes: 0, sessions: 0 };
      result.push({
        dateStr,
        dayName,
        focusMinutes: dayData.focusMinutes || 0,
        sessions: dayData.sessions || 0,
        isToday: i === 0
      });
    }
    return result;
  }

  renderOverviewChart(last7Days) {
    const maxMin = Math.max(...last7Days.map(d => d.focusMinutes), 60);
    const chartHeight = 120;

    const bars = last7Days.map((d, index) => {
      const barHeight = Math.max(8, Math.round((d.focusMinutes / maxMin) * (chartHeight - 32)));
      const x = index * 48 + 14;
      const y = chartHeight - barHeight - 20;
      const isToday = d.isToday;
      const fillColor = isToday ? 'url(#overviewTodayGrad)' : 'rgba(59, 130, 246, 0.45)';

      return `
        <g class="chart-bar-group cursor-pointer">
          <title>${d.dateStr}: ${d.focusMinutes}m (${d.sessions} sessions)</title>
          <rect x="${x}" y="8" width="28" height="${chartHeight - 30}" rx="6" fill="rgba(255,255,255,0.03)" />
          <rect x="${x}" y="${y}" width="28" height="${barHeight}" rx="6" fill="${fillColor}" class="transition-all duration-500" />
          <text x="${x + 14}" y="${chartHeight - 4}" font-size="10" font-weight="${isToday ? 'bold' : 'normal'}" fill="${isToday ? '#60a5fa' : '#9ca3af'}" text-anchor="middle" font-family="var(--font-sans)">${d.dayName}</text>
          <text x="${x + 14}" y="${Math.max(16, y - 4)}" font-size="9" font-family="var(--font-mono)" font-weight="600" fill="${isToday ? '#ffffff' : '#9ca3af'}" text-anchor="middle">${d.focusMinutes}m</text>
        </g>
      `;
    }).join("");

    return `
      <svg class="w-full h-36" viewBox="0 0 350 ${chartHeight}">
        <defs>
          <linearGradient id="overviewTodayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#60a5fa" />
            <stop offset="100%" stop-color="#2563eb" />
          </linearGradient>
        </defs>
        ${bars}
      </svg>
    `;
  }

  // --- Month-wise Analytics Calculations ---
  getMonthDaysData(monthStr) {
    const stats = store.getState().stats || {};
    const history = stats.history || [];
    const [yearStr, mStr] = monthStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(mStr, 10); // 1-12
    const daysInMonth = new Date(year, month, 0).getDate();

    const dayMap = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dayPad = String(d).padStart(2, "0");
      const fullDate = `${monthStr}-${dayPad}`;
      dayMap[fullDate] = { day: d, dateStr: fullDate, minutes: 0, sessions: 0 };
    }

    // Accumulate from history
    for (const s of history) {
      if (s.stage === 'focus' && s.dateStr && s.dateStr.startsWith(monthStr)) {
        if (dayMap[s.dateStr]) {
          dayMap[s.dateStr].minutes += (s.duration || 0);
          dayMap[s.dateStr].sessions += 1;
        }
      }
    }

    return Object.values(dayMap);
  }

  renderMonthlyChart(monthDays) {
    const maxMin = Math.max(...monthDays.map(d => d.minutes), 60);
    const chartHeight = 120;
    const count = monthDays.length;
    const totalWidth = 620;
    const barWidth = Math.max(8, Math.floor(totalWidth / count) - 4);

    const bars = monthDays.map((d, index) => {
      const barHeight = Math.max(4, Math.round((d.minutes / maxMin) * (chartHeight - 34)));
      const x = index * (barWidth + 4) + 6;
      const y = chartHeight - barHeight - 18;
      const hasFocus = d.minutes > 0;
      const fillColor = hasFocus ? 'url(#monthBarGrad)' : 'rgba(255,255,255,0.06)';

      return `
        <g class="chart-bar-group cursor-pointer">
          <title>Day ${d.day} (${d.dateStr}): ${d.minutes} mins (${d.sessions} sprints)</title>
          <rect x="${x}" y="8" width="${barWidth}" height="${chartHeight - 26}" rx="3" fill="rgba(255,255,255,0.02)" />
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${fillColor}" />
          ${(d.day === 1 || d.day === 5 || d.day === 10 || d.day === 15 || d.day === 20 || d.day === 25 || d.day === count) ? `
            <text x="${x + barWidth / 2}" y="${chartHeight - 4}" font-size="8" fill="#9ca3af" text-anchor="middle" font-family="var(--font-mono)">${d.day}</text>
          ` : ''}
        </g>
      `;
    }).join("");

    return `
      <svg class="w-full h-36" viewBox="0 0 ${totalWidth} ${chartHeight}">
        <defs>
          <linearGradient id="monthBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="#0284c7" />
          </linearGradient>
        </defs>
        ${bars}
      </svg>
    `;
  }

  // --- Year-wise Analytics Calculations ---
  getYearMonthsData(yearInt) {
    const stats = store.getState().stats || {};
    const history = stats.history || [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const result = [];

    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, "0");
      const monthPrefix = `${yearInt}-${mStr}`;
      let totalMin = 0;
      let totalSessions = 0;

      for (const s of history) {
        if (s.stage === 'focus' && s.dateStr && s.dateStr.startsWith(monthPrefix)) {
          totalMin += (s.duration || 0);
          totalSessions += 1;
        }
      }

      result.push({
        monthIndex: m,
        monthPrefix,
        name: monthNames[m - 1],
        minutes: totalMin,
        sessions: totalSessions
      });
    }

    return result;
  }

  renderYearlyChart(yearMonths) {
    const maxMin = Math.max(...yearMonths.map(m => m.minutes), 120);
    const chartHeight = 120;

    const bars = yearMonths.map((m, index) => {
      const barHeight = Math.max(6, Math.round((m.minutes / maxMin) * (chartHeight - 32)));
      const x = index * 28 + 10;
      const y = chartHeight - barHeight - 20;
      const hasFocus = m.minutes > 0;
      const fillColor = hasFocus ? 'url(#yearBarGrad)' : 'rgba(255,255,255,0.06)';

      return `
        <g class="chart-bar-group cursor-pointer">
          <title>${m.name} ${this.selectedYear}: ${this.formatMinutes(m.minutes)} (${m.sessions} sprints)</title>
          <rect x="${x}" y="8" width="20" height="${chartHeight - 28}" rx="4" fill="rgba(255,255,255,0.03)" />
          <rect x="${x}" y="${y}" width="20" height="${barHeight}" rx="4" fill="${fillColor}" />
          <text x="${x + 10}" y="${chartHeight - 4}" font-size="9" font-weight="${hasFocus ? 'bold' : 'normal'}" fill="${hasFocus ? '#c084fc' : '#9ca3af'}" text-anchor="middle" font-family="var(--font-sans)">${m.name}</text>
          ${hasFocus ? `
            <text x="${x + 10}" y="${Math.max(16, y - 4)}" font-size="8" font-family="var(--font-mono)" fill="#ffffff" text-anchor="middle">${Math.round(m.minutes / 60)}h</text>
          ` : ''}
        </g>
      `;
    }).join("");

    return `
      <svg class="w-full h-36" viewBox="0 0 350 ${chartHeight}">
        <defs>
          <linearGradient id="yearBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#c084fc" />
            <stop offset="100%" stop-color="#7c3aed" />
          </linearGradient>
        </defs>
        ${bars}
      </svg>
    `;
  }

  render() {
    if (!this.contentEl) return;
    const state = store.getState();
    const stats = state.stats || { history: [], dailyTotals: {}, streakDays: 1 };
    const turso = state.tursoConfig || {};
    const currentUser = state.currentUser || { userId: 'usr_default', displayName: 'Focus User' };

    const todayStr = new Date().toISOString().split('T')[0];
    const todayData = (stats.dailyTotals && stats.dailyTotals[todayStr]) || { focusMinutes: 0, sessions: 0 };
    const historyList = stats.history || [];

    // All-time stats calculation
    const allTimeMinutes = historyList.filter(s => s.stage === 'focus').reduce((acc, s) => acc + (s.duration || 0), 0);
    const allTimeSessions = historyList.filter(s => s.stage === 'focus').length;

    // This month stats
    const currentMonthStr = todayStr.substring(0, 7);
    const thisMonthMinutes = historyList.filter(s => s.stage === 'focus' && s.dateStr && s.dateStr.startsWith(currentMonthStr)).reduce((acc, s) => acc + (s.duration || 0), 0);

    // This year stats
    const currentYearStr = String(new Date().getFullYear());
    const thisYearMinutes = historyList.filter(s => s.stage === 'focus' && s.dateStr && s.dateStr.startsWith(currentYearStr)).reduce((acc, s) => acc + (s.duration || 0), 0);

    const isConnected = turso.isConnected && turso.url && turso.token;
    const lastSyncedText = turso.lastSyncedAt ? new Date(turso.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';

    this.contentEl.innerHTML = `
      <div class="space-y-5 text-sm text-neutral-200">
        
        <!-- User ID & Cross-Device Account Banner -->
        <div class="p-3.5 bg-gradient-to-r from-blue-950/40 via-neutral-900 to-purple-950/30 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold font-mono text-base">
              👤
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs text-white">${escapeHtml(currentUser.displayName || 'Focus User')}</span>
                <span class="px-2 py-0.5 text-[10px] font-mono rounded-full ${isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}">
                  ${isConnected ? '☁️ Cloud Synced' : '💾 Local Only'}
                </span>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-[11px] text-neutral-400 font-mono">User ID:</span>
                <span id="label-current-user-id" class="text-xs font-mono font-bold text-blue-300 select-all bg-white/5 px-2 py-0.5 rounded border border-white/5"><span id="active-user-id-display">${escapeHtml(currentUser.userId)}</span></span>
                <button id="btn-copy-user-id" class="text-[11px] text-neutral-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors" title="Copy User ID">
                  📋 Copy
                </button>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button id="btn-switch-user-modal" class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-300 transition-colors">
              🔄 Switch ID / Device
            </button>
            <button id="btn-sync-trigger" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg transition-all flex items-center gap-1.5">
              <span>Sync Cloud</span>
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/5">
          <button class="flex-1 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'overview' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white hover:bg-white/5'}" data-tab="overview">
            📊 Overview
          </button>
          <button class="flex-1 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'monthly' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white hover:bg-white/5'}" data-tab="monthly">
            📅 Month-wise
          </button>
          <button class="flex-1 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'yearly' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white hover:bg-white/5'}" data-tab="yearly">
            📈 Year-wise
          </button>
          <button class="flex-1 py-2 rounded-xl text-xs font-bold transition-all ${this.activeTab === 'cloud' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white hover:bg-white/5'}" data-tab="cloud">
            📱 Devices &amp; Sync
          </button>
        </div>

        <!-- TAB 1: OVERVIEW -->
        ${this.activeTab === 'overview' ? `
          <!-- Summary Metrics Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-3.5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Today's Focus</span>
              <div class="mt-2">
                <div class="text-2xl font-extrabold text-white font-mono">${this.formatMinutes(todayData.focusMinutes)}</div>
                <div class="text-[10px] text-blue-400 mt-0.5">${todayData.sessions} sprint${todayData.sessions === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div class="p-3.5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Daily Streak</span>
              <div class="mt-2">
                <div class="text-2xl font-extrabold text-amber-400 flex items-center gap-1.5 font-mono">
                  <span>🔥</span>
                  <span>${stats.streakDays || 1}</span>
                  <span class="text-xs text-neutral-400 font-sans font-medium">Days</span>
                </div>
                <div class="text-[10px] text-neutral-400 mt-0.5">Consecutive focus</div>
              </div>
            </div>

            <div class="p-3.5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">This Month</span>
              <div class="mt-2">
                <div class="text-2xl font-extrabold text-sky-400 font-mono">${this.formatMinutes(thisMonthMinutes)}</div>
                <div class="text-[10px] text-neutral-400 mt-0.5">${new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}</div>
              </div>
            </div>

            <div class="p-3.5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">All-Time Focus</span>
              <div class="mt-2">
                <div class="text-2xl font-extrabold text-purple-400 font-mono">${this.formatMinutes(allTimeMinutes)}</div>
                <div class="text-[10px] text-neutral-400 mt-0.5">${allTimeSessions} deep sprints</div>
              </div>
            </div>
          </div>

          <!-- 7-Day Focus Activity Chart -->
          <div class="p-4 bg-white/5 rounded-2xl border border-white/5">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>7-Day Focus Activity</span>
              </h4>
              <span class="text-[10px] font-mono text-neutral-400">Total: ${this.formatMinutes(this.getLast7DaysData().reduce((acc, d) => acc + d.focusMinutes, 0))}</span>
            </div>
            <div class="w-full flex items-center justify-center">
              ${this.renderOverviewChart(this.getLast7DaysData())}
            </div>
          </div>

          <!-- Recent Sessions -->
          <div class="p-4 bg-white/5 rounded-2xl border border-white/5">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Recent Focus Sprints</span>
              </h4>
              <span class="text-[10px] text-neutral-400">${historyList.length} recorded</span>
            </div>
            <div class="space-y-2 max-h-36 overflow-y-auto pr-1">
              ${historyList.length === 0 ? `
                <div class="text-center py-4 text-xs text-neutral-500 font-mono">No recorded focus sprints yet. Start a Pomodoro timer to log progress!</div>
              ` : historyList.slice(0, 8).map(s => `
                <div class="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5 text-xs">
                  <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full ${s.stage === 'focus' ? 'bg-blue-500' : s.stage === 'shortBreak' ? 'bg-emerald-500' : 'bg-purple-500'}"></span>
                    <span class="font-bold text-neutral-200 capitalize">${s.stage === 'focus' ? 'Focus Sprint' : s.stage === 'shortBreak' ? 'Short Recharge' : 'Long Recovery'}</span>
                    <span class="text-[10px] font-mono text-neutral-400">${s.dateStr}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-blue-400">${s.duration}m</span>
                    <span class="text-[10px] text-neutral-500">${s.timeStr || ''}</span>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ''}

        <!-- TAB 2: MONTH-WISE ANALYTICS -->
        ${this.activeTab === 'monthly' ? `
          <div class="space-y-4">
            <!-- Month Selector & Key Metrics Header -->
            <div class="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <label class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Select Month:</label>
                <input type="month" id="input-select-month" value="${this.selectedMonth}" class="bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none" />
              </div>
              
              <div class="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span class="text-neutral-400">Total:</span>
                  <span class="text-white font-bold ml-1">${this.formatMinutes(this.getMonthDaysData(this.selectedMonth).reduce((acc, d) => acc + d.minutes, 0))}</span>
                </div>
                <div>
                  <span class="text-neutral-400">Hours:</span>
                  <span class="text-sky-400 font-bold ml-1">${this.formatHoursDecimal(this.getMonthDaysData(this.selectedMonth).reduce((acc, d) => acc + d.minutes, 0))} hrs</span>
                </div>
              </div>
            </div>

            <!-- Month Metrics Grid -->
            ${(() => {
              const monthData = this.getMonthDaysData(this.selectedMonth);
              const totalMin = monthData.reduce((acc, d) => acc + d.minutes, 0);
              const activeDays = monthData.filter(d => d.minutes > 0).length;
              const dailyAvg = activeDays > 0 ? Math.round(totalMin / activeDays) : 0;
              const peakDay = [...monthData].sort((a, b) => b.minutes - a.minutes)[0];
              const totalSessions = monthData.reduce((acc, d) => acc + d.sessions, 0);

              return `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Month Focus Time</div>
                    <div class="text-xl font-bold font-mono text-white mt-1">${this.formatMinutes(totalMin)}</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">${totalSessions} sessions logged</div>
                  </div>
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Active Days</div>
                    <div class="text-xl font-bold font-mono text-blue-400 mt-1">${activeDays} / ${monthData.length}</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">${Math.round((activeDays / monthData.length) * 100)}% consistency</div>
                  </div>
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Daily Average</div>
                    <div class="text-xl font-bold font-mono text-emerald-400 mt-1">${this.formatMinutes(dailyAvg)}</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">on active focus days</div>
                  </div>
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Peak Focus Day</div>
                    <div class="text-xl font-bold font-mono text-purple-400 mt-1">${peakDay && peakDay.minutes > 0 ? `${peakDay.minutes}m` : '0m'}</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">${peakDay && peakDay.minutes > 0 ? peakDay.dateStr : 'No data'}</div>
                  </div>
                </div>

                <!-- Daily Breakdown Chart of the Selected Month -->
                <div class="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div class="flex items-center justify-between mb-3">
                    <h4 class="text-xs font-bold text-white uppercase tracking-wider">
                      Daily Focus Distribution (${this.selectedMonth})
                    </h4>
                    <span class="text-[10px] font-mono text-neutral-400">Hover bars to view details</span>
                  </div>
                  <div class="w-full flex items-center justify-center overflow-x-auto">
                    ${this.renderMonthlyChart(monthData)}
                  </div>
                </div>
              `;
            })()}
          </div>
        ` : ''}

        <!-- TAB 3: YEAR-WISE ANALYTICS -->
        ${this.activeTab === 'yearly' ? `
          <div class="space-y-4">
            <!-- Year Selector & Annual Summary Header -->
            <div class="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <label class="text-xs font-bold text-neutral-400 uppercase tracking-wider">Select Year:</label>
                <select id="select-active-year" class="bg-neutral-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-purple-500 focus:outline-none">
                  ${[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => `
                    <option value="${y}" ${this.selectedYear === y ? 'selected' : ''}>${y}</option>
                  `).join("")}
                </select>
              </div>

              <div class="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span class="text-neutral-400">Annual Hours:</span>
                  <span class="text-purple-400 font-bold ml-1">${this.formatHoursDecimal(this.getYearMonthsData(this.selectedYear).reduce((acc, m) => acc + m.minutes, 0))} hrs</span>
                </div>
              </div>
            </div>

            <!-- Year Metrics Grid -->
            ${(() => {
              const yearMonths = this.getYearMonthsData(this.selectedYear);
              const totalMin = yearMonths.reduce((acc, m) => acc + m.minutes, 0);
              const totalSessions = yearMonths.reduce((acc, m) => acc + m.sessions, 0);
              const bestMonth = [...yearMonths].sort((a, b) => b.minutes - a.minutes)[0];
              const activeMonthsCount = yearMonths.filter(m => m.minutes > 0).length;

              return `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Total Annual Focus</div>
                    <div class="text-xl font-bold font-mono text-white mt-1">${this.formatMinutes(totalMin)}</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">${totalSessions} total sprints</div>
                  </div>
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Annual Hours</div>
                    <div class="text-xl font-bold font-mono text-purple-400 mt-1">${(totalMin / 60).toFixed(1)} hrs</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">Deep productive work</div>
                  </div>
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Best Month</div>
                    <div class="text-xl font-bold font-mono text-emerald-400 mt-1">${bestMonth && bestMonth.minutes > 0 ? bestMonth.name : 'N/A'}</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">${bestMonth && bestMonth.minutes > 0 ? `${this.formatMinutes(bestMonth.minutes)}` : 'No data yet'}</div>
                  </div>
                  <div class="p-3 bg-black/40 rounded-xl border border-white/5">
                    <div class="text-[10px] text-neutral-400 uppercase font-bold">Monthly Average</div>
                    <div class="text-xl font-bold font-mono text-amber-400 mt-1">${activeMonthsCount > 0 ? this.formatMinutes(Math.round(totalMin / activeMonthsCount)) : '0m'}</div>
                    <div class="text-[10px] text-neutral-500 mt-0.5">${activeMonthsCount} active month${activeMonthsCount === 1 ? '' : 's'}</div>
                  </div>
                </div>

                <!-- 12-Month Bar Chart -->
                <div class="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div class="flex items-center justify-between mb-3">
                    <h4 class="text-xs font-bold text-white uppercase tracking-wider">
                      12-Month Focus Comparison (${this.selectedYear})
                    </h4>
                    <span class="text-[10px] font-mono text-neutral-400">Total: ${this.formatMinutes(totalMin)}</span>
                  </div>
                  <div class="w-full flex items-center justify-center">
                    ${this.renderYearlyChart(yearMonths)}
                  </div>
                </div>
              `;
            })()}
          </div>
        ` : ''}

        <!-- TAB 4: DEVICES & SYNC (Consumer-friendly with hidden Admin DB config) -->
        ${this.activeTab === 'cloud' ? `
          <div class="space-y-4">
            
            <!-- Cross-Device User Access Card -->
            <div class="p-5 bg-gradient-to-r from-blue-950/40 via-neutral-900 to-purple-950/30 rounded-2xl border border-white/10 space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-2xl">📱</span>
                <div>
                  <h4 class="font-bold text-sm text-white">Switch Profile or Use on Multiple Devices</h4>
                  <p class="text-xs text-neutral-400 mt-0.5">Enter your unique User ID on any other phone, tablet, or laptop to sync your entire focus history in seconds.</p>
                </div>
              </div>

              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                <input type="text" id="input-switch-userid" placeholder="Paste your User ID here (e.g. usr_...)" class="flex-1 bg-black/60 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none placeholder-neutral-500" />
                <button id="btn-load-user-id" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition-all whitespace-nowrap">
                  Load Profile &amp; Data
                </button>
                <button id="btn-create-new-user-id" class="px-3.5 py-2.5 bg-white/10 hover:bg-white/15 text-neutral-200 text-xs font-bold rounded-xl transition-colors whitespace-nowrap">
                  Generate New ID
                </button>
              </div>
              <div id="user-sync-feedback" class="text-[11px] font-mono text-neutral-400"></div>
            </div>

            <!-- Seamless Cloud Sync Status (No raw secrets visible to user) -->
            <div class="p-4 bg-neutral-900/60 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl ${isConnected ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'} flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h4 class="font-bold text-xs text-white">Cloud Backup &amp; Synchronization</h4>
                    <span class="px-2 py-0.5 text-[10px] font-mono rounded-full ${isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-700/40 text-neutral-400'}">
                      ${isConnected ? 'Active & Healthy' : 'Offline / Standby'}
                    </span>
                  </div>
                  <p class="text-[11px] text-neutral-400 mt-0.5">Sessions are securely archived. Last synchronized: <span class="font-mono text-neutral-300 font-bold">${lastSyncedText}</span></p>
                </div>
              </div>

              <div class="flex items-center gap-2 self-end sm:self-center">
                <button id="btn-user-sync-now" class="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  <span>Sync Now</span>
                </button>
              </div>
            </div>

            <!-- Admin Infrastructure Drawer (Collapsed by default, accessible if needed) -->
            <div class="pt-2">
              <button id="btn-toggle-admin-drawer" class="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1">
                <span>⚙️ Developer / Admin Database Controls</span>
                <span id="admin-drawer-icon" class="text-[10px] transition-transform font-mono">${this.showAdminControls ? '▲' : '▼'}</span>
              </button>

              <div id="admin-db-drawer" class="${this.showAdminControls ? 'block' : 'hidden'} mt-3 p-4 bg-black/50 rounded-2xl border border-white/10 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-bold text-neutral-300">Edge Database Endpoint (Backend / GitHub Secrets)</div>
                  <label class="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
                    <input type="checkbox" id="chk-turso-autosync" ${turso.autoSync ? "checked" : ""} class="rounded" />
                    <span>Auto-Sync</span>
                  </label>
                </div>

                <div class="space-y-2">
                  <div>
                    <label class="text-[10px] text-neutral-500 font-mono block mb-1">TURSO_DATABASE_URL</label>
                    <input type="text" id="input-turso-url" placeholder="https://..." value="${turso.url || ''}" class="w-full bg-neutral-950 border border-white/10 rounded-xl p-2 text-xs text-neutral-300 font-mono" />
                  </div>
                  <div>
                    <label class="text-[10px] text-neutral-500 font-mono block mb-1">TURSO_AUTH_TOKEN</label>
                    <input type="password" id="input-turso-token" placeholder="JWT Auth Token" value="${turso.token || ''}" class="w-full bg-neutral-950 border border-white/10 rounded-xl p-2 text-xs text-neutral-300 font-mono" />
                  </div>
                </div>

                <div class="flex items-center justify-between pt-2 border-t border-white/10">
                  <div id="turso-status-feedback" class="text-[11px] font-mono ${turso.lastError ? 'text-red-400' : isConnected ? 'text-emerald-400' : 'text-neutral-400'}">
                    ${turso.lastError ? `Error: ${turso.lastError}` : isConnected ? `Connected to Database` : 'Disconnected'}
                  </div>
                  <button id="btn-turso-test" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/15 text-neutral-200 transition-colors">
                    Test Connection
                  </button>
                </div>
              </div>
            </div>

          </div>
        ` : ''}

      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // 1. Tab Switching
    this.contentEl.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.getAttribute("data-tab");
        this.render();
      });
    });

    // 2. Copy User ID
    const btnCopy = this.contentEl.querySelector("#btn-copy-user-id");
    if (btnCopy) {
      btnCopy.addEventListener("click", async () => {
        const userId = (store.getState().currentUser && store.getState().currentUser.userId) || '';
        try {
          await navigator.clipboard.writeText(userId);
          btnCopy.textContent = "✓ Copied!";
          setTimeout(() => { btnCopy.textContent = "📋 Copy"; }, 2000);
        } catch (e) {
          btnCopy.textContent = "ID: " + userId;
        }
      });
    }

    // 3. Switch User Modal shortcut
    const btnSwitchUserModal = this.contentEl.querySelector("#btn-switch-user-modal");
    if (btnSwitchUserModal) {
      btnSwitchUserModal.addEventListener("click", () => {
        this.activeTab = "cloud";
        this.render();
      });
    }

    // 4. Quick Sync Trigger button in header
    const btnSyncTrigger = this.contentEl.querySelector("#btn-sync-trigger");
    if (btnSyncTrigger) {
      btnSyncTrigger.addEventListener("click", async () => {
        btnSyncTrigger.textContent = "Syncing...";
        try {
          await tursoSync.pushToCloud();
          await tursoSync.pullFromCloud();
          btnSyncTrigger.textContent = "✓ Synced";
          setTimeout(() => { this.render(); }, 1000);
        } catch (e) {
          btnSyncTrigger.textContent = "Error";
          setTimeout(() => { this.render(); }, 1500);
        }
      });
    }

    // 5. Month-wise selector
    const inputMonth = this.contentEl.querySelector("#input-select-month");
    if (inputMonth) {
      inputMonth.addEventListener("change", (e) => {
        if (e.target.value) {
          this.selectedMonth = e.target.value;
          this.render();
        }
      });
    }

    // 6. Year-wise selector
    const selectYear = this.contentEl.querySelector("#select-active-year");
    if (selectYear) {
      selectYear.addEventListener("change", (e) => {
        if (e.target.value) {
          this.selectedYear = parseInt(e.target.value, 10);
          this.render();
        }
      });
    }

    // 7. Load User ID on new device
    const btnLoadUser = this.contentEl.querySelector("#btn-load-user-id");
    const inputSwitchId = this.contentEl.querySelector("#input-switch-userid");
    const userFeedback = this.contentEl.querySelector("#user-sync-feedback");

    if (btnLoadUser && inputSwitchId) {
      btnLoadUser.addEventListener("click", async () => {
        const targetId = inputSwitchId.value.trim();
        if (!targetId) {
          if (userFeedback) userFeedback.innerHTML = '<span class="text-amber-400">Please enter a User ID to load.</span>';
          return;
        }
        if (userFeedback) userFeedback.innerHTML = '<span class="text-blue-400 animate-pulse">Connecting to Turso DB and loading profile...</span>';
        try {
          await tursoSync.loginWithUserId(targetId);
          if (userFeedback) userFeedback.innerHTML = `<span class="text-emerald-400 font-bold">✓ Profile "${escapeHtml(targetId)}" successfully loaded and synced!</span>`;
          setTimeout(() => {
            this.activeTab = "overview";
            this.render();
          }, 1200);
        } catch (err) {
          if (userFeedback) userFeedback.innerHTML = `<span class="text-red-400">✗ Failed to load: ${escapeHtml(err.message)}</span>`;
        }
      });
    }

    // 8. Generate New User ID
    const btnCreateNew = this.contentEl.querySelector("#btn-create-new-user-id");
    if (btnCreateNew) {
      btnCreateNew.addEventListener("click", async () => {
        const newId = "usr_" + Math.random().toString(36).substring(2, 8) + Date.now().toString(36).slice(-4);
        store.setUserId(newId, "User " + newId.slice(-4).toUpperCase());
        if (userFeedback) userFeedback.innerHTML = `<span class="text-emerald-400">Generated new ID: ${escapeHtml(newId)}. Registering in cloud...</span>`;
        try {
          await tursoSync.pushToCloud();
          if (userFeedback) userFeedback.innerHTML = `<span class="text-emerald-400 font-bold">✓ New profile created and active: ${escapeHtml(newId)}</span>`;
          setTimeout(() => { this.render(); }, 1200);
        } catch (err) {
          if (userFeedback) userFeedback.innerHTML = `<span class="text-amber-400">ID created locally: ${escapeHtml(newId)} (offline)</span>`;
          setTimeout(() => { this.render(); }, 1200);
        }
      });
    }

    // 9. Turso DB Configuration Controls
    const inputUrl = this.contentEl.querySelector('#input-turso-url');
    const inputToken = this.contentEl.querySelector('#input-turso-token');
    const chkAuto = this.contentEl.querySelector('#chk-turso-autosync');
    const feedbackEl = this.contentEl.querySelector('#turso-status-feedback');

    const saveTurso = () => {
      if (inputUrl && inputToken && chkAuto) {
        store.updateTursoConfig({
          url: inputUrl.value.trim(),
          token: inputToken.value.trim(),
          autoSync: chkAuto.checked
        });
      }
    };

    if (inputUrl) inputUrl.addEventListener('change', saveTurso);
    if (inputToken) inputToken.addEventListener('change', saveTurso);
    if (chkAuto) chkAuto.addEventListener('change', saveTurso);

    const btnTest = this.contentEl.querySelector('#btn-turso-test');
    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        saveTurso();
        const url = inputUrl.value.trim();
        const token = inputToken.value.trim();
        if (!url || !token) {
          if (feedbackEl) feedbackEl.innerHTML = '<span class="text-amber-400">Please enter URL and Token first.</span>';
          return;
        }
        if (feedbackEl) feedbackEl.innerHTML = '<span class="text-blue-400 animate-pulse">Testing connection...</span>';
        try {
          await tursoSync.testConnection(url, token);
          await tursoSync.initSchema();
          await tursoSync.pullFromCloud();
          if (feedbackEl) feedbackEl.innerHTML = '<span class="text-emerald-400 font-bold">✓ Connected &amp; Synced with Turso DB!</span>';
          this.render();
        } catch (err) {
          if (feedbackEl) feedbackEl.innerHTML = `<span class="text-red-400">✗ ${escapeHtml(err.message)}</span>`;
        }
      });
    }

    // 10. User-facing Sync Now button in Devices & Sync tab
    const btnUserSyncNow = this.contentEl.querySelector('#btn-user-sync-now');
    if (btnUserSyncNow) {
      btnUserSyncNow.addEventListener('click', async () => {
        btnUserSyncNow.innerHTML = '<span>Syncing...</span>';
        try {
          await tursoSync.pushToCloud();
          await tursoSync.pullFromCloud();
          btnUserSyncNow.innerHTML = '<span>✓ Synced!</span>';
          setTimeout(() => { this.render(); }, 1200);
        } catch (err) {
          btnUserSyncNow.innerHTML = '<span>Error</span>';
          setTimeout(() => { this.render(); }, 1500);
        }
      });
    }

    // 11. Admin Drawer Toggle
    const btnToggleAdmin = this.contentEl.querySelector('#btn-toggle-admin-drawer');
    if (btnToggleAdmin) {
      btnToggleAdmin.addEventListener('click', () => {
        this.showAdminControls = !this.showAdminControls;
        const drawerEl = this.contentEl.querySelector('#admin-db-drawer');
        const iconEl = this.contentEl.querySelector('#admin-drawer-icon');
        if (drawerEl) {
          drawerEl.classList.toggle('hidden', !this.showAdminControls);
          drawerEl.classList.toggle('block', this.showAdminControls);
        }
        if (iconEl) {
          iconEl.textContent = this.showAdminControls ? '▲' : '▼';
        }
      });
    }
  }
}


import { store } from '../state/store.js';
import { tursoSync } from '../state/tursoSync.js';

export class StatsModal {
  constructor() {
    this.modalEl = document.getElementById("stats-modal");
    this.contentEl = document.getElementById("stats-modal-content");
    this.openBtn = document.getElementById("btn-stats");
    this.closeBtn = document.getElementById("btn-close-stats");

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
        event === 'cloud_state_merged'
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

  renderChart(last7Days) {
    const maxMin = Math.max(...last7Days.map(d => d.focusMinutes), 60);
    const chartHeight = 120;

    const bars = last7Days.map((d, index) => {
      const barHeight = Math.max(8, Math.round((d.focusMinutes / maxMin) * (chartHeight - 30)));
      const x = index * 52 + 18;
      const y = chartHeight - barHeight - 20;
      const isToday = d.isToday;
      const fillColor = isToday ? 'url(#todayGradient)' : 'rgba(59, 130, 246, 0.45)';

      return `
        <g class="chart-bar-group cursor-pointer">
          <title>${d.dateStr}: ${d.focusMinutes}m (${d.sessions} sessions)</title>
          <!-- Background track -->
          <rect x="${x}" y="10" width="28" height="${chartHeight - 30}" rx="6" fill="rgba(255,255,255,0.03)" />
          <!-- Animated Fill Bar -->
          <rect x="${x}" y="${y}" width="28" height="${barHeight}" rx="6" fill="${fillColor}" class="transition-all duration-700" />
          <!-- Day Label -->
          <text x="${x + 14}" y="${chartHeight}" font-size="10" font-weight="${isToday ? 'bold' : 'normal'}" fill="${isToday ? '#60a5fa' : '#9ca3af'}" text-anchor="middle" font-family="var(--font-sans)">${d.dayName}</text>
          <!-- Minutes Label on top of bar -->
          <text x="${x + 14}" y="${Math.max(16, y - 4)}" font-size="9" font-family="var(--font-mono)" font-weight="600" fill="${isToday ? '#ffffff' : '#9ca3af'}" text-anchor="middle">${d.focusMinutes}m</text>
        </g>
      `;
    }).join("");

    return `
      <svg class="w-full h-36" viewBox="0 0 380 ${chartHeight}">
        <defs>
          <linearGradient id="todayGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#60a5fa" />
            <stop offset="100%" stop-color="#2563eb" />
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
    const todayStr = new Date().toISOString().split('T')[0];
    const todayData = (stats.dailyTotals && stats.dailyTotals[todayStr]) || { focusMinutes: 0, sessions: 0 };
    const last7Days = this.getLast7DaysData();
    const historyList = stats.history || [];

    const formatMinutes = (min) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    };

    const isConnected = turso.isConnected && turso.url && turso.token;
    const lastSyncedText = turso.lastSyncedAt ? new Date(turso.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';

    this.contentEl.innerHTML = `
      <div class="space-y-6 text-sm text-neutral-200">
        
        <!-- Summary Stats Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          <div class="p-3.5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Today's Focus</span>
            <div class="mt-2">
              <div class="text-2xl font-extrabold text-white font-mono">${formatMinutes(todayData.focusMinutes)}</div>
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
            <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Total Sprints</span>
            <div class="mt-2">
              <div class="text-2xl font-extrabold text-purple-400 font-mono">${historyList.length}</div>
              <div class="text-[10px] text-neutral-400 mt-0.5">Recorded sessions</div>
            </div>
          </div>

          <div class="p-3.5 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-between">
            <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Turso Cloud Sync</span>
            <div class="mt-2">
              <div class="flex items-center gap-1.5 font-bold text-xs ${isConnected ? 'text-emerald-400' : 'text-amber-400'}">
                <span class="w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}"></span>
                <span>${isConnected ? 'Cloud Active' : 'Local Only'}</span>
              </div>
              <div class="text-[10px] text-neutral-400 mt-0.5">Synced: ${lastSyncedText}</div>
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
            <span class="text-[10px] font-mono text-neutral-400">Total: ${formatMinutes(last7Days.reduce((acc, d) => acc + d.focusMinutes, 0))}</span>
          </div>
          <div class="w-full flex items-center justify-center">
            ${this.renderChart(last7Days)}
          </div>
        </div>

        <!-- Recent Deep Work Sprints History -->
        <div class="p-4 bg-white/5 rounded-2xl border border-white/5">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>Recent Deep Work Sprints</span>
            </h4>
            <span class="text-[10px] text-neutral-400">${historyList.length} entries</span>
          </div>
          <div class="space-y-2 max-h-40 overflow-y-auto pr-1">
            ${historyList.length === 0 ? `
              <div class="text-center py-4 text-xs text-neutral-500 font-mono">No recorded focus sprints yet. Complete a Pomodoro session to log progress!</div>
            ` : historyList.slice(0, 10).map(s => `
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

        <!-- Turso DB Cloud Persistence Settings -->
        <div class="p-4 bg-gradient-to-r from-neutral-900 to-blue-950/30 rounded-2xl border border-white/10 space-y-4 shadow-xl">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
              </div>
              <div>
                <h4 class="font-bold text-xs text-white">Turso DB (LibSQL) Cloud Sync</h4>
                <div class="text-[11px] text-neutral-400">Encrypts & syncs your progress, streaks, and settings to your private cloud SQLite</div>
              </div>
            </div>
            <label class="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input type="checkbox" id="chk-turso-autosync" ${turso.autoSync ? "checked" : ""} class="rounded" />
              <span>Auto-Sync</span>
            </label>
          </div>

          <div class="space-y-2.5">
            <div>
              <label class="text-[11px] font-semibold text-neutral-400 block mb-1">Turso Database URL (or LibSQL URL)</label>
              <input type="text" id="input-turso-url" placeholder="https://standby-db-yourusername.turso.io" value="${turso.url || ''}" class="w-full bg-neutral-950 border border-white/10 rounded-xl p-2.5 text-xs text-white font-mono" />
            </div>
            <div>
              <label class="text-[11px] font-semibold text-neutral-400 block mb-1">Turso Auth Token</label>
              <input type="password" id="input-turso-token" placeholder="eyJhbGciOi..." value="${turso.token || ''}" class="w-full bg-neutral-950 border border-white/10 rounded-xl p-2.5 text-xs text-white font-mono" />
            </div>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-white/10">
            <div id="turso-status-feedback" class="text-[11px] font-mono ${turso.lastError ? 'text-red-400' : isConnected ? 'text-emerald-400' : 'text-neutral-400'}">
              ${turso.lastError ? `Error: ${turso.lastError}` : isConnected ? `Connected & Synced (${lastSyncedText})` : 'Enter credentials to connect'}
            </div>
            <div class="flex items-center gap-2">
              <button id="btn-turso-test" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/15 text-neutral-200 transition-colors">
                Test Connection
              </button>
              <button id="btn-turso-sync-now" class="px-4 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-all flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>Sync Now</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const inputUrl = this.contentEl.querySelector('#input-turso-url');
    const inputToken = this.contentEl.querySelector('#input-turso-token');
    const chkAuto = this.contentEl.querySelector('#chk-turso-autosync');
    const feedbackEl = this.contentEl.querySelector('#turso-status-feedback');

    const saveTurso = () => {
      store.updateTursoConfig({
        url: inputUrl.value.trim(),
        token: inputToken.value.trim(),
        autoSync: chkAuto.checked
      });
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
          if (feedbackEl) feedbackEl.innerHTML = '<span class="text-emerald-400 font-bold">✓ Connection Successful & Schema Initialized!</span>';
        } catch (err) {
          if (feedbackEl) feedbackEl.innerHTML = `<span class="text-red-400">✗ ${err.message}</span>`;
        }
      });
    }

    const btnSync = this.contentEl.querySelector('#btn-turso-sync-now');
    if (btnSync) {
      btnSync.addEventListener('click', async () => {
        saveTurso();
        if (feedbackEl) feedbackEl.innerHTML = '<span class="text-blue-400 animate-pulse">Syncing with Turso DB...</span>';
        try {
          await tursoSync.pushToCloud();
          await tursoSync.pullFromCloud();
          if (feedbackEl) feedbackEl.innerHTML = '<span class="text-emerald-400 font-bold">✓ Sync Complete!</span>';
          this.render();
        } catch (err) {
          if (feedbackEl) feedbackEl.innerHTML = `<span class="text-red-400">✗ ${err.message}</span>`;
        }
      });
    }
  }
}

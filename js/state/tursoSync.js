import { store } from './store.js';

export class TursoSync {
  constructor() {
    this.isSyncing = false;
    this.syncDebounceTimer = null;
    this.init();
  }

  init() {
    // Auto-init on load if credentials exist
    const cfg = store.getState().tursoConfig;
    if (cfg && cfg.url && cfg.token) {
      this.initSchema().then(() => {
        if (cfg.autoSync) {
          this.pullFromCloud();
        }
      });
    }

    // Subscribe to store updates to trigger debounced auto-sync
    store.subscribe((event, payload) => {
      if (
        event === 'pomo_completed' ||
        event === 'stats_updated' ||
        event === 'todos_updated' ||
        event === 'tally_updated' ||
        event === 'space_updated' ||
        event === 'clock_config_updated' ||
        event === 'turso_sync_triggered'
      ) {
        const config = store.getState().tursoConfig;
        if (config && config.url && config.token && config.autoSync) {
          this.scheduleDebouncedSync();
        }
      } else if (event === 'session_deleted') {
        if (payload && payload.sessionId) this.deleteCloudSession(payload.sessionId);
      } else if (event === 'session_updated') {
        if (payload && payload.sessionId && payload.newDuration) {
          this.updateCloudSessionDuration(payload.sessionId, payload.newDuration);
        }
      } else if (event === 'user_switched') {
        this.pullFromCloud();
      }
    });
  }

  formatTursoUrl(url) {
    if (!url) return '';
    let clean = url.trim();
    if (clean.startsWith('libsql://')) {
      clean = clean.replace('libsql://', 'https://');
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    clean = clean.replace(/\/+$/, '');
    if (!clean.endsWith('/v2/pipeline')) {
      clean = clean + '/v2/pipeline';
    }
    return clean;
  }

  async executeStatements(statements) {
    const cfg = store.getState().tursoConfig;
    if (!cfg || !cfg.url || !cfg.token) {
      throw new Error('Turso Database URL or Token is missing.');
    }

    const isProxy = cfg.url === '/api/sync' || (typeof window !== 'undefined' && window.location && cfg.url === `${window.location.origin}/api/sync`);
    const endpoint = isProxy ? cfg.url : this.formatTursoUrl(cfg.url);
    const requests = statements.map(stmt => {
      if (typeof stmt === 'string') {
        return { type: 'execute', stmt: { sql: stmt } };
      }
      return { type: 'execute', stmt };
    });

    requests.push({ type: 'close' });

    const headers = { 'Content-Type': 'application/json' };
    if (!isProxy && cfg.token) {
      headers['Authorization'] = `Bearer ${cfg.token.trim()}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requests })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Turso HTTP ${response.status}: ${errText}`);
    }

    return await response.json();
  }

  async incrementGlobalViews() {
    const cfg = store.getState().tursoConfig;
    if (!cfg || !cfg.url || !cfg.token) return null;
    try {
      const now = Date.now();
      const res = await this.executeStatements([
        {
          sql: `INSERT INTO standby_global_views (id, views_count, updated_at)
                VALUES ('global', 1, ?)
                ON CONFLICT(id) DO UPDATE SET views_count = standby_global_views.views_count + 1, updated_at = excluded.updated_at;`,
          args: [{ type: 'integer', value: String(now) }]
        },
        {
          sql: `SELECT views_count FROM standby_global_views WHERE id = 'global';`
        }
      ]);
      const resultObj = res.results && res.results[1];
      if (resultObj && resultObj.response && resultObj.response.result && resultObj.response.result.rows && resultObj.response.result.rows.length > 0) {
        const count = parseInt(resultObj.response.result.rows[0][0].value, 10);
        return count;
      }
    } catch (e) {
      console.warn('incrementGlobalViews error:', e);
    }
    return null;
  }

  async testConnection(url, token) {
    const endpoint = this.formatTursoUrl(url);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: 'SELECT 1 AS connected;' } },
          { type: 'close' }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Connection failed (${response.status}): ${errText}`);
    }

    return true;
  }

  async initSchema() {
    try {
      const schemaSqls = [
        `CREATE TABLE IF NOT EXISTS standby_users (
          id TEXT PRIMARY KEY,
          display_name TEXT,
          created_at INTEGER,
          last_active_at INTEGER
        );`,
        `CREATE TABLE IF NOT EXISTS standby_user_focus_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL,
          completed_at INTEGER NOT NULL,
          date_str TEXT NOT NULL,
          month_str TEXT NOT NULL,
          year_int INTEGER NOT NULL
        );`,
        `CREATE INDEX IF NOT EXISTS idx_user_sessions ON standby_user_focus_sessions(user_id, date_str);`,
        `CREATE TABLE IF NOT EXISTS standby_sessions (
          id TEXT PRIMARY KEY,
          stage TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL,
          completed_at INTEGER NOT NULL,
          date_str TEXT NOT NULL,
          time_str TEXT NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS standby_daily_stats (
          date_str TEXT PRIMARY KEY,
          total_focus_minutes INTEGER NOT NULL DEFAULT 0,
          completed_sessions INTEGER NOT NULL DEFAULT 0,
          water_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS standby_global_views (
          id TEXT PRIMARY KEY,
          views_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS standby_user_state (
          id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );`
      ];

      await this.executeStatements(schemaSqls);
      store.updateTursoConfig({ isConnected: true, lastError: null });
      return true;
    } catch (err) {
      console.warn('Turso initSchema error:', err);
      store.updateTursoConfig({ isConnected: false, lastError: err.message });
      return false;
    }
  }

  scheduleDebouncedSync() {
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      this.pushToCloud();
    }, 1500);
  }

  async registerOrUpdateUser(userId, displayName) {
    if (!userId) return;
    const now = Date.now();
    try {
      await this.executeStatements([
        {
          sql: `INSERT INTO standby_users (id, display_name, created_at, last_active_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, last_active_at = excluded.last_active_at;`,
          args: [
            { type: 'text', value: userId },
            { type: 'text', value: displayName || userId },
            { type: 'integer', value: String(now) },
            { type: 'integer', value: String(now) }
          ]
        }
      ]);
    } catch (e) {
      console.warn('registerOrUpdateUser error:', e);
    }
  }

  async pushToCloud() {
    if (this.isSyncing) return;
    const cfg = store.getState().tursoConfig;
    if (!cfg || !cfg.url || !cfg.token) return;

    this.isSyncing = true;
    store.updateTursoConfig({ isSyncing: true });

    try {
      const state = store.getState();
      const now = Date.now();
      const currentUserId = (state.currentUser && state.currentUser.userId) || 'primary_user';
      const displayName = (state.currentUser && state.currentUser.displayName) || currentUserId;

      // 1. Ensure user is registered
      await this.registerOrUpdateUser(currentUserId, displayName);

      // 2. Sync User State
      const statePayload = JSON.stringify({
        spaces: state.spaces,
        clockConfig: state.clockConfig,
        pomoSettings: state.pomoState.settings,
        nightMode: state.nightMode,
        todos: state.todos,
        tallies: state.tallies,
        stats: state.stats
      });

      const statements = [
        {
          sql: `INSERT INTO standby_user_state (id, state_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at;`,
          args: [
            { type: 'text', value: currentUserId },
            { type: 'text', value: statePayload },
            { type: 'integer', value: String(now) }
          ]
        }
      ];

      // 3. Sync Focus Sessions to dedicated user table
      const recentSessions = (state.stats && state.stats.history) ? state.stats.history.slice(0, 30) : [];
      for (const s of recentSessions) {
        const dStr = s.dateStr || new Date(s.timestamp).toISOString().split('T')[0];
        const mStr = s.monthStr || dStr.substring(0, 7);
        const yInt = s.yearInt || parseInt(dStr.substring(0, 4), 10) || new Date().getFullYear();

        statements.push({
          sql: `INSERT OR IGNORE INTO standby_user_focus_sessions (id, user_id, stage, duration_minutes, completed_at, date_str, month_str, year_int)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [
            { type: 'text', value: s.id },
            { type: 'text', value: currentUserId },
            { type: 'text', value: s.stage || 'focus' },
            { type: 'integer', value: String(s.duration || 25) },
            { type: 'integer', value: String(s.timestamp || now) },
            { type: 'text', value: dStr },
            { type: 'text', value: mStr },
            { type: 'integer', value: String(yInt) }
          ]
        });
      }

      await this.executeStatements(statements);
      store.updateTursoConfig({
        isConnected: true,
        isSyncing: false,
        lastSyncedAt: now,
        lastError: null
      });
    } catch (err) {
      console.warn('Turso pushToCloud error:', err);
      store.updateTursoConfig({ isSyncing: false, lastError: err.message });
    } finally {
      this.isSyncing = false;
    }
  }

  async pullFromCloud() {
    const cfg = store.getState().tursoConfig;
    if (!cfg || !cfg.url || !cfg.token) return;

    this.isSyncing = true;
    store.updateTursoConfig({ isSyncing: true });

    try {
      const currentUserId = (store.getState().currentUser && store.getState().currentUser.userId) || 'primary_user';

      // 1. Fetch user state & focus sessions
      const res = await this.executeStatements([
        {
          sql: `SELECT state_json, updated_at FROM standby_user_state WHERE id = ?;`,
          args: [{ type: 'text', value: currentUserId }]
        },
        {
          sql: `SELECT id, stage, duration_minutes, completed_at, date_str, month_str, year_int 
                FROM standby_user_focus_sessions 
                WHERE user_id = ? 
                ORDER BY completed_at DESC 
                LIMIT 500;`,
          args: [{ type: 'text', value: currentUserId }]
        }
      ]);

      // Handle User State
      const stateResult = res.results && res.results[0];
      if (stateResult && stateResult.response && stateResult.response.result && stateResult.response.result.rows && stateResult.response.result.rows.length > 0) {
        const row = stateResult.response.result.rows[0];
        const stateJson = row[0].value;
        if (stateJson) {
          const parsed = JSON.parse(stateJson);
          store.mergeCloudState(parsed);
        }
      }

      // Handle Sessions from cloud table
      const sessionsResult = res.results && res.results[1];
      if (sessionsResult && sessionsResult.response && sessionsResult.response.result && sessionsResult.response.result.rows) {
        const rows = sessionsResult.response.result.rows;
        if (rows.length > 0) {
          const cloudHistory = rows.map(r => ({
            id: r[0].value,
            stage: r[1].value,
            duration: parseInt(r[2].value, 10),
            timestamp: parseInt(r[3].value, 10),
            dateStr: r[4].value,
            monthStr: r[5].value,
            yearInt: parseInt(r[6].value, 10),
            timeStr: new Date(parseInt(r[3].value, 10)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));

          // Rebuild daily, monthly, and yearly totals from cloud history
          const dailyTotals = {};
          const monthlyTotals = {};
          const yearlyTotals = {};

          for (const s of cloudHistory) {
            if (s.stage === 'focus') {
              // Daily
              if (!dailyTotals[s.dateStr]) dailyTotals[s.dateStr] = { focusMinutes: 0, sessions: 0 };
              dailyTotals[s.dateStr].focusMinutes += s.duration;
              dailyTotals[s.dateStr].sessions += 1;

              // Monthly
              if (!monthlyTotals[s.monthStr]) monthlyTotals[s.monthStr] = { focusMinutes: 0, sessions: 0 };
              monthlyTotals[s.monthStr].focusMinutes += s.duration;
              monthlyTotals[s.monthStr].sessions += 1;

              // Yearly
              const yrStr = String(s.yearInt);
              if (!yearlyTotals[yrStr]) yearlyTotals[yrStr] = { focusMinutes: 0, sessions: 0 };
              yearlyTotals[yrStr].focusMinutes += s.duration;
              yearlyTotals[yrStr].sessions += 1;
            }
          }

          store.mergeCloudState({
            stats: {
              history: cloudHistory,
              dailyTotals,
              monthlyTotals,
              yearlyTotals
            }
          });
        }
      }

      store.updateTursoConfig({
        isConnected: true,
        isSyncing: false,
        lastSyncedAt: Date.now(),
        lastError: null
      });
    } catch (err) {
      console.warn('Turso pullFromCloud error:', err);
      store.updateTursoConfig({ isSyncing: false, lastError: err.message });
    } finally {
      this.isSyncing = false;
    }
  }

  async loginWithUserId(userId) {
    if (!userId || !userId.trim()) throw new Error('Please provide a valid User ID.');
    const cleanId = userId.trim();
    store.setUserId(cleanId);
    await this.initSchema();
    await this.pullFromCloud();
    return true;
  }

  async deleteCloudSession(sessionId) {
    if (!sessionId) return;
    const cfg = store.getState().tursoConfig;
    if (!cfg || !cfg.url || !cfg.token) return;
    const currentUserId = (store.getState().currentUser && store.getState().currentUser.userId) || 'primary_user';

    try {
      await this.executeStatements([
        {
          sql: `DELETE FROM standby_user_focus_sessions WHERE id = ? AND user_id = ?;`,
          args: [
            { type: 'text', value: sessionId },
            { type: 'text', value: currentUserId }
          ]
        }
      ]);
      // Also trigger a state push to update standby_user_state
      this.scheduleDebouncedSync();
    } catch (e) {
      console.warn('deleteCloudSession error:', e);
    }
  }

  async updateCloudSessionDuration(sessionId, newDurationMinutes) {
    if (!sessionId) return;
    const cfg = store.getState().tursoConfig;
    if (!cfg || !cfg.url || !cfg.token) return;
    const currentUserId = (store.getState().currentUser && store.getState().currentUser.userId) || 'primary_user';

    try {
      await this.executeStatements([
        {
          sql: `UPDATE standby_user_focus_sessions SET duration_minutes = ? WHERE id = ? AND user_id = ?;`,
          args: [
            { type: 'integer', value: String(newDurationMinutes) },
            { type: 'text', value: sessionId },
            { type: 'text', value: currentUserId }
          ]
        }
      ]);
      this.scheduleDebouncedSync();
    } catch (e) {
      console.warn('updateCloudSessionDuration error:', e);
    }
  }
}

export const tursoSync = new TursoSync();


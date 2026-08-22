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
    if (cfg && cfg.url && cfg.token && cfg.autoSync) {
      this.initSchema().then(() => {
        this.pullFromCloud();
      });
    }

    // Subscribe to store updates to trigger debounced auto-sync
    store.subscribe((event) => {
      if (
        event === 'pomo_completed' ||
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

    const endpoint = this.formatTursoUrl(cfg.url);
    const requests = statements.map(stmt => {
      if (typeof stmt === 'string') {
        return { type: 'execute', stmt: { sql: stmt } };
      }
      return { type: 'execute', stmt };
    });

    requests.push({ type: 'close' });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.token.trim()}`,
        'Content-Type': 'application/json'
      },
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
      store.updateTursoConfig({ isConnected: true });
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
    }, 2500);
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
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Sync User State
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
                VALUES ('primary_user', ?, ?)
                ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at;`,
          args: [{ type: 'text', value: statePayload }, { type: 'integer', value: String(now) }]
        }
      ];

      // 2. Sync Recent Sessions
      const recentSessions = (state.stats && state.stats.history) ? state.stats.history.slice(-20) : [];
      for (const s of recentSessions) {
        statements.push({
          sql: `INSERT OR IGNORE INTO standby_sessions (id, stage, duration_minutes, completed_at, date_str, time_str)
                VALUES (?, ?, ?, ?, ?, ?);`,
          args: [
            { type: 'text', value: s.id },
            { type: 'text', value: s.stage },
            { type: 'integer', value: String(s.duration) },
            { type: 'integer', value: String(s.timestamp) },
            { type: 'text', value: s.dateStr },
            { type: 'text', value: s.timeStr || '' }
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
      const res = await this.executeStatements([
        `SELECT state_json, updated_at FROM standby_user_state WHERE id = 'primary_user';`
      ]);

      const resultObj = res.results && res.results[0];
      if (resultObj && resultObj.response && resultObj.response.result && resultObj.response.result.rows && resultObj.response.result.rows.length > 0) {
        const row = resultObj.response.result.rows[0];
        const stateJson = row[0].value;
        if (stateJson) {
          const parsed = JSON.parse(stateJson);
          store.mergeCloudState(parsed);
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
}

export const tursoSync = new TursoSync();

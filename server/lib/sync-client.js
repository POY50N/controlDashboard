// Drives synchronisation from the DESKTOP side. Owns the whole offline
// story: detect connectivity, collect what changed while offline, push it,
// pull what the web changed, and surface conflicts for the admin to resolve
// (the Steam-style "re-sync" review the user asked for).
//
// Nothing here auto-resolves a conflict. When both sides touched the same
// record we stop and hand the decision to the admin.

const { TABLES, getRow, upsertRow, clearDirty } = require('./sync-tables');

const CURSOR_KEY = 'server_cursor';

function createSyncClient({ db, serverUrl, syncKey, onStateChange }) {
  const state = {
    online: false,
    syncing: false,
    lastSyncAt: null,
    pendingCount: 0,
    conflicts: [],
    lastError: null
  };

  function emit() {
    state.pendingCount = countPending();
    if (onStateChange) onStateChange(getState());
  }

  function getState() {
    return {
      online: state.online,
      syncing: state.syncing,
      lastSyncAt: state.lastSyncAt,
      pendingCount: state.pendingCount,
      conflicts: state.conflicts,
      lastError: state.lastError
    };
  }

  function countPending() {
    const row = db.get('SELECT COUNT(*) AS n FROM change_log WHERE synced = 0 AND origin = "local"');
    return row ? row.n : 0;
  }

  function getCursor() {
    const row = db.get('SELECT value FROM sync_meta WHERE key = ?', [CURSOR_KEY]);
    return row ? Number(row.value) : 0;
  }

  function setCursor(value) {
    db.run('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [CURSOR_KEY, String(value)]);
  }

  async function call(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(serverUrl + path, {
        ...options,
        headers: { 'Content-Type': 'application/json', 'x-sync-key': syncKey, ...(options.headers || {}) },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkConnection() {
    try {
      await call('/api/sync/status');
      const was = state.online;
      state.online = true;
      state.lastError = null;
      if (!was) emit();
      return true;
    } catch (err) {
      const was = state.online;
      state.online = false;
      if (was) emit();
      return false;
    }
  }

  // The list the admin reviews before uploading: every local change made
  // since the last successful sync, described in plain language.
  function getPendingChanges() {
    return db.all('SELECT * FROM change_log WHERE synced = 0 AND origin = "local" ORDER BY id ASC').map((c) => ({
      changeId: c.id,
      table: c.table_name,
      rowId: c.row_id,
      operation: c.operation,
      summary: c.summary,
      changedAt: c.changed_at
    }));
  }

  function markSynced(changeIds) {
    changeIds.forEach((id) => db.run('UPDATE change_log SET synced = 1 WHERE id = ?', [id]));
  }

  async function pull() {
    const cursor = getCursor();
    const res = await call('/api/sync/pull', { method: 'POST', body: JSON.stringify({ since: cursor }) });
    let applied = 0;
    for (const change of res.changes) {
      if (!TABLES[change.table] || !change.row) continue;
      const local = getRow(db, change.table, change.rowId);
      // A locally-dirty row is defended: it becomes a conflict rather than
      // being silently overwritten by the server's version.
      if (local && local.dirty) {
        if (!state.conflicts.find((c) => c.table === change.table && c.rowId === change.rowId)) {
          state.conflicts.push({
            table: change.table,
            rowId: change.rowId,
            label: TABLES[change.table].label(local),
            localSummary: describeLocal(change.table, change.rowId),
            remoteSummary: change.summary,
            local, remote: change.row
          });
        }
        continue;
      }
      upsertRow(db, change.table, change.row, false);
      applied++;
    }
    if (res.serverCursor) setCursor(res.serverCursor);
    return applied;
  }

  function describeLocal(table, rowId) {
    const row = db.get('SELECT summary FROM change_log WHERE table_name = ? AND row_id = ? AND synced = 0 ORDER BY id DESC', [table, rowId]);
    return row ? row.summary : 'Alteração local pendente.';
  }

  async function push(changeIds) {
    const pending = getPendingChanges().filter((c) => !changeIds || changeIds.includes(c.changeId));
    if (!pending.length) return { applied: [], conflicts: [] };

    const payload = pending.map((c) => ({
      table: c.table, rowId: c.rowId, operation: c.operation,
      summary: c.summary, row: getRow(db, c.table, c.rowId)
    })).filter((c) => c.row);

    const res = await call('/api/sync/push', { method: 'POST', body: JSON.stringify({ changes: payload }) });

    const appliedKeys = new Set(res.applied.map((a) => `${a.table}:${a.rowId}`));
    const syncedIds = pending.filter((c) => appliedKeys.has(`${c.table}:${c.rowId}`)).map((c) => c.changeId);
    markSynced(syncedIds);
    syncedIds.forEach((id) => {
      const c = pending.find((p) => p.changeId === id);
      if (c) clearDirty(db, c.table, c.rowId);
    });

    res.conflicts.forEach((conflict) => {
      if (!state.conflicts.find((c) => c.table === conflict.table && c.rowId === conflict.rowId)) {
        state.conflicts.push({
          ...conflict,
          localSummary: conflict.remoteSummary,
          remoteSummary: `O servidor também alterou este registro.`
        });
      }
    });

    return res;
  }

  async function sync({ changeIds } = {}) {
    if (state.syncing) return getState();
    state.syncing = true;
    state.lastError = null;
    emit();
    try {
      const connected = await checkConnection();
      if (!connected) throw new Error('Sem conexão com o servidor.');
      await pull();
      await push(changeIds);
      await pull();
      state.lastSyncAt = new Date().toISOString();
    } catch (err) {
      state.lastError = err.message;
    } finally {
      state.syncing = false;
      emit();
    }
    return getState();
  }

  // "Quero os dados do servidor": abre mão de tudo o que foi alterado nesta
  // máquina e deixa a próxima descida sobrescrever os registros.
  async function discardLocal() {
    const pendentes = getPendingChanges();
    pendentes.forEach((c) => {
      db.run('UPDATE change_log SET synced = 1 WHERE id = ?', [c.changeId]);
      clearDirty(db, c.table, c.rowId);
    });
    state.conflicts = [];
    // Zera o cursor para reler o servidor inteiro e restaurar os registros.
    setCursor(0);
    emit();
    return sync();
  }

  // Conflict resolution -------------------------------------------------
  // "keep_local": force our version onto the server.
  // "keep_server": discard our local edit and take the server's row.
  async function resolveConflict(table, rowId, choice) {
    const idx = state.conflicts.findIndex((c) => c.table === table && c.rowId === Number(rowId));
    if (idx === -1) return getState();
    const conflict = state.conflicts[idx];

    if (choice === 'keep_local') {
      await call('/api/sync/force', { method: 'POST', body: JSON.stringify({ table, rowId, row: conflict.local }) });
      clearDirty(db, table, rowId);
      db.run('UPDATE change_log SET synced = 1 WHERE table_name = ? AND row_id = ? AND synced = 0', [table, rowId]);
    } else {
      upsertRow(db, table, conflict.remote, false);
      db.run('UPDATE change_log SET synced = 1 WHERE table_name = ? AND row_id = ? AND synced = 0', [table, rowId]);
    }

    state.conflicts.splice(idx, 1);
    emit();
    return getState();
  }

  return {
    getState, getPendingChanges, checkConnection, sync, resolveConflict, discardLocal,
    get conflicts() { return state.conflicts; }
  };
}

module.exports = { createSyncClient };

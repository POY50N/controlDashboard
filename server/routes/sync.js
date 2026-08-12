const express = require('express');
const { isSyncable, getRow, upsertRow, clearDirty, isDirty, TABLES } = require('../lib/sync-tables');

// The sync endpoints are machine-to-machine (desktop app <-> "cloud"
// instance), not tied to an admin browser session, so they use a small
// shared key instead of the cookie session used by the rest of the API.
function requireSyncKey(syncKey) {
  return (req, res, next) => {
    if (req.header('x-sync-key') !== syncKey) return res.status(401).json({ error: 'Chave de sincronização inválida.' });
    next();
  };
}

module.exports = function syncRoutes(db, syncKey) {
  const router = express.Router();
  router.use(requireSyncKey(syncKey));

  router.get('/status', (req, res) => {
    const last = db.get('SELECT MAX(id) AS id FROM change_log');
    res.json({ serverTime: new Date().toISOString(), lastChangeId: last.id || 0 });
  });

  // Changes the SERVER has that the caller may not have yet.
  router.post('/pull', (req, res) => {
    const since = Number(req.body.since) || 0;
    const rows = db.all('SELECT * FROM change_log WHERE id > ? ORDER BY id ASC LIMIT 200', [since]);
    const changes = rows
      .filter((c) => isSyncable(c.table_name))
      .map((c) => ({
        changeId: c.id,
        table: c.table_name,
        rowId: c.row_id,
        operation: c.operation,
        summary: c.summary,
        changedAt: c.changed_at,
        row: getRow(db, c.table_name, c.row_id)
      }));
    const serverCursor = rows.length ? rows[rows.length - 1].id : since;
    res.json({ changes, serverCursor });
  });

  // Changes the CALLER has that the server may not have yet. Conflict rule:
  // if the server's own copy of that row is itself dirty (server has an
  // unsynced local edit to the same row), we refuse to overwrite it and
  // report a conflict instead of silently picking a winner.
  router.post('/push', (req, res) => {
    const incoming = Array.isArray(req.body.changes) ? req.body.changes : [];
    const applied = [];
    const conflicts = [];

    for (const change of incoming) {
      if (!isSyncable(change.table) || !change.row) continue;
      const existing = getRow(db, change.table, change.rowId);

      if (!existing || change.force || !isDirty(existing, change.table)) {
        upsertRow(db, change.table, change.row, false);
        db.recordChange(change.table, change.rowId, change.operation || 'update', change.summary, {});
        applied.push({ table: change.table, rowId: change.rowId });
      } else {
        conflicts.push({
          table: change.table,
          rowId: change.rowId,
          label: TABLES[change.table].label(existing),
          local: existing,
          remote: change.row,
          remoteSummary: change.summary
        });
      }
    }

    res.json({ applied, conflicts });
  });

  // Used by the resolution UI to fetch the server's authoritative copy of a
  // single row when the admin chooses "keep the server version".
  router.get('/row', (req, res) => {
    const { table, id } = req.query;
    if (!isSyncable(table)) return res.status(400).json({ error: 'Tabela inválida.' });
    const row = getRow(db, table, id);
    if (!row) return res.status(404).json({ error: 'Registro não encontrado.' });
    res.json({ row });
  });

  // Force-apply a single row (used after the admin picks "keep mine").
  router.post('/force', (req, res) => {
    const { table, rowId, row } = req.body;
    if (!isSyncable(table) || !row) return res.status(400).json({ error: 'Dados inválidos.' });
    upsertRow(db, table, row, false);
    db.recordChange(table, rowId, 'update', `Conflito resolvido: alteração local aplicada em ${TABLES[table].label(row)}.`, {});
    res.json({ ok: true });
  });

  return router;
};

module.exports.clearDirty = clearDirty;

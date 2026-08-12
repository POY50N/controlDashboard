// Thin wrapper around sql.js (SQLite compiled to WASM).
// Chosen over native bindings (better-sqlite3 / node:sqlite) on purpose:
// zero native compilation, identical behaviour in the plain Node server
// and inside a packaged Electron app. The file on disk is a real,
// standard .sqlite file - openable with any SQLite tool.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

function createDatabase(dbPath) {
  const state = { SQL: null, db: null, dbPath, saveTimer: null };

  async function open() {
    const sqlJsDistDir = path.dirname(require.resolve('sql.js'));
    state.SQL = await initSqlJs({
      locateFile: (file) => path.join(sqlJsDistDir, file)
    });

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath);
      state.db = new state.SQL.Database(buf);
    } else {
      state.db = new state.SQL.Database();
    }

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    state.db.exec(schema);
    persist();
    return api;
  }

  function persist() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      const data = state.db.export();
      fs.writeFileSync(state.dbPath, Buffer.from(data));
    }, 50);
  }

  function persistNow() {
    clearTimeout(state.saveTimer);
    const data = state.db.export();
    fs.writeFileSync(state.dbPath, Buffer.from(data));
  }

  function run(sql, params = []) {
    const stmt = state.db.prepare(sql);
    try {
      stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
    persist();
  }

  function insert(sql, params = []) {
    run(sql, params);
    const row = get('SELECT last_insert_rowid() AS id');
    return row.id;
  }

  function get(sql, params = []) {
    const stmt = state.db.prepare(sql);
    try {
      stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : null;
    } finally {
      stmt.free();
    }
  }

  function all(sql, params = []) {
    const stmt = state.db.prepare(sql);
    const rows = [];
    try {
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  }

  function exec(sql) {
    state.db.exec(sql);
    persist();
  }

  // Records a change for the sync engine and marks the row dirty (pending
  // sync). `summary` must be a short, human-readable Portuguese sentence -
  // it is shown verbatim in the desktop app's sync review screen.
  function recordChange(table, rowId, operation, summary, snapshot) {
    run(
      `INSERT INTO change_log (table_name, row_id, operation, summary, snapshot) VALUES (?, ?, ?, ?, ?)`,
      [table, rowId, operation, summary, JSON.stringify(snapshot || {})]
    );
  }

  function exportFile() {
    return Buffer.from(state.db.export());
  }

  const api = {
    open, run, insert, get, all, exec, recordChange, persist, persistNow, exportFile,
    get raw() { return state.db; },
    get path() { return state.dbPath; },
    get SQL() { return state.SQL; }
  };
  return api;
}

module.exports = { createDatabase };

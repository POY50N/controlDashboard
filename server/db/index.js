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
    migrate();
    persist();
    return api;
  }

  // `CREATE TABLE IF NOT EXISTS` não acrescenta colunas novas a uma tabela
  // que já existe. Bancos criados por versões anteriores - como o do app
  // desktop, que fica em %APPDATA% e sobrevive às atualizações - precisam
  // ganhar as colunas na mão, senão o servidor quebra ao consultá-las.
  const COLUNAS_ESPERADAS = [
    ['admins', 'documento', 'TEXT'],
    ['admins', 'telefone', 'TEXT'],
    ['admins', 'email', 'TEXT'],
    ['admins', 'cargo', "TEXT NOT NULL DEFAULT 'colaborador'"],
    ['admins', 'permissoes', "TEXT NOT NULL DEFAULT '[]'"],
    ['admins', 'ativo', 'INTEGER NOT NULL DEFAULT 1'],
    ['clients', 'username', 'TEXT'],
    ['clients', 'owner_id', 'INTEGER']
  ];

  function migrate() {
    for (const [tabela, coluna, tipo] of COLUNAS_ESPERADAS) {
      const info = all(`PRAGMA table_info(${tabela})`);
      if (!info.length) continue; // tabela ainda não existe
      if (info.some((c) => c.name === coluna)) continue;
      state.db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    }

    // Banco antigo não tinha o conceito de titular: promove o admin mais
    // antigo, senão ninguém teria acesso total.
    const temTitular = get("SELECT id FROM admins WHERE cargo = 'titular' LIMIT 1");
    if (!temTitular) {
      const primeiro = get('SELECT id FROM admins ORDER BY id ASC LIMIT 1');
      if (primeiro) state.db.exec(`UPDATE admins SET cargo = 'titular' WHERE id = ${primeiro.id}`);
    }

    // Clientes sem responsável passam a ser do titular.
    const titular = get("SELECT id FROM admins WHERE cargo = 'titular' ORDER BY id ASC LIMIT 1");
    if (titular) state.db.exec(`UPDATE clients SET owner_id = ${titular.id} WHERE owner_id IS NULL`);
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

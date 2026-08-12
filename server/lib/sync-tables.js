// Describes which tables travel through the sync protocol and how to
// upsert a row generically. `andamentos` has no dirty/updated_at columns
// on purpose - movements are append-only, so they can never conflict,
// only be missing on one side.

const TABLES = {
  admins: {
    columns: ['id', 'username', 'nome', 'oab', 'documento', 'telefone', 'email', 'cargo', 'permissoes', 'ativo', 'password_hash', 'created_at', 'updated_at'],
    hasDirty: true,
    label: (row) => `Colaborador "${row.nome}"`
  },
  clients: {
    columns: ['id', 'tipo', 'nome', 'username', 'documento', 'documento_secundario', 'data_ref', 'extra', 'email', 'telefone', 'cep', 'logradouro', 'numero', 'cidade_uf', 'password_hash', 'status', 'owner_id', 'ultimo_contato', 'created_at', 'updated_at', 'deleted'],
    hasDirty: true,
    label: (row) => `Cliente "${row.nome}"`
  },
  colaborador_permissoes: {
    columns: ['id', 'owner_id', 'grantee_id', 'created_at', 'updated_at'],
    hasDirty: true,
    label: () => 'Permissão entre colaboradores'
  },
  processos: {
    columns: ['id', 'client_id', 'area', 'titulo', 'numero', 'vara', 'status', 'distribuido_em', 'proxima_audiencia', 'sync_tribunal', 'created_at', 'updated_at'],
    hasDirty: true,
    label: (row) => `Processo "${row.titulo || row.numero}"`
  },
  honorarios: {
    columns: ['id', 'client_id', 'processo_id', 'referencia', 'valor_centavos', 'vencimento', 'status', 'created_at', 'updated_at'],
    hasDirty: true,
    label: (row) => `Cobrança "${row.referencia}"`
  },
  contas_escritorio: {
    columns: ['id', 'nome', 'categoria', 'vencimento', 'valor_centavos', 'status', 'created_at', 'updated_at'],
    hasDirty: true,
    label: (row) => `Conta "${row.nome}"`
  },
  andamentos: {
    columns: ['id', 'processo_id', 'data', 'titulo', 'descricao', 'created_at'],
    hasDirty: false,
    label: (row) => `Movimentação "${row.titulo}"`
  }
};

function isSyncable(table) {
  return Object.prototype.hasOwnProperty.call(TABLES, table);
}

function getRow(db, table, id) {
  return db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

function upsertRow(db, table, row, dirty) {
  const def = TABLES[table];
  const cols = def.columns;
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  const insertCols = def.hasDirty ? [...cols, 'dirty'] : cols;
  const insertPlaceholders = def.hasDirty ? `${placeholders}, ?` : placeholders;
  const updateClause = def.hasDirty ? `${updates}, dirty = excluded.dirty` : updates;
  const sql = `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${insertPlaceholders})
    ON CONFLICT(id) DO UPDATE SET ${updateClause}`;
  const params = cols.map((c) => (row[c] === undefined ? null : row[c]));
  if (def.hasDirty) params.push(dirty ? 1 : 0);
  db.run(sql, params);
}

function clearDirty(db, table, id) {
  if (!TABLES[table].hasDirty) return;
  db.run(`UPDATE ${table} SET dirty = 0 WHERE id = ?`, [id]);
}

function isDirty(row, table) {
  if (!TABLES[table].hasDirty) return false;
  return !!(row && row.dirty);
}

module.exports = { TABLES, isSyncable, getRow, upsertRow, clearDirty, isDirty };

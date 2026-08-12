CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  oab TEXT,
  documento TEXT,
  telefone TEXT,
  email TEXT,
  cargo TEXT NOT NULL DEFAULT 'colaborador',
  -- Lista JSON das áreas do painel liberadas para este colaborador.
  -- O titular ignora esta coluna: enxerga tudo por definição.
  permissoes TEXT NOT NULL DEFAULT '[]',
  ativo INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('PF','PJ')),
  nome TEXT NOT NULL,
  -- Intentionally NOT unique: two clients may share a username, and the
  -- password is what tells them apart at login.
  username TEXT,
  documento TEXT UNIQUE NOT NULL,
  documento_secundario TEXT,
  data_ref TEXT,
  extra TEXT,
  email TEXT,
  telefone TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  cidade_uf TEXT,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  -- Colaborador responsável pelo cliente. Os processos do cliente seguem
  -- este mesmo dono: é ele quem decide quem mais pode enxergá-los.
  owner_id INTEGER REFERENCES admins(id),
  ultimo_contato TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  dirty INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS processos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  area TEXT,
  titulo TEXT,
  numero TEXT,
  vara TEXT,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  distribuido_em TEXT,
  proxima_audiencia TEXT,
  sync_tribunal INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS andamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  processo_id INTEGER NOT NULL REFERENCES processos(id),
  data TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS honorarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  processo_id INTEGER REFERENCES processos(id),
  referencia TEXT,
  valor_centavos INTEGER NOT NULL,
  vencimento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'a_vencer',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contas_escritorio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  categoria TEXT,
  vencimento TEXT,
  valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'a_pagar',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  dirty INTEGER NOT NULL DEFAULT 0
);

-- Append-only log of every write, used to drive the sync diff & the
-- "what changed while offline" notification the desktop app shows.
CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  operation TEXT NOT NULL,
  summary TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'local'
);

-- Quem (owner_id) autorizou quem (grantee_id) a ver seus clientes e
-- processos. O titular do escritório não precisa de linha aqui: ele enxerga
-- tudo por definição.
CREATE TABLE IF NOT EXISTS colaborador_permissoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES admins(id),
  grantee_id INTEGER NOT NULL REFERENCES admins(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  dirty INTEGER NOT NULL DEFAULT 0,
  UNIQUE (owner_id, grantee_id)
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

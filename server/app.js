const path = require('path');
const express = require('express');
const { createDatabase } = require('./db');

// `adminOnly` is set by the desktop app: that build is the office's
// administration tool, so client accounts must not be able to sign in there
// even though it serves the same pages.
async function createApp({ dbPath, syncKey = 'jorge-silva-dev-sync-key', adminOnly = false }) {
  const db = createDatabase(path.resolve(dbPath));
  await db.open();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/auth', require('./routes/auth')(db, { adminOnly }));
  app.use('/api/clients', require('./routes/clients')(db));
  app.use('/api/colaboradores', require('./routes/colaboradores')(db));
  app.use('/api/processos', require('./routes/processos')(db));
  app.use('/api/financeiro', require('./routes/financeiro')(db));
  app.use('/api/me', require('./routes/me')(db));
  app.use('/api/dashboard', require('./routes/dashboard')(db));
  app.use('/api/export', require('./routes/export')(db));
  app.use('/api/download', require('./routes/download')(db));
  app.use('/api/sync', require('./routes/sync')(db, syncKey));

  app.get('/api/health', (req, res) => res.json({ ok: true, db: db.path, adminOnly }));

  // Any unmatched /api route -> 404 JSON (instead of falling through to index.html)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  return { app, db };
}

module.exports = { createApp };

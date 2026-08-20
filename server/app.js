const path = require('path');
const express = require('express');
const { createDatabase } = require('./db');

async function createApp({ dbPath, adminOnly = false }) {
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
  app.use('/api/relatorios', require('./routes/relatorios')(db));
  app.use('/api/contas-auto', require('./routes/contas-auto')(db));
  app.use('/api/me', require('./routes/me')(db));
  app.use('/api/dashboard', require('./routes/dashboard')(db));
  app.use('/api/export', require('./routes/export')(db));

  app.get('/api/health', (req, res) => res.json({ ok: true, db: db.path, adminOnly }));

  // Any unmatched /api route -> 404 JSON (instead of falling through to index.html)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // Tarefas do escritório: fechar o mês do financeiro e buscar as faturas
  // nos portais. Ambas checam a hora configurada e só agem uma vez por
  // competência, então rodar de minuto em minuto é barato e tolera o
  // servidor ter ficado desligado.
  const fechamento = require('./lib/fechamento');
  const contasAuto = require('./lib/contas-automaticas');

  async function tarefas() {
    try {
      const fechou = fechamento.rodarAgendador(db);
      if (fechou) console.log(`[agendador] mês ${fechou} fechado.`);
    } catch (err) {
      console.error('[agendador] falha ao fechar o mês:', err.message);
    }
    try {
      const n = await contasAuto.rodarAgendador(db);
      if (n) console.log(`[agendador] ${n} conta(s) automática(s) consultada(s).`);
    } catch (err) {
      console.error('[agendador] falha ao consultar contas:', err.message);
    }
  }

  const timer = setInterval(tarefas, 60000);
  if (timer.unref) timer.unref();
  setTimeout(tarefas, 2000);

  return { app, db };
}

module.exports = { createApp };

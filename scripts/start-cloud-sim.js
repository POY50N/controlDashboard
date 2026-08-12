// Starts a second instance of the exact same server, representing "the
// web" for local sync testing: the desktop app's embedded server talks to
// this one over HTTP whenever config.json's syncServerUrl points here.
// Point syncServerUrl at a real deployment later and nothing else changes.

const fs = require('fs');
const path = require('path');
const { createApp } = require('../server/app');

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const port = Number(new URL(config.syncServerUrl).port) || 4179;

createApp({ dbPath: path.join(__dirname, '..', 'data', 'cloud.sqlite'), syncKey: config.syncKey })
  .then(({ app }) => {
    app.listen(port, () => {
      console.log(`[cloud-sim] Instância "web" simulada rodando em http://localhost:${port}`);
      console.log('[cloud-sim] Banco de dados: data/cloud.sqlite');
    });
  })
  .catch((err) => {
    console.error('Falha ao iniciar a instância simulada:', err);
    process.exit(1);
  });

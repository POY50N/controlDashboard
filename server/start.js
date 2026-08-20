const fs = require('fs');
const path = require('path');
const { createApp } = require('./app');

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

createApp({ dbPath: path.join(__dirname, '..', config.dbPath) })
  .then(({ app }) => {
    app.listen(config.port, () => {
      console.log(`Painel rodando em http://localhost:${config.port}`);
      console.log(`Banco de dados: ${config.dbPath}`);
    });
  })
  .catch((err) => {
    console.error('Falha ao iniciar o servidor:', err);
    process.exit(1);
  });

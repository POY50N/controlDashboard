const fs = require('fs');
const path = require('path');
const { createApp } = require('./app');
const { seed } = require('./db/seed');

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dbPath = path.join(__dirname, '..', config.dbPath);
const port = process.env.PORT || config.port;

async function start() {
  // Em um deploy novo (ou após o disco ser reiniciado num serviço gratuito)
  // o arquivo do banco ainda não existe: semeamos os dados fictícios para
  // que o login já funcione sem precisar de acesso ao terminal do servidor.
  if (!fs.existsSync(dbPath)) {
    console.log('Banco não encontrado — semeando dados de exemplo...');
    await seed(dbPath);
  }

  const { app } = await createApp({ dbPath });
  app.listen(port, () => {
    console.log(`Painel rodando em http://localhost:${port}`);
    console.log(`Banco de dados: ${config.dbPath}`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});

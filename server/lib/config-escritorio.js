// Ajustes editáveis do escritório, guardados em `configuracoes`.
// Hoje: quando fechar o mês do financeiro e quando consultar os portais das
// contas automáticas. Ambos vêm com um padrão e podem ser mudados na tela.

const PADROES = {
  'financeiro.fechamento.dia': '1',      // dia do mês
  'financeiro.fechamento.hora': '00:00', // HH:MM
  'contas.consulta.dia': '1',
  'contas.consulta.hora': '06:00'
};

function ler(db, chave) {
  const row = db.get('SELECT valor FROM configuracoes WHERE chave = ?', [chave]);
  return row && row.valor !== null && row.valor !== undefined ? row.valor : PADROES[chave];
}

function gravar(db, chave, valor) {
  db.run(
    `INSERT INTO configuracoes (chave, valor, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
    [chave, String(valor)]
  );
}

function validarDia(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null; // 28 evita meses curtos
}

function validarHora(v) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(v || '')) ? String(v) : null;
}

function agendamento(db, prefixo) {
  return {
    dia: Number(ler(db, `${prefixo}.dia`)),
    hora: ler(db, `${prefixo}.hora`)
  };
}

module.exports = { PADROES, ler, gravar, validarDia, validarHora, agendamento };

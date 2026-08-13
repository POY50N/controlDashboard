// Fechamento mensal do financeiro.
//
// No dia/hora configurados (padrão: dia 1 às 00:00) o mês anterior é
// "congelado" em `fechamentos_financeiros`: os totais e as linhas ficam
// guardados, então o relatório daquele mês continua igual mesmo que alguém
// mexa nos lançamentos depois.
//
// O agendador é idempotente: se o fechamento daquela competência já existe,
// não refaz. Assim, o app pode ficar dias desligado e ao voltar ele fecha o
// que ficou pendente.

const { agendamento } = require('./config-escritorio');

function competenciaDe(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function competenciaAnterior(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return competenciaDe(d);
}

function mesSeguinte(competencia) {
  const [a, m] = competencia.split('-').map(Number);
  const d = new Date(a, m, 1);
  return competenciaDe(d);
}

// Números do mês, calculados a partir dos lançamentos reais.
function apurar(db, competencia) {
  const honorarios = db.all(`
    SELECT h.id, h.referencia, h.valor_centavos, h.vencimento, h.status, c.nome AS cliente_nome
    FROM honorarios h JOIN clients c ON c.id = h.client_id
    WHERE c.deleted = 0 AND strftime('%Y-%m', h.vencimento) = ?
    ORDER BY h.vencimento ASC
  `, [competencia]);

  const contas = db.all(`
    SELECT id, nome, categoria, vencimento, valor_centavos, status
    FROM contas_escritorio
    WHERE strftime('%Y-%m', vencimento) = ?
    ORDER BY vencimento ASC
  `, [competencia]);

  const soma = (lista, filtro) => lista.filter(filtro).reduce((s, r) => s + r.valor_centavos, 0);

  return {
    competencia,
    recebido: soma(honorarios, (h) => h.status === 'pago'),
    aReceber: soma(honorarios, (h) => h.status === 'a_vencer' || h.status === 'avisado'),
    vencido: soma(honorarios, (h) => h.status === 'atraso'),
    despesas: soma(contas, () => true),
    despesasPagas: soma(contas, (c) => c.status === 'pago'),
    honorarios,
    contas
  };
}

function jaFechado(db, competencia) {
  return !!db.get('SELECT id FROM fechamentos_financeiros WHERE competencia = ?', [competencia]);
}

function fechar(db, competencia, automatico = true) {
  const a = apurar(db, competencia);
  const detalhes = JSON.stringify({ honorarios: a.honorarios, contas: a.contas });
  db.run(
    `INSERT INTO fechamentos_financeiros
       (competencia, recebido_centavos, a_receber_centavos, vencido_centavos, despesas_centavos, lancamentos, detalhes, automatico)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(competencia) DO UPDATE SET
       recebido_centavos = excluded.recebido_centavos,
       a_receber_centavos = excluded.a_receber_centavos,
       vencido_centavos = excluded.vencido_centavos,
       despesas_centavos = excluded.despesas_centavos,
       lancamentos = excluded.lancamentos,
       detalhes = excluded.detalhes,
       fechado_em = datetime('now')`,
    [competencia, a.recebido, a.aReceber, a.vencido, a.despesas,
      a.honorarios.length + a.contas.length, detalhes, automatico ? 1 : 0]
  );
  return a;
}

// Chegou o momento configurado e a competência anterior ainda está aberta?
function devoFechar(db, agora = new Date()) {
  const { dia, hora } = agendamento(db, 'financeiro.fechamento');
  const [hh, mm] = String(hora).split(':').map(Number);
  const alvo = new Date(agora.getFullYear(), agora.getMonth(), dia, hh, mm, 0, 0);
  if (agora < alvo) return null;

  const pendente = competenciaAnterior(alvo);
  return jaFechado(db, pendente) ? null : pendente;
}

// Roda periodicamente. Fecha também os meses antigos que ficaram para trás.
function rodarAgendador(db) {
  const pendente = devoFechar(db);
  if (!pendente) return null;
  fechar(db, pendente, true);
  return pendente;
}

module.exports = { competenciaDe, competenciaAnterior, mesSeguinte, apurar, fechar, jaFechado, devoFechar, rodarAgendador };

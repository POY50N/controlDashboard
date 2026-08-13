// Contas do escritório que o sistema busca sozinho no portal do fornecedor.
// A conexão com o portal fica nos adaptadores (lib/fornecedores/*).

const { nowIso } = require('./time');
const { cifrar, decifrar } = require('./segredos');
const { agendamento } = require('./config-escritorio');
const celesc = require('./fornecedores/celesc');

const FORNECEDORES = { celesc };

function listarFornecedores() {
  return Object.values(FORNECEDORES).map((f) => f.FORNECEDOR);
}

function adaptador(chave) {
  return FORNECEDORES[chave] || null;
}

function credenciaisDe(conta) {
  return { login: conta.login, senha: decifrar(conta.senha_cifrada) };
}

function visaoPublica(db, conta) {
  const f = adaptador(conta.fornecedor);
  const fatura = db.get(
    'SELECT * FROM faturas_automaticas WHERE conta_automatica_id = ? ORDER BY competencia DESC LIMIT 1',
    [conta.id]
  );
  return {
    id: conta.id,
    fornecedor: conta.fornecedor,
    rotulo: f ? f.FORNECEDOR.rotulo : conta.fornecedor,
    simulado: f ? !!f.FORNECEDOR.simulado : false,
    apelido: conta.apelido,
    categoria: conta.categoria,
    unidadeConsumidora: conta.unidade_consumidora,
    ativo: !!conta.ativo,
    ultimaVerificacao: conta.ultima_verificacao,
    status: conta.ultimo_status || 'pendente',
    mensagem: conta.ultima_mensagem,
    fatura: fatura ? {
      id: fatura.id,
      competencia: fatura.competencia,
      vencimento: fatura.vencimento,
      valorCentavos: fatura.valor_centavos,
      situacao: fatura.situacao
    } : null
  };
}

// Consulta o portal e guarda a fatura. Também lança a despesa em
// contas_escritorio, para o mês fechar com o valor certo.
async function consultar(db, conta, referencia = new Date()) {
  const f = adaptador(conta.fornecedor);
  if (!f) throw new Error('Fornecedor não suportado.');
  if (!conta.unidade_consumidora) throw new Error('Escolha a unidade consumidora antes de consultar.');

  const ts = nowIso();
  try {
    const fatura = await f.buscarFatura(credenciaisDe(conta), conta.unidade_consumidora, referencia);

    const existente = db.get(
      'SELECT * FROM faturas_automaticas WHERE conta_automatica_id = ? AND competencia = ?',
      [conta.id, fatura.competencia]
    );

    let contaEscritorioId = existente ? existente.conta_escritorio_id : null;
    if (!contaEscritorioId) {
      contaEscritorioId = db.insert(
        `INSERT INTO contas_escritorio (nome, categoria, vencimento, valor_centavos, status, created_at, updated_at, dirty)
         VALUES (?, ?, ?, ?, 'a_pagar', ?, ?, 1)`,
        [`${f.FORNECEDOR.nome} · UC ${conta.unidade_consumidora}`, conta.categoria || f.FORNECEDOR.categoria,
          fatura.vencimento, fatura.valorCentavos, ts, ts]
      );
    } else {
      db.run('UPDATE contas_escritorio SET vencimento = ?, valor_centavos = ?, updated_at = ?, dirty = 1 WHERE id = ?',
        [fatura.vencimento, fatura.valorCentavos, ts, contaEscritorioId]);
    }

    if (existente) {
      db.run(`UPDATE faturas_automaticas SET vencimento = ?, valor_centavos = ?, linha_digitavel = ?, codigo_pix = ?, obtida_em = ?, conta_escritorio_id = ? WHERE id = ?`,
        [fatura.vencimento, fatura.valorCentavos, fatura.linhaDigitavel, fatura.codigoPix, ts, contaEscritorioId, existente.id]);
    } else {
      db.insert(`INSERT INTO faturas_automaticas (conta_automatica_id, conta_escritorio_id, competencia, vencimento, valor_centavos, linha_digitavel, codigo_pix, obtida_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [conta.id, contaEscritorioId, fatura.competencia, fatura.vencimento, fatura.valorCentavos, fatura.linhaDigitavel, fatura.codigoPix, ts]);
    }

    db.run('UPDATE contas_automaticas SET ultima_verificacao = ?, ultimo_status = ?, ultima_mensagem = ?, updated_at = ? WHERE id = ?',
      [ts, 'ok', `Fatura de ${fatura.competencia} obtida.`, ts, conta.id]);
    db.recordChange('contas_escritorio', contaEscritorioId, 'update',
      `Fatura ${f.FORNECEDOR.nome} (UC ${conta.unidade_consumidora}) de ${fatura.competencia} importada.`, {});

    return { ok: true, fatura };
  } catch (err) {
    db.run('UPDATE contas_automaticas SET ultima_verificacao = ?, ultimo_status = ?, ultima_mensagem = ?, updated_at = ? WHERE id = ?',
      [ts, 'erro', err.message, ts, conta.id]);
    return { ok: false, erro: err.message };
  }
}

// Está na hora configurada e ainda não consultamos nesta competência?
function contasPendentes(db, agora = new Date()) {
  const { dia, hora } = agendamento(db, 'contas.consulta');
  const [hh, mm] = String(hora).split(':').map(Number);
  const alvo = new Date(agora.getFullYear(), agora.getMonth(), dia, hh, mm, 0, 0);
  if (agora < alvo) return [];

  const competencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  return db.all('SELECT * FROM contas_automaticas WHERE ativo = 1 AND unidade_consumidora IS NOT NULL')
    .filter((c) => !db.get('SELECT id FROM faturas_automaticas WHERE conta_automatica_id = ? AND competencia = ?', [c.id, competencia]));
}

async function rodarAgendador(db) {
  const pendentes = contasPendentes(db);
  for (const conta of pendentes) await consultar(db, conta);
  return pendentes.length;
}

module.exports = { FORNECEDORES, listarFornecedores, adaptador, cifrar, visaoPublica, consultar, contasPendentes, rodarAgendador };

const express = require('express');
const { requireRole } = require('../lib/session');
const { requireArea } = require('../lib/areas');
const { nowIso } = require('../lib/time');
const { cifrar, usandoChavePadrao } = require('../lib/segredos');
const { matrizQr } = require('../lib/qrcode');
const auto = require('../lib/contas-automaticas');

module.exports = function contasAutoRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));
  router.use(requireArea(db, 'escritorio'));

  router.get('/fornecedores', (req, res) => {
    res.json({ fornecedores: auto.listarFornecedores(), chavePadrao: usandoChavePadrao() });
  });

  router.get('/', (req, res) => {
    const contas = db.all('SELECT * FROM contas_automaticas WHERE ativo = 1 ORDER BY apelido ASC');
    res.json({ contas: contas.map((c) => auto.visaoPublica(db, c)) });
  });

  // Passo 1 do cadastro: com o login, o portal devolve as unidades
  // consumidoras. Havendo mais de uma, a tela pergunta qual usar.
  router.post('/unidades', async (req, res) => {
    const { fornecedor, login, senha } = req.body || {};
    const f = auto.adaptador(fornecedor);
    if (!f) return res.status(400).json({ error: 'Fornecedor não suportado.' });
    if (!login || !senha) return res.status(400).json({ error: 'Informe o login e a senha do portal.' });
    try {
      const unidades = await f.listarUnidades({ login, senha });
      res.json({ unidades, simulado: !!f.FORNECEDOR.simulado });
    } catch (err) {
      res.status(502).json({ error: 'Não foi possível consultar o portal: ' + err.message });
    }
  });

  // Passo 2: grava a conta já com a unidade escolhida e busca a fatura.
  router.post('/', async (req, res) => {
    const { fornecedor, apelido, login, senha, unidadeConsumidora, categoria } = req.body || {};
    const f = auto.adaptador(fornecedor);
    if (!f) return res.status(400).json({ error: 'Fornecedor não suportado.' });
    if (!login || !senha) return res.status(400).json({ error: 'Informe o login e a senha do portal.' });
    if (!unidadeConsumidora) return res.status(400).json({ error: 'Escolha a unidade consumidora.' });

    const ts = nowIso();
    const id = db.insert(
      `INSERT INTO contas_automaticas (fornecedor, apelido, categoria, login, senha_cifrada, unidade_consumidora, ativo, ultimo_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'pendente', ?, ?)`,
      [fornecedor, (apelido || f.FORNECEDOR.rotulo).trim(), categoria || f.FORNECEDOR.categoria,
        login, cifrar(senha), String(unidadeConsumidora), ts, ts]
    );
    db.recordChange('contas_automaticas', id, 'create', `Conta automática "${apelido || f.FORNECEDOR.rotulo}" cadastrada (UC ${unidadeConsumidora}).`, {});

    const conta = db.get('SELECT * FROM contas_automaticas WHERE id = ?', [id]);
    const r = await auto.consultar(db, conta);
    res.status(201).json({ id, primeiraConsulta: r, conta: auto.visaoPublica(db, db.get('SELECT * FROM contas_automaticas WHERE id = ?', [id])) });
  });

  router.post('/:id/consultar', async (req, res) => {
    const conta = db.get('SELECT * FROM contas_automaticas WHERE id = ? AND ativo = 1', [req.params.id]);
    if (!conta) return res.status(404).json({ error: 'Conta automática não encontrada.' });
    const r = await auto.consultar(db, conta);
    if (!r.ok) return res.status(502).json({ error: r.erro });
    res.json({ ok: true, conta: auto.visaoPublica(db, db.get('SELECT * FROM contas_automaticas WHERE id = ?', [conta.id])) });
  });

  // A fatura para pagamento: valor, vencimento, linha digitável e o PIX já
  // convertido em matriz de QR (a tela desenha o quadrado).
  router.get('/:id/fatura', (req, res) => {
    const conta = db.get('SELECT * FROM contas_automaticas WHERE id = ? AND ativo = 1', [req.params.id]);
    if (!conta) return res.status(404).json({ error: 'Conta automática não encontrada.' });
    const fatura = db.get('SELECT * FROM faturas_automaticas WHERE conta_automatica_id = ? ORDER BY competencia DESC LIMIT 1', [conta.id]);
    if (!fatura) return res.status(404).json({ error: 'Nenhuma fatura foi obtida ainda para esta conta.' });

    const f = auto.adaptador(conta.fornecedor);
    let qr = null;
    try { qr = matrizQr(fatura.codigo_pix); } catch (err) { qr = null; }

    res.json({
      fornecedor: f ? f.FORNECEDOR.nome : conta.fornecedor,
      simulado: f ? !!f.FORNECEDOR.simulado : false,
      apelido: conta.apelido,
      unidadeConsumidora: conta.unidade_consumidora,
      competencia: fatura.competencia,
      vencimento: fatura.vencimento,
      valorCentavos: fatura.valor_centavos,
      linhaDigitavel: fatura.linha_digitavel,
      codigoPix: fatura.codigo_pix,
      situacao: fatura.situacao,
      qr
    });
  });

  router.put('/:id/fatura/situacao', (req, res) => {
    const conta = db.get('SELECT * FROM contas_automaticas WHERE id = ? AND ativo = 1', [req.params.id]);
    if (!conta) return res.status(404).json({ error: 'Conta automática não encontrada.' });
    const fatura = db.get('SELECT * FROM faturas_automaticas WHERE conta_automatica_id = ? ORDER BY competencia DESC LIMIT 1', [conta.id]);
    if (!fatura) return res.status(404).json({ error: 'Nenhuma fatura encontrada.' });
    const situacao = req.body.situacao === 'paga' ? 'paga' : 'em_aberto';
    db.run('UPDATE faturas_automaticas SET situacao = ? WHERE id = ?', [situacao, fatura.id]);
    if (fatura.conta_escritorio_id) {
      db.run('UPDATE contas_escritorio SET status = ?, updated_at = ?, dirty = 1 WHERE id = ?',
        [situacao === 'paga' ? 'pago' : 'a_pagar', nowIso(), fatura.conta_escritorio_id]);
    }
    res.json({ ok: true, situacao });
  });

  router.delete('/:id', (req, res) => {
    const conta = db.get('SELECT * FROM contas_automaticas WHERE id = ? AND ativo = 1', [req.params.id]);
    if (!conta) return res.status(404).json({ error: 'Conta automática não encontrada.' });
    db.run('UPDATE contas_automaticas SET ativo = 0, updated_at = ? WHERE id = ?', [nowIso(), conta.id]);
    db.recordChange('contas_automaticas', conta.id, 'update', `Conta automática "${conta.apelido}" desativada.`, {});
    res.json({ ok: true });
  });

  return router;
};

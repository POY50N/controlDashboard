const express = require('express');
const { requireRole } = require('../lib/session');
const { nowIso } = require('../lib/time');
const { visibleOwners, ownerScope, canSeeClient, SEM_PERMISSAO } = require('../lib/access');

module.exports = function financeiroRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));

  router.get('/honorarios', (req, res) => {
    const scope = ownerScope(visibleOwners(db, req.session.subject_id), 'c.owner_id');
    const rows = db.all(`
      SELECT h.*, c.nome AS cliente_nome
      FROM honorarios h JOIN clients c ON c.id = h.client_id
      WHERE c.deleted = 0${scope.sql}
      ORDER BY h.vencimento DESC
    `, scope.params);
    const totals = db.get(`
      SELECT
        COALESCE(SUM(CASE WHEN h.status = 'pago' AND strftime('%Y-%m', h.vencimento) = strftime('%Y-%m','now') THEN h.valor_centavos END), 0) AS recebidoMes,
        COALESCE(SUM(CASE WHEN h.status IN ('a_vencer','avisado') THEN h.valor_centavos END), 0) AS aReceber,
        COALESCE(SUM(CASE WHEN h.status = 'atraso' THEN h.valor_centavos END), 0) AS vencido
      FROM honorarios h JOIN clients c ON c.id = h.client_id WHERE c.deleted = 0${scope.sql}
    `, scope.params);
    res.json({ honorarios: rows, totals });
  });

  router.post('/honorarios', (req, res) => {
    const { clientId, referencia, valor, vencimento } = req.body;
    if (!clientId || !valor || !vencimento) return res.status(400).json({ error: 'Cliente, valor e vencimento são obrigatórios.' });
    if (!canSeeClient(db, req.session.subject_id, clientId)) return res.status(403).json({ error: SEM_PERMISSAO });
    const ts = nowIso();
    const id = db.insert(
      `INSERT INTO honorarios (client_id, referencia, valor_centavos, vencimento, status, created_at, updated_at, dirty) VALUES (?, ?, ?, ?, 'a_vencer', ?, ?, 1)`,
      [clientId, referencia || 'Honorários', Math.round(Number(valor) * 100), vencimento, ts, ts]
    );
    db.recordChange('honorarios', id, 'create', `Nova cobrança lançada (${referencia || 'Honorários'}).`, {});
    res.status(201).json({ id });
  });

  router.put('/honorarios/:id', (req, res) => {
    const h = db.get('SELECT * FROM honorarios WHERE id = ?', [req.params.id]);
    if (!h) return res.status(404).json({ error: 'Cobrança não encontrada.' });
    if (!canSeeClient(db, req.session.subject_id, h.client_id)) return res.status(403).json({ error: SEM_PERMISSAO });
    const { status } = req.body;
    const ts = nowIso();
    db.run('UPDATE honorarios SET status = ?, updated_at = ?, dirty = 1 WHERE id = ?', [status, ts, h.id]);
    db.recordChange('honorarios', h.id, 'update', `Cobrança "${h.referencia}" marcada como ${status}.`, { status });
    res.json({ ok: true });
  });

  router.get('/contas', (req, res) => {
    const rows = db.all('SELECT * FROM contas_escritorio ORDER BY vencimento ASC');
    const totals = db.get(`
      SELECT
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', vencimento) = strftime('%Y-%m','now') THEN valor_centavos END), 0) AS totalMes,
        COALESCE(SUM(CASE WHEN status = 'vence_em_breve' THEN valor_centavos END), 0) AS venceEmBreve,
        COALESCE(SUM(CASE WHEN status = 'pago' THEN valor_centavos END), 0) AS jaPago
      FROM contas_escritorio
    `);
    res.json({ contas: rows, totals });
  });

  router.post('/contas', (req, res) => {
    const { nome, categoria, valor, vencimento } = req.body;
    if (!nome || !valor) return res.status(400).json({ error: 'Nome e valor são obrigatórios.' });
    const ts = nowIso();
    const id = db.insert(
      `INSERT INTO contas_escritorio (nome, categoria, vencimento, valor_centavos, status, created_at, updated_at, dirty) VALUES (?, ?, ?, ?, 'a_pagar', ?, ?, 1)`,
      [nome, categoria || null, vencimento || null, Math.round(Number(valor) * 100), ts, ts]
    );
    db.recordChange('contas_escritorio', id, 'create', `Nova conta do escritório: "${nome}".`, {});
    res.status(201).json({ id });
  });

  router.put('/contas/:id', (req, res) => {
    const c = db.get('SELECT * FROM contas_escritorio WHERE id = ?', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Conta não encontrada.' });
    const { status } = req.body;
    const ts = nowIso();
    db.run('UPDATE contas_escritorio SET status = ?, updated_at = ?, dirty = 1 WHERE id = ?', [status, ts, c.id]);
    db.recordChange('contas_escritorio', c.id, 'update', `Conta "${c.nome}" marcada como ${status}.`, { status });
    res.json({ ok: true });
  });

  return router;
};

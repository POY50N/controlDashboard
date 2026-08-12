const express = require('express');
const { requireRole } = require('../lib/session');
const { nowIso } = require('../lib/time');
const { visibleOwners, ownerScope, canSeeProcesso, canSeeOwner, SEM_PERMISSAO } = require('../lib/access');

module.exports = function processosRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));

  router.get('/', (req, res) => {
    const eu = req.session.subject_id;
    const owners = visibleOwners(db, eu);

    // ?owner=<id> mostra os processos de um colaborador específico - só passa
    // se esse colaborador já estiver entre os visíveis.
    let filtro = owners;
    if (req.query.owner) {
      const alvo = Number(req.query.owner);
      if (!canSeeOwner(db, eu, alvo)) return res.status(403).json({ error: SEM_PERMISSAO });
      filtro = [alvo];
    }

    const scope = ownerScope(filtro, 'c.owner_id');
    const rows = db.all(`
      SELECT p.*, c.nome AS cliente_nome, c.owner_id AS owner_id, a.nome AS responsavel_nome
      FROM processos p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN admins a ON a.id = c.owner_id
      WHERE c.deleted = 0${scope.sql}
      ORDER BY p.updated_at DESC
    `, scope.params);

    res.json({
      processos: rows.map((p) => ({ ...p, meu: p.owner_id === eu })),
      escopo: req.query.owner ? Number(req.query.owner) : null
    });
  });

  router.get('/:id', (req, res) => {
    if (!canSeeProcesso(db, req.session.subject_id, req.params.id)) return res.status(403).json({ error: SEM_PERMISSAO });
    const p = db.get(`
      SELECT p.*, c.nome AS cliente_nome, c.owner_id AS owner_id, a.nome AS responsavel_nome
      FROM processos p
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN admins a ON a.id = c.owner_id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' });
    const andamentos = db.all('SELECT * FROM andamentos WHERE processo_id = ? ORDER BY data DESC', [p.id]);
    res.json({ processo: p, andamentos, meu: p.owner_id === req.session.subject_id });
  });

  router.post('/:id/andamentos', (req, res) => {
    if (!canSeeProcesso(db, req.session.subject_id, req.params.id)) return res.status(403).json({ error: SEM_PERMISSAO });
    const p = db.get('SELECT * FROM processos WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' });
    const { titulo, descricao, data } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório.' });
    const ts = nowIso();
    const id = db.insert(
      'INSERT INTO andamentos (processo_id, data, titulo, descricao) VALUES (?, ?, ?, ?)',
      [p.id, data || ts.slice(0, 10), titulo, descricao || null]
    );
    db.run('UPDATE processos SET updated_at = ?, dirty = 1 WHERE id = ?', [ts, p.id]);
    db.recordChange('processos', p.id, 'update', `Nova movimentação em "${p.titulo}": ${titulo}.`, { andamentoId: id });
    res.status(201).json({ id });
  });

  router.put('/:id', (req, res) => {
    if (!canSeeProcesso(db, req.session.subject_id, req.params.id)) return res.status(403).json({ error: SEM_PERMISSAO });
    const p = db.get('SELECT * FROM processos WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' });
    const { status, proximaAudiencia } = req.body;
    const ts = nowIso();
    db.run('UPDATE processos SET status = COALESCE(?, status), proxima_audiencia = COALESCE(?, proxima_audiencia), updated_at = ?, dirty = 1 WHERE id = ?', [status || null, proximaAudiencia || null, ts, p.id]);
    db.recordChange('processos', p.id, 'update', `Processo "${p.titulo}" atualizado.`, { status, proximaAudiencia });
    res.json({ ok: true });
  });

  return router;
};

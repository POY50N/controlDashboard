const express = require('express');
const { requireRole } = require('../lib/session');
const { nowIso } = require('../lib/time');
const { visibleOwners, ownerScope, canSeeClient, SEM_PERMISSAO } = require('../lib/access');

function onlyDigits(v) { return (v || '').replace(/\D/g, ''); }

function tagForClient(db, clientId) {
  const overdue = db.get('SELECT COUNT(*) AS n FROM honorarios WHERE client_id = ? AND status = "atraso"', [clientId]);
  if (overdue.n > 0) return { tag: 'ATRASO', kind: 'late' };
  const warned = db.get('SELECT COUNT(*) AS n FROM honorarios WHERE client_id = ? AND status = "avisado"', [clientId]);
  if (warned.n > 0) return { tag: 'AVISADO', kind: 'mute' };
  const upcoming = db.get('SELECT COUNT(*) AS n FROM honorarios WHERE client_id = ? AND status = "a_vencer"', [clientId]);
  if (upcoming.n > 0) return { tag: 'A VENCER', kind: 'open' };
  return { tag: 'EM DIA', kind: 'done' };
}

module.exports = function clientsRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));

  router.get('/', (req, res) => {
    const owners = visibleOwners(db, req.session.subject_id);
    const scope = ownerScope(owners, 'c.owner_id');
    const rows = db.all(
      `SELECT c.*, a.nome AS responsavel_nome
       FROM clients c LEFT JOIN admins a ON a.id = c.owner_id
       WHERE c.deleted = 0${scope.sql} ORDER BY c.nome ASC`,
      scope.params
    );
    const out = rows.map((c) => {
      const processos = db.get('SELECT COUNT(*) AS n FROM processos WHERE client_id = ?', [c.id]);
      return {
        id: c.id, tipo: c.tipo, nome: c.nome, documento: c.documento,
        processos: processos.n, ultimoContato: c.ultimo_contato,
        hasPassword: !!c.password_hash,
        ownerId: c.owner_id,
        responsavel: c.responsavel_nome,
        meu: c.owner_id === req.session.subject_id,
        ...tagForClient(db, c.id)
      };
    });
    res.json({ clients: out });
  });

  router.get('/:id', (req, res) => {
    if (!canSeeClient(db, req.session.subject_id, req.params.id)) return res.status(403).json({ error: SEM_PERMISSAO });
    const c = db.get('SELECT * FROM clients WHERE id = ? AND deleted = 0', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const processos = db.all('SELECT * FROM processos WHERE client_id = ? ORDER BY distribuido_em DESC', [c.id]);
    const honorarios = db.all('SELECT * FROM honorarios WHERE client_id = ? ORDER BY vencimento DESC', [c.id]);
    const temSenha = !!c.password_hash;
    delete c.password_hash;
    res.json({ client: c, processos, honorarios, hasPassword: temSenha });
  });

  router.post('/', (req, res) => {
    const b = req.body;
    if (!b.nome || !b.documento) return res.status(400).json({ error: 'Nome e documento são obrigatórios.' });
    const digits = onlyDigits(b.documento);
    const exists = db.get('SELECT id FROM clients WHERE documento = ?', [digits]);
    if (exists) return res.status(409).json({ error: 'Já existe um cliente com este documento.' });

    const ts = nowIso();
    // Quem cadastra passa a ser o responsável pelo cliente.
    const ownerId = req.session.subject_id;
    const id = db.insert(
      `INSERT INTO clients (tipo, nome, documento, documento_secundario, data_ref, extra, email, telefone, cep, logradouro, numero, cidade_uf, status, owner_id, ultimo_contato, created_at, updated_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', ?, ?, ?, ?, 1)`,
      [b.tipo === 'PJ' ? 'PJ' : 'PF', b.nome, digits, b.documentoSecundario || null, b.dataRef || null, b.extra || null,
        b.email || null, b.telefone || null, b.cep || null, b.logradouro || null, b.numero || null, b.cidadeUf || null,
        ownerId, 'cadastro agora', ts, ts]
    );

    if (b.processoInicial && (b.processoInicial.area || b.processoInicial.numero)) {
      db.insert(
        `INSERT INTO processos (client_id, area, titulo, numero, vara, status, distribuido_em, created_at, updated_at, dirty)
         VALUES (?, ?, ?, ?, ?, 'em_andamento', ?, ?, ?, 1)`,
        [id, b.processoInicial.area || null, b.processoInicial.area || 'Processo', b.processoInicial.numero || null, null, ts, ts, ts]
      );
    }

    if (b.honorario && b.honorario.valor) {
      db.insert(
        `INSERT INTO honorarios (client_id, referencia, valor_centavos, vencimento, status, created_at, updated_at, dirty)
         VALUES (?, ?, ?, ?, 'a_vencer', ?, ?, 1)`,
        [id, 'Honorários · mensal', Math.round(Number(b.honorario.valor) * 100), b.honorario.primeiraParcela || ts.slice(0, 10), ts, ts]
      );
    }

    db.recordChange('clients', id, 'create', `Cliente "${b.nome}" cadastrado.`, { nome: b.nome, documento: digits });
    res.status(201).json({ id });
  });

  router.put('/:id', (req, res) => {
    if (!canSeeClient(db, req.session.subject_id, req.params.id)) return res.status(403).json({ error: SEM_PERMISSAO });
    const c = db.get('SELECT * FROM clients WHERE id = ? AND deleted = 0', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const b = req.body;
    const fields = ['nome', 'email', 'telefone', 'cep', 'logradouro', 'numero', 'cidade_uf', 'status'];
    const changed = [];
    const values = [];
    for (const f of fields) {
      const camel = f.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      if (b[camel] !== undefined && b[camel] !== c[f]) {
        changed.push(`${f} = ?`);
        values.push(b[camel]);
      }
    }
    if (!changed.length) return res.json({ ok: true, unchanged: true });
    const ts = nowIso();
    values.push(ts, req.params.id);
    db.run(`UPDATE clients SET ${changed.join(', ')}, updated_at = ?, dirty = 1 WHERE id = ?`, values);
    db.recordChange('clients', c.id, 'update', `Dados de "${c.nome}" atualizados (${changed.length} campo(s)).`, { fields: changed });
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    if (!canSeeClient(db, req.session.subject_id, req.params.id)) return res.status(403).json({ error: SEM_PERMISSAO });
    const c = db.get('SELECT * FROM clients WHERE id = ? AND deleted = 0', [req.params.id]);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
    db.run('UPDATE clients SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', [nowIso(), req.params.id]);
    db.recordChange('clients', c.id, 'delete', `Cliente "${c.nome}" removido.`, {});
    res.json({ ok: true });
  });

  return router;
};

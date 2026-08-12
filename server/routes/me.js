const express = require('express');
const { requireRole } = require('../lib/session');
const { hashPassword, verifyPassword } = require('../lib/password');
const { nowIso } = require('../lib/time');

module.exports = function meRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'client'));

  function client(req) {
    return db.get('SELECT * FROM clients WHERE id = ? AND deleted = 0', [req.session.subject_id]);
  }

  router.get('/', (req, res) => {
    const c = client(req);
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
    delete c.password_hash;
    res.json({ client: c });
  });

  router.get('/processos', (req, res) => {
    const c = client(req);
    const processos = db.all('SELECT * FROM processos WHERE client_id = ? ORDER BY updated_at DESC', [c.id]);
    const withAndamentos = processos.map((p) => ({
      ...p,
      andamentos: db.all('SELECT * FROM andamentos WHERE processo_id = ? ORDER BY data DESC', [p.id])
    }));
    res.json({ processos: withAndamentos });
  });

  router.get('/honorarios', (req, res) => {
    const c = client(req);
    const honorarios = db.all('SELECT * FROM honorarios WHERE client_id = ? ORDER BY vencimento ASC', [c.id]);
    res.json({ honorarios });
  });

  router.put('/senha', (req, res) => {
    const c = client(req);
    const { atual, nova } = req.body;
    if (!verifyPassword(atual || '', c.password_hash)) return res.status(401).json({ error: 'Senha atual incorreta.' });
    if (!nova || nova.length < 8) return res.status(400).json({ error: 'A nova senha deve ter ao menos 8 caracteres.' });
    db.run('UPDATE clients SET password_hash = ?, updated_at = ?, dirty = 1 WHERE id = ?', [hashPassword(nova), nowIso(), c.id]);
    db.recordChange('clients', c.id, 'update', `Senha alterada por "${c.nome}".`, { field: 'password_hash' });
    res.json({ ok: true });
  });

  return router;
};

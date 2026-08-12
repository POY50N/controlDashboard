const express = require('express');
const { requireRole } = require('../lib/session');
const { visibleOwners, ownerScope, isTitular } = require('../lib/access');
const { requireArea } = require('../lib/areas');

module.exports = function dashboardRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));
  router.use(requireArea(db, 'visao'));

  // Todos os números refletem apenas o que o colaborador logado pode ver:
  // os próprios clientes e os de quem o autorizou. O titular vê tudo.
  router.get('/summary', (req, res) => {
    const eu = req.session.subject_id;
    const owners = visibleOwners(db, eu);
    const s = ownerScope(owners, 'c.owner_id');

    const clientesAtivos = db.get(
      `SELECT COUNT(*) AS n FROM clients c WHERE c.deleted = 0 AND c.status != 'inativo'${s.sql}`, s.params);
    const processosAndamento = db.get(
      `SELECT COUNT(*) AS n FROM processos p JOIN clients c ON c.id = p.client_id
       WHERE p.status = 'em_andamento' AND c.deleted = 0${s.sql}`, s.params);
    const aReceberMes = db.get(
      `SELECT COALESCE(SUM(h.valor_centavos),0) AS v FROM honorarios h JOIN clients c ON c.id = h.client_id
       WHERE h.status IN ('a_vencer','avisado') AND strftime('%Y-%m', h.vencimento) = strftime('%Y-%m','now')
       AND c.deleted = 0${s.sql}`, s.params);
    const emAtraso = db.get(
      `SELECT COALESCE(SUM(h.valor_centavos),0) AS v FROM honorarios h JOIN clients c ON c.id = h.client_id
       WHERE h.status = 'atraso' AND c.deleted = 0${s.sql}`, s.params);

    const movimentacoes = db.all(`
      SELECT a.data, a.titulo, a.descricao, p.numero, p.titulo AS processo_titulo, c.nome AS cliente_nome
      FROM andamentos a
      JOIN processos p ON p.id = a.processo_id
      JOIN clients c ON c.id = p.client_id
      WHERE c.deleted = 0${s.sql}
      ORDER BY a.data DESC, a.id DESC
      LIMIT 6
    `, s.params);

    const pendencias = db.all(`
      SELECT h.id, h.referencia, h.valor_centavos, h.vencimento, h.status, c.nome AS cliente_nome
      FROM honorarios h JOIN clients c ON c.id = h.client_id
      WHERE c.deleted = 0 AND h.status IN ('atraso','a_vencer','avisado')${s.sql}
      ORDER BY h.vencimento ASC LIMIT 6
    `, s.params);

    const agenda = db.all(`
      SELECT p.proxima_audiencia AS data, p.titulo, c.nome AS cliente_nome
      FROM processos p JOIN clients c ON c.id = p.client_id
      WHERE p.proxima_audiencia IS NOT NULL AND c.deleted = 0${s.sql}
      ORDER BY p.proxima_audiencia ASC LIMIT 6
    `, s.params);

    res.json({
      clientesAtivos: clientesAtivos.n,
      processosAndamento: processosAndamento.n,
      aReceberMes: aReceberMes.v,
      emAtraso: emAtraso.v,
      titular: isTitular(db, eu),
      movimentacoes, pendencias, agenda
    });
  });

  return router;
};

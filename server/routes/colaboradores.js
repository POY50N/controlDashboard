const express = require('express');
const { requireRole } = require('../lib/session');
const { nowIso } = require('../lib/time');
const { isTitular, visibleOwners } = require('../lib/access');
const { AREAS, CARGOS, padraoDoCargo, sanitizar, areasDoAdmin, requireArea } = require('../lib/areas');

// Colaboradores são contas administrativas do escritório (a equipe do
// titular). Ficam na mesma tabela `admins`, então entram pelo mesmo login e
// pelo mesmo aplicativo desktop.
//
// O cadastro nunca define a senha: o colaborador cria a dele no primeiro
// acesso, exatamente como os clientes fazem.

const CARGO_KEYS = CARGOS.map((c) => c.key);

function onlyDigits(v) { return (v || '').replace(/\D/g, ''); }
function normalizeUser(v) { return (v || '').trim().toLowerCase(); }

function publicView(row) {
  let areas = [];
  try { areas = JSON.parse(row.permissoes || '[]'); } catch (e) { areas = []; }
  return {
    id: row.id,
    nome: row.nome,
    username: row.username,
    cargo: row.cargo,
    oab: row.oab,
    documento: row.documento,
    email: row.email,
    telefone: row.telefone,
    temSenha: !!row.password_hash,
    titular: row.cargo === 'titular',
    areas: row.cargo === 'titular' ? AREAS.map((a) => a.key) : sanitizar(areas)
  };
}

module.exports = function colaboradoresRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));

  // Ninguém entrega mais poder do que tem. O titular é a única exceção.
  function limitarAoQueTenho(adminId, desejadas) {
    const pedidas = sanitizar(desejadas);
    if (isTitular(db, adminId)) return pedidas;
    const minhas = areasDoAdmin(db, adminId);
    return pedidas.filter((a) => minhas.includes(a));
  }

  // Catálogo de quadros e áreas + o que vem pré-marcado em cada quadro.
  // A tela de cadastro monta os campos a partir daqui.
  router.get('/opcoes', (req, res) => {
    res.json({
      areas: AREAS,
      cargos: CARGOS.filter((c) => c.key !== 'titular').map((c) => ({
        ...c, padrao: padraoDoCargo(c.key)
      }))
    });
  });

  router.get('/', requireArea(db, 'colaboradores'), (req, res) => {
    const rows = db.all('SELECT * FROM admins WHERE ativo = 1 ORDER BY (cargo = "titular") DESC, nome ASC');
    res.json({ colaboradores: rows.map(publicView), euId: req.session.subject_id });
  });

  router.post('/', requireArea(db, 'colaboradores'), (req, res) => {
    const b = req.body || {};
    const nome = (b.nome || '').trim();
    const username = normalizeUser(b.username);
    const cargo = CARGO_KEYS.includes(b.cargo) ? b.cargo : 'outro';
    // Se a tela mandou a lista de áreas, ela manda; senão cai no padrão do
    // quadro escolhido. Quem não é titular não pode conceder área que ele
    // próprio não tem - senão bastaria criar um colaborador com tudo e
    // entrar como ele.
    const areas = limitarAoQueTenho(req.session.subject_id, Array.isArray(b.areas) ? b.areas : padraoDoCargo(cargo));

    if (!nome) return res.status(400).json({ error: 'Informe o nome do colaborador.' });
    if (username.length < 3) return res.status(400).json({ error: 'O usuário precisa ter ao menos 3 caracteres.' });
    if (/\s/.test(username)) return res.status(400).json({ error: 'O usuário não pode conter espaços.' });

    const existe = db.get('SELECT id FROM admins WHERE lower(username) = ?', [username]);
    if (existe) return res.status(409).json({ error: 'Já existe um colaborador com este usuário.' });

    // Só pode haver um titular; novos cadastros nunca assumem esse papel.
    if (cargo === 'titular') return res.status(400).json({ error: 'O escritório já possui um titular.' });

    const ts = nowIso();
    const id = db.insert(
      `INSERT INTO admins (username, nome, oab, documento, telefone, email, cargo, permissoes, ativo, password_hash, created_at, updated_at, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?, 1)`,
      [username, nome, (b.oab || '').trim() || null, onlyDigits(b.documento) || null,
        (b.telefone || '').trim() || null, (b.email || '').trim() || null, cargo, JSON.stringify(areas), ts, ts]
    );

    db.recordChange('admins', id, 'create', `Colaborador "${nome}" cadastrado (${cargo}, ${areas.length} área(s) liberada(s)).`, { nome, username, cargo, areas });
    res.status(201).json({ id, colaborador: publicView(db.get('SELECT * FROM admins WHERE id = ?', [id])) });
  });

  // Ajusta as áreas de quem já está cadastrado (o quadro continua o mesmo).
  router.put('/:id/areas', requireArea(db, 'colaboradores'), (req, res) => {
    const alvo = db.get('SELECT * FROM admins WHERE id = ? AND ativo = 1', [req.params.id]);
    if (!alvo) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    if (alvo.cargo === 'titular') return res.status(403).json({ error: 'O titular tem acesso a tudo e não pode ser restringido.' });
    // Barra a escalada mais óbvia: ampliar as próprias permissões.
    if (alvo.id === req.session.subject_id) {
      return res.status(403).json({ error: 'Você não pode alterar as suas próprias áreas. Peça ao titular do escritório.' });
    }

    const areas = limitarAoQueTenho(req.session.subject_id, req.body.areas);
    db.run('UPDATE admins SET permissoes = ?, updated_at = ?, dirty = 1 WHERE id = ?', [JSON.stringify(areas), nowIso(), alvo.id]);
    db.recordChange('admins', alvo.id, 'update', `Áreas de "${alvo.nome}" atualizadas (${areas.length} liberada(s)).`, { areas });
    res.json({ ok: true, areas });
  });

  // --- Permissões -----------------------------------------------------
  // "Quem pode ver os MEUS clientes e processos." O titular não aparece na
  // lista: ele já enxerga tudo por definição.
  router.get('/permissoes', (req, res) => {
    const eu = req.session.subject_id;
    const outros = db.all(
      'SELECT id, nome, cargo, username FROM admins WHERE ativo = 1 AND id != ? ORDER BY (cargo = "titular") DESC, nome ASC',
      [eu]
    );
    const concedidas = new Set(
      db.all('SELECT grantee_id FROM colaborador_permissoes WHERE owner_id = ?', [eu]).map((r) => r.grantee_id)
    );
    res.json({
      colaboradores: outros.map((c) => ({
        id: c.id, nome: c.nome, cargo: c.cargo, username: c.username,
        titular: c.cargo === 'titular',
        // O titular tem acesso automático e não pode ser desmarcado.
        permitido: c.cargo === 'titular' ? true : concedidas.has(c.id),
        fixo: c.cargo === 'titular'
      }))
    });
  });

  router.put('/permissoes/:id', (req, res) => {
    const eu = req.session.subject_id;
    const alvoId = Number(req.params.id);
    const permitir = !!req.body.permitir;

    if (alvoId === eu) return res.status(400).json({ error: 'Você já tem acesso aos seus próprios processos.' });
    const alvo = db.get('SELECT * FROM admins WHERE id = ? AND ativo = 1', [alvoId]);
    if (!alvo) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    if (alvo.cargo === 'titular') return res.status(400).json({ error: 'O titular do escritório já tem acesso a todos os processos.' });

    const ts = nowIso();
    if (permitir) {
      const existe = db.get('SELECT id FROM colaborador_permissoes WHERE owner_id = ? AND grantee_id = ?', [eu, alvoId]);
      if (!existe) {
        const id = db.insert(
          'INSERT INTO colaborador_permissoes (owner_id, grantee_id, created_at, updated_at, dirty) VALUES (?, ?, ?, ?, 1)',
          [eu, alvoId, ts, ts]
        );
        db.recordChange('colaborador_permissoes', id, 'create', `Acesso aos processos liberado para "${alvo.nome}".`, {});
      }
    } else {
      const existe = db.get('SELECT id FROM colaborador_permissoes WHERE owner_id = ? AND grantee_id = ?', [eu, alvoId]);
      if (existe) {
        db.run('DELETE FROM colaborador_permissoes WHERE id = ?', [existe.id]);
        db.recordChange('colaborador_permissoes', existe.id, 'delete', `Acesso aos processos removido de "${alvo.nome}".`, {});
      }
    }
    res.json({ ok: true, permitido: permitir });
  });

  // Colaboradores cujos processos EU posso abrir. Os não autorizados vêm na
  // lista mesmo assim, marcados, para a tela mostrá-los apagados e sem clique.
  router.get('/acessiveis', (req, res) => {
    const eu = req.session.subject_id;
    const souTitular = isTitular(db, eu);
    const visiveis = visibleOwners(db, eu);
    const todos = db.all(
      'SELECT id, nome, cargo, username FROM admins WHERE ativo = 1 ORDER BY (cargo = "titular") DESC, nome ASC'
    );

    res.json({
      euId: eu,
      souTitular,
      colaboradores: todos.map((c) => {
        const proprio = c.id === eu;
        const autorizado = proprio || souTitular || (visiveis || []).includes(c.id);
        const processos = db.get(
          'SELECT COUNT(*) AS n FROM processos p JOIN clients cl ON cl.id = p.client_id WHERE cl.deleted = 0 AND cl.owner_id = ?',
          [c.id]
        );
        return {
          id: c.id, nome: c.nome, cargo: c.cargo, username: c.username,
          eu: proprio, autorizado, processos: autorizado ? processos.n : null
        };
      })
    });
  });

  router.delete('/:id', requireArea(db, 'colaboradores'), (req, res) => {
    const alvo = db.get('SELECT * FROM admins WHERE id = ? AND ativo = 1', [req.params.id]);
    if (!alvo) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    if (alvo.cargo === 'titular') return res.status(403).json({ error: 'O titular do escritório não pode ser removido.' });
    if (Number(req.params.id) === req.session.subject_id) return res.status(403).json({ error: 'Você não pode remover o seu próprio acesso.' });

    // O cadastro é desativado, não apagado (preserva o histórico). O usuário,
    // porém, é liberado: senão o nome ficaria reservado para sempre e não
    // daria para recadastrar a mesma pessoa.
    const liberado = `${alvo.username}__removido_${alvo.id}`;
    db.run('UPDATE admins SET ativo = 0, username = ?, updated_at = ?, dirty = 1 WHERE id = ?', [liberado, nowIso(), alvo.id]);
    // Some junto qualquer permissão que ele tenha dado ou recebido.
    db.run('DELETE FROM colaborador_permissoes WHERE owner_id = ? OR grantee_id = ?', [alvo.id, alvo.id]);
    db.recordChange('admins', alvo.id, 'update', `Acesso do colaborador "${alvo.nome}" removido.`, {});
    res.json({ ok: true });
  });

  return router;
};

module.exports.CARGOS = CARGOS;

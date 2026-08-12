// Áreas administrativas do painel e o que cada quadro (cargo) recebe por
// padrão ao ser cadastrado.
//
// O padrão é só um ponto de partida: quem cadastra pode marcar e desmarcar à
// vontade antes de salvar. O que fica gravado em `admins.permissoes` é a
// lista final escolhida.

const AREAS = [
  { key: 'visao', label: 'Visão geral', desc: 'Resumo, movimentações e agenda' },
  { key: 'clientes', label: 'Clientes', desc: 'Cadastro, contato e dados' },
  { key: 'processos', label: 'Processos', desc: 'Andamentos e audiências' },
  { key: 'financeiro', label: 'Financeiro dos clientes', desc: 'Honorários e cobranças' },
  { key: 'escritorio', label: 'Contas do escritório', desc: 'Despesas internas do escritório' },
  { key: 'exportar', label: 'Exportar dados', desc: 'Baixar a base de clientes' },
  { key: 'colaboradores', label: 'Equipe', desc: 'Cadastrar e remover colaboradores' }
];

const TODAS = AREAS.map((a) => a.key);

// Quadros disponíveis. `titular` não é oferecido no cadastro: já existe um.
const CARGOS = [
  { key: 'titular', label: 'Titular', descricao: 'Dono do escritório — acesso total, não editável.' },
  { key: 'socio', label: 'Sócio(a)', descricao: 'Acesso a tudo, inclusive contas do escritório e equipe.' },
  { key: 'advogado', label: 'Advogado(a)', descricao: 'Tudo que diz respeito aos clientes; não vê as contas do escritório.' },
  { key: 'secretaria', label: 'Secretário(a)', descricao: 'Contato com clientes, processos e financeiro dos clientes.' },
  { key: 'financeiro', label: 'Financeiro', descricao: 'Honorários dos clientes e contas do escritório.' },
  { key: 'estagiario', label: 'Estagiário(a)', descricao: 'Nada vem marcado — escolha manualmente cada área.' },
  { key: 'outro', label: 'Outro', descricao: 'Nada vem marcado — escolha manualmente cada área.' }
];

const PADRAO_POR_CARGO = {
  titular: TODAS,
  socio: TODAS,
  // Advogado cuida do que é dos clientes, mas não das contas internas.
  advogado: ['visao', 'clientes', 'processos', 'financeiro', 'exportar'],
  // Secretaria: contato com o cliente e o financeiro dele.
  secretaria: ['visao', 'clientes', 'processos', 'financeiro'],
  financeiro: ['visao', 'financeiro', 'escritorio'],
  // Estagiário e "outro" entram sem nada: tudo é marcado a dedo.
  estagiario: [],
  outro: []
};

function padraoDoCargo(cargo) {
  return (PADRAO_POR_CARGO[cargo] || []).slice();
}

function sanitizar(lista) {
  if (!Array.isArray(lista)) return [];
  return TODAS.filter((k) => lista.includes(k));
}

// O titular enxerga tudo sempre, independentemente do que estiver gravado.
function areasDoAdmin(db, adminId) {
  const row = db.get('SELECT cargo, permissoes FROM admins WHERE id = ? AND ativo = 1', [adminId]);
  if (!row) return [];
  if (row.cargo === 'titular') return TODAS.slice();
  try {
    return sanitizar(JSON.parse(row.permissoes || '[]'));
  } catch (err) {
    return [];
  }
}

function temArea(db, adminId, area) {
  return areasDoAdmin(db, adminId).includes(area);
}

const SEM_AREA = 'Seu perfil não tem acesso a esta área do painel.';

// Middleware. Usar sempre depois de requireRole(db, 'admin').
function requireArea(db, area) {
  return (req, res, next) => {
    if (!req.session || !temArea(db, req.session.subject_id, area)) {
      return res.status(403).json({ error: SEM_AREA, area });
    }
    next();
  };
}

module.exports = { AREAS, TODAS, CARGOS, PADRAO_POR_CARGO, padraoDoCargo, sanitizar, areasDoAdmin, temArea, requireArea, SEM_AREA };

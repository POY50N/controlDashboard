// Regras de visibilidade entre colaboradores.
//
//   · O TITULAR do escritório enxerga tudo, sem precisar de autorização.
//   · Qualquer outro colaborador enxerga os próprios clientes/processos e os
//     de quem o autorizou explicitamente.
//
// Tudo o que lista dados de cliente passa por aqui. Esconder botão na tela
// não basta: o filtro é aplicado na consulta.

function isTitular(db, adminId) {
  const row = db.get('SELECT cargo FROM admins WHERE id = ? AND ativo = 1', [adminId]);
  return !!row && row.cargo === 'titular';
}

// Retorna null quando o usuário vê tudo (titular); caso contrário, a lista de
// donos visíveis (ele mesmo + quem o autorizou).
function visibleOwners(db, adminId) {
  if (isTitular(db, adminId)) return null;
  const grants = db.all('SELECT owner_id FROM colaborador_permissoes WHERE grantee_id = ?', [adminId]);
  const ids = new Set([adminId, ...grants.map((g) => g.owner_id)]);
  return [...ids];
}

// Fragmento de SQL para restringir uma consulta. `column` deve apontar para a
// coluna owner_id do cliente na consulta (ex.: 'c.owner_id').
function ownerScope(owners, column) {
  if (owners === null) return { sql: '', params: [] };
  if (!owners.length) return { sql: ' AND 1 = 0', params: [] };
  return { sql: ` AND ${column} IN (${owners.map(() => '?').join(', ')})`, params: owners };
}

function canSeeOwner(db, adminId, ownerId) {
  const owners = visibleOwners(db, adminId);
  if (owners === null) return true;
  return owners.includes(Number(ownerId));
}

function canSeeClient(db, adminId, clientId) {
  const c = db.get('SELECT owner_id FROM clients WHERE id = ? AND deleted = 0', [clientId]);
  if (!c) return false;
  return canSeeOwner(db, adminId, c.owner_id);
}

function canSeeProcesso(db, adminId, processoId) {
  const p = db.get(`
    SELECT c.owner_id AS owner_id FROM processos p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = ? AND c.deleted = 0
  `, [processoId]);
  if (!p) return false;
  return canSeeOwner(db, adminId, p.owner_id);
}

const SEM_PERMISSAO = 'Você não tem autorização do colaborador responsável por este cadastro.';

module.exports = { isTitular, visibleOwners, ownerScope, canSeeOwner, canSeeClient, canSeeProcesso, SEM_PERMISSAO };

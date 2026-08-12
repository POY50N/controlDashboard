const express = require('express');
const { hashPassword, verifyPassword } = require('../lib/password');
const { createSession, readSession, setSessionCookie, clearSessionCookie, destroySession, requireRole } = require('../lib/session');
const { nowIso } = require('../lib/time');

function onlyDigits(v) {
  return (v || '').replace(/\D/g, '');
}

// Letters+digits, uppercased: lets "OAB/SP 000.000" match "oabsp000000".
function normalize(v) {
  return (v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// A single identifier field serves both the lawyer and every client - there
// is no separate "lawyer access" entry point anywhere in the UI.
//
// Accepted for the admin: username, OAB number, own CPF.
// Accepted for a client: username, CPF/CNPJ, phone number.
//
// The same value may legitimately match MORE THAN ONE account (two clients
// sharing a username, or a phone number equal to someone's CPF digits). We
// therefore return every candidate and let the password decide which one.
function findAccounts(db, rawValue) {
  const value = (rawValue || '').trim();
  if (!value) return [];

  const norm = normalize(value);
  const digits = onlyDigits(value);
  const nameOk = norm.length >= 3;
  const digitsOk = digits.length >= 6;
  const found = [];
  const seen = new Set();

  const add = (kind, row, via) => {
    const key = `${kind}:${row.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ kind, row, via });
  };

  db.all('SELECT * FROM admins WHERE ativo = 1').forEach((a) => {
    if (nameOk && normalize(a.username) === norm) return add('admin', a, 'usuário');
    if (a.oab && (normalize(a.oab) === norm || (digitsOk && onlyDigits(a.oab) === digits))) return add('admin', a, 'OAB');
    if (digitsOk && a.documento && a.documento === digits) return add('admin', a, 'CPF');
    if (digitsOk && a.telefone && onlyDigits(a.telefone) === digits) return add('admin', a, 'telefone');
  });

  db.all('SELECT * FROM clients WHERE deleted = 0').forEach((c) => {
    if (nameOk && c.username && normalize(c.username) === norm) add('client', c, 'usuário');
    if (digitsOk && c.documento === digits) add('client', c, 'documento');
    if (digitsOk && c.telefone && onlyDigits(c.telefone) === digits) add('client', c, 'telefone');
  });

  return found;
}

function redirectFor(kind) {
  return kind === 'admin' ? '/admin.html' : '/portal.html';
}

module.exports = function authRoutes(db, { adminOnly = false } = {}) {
  const router = express.Router();

  const CLIENTE_BLOQUEADO = 'Este aplicativo é de uso administrativo do escritório. Clientes devem acessar o portal pelo site.';

  // Lets the login screen know it is running as the administrative build.
  router.get('/mode', (req, res) => res.json({ adminOnly }));

  router.post('/check-identifier', (req, res) => {
    let accounts = findAccounts(db, req.body.value);
    // On the administrative build a client account is not an account at all:
    // never confirm one exists, nor reveal its name.
    if (adminOnly) accounts = accounts.filter((a) => a.kind === 'admin');
    if (!accounts.length) return res.json({ found: false });

    if (accounts.length > 1) {
      // Ambiguous on purpose: we must not reveal which names share this
      // identifier, so the UI just asks for the password.
      return res.json({
        found: true,
        ambiguous: true,
        count: accounts.length,
        anyWithPassword: accounts.some((a) => !!a.row.password_hash)
      });
    }

    const only = accounts[0];
    res.json({
      found: true,
      ambiguous: false,
      kind: only.kind,
      via: only.via,
      hasPassword: !!only.row.password_hash,
      nome: only.row.nome
    });
  });

  router.post('/login', (req, res) => {
    const { value, password } = req.body;
    const accounts = findAccounts(db, value);
    if (!accounts.length) return res.status(404).json({ error: 'Cadastro não localizado.' });

    // The password is what identifies the account when several share the
    // same username / number.
    const match = accounts.find((a) => a.row.password_hash && verifyPassword(password || '', a.row.password_hash));
    if (match) {
      if (adminOnly && match.kind !== 'admin') return res.status(403).json({ error: CLIENTE_BLOQUEADO });
      const { token } = createSession(db, match.kind, match.row.id);
      setSessionCookie(res, token);
      return res.json({ ok: true, role: match.kind, nome: match.row.nome, redirect: redirectFor(match.kind) });
    }

    const pendente = accounts.find((a) => !a.row.password_hash);
    if (pendente && accounts.length === 1) {
      return res.status(409).json({ error: 'Senha ainda não foi criada.', firstAccess: true });
    }
    res.status(401).json({ error: 'Senha incorreta.' });
  });

  router.post('/set-password', (req, res) => {
    const { value, password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres.' });

    const accounts = findAccounts(db, value);
    if (!accounts.length) return res.status(404).json({ error: 'Cadastro não localizado.' });
    if (accounts.length > 1) {
      return res.status(409).json({ error: 'Este acesso é usado por mais de um cadastro. Para criar a senha, informe o seu CPF ou CNPJ.' });
    }

    const only = accounts[0];
    if (adminOnly && only.kind !== 'admin') return res.status(403).json({ error: CLIENTE_BLOQUEADO });
    if (only.row.password_hash) return res.status(409).json({ error: 'Este cadastro já possui senha.' });

    const table = only.kind === 'admin' ? 'admins' : 'clients';
    db.run(`UPDATE ${table} SET password_hash = ?, updated_at = ?, dirty = 1 WHERE id = ?`, [hashPassword(password), nowIso(), only.row.id]);
    db.recordChange(table, only.row.id, 'update', `Senha criada para "${only.row.nome}".`, { field: 'password_hash' });

    const { token } = createSession(db, only.kind, only.row.id);
    setSessionCookie(res, token);
    res.json({ ok: true, role: only.kind, nome: only.row.nome, redirect: redirectFor(only.kind) });
  });

  router.post('/logout', (req, res) => {
    destroySession(db, req);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/session', (req, res) => {
    const session = readSession(db, req);
    if (!session) return res.status(401).json({ error: 'Não autenticado.' });
    if (session.role === 'admin') {
      const row = db.get('SELECT id, nome, oab, cargo FROM admins WHERE id = ?', [session.subject_id]);
      return res.json({
        role: 'admin', id: session.subject_id,
        nome: row ? row.nome : null, oab: row ? row.oab : null,
        cargo: row ? row.cargo : null, titular: !!row && row.cargo === 'titular'
      });
    }
    const row = db.get('SELECT id, nome FROM clients WHERE id = ?', [session.subject_id]);
    res.json({ role: session.role, id: session.subject_id, nome: row ? row.nome : null });
  });

  return router;
};

module.exports.requireRole = requireRole;

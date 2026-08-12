const express = require('express');
const XLSX = require('xlsx');
const { requireRole } = require('../lib/session');
const { visibleOwners, ownerScope } = require('../lib/access');

const COLUMNS = [
  { key: 'nome', label: 'Nome' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'documento', label: 'CPF/CNPJ' },
  { key: 'email', label: 'E-mail' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'cidade_uf', label: 'Cidade/UF' },
  { key: 'status', label: 'Status' },
  { key: 'ultimo_contato', label: 'Último contato' },
  { key: 'created_at', label: 'Cadastrado em' }
];

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const header = COLUMNS.map((c) => c.label).join(';');
  const lines = rows.map((r) => COLUMNS.map((c) => csvEscape(r[c.key])).join(';'));
  return '﻿' + [header, ...lines].join('\r\n');
}

module.exports = function exportRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));

  router.get('/clients', (req, res) => {
    const format = (req.query.format || 'csv').toLowerCase();
    // A exportação leva apenas os clientes que este colaborador pode ver.
    const scope = ownerScope(visibleOwners(db, req.session.subject_id), 'c.owner_id');
    const rows = db.all(`SELECT c.* FROM clients c WHERE c.deleted = 0${scope.sql} ORDER BY c.nome ASC`, scope.params).map((r) => {
      const out = {};
      COLUMNS.forEach((c) => { out[c.key] = r[c.key]; });
      return out;
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
      return res.send(toCsv(rows));
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="clientes.json"');
      return res.send(JSON.stringify(rows, null, 2));
    }

    if (format === 'xlsx') {
      const sheetRows = rows.map((r) => {
        const out = {};
        COLUMNS.forEach((c) => { out[c.label] = r[c.key]; });
        return out;
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="clientes.xlsx"');
      return res.send(buf);
    }

    if (format === 'sqlite') {
      const tempDb = new db.SQL.Database();
      tempDb.run(`CREATE TABLE clientes (${COLUMNS.map((c) => `${c.key} TEXT`).join(', ')})`);
      const placeholders = COLUMNS.map(() => '?').join(', ');
      const stmt = tempDb.prepare(`INSERT INTO clientes (${COLUMNS.map((c) => c.key).join(', ')}) VALUES (${placeholders})`);
      rows.forEach((r) => {
        stmt.run(COLUMNS.map((c) => r[c.key]));
      });
      stmt.free();
      const bytes = tempDb.export();
      tempDb.close();
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader('Content-Disposition', 'attachment; filename="clientes.db"');
      return res.send(Buffer.from(bytes));
    }

    res.status(400).json({ error: 'Formato inválido. Use csv, xlsx, json ou sqlite.' });
  });

  return router;
};

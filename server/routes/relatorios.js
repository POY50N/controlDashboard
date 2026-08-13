const express = require('express');
const XLSX = require('xlsx');
const { requireRole } = require('../lib/session');
const { requireArea } = require('../lib/areas');
const { ler, gravar, validarDia, validarHora, agendamento } = require('../lib/config-escritorio');
const { apurar, fechar, competenciaDe, competenciaAnterior } = require('../lib/fechamento');

function meses(de, ate) {
  const out = [];
  let [a, m] = de.split('-').map(Number);
  const [aF, mF] = ate.split('-').map(Number);
  while (a < aF || (a === aF && m <= mF)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

function validaCompetencia(v) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : null;
}

const reais = (centavos) => Number((centavos / 100).toFixed(2));

module.exports = function relatoriosRoutes(db) {
  const router = express.Router();
  router.use(requireRole(db, 'admin'));
  router.use(requireArea(db, 'financeiro'));

  // Meses que dá para consultar: os já fechados + os que têm lançamento.
  router.get('/meses', (req, res) => {
    const fechados = db.all('SELECT competencia, fechado_em FROM fechamentos_financeiros ORDER BY competencia DESC');
    const comLancamento = db.all(`
      SELECT DISTINCT strftime('%Y-%m', h.vencimento) AS competencia
      FROM honorarios h JOIN clients c ON c.id = h.client_id
      WHERE c.deleted = 0 AND h.vencimento IS NOT NULL
      UNION
      SELECT DISTINCT strftime('%Y-%m', vencimento) FROM contas_escritorio WHERE vencimento IS NOT NULL
    `).map((r) => r.competencia).filter(Boolean);

    const fechadosSet = new Set(fechados.map((f) => f.competencia));
    const todos = [...new Set([...fechadosSet, ...comLancamento])].sort().reverse();
    res.json({
      atual: competenciaDe(new Date()),
      anterior: competenciaAnterior(),
      meses: todos.map((c) => ({ competencia: c, fechado: fechadosSet.has(c) }))
    });
  });

  // Um mês. Se está fechado, devolve a foto guardada; senão, apura na hora.
  router.get('/mes/:competencia', (req, res) => {
    const c = validaCompetencia(req.params.competencia);
    if (!c) return res.status(400).json({ error: 'Competência inválida. Use AAAA-MM.' });

    const fechado = db.get('SELECT * FROM fechamentos_financeiros WHERE competencia = ?', [c]);
    if (fechado) {
      let detalhes = { honorarios: [], contas: [] };
      try { detalhes = JSON.parse(fechado.detalhes || '{}'); } catch (e) { /* segue com vazio */ }
      return res.json({
        competencia: c, fechado: true, fechadoEm: fechado.fechado_em,
        recebido: fechado.recebido_centavos, aReceber: fechado.a_receber_centavos,
        vencido: fechado.vencido_centavos, despesas: fechado.despesas_centavos,
        honorarios: detalhes.honorarios || [], contas: detalhes.contas || []
      });
    }
    const a = apurar(db, c);
    res.json({ competencia: c, fechado: false, ...a });
  });

  // Fecha manualmente (o agendador faz sozinho no dia/hora configurados).
  router.post('/fechar/:competencia', (req, res) => {
    const c = validaCompetencia(req.params.competencia);
    if (!c) return res.status(400).json({ error: 'Competência inválida.' });
    if (c >= competenciaDe(new Date())) return res.status(400).json({ error: 'Só é possível fechar um mês já encerrado.' });
    const a = fechar(db, c, false);
    db.recordChange('fechamentos_financeiros', 0, 'create', `Mês ${c} fechado manualmente.`, {});
    res.json({ ok: true, competencia: c, recebido: a.recebido, despesas: a.despesas });
  });

  // Agendamento do fechamento (dia e hora).
  router.get('/agendamento', (req, res) => {
    res.json({
      financeiro: agendamento(db, 'financeiro.fechamento'),
      contas: agendamento(db, 'contas.consulta')
    });
  });

  router.put('/agendamento', (req, res) => {
    const { financeiro, contas } = req.body || {};
    const aplicar = (prefixo, v) => {
      if (!v) return null;
      const dia = validarDia(v.dia);
      const hora = validarHora(v.hora);
      if (dia === null || hora === null) return 'Informe um dia entre 1 e 28 e uma hora no formato HH:MM.';
      gravar(db, `${prefixo}.dia`, dia);
      gravar(db, `${prefixo}.hora`, hora);
      return null;
    };
    const erro = aplicar('financeiro.fechamento', financeiro) || aplicar('contas.consulta', contas);
    if (erro) return res.status(400).json({ error: erro });
    res.json({ ok: true, financeiro: agendamento(db, 'financeiro.fechamento'), contas: agendamento(db, 'contas.consulta') });
  });

  // Exportação: último mês, último ano ou período escolhido.
  router.get('/export', (req, res) => {
    const escopo = req.query.escopo || 'ultimo-mes';
    const formato = (req.query.formato || 'xlsx').toLowerCase();
    const hoje = new Date();

    let lista;
    if (escopo === 'ultimo-mes') {
      lista = [competenciaAnterior(hoje)];
    } else if (escopo === 'ultimo-ano') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 12, 1);
      lista = meses(competenciaDe(inicio), competenciaAnterior(hoje));
    } else if (escopo === 'periodo') {
      const de = validaCompetencia(req.query.de);
      const ate = validaCompetencia(req.query.ate);
      if (!de || !ate) return res.status(400).json({ error: 'Informe o período (de e até) no formato AAAA-MM.' });
      if (de > ate) return res.status(400).json({ error: 'O mês inicial precisa ser anterior ao final.' });
      lista = meses(de, ate);
    } else if (escopo === 'mes') {
      const c = validaCompetencia(req.query.competencia);
      if (!c) return res.status(400).json({ error: 'Competência inválida.' });
      lista = [c];
    } else {
      return res.status(400).json({ error: 'Escopo inválido.' });
    }

    // Foto guardada quando existe; apuração ao vivo quando o mês está aberto.
    const dados = lista.map((c) => {
      const f = db.get('SELECT * FROM fechamentos_financeiros WHERE competencia = ?', [c]);
      if (f) {
        let d = {};
        try { d = JSON.parse(f.detalhes || '{}'); } catch (e) { d = {}; }
        return {
          competencia: c, fechado: true,
          recebido: f.recebido_centavos, aReceber: f.a_receber_centavos,
          vencido: f.vencido_centavos, despesas: f.despesas_centavos,
          honorarios: d.honorarios || [], contas: d.contas || []
        };
      }
      const a = apurar(db, c);
      return { competencia: c, fechado: false, ...a };
    });

    const resumo = dados.map((d) => ({
      'Competência': d.competencia,
      'Situação': d.fechado ? 'Fechado' : 'Em aberto',
      'Recebido (R$)': reais(d.recebido),
      'A receber (R$)': reais(d.aReceber),
      'Vencido (R$)': reais(d.vencido),
      'Despesas do escritório (R$)': reais(d.despesas),
      'Resultado (R$)': reais(d.recebido - d.despesas)
    }));

    const linhas = [];
    dados.forEach((d) => {
      (d.honorarios || []).forEach((h) => linhas.push({
        'Competência': d.competencia, 'Tipo': 'Honorário', 'Descrição': h.referencia,
        'Cliente': h.cliente_nome || '', 'Vencimento': h.vencimento,
        'Valor (R$)': reais(h.valor_centavos), 'Situação': h.status
      }));
      (d.contas || []).forEach((c) => linhas.push({
        'Competência': d.competencia, 'Tipo': 'Despesa', 'Descrição': c.nome,
        'Cliente': c.categoria || '', 'Vencimento': c.vencimento,
        'Valor (R$)': reais(c.valor_centavos), 'Situação': c.status
      }));
    });

    const nome = `financeiro-${lista[0]}${lista.length > 1 ? '_a_' + lista[lista.length - 1] : ''}`;

    if (formato === 'csv') {
      const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const bloco = (titulo, arr) => {
        if (!arr.length) return `${titulo}\r\n(sem registros)\r\n`;
        const cab = Object.keys(arr[0]);
        return `${titulo}\r\n${cab.join(';')}\r\n${arr.map((r) => cab.map((k) => esc(r[k])).join(';')).join('\r\n')}\r\n`;
      };
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
      return res.send('﻿' + bloco('RESUMO POR MÊS', resumo) + '\r\n' + bloco('LANÇAMENTOS', linhas));
    }

    if (formato === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nome}.json"`);
      return res.send(JSON.stringify({ resumo, lancamentos: linhas }, null, 2));
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Aviso: 'Sem lançamentos no período' }]), 'Lançamentos');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.xlsx"`);
    res.send(buf);
  });

  return router;
};

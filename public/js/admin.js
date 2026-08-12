(() => {
  const el = (id) => document.getElementById(id);

  const HONOR_STATUS = {
    atraso: { label: 'ATRASO', kind: 'late' },
    a_vencer: { label: 'A VENCER', kind: 'open' },
    avisado: { label: 'AVISADO', kind: 'mute' },
    pago: { label: 'PAGO', kind: 'done' }
  };
  const CONTA_STATUS = {
    a_pagar: { label: 'A PAGAR', kind: 'open' },
    vence_em_breve: { label: 'VENCE EM BREVE', kind: 'late' },
    pago: { label: 'PAGO', kind: 'done' },
    programado: { label: 'PROGRAMADO', kind: 'mute' }
  };
  const PROC_STATUS = {
    em_andamento: { label: 'EM ANDAMENTO', kind: 'open' },
    finalizado: { label: 'FINALIZADO', kind: 'done' }
  };

  function tagHtml(label, kind) {
    return `<span class="tag tag-${kind}">${label}</span>`;
  }

  // Áreas do painel liberadas para quem está logado.
  let MINHAS_AREAS = [];
  const podeVer = (area) => MINHAS_AREAS.includes(area);

  // ---------- auth guard ----------
  async function boot() {
    let session;
    try {
      session = await Api.get('/api/auth/session');
      if (session.role !== 'admin') throw new Error('not admin');
      el('adminNome').textContent = session.nome;
      el('adminOab').textContent = session.oab || (session.cargo ? CARGO_LABEL[session.cargo] || session.cargo : '');
      el('adminInicial').textContent = (session.nome || '?').charAt(0).toUpperCase();
      MINHAS_AREAS = session.areas || [];
    } catch (e) {
      window.location.href = 'acesso.html';
      return;
    }

    aplicarAreas();
    initNav();
    initClientes();
    initNovoCliente();
    initProcessos();
    initFinanceiro();
    initEscritorio();

    // Abre na primeira área que a pessoa realmente tem.
    const inicial = ['visao', 'clientes', 'processos', 'financeiro', 'escritorio'].find(podeVer);
    if (inicial) goTo(inicial); else mostrarSemAcesso();
  }

  // Esconde da tela tudo o que o perfil não alcança. O servidor recusa de
  // qualquer forma; isto evita oferecer caminhos que dariam erro.
  function aplicarAreas() {
    const porArea = {
      visao: ['[data-nav="visao"]'],
      clientes: ['[data-nav="clientes"]', '[data-nav="novo"]'],
      processos: ['[data-nav="processos"]'],
      financeiro: ['[data-nav="financeiro"]'],
      escritorio: ['[data-nav="escritorio"]'],
      exportar: ['#exportToggle', '#exportMenu'],
      colaboradores: ['#menuColaborador']
    };
    Object.entries(porArea).forEach(([area, seletores]) => {
      if (podeVer(area)) return;
      seletores.forEach((s) => document.querySelectorAll(s).forEach((n) => n.classList.add('hidden')));
    });
  }

  function mostrarSemAcesso() {
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    const main = document.querySelector('main');
    const aviso = document.createElement('div');
    aviso.style.cssText = 'display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;padding:80px 24px;text-align:center';
    aviso.innerHTML = `
      <span class="eyebrow">SEM ÁREAS LIBERADAS</span>
      <h1 style="margin:0;font:300 30px var(--font-serif);color:var(--ink)">Seu perfil ainda não tem acesso a nenhuma área</h1>
      <p style="margin:0;max-width:420px;font:300 15px/1.75 var(--font-serif);color:var(--muted)">
        Peça ao titular do escritório para liberar as áreas do painel que você precisa acessar.
      </p>`;
    main.appendChild(aviso);
  }

  async function logout() {
    await Api.post('/api/auth/logout');
    window.location.href = 'index.html';
  }
  el('logoutBtn').addEventListener('click', logout);
  el('menuSair').addEventListener('click', logout);

  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  el('dataHoje').textContent = (() => {
    const d = new Date();
    return `${DIAS[d.getDay()][0].toUpperCase()}${DIAS[d.getDay()].slice(1)}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  })();

  // ---------- nav ----------
  function initNav() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => goTo(btn.dataset.nav));
    });
  }
  function goTo(name) {
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-btn').forEach((b) => b.classList.remove('active'));
    el('sec-' + name).classList.add('active');
    const navBtn = document.querySelector(`.sidebar-btn[data-nav="${name}"]`);
    if (navBtn) navBtn.classList.add('active');
    if (name === 'clientes') loadClientes();
    if (name === 'processos') { el('processosLista').classList.remove('hidden'); el('processoDetalhe').classList.add('hidden'); loadProcessos(); }
    if (name === 'financeiro') loadFinanceiro();
    if (name === 'escritorio') loadEscritorio();
    if (name === 'visao') loadVisaoGeral();
  }

  // ---------- visão geral ----------
  async function loadVisaoGeral() {
    const s = await Api.get('/api/dashboard/summary');
    el('statClientes').textContent = s.clientesAtivos;
    el('statProcessos').textContent = s.processosAndamento;
    el('statAReceber').textContent = centavosToBRL(s.aReceberMes);
    el('statAtraso').textContent = centavosToBRL(s.emAtraso);

    el('listaMovimentacoes').innerHTML = s.movimentacoes.map((m) => `
      <div class="table-row" style="grid-template-columns:1fr auto">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;align-items:baseline;gap:10px"><span style="font:400 16.5px var(--font-serif);color:var(--ink)">${m.cliente_nome}</span><span style="font:700 8.5px var(--font-mono);letter-spacing:.12em;color:var(--muted)">${m.numero || ''}</span></div>
          <span style="font:300 14px/1.6 var(--font-serif);color:var(--ink-soft)">${m.titulo}${m.descricao ? ' — ' + m.descricao : ''}</span>
        </div>
        <span style="font:700 8.5px var(--font-mono);letter-spacing:.12em;color:var(--muted)">${formatDateBR(m.data)}</span>
      </div>`).join('') || emptyRow('Nenhuma movimentação recente.');

    el('listaPendencias').innerHTML = s.pendencias.map((p) => {
      const st = HONOR_STATUS[p.status] || { label: p.status, kind: 'mute' };
      return `<div class="table-row" style="grid-template-columns:1fr auto">
        <div style="display:flex;flex-direction:column;gap:3px"><span style="font:400 15px var(--font-serif);color:var(--ink)">${p.cliente_nome}</span><span style="font:300 13px var(--font-serif);color:var(--muted-2)">${formatDateBR(p.vencimento)}</span></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span style="font:400 15px var(--font-serif)">${centavosToBRL(p.valor_centavos)}</span>${tagHtml(st.label, st.kind)}</div>
      </div>`;
    }).join('') || emptyRow('Sem pendências financeiras.');

    el('listaAgenda').innerHTML = s.agenda.map((a) => `
      <div class="table-row" style="grid-template-columns:1fr">
        <div style="display:flex;flex-direction:column;gap:3px"><span style="font:400 14.5px var(--font-serif);color:var(--ink)">${a.titulo}</span><span style="font:300 13px var(--font-serif);color:var(--muted-2)">${a.cliente_nome} · ${formatDateBR(a.data)}</span></div>
      </div>`).join('') || emptyRow('Nenhum compromisso agendado.');
  }

  function emptyRow(text) {
    return `<div class="table-row" style="grid-template-columns:1fr"><span style="font:300 14px var(--font-serif);color:var(--muted)">${text}</span></div>`;
  }

  // ---------- clientes ----------
  let clientesCache = [];
  function initClientes() {
    el('buscaInput').addEventListener('input', renderClientes);
    el('exportToggle').addEventListener('click', () => el('exportMenu').classList.toggle('hidden'));
  }

  async function loadClientes() {
    const res = await Api.get('/api/clients');
    clientesCache = res.clients;
    el('tituloClientes').textContent = `${clientesCache.length} cliente${clientesCache.length === 1 ? '' : 's'} cadastrado${clientesCache.length === 1 ? '' : 's'}`;
    renderClientes();
  }

  function renderClientes() {
    const q = (el('buscaInput').value || '').toLowerCase();
    const rows = clientesCache.filter((c) => !q || c.nome.toLowerCase().includes(q) || c.documento.includes(q.replace(/\D/g, '')));
    el('listaClientes').innerHTML = rows.map((c) => `
      <div class="table-row clients-table">
        <div style="display:flex;flex-direction:column;gap:3px"><span style="font:400 16px var(--font-serif);color:var(--ink)">${c.nome}</span><span style="font:300 12.5px var(--font-serif);color:var(--muted)">${c.tipo === 'PF' ? 'Pessoa física' : 'Empresa'}</span></div>
        <span style="font:700 10px var(--font-mono);letter-spacing:.06em;color:var(--ink-soft)">${formatDoc(c.documento)}</span>
        <span style="font:400 15px var(--font-serif);color:var(--ink)">${c.processos}</span>
        ${tagHtml(c.tag, c.kind)}
        <span style="font:300 14px var(--font-serif);color:var(--ink-soft)">${c.ultimoContato || '—'}</span>
        <button class="btn-text" data-remove="${c.id}">Remover</button>
      </div>`).join('') || emptyRow('Nenhum cliente encontrado.');

    document.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover este cliente? Esta ação pode ser desfeita restaurando o banco de dados.')) return;
        await Api.del('/api/clients/' + btn.dataset.remove);
        toast('Cliente removido.');
        loadClientes();
      });
    });
  }

  function formatDoc(digits) {
    if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length === 14) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    return digits;
  }

  // ---------- novo cliente ----------
  function initNovoCliente() {
    let tipo = 'PF';
    const labels = {
      PF: { nome: 'NOME COMPLETO', doc: 'CPF', sec: 'RG / ÓRGÃO EMISSOR', extra: 'PROFISSÃO', phDoc: '000.000.000-00' },
      PJ: { nome: 'RAZÃO SOCIAL', doc: 'CNPJ', sec: 'INSCRIÇÃO ESTADUAL', extra: 'REPRESENTANTE LEGAL', phDoc: '00.000.000/0001-00' }
    };
    function applyLabels() {
      const l = labels[tipo];
      el('labelNome').textContent = l.nome;
      el('labelDoc').textContent = l.doc;
      el('labelSec').textContent = l.sec;
      el('labelExtra').textContent = l.extra;
      el('inputDoc').placeholder = l.phDoc;
    }
    el('btnPF').addEventListener('click', () => { tipo = 'PF'; el('btnPF').classList.add('active'); el('btnPJ').classList.remove('active'); applyLabels(); });
    el('btnPJ').addEventListener('click', () => { tipo = 'PJ'; el('btnPJ').classList.add('active'); el('btnPF').classList.remove('active'); applyLabels(); });
    applyLabels();

    el('novoClienteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        tipo,
        nome: el('inputNome').value.trim(),
        documento: el('inputDoc').value.trim(),
        documentoSecundario: el('inputSec').value.trim(),
        dataRef: el('inputData').value.trim(),
        extra: el('inputExtra').value.trim(),
        email: el('inputEmail').value.trim(),
        telefone: el('inputTelefone').value.trim(),
        cep: el('inputCep').value.trim(),
        logradouro: el('inputLogradouro').value.trim(),
        numero: el('inputNumero').value.trim(),
        cidadeUf: el('inputCidadeUf').value.trim(),
        processoInicial: { area: el('inputProcArea').value.trim(), numero: el('inputProcNumero').value.trim() },
        honorario: { valor: el('inputHonorarioValor').value, primeiraParcela: el('inputHonorarioData').value }
      };
      try {
        await Api.post('/api/clients', payload);
        toast(`Cliente "${payload.nome}" cadastrado.`);
        e.target.reset();
        applyLabels();
        goTo('clientes');
      } catch (err) {
        toast(err.message || 'Não foi possível cadastrar o cliente.', 'error');
      }
    });
  }

  // ---------- processos ----------
  function initProcessos() {}

  // Escopo atual da lista: null = tudo que posso ver; um id = a carteira
  // de um colaborador específico.
  let escopoProcessos = null;

  async function loadProcessos() {
    const url = escopoProcessos ? '/api/processos?owner=' + escopoProcessos : '/api/processos';
    let res;
    try {
      res = await Api.get(url);
    } catch (err) {
      toast(err.message || 'Sem autorização para ver estes processos.', 'error');
      escopoProcessos = null;
      res = await Api.get('/api/processos');
    }

    el('listaProcessos').innerHTML = res.processos.map((p) => {
      const st = PROC_STATUS[p.status] || { label: p.status, kind: 'mute' };
      return `<div class="table-row procs-table" data-open="${p.id}" style="cursor:pointer">
        <div style="display:flex;flex-direction:column;gap:3px">
          <span style="font:400 16px var(--font-serif);color:var(--ink)">${p.titulo || p.area || 'Processo'}</span>
          ${p.meu ? '' : `<span style="font:700 8px var(--font-mono);letter-spacing:.14em;color:var(--muted)">RESP.: ${(p.responsavel_nome || '—').toUpperCase()}</span>`}
        </div>
        <span style="font:300 14.5px var(--font-serif);color:var(--ink-soft)">${p.cliente_nome}</span>
        <span style="font:700 9.5px var(--font-mono);color:var(--muted)">${p.numero || '—'}</span>
        ${tagHtml(st.label, st.kind)}
      </div>`;
    }).join('') || emptyRow('Nenhum processo nesta carteira.');

    document.querySelectorAll('[data-open]').forEach((row) => {
      row.addEventListener('click', () => openProcesso(row.dataset.open));
    });
  }

  el('btnOutrosColabs').addEventListener('click', abrirSeletorColaboradores);

  async function abrirSeletorColaboradores() {
    const res = await Api.get('/api/colaboradores/acessiveis');
    const linhas = res.colaboradores.map((c) => {
      const rotulo = `${(CARGO_LABEL[c.cargo] || c.cargo).toUpperCase()}${c.eu ? ' · VOCÊ' : ''}`;
      if (!c.autorizado) {
        // Sem autorização: nome apagado e sem clique.
        return `<div style="display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:15px 16px;border-bottom:1px solid #eee7d9;background:#efeade;cursor:not-allowed;opacity:.55" title="Sem autorização deste colaborador">
          <div style="display:flex;flex-direction:column;gap:3px">
            <span style="font:400 16px var(--font-serif);color:#8d846f">${c.nome}</span>
            <span style="font:700 8px var(--font-mono);letter-spacing:.14em;color:#a2997f">${rotulo}</span>
          </div>
          <span style="display:flex;align-items:center;gap:8px;font:700 8.5px var(--font-mono);letter-spacing:.14em;color:#8d846f">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10.5" width="16" height="10" rx="2"></rect><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"></path></svg>
            SEM AUTORIZAÇÃO
          </span>
        </div>`;
      }
      return `<button data-carteira="${c.id}" style="display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:center;padding:15px 16px;border:none;border-bottom:1px solid #eee7d9;background:var(--panel);cursor:pointer;text-align:left;width:100%;font:inherit">
        <div style="display:flex;flex-direction:column;gap:3px">
          <span style="font:400 16px var(--font-serif);color:var(--ink)">${c.nome}</span>
          <span style="font:700 8px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${rotulo}</span>
        </div>
        <span style="font:300 13.5px var(--font-serif);color:var(--ink-soft)">${c.processos} processo${c.processos === 1 ? '' : 's'}</span>
        <span style="font:300 18px var(--font-serif);color:var(--gold-2)">→</span>
      </button>`;
    }).join('');

    openModal(`
      <h2 style="margin:0 0 6px;font:300 26px var(--font-serif)">Processos por colaborador</h2>
      <p style="margin:0 0 18px;font:300 14.5px/1.7 var(--font-serif);color:var(--muted)">
        ${res.souTitular
          ? 'Como titular do escritório, você tem acesso às carteiras de todos os colaboradores.'
          : 'Você só abre a carteira de quem autorizou o seu acesso. Os demais aparecem apagados.'}
      </p>
      <div style="display:flex;flex-direction:column;border:1px solid var(--border)">
        <button data-carteira="todos" style="display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:15px 16px;border:none;border-bottom:1px solid var(--border);background:#f2ede1;cursor:pointer;text-align:left;width:100%;font:inherit">
          <span style="font:400 16px var(--font-serif);color:var(--ink)">Tudo o que posso ver</span>
          <span style="font:300 18px var(--font-serif);color:var(--gold-2)">→</span>
        </button>
        ${linhas}
      </div>`);

    document.querySelectorAll('[data-carteira]').forEach((btn) => btn.addEventListener('click', async () => {
      const v = btn.dataset.carteira;
      escopoProcessos = v === 'todos' ? null : Number(v);
      const dono = v === 'todos' ? null : res.colaboradores.find((c) => c.id === Number(v));
      el('tituloProcessos').textContent = dono ? (dono.eu ? 'Meus processos' : `Processos · ${dono.nome}`) : 'Todos os processos que posso ver';
      el('subProcessos').textContent = dono && !dono.eu ? 'Carteira compartilhada com você.' : '';
      closeModal();
      await loadProcessos();
    }));
  }

  async function openProcesso(id) {
    const res = await Api.get('/api/processos/' + id);
    const p = res.processo;
    const st = PROC_STATUS[p.status] || { label: p.status, kind: 'mute' };
    el('processosLista').classList.add('hidden');
    const box = el('processoDetalhe');
    box.classList.remove('hidden');
    box.innerHTML = `
      <button class="btn-text" id="voltarProcessos" style="align-self:flex-start">← Todos os processos</button>
      <div style="display:flex;flex-direction:column;gap:7px">
        <span class="eyebrow">PROCESSO</span>
        <h1 style="margin:0;font:300 34px var(--font-serif);color:var(--ink)">${p.titulo || p.area} · ${p.cliente_nome}</h1>
        <div style="display:flex;align-items:center;gap:12px"><span style="font:700 9.5px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${p.numero || '—'} ${p.vara ? '· ' + p.vara : ''}</span>${tagHtml(st.label, st.kind)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1.3fr .7fr;gap:22px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:13px">
          <span class="label">ANDAMENTO PROCESSUAL</span>
          <div class="card" id="listaAndamentos">${res.andamentos.map((a) => `
            <div class="andamento-item">
              <span style="font:700 9.5px var(--font-mono);letter-spacing:.1em;color:var(--muted);padding-top:4px">${formatDateBR(a.data)}</span>
              <div style="display:flex;flex-direction:column;gap:4px"><span style="font:400 16px var(--font-serif);color:var(--ink)">${a.titulo}</span><span style="font:300 14px/1.65 var(--font-serif);color:var(--ink-soft)">${a.descricao || ''}</span></div>
            </div>`).join('') || emptyRow('Sem movimentações registradas.')}</div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:14px;padding:24px">
          <span class="label">ADICIONAR MOVIMENTAÇÃO</span>
          <form id="andamentoForm" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label class="label">TÍTULO</label><input id="andTitulo" required placeholder="Ex.: Petição juntada"></div>
            <div class="field"><label class="label">DESCRIÇÃO</label><textarea id="andDesc" placeholder="Detalhes (opcional)"></textarea></div>
            <button type="submit" class="btn btn-primary">Registrar movimentação</button>
          </form>
          ${p.status !== 'finalizado' ? '<button id="finalizarBtn" class="btn btn-outline">Marcar processo como finalizado</button>' : ''}
        </div>
      </div>`;
    el('voltarProcessos').addEventListener('click', () => { box.classList.add('hidden'); el('processosLista').classList.remove('hidden'); });
    el('andamentoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await Api.post(`/api/processos/${id}/andamentos`, { titulo: el('andTitulo').value, descricao: el('andDesc').value });
      toast('Movimentação registrada.');
      openProcesso(id);
    });
    const finalizarBtn = el('finalizarBtn');
    if (finalizarBtn) finalizarBtn.addEventListener('click', async () => {
      await Api.put('/api/processos/' + id, { status: 'finalizado' });
      toast('Processo marcado como finalizado.');
      openProcesso(id);
    });
  }

  // ---------- financeiro ----------
  function initFinanceiro() {
    el('novaCobrancaBtn').addEventListener('click', openNovaCobrancaModal);
  }

  async function loadFinanceiro() {
    const res = await Api.get('/api/financeiro/honorarios');
    el('finRecebido').textContent = centavosToBRL(res.totals.recebidoMes);
    el('finAReceber').textContent = centavosToBRL(res.totals.aReceber);
    el('finVencido').textContent = centavosToBRL(res.totals.vencido);
    el('listaHonorarios').innerHTML = res.honorarios.map((h) => {
      const st = HONOR_STATUS[h.status] || { label: h.status, kind: 'mute' };
      return `<div class="table-row fin-table">
        <span style="font:400 15.5px var(--font-serif);color:var(--ink)">${h.cliente_nome}</span>
        <span style="font:300 14.5px var(--font-serif);color:var(--ink-soft)">${h.referencia}</span>
        <span style="font:300 14.5px var(--font-serif);color:var(--ink-soft)">${formatDateBR(h.vencimento)}</span>
        <span style="font:400 15px var(--font-serif);color:var(--ink)">${centavosToBRL(h.valor_centavos)}</span>
        <div style="display:flex;align-items:center;gap:10px">${tagHtml(st.label, st.kind)}${h.status !== 'pago' ? `<button class="btn-text" data-pay="${h.id}">Marcar pago</button>` : ''}</div>
      </div>`;
    }).join('') || emptyRow('Nenhuma cobrança lançada.');

    document.querySelectorAll('[data-pay]').forEach((btn) => btn.addEventListener('click', async () => {
      await Api.put('/api/financeiro/honorarios/' + btn.dataset.pay, { status: 'pago' });
      toast('Cobrança marcada como paga.');
      loadFinanceiro();
    }));
  }

  function openNovaCobrancaModal() {
    const options = clientesCache.map((c) => `<option value="${c.id}">${c.nome}</option>`).join('');
    openModal(`
      <h2 style="margin:0 0 18px;font:300 26px var(--font-serif)">Lançar cobrança</h2>
      <form id="cobrancaForm" style="display:flex;flex-direction:column;gap:14px">
        <div class="field"><label class="label">CLIENTE</label><select id="cobClient" required>${options}</select></div>
        <div class="field"><label class="label">REFERÊNCIA</label><input id="cobRef" placeholder="Honorários · agosto"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label class="label">VALOR (R$)</label><input id="cobValor" type="number" step="0.01" required></div>
          <div class="field"><label class="label">VENCIMENTO</label><input id="cobVenc" type="date" required></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:6px">
          <button type="button" class="btn btn-outline" id="cobCancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Lançar</button>
        </div>
      </form>`);
    el('cobCancel').addEventListener('click', closeModal);
    el('cobrancaForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await Api.post('/api/financeiro/honorarios', { clientId: el('cobClient').value, referencia: el('cobRef').value, valor: el('cobValor').value, vencimento: el('cobVenc').value });
      closeModal();
      toast('Cobrança lançada.');
      loadFinanceiro();
    });
  }

  // ---------- escritório ----------
  function initEscritorio() {
    el('novaContaBtn').addEventListener('click', openNovaContaModal);
  }

  async function loadEscritorio() {
    const res = await Api.get('/api/financeiro/contas');
    el('escTotal').textContent = centavosToBRL(res.totals.totalMes);
    el('escVence').textContent = centavosToBRL(res.totals.venceEmBreve);
    el('escPago').textContent = centavosToBRL(res.totals.jaPago);
    el('listaContas').innerHTML = res.contas.map((c) => {
      const st = CONTA_STATUS[c.status] || { label: c.status, kind: 'mute' };
      return `<div class="table-row fin-table">
        <span style="font:400 15.5px var(--font-serif);color:var(--ink)">${c.nome}</span>
        <span style="font:300 14.5px var(--font-serif);color:var(--ink-soft)">${c.categoria || '—'}</span>
        <span style="font:300 14.5px var(--font-serif);color:var(--ink-soft)">${formatDateBR(c.vencimento)}</span>
        <span style="font:400 15px var(--font-serif);color:var(--ink)">${centavosToBRL(c.valor_centavos)}</span>
        <div style="display:flex;align-items:center;gap:10px">${tagHtml(st.label, st.kind)}${c.status !== 'pago' ? `<button class="btn-text" data-payconta="${c.id}">Marcar pago</button>` : ''}</div>
      </div>`;
    }).join('') || emptyRow('Nenhuma conta cadastrada.');

    document.querySelectorAll('[data-payconta]').forEach((btn) => btn.addEventListener('click', async () => {
      await Api.put('/api/financeiro/contas/' + btn.dataset.payconta, { status: 'pago' });
      toast('Conta marcada como paga.');
      loadEscritorio();
    }));
  }

  function openNovaContaModal() {
    openModal(`
      <h2 style="margin:0 0 18px;font:300 26px var(--font-serif)">Nova conta do escritório</h2>
      <form id="contaForm" style="display:flex;flex-direction:column;gap:14px">
        <div class="field"><label class="label">NOME</label><input id="ctNome" required></div>
        <div class="field"><label class="label">CATEGORIA</label><input id="ctCategoria" placeholder="Ocupação, Pessoal, Utilidades…"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label class="label">VALOR (R$)</label><input id="ctValor" type="number" step="0.01" required></div>
          <div class="field"><label class="label">VENCIMENTO</label><input id="ctVenc" type="date"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:6px">
          <button type="button" class="btn btn-outline" id="ctCancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Adicionar</button>
        </div>
      </form>`);
    el('ctCancel').addEventListener('click', closeModal);
    el('contaForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await Api.post('/api/financeiro/contas', { nome: el('ctNome').value, categoria: el('ctCategoria').value, valor: el('ctValor').value, vencimento: el('ctVenc').value });
      closeModal();
      toast('Conta adicionada.');
      loadEscritorio();
    });
  }

  // ---------- colaboradores ----------
  const CARGO_LABEL = {
    titular: 'Titular', advogado: 'Advogado(a)', estagiario: 'Estagiário(a)',
    secretaria: 'Secretário(a)', financeiro: 'Financeiro', outro: 'Outro'
  };

  function fecharMenuUsuario() {
    el('userMenu').classList.add('hidden');
    el('userTrigger').classList.remove('open');
  }

  el('menuColaborador').addEventListener('click', () => {
    fecharMenuUsuario();
    openColaboradorModal();
  });

  el('menuPermissoes').addEventListener('click', () => {
    fecharMenuUsuario();
    openPermissoesModal();
  });

  async function openPermissoesModal() {
    openModal(`
      <h2 style="margin:0 0 6px;font:300 26px var(--font-serif)">Quem vê meus processos</h2>
      <p style="margin:0 0 20px;font:300 14.5px/1.7 var(--font-serif);color:var(--muted)">
        Por padrão, os seus clientes e processos são visíveis só para você. Marque abaixo os colaboradores
        que também poderão acompanhá-los.
      </p>
      <div id="listaPermissoes" style="display:flex;flex-direction:column;border:1px solid var(--border)"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px">
        <button type="button" class="btn btn-outline" id="pmClose">Fechar</button>
      </div>`);
    el('pmClose').addEventListener('click', closeModal);
    await carregarPermissoes();
  }

  async function carregarPermissoes() {
    const box = el('listaPermissoes');
    if (!box) return;
    const res = await Api.get('/api/colaboradores/permissoes');
    if (!res.colaboradores.length) {
      box.innerHTML = `<div style="padding:20px;font:300 14px var(--font-serif);color:var(--muted)">Não há outros colaboradores cadastrados.</div>`;
      return;
    }
    box.innerHTML = res.colaboradores.map((c) => `
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:15px 16px;border-bottom:1px solid #eee7d9">
        <button class="switch" data-perm="${c.id}" role="switch" aria-checked="${c.permitido}" ${c.fixo ? 'disabled style="opacity:.55;cursor:not-allowed"' : ''}>
          <span class="knob"></span>
        </button>
        <div style="display:flex;flex-direction:column;gap:3px">
          <span style="font:400 15.5px var(--font-serif);color:var(--ink)">${c.nome}</span>
          <span style="font:700 8px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${(CARGO_LABEL[c.cargo] || c.cargo).toUpperCase()} · ${c.username}</span>
        </div>
        <span style="font:300 12.5px var(--font-serif);color:var(--muted);text-align:right;max-width:170px">
          ${c.fixo ? 'Titular do escritório — acesso automático a tudo' : (c.permitido ? 'Pode ver seus processos' : 'Sem acesso aos seus processos')}
        </span>
      </div>`).join('');

    box.querySelectorAll('[data-perm]').forEach((btn) => {
      if (btn.hasAttribute('disabled')) return;
      btn.addEventListener('click', async () => {
        const permitir = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', permitir ? 'true' : 'false');
        try {
          await Api.put('/api/colaboradores/permissoes/' + btn.dataset.perm, { permitir });
          toast(permitir ? 'Colaborador autorizado a ver seus processos.' : 'Autorização removida.');
        } catch (err) {
          toast(err.message || 'Não foi possível alterar a permissão.', 'error');
        }
        await carregarPermissoes();
      });
    });
  }

  let OPCOES = null; // { areas, cargos } — catálogo vindo do servidor

  async function openColaboradorModal() {
    if (!OPCOES) OPCOES = await Api.get('/api/colaboradores/opcoes');

    const cargoOptions = OPCOES.cargos
      .map((c) => `<option value="${c.key}"${c.key === 'secretaria' ? ' selected' : ''}>${c.label}</option>`).join('');
    const areaChecks = OPCOES.areas.map((a) => `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:11px 13px;border:1px solid var(--border-soft);background:var(--bg);cursor:pointer">
        <input type="checkbox" class="cbArea" value="${a.key}" style="margin-top:3px;accent-color:#b08d4a">
        <span style="display:flex;flex-direction:column;gap:2px">
          <span style="font:400 14.5px var(--font-serif);color:var(--ink)">${a.label}</span>
          <span style="font:300 12.5px/1.5 var(--font-serif);color:var(--muted)">${a.desc}</span>
        </span>
      </label>`).join('');

    openModal(`
      <h2 style="margin:0 0 6px;font:300 26px var(--font-serif)">Cadastrar colaborador</h2>
      <p style="margin:0 0 20px;font:300 14.5px/1.7 var(--font-serif);color:var(--muted)">
        O colaborador entra no painel com o usuário abaixo e <b style="font-weight:500">cria a própria senha</b> no primeiro acesso.
      </p>
      <form id="colabForm" style="display:flex;flex-direction:column;gap:14px">
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px">
          <div class="field"><label class="label">NOME COMPLETO</label><input id="cbNome" required placeholder="Beatriz Nunes"></div>
          <div class="field"><label class="label">QUADRO</label><select id="cbCargo">${cargoOptions}</select></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;padding:16px 18px;background:#f2ede1;border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px">
            <span class="label">ÁREAS LIBERADAS NO PAINEL</span>
            <button type="button" id="cbRestaurar" class="btn-text">Restaurar padrão do quadro</button>
          </div>
          <span id="cbCargoDesc" style="font:300 13px/1.6 var(--font-serif);color:var(--muted-2)"></span>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">${areaChecks}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="field"><label class="label">USUÁRIO DE ACESSO</label><input id="cbUser" required placeholder="beatriz" autocapitalize="off"></div>
          <div class="field"><label class="label">CPF</label><input id="cbDoc" placeholder="000.000.000-00"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
          <div class="field"><label class="label">OAB (opcional)</label><input id="cbOab" placeholder="OAB/SP 000.000"></div>
          <div class="field"><label class="label">E-MAIL</label><input id="cbEmail" type="email" placeholder="nome@escritorio.br"></div>
          <div class="field"><label class="label">TELEFONE</label><input id="cbTel" placeholder="(00) 00000-0000"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:4px">
          <button type="button" class="btn btn-outline" id="cbCancel">Fechar</button>
          <button type="submit" class="btn btn-primary">Cadastrar colaborador</button>
        </div>
      </form>
      <div style="margin-top:26px;padding-top:18px;border-top:1px solid var(--border)">
        <span class="label">EQUIPE COM ACESSO AO PAINEL</span>
        <div id="listaColaboradores" style="display:flex;flex-direction:column;gap:2px;margin-top:12px"></div>
      </div>`);

    // Trocar o quadro remarca as áreas com o padrão dele — mas tudo continua
    // editável à mão depois.
    function aplicarPadraoDoCargo() {
      const cargo = OPCOES.cargos.find((c) => c.key === el('cbCargo').value);
      if (!cargo) return;
      document.querySelectorAll('.cbArea').forEach((chk) => { chk.checked = cargo.padrao.includes(chk.value); });
      el('cbCargoDesc').textContent = cargo.padrao.length
        ? cargo.descricao
        : `${cargo.descricao} Nenhuma área vem marcada — escolha uma a uma.`;
    }
    el('cbCargo').addEventListener('change', aplicarPadraoDoCargo);
    el('cbRestaurar').addEventListener('click', aplicarPadraoDoCargo);
    aplicarPadraoDoCargo();

    el('cbCancel').addEventListener('click', closeModal);
    el('colabForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const areas = [...document.querySelectorAll('.cbArea:checked')].map((c) => c.value);
      try {
        await Api.post('/api/colaboradores', {
          nome: el('cbNome').value, cargo: el('cbCargo').value, username: el('cbUser').value,
          documento: el('cbDoc').value, oab: el('cbOab').value, email: el('cbEmail').value,
          telefone: el('cbTel').value, areas
        });
        toast(`Colaborador "${el('cbNome').value.trim()}" cadastrado com ${areas.length} área(s).`);
        e.target.reset();
        aplicarPadraoDoCargo();
        carregarColaboradores();
      } catch (err) {
        toast(err.message || 'Não foi possível cadastrar o colaborador.', 'error');
      }
    });

    carregarColaboradores();
  }

  async function carregarColaboradores() {
    const box = el('listaColaboradores');
    if (!box) return;
    const res = await Api.get('/api/colaboradores');
    const rotuloArea = {};
    (OPCOES ? OPCOES.areas : []).forEach((a) => { rotuloArea[a.key] = a.label; });

    box.innerHTML = res.colaboradores.map((c) => {
      const podeRemover = !c.titular && c.id !== res.euId;
      const areasTxt = c.titular
        ? 'Todas as áreas (titular)'
        : (c.areas.length ? c.areas.map((k) => rotuloArea[k] || k).join(' · ') : 'Nenhuma área liberada');
      return `<div style="display:grid;grid-template-columns:1fr auto auto;gap:14px;align-items:center;padding:13px 4px;border-bottom:1px solid #eee7d9">
        <div style="display:flex;flex-direction:column;gap:3px">
          <span style="font:400 15.5px var(--font-serif);color:var(--ink)">${c.nome}${c.id === res.euId ? ' <span style="font:300 12.5px var(--font-serif);color:var(--muted)">(você)</span>' : ''}</span>
          <span style="font:700 8.5px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${(CARGO_LABEL[c.cargo] || c.cargo).toUpperCase()} · ${c.username}</span>
          <span style="font:300 12.5px/1.5 var(--font-serif);color:${c.areas.length || c.titular ? 'var(--muted-2)' : 'var(--danger-ink)'}">${areasTxt}</span>
        </div>
        ${c.temSenha ? tagHtml('ATIVO', 'done') : tagHtml('1º ACESSO', 'open')}
        ${podeRemover ? `<button class="btn-text" data-remcolab="${c.id}" data-nome="${c.nome}">Remover</button>` : '<span></span>'}
      </div>`;
    }).join('');

    box.querySelectorAll('[data-remcolab]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm(`Remover o acesso de ${btn.dataset.nome} ao painel?`)) return;
      try {
        await Api.del('/api/colaboradores/' + btn.dataset.remcolab);
        toast('Acesso removido.');
        carregarColaboradores();
      } catch (err) {
        toast(err.message || 'Não foi possível remover.', 'error');
      }
    }));
  }

  // ---------- modal ----------
  function openModal(innerHtml) {
    el('modalHost').innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${innerHtml}</div></div>`;
    el('modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });
  }
  function closeModal() { el('modalHost').innerHTML = ''; }

  boot();
})();

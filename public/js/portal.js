(() => {
  const el = (id) => document.getElementById(id);
  const HONOR_STATUS = {
    atraso: { label: 'EM ATRASO', kind: 'late' },
    a_vencer: { label: 'A VENCER', kind: 'open' },
    avisado: { label: 'AVISADO', kind: 'mute' },
    pago: { label: 'PAGO', kind: 'done' }
  };
  const PROC_STATUS = {
    em_andamento: { label: 'EM ANDAMENTO', kind: 'open' },
    finalizado: { label: 'FINALIZADO', kind: 'done' }
  };
  const tagHtml = (label, kind) => `<span class="tag tag-${kind}">${label}</span>`;
  const empty = (t) => `<div class="table-row" style="grid-template-columns:1fr"><span style="font:300 14px var(--font-serif);color:var(--muted)">${t}</span></div>`;

  let cliente = null, processos = [], honorarios = [];

  async function boot() {
    try {
      const session = await Api.get('/api/auth/session');
      if (session.role !== 'client') { window.location.href = 'admin.html'; return; }
    } catch (e) {
      window.location.href = 'acesso.html';
      return;
    }
    const [meRes, procRes, honRes] = await Promise.all([
      Api.get('/api/me'), Api.get('/api/me/processos'), Api.get('/api/me/honorarios')
    ]);
    cliente = meRes.client; processos = procRes.processos; honorarios = honRes.honorarios;

    const primeiro = cliente.nome.split(' ')[0];
    el('clienteNome').textContent = cliente.nome;
    el('avatarInicial').textContent = primeiro.charAt(0).toUpperCase();
    el('saudacao').textContent = `Bem-vindo(a), ${primeiro}.`;

    renderInicio();
    renderProcessos();
    renderPagamentos();
    renderPerfil();
  }

  function renderInicio() {
    const ativos = processos.filter((p) => p.status === 'em_andamento');
    el('pProcessosAtivos').textContent = ativos.length;
    const proxima = processos.map((p) => p.proxima_audiencia).filter(Boolean).sort()[0];
    el('pProximo').textContent = proxima ? formatDateBR(proxima).slice(0, 5) : '—';
    const atraso = honorarios.filter((h) => h.status === 'atraso').reduce((s, h) => s + h.valor_centavos, 0);
    el('pAtraso').textContent = atraso ? centavosToBRL(atraso) : 'R$ 0,00';

    el('resumoProcessos').innerHTML = processos.map((p) => {
      const st = PROC_STATUS[p.status] || { label: p.status, kind: 'mute' };
      const ultimo = p.andamentos[0];
      return `<div class="card ${p.status === 'em_andamento' ? 'card-accent' : ''}" style="display:flex;flex-direction:column;gap:14px;padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font:400 21px var(--font-serif);color:var(--ink)">${p.titulo || p.area}</span><span style="font:700 9px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${p.numero || '—'}</span></div>
          ${tagHtml(st.label, st.kind)}
        </div>
        <p style="margin:0;font:300 15px/1.7 var(--font-serif);color:var(--ink-soft)">${ultimo ? `Última movimentação: ${ultimo.titulo}, em ${formatDateBR(ultimo.data)}.` : 'Sem movimentações registradas ainda.'}</p>
      </div>`;
    }).join('') || empty('Você ainda não possui processos cadastrados.');
  }

  function renderProcessos() {
    el('listaProcessosDetalhe').innerHTML = processos.map((p) => {
      const st = PROC_STATUS[p.status] || { label: p.status, kind: 'mute' };
      return `<div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font:400 24px var(--font-serif);color:var(--ink)">${p.titulo || p.area}</span>${tagHtml(st.label, st.kind)}
        </div>
        <span style="font:700 9.5px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${p.numero || '—'} ${p.vara ? '· ' + p.vara : ''}</span>
        <div class="card">${p.andamentos.map((a) => `
          <div class="andamento-item">
            <span style="font:700 9.5px var(--font-mono);letter-spacing:.1em;color:var(--muted);padding-top:4px">${formatDateBR(a.data)}</span>
            <div style="display:flex;flex-direction:column;gap:4px"><span style="font:400 16px var(--font-serif);color:var(--ink)">${a.titulo}</span><span style="font:300 14px/1.65 var(--font-serif);color:var(--ink-soft)">${a.descricao || ''}</span></div>
          </div>`).join('') || empty('Sem movimentações registradas.')}</div>
      </div>`;
    }).join('') || empty('Você ainda não possui processos cadastrados.');
  }

  function renderPagamentos() {
    const atrasados = honorarios.filter((h) => h.status === 'atraso');
    el('alertaAtraso').innerHTML = atrasados.map((h) => `
      <div class="card" style="display:flex;flex-direction:column;gap:14px;padding:26px;background:var(--danger-bg);border-color:var(--danger-border);border-left:2px solid var(--danger-ink)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
          <div style="display:flex;flex-direction:column;gap:5px"><span style="font:400 20px var(--font-serif);color:var(--ink)">${h.referencia}</span><span style="font:300 14.5px var(--font-serif);color:var(--muted-2)">Vencido em ${formatDateBR(h.vencimento)}</span></div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span style="font:300 30px var(--font-serif);color:var(--danger-ink)">${centavosToBRL(h.valor_centavos)}</span>${tagHtml('EM ATRASO', 'late')}</div>
        </div>
      </div>`).join('');

    el('listaLancamentos').innerHTML = honorarios.map((h) => {
      const st = HONOR_STATUS[h.status] || { label: h.status, kind: 'mute' };
      return `<div class="table-row lanc-table">
        <span style="font:400 15.5px var(--font-serif);color:var(--ink)">${h.referencia}</span>
        <span style="font:300 15px var(--font-serif);color:var(--ink-soft)">${formatDateBR(h.vencimento)}</span>
        <span style="font:400 15px var(--font-serif);color:var(--ink)">${centavosToBRL(h.valor_centavos)}</span>
        ${tagHtml(st.label, st.kind)}
      </div>`;
    }).join('') || empty('Nenhum lançamento registrado.');
  }

  function renderPerfil() {
    const docFmt = cliente.documento.length === 11
      ? `${cliente.documento.slice(0, 3)}.${cliente.documento.slice(3, 6)}.${cliente.documento.slice(6, 9)}-${cliente.documento.slice(9)}`
      : `${cliente.documento.slice(0, 2)}.${cliente.documento.slice(2, 5)}.${cliente.documento.slice(5, 8)}/${cliente.documento.slice(8, 12)}-${cliente.documento.slice(12)}`;
    const items = [
      ['NOME', cliente.nome], [cliente.tipo === 'PF' ? 'CPF' : 'CNPJ', docFmt],
      ['E-MAIL', cliente.email || '—'], ['TELEFONE', cliente.telefone || '—'],
      ['ENDEREÇO', [cliente.logradouro, cliente.numero].filter(Boolean).join(', ') || '—'], ['CIDADE / UF', cliente.cidade_uf || '—']
    ];
    el('dadosPerfil').innerHTML = items.map(([k, v]) => `
      <div class="card" style="display:flex;flex-direction:column;gap:7px;padding:22px"><span class="label">${k}</span><span style="font:400 17px var(--font-serif);color:var(--ink)">${v}</span></div>`).join('');
  }

  el('senhaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.put('/api/me/senha', { atual: el('senhaAtual').value, nova: el('senhaNova').value });
      toast('Senha alterada com sucesso.');
      e.target.reset();
    } catch (err) {
      toast(err.message || 'Não foi possível alterar a senha.', 'error');
    }
  });

  document.querySelectorAll('[data-nav]').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-btn-light').forEach((b) => b.classList.remove('active'));
    el('sec-' + btn.dataset.nav).classList.add('active');
    btn.classList.add('active');
  }));

  el('menuSair').addEventListener('click', async () => {
    await Api.post('/api/auth/logout');
    window.location.href = paginaAposSair();
  });

  boot();
})();

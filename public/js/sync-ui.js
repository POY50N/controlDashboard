// Widget de sincronização — só existe no aplicativo desktop (window.desktop
// é injetado pelo preload do Electron).
//
// Comportamento:
//   · o app procura a conexão sozinho; aqui só mostramos o estado, discreto,
//     no rodapé;
//   · ao SAIR do estado offline, se houve alteração local, aparece a
//     pergunta: manter os dados desta máquina ou usar os do servidor;
//   · se os dois lados mexeram no mesmo registro, o conflito é mostrado item
//     a item, sem escolher sozinho.

(() => {
  if (!window.desktop) return;

  const TABLE_LABELS = {
    admins: 'Colaborador', clients: 'Cliente', processos: 'Processo', honorarios: 'Cobrança',
    contas_escritorio: 'Conta do escritório', andamentos: 'Movimentação',
    colaborador_permissoes: 'Permissão'
  };
  const OP_LABELS = { create: 'Criado', update: 'Alterado', delete: 'Removido' };

  const style = document.createElement('style');
  style.textContent = `
    .sync-status{position:fixed;right:18px;bottom:16px;z-index:180;display:flex;align-items:center;gap:8px;
      padding:7px 13px;background:rgba(28,30,34,.92);color:#c9c5bb;border-radius:20px;
      font:300 12.5px var(--font-serif);cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);
      transition:filter .2s;user-select:none}
    .sync-status:hover{filter:brightness(1.25)}
    .sync-dot{width:7px;height:7px;border-radius:50%;flex:none}
    .sync-dot.on{background:#6f8f6a;box-shadow:0 0 0 3px rgba(111,143,106,.2)}
    .sync-dot.off{background:#8d846f}
    .sync-dot.busy{background:var(--gold-1);animation:pulse 1.1s ease-in-out infinite}
    .sync-dot.alert{background:#c8907e;box-shadow:0 0 0 3px rgba(200,144,126,.2)}

    .sync-ask{position:fixed;inset:0;z-index:200;background:rgba(20,21,22,.55);
      display:flex;align-items:center;justify-content:center;animation:fadeIn .2s both}
    .sync-card{width:640px;max-width:94vw;max-height:88vh;overflow:auto;background:var(--panel);
      border:1px solid var(--border);border-top:2px solid var(--gold-2);
      box-shadow:0 22px 60px rgba(0,0,0,.35);animation:enterUp .25s both}
    .sync-card-head{padding:26px 28px 20px;border-bottom:1px solid var(--border)}
    .sync-opt{display:grid;grid-template-columns:auto 1fr;gap:15px;align-items:start;width:100%;
      padding:18px 20px;border:1px solid var(--border-soft);background:var(--bg);cursor:pointer;
      text-align:left;font:inherit;transition:border-color .2s,transform .15s}
    .sync-opt:hover{border-color:var(--gold-2);transform:translateY(-1px)}
    .sync-opt-mark{width:34px;height:34px;flex:none;border-radius:50%;display:flex;align-items:center;
      justify-content:center;background:var(--gold-grad)}
    .sync-opt-mark.neutro{background:#e6e1d3}
    .sync-change{display:grid;grid-template-columns:auto 1fr;gap:13px;padding:13px 20px;
      border-bottom:1px solid #eee7d9;align-items:start}
    .sync-op{font:700 8px var(--font-mono);letter-spacing:.12em;padding:4px 9px;white-space:nowrap;margin-top:2px}
    .sync-op.create{background:var(--ok-bg);color:var(--ok-ink)}
    .sync-op.update{background:var(--warn-bg);color:var(--warn-ink)}
    .sync-op.delete{background:var(--danger-tag-bg);color:var(--danger-ink)}
    .sync-conflito{padding:18px 20px;border-bottom:1px solid #eee7d9;background:var(--danger-bg)}
    .sync-lado{display:flex;flex-direction:column;gap:5px;padding:12px 14px;background:var(--panel);border:1px solid var(--border)}
  `;
  document.head.appendChild(style);

  const host = document.createElement('div');
  document.body.appendChild(host);
  const dialogo = document.createElement('div');
  document.body.appendChild(dialogo);

  let estado = { online: false, syncing: false, pendingCount: 0, conflicts: [], lastSyncAt: null };
  let pendentes = [];
  let perguntando = false;

  // ---------- indicador discreto no rodapé ----------
  function classeDoPonto() {
    if (estado.syncing) return 'busy';
    if (estado.conflicts.length) return 'alert';
    return estado.online ? 'on' : 'off';
  }
  function textoDoStatus() {
    if (estado.syncing) return 'Sincronizando…';
    if (estado.conflicts.length) return `${estado.conflicts.length} conflito(s)`;
    if (!estado.online) return 'Offline';
    return estado.pendingCount ? `Online · ${estado.pendingCount} para enviar` : 'Online';
  }
  function pintarStatus() {
    host.innerHTML = `<div class="sync-status" id="syncStatus" title="Clique para ver a sincronização">
      <span class="sync-dot ${classeDoPonto()}"></span><span>${textoDoStatus()}</span>
    </div>`;
    document.getElementById('syncStatus').addEventListener('click', abrirDetalhes);
  }

  // ---------- a pergunta ao voltar a ficar online ----------
  async function perguntarComoSincronizar() {
    perguntando = true;
    pendentes = await window.desktop.getPending();

    dialogo.innerHTML = `
      <div class="sync-ask">
        <div class="sync-card">
          <div class="sync-card-head">
            <span class="label">CONEXÃO RESTABELECIDA</span>
            <h2 style="margin:8px 0 8px;font:300 26px var(--font-serif);color:var(--ink)">
              Você trabalhou offline. O que fazer com estas alterações?
            </h2>
            <p style="margin:0;font:300 14.5px/1.7 var(--font-serif);color:var(--muted)">
              Foram feitas <b style="font-weight:500">${pendentes.length} alteração(ões)</b> neste computador enquanto ele
              estava sem internet. Escolha se elas devem subir para o servidor ou se você prefere descartá-las.
            </p>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px;padding:22px 28px">
            <button class="sync-opt" id="optManter">
              <span class="sync-opt-mark">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#1c1e22" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="M6 11l6-6 6 6"></path></svg>
              </span>
              <span style="display:flex;flex-direction:column;gap:4px">
                <span style="font:400 17px var(--font-serif);color:var(--ink)">Manter os dados deste computador</span>
                <span style="font:300 13.5px/1.6 var(--font-serif);color:var(--muted)">Envia o que você fez offline para o servidor.</span>
              </span>
            </button>

            <button class="sync-opt" id="optServidor">
              <span class="sync-opt-mark neutro">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b6558" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M18 13l-6 6-6-6"></path></svg>
              </span>
              <span style="display:flex;flex-direction:column;gap:4px">
                <span style="font:400 17px var(--font-serif);color:var(--ink)">Usar os dados do servidor</span>
                <span style="font:300 13.5px/1.6 var(--font-serif);color:var(--muted)">Descarta as alterações locais e baixa o que está na web.</span>
              </span>
            </button>

            <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:6px">
              <button class="btn-text" id="optVer">Ver o que mudou neste computador</button>
              <button class="btn-text" id="optDepois">Decidir depois</button>
            </div>
          </div>

          <div id="listaMudancas" class="hidden" style="border-top:1px solid var(--border)">
            <div style="padding:14px 20px 6px"><span class="label">ALTERAÇÕES FEITAS OFFLINE</span></div>
            ${pendentes.map((c) => `
              <div class="sync-change">
                <span class="sync-op ${c.operation}">${(OP_LABELS[c.operation] || c.operation).toUpperCase()}</span>
                <div style="display:flex;flex-direction:column;gap:3px">
                  <span style="font:400 14.5px/1.5 var(--font-serif);color:var(--ink)">${c.summary}</span>
                  <span style="font:700 8px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${TABLE_LABELS[c.table] || c.table} · ${c.changedAt}</span>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;

    const ver = document.getElementById('optVer');
    ver.addEventListener('click', () => {
      const lista = document.getElementById('listaMudancas');
      const aberto = !lista.classList.contains('hidden');
      lista.classList.toggle('hidden', aberto);
      ver.textContent = aberto ? 'Ver o que mudou neste computador' : 'Ocultar a lista';
    });

    document.getElementById('optDepois').addEventListener('click', fecharDialogo);

    document.getElementById('optManter').addEventListener('click', async () => {
      fecharDialogo();
      estado.syncing = true; pintarStatus();
      const r = await window.desktop.sync({});
      if (r.conflicts && r.conflicts.length) abrirDetalhes();
      else toast('Alterações enviadas ao servidor.');
    });

    document.getElementById('optServidor').addEventListener('click', async () => {
      if (!confirm('As alterações feitas neste computador serão descartadas e substituídas pelos dados do servidor. Deseja continuar?')) return;
      fecharDialogo();
      estado.syncing = true; pintarStatus();
      await window.desktop.discardLocal();
      toast('Dados do servidor aplicados neste computador.');
    });
  }

  function fecharDialogo() {
    perguntando = false;
    dialogo.innerHTML = '';
  }

  // ---------- painel de detalhes / conflitos ----------
  async function abrirDetalhes() {
    pendentes = await window.desktop.getPending();
    const conflitos = estado.conflicts.map((c) => `
      <div class="sync-conflito">
        <div style="display:flex;flex-direction:column;gap:10px">
          <span style="font:400 16px var(--font-serif);color:var(--danger-ink)">Conflito · ${c.label}</span>
          <span style="font:300 13.5px/1.6 var(--font-serif);color:var(--ink-soft)">Os dois lados alteraram este registro. Escolha qual versão fica.</span>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="sync-lado"><span class="label">NESTE COMPUTADOR</span><span style="font:300 13.5px/1.5 var(--font-serif)">${c.localSummary || '—'}</span></div>
            <div class="sync-lado"><span class="label">NO SERVIDOR</span><span style="font:300 13.5px/1.5 var(--font-serif)">${c.remoteSummary || '—'}</span></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:2px">
            <button class="btn btn-primary" style="padding:10px 18px;font-size:13.5px" data-keep="local" data-t="${c.table}" data-r="${c.rowId}">Manter a minha</button>
            <button class="btn btn-outline" style="padding:10px 18px;font-size:13.5px" data-keep="server" data-t="${c.table}" data-r="${c.rowId}">Manter a do servidor</button>
          </div>
        </div>
      </div>`).join('');

    dialogo.innerHTML = `
      <div class="sync-ask">
        <div class="sync-card">
          <div class="sync-card-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
            <div style="display:flex;flex-direction:column;gap:6px">
              <span class="label">SINCRONIZAÇÃO</span>
              <span style="font:300 22px var(--font-serif);color:var(--ink)">${estado.online ? 'Conectado ao servidor' : 'Trabalhando offline'}</span>
              <span style="font:300 13px var(--font-serif);color:var(--muted)">
                ${estado.lastSyncAt ? 'Última sincronização: ' + new Date(estado.lastSyncAt).toLocaleString('pt-BR') : 'Ainda não sincronizado nesta máquina.'}
              </span>
            </div>
            <button class="btn-text" id="fecharDetalhes">Fechar</button>
          </div>
          ${conflitos}
          ${estado.conflicts.length ? '' : `
            <div style="padding:16px 20px 6px"><span class="label">ALTERAÇÕES AINDA NÃO ENVIADAS</span></div>
            ${pendentes.length ? pendentes.map((c) => `
              <div class="sync-change">
                <span class="sync-op ${c.operation}">${(OP_LABELS[c.operation] || c.operation).toUpperCase()}</span>
                <div style="display:flex;flex-direction:column;gap:3px">
                  <span style="font:400 14.5px/1.5 var(--font-serif);color:var(--ink)">${c.summary}</span>
                  <span style="font:700 8px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${TABLE_LABELS[c.table] || c.table} · ${c.changedAt}</span>
                </div>
              </div>`).join('')
              : '<div style="padding:6px 20px 20px;font:300 14px var(--font-serif);color:var(--muted)">Nada pendente: este computador está igual ao servidor.</div>'}`}
          <div style="display:flex;justify-content:flex-end;gap:12px;padding:18px 24px;background:#f2ede1">
            ${estado.online
              ? `<button class="btn btn-primary" id="sincronizarAgora" ${estado.syncing ? 'disabled' : ''}>${estado.syncing ? 'Sincronizando…' : 'Sincronizar agora'}</button>`
              : '<span style="font:300 13px var(--font-serif);color:var(--muted);align-self:center">Sem conexão — o app tentará reconectar sozinho.</span>'}
          </div>
        </div>
      </div>`;

    document.getElementById('fecharDetalhes').addEventListener('click', fecharDialogo);
    const btn = document.getElementById('sincronizarAgora');
    if (btn) btn.addEventListener('click', async () => {
      estado.syncing = true; pintarStatus();
      await window.desktop.sync({});
      abrirDetalhes();
    });

    dialogo.querySelectorAll('[data-keep]').forEach((b) => b.addEventListener('click', async () => {
      const escolha = b.dataset.keep === 'local' ? 'keep_local' : 'keep_server';
      estado = await window.desktop.resolve(b.dataset.t, Number(b.dataset.r), escolha);
      abrirDetalhes();
    }));
  }

  // ---------- reação às mudanças de estado ----------
  window.desktop.onStateChange(async (novo) => {
    const estavaOffline = !estado.online;
    const anterior = estado;
    estado = novo;
    pintarStatus();

    // Voltou a ter internet: se mexeram em algo offline, perguntar. Se não
    // mexeram, apenas alinhar em silêncio.
    if (estavaOffline && novo.online && !perguntando && !novo.syncing) {
      if (novo.pendingCount > 0) {
        await perguntarComoSincronizar();
      } else if (!anterior.lastSyncAt || novo.lastSyncAt === anterior.lastSyncAt) {
        window.desktop.sync({});
      }
    }

    if (novo.conflicts.length && !perguntando && !dialogo.innerHTML) abrirDetalhes();
  });

  window.desktop.getState().then((s) => { estado = s; pintarStatus(); });
})();

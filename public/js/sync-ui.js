// Desktop-only sync widget. Loads on every page but does nothing in a plain
// browser (window.desktop is only injected by the Electron preload).
//
// Flow it implements, mirroring the "Steam re-sync" behaviour requested:
//   offline edits -> reconnect -> notification appears -> admin clicks
//   "Ver alterações" -> explicit, plain-language list of what changed ->
//   admin uploads them, or keeps what is already on the server.

(() => {
  if (!window.desktop) return;

  const TABLE_LABELS = {
    clients: 'Cliente', processos: 'Processo', honorarios: 'Cobrança',
    contas_escritorio: 'Conta do escritório', andamentos: 'Movimentação'
  };
  const OP_LABELS = { create: 'Criado', update: 'Alterado', delete: 'Removido' };

  const style = document.createElement('style');
  style.textContent = `
    .sync-pill{position:fixed;right:20px;bottom:20px;z-index:180;display:flex;align-items:center;gap:10px;
      padding:11px 16px;background:var(--dark);color:#f0ece4;border-left:2px solid var(--gold-2);
      font:300 13.5px var(--font-serif);box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;transition:filter .2s}
    .sync-pill:hover{filter:brightness(1.15)}
    .sync-dot{width:8px;height:8px;border-radius:50%;flex:none}
    .sync-dot.on{background:#6f8f6a}
    .sync-dot.off{background:#8d846f}
    .sync-dot.pending{background:var(--gold-1)}
    .sync-dot.conflict{background:var(--danger-ink)}
    .sync-panel{position:fixed;right:20px;bottom:20px;z-index:181;width:520px;max-width:92vw;max-height:78vh;overflow:auto;
      background:var(--panel);border:1px solid var(--border);border-top:2px solid var(--gold-2);
      box-shadow:0 18px 48px rgba(0,0,0,.28);animation:enterUp .25s both}
    .sync-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px 24px 16px;border-bottom:1px solid var(--border)}
    .sync-change{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:15px 24px;border-bottom:1px solid #eee7d9;align-items:start}
    .sync-op{font:700 8px var(--font-mono);letter-spacing:.12em;padding:4px 9px;border-radius:2px;white-space:nowrap;margin-top:2px}
    .sync-op.create{background:var(--ok-bg);color:var(--ok-ink)}
    .sync-op.update{background:var(--warn-bg);color:var(--warn-ink)}
    .sync-op.delete{background:var(--danger-tag-bg);color:var(--danger-ink)}
    .sync-foot{display:flex;justify-content:flex-end;gap:12px;padding:18px 24px;background:#f2ede1;position:sticky;bottom:0}
    .sync-conflict{padding:18px 24px;border-bottom:1px solid #eee7d9;background:var(--danger-bg)}
    .sync-side{display:flex;flex-direction:column;gap:5px;padding:12px 14px;background:var(--panel);border:1px solid var(--border)}
  `;
  document.head.appendChild(style);

  const host = document.createElement('div');
  document.body.appendChild(host);

  let state = { online: false, syncing: false, pendingCount: 0, conflicts: [], lastSyncAt: null };
  let panelOpen = false;
  let pending = [];
  let notifiedForSession = false;

  function dotClass() {
    if (state.conflicts.length) return 'conflict';
    if (state.syncing) return 'pending';
    if (!state.online) return 'off';
    if (state.pendingCount) return 'pending';
    return 'on';
  }

  function pillText() {
    if (state.syncing) return 'Sincronizando…';
    if (state.conflicts.length) return `${state.conflicts.length} conflito(s) para revisar`;
    if (!state.online) return state.pendingCount ? `Offline · ${state.pendingCount} alteração(ões) local(is)` : 'Trabalhando offline';
    if (state.pendingCount) return `${state.pendingCount} alteração(ões) para enviar`;
    return 'Dados sincronizados';
  }

  function render() {
    if (panelOpen) { renderPanel(); return; }
    host.innerHTML = `<div class="sync-pill" id="syncPill"><span class="sync-dot ${dotClass()}"></span><span>${pillText()}</span></div>`;
    document.getElementById('syncPill').addEventListener('click', openPanel);
  }

  async function openPanel() {
    panelOpen = true;
    pending = await window.desktop.getPending();
    renderPanel();
  }

  function closePanel() { panelOpen = false; render(); }

  function renderPanel() {
    const conflictsHtml = state.conflicts.map((c) => `
      <div class="sync-conflict">
        <div style="display:flex;flex-direction:column;gap:10px">
          <span style="font:400 16px var(--font-serif);color:var(--danger-ink)">Conflito · ${c.label}</span>
          <span style="font:300 13.5px/1.6 var(--font-serif);color:var(--ink-soft)">Este registro foi alterado nos dois lados. Escolha qual versão manter.</span>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="sync-side"><span class="label">NESTE COMPUTADOR</span><span style="font:300 13.5px/1.5 var(--font-serif)">${c.localSummary || '—'}</span></div>
            <div class="sync-side"><span class="label">NO SERVIDOR</span><span style="font:300 13.5px/1.5 var(--font-serif)">${c.remoteSummary || '—'}</span></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:2px">
            <button class="btn btn-primary" style="padding:10px 18px;font-size:13.5px" data-keep="local" data-t="${c.table}" data-r="${c.rowId}">Enviar a minha versão</button>
            <button class="btn btn-outline" style="padding:10px 18px;font-size:13.5px" data-keep="server" data-t="${c.table}" data-r="${c.rowId}">Manter a do servidor</button>
          </div>
        </div>
      </div>`).join('');

    const changesHtml = pending.map((c) => `
      <div class="sync-change">
        <span class="sync-op ${c.operation}">${(OP_LABELS[c.operation] || c.operation).toUpperCase()}</span>
        <div style="display:flex;flex-direction:column;gap:3px">
          <span style="font:400 14.5px/1.5 var(--font-serif);color:var(--ink)">${c.summary}</span>
          <span style="font:700 8px var(--font-mono);letter-spacing:.14em;color:var(--muted)">${TABLE_LABELS[c.table] || c.table} · ${c.changedAt}</span>
        </div>
      </div>`).join('') || `<div style="padding:22px 24px;font:300 14px var(--font-serif);color:var(--muted)">Nenhuma alteração pendente. Tudo já está igual ao servidor.</div>`;

    host.innerHTML = `
      <div class="sync-panel">
        <div class="sync-panel-head">
          <div style="display:flex;flex-direction:column;gap:6px">
            <span class="label">SINCRONIZAÇÃO</span>
            <span style="font:300 22px var(--font-serif);color:var(--ink)">${state.online ? 'Conectado ao servidor' : 'Trabalhando offline'}</span>
            <span style="font:300 13px var(--font-serif);color:var(--muted)">
              ${state.lastSyncAt ? 'Última sincronização: ' + new Date(state.lastSyncAt).toLocaleString('pt-BR') : 'Ainda não sincronizado nesta máquina.'}
            </span>
          </div>
          <button class="btn-text" id="syncClose">Fechar</button>
        </div>
        ${conflictsHtml}
        ${state.conflicts.length ? '' : `
          <div style="padding:16px 24px 8px"><span class="label">ALTERAÇÕES FEITAS NESTE COMPUTADOR</span></div>
          ${changesHtml}`}
        <div class="sync-foot">
          ${state.online
            ? `<button class="btn btn-primary" id="syncNow" ${state.syncing ? 'disabled' : ''}>${state.syncing ? 'Sincronizando…' : 'Enviar e sincronizar'}</button>`
            : `<span style="font:300 13px var(--font-serif);color:var(--muted);align-self:center">Conecte-se à internet para sincronizar.</span>
               <button class="btn btn-outline" id="syncRetry">Tentar conectar</button>`}
        </div>
      </div>`;

    document.getElementById('syncClose').addEventListener('click', closePanel);
    const syncNow = document.getElementById('syncNow');
    if (syncNow) syncNow.addEventListener('click', async () => {
      state.syncing = true; renderPanel();
      await window.desktop.sync({});
      pending = await window.desktop.getPending();
      renderPanel();
    });
    const retry = document.getElementById('syncRetry');
    if (retry) retry.addEventListener('click', async () => { await window.desktop.check(); });

    document.querySelectorAll('[data-keep]').forEach((btn) => btn.addEventListener('click', async () => {
      const choice = btn.dataset.keep === 'local' ? 'keep_local' : 'keep_server';
      state = await window.desktop.resolve(btn.dataset.t, Number(btn.dataset.r), choice);
      pending = await window.desktop.getPending();
      renderPanel();
    }));
  }

  window.desktop.onStateChange((next) => {
    const wasOffline = !state.online;
    state = next;
    // The notification the user asked for: on regaining connectivity with
    // work done offline, surface the review panel rather than syncing blind.
    if (wasOffline && next.online && next.pendingCount > 0 && !notifiedForSession) {
      notifiedForSession = true;
      openPanel();
    }
    if (!panelOpen) render();
    else renderPanel();
  });

  window.desktop.getState().then((s) => { state = s; render(); });
})();

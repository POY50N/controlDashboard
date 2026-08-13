// Faz a navegação das páginas públicas respeitar quem já está logado.
//
// Sem isso, um administrador que abre a página de download vê "Acessar
// portal" e é mandado de volta para a tela de login — um passo inútil, já
// que ele precisou estar logado para chegar ali. Com sessão ativa, os links
// viram "Voltar ao painel" (ou "ao portal") e levam direto ao destino.

(() => {
  const DESTINO = { admin: 'admin.html', client: 'portal.html' };
  const ROTULO = { admin: 'Voltar ao painel', client: 'Voltar ao portal' };

  async function sessaoAtual() {
    try {
      const s = await Api.get('/api/auth/session');
      return s && s.role ? s : null;
    } catch (e) {
      return null;
    }
  }

  function setaVoltar() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="M19 12H5"></path><path d="M11 18l-6-6 6-6"></path></svg>';
  }

  async function aplicar() {
    const sessao = await sessaoAtual();
    const logado = !!sessao;
    const destino = logado ? DESTINO[sessao.role] : null;

    document.querySelectorAll('[data-sessao]').forEach((el) => {
      const papel = el.dataset.sessao;

      // Elementos só para visitantes desaparecem quando há sessão.
      if (papel === 'visitante') {
        el.classList.toggle('hidden', logado);
        return;
      }

      // O botão principal: "Acessar portal" para visitante, "Voltar ao
      // painel/portal" para quem já entrou.
      if (papel === 'acesso') {
        if (!logado) return;
        el.setAttribute('href', destino);
        el.innerHTML = `${setaVoltar()}<span>${ROTULO[sessao.role]}</span>`;
        el.style.display = 'inline-flex';
        el.style.alignItems = 'center';
        el.style.gap = '9px';
      }
    });

    document.dispatchEvent(new CustomEvent('sessao:pronta', { detail: sessao }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar);
  else aplicar();
})();

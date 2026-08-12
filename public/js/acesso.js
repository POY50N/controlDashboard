(() => {
  const el = (id) => document.getElementById(id);
  const docInput = el('docInput');
  const docSpinner = el('docSpinner');
  const docCheck = el('docCheck');
  const statusLabel = el('statusLabel');
  const erroBox = el('erroBox');
  const pedirSenhaBox = el('pedirSenhaBox');
  const criarSenhaBox = el('criarSenhaBox');
  const prontoBox = el('prontoBox');
  const tituloEtapa = el('tituloEtapa');
  const subtituloEtapa = el('subtituloEtapa');

  let debounceTimer = null;
  let currentAccount = null; // { kind, nome, hasPassword }
  let checkToken = 0;

  // Two faces of the same screen. In the desktop build this is the
  // administrative login and the entry point of the whole app; on the web it
  // is the client area.
  const isDesktop = !!window.desktop;
  const COPY = isDesktop
    ? {
        titulo: 'Entrar no painel',
        sub: 'Informe seu usuário, OAB ou CPF.',
        label: 'USUÁRIO, OAB OU CPF',
        placeholder: 'usuário, OAB ou CPF do advogado',
        heroTitulo: 'Acesso administrativo',
        heroTexto: 'Painel de administração do escritório. Este aplicativo é de uso interno — o acompanhamento de processos pelos clientes é feito pelo portal no site.',
        badge: 'USO RESTRITO AO ESCRITÓRIO',
        badgeTexto: 'Aqui ficam o cadastro completo de clientes, os processos e o financeiro.',
        erroTitulo: 'Acesso não reconhecido',
        erroTexto: 'Não encontramos um acesso administrativo com estes dados. Confira o usuário, a OAB ou o CPF cadastrado.'
      }
    : {
        titulo: 'Acessar meu portal',
        sub: 'Comece pelo seu usuário ou documento.',
        label: 'USUÁRIO, CPF/CNPJ, TELEFONE OU OAB',
        placeholder: 'seu usuário, documento ou telefone',
        heroTitulo: 'Área do cliente',
        heroTexto: 'Informe seu usuário, CPF/CNPJ ou telefone. Reconhecemos o cadastro e abrimos apenas o passo seguinte — sem trocar de tela.',
        badge: 'ACESSO PROTEGIDO',
        badgeTexto: 'Cada cliente enxerga apenas os próprios processos e pagamentos.',
        erroTitulo: 'Não localizado',
        erroTexto: 'Não encontramos um cadastro ativo com este usuário ou documento. Confira os dados ou procure o escritório.'
      };

  function applyCopy() {
    if (isDesktop) document.body.classList.add('is-desktop');
    el('heroTitulo').textContent = COPY.heroTitulo;
    el('heroTexto').textContent = COPY.heroTexto;
    el('heroBadge').textContent = COPY.badge;
    el('heroBadgeTexto').textContent = COPY.badgeTexto;
    el('docLabel').textContent = COPY.label;
    docInput.placeholder = COPY.placeholder;
    el('erroTitulo').textContent = COPY.erroTitulo;
    el('erroTexto').textContent = COPY.erroTexto;
  }

  function onlyDigits(v) { return (v || '').replace(/\D/g, ''); }
  function hasLetters(v) { return /[a-zA-Z]/.test(v || ''); }

  // The field accepts several kinds of identifier (username, CPF/CNPJ,
  // phone, OAB), so we only auto-check on lengths that can actually be one
  // of them - otherwise every intermediate keystroke would look "not found".
  const DIGIT_LENGTHS = [6, 10, 11, 14];

  function looksComplete(raw) {
    const value = (raw || '').trim();
    if (!value) return false;
    if (hasLetters(value)) return value.length >= 3;
    return DIGIT_LENGTHS.includes(onlyDigits(value).length);
  }

  function resetSteps() {
    pedirSenhaBox.classList.add('hidden');
    criarSenhaBox.classList.add('hidden');
    prontoBox.classList.add('hidden');
    el('ambiguoBox').classList.add('hidden');
    el('identificadoBox').classList.remove('hidden');
    erroBox.classList.add('hidden');
    docCheck.classList.add('hidden');
    docSpinner.classList.add('hidden');
    docInput.classList.remove('error');
    statusLabel.textContent = '';
    tituloEtapa.textContent = COPY.titulo;
    subtituloEtapa.textContent = COPY.sub;
  }

  function setStatus(text, color) {
    statusLabel.textContent = text;
    statusLabel.style.color = color;
  }

  function scheduleCheck(raw) {
    clearTimeout(debounceTimer);
    resetSteps();
    if (!looksComplete(raw)) return;
    docSpinner.classList.remove('hidden');
    setStatus('VERIFICANDO…', '#a2997f');
    const myToken = ++checkToken;
    debounceTimer = setTimeout(() => runCheck(raw, myToken), 900);
  }

  async function runCheck(raw, myToken) {
    try {
      const result = await Api.post('/api/auth/check-identifier', { value: raw });
      if (myToken !== checkToken) return; // stale (user kept typing)
      docSpinner.classList.add('hidden');
      if (!result.found) {
        currentAccount = null;
        erroBox.classList.remove('hidden');
        docInput.classList.add('error', 'shake');
        setTimeout(() => docInput.classList.remove('shake'), 400);
        setStatus('NÃO LOCALIZADO', '#9a4a35');
        return;
      }
      currentAccount = result;
      docCheck.classList.remove('hidden');
      docInput.classList.remove('error');

      // Several accounts share this identifier: we cannot (and must not)
      // say whose they are, so the password does the identifying.
      if (result.ambiguous) {
        setStatus('VÁRIOS CADASTROS', '#8a6d24');
        tituloEtapa.textContent = 'Confirme com sua senha';
        subtituloEtapa.textContent = 'Este acesso é usado por mais de um cadastro.';
        el('identificadoBox').classList.add('hidden');
        el('ambiguoBox').classList.remove('hidden');
        el('ambiguoCount').textContent = result.count === 2 ? 'Dois cadastros' : `${result.count} cadastros`;
        pedirSenhaBox.classList.remove('hidden');
        el('senhaInput').value = '';
        el('senhaErro').classList.add('hidden');
        el('senhaInput').focus();
        return;
      }

      el('identificadoBox').classList.remove('hidden');
      el('ambiguoBox').classList.add('hidden');

      if (result.hasPassword) {
        setStatus('CADASTRO VÁLIDO', '#6f8f6a');
        tituloEtapa.textContent = 'Bem-vindo(a) de volta';
        subtituloEtapa.textContent = 'Digite sua senha para continuar.';
        el('avatarInicial').textContent = (result.nome || 'C').charAt(0).toUpperCase();
        el('nomeClienteLabel').textContent = result.nome;
        pedirSenhaBox.classList.remove('hidden');
        el('senhaInput').value = '';
        el('senhaErro').classList.add('hidden');
        el('senhaInput').focus();
      } else {
        setStatus('PRIMEIRO ACESSO', '#8a6d24');
        tituloEtapa.textContent = 'Vamos criar sua senha';
        subtituloEtapa.textContent = 'Defina uma senha para acessar seu portal.';
        el('nomeClienteCriar').textContent = result.nome;
        criarSenhaBox.classList.remove('hidden');
        el('novaSenhaInput').value = '';
        el('confirmarSenhaInput').value = '';
        el('novaSenhaInput').focus();
      }
    } catch (err) {
      if (myToken !== checkToken) return;
      docSpinner.classList.add('hidden');
      erroBox.classList.remove('hidden');
      setStatus('ERRO', '#9a4a35');
    }
  }

  docInput.addEventListener('input', (e) => scheduleCheck(e.target.value));
  docInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(debounceTimer); runCheck(docInput.value, ++checkToken); }
  });

  function passwordStrength(pw) {
    let n = 0;
    if (pw.length >= 8) n++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
    if (/\d/.test(pw)) n++;
    if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 10) n++;
    return pw ? Math.max(1, n) : 0;
  }
  const strengthColors = ['#e3ddd0', '#c8907e', '#d8b463', '#a8b48c', '#6f8f6a'];
  const strengthLabels = ['defina uma senha', 'fraca', 'razoável', 'boa', 'forte'];

  el('novaSenhaInput').addEventListener('input', (e) => {
    const nivel = passwordStrength(e.target.value);
    const bars = el('forcaBarras').children;
    for (let i = 0; i < bars.length; i++) bars[i].style.background = i < nivel ? strengthColors[nivel] : '#e8e2d5';
    el('forcaLabel').textContent = strengthLabels[nivel];
    el('forcaLabel').style.color = nivel ? strengthColors[nivel] : '#a2997f';
  });

  function showSuccess(nome, redirect, role) {
    resetSteps();
    prontoBox.classList.remove('hidden');
    const destino = role === 'admin' ? 'o painel' : 'o seu portal';
    el('prontoTexto').textContent = `Estamos abrindo ${destino}, ${nome}.`;
    setTimeout(() => { window.location.href = redirect; }, 1500);
  }

  async function doLogin() {
    const senha = el('senhaInput').value;
    if (!senha) {
      el('senhaErro').classList.remove('hidden');
      pedirSenhaBox.querySelector('#senhaInput').classList.add('error', 'shake');
      setTimeout(() => el('senhaInput').classList.remove('shake'), 400);
      return;
    }
    try {
      const res = await Api.post('/api/auth/login', { value: docInput.value, password: senha });
      showSuccess(res.nome, res.redirect, res.role);
    } catch (err) {
      // 403 = right credentials, wrong application (client on the desktop app).
      if (err.status === 403) {
        el('senhaErro').textContent = err.message;
        el('senhaErro').classList.remove('hidden');
        return;
      }
      el('senhaErro').textContent = 'Senha incorreta. Tente novamente.';
      el('senhaErro').classList.remove('hidden');
      el('senhaInput').classList.add('error', 'shake');
      setTimeout(() => el('senhaInput').classList.remove('shake'), 400);
    }
  }

  el('entrarBtn').addEventListener('click', doLogin);
  el('senhaInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

  async function doCadastrar() {
    const senha = el('novaSenhaInput').value;
    const senha2 = el('confirmarSenhaInput').value;
    if (senha.length < 8) {
      el('novaSenhaInput').classList.add('error', 'shake');
      setTimeout(() => el('novaSenhaInput').classList.remove('shake'), 400);
      return;
    }
    if (senha !== senha2) {
      el('divergemErro').classList.remove('hidden');
      el('confirmarSenhaInput').classList.add('error', 'shake');
      setTimeout(() => el('confirmarSenhaInput').classList.remove('shake'), 400);
      return;
    }
    try {
      const res = await Api.post('/api/auth/set-password', { value: docInput.value, password: senha });
      showSuccess(res.nome, res.redirect, res.role);
    } catch (err) {
      toast(err.message || 'Não foi possível criar a senha.', 'error');
    }
  }
  el('cadastrarBtn').addEventListener('click', doCadastrar);
  el('confirmarSenhaInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doCadastrar(); });

  function limpar() {
    clearTimeout(debounceTimer);
    checkToken++;
    docInput.value = '';
    currentAccount = null;
    resetSteps();
    docInput.focus();
  }
  el('limparBtn1').addEventListener('click', limpar);
  el('limparBtn2').addEventListener('click', limpar);

  // Iniciar com o sistema — só existe no aplicativo desktop.
  async function initAutoStart() {
    if (!isDesktop || !window.desktop.getAutoLaunch) return;
    const row = el('autoStartRow');
    const toggle = el('autoStartToggle');
    let estado;
    try {
      estado = await window.desktop.getAutoLaunch();
    } catch (e) {
      return;
    }
    if (!estado || !estado.supported) return;

    row.classList.remove('hidden');
    const pintar = (on) => toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    pintar(estado.enabled);

    async function alternar() {
      const alvo = toggle.getAttribute('aria-checked') !== 'true';
      pintar(alvo); // resposta imediata; corrigimos abaixo se o sistema recusar
      const res = await window.desktop.setAutoLaunch(alvo);
      pintar(res.enabled);
      if (res.error) {
        toast('Não foi possível alterar a inicialização automática.', 'error');
      } else {
        toast(res.enabled ? 'O painel abrirá junto com o computador.' : 'O painel não abrirá mais automaticamente.');
      }
    }
    toggle.addEventListener('click', alternar);
    el('autoStartLabel').addEventListener('click', (e) => { e.preventDefault(); alternar(); });
  }

  applyCopy();
  resetSteps();
  initAutoStart();
  docInput.focus();
})();

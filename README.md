# Jorge Silva Advocacia — Site, Portal do Cliente e Painel do Advogado

Sistema completo do escritório: site institucional, área de acesso, portal do
cliente, painel administrativo e **aplicativo desktop offline-first** que
sincroniza com a web quando há internet.

---

## Como rodar

```bash
npm install
npm run seed      # cria o banco com dados fictícios (só na primeira vez)
npm run server    # http://localhost:4178
```

### Credenciais de teste

**Administrador / titular (senha `admin123`)** — as três formas levam ao mesmo painel:

| Entrar por | Valor |
|---|---|
| Usuário | `jorge` |
| OAB | `OAB/SP 123.456` (ou só `123456`) |
| CPF próprio | `153.509.460-56` |

**Colaboradores** — a equipe usa o mesmo painel, cada um com o seu perfil:

| Colaborador | Quadro | Usuário | Senha | Áreas | Carteira |
|---|---|---|---|---|---|
| Helena Prado | Sócia | `helena` | `socia123` | todas | — |
| Marcos Tavares | Advogado | `marcos` | `adv123` | tudo menos contas do escritório e equipe | Construtora Alvorada |
| Beatriz Nunes | Secretária | `beatriz` | `colab123` | visão, clientes, processos, financeiro | Ana Paula Costa, Carlos Menezes |
| Rafael Moreira | Estagiário | `rafael` | *(primeiro acesso)* | só clientes e processos | Ricardo, Renata, Padaria Estrela |

O titular (Jorge) responde pelos demais clientes e **vê todos**.

**Clientes** — entram por **usuário**, **CPF/CNPJ** ou **telefone**:

| Cliente | Usuário | Documento | Telefone | Senha |
|---|---|---|---|---|
| Maria Oliveira Ramos | `maria.oliveira` | `111.444.777-35` | `(11) 90000-0000` | `123456` |
| João Santos | `joao.santos` | `529.982.247-25` | `(11) 91111-1111` | `123456` |
| Ana Paula Costa | `ana.costa` | `935.411.347-80` | `(11) 92222-2222` | `123456` |
| Construtora Alvorada | `alvorada` | `11.222.333/0001-81` | `(11) 3222-4400` | `123456` |
| Padaria Estrela ME | `padariaestrela` | `45.723.174/0001-10` | `(11) 3444-5500` | `123456` |
| Carlos Menezes | `carlos.menezes` | `123.456.789-09` | `(11) 93333-3333` | *(primeiro acesso)* |

**Usuário repetido** — os dois cadastros abaixo usam o mesmo usuário
`rpereira`. Ao digitá-lo, o sistema avisa que há mais de um cadastro e **é a
senha que identifica quem está entrando**:

| Cliente | Usuário | Documento | Senha |
|---|---|---|---|
| Ricardo Alves Pereira | `rpereira` | `307.200.560-77` | `ricardo123` |
| Renata Pereira Alves | `rpereira` | `877.482.480-11` | `renata123` |

---

## Como funciona o acesso

Há **uma única tela de acesso** e **um único campo** de identificação — não
existe botão de "acesso do advogado" em lugar nenhum do sistema.

O campo aceita **usuário, CPF/CNPJ, telefone ou número da OAB**. O sistema
reconhece automaticamente quem está entrando:

- reconheceu o **administrador** → vai direto para o **painel de controle**
  (`admin.html`);
- reconheceu um **cliente** → vai para o **portal do cliente**
  (`portal.html`).

Quando o valor digitado pertence a **mais de um cadastro** (dois clientes com
o mesmo usuário, por exemplo), o sistema não revela os nomes: ele pede a senha
e é ela que determina qual cadastro será aberto.

A animação segue o modelo **A2 (login progressivo)**: ao completar a
identificação, o sistema verifica sozinho e revela apenas o passo seguinte, na
mesma tela — senha, ou criação de senha no primeiro acesso.

---

## Páginas

| Arquivo | O que é |
|---|---|
| `public/index.html` | Site institucional (landing page) |
| `public/acesso.html` | Tela única de acesso (animação A2) |
| `public/admin.html` | Painel do advogado |
| `public/portal.html` | Portal do cliente |
| `public/download.html` | Página de download do aplicativo |

### Quem enxerga o quê (permissões entre colaboradores)

Cada cliente tem um **colaborador responsável** — quem o cadastrou. Os
processos do cliente seguem esse mesmo dono.

| Quem | Enxerga |
|---|---|
| **Titular** do escritório | **tudo**, sem precisar de autorização de ninguém |
| Demais colaboradores | os próprios clientes/processos **+** os de quem o autorizou |

Um colaborador cadastrado por outro **não interfere** nos clientes alheios: a
restrição vale para listar, abrir, editar, excluir, lançar cobrança e
exportar. Não é só a tela que esconde — as consultas são filtradas e o acesso
direto à API responde **403**.

**Autorizar alguém:** menu do usuário → **"Quem vê meus processos"**. A lista
traz os outros colaboradores com um interruptor por pessoa. O titular aparece
sempre marcado e travado, porque o acesso dele é automático.

**Ver a carteira de outro:** na área de **Processos**, o botão **"Processos de
outros colaboradores"** abre a lista. Quem autorizou você fica clicável, com a
contagem de processos; **quem não autorizou aparece apagado, com cadeado e sem
possibilidade de clique**.

No banco de exemplo: a Beatriz autorizou o Rafael (ele vê a carteira dela),
mas o Rafael não autorizou a Beatriz — então, para ela, o nome dele aparece
apagado.

### Áreas do painel por quadro

Ao cadastrar um colaborador escolhe-se o **quadro**, e as áreas do painel já
vêm **pré-marcadas** conforme o quadro — mas tudo continua editável antes de
salvar (há também "Restaurar padrão do quadro").

| Quadro | Vem marcado |
|---|---|
| **Sócio(a)** | tudo, inclusive contas do escritório e equipe |
| **Advogado(a)** | visão, clientes, processos, financeiro, exportar — **sem** contas do escritório |
| **Secretário(a)** | visão, clientes, processos, financeiro |
| **Financeiro** | visão, financeiro dos clientes, contas do escritório |
| **Estagiário(a)** / Outro | **nada** — cada área é marcada à mão |

O **titular** ignora essa lista: enxerga todas as áreas sempre.

As sete áreas são: `visao`, `clientes`, `processos`, `financeiro` (honorários
dos clientes), `escritorio` (contas internas), `exportar` e `colaboradores`
(cadastrar equipe). Quem não tem uma área não a vê no menu **e** recebe **403**
se chamar a rota direto — inclusive **"Cadastrar colaborador", que só aparece
para quem recebeu a área `colaboradores`**.

### Cadastrar colaborador

No painel, clicando na **área do usuário logado** (canto inferior esquerdo) há
a opção **"Cadastrar colaborador"**. Ela abre o formulário de cadastro da
equipe junto com a lista de quem já tem acesso ao painel.

- O colaborador é criado **sem senha**: ele define a dele no primeiro acesso,
  como acontece com os clientes.
- Entra pelo mesmo login (usuário, OAB, CPF ou telefone) e pelo mesmo
  aplicativo desktop.
- O **titular não pode ser removido**, e ninguém pode remover o próprio
  acesso. Remover é uma desativação (`ativo = 0`) — o histórico continua no
  banco, mas a conta deixa de ser reconhecida no login.
- Os cadastros entram no diário de alterações e **sincronizam** com a web como
  qualquer outro registro.

Essa opção existe apenas no menu do painel administrativo; o menu do portal do
cliente não a possui, e a rota `/api/colaboradores` responde **401** para
quem não é administrador.

### Download do aplicativo

Chega-se à página de download por dois caminhos: o botão **"Baixar o
aplicativo"** no topo da página inicial, ou clicando na **área do usuário
logado** (canto inferior esquerdo do painel / canto superior direito do
portal) e escolhendo **"Baixar aplicativo"**.

Na página, à **esquerda** fica a versão **Windows** e à **direita** os botões
separados de **App Store** e **Google Play**.

A versão Windows é **exclusiva do administrador**, porque o aplicativo desktop
é a ferramenta de administração do escritório. Quem não é administrador vê no
lugar dela um aviso explicando isso. A restrição é aplicada **no servidor**
(`GET /api/download/windows` responde 401 para visitantes e clientes), não
apenas escondendo o botão.

---

## Relatório financeiro por mês

Na aba **Financeiro** há um seletor de **mês** e um botão **Exportar
relatório**. Um mês pode estar:

- **em aberto** — os valores acompanham os lançamentos em tempo real;
- **fechado** — os totais foram congelados e não mudam mais, mesmo que
  alguém altere um lançamento antigo.

### Fechamento automático

Todo dia **1º às 00:00** (ajustável) o sistema guarda uma cópia do mês
anterior em `fechamentos_financeiros` e recomeça o acompanhamento. O
agendador roda a cada minuto, só age uma vez por competência e recupera meses
atrasados — então o servidor pode ficar dias desligado sem perder um
fechamento.

Para mudar a data/hora: **Financeiro → "Agendamento do fechamento"**. O dia
vai até 28 para existir em todos os meses. A mesma tela ajusta quando as
contas automáticas são consultadas (padrão: dia 1º às 06:00).

### Exportação

| Opção | O que baixa |
|---|---|
| Último mês fechado | a competência anterior |
| Mês selecionado | o mês escolhido no seletor |
| Últimos 12 meses | um ano completo |
| Período de X a Y | o intervalo escolhido |

Formatos: **Excel (.xlsx)**, **CSV** e **JSON**. O arquivo traz duas abas —
*Resumo* (recebido, a receber, vencido, despesas e resultado por mês) e
*Lançamentos* (honorários e despesas, linha a linha).

## Contas automáticas (fatura do fornecedor)

Em **Escritório → "Buscar conta no portal do fornecedor"** cadastra-se o
acesso do titular ao portal da concessionária. Se o cadastro tiver **mais de
uma unidade consumidora**, o sistema lista todas e pergunta qual usar.

A partir daí, no dia/hora agendados, a fatura é buscada sozinha, lançada em
*Contas a pagar* e o cartão do fornecedor mostra o **status**. Clicando em
**Pagar fatura** aparece o **QR code do PIX** — em um quadro escuro de cantos
arredondados, com os módulos desenhados sob medida — junto do **código de
barras**, ambos com botão de copiar. Dá para marcar a fatura como paga sem
sair do painel.

> **A integração com a CELESC está SIMULADA.** O arquivo
> `server/lib/fornecedores/celesc.js` devolve dados coerentes (unidades,
> valor, vencimento, linha digitável e um PIX com CRC válido) para exercitar
> todo o fluxo, mas **não acessa o portal real**. Para ligar de verdade,
> basta trocar `listarUnidades` e `buscarFatura` nesse arquivo — nada mais no
> sistema precisa mudar. Antes disso, verifique se a concessionária oferece
> API ou débito automático, e os termos de uso do portal.
>
> A senha do portal é gravada cifrada (AES-256-GCM). **Defina a variável
> `JS_SEGREDO_CHAVE`** antes de usar credenciais reais — sem ela, a chave é a
> de desenvolvimento e não protege nada.

## Exportar clientes

Na página **Clientes**, logo abaixo da lista, há um botão apenas de texto
(sem fundo): **"Exportar clientes ▾"**. Ele abre as opções de formato:

- **CSV** (`.csv`) — separado por `;`, com BOM, abre direto no Excel brasileiro
- **Excel** (`.xlsx`)
- **JSON** (`.json`)
- **Banco de dados SQLite** (`.db`) — arquivo SQLite real, para importar em
  outro sistema

---

## Aplicativo desktop (offline-first)

```bash
npm run icon            # gera build/icon.ico (só quando a marca mudar)
npm run electron        # roda o app
npm run dist            # gera o executável em dist/
```

O app sobe **o mesmo servidor e o mesmo banco** dentro da própria máquina, em
uma porta local. Ele funciona **100% sem internet**.

### É um aplicativo administrativo

O desktop é a ferramenta de administração do escritório, e isso é aplicado de
verdade — não só escondendo botões:

- ele **abre direto na tela de acesso** (`acesso.html`); não existe site
  institucional dentro do aplicativo;
- a tela se apresenta como **"Acesso administrativo"**, com a marca ampliada e
  centralizada, e aceita **usuário, OAB ou CPF do advogado**;
- o servidor embutido roda com `adminOnly: true`: um CPF de cliente **nem é
  reconhecido** na verificação, e um POST de login de cliente responde
  **403**.

### Ícone

`build/icon.ico` é o monograma **JS** sozinho — sem fundo e sem o arco
dourado, com transparência real. É gerado por `npm run icon`, que renderiza a
marca com o próprio Electron e monta o `.ico` (16 a 256 px). Ele é embutido no
executável e usado na janela e na barra de tarefas.

### Iniciar com o sistema

Na tela de acesso do aplicativo há um **toggle discreto** — *"Abrir o painel
automaticamente ao ligar o computador"*. Ele grava/remove a entrada de
inicialização do Windows via `app.setLoginItemSettings`. No build portátil o
registro aponta para `PORTABLE_EXECUTABLE_FILE` (o `.exe` de verdade), e não
para a cópia temporária que o Windows cria ao executá-lo.

### Sincronização

O app **procura a conexão sozinho** — a cada 10 s enquanto está offline e a
cada 60 s quando conectado. No rodapé há apenas um indicador discreto:
**Offline**, **Online**, *N para enviar* ou *conflitos*. Clicando nele abre-se
o detalhamento.

Toda alteração feita sem conexão é registrada em um diário (`change_log`) com
uma descrição em português. **Ao sair do estado offline**, se algo foi alterado
na máquina, aparece sozinho um pop-up perguntando o que fazer:

- **Manter os dados deste computador** — envia o que foi feito offline;
- **Usar os dados do servidor** — descarta as alterações locais e baixa a
  versão da web (com confirmação, porque é destrutivo);
- **Ver o que mudou neste computador** — abre a lista item a item;
- **Decidir depois** — fecha sem sincronizar.

Se **os dois lados** alteraram o mesmo registro, nada é sobrescrito em
silêncio: o sistema mostra as duas versões lado a lado e pergunta qual manter.

### Atualização do banco existente

O banco do app fica em `%APPDATA%\painel-jorge-silva-advocacia\local.sqlite` e
**sobrevive às atualizações**. Como `CREATE TABLE IF NOT EXISTS` não acrescenta
colunas novas, `server/db/index.js` roda uma **migração automática** ao abrir:
adiciona as colunas que faltam, promove o admin mais antigo a titular se não
houver nenhum e atribui a ele os clientes sem responsável.

Para testar a sincronização localmente, suba a instância que representa a web:

```bash
npm run cloud-sim       # http://localhost:4179 (banco data/cloud.sqlite)
```

O endereço do servidor de sincronização fica em `config.json` →
`syncServerUrl`. Basta trocar para o endereço real quando o sistema for
publicado.

---

## Estrutura

```
server/
  app.js              cria o Express + banco (usado pela web e pelo desktop)
  start.js            servidor web
  db/
    schema.sql        estrutura das tabelas
    index.js          wrapper do SQLite (sql.js/WASM)
    seed.js           dados fictícios
  lib/
    password.js       hash scrypt
    session.js        sessões por cookie
    sync-client.js    motor de sincronização (lado desktop)
    sync-tables.js    tabelas que participam da sincronização
  routes/             auth, clients, processos, financeiro, me, dashboard,
                      export, sync
public/               site, portal, painel (HTML/CSS/JS sem build)
electron/             main.js (processo principal) + preload.js (ponte segura)
scripts/
  make-icon.js        gera build/icon.ico (monograma JS, sem fundo)
  start-cloud-sim.js  instância que representa a web, para testar sync
build/                icon.ico / icon.png da marca
data/                 bancos SQLite (não versionados)
```

O banco é **SQLite de verdade** (`data/local.sqlite`) — pode ser aberto em
qualquer ferramenta de SQLite.

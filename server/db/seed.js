// Populates the local database with fictitious data so the app is usable
// immediately: one admin (the lawyer) and six sample clients with
// processes, movements and fees. Safe to re-run - it wipes and rebuilds.

const path = require('path');
const { createDatabase } = require('./index');
const { hashPassword } = require('../lib/password');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'local.sqlite');

async function seed(dbPath = DEFAULT_DB_PATH) {
  const db = createDatabase(dbPath);
  await db.open();

  db.exec(`
    DELETE FROM sessions; DELETE FROM change_log; DELETE FROM contas_escritorio;
    DELETE FROM honorarios; DELETE FROM andamentos; DELETE FROM processos;
    DELETE FROM clients; DELETE FROM admins;
  `);

  // O administrador entra por três caminhos: usuário, número da OAB ou o
  // próprio CPF. Todos levam ao mesmo painel.
  db.run(
    `INSERT INTO admins (username, nome, oab, documento, telefone, email, cargo, password_hash) VALUES (?, ?, ?, ?, ?, ?, 'titular', ?)`,
    ['jorge', 'Jorge Silva', 'OAB/SP 123.456', '15350946056', '(11) 4000-0000', 'jorge@jorgesilva.adv.br', hashPassword('admin123')]
  );

  // Equipe do escritório. A Beatriz já tem senha (dá para entrar e testar);
  // o Rafael está em primeiro acesso, como fica um colaborador recém-cadastrado.
  db.run(
    `INSERT INTO admins (username, nome, oab, documento, telefone, email, cargo, password_hash) VALUES (?, ?, ?, ?, ?, ?, 'secretaria', ?)`,
    ['beatriz', 'Beatriz Nunes', null, '39447856005', '(11) 4000-0001', 'beatriz@jorgesilva.adv.br', hashPassword('colab123')]
  );
  db.run(
    `INSERT INTO admins (username, nome, oab, documento, telefone, email, cargo, password_hash) VALUES (?, ?, ?, ?, ?, ?, 'estagiario', NULL)`,
    ['rafael', 'Rafael Moreira', 'OAB/SP 654.321', '68169461070', '(11) 4000-0002', 'rafael@jorgesilva.adv.br']
  );

  const clients = [
    {
      tipo: 'PF', nome: 'Maria Oliveira Ramos', documento: '11144477735', username: 'maria.oliveira', owner: 1,
      documento_secundario: '00.000.000-0 SSP/SP', data_ref: '14/03/1988', extra: 'Analista',
      email: 'maria.oliveira@email.com', telefone: '(11) 90000-0000', cep: '01310-000',
      logradouro: 'Rua Augusta', numero: '900', cidade_uf: 'São Paulo / SP',
      senha: '123456', ultimo_contato: 'hoje',
      processos: [
        {
          area: 'Trabalhista', titulo: 'Ação Trabalhista', numero: '0012345-67.2025.8.26.0100',
          vara: '3ª Vara do Trabalho de São Paulo', status: 'em_andamento',
          distribuido_em: '14/07/2025', proxima_audiencia: '2026-08-22',
          andamentos: [
            ['2026-08-09', 'Petição juntada', 'Manifestação sobre os documentos apresentados pela parte contrária.'],
            ['2026-08-02', 'Despacho publicado', 'Designada audiência de instrução para 22/08/2026, às 14h00.'],
            ['2026-07-21', 'Contestação apresentada', 'Defesa protocolada pela parte reclamada.'],
            ['2026-07-16', 'Citação cumprida', 'Parte reclamada citada por via postal.'],
            ['2025-07-14', 'Processo distribuído', '3ª Vara do Trabalho de São Paulo.']
          ]
        },
        {
          area: 'Civil', titulo: 'Inventário', numero: '0000088-21.2024.8.26.0100',
          vara: '2ª Vara de Família e Sucessões', status: 'finalizado',
          distribuido_em: '10/01/2024', proxima_audiencia: null, andamentos: []
        }
      ],
      honorarios: [
        ['Honorários · julho/2026', 120000, '2026-07-28', 'atraso'],
        ['Honorários · agosto/2026', 120000, '2026-09-15', 'a_vencer'],
        ['Honorários · setembro/2026', 120000, '2026-10-15', 'a_vencer'],
        ['Honorários · junho/2026', 120000, '2026-06-15', 'pago'],
        ['Custas processuais', 42000, '2026-06-02', 'pago']
      ]
    },
    {
      tipo: 'PF', nome: 'João Santos', documento: '52998224725', username: 'joao.santos', owner: 1,
      documento_secundario: '11.111.111-1 SSP/SP', data_ref: '02/11/1979', extra: 'Comerciante',
      email: 'joao.santos@email.com', telefone: '(11) 91111-1111', cep: '04005-000',
      logradouro: 'Av. Brigadeiro Luís Antônio', numero: '1200', cidade_uf: 'São Paulo / SP',
      senha: '123456', ultimo_contato: '02/08',
      processos: [{
        area: 'Civil', titulo: 'Cobrança de Dívida', numero: '0007711-22.2025.8.26.0100',
        vara: '5ª Vara Cível Central', status: 'em_andamento', distribuido_em: '02/03/2025',
        proxima_audiencia: null,
        andamentos: [['2026-07-30', 'Réplica apresentada', 'Manifestação sobre a contestação.']]
      }],
      honorarios: [['Honorários · julho', 120000, '2026-07-28', 'atraso']]
    },
    {
      tipo: 'PJ', nome: 'Construtora Alvorada Ltda.', documento: '11222333000181', username: 'alvorada', owner: 1,
      documento_secundario: 'isento', data_ref: '12/05/2010', extra: 'Carlos Menezes (sócio-administrador)',
      email: 'contato@alvordaconstrutora.com.br', telefone: '(11) 3222-4400', cep: '04543-000',
      logradouro: 'Av. Faria Lima', numero: '2100', cidade_uf: 'São Paulo / SP',
      senha: '123456', ultimo_contato: 'ontem',
      processos: [
        { area: 'Empresarial', titulo: 'Recuperação de Crédito', numero: '0007788-32.2025.8.26.0100', vara: '1ª Vara Empresarial', status: 'em_andamento', distribuido_em: '20/02/2025', proxima_audiencia: null, andamentos: [['2026-08-08', 'Despacho publicado', 'Prazo de 15 dias para manifestação.']] },
        { area: 'Empresarial', titulo: 'Revisão Contratual', numero: '0002244-90.2024.8.26.0100', vara: '2ª Vara Empresarial', status: 'em_andamento', distribuido_em: '05/06/2024', proxima_audiencia: null, andamentos: [] },
        { area: 'Trabalhista', titulo: 'Reclamação Trabalhista (defesa)', numero: '0009900-11.2025.5.02.0000', vara: '10ª Vara do Trabalho', status: 'em_andamento', distribuido_em: '18/01/2025', proxima_audiencia: null, andamentos: [] },
        { area: 'Civil', titulo: 'Ação Indenizatória (defesa)', numero: '0003321-44.2023.8.26.0100', vara: '8ª Vara Cível', status: 'finalizado', distribuido_em: '11/02/2023', proxima_audiencia: null, andamentos: [] }
      ],
      honorarios: [['Honorários · agosto', 350000, '2026-08-15', 'a_vencer']]
    },
    {
      tipo: 'PF', nome: 'Ana Paula Costa', documento: '93541134780', username: 'ana.costa', owner: 2,
      documento_secundario: '22.222.222-2 SSP/SP', data_ref: '25/09/1990', extra: 'Professora',
      email: 'ana.costa@email.com', telefone: '(11) 92222-2222', cep: '05407-000',
      logradouro: 'Rua Teodoro Sampaio', numero: '450', cidade_uf: 'São Paulo / SP',
      senha: '123456', ultimo_contato: '05/08',
      processos: [{
        area: 'Civil', titulo: 'Ação de Despejo', numero: '0004521-09.2026.8.26.0100', vara: '4ª Vara Cível',
        status: 'em_andamento', distribuido_em: '01/04/2026', proxima_audiencia: '2026-08-22',
        andamentos: [['2026-08-01', 'Audiência de instrução designada', 'Audiência marcada para 22/08/2026.']]
      }],
      honorarios: [['Honorários · agosto', 90000, '2026-08-20', 'avisado']]
    },
    {
      tipo: 'PF', nome: 'Carlos Menezes', documento: '12345678909', username: 'carlos.menezes', owner: 2,
      documento_secundario: '33.333.333-3 SSP/SP', data_ref: '30/01/1975', extra: 'Empresário',
      email: 'carlos.menezes@email.com', telefone: '(11) 93333-3333', cep: '01452-000',
      logradouro: 'Av. Rebouças', numero: '3000', cidade_uf: 'São Paulo / SP',
      senha: null, ultimo_contato: '28/07',
      processos: [
        { area: 'Trabalhista', titulo: 'Ação Trabalhista', numero: '0009911-45.2025.5.02.0000', vara: '7ª Vara do Trabalho', status: 'finalizado', distribuido_em: '10/03/2025', proxima_audiencia: null, andamentos: [['2026-08-07', 'Sentença publicada', 'Sentença procedente em parte.']] },
        { area: 'Civil', titulo: 'Ação Indenizatória', numero: '0001199-88.2024.8.26.0100', vara: '6ª Vara Cível', status: 'em_andamento', distribuido_em: '22/08/2024', proxima_audiencia: null, andamentos: [] },
        { area: 'Empresarial', titulo: 'Constituição Societária', numero: '—', vara: '—', status: 'finalizado', distribuido_em: '01/02/2023', proxima_audiencia: null, andamentos: [] }
      ],
      honorarios: [['Honorários · julho', 150000, '2026-07-15', 'pago']]
    },
    {
      // --- Os dois cadastros abaixo compartilham DE PROPÓSITO o mesmo nome
      // de usuário ("rpereira"). Ao digitar esse usuário o sistema não sabe
      // quem é: quem identifica o cadastro é a senha. ---
      tipo: 'PF', nome: 'Ricardo Alves Pereira', documento: '30720056077', username: 'rpereira', owner: 3,
      documento_secundario: '44.444.444-4 SSP/SP', data_ref: '17/06/1983', extra: 'Engenheiro',
      email: 'ricardo.pereira@email.com', telefone: '(11) 96666-1111', cep: '02011-000',
      logradouro: 'Rua Voluntários da Pátria', numero: '520', cidade_uf: 'São Paulo / SP',
      senha: 'ricardo123', ultimo_contato: '10/08',
      processos: [{
        area: 'Civil', titulo: 'Ação de Cobrança', numero: '0005566-77.2026.8.26.0100', vara: '9ª Vara Cível',
        status: 'em_andamento', distribuido_em: '12/05/2026', proxima_audiencia: null,
        andamentos: [['2026-08-05', 'Petição inicial protocolada', 'Distribuída para a 9ª Vara Cível.']]
      }],
      honorarios: [['Honorários · agosto', 110000, '2026-08-25', 'a_vencer']]
    },
    {
      tipo: 'PF', nome: 'Renata Pereira Alves', documento: '87748248011', username: 'rpereira', owner: 3,
      documento_secundario: '55.555.555-5 SSP/SP', data_ref: '03/12/1991', extra: 'Arquiteta',
      email: 'renata.alves@email.com', telefone: '(11) 97777-2222', cep: '05416-000',
      logradouro: 'Rua Harmonia', numero: '145', cidade_uf: 'São Paulo / SP',
      senha: 'renata123', ultimo_contato: '11/08',
      processos: [{
        area: 'Trabalhista', titulo: 'Reclamação Trabalhista', numero: '0008822-31.2026.5.02.0000', vara: '4ª Vara do Trabalho',
        status: 'em_andamento', distribuido_em: '20/06/2026', proxima_audiencia: '2026-09-10',
        andamentos: [['2026-08-03', 'Audiência inicial designada', 'Audiência marcada para 10/09/2026.']]
      }],
      honorarios: [['Honorários · agosto', 95000, '2026-08-18', 'a_vencer']]
    },
    {
      tipo: 'PJ', nome: 'Padaria Estrela ME', documento: '45723174000110', username: 'padariaestrela', owner: 3,
      documento_secundario: 'isento', data_ref: '08/08/2016', extra: 'Roberto Alves (responsável)',
      email: 'contato@padariaestrela.com.br', telefone: '(11) 3444-5500', cep: '03310-000',
      logradouro: 'Rua da Mooca', numero: '1800', cidade_uf: 'São Paulo / SP',
      senha: '123456', ultimo_contato: '21/07',
      processos: [
        { area: 'Empresarial', titulo: 'Regularização Fiscal', numero: '0000456-12.2025.8.26.0100', vara: 'Vara da Fazenda Pública', status: 'em_andamento', distribuido_em: '15/05/2025', proxima_audiencia: null, andamentos: [] },
        { area: 'Trabalhista', titulo: 'Consultoria Preventiva', numero: '—', vara: '—', status: 'em_andamento', distribuido_em: '01/01/2025', proxima_audiencia: null, andamentos: [] }
      ],
      honorarios: [['Custas processuais', 42000, '2026-07-02', 'pago']]
    }
  ];

  for (const c of clients) {
    const clientId = db.insert(
      `INSERT INTO clients (tipo, nome, username, documento, documento_secundario, data_ref, extra, email, telefone, cep, logradouro, numero, cidade_uf, password_hash, owner_id, ultimo_contato)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.tipo, c.nome, c.username || null, c.documento, c.documento_secundario, c.data_ref, c.extra, c.email, c.telefone, c.cep, c.logradouro, c.numero, c.cidade_uf, c.senha ? hashPassword(c.senha) : null, c.owner || 1, c.ultimo_contato]
    );

    for (const p of c.processos) {
      const processoId = db.insert(
        `INSERT INTO processos (client_id, area, titulo, numero, vara, status, distribuido_em, proxima_audiencia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, p.area, p.titulo, p.numero, p.vara, p.status, p.distribuido_em, p.proxima_audiencia]
      );
      for (const [data, titulo, descricao] of p.andamentos) {
        db.run(`INSERT INTO andamentos (processo_id, data, titulo, descricao) VALUES (?, ?, ?, ?)`, [processoId, data, titulo, descricao]);
      }
    }

    for (const [referencia, valor, vencimento, status] of c.honorarios) {
      db.run(
        `INSERT INTO honorarios (client_id, referencia, valor_centavos, vencimento, status) VALUES (?, ?, ?, ?, ?)`,
        [clientId, referencia, valor, vencimento, status]
      );
    }
  }

  const contas = [
    ['Aluguel da sala', 'Ocupação', '2026-09-05', 450000, 'a_pagar'],
    ['Salários da equipe', 'Pessoal', '2026-09-05', 330000, 'vence_em_breve'],
    ['Energia elétrica', 'Utilidades', '2026-09-10', 78000, 'a_pagar'],
    ['Internet e telefone', 'Utilidades', '2026-09-12', 32000, 'a_pagar'],
    ['Contador', 'Serviços', '2026-08-15', 90000, 'pago'],
    ['Anuidade OAB', 'Institucional', '2027-03-31', 110000, 'programado']
  ];
  for (const [nome, categoria, vencimento, valor, status] of contas) {
    db.run(`INSERT INTO contas_escritorio (nome, categoria, vencimento, valor_centavos, status) VALUES (?, ?, ?, ?, ?)`, [nome, categoria, vencimento, valor, status]);
  }

  // Uma permissão de exemplo: a Beatriz autorizou o Rafael a ver os processos
  // dela. O contrário NÃO existe — para dar de teste os dois estados na tela.
  db.run('INSERT INTO colaborador_permissoes (owner_id, grantee_id) VALUES (2, 3)');

  db.exec(`DELETE FROM change_log;`); // seed data is the agreed baseline, not a pending change
  db.persistNow();

  console.log('Banco de dados semeado com sucesso em', dbPath);
  console.log('');
  console.log('=== CREDENCIAIS DE TESTE ===');
  console.log('');
  console.log('ADMINISTRADOR / TITULAR (senha "admin123") — os três acessos levam ao painel:');
  console.log('  · usuário .... jorge');
  console.log('  · OAB ........ OAB/SP 123.456  (ou apenas 123456)');
  console.log('  · CPF ........ 153.509.460-56');
  console.log('');
  console.log('COLABORADORES (equipe do escritório — mesmo painel):');
  console.log('  · Beatriz Nunes (secretária) ... beatriz | 394.478.560-05 | senha "colab123"');
  console.log('  · Rafael Moreira (estagiário) .. rafael  | 681.694.610-70 | primeiro acesso, cria a senha');
  console.log('');
  console.log('CARTEIRA DE CADA UM (quem enxerga o quê):');
  console.log('  · Jorge (titular) . vê TUDO, sem precisar de autorização');
  console.log('  · Beatriz ......... Ana Paula Costa, Carlos Menezes');
  console.log('  · Rafael .......... Ricardo, Renata, Padaria Estrela');
  console.log('  → Beatriz autorizou Rafael: ele também vê os clientes dela.');
  console.log('  → Rafael NÃO autorizou Beatriz: para ela, o nome dele aparece apagado.');
  console.log('');
  console.log('CLIENTES — entram por usuário, CPF/CNPJ ou telefone:');
  console.log('  · Maria Oliveira ... maria.oliveira | 111.444.777-35 | (11) 90000-0000 | senha "123456"');
  console.log('  · João Santos ...... joao.santos    | 529.982.247-25 | (11) 91111-1111 | senha "123456"');
  console.log('  · Ana Paula Costa .. ana.costa      | 935.411.347-80 | (11) 92222-2222 | senha "123456"');
  console.log('  · Construtora ...... alvorada       | 11.222.333/0001-81              | senha "123456"');
  console.log('  · Padaria Estrela .. padariaestrela | 45.723.174/0001-10              | senha "123456"');
  console.log('');
  console.log('PRIMEIRO ACESSO (ainda sem senha — o cliente cria a dele):');
  console.log('  · Carlos Menezes ... carlos.menezes | 123.456.789-09');
  console.log('');
  console.log('USUÁRIO REPETIDO — os dois usam "rpereira"; a SENHA diz quem é:');
  console.log('  · Ricardo Alves Pereira .. rpereira | 307.200.560-77 | senha "ricardo123"');
  console.log('  · Renata Pereira Alves ... rpereira | 877.482.480-11 | senha "renata123"');
  return db;
}

if (require.main === module) {
  const custom = process.argv[2];
  seed(custom ? path.resolve(custom) : undefined).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed, DEFAULT_DB_PATH };

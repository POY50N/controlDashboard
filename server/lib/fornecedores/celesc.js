// Adaptador do portal da CELESC.
//
// ⚠ ESTADO ATUAL: SIMULADO. As funções abaixo NÃO acessam o site da Celesc.
// Elas devolvem dados coerentes (unidades consumidoras, valor, vencimento,
// linha digitável e código PIX) para que todo o resto — agendamento,
// armazenamento, tela, cópia do código, QR — funcione de ponta a ponta.
//
// PARA LIGAR DE VERDADE, troque o corpo de `listarUnidades` e `buscarFatura`
// por chamadas reais. É o único arquivo que precisa mudar; o restante do
// sistema não sabe de onde a fatura veio. Ao fazer isso, atente para:
//   · o portal exige login e pode ter captcha/2FA — verifique se há API ou
//     convênio de débito automático antes de recorrer a scraping;
//   · confira os termos de uso do portal;
//   · a senha do portal fica cifrada no banco (ver lib/segredos.js), mas
//     ainda é um segredo de terceiro sob sua guarda.

const crypto = require('crypto');

const FORNECEDOR = {
  chave: 'celesc',
  nome: 'CELESC',
  rotulo: 'Fatura de luz · CELESC',
  categoria: 'Utilidades',
  portal: 'https://agenciaweb.celesc.com.br/',
  campoLogin: 'CPF/CNPJ do titular',
  simulado: true
};

// Números estáveis por login: o mesmo cadastro devolve sempre as mesmas UCs.
function semente(texto) {
  return parseInt(crypto.createHash('sha256').update(String(texto)).digest('hex').slice(0, 8), 16);
}

async function listarUnidades(credenciais) {
  const s = semente(credenciais.login);
  const quantas = (s % 3) + 1; // 1 a 3 unidades, para exercitar a escolha
  return Array.from({ length: quantas }, (_, i) => {
    const numero = String(4000000 + ((s + i * 7919) % 3999999));
    return {
      numero,
      endereco: [
        'Av. Paulista, 1000 — conj. 142',
        'Rua Augusta, 900 — sala 3',
        'Av. Faria Lima, 2100 — 12º andar'
      ][i % 3],
      titular: credenciais.titular || 'Jorge Silva Advocacia'
    };
  });
}

// Linha digitável de boleto de concessionária (48 dígitos, formatada).
function linhaDigitavel(s) {
  const bloco = (n) => String((s * (n + 3)) % 100000000000).padStart(11, '0').slice(0, 11);
  return [0, 1, 2, 3].map((n) => `${bloco(n)}-${(s + n) % 10}`).join(' ');
}

// Payload PIX no formato "copia e cola" (EMV). Estrutura real, dados fictícios.
function pixCopiaECola(valorCentavos, uc) {
  const campo = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
  const valor = (valorCentavos / 100).toFixed(2);
  const chave = `celesc+${uc}@exemplo.com.br`;
  const mai = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  let payload =
    campo('00', '01') +
    campo('26', mai) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor) +
    campo('58', 'BR') +
    campo('59', 'CELESC DISTRIBUICAO') +
    campo('60', 'FLORIANOPOLIS') +
    campo('62', campo('05', `UC${uc}`));
  payload += '6304';
  // CRC16/CCITT-FALSE, como manda o padrão do BR Code
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return payload + crc.toString(16).toUpperCase().padStart(4, '0');
}

async function buscarFatura(credenciais, unidadeConsumidora, referencia = new Date()) {
  const s = semente(credenciais.login + ':' + unidadeConsumidora);
  const competencia = `${referencia.getFullYear()}-${String(referencia.getMonth() + 1).padStart(2, '0')}`;
  const valorCentavos = 18000 + (s % 47000); // algo entre R$ 180 e R$ 650
  const dia = 10 + (s % 12);
  const venc = new Date(referencia.getFullYear(), referencia.getMonth(), dia);
  const vencimento = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, '0')}-${String(venc.getDate()).padStart(2, '0')}`;

  return {
    fornecedor: FORNECEDOR.chave,
    competencia,
    vencimento,
    valorCentavos,
    linhaDigitavel: linhaDigitavel(s),
    codigoPix: pixCopiaECola(valorCentavos, unidadeConsumidora),
    simulado: true
  };
}

module.exports = { FORNECEDOR, listarUnidades, buscarFatura };

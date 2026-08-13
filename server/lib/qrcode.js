// Converte o "copia e cola" do PIX em uma matriz de pontos.
//
// Só a codificação vem da biblioteca; o desenho é feito na tela, para que o
// QR combine com o resto do painel (cantos arredondados, tom escuro) em vez
// de ser uma imagem quadrada genérica.
//
// Nível de correção M: aguenta ~15% da área danificada, o que dá margem para
// arredondar os módulos sem comprometer a leitura.

const QRCode = require('qrcode');

function matrizQr(texto, nivel = 'M') {
  if (!texto) throw new Error('Nada para codificar.');
  const { modules } = QRCode.create(String(texto), { errorCorrectionLevel: nivel });
  const size = modules.size;
  const linhas = [];
  for (let y = 0; y < size; y++) {
    const linha = [];
    for (let x = 0; x < size; x++) linha.push(modules.data[y * size + x] ? 1 : 0);
    linhas.push(linha);
  }
  return { tamanho: size, modulos: linhas, nivel };
}

module.exports = { matrizQr };

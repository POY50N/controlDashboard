// Cifra as senhas dos portais de terceiros (ex.: Celesc) antes de gravar.
//
// A chave vem de JS_SEGREDO_CHAVE (variável de ambiente). Sem ela, o sistema
// deriva uma chave do arquivo de configuração apenas para desenvolvimento —
// o que NÃO protege contra quem tem acesso ao repositório. Em produção,
// defina a variável.

const crypto = require('crypto');

function chave() {
  const bruta = process.env.JS_SEGREDO_CHAVE || 'desenvolvimento-jorge-silva-advocacia';
  return crypto.createHash('sha256').update(bruta).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join('.');
}

function decifrar(guardado) {
  const [iv, tag, dados] = String(guardado || '').split('.');
  if (!iv || !tag || !dados) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
  } catch (err) {
    return null;
  }
}

const usandoChavePadrao = () => !process.env.JS_SEGREDO_CHAVE;

module.exports = { cifrar, decifrar, usandoChavePadrao };

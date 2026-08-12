// Gera build/icon.ico com o monograma "JS" do escritório: apenas as letras,
// fundo transparente, sem o círculo/arco dourado.
//
// Renderiza com o próprio Electron (offscreen, janela transparente) e monta
// o container .ico à mão - assim não é preciso nenhuma dependência gráfica.
//
//   npm run icon

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const OUT_DIR = path.join(__dirname, '..', 'build');
const RENDER_SIZE = 512;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}
  .wrap{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}
  span{
    font:600 62vh Georgia,'Times New Roman',serif;
    line-height:1;letter-spacing:-.03em;
    background:linear-gradient(135deg,#e6cd83 0%,#caa24e 26%,#8a6a2b 54%,#caa24e 74%,#e6cd83 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
</style></head><body><div class="wrap"><span>JS</span></div></body></html>`;

// ICO = cabeçalho + uma entrada por tamanho + os PNGs concatenados.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reservado
  header.writeUInt16LE(1, 2);              // tipo: 1 = ícone
  header.writeUInt16LE(images.length, 4);  // quantidade

  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;

  images.forEach((img, i) => {
    const e = i * 16;
    const dim = img.size >= 256 ? 0 : img.size; // 0 significa 256
    entries.writeUInt8(dim, e + 0);
    entries.writeUInt8(dim, e + 1);
    entries.writeUInt8(0, e + 2);   // paleta
    entries.writeUInt8(0, e + 3);   // reservado
    entries.writeUInt16LE(1, e + 4);   // planos
    entries.writeUInt16LE(32, e + 6);  // bits por pixel
    entries.writeUInt32LE(img.buf.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += img.buf.length;
  });

  return Buffer.concat([header, entries, ...images.map((i) => i.buf)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false }
  });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML));
  await new Promise((r) => setTimeout(r, 700)); // deixa a fonte assentar

  const shot = await win.webContents.capturePage();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const master = shot.resize({ width: 256, height: 256, quality: 'best' });
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), master.toPNG());

  const images = ICO_SIZES.map((size) => ({
    size,
    buf: shot.resize({ width: size, height: size, quality: 'best' }).toPNG()
  }));

  const ico = buildIco(images);
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), ico);

  console.log(`icon.ico gerado (${ICO_SIZES.join(', ')} px) — ${(ico.length / 1024).toFixed(1)} KB`);
  console.log('icon.png gerado (256 px)');
  app.exit(0);
});

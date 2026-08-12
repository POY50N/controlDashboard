const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { createApp } = require('../server/app');
const { createSyncClient } = require('../server/lib/sync-client');
const { seed } = require('../server/db/seed');

const isPackaged = app.isPackaged;
const configPath = isPackaged
  ? path.join(process.resourcesPath, 'config.json')
  : path.join(__dirname, '..', 'config.json');

const config = JSON.parse(fs.readFileSync(
  fs.existsSync(configPath) ? configPath : path.join(__dirname, '..', 'config.json'), 'utf8'
));

// In a packaged app the database lives in the user's own data folder so it
// survives updates and is writable; in dev it stays inside the repo.
const dbPath = isPackaged
  ? path.join(app.getPath('userData'), 'local.sqlite')
  : path.join(__dirname, '..', config.dbPath);

let mainWindow = null;
let syncClient = null;
let serverDb = null;

async function ensureDatabase() {
  if (!fs.existsSync(dbPath)) {
    await seed(dbPath);
  }
}

async function startServer() {
  // adminOnly: the desktop build is the office's administration tool.
  const { app: expressApp, db } = await createApp({ dbPath, syncKey: config.syncKey, adminOnly: true });
  serverDb = db;
  return new Promise((resolve) => {
    const server = expressApp.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function broadcastSyncState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:state', state);
  }
}

// Monograma "JS" sem fundo e sem o arco - usado na janela e na barra de tarefas.
const ICON_PATH = isPackaged
  ? path.join(process.resourcesPath, 'icon.ico')
  : path.join(__dirname, '..', 'build', 'icon.ico');

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f4f0e7',
    title: 'Painel Jorge Silva Advocacia',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  // The app always opens on the access screen - there is no institutional
  // site inside the desktop build.
  mainWindow.loadURL(`http://127.0.0.1:${port}/acesso.html`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  await ensureDatabase();
  const port = await startServer();

  syncClient = createSyncClient({
    db: serverDb,
    serverUrl: config.syncServerUrl,
    syncKey: config.syncKey,
    onStateChange: broadcastSyncState
  });

  createWindow(port);

  // O app procura a conexão sozinho, sem o usuário pedir. Enquanto está
  // offline tenta com mais frequência, para perceber a volta da internet
  // rapidamente; conectado, espaça as verificações.
  const INTERVALO_ONLINE = config.syncIntervalMs || 60000;
  const INTERVALO_OFFLINE = 10000;

  setTimeout(() => syncClient.checkConnection(), 1200);
  (function vigiarConexao() {
    const estava = syncClient.getState().online;
    setTimeout(async () => {
      await syncClient.checkConnection();
      vigiarConexao();
    }, estava ? INTERVALO_ONLINE : INTERVALO_OFFLINE);
  })();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (serverDb) serverDb.persistNow();
  if (process.platform !== 'darwin') app.quit();
});

// --- Iniciar com o sistema -------------------------------------------------
// No build portátil o executável real é apontado por PORTABLE_EXECUTABLE_FILE;
// process.execPath aponta para a cópia temporária e não serve para o registro.
function autoLaunchTarget() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function readAutoLaunch() {
  try {
    return !!app.getLoginItemSettings({ path: autoLaunchTarget() }).openAtLogin;
  } catch (err) {
    return false;
  }
}

ipcMain.handle('autolaunch:get', () => ({ enabled: readAutoLaunch(), supported: process.platform === 'win32' || process.platform === 'darwin' }));

ipcMain.handle('autolaunch:set', (_e, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, path: autoLaunchTarget(), args: [] });
  } catch (err) {
    return { enabled: readAutoLaunch(), error: err.message };
  }
  return { enabled: readAutoLaunch() };
});

ipcMain.handle('sync:getState', () => syncClient.getState());
ipcMain.handle('sync:getPending', () => syncClient.getPendingChanges());
ipcMain.handle('sync:run', (_e, opts) => syncClient.sync(opts || {}));
ipcMain.handle('sync:check', () => syncClient.checkConnection());
ipcMain.handle('sync:resolve', (_e, { table, rowId, choice }) => syncClient.resolveConflict(table, rowId, choice));
ipcMain.handle('sync:discardLocal', () => syncClient.discardLocal());
ipcMain.handle('app:isDesktop', () => true);

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  getState: () => ipcRenderer.invoke('sync:getState'),
  getPending: () => ipcRenderer.invoke('sync:getPending'),
  sync: (opts) => ipcRenderer.invoke('sync:run', opts),
  check: () => ipcRenderer.invoke('sync:check'),
  resolve: (table, rowId, choice) => ipcRenderer.invoke('sync:resolve', { table, rowId, choice }),
  discardLocal: () => ipcRenderer.invoke('sync:discardLocal'),
  getAutoLaunch: () => ipcRenderer.invoke('autolaunch:get'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('autolaunch:set', enabled),
  onStateChange: (cb) => {
    ipcRenderer.on('sync:state', (_e, state) => cb(state));
  }
});

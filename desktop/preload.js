const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    listPorts: () => ipcRenderer.invoke('serial:list'),
    sendFrame: (portPath, frameArray) =>
        ipcRenderer.invoke('serial:sendFrame', portPath, frameArray),
    sendCommand: (portPath, command) =>
        ipcRenderer.invoke('serial:command', portPath, command),

    pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
    pickStockImage: () => ipcRenderer.invoke('dialog:pickStockImage'),

    customFirmwareAvailable: () => ipcRenderer.invoke('firmware:customAvailable'),
    flashCustom: (portPath) => ipcRenderer.invoke('firmware:flashCustom', portPath),
    flashStock: (portPath, binPath) =>
        ipcRenderer.invoke('firmware:flashStock', portPath, binPath),

    onFirmwareLog: (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('firmware:log', listener);
        return () => ipcRenderer.removeListener('firmware:log', listener);
    },
});

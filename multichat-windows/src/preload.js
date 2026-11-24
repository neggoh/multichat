'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('multichat', {
  models: () => ipcRenderer.invoke('models:list'),
  chat: (request) => ipcRenderer.invoke('chat:stream', request),
  abort: (requestId) => ipcRenderer.invoke('chat:abort', requestId),
  onDelta: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('chat:delta', handler)
    return () => ipcRenderer.removeListener('chat:delta', handler)
  },
  keyStatus: () => ipcRenderer.invoke('key:status'),
  saveKey: (key) => ipcRenderer.invoke('key:save', key),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  processFiles: (paths) => ipcRenderer.invoke('files:process', paths),
})
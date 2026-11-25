'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('multichat', {
  models: (options) => ipcRenderer.invoke('models:list', options),
  settings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (next) => ipcRenderer.invoke('settings:save', next),
  startLocal: (model) => ipcRenderer.invoke('local:start', model),
  stopLocal: () => ipcRenderer.invoke('local:stop'),
  gpu: () => ipcRenderer.invoke('local:gpu'),
  paths: () => ipcRenderer.invoke('app:paths'),
  lessons: () => ipcRenderer.invoke('lessons:list'),
  addLesson: (payload) => ipcRenderer.invoke('lessons:add', payload),
  removeLesson: (id) => ipcRenderer.invoke('lessons:remove', id),
  matchLessons: (text) => ipcRenderer.invoke('lessons:match', text),
  exportLessons: () => ipcRenderer.invoke('lessons:export'),
  exportProject: (payload) => ipcRenderer.invoke('project:export', payload),
  servePreview: (payload) => ipcRenderer.invoke('preview:serve', payload),
  openPreview: () => ipcRenderer.invoke('preview:open'),
  openPath: (target) => ipcRenderer.invoke('app:openPath', target),
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
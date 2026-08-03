import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('zirtola', {
  // overlay
  onOverlayInit: (cb: (init: unknown) => void) => subscribe('overlay:init', cb),
  overlayReady: () => ipcRenderer.send('overlay:ready'),
  copyImage: (dataUrl: string) => ipcRenderer.invoke('image:copy', dataUrl),
  saveImage: (dataUrl: string, format: 'png' | 'jpg') =>
    ipcRenderer.invoke('image:save', dataUrl, format),
  cancelCapture: () => ipcRenderer.send('capture:cancel'),
  startRecording: (displayId: number, region: unknown) =>
    ipcRenderer.send('record:start', displayId, region),

  // recorder control window
  onRecorderInit: (cb: (init: unknown) => void) => subscribe('recorder:init', cb),
  saveRecording: (buffer: ArrayBuffer) => ipcRenderer.invoke('record:save', buffer),
  recordingClosed: () => ipcRenderer.send('record:closed'),

  // settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  pickFolder: () => ipcRenderer.invoke('settings:pick-folder'),
  validateHotkey: (accelerator: string, kind: string) =>
    ipcRenderer.invoke('settings:validate-hotkey', accelerator, kind),
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onUpdateStatus: (cb: (result: unknown) => void) => subscribe('update:status', cb),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  quitAndInstall: () => ipcRenderer.send('update:install'),
});

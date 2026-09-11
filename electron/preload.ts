import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close')
  },
  pet: {
    create: () => ipcRenderer.invoke('create-pet-window'),
    close: () => ipcRenderer.invoke('close-pet-window'),
    setOpacity: (opacity: number) => ipcRenderer.invoke('set-pet-opacity', opacity),
    setIgnoreMouse: (ignore: boolean) => ipcRenderer.invoke('set-pet-ignore-mouse', ignore)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI


import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('phantom', {
  checkHealth: (): Promise<{ status: 'connected' | 'offline' | 'model-not-found' }> =>
    ipcRenderer.invoke('ghost:health'),
  askGhost: (payload: {
    question: string
    code: string
    language?: string
  }): Promise<string> => ipcRenderer.invoke('ghost:ask', payload),
})

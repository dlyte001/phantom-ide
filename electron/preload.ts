
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('phantom', {
  askGhost: (payload: {
    question: string
    code: string
    language?: string
  }): Promise<string> => ipcRenderer.invoke('ghost:ask', payload),
})

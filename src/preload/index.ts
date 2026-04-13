import { contextBridge, ipcRenderer } from "electron"

const bridge = {
  send(channel: string, payload?: unknown): void {
    ipcRenderer.send(channel, payload)
  },

  on(channel: string, callback: (payload: unknown) => void): () => void {
    const listener = (_event: unknown, payload: unknown) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  invoke(channel: string, payload?: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channel, payload)
  },
}

contextBridge.exposeInMainWorld("bridge", bridge)

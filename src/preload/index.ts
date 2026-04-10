import type { OpenmnkApi } from "../shared/ipc-contract"
import { contextBridge, ipcRenderer } from "electron"
import { electronAPI } from "@electron-toolkit/preload"

function subscribe<T>(
  channel: string,
  callback: (payload: T) => void
): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const openmnk: OpenmnkApi = {
  query: {
    init: () => ipcRenderer.invoke("query:init"),
    start: (input) => ipcRenderer.invoke("query:start", input),
    cancel: () => ipcRenderer.invoke("query:cancel"),
    onEvent: (listener) => subscribe("query:event", listener),
  },
  dictation: {
    transcribe: (input) => ipcRenderer.invoke("dictation:transcribe", input),
    onCommand: (listener) => subscribe("dictation:command", listener),
  },
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI)
    contextBridge.exposeInMainWorld("openmnk", openmnk)
  } catch (error) {
    console.error(error)
  }
} else {
  Object.assign(
    window as unknown as Window & {
      electron: typeof electronAPI
      openmnk: OpenmnkApi
    },
    {
      electron: electronAPI,
      openmnk,
    }
  )
}

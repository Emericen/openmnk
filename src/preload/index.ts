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
    respondToPendingAction: (input) =>
      ipcRenderer.invoke("query:respondToPendingAction", input),
    onEvent: (listener) => subscribe("query:event", listener),
  },
  dictation: {
    transcribe: (input) => ipcRenderer.invoke("dictation:transcribe", input),
    onCommand: (listener) => subscribe("dictation:command", listener),
  },
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
  },
  launcher: {
    resize: (input) => ipcRenderer.send("launcher:resize", input),
    submit: (input) => ipcRenderer.send("launcher:submit", input),
    dismiss: () => ipcRenderer.send("launcher:dismiss"),
    onEvent: (listener) => subscribe("launcher:event", listener),
  },
  overlay: {
    resize: (input) => ipcRenderer.send("overlay:resize", input),
    onState: (listener) => subscribe("overlay:state", listener),
  },
  capture: {
    onCommand: (listener) => subscribe("capture:command", listener),
    sendFrame: (input) => ipcRenderer.send("capture:frame", input),
    sendRecording: (input) => ipcRenderer.send("capture:recording", input),
    sendReady: () => ipcRenderer.send("capture:ready"),
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

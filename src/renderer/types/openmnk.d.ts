import type { Bridge } from "../../types/ipc"

declare global {
  interface Window {
    bridge: Bridge
  }
}

export {}

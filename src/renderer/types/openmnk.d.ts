import type { Bridge } from "../../shared/ipc-contract"

declare global {
  interface Window {
    bridge: Bridge
  }
}

export {}

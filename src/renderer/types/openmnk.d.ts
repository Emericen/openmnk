import type { OpenmnkApi } from "../../shared/ipc-contract"

declare global {
  interface Window {
    openmnk: OpenmnkApi
  }
}

export {}

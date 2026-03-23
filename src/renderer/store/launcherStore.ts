import { create } from "zustand"

export type DictationState = "idle" | "listening" | "transcribing"

type LauncherStoreState = {
  query: string
  dictationState: DictationState
  setQuery: (query: string) => void
  clearQuery: () => void
  setDictationState: (dictationState: DictationState) => void
}

export const useLauncherStore = create<LauncherStoreState>((set) => ({
  query: "",
  dictationState: "idle",
  setQuery: (query) => set({ query: String(query || "") }),
  clearQuery: () => set({ query: "" }),
  setDictationState: (dictationState) => set({ dictationState }),
}))

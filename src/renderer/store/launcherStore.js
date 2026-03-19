import { create } from "zustand"

export const useLauncherStore = create((set) => ({
  query: "",
  dictationState: "idle",
  setQuery: (query) => set({ query: String(query || "") }),
  clearQuery: () => set({ query: "" }),
  setDictationState: (dictationState) => set({ dictationState })
}))

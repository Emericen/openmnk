import { create } from "zustand"
import type { OverlayState } from "../../shared/ipc-contract"

type OverlayPayload = Partial<{
  type: OverlayState["type"]
  text: string
  acceptKeyLabel: string
  stopKeyLabel: string
  acceptHintText: string
  stopHintText: string
}>

type OverlayStoreState = {
  type: OverlayState["type"]
  text: string
  acceptKeyLabel: string
  stopKeyLabel: string
  acceptHintText: string
  stopHintText: string
  setPayload: (payload: OverlayPayload) => void
}

export const useOverlayStore = create<OverlayStoreState>((set) => ({
  type: "message",
  text: "",
  acceptKeyLabel: "",
  stopKeyLabel: "",
  acceptHintText: "",
  stopHintText: "",
  setPayload: (payload = {}) =>
    set({
      type: payload.type || "message",
      text: String(payload.text || ""),
      acceptKeyLabel: String(payload.acceptKeyLabel || ""),
      stopKeyLabel: String(payload.stopKeyLabel || ""),
      acceptHintText: String(payload.acceptHintText || ""),
      stopHintText: String(payload.stopHintText || ""),
    }),
}))

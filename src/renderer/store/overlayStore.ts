import { create } from "zustand"
import type { OverlayState } from "../../shared/ipc-contract"

type OverlayPayload = Partial<{
  type: OverlayState["type"]
  text: string
  acceptKeyLabel: string
  denyKeyLabel: string
  acceptHintText: string
  denyHintText: string
}>

type OverlayStoreState = {
  type: OverlayState["type"]
  text: string
  acceptKeyLabel: string
  denyKeyLabel: string
  acceptHintText: string
  denyHintText: string
  setPayload: (payload: OverlayPayload) => void
}

export const useOverlayStore = create<OverlayStoreState>((set) => ({
  type: "message",
  text: "",
  acceptKeyLabel: "",
  denyKeyLabel: "",
  acceptHintText: "",
  denyHintText: "",
  setPayload: (payload = {}) =>
    set({
      type: payload.type || "message",
      text: String(payload.text || ""),
      acceptKeyLabel: String(payload.acceptKeyLabel || ""),
      denyKeyLabel: String(payload.denyKeyLabel || ""),
      acceptHintText: String(payload.acceptHintText || ""),
      denyHintText: String(payload.denyHintText || ""),
    }),
}))

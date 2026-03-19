import { create } from "zustand"

export const useOverlayStore = create((set) => ({
  type: "message",
  text: "",
  acceptKeyLabel: "",
  denyKeyLabel: "",
  acceptHintText: "",
  denyHintText: "",
  setPayload: (payload = {}) =>
    set({
      type: String(payload.type || "message"),
      text: String(payload.text || ""),
      acceptKeyLabel: String(payload.acceptKeyLabel || ""),
      denyKeyLabel: String(payload.denyKeyLabel || ""),
      acceptHintText: String(payload.acceptHintText || ""),
      denyHintText: String(payload.denyHintText || "")
    })
}))

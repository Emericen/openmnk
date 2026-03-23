import {
  addAssistantText,
  addSystemText,
  createChatWindow,
  hideChatWindow,
  isChatWindowVisible,
  markChatWindowReady,
  sendChatEvent,
  sendDictationEvent,
  showChatWindow,
  toggleChatWindow,
} from "./chat"
import {
  createOverlayWindow,
  hideOverlayWindow,
  showOverlayWindow,
} from "./overlay"
import { createCaptureWindow } from "./capture"
import { getOverlayShortcutHints } from "../listener/trigger"
import type {
  DictationCommand,
  OverlayState,
  QueryEvent,
} from "../../shared/ipc-contract"

type OverlayPayload = OverlayState & {
  acceptKeyLabel?: string
  denyKeyLabel?: string
}

export function createWindowsSurface() {
  const overlay = {
    showMessage(text = "Done."): void {
      showOverlayWindow({ type: "message", text: String(text || "Done.") })
      setTimeout(() => hideOverlayWindow(), 1400)
    },
    showActionPrompt(promptText: string): void {
      showOverlayWindow({
        type: "action",
        text: promptText,
        ...getOverlayShortcutHints("action"),
      } as OverlayPayload)
    },
    showLoading(text = "Working..."): void {
      showOverlayWindow({
        type: "loading",
        text: String(text || "Working..."),
        ...getOverlayShortcutHints("loading"),
      } as OverlayPayload)
    },
    showIgnored(text = "Action ignored."): void {
      showOverlayWindow({
        type: "message",
        text: String(text || "Action ignored."),
      })
      setTimeout(() => hideOverlayWindow(), 1200)
    },
    showCompleted() {
      showOverlayWindow({ type: "message", text: "Action complete." })
      setTimeout(() => hideOverlayWindow(), 1500)
    },
    showFailure(text: string): void {
      showOverlayWindow({
        type: "failure",
        text: String(text || "Action failed."),
      })
    },
    hide() {
      hideOverlayWindow()
    },
    hideAfter(ms = 800): void {
      setTimeout(() => hideOverlayWindow(), ms)
    },
  }

  const chat = {
    isVisible() {
      return isChatWindowVisible()
    },
    show() {
      showChatWindow()
    },
    hide() {
      hideChatWindow()
    },
    toggle() {
      toggleChatWindow()
    },
    markReady() {
      markChatWindowReady()
    },
    send(payload: QueryEvent): void {
      sendChatEvent(payload)
    },
    sendDictation(payload: DictationCommand): void {
      sendDictationEvent(payload)
    },
    addSystemText(text: string, extra?: Partial<QueryEvent>): void {
      addSystemText(text, extra)
    },
    addAssistantText(text: string, extra?: Partial<QueryEvent>): void {
      addAssistantText(text, extra)
    },
  }

  let captureScreenshot: ((
    x?: number,
    y?: number,
    highlightType?: "spotlight" | "crosshair"
  ) => Promise<string | null>) | null = null

  async function initWindows() {
    createOverlayWindow()
    hideOverlayWindow()
    createChatWindow()

    try {
      const captureHandle = await createCaptureWindow()
      captureScreenshot = captureHandle.captureScreenshot
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.warn("Capture window init failed, using fallback:", msg)
    }
  }

  return {
    initWindows,
    overlay,
    chat,
    getCaptureScreenshot: () => captureScreenshot,
  }
}

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
  toggleChatWindow
} from "./chat.js"
import {
  createOverlayWindow,
  hideOverlayWindow,
  showOverlayWindow
} from "./overlay.js"
import { getOverlayShortcutHints } from "../listener/trigger.js"

export function createWindowsSurface() {
  const overlay = {
    showMessage(text = "Done.") {
      showOverlayWindow({ type: "message", text: String(text || "Done.") })
      setTimeout(() => hideOverlayWindow(), 1400)
    },
    showActionPrompt(promptText) {
      showOverlayWindow({
        type: "action",
        text: promptText,
        ...getOverlayShortcutHints("action")
      })
    },
    showLoading(text = "Working...") {
      showOverlayWindow({
        type: "loading",
        text: String(text || "Working..."),
        ...getOverlayShortcutHints("loading")
      })
    },
    showIgnored(text = "Action ignored.") {
      showOverlayWindow({
        type: "message",
        text: String(text || "Action ignored.")
      })
      setTimeout(() => hideOverlayWindow(), 1200)
    },
    showCompleted() {
      showOverlayWindow({ type: "message", text: "Action complete." })
      setTimeout(() => hideOverlayWindow(), 1500)
    },
    showFailure(text) {
      showOverlayWindow({
        type: "failure",
        text: String(text || "Action failed.")
      })
    },
    hide() {
      hideOverlayWindow()
    },
    hideAfter(ms = 800) {
      setTimeout(() => hideOverlayWindow(), ms)
    }
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
    send(payload) {
      sendChatEvent(payload)
    },
    sendDictation(payload) {
      sendDictationEvent(payload)
    },
    addSystemText(text, extra) {
      addSystemText(text, extra)
    },
    addAssistantText(text, extra) {
      addAssistantText(text, extra)
    }
  }

  function initWindows() {
    createOverlayWindow()
    hideOverlayWindow()
    createChatWindow()
  }

  return {
    initWindows,
    overlay,
    chat
  }
}

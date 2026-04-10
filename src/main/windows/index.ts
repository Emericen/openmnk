import {
  createChatWindow,
  hideChatWindow,
  isChatWindowVisible,
  markChatWindowReady,
  sendChatEvent,
  sendDictationEvent,
  showChatWindow,
  toggleChatWindow,
} from "./chat"
import type { DictationCommand, QueryEvent } from "../../shared/ipc-contract"

export function createWindowsSurface() {
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
  }

  async function initWindows() {
    createChatWindow()
  }

  return {
    initWindows,
    chat,
  }
}

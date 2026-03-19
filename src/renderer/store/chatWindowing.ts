import type { ChatMessage } from "../../shared/ipc-contract"

export const INITIAL_WINDOW_SIZE = 100
export const LOAD_OLDER_CHUNK_SIZE = 50

export type ChatWindowState = {
  visibleMessages: ChatMessage[]
  visibleStart: number
  hasOlderMessages: boolean
}

export function getWindowSlice(
  messages: ChatMessage[],
  visibleStart: number
): ChatWindowState {
  const safeStart = Math.max(0, Math.min(visibleStart, messages.length))
  return {
    visibleMessages: messages.slice(safeStart),
    visibleStart: safeStart,
    hasOlderMessages: safeStart > 0,
  }
}

export function getLatestWindow(messages: ChatMessage[]): ChatWindowState {
  const visibleStart = Math.max(0, messages.length - INITIAL_WINDOW_SIZE)
  return getWindowSlice(messages, visibleStart)
}

export function loadOlderWindow(
  messages: ChatMessage[],
  visibleStart: number
): ChatWindowState {
  const nextStart = Math.max(0, visibleStart - LOAD_OLDER_CHUNK_SIZE)
  return getWindowSlice(messages, nextStart)
}

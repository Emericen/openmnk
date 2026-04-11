import { create } from "zustand"
import type {
  ChatMessage,
  SessionEvent,
  SkillSummary,
} from "../../shared/ipc-contract"
import {
  getLatestWindow,
  getWindowSlice,
  loadOlderWindow,
} from "./chatWindowing"

let msgCounter = 0
let subscribed = false

export const UIPhase = Object.freeze({
  READY: "ready",
  SUBMITTING: "submitting",
  DICTATING: "dictating",
  TRANSCRIBING: "transcribing",
} as const)

export const UIEvent = Object.freeze({
  SUBMIT_TEXT: "submit_text",
  REQUEST_DONE: "request_done",
  REQUEST_ERROR: "request_error",
  START_DICTATION: "start_dictation",
  STOP_DICTATION: "stop_dictation",
  TRANSCRIBE_DONE: "transcribe_done",
  TRANSCRIBE_ERROR: "transcribe_error",
  CANCEL: "cancel",
} as const)

type UIPhaseValue = (typeof UIPhase)[keyof typeof UIPhase]
type UIEventValue = (typeof UIEvent)[keyof typeof UIEvent]

type ChatRuntimeStoreState = {
  messages: ChatMessage[]
  visibleMessages: ChatMessage[]
  visibleStart: number
  hasOlderMessages: boolean
  skills: SkillSummary[]
  uiPhase: UIPhaseValue
  isHydrated: boolean
  dispatchUIEvent: (event: UIEventValue) => boolean
  initBridge: () => void
  loadOlderMessages: () => void
  sendMessage: (text: string) => void
  startDictationPhase: () => void
  startTranscribingPhase: () => void
  finishTranscribingPhase: (input?: { success?: boolean }) => void
  cancelUIPhase: () => void
}

const UI_TRANSITIONS: Record<
  UIPhaseValue,
  Partial<Record<UIEventValue, UIPhaseValue>>
> = Object.freeze({
  [UIPhase.READY]: {
    [UIEvent.SUBMIT_TEXT]: UIPhase.SUBMITTING,
    [UIEvent.START_DICTATION]: UIPhase.DICTATING,
  },
  [UIPhase.SUBMITTING]: {
    [UIEvent.REQUEST_DONE]: UIPhase.READY,
    [UIEvent.REQUEST_ERROR]: UIPhase.READY,
    [UIEvent.CANCEL]: UIPhase.READY,
  },
  [UIPhase.DICTATING]: {
    [UIEvent.STOP_DICTATION]: UIPhase.TRANSCRIBING,
    [UIEvent.CANCEL]: UIPhase.READY,
  },
  [UIPhase.TRANSCRIBING]: {
    [UIEvent.TRANSCRIBE_DONE]: UIPhase.READY,
    [UIEvent.TRANSCRIBE_ERROR]: UIPhase.READY,
    [UIEvent.CANCEL]: UIPhase.READY,
  },
})

function nextUIPhase(from: UIPhaseValue, event: UIEventValue): UIPhaseValue | null {
  return UI_TRANSITIONS[from]?.[event] || null
}

function nextId(): string {
  return `msg_${++msgCounter}`
}

function appendMsg(
  messages: ChatMessage[],
  role: "user" | "assistant" | "system",
  text: string
): ChatMessage[] {
  const content = String(text || "").trim()
  if (!content) return messages
  return [...messages, { id: nextId(), role, content: [{ type: "text", text: content }] }]
}

export const useChatRuntimeStore = create<ChatRuntimeStoreState>((set, get) => {
  function updateMessages(
    updater: (messages: ChatMessage[]) => ChatMessage[],
    keepWindow = false
  ) {
    set((state) => {
      const next = updater(state.messages)
      const win = keepWindow
        ? getWindowSlice(next, state.visibleStart)
        : getLatestWindow(next)
      return {
        messages: next,
        visibleMessages: win.visibleMessages,
        visibleStart: win.visibleStart,
        hasOlderMessages: win.hasOlderMessages,
      }
    })
  }

  function transitionUI(event: UIEventValue): boolean {
    const to = nextUIPhase(get().uiPhase, event)
    if (!to) return false
    set({ uiPhase: to })
    return true
  }

  return {
    messages: [],
    visibleMessages: [],
    visibleStart: 0,
    hasOlderMessages: false,
    skills: [],
    uiPhase: UIPhase.READY,
    isHydrated: false,

    dispatchUIEvent: transitionUI,

    initBridge: () => {
      if (subscribed) return
      subscribed = true

      // Subscribe to session events
      window.openmnk.session.onEvent((event: SessionEvent) => {
        if (event.type === "thought") {
          updateMessages((msgs) => appendMsg(msgs, "system", event.text))
        }
        if (event.type === "command") {
          const label = event.output
            ? `${event.description}\n\`${event.cmd}\`\n→ ${event.output.slice(0, 200)}`
            : `${event.description}: \`${event.cmd}\``
          updateMessages((msgs) => appendMsg(msgs, "system", label))
        }
        if (event.type === "response") {
          updateMessages((msgs) => appendMsg(msgs, "assistant", event.text))
        }
        if (event.type === "error") {
          updateMessages((msgs) => appendMsg(msgs, "system", `Error: ${event.message}`))
          transitionUI(UIEvent.REQUEST_ERROR)
        }
        if (event.type === "done") {
          transitionUI(UIEvent.REQUEST_DONE)
        }
      })

      window.openmnk.ready()
      set({ isHydrated: true })
    },

    loadOlderMessages: () => {
      set((state) => {
        if (!state.hasOlderMessages) return {}
        const win = loadOlderWindow(state.messages, state.visibleStart)
        return {
          visibleMessages: win.visibleMessages,
          visibleStart: win.visibleStart,
          hasOlderMessages: win.hasOlderMessages,
        }
      })
    },

    sendMessage: (text: string) => {
      const trimmed = String(text || "").trim()
      if (!trimmed) return
      if (!transitionUI(UIEvent.SUBMIT_TEXT)) return

      updateMessages((msgs) => appendMsg(msgs, "user", trimmed))
      window.openmnk.session.send({ type: "start", text: trimmed })
    },

    startDictationPhase: () => transitionUI(UIEvent.START_DICTATION),
    startTranscribingPhase: () => transitionUI(UIEvent.STOP_DICTATION),
    finishTranscribingPhase: ({ success = true } = {}) =>
      transitionUI(success ? UIEvent.TRANSCRIBE_DONE : UIEvent.TRANSCRIBE_ERROR),
    cancelUIPhase: () => transitionUI(UIEvent.CANCEL),
  }
})

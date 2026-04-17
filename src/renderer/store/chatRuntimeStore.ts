import { create } from "zustand"
import type { ChatMessage, SessionEvent } from "../../types/ipc"
import { MessageList } from "./messageList"

let subscribed = false
let stopRequested = false

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
  uiPhase: UIPhaseValue
  isHydrated: boolean
  dispatchUIEvent: (event: UIEventValue) => boolean
  initBridge: () => void
  sendMessage: (text: string) => void
  stop: () => void
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

const list = new MessageList()

export const useChatRuntimeStore = create<ChatRuntimeStoreState>((set, get) => {
  function syncMessages() {
    set({ messages: list.getMessages() })
  }

  function transitionUI(event: UIEventValue): boolean {
    const to = nextUIPhase(get().uiPhase, event)
    if (!to) return false
    set({ uiPhase: to })
    return true
  }

  return {
    messages: [],
    uiPhase: UIPhase.READY,
    isHydrated: false,

    dispatchUIEvent: transitionUI,

    initBridge: () => {
      if (subscribed) return
      subscribed = true

      window.bridge.on("session", (raw) => {
        const event = raw as SessionEvent

        if (event.type === "history") {
          if (event.messages.length > 0) {
            list.set(event.messages)
            syncMessages()
          } else {
            transitionUI(UIEvent.SUBMIT_TEXT)
            list.startThinking()
            syncMessages()
            window.bridge.send("session", { type: "start", text: "" })
          }
        }
        if (event.type === "message") {
          list.upsert(event.message)
          syncMessages()
        }
        if (event.type === "stop-requested") {
          stopRequested = true
        }
        if (event.type === "error") {
          list.stopThinking()
          list.upsert({
            id: crypto.randomUUID(),
            role: "system",
            content: [{ type: "text", text: `Error: ${event.text}` }],
          })
          syncMessages()
          transitionUI(UIEvent.REQUEST_ERROR)
        }
        if (event.type === "done") {
          list.stopThinking()
          if (stopRequested) {
            stopRequested = false
            list.upsert({
              id: crypto.randomUUID(),
              role: "system",
              content: [{ type: "text", text: "Conversation interrupted." }],
            })
            syncMessages()
            transitionUI(UIEvent.CANCEL)
          } else {
            syncMessages()
            transitionUI(UIEvent.REQUEST_DONE)
          }
        }
      })

      window.bridge.send("ready")
      set({ isHydrated: true })
    },

    sendMessage: (text: string) => {
      const trimmed = String(text || "").trim()
      if (!trimmed) return
      if (!transitionUI(UIEvent.SUBMIT_TEXT)) return
      list.startThinking()
      syncMessages()
      window.bridge.send("session", { type: "start", text: trimmed })
    },

    stop: () => {
      stopRequested = true
      window.bridge.send("session", { type: "cancel" })
    },

    startDictationPhase: () => transitionUI(UIEvent.START_DICTATION),
    startTranscribingPhase: () => transitionUI(UIEvent.STOP_DICTATION),
    finishTranscribingPhase: ({ success = true } = {}) =>
      transitionUI(success ? UIEvent.TRANSCRIBE_DONE : UIEvent.TRANSCRIBE_ERROR),
    cancelUIPhase: () => transitionUI(UIEvent.CANCEL),
  }
})

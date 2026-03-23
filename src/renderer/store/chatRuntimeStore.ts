import { create } from "zustand"
import type {
  ChatMessage,
  SkillsListResult,
  QueryEvent,
} from "../../shared/ipc-contract"
import {
  getLatestWindow,
  getWindowSlice,
  loadOlderWindow,
} from "./chatWindowing"

let msgCounter = 0
let querySubscribed = false

export const UIPhase = Object.freeze({
  READY: "ready",
  SUBMITTING: "submitting",
  DICTATING: "dictating",
  TRANSCRIBING: "transcribing",
} as const)

export const UIEvent = Object.freeze({
  SUBMIT_TEXT: "submit_text",
  MESSAGE_RECEIVED: "message_received",
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
type SkillSummary = SkillsListResult["skills"][number]

type ChatRuntimeStoreState = {
  currentThreadId: string
  messages: ChatMessage[]
  visibleMessages: ChatMessage[]
  visibleStart: number
  hasOlderMessages: boolean
  skills: SkillSummary[]
  uiPhase: UIPhaseValue
  isHydrated: boolean
  dispatchUIEvent: (event: UIEventValue) => boolean
  initQueryBridge: () => Promise<void>
  loadOlderMessages: () => void
  sendMessage: (
    text: string,
    _options?: Record<string, unknown>
  ) => Promise<void>
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
    [UIEvent.MESSAGE_RECEIVED]: UIPhase.READY,
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

function nextUIPhase(
  from: UIPhaseValue,
  event: UIEventValue
): UIPhaseValue | null {
  return UI_TRANSITIONS[from]?.[event] || null
}

function nextId(): string {
  msgCounter += 1
  return `msg_${msgCounter}`
}

function makeThreadId(): string {
  return globalThis.crypto?.randomUUID?.() || "thread_default"
}

function reseedCounter(messages: ChatMessage[]): void {
  let max = msgCounter
  for (const msg of messages) {
    const match = /^msg_(\d+)$/.exec(String(msg?.id || ""))
    if (match) {
      const n = Number(match[1])
      if (Number.isFinite(n)) max = Math.max(max, n)
    }
  }
  msgCounter = max
}

function appendTextMessage(
  messages: ChatMessage[],
  {
    role = "assistant",
    text = "",
  }: {
    role?: Extract<QueryEvent, { type: "message" }>["role"]
    text?: string
  }
): ChatMessage[] {
  const content = String(text || "").trim()
  if (!content) return messages

  return [
    ...messages,
    {
      id: nextId(),
      role: role === "system" ? "system" : "assistant",
      content: [{ type: "text", text: content }],
    },
  ]
}

export const useChatRuntimeStore = create<ChatRuntimeStoreState>((set, get) => {
  function updateAllMessages(
    updater: (messages: ChatMessage[]) => ChatMessage[],
    { keepWindow = false }: { keepWindow?: boolean } = {}
  ) {
    set((state) => {
      const nextMessages = updater(state.messages)
      const windowState = keepWindow
        ? getWindowSlice(nextMessages, state.visibleStart)
        : getLatestWindow(nextMessages)

      return {
        messages: nextMessages,
        visibleMessages: windowState.visibleMessages,
        visibleStart: windowState.visibleStart,
        hasOlderMessages: windowState.hasOlderMessages,
      }
    })
  }

  function transitionUI(event: UIEventValue): boolean {
    const from = get().uiPhase
    const to = nextUIPhase(from, event)
    if (!to) return false
    set({ uiPhase: to })
    return true
  }

  return {
    currentThreadId: "",
    messages: [],
    visibleMessages: [],
    visibleStart: 0,
    hasOlderMessages: false,
    skills: [],
    uiPhase: UIPhase.READY,
    isHydrated: false,

    dispatchUIEvent: transitionUI,

    initQueryBridge: async () => {
      if (!querySubscribed) {
        window.openmnk.query.onEvent((event) => {
          if (!event?.type) return

          if (event.type === "message") {
            const role = event.role === "system" ? "system" : "assistant"
            updateAllMessages((messages) =>
              appendTextMessage(messages, { role, text: event.text || "" })
            )
            transitionUI(UIEvent.MESSAGE_RECEIVED)
            return
          }

          if (event.type === "error") {
            transitionUI(UIEvent.REQUEST_ERROR)
            return
          }

          if (event.type === "done") {
            transitionUI(UIEvent.REQUEST_DONE)
          }
        })
        querySubscribed = true
      }

      const init = await window.openmnk.query.init()
      const messages = init.success ? init.messages : []
      const windowState = getLatestWindow(messages)
      reseedCounter(messages)

      set({
        currentThreadId: get().currentThreadId || makeThreadId(),
        messages,
        visibleMessages: windowState.visibleMessages,
        visibleStart: windowState.visibleStart,
        hasOlderMessages: windowState.hasOlderMessages,
        uiPhase: UIPhase.READY,
        isHydrated: true,
      })
    },

    loadOlderMessages: () => {
      set((state) => {
        if (!state.hasOlderMessages) return {}
        const windowState = loadOlderWindow(state.messages, state.visibleStart)
        return {
          visibleMessages: windowState.visibleMessages,
          visibleStart: windowState.visibleStart,
          hasOlderMessages: windowState.hasOlderMessages,
        }
      })
    },

    sendMessage: async (text, _options = {}) => {
      const query = String(text || "").trim()
      if (!query) return
      if (!transitionUI(UIEvent.SUBMIT_TEXT)) return

      const currentThreadId = get().currentThreadId || makeThreadId()
      if (!get().currentThreadId) {
        set({ currentThreadId })
      }

      updateAllMessages((messages) => [
        ...messages,
        {
          id: nextId(),
          role: "user",
          content: [{ type: "text", text: query }],
        },
      ])

      try {
        const result = await window.openmnk.query.start({
          query,
          threadId: currentThreadId,
        })

        if (!result.success) {
          const errorText =
            "error" in result ? result.error : "Failed to start query"
          updateAllMessages((messages) =>
            appendTextMessage(messages, {
              role: "system",
              text: String(errorText || "Failed to start query"),
            })
          )
          transitionUI(UIEvent.REQUEST_ERROR)
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error || "Unknown error")

        updateAllMessages((messages) =>
          appendTextMessage(messages, {
            role: "system",
            text: `Error: ${message}`,
          })
        )
        transitionUI(UIEvent.REQUEST_ERROR)
      }
    },

    startDictationPhase: () => {
      transitionUI(UIEvent.START_DICTATION)
    },

    startTranscribingPhase: () => {
      transitionUI(UIEvent.STOP_DICTATION)
    },

    finishTranscribingPhase: ({ success = true } = {}) => {
      transitionUI(success ? UIEvent.TRANSCRIBE_DONE : UIEvent.TRANSCRIBE_ERROR)
    },

    cancelUIPhase: () => {
      transitionUI(UIEvent.CANCEL)
    },
  }
})

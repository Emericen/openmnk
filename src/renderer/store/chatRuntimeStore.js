import { create } from "zustand"

let msgCounter = 0
let querySubscribed = false
const INITIAL_WINDOW_SIZE = 100
const LOAD_OLDER_CHUNK_SIZE = 50

export const UIPhase = Object.freeze({
  READY: "ready",
  SUBMITTING: "submitting",
  DICTATING: "dictating",
  TRANSCRIBING: "transcribing"
})

export const UIEvent = Object.freeze({
  SUBMIT_TEXT: "submit_text",
  MESSAGE_RECEIVED: "message_received",
  REQUEST_DONE: "request_done",
  REQUEST_ERROR: "request_error",
  START_DICTATION: "start_dictation",
  STOP_DICTATION: "stop_dictation",
  TRANSCRIBE_DONE: "transcribe_done",
  TRANSCRIBE_ERROR: "transcribe_error",
  CANCEL: "cancel"
})

const UI_TRANSITIONS = Object.freeze({
  [UIPhase.READY]: {
    [UIEvent.SUBMIT_TEXT]: UIPhase.SUBMITTING,
    [UIEvent.START_DICTATION]: UIPhase.DICTATING
  },
  [UIPhase.SUBMITTING]: {
    [UIEvent.MESSAGE_RECEIVED]: UIPhase.READY,
    [UIEvent.REQUEST_DONE]: UIPhase.READY,
    [UIEvent.REQUEST_ERROR]: UIPhase.READY,
    [UIEvent.CANCEL]: UIPhase.READY
  },
  [UIPhase.DICTATING]: {
    [UIEvent.STOP_DICTATION]: UIPhase.TRANSCRIBING,
    [UIEvent.CANCEL]: UIPhase.READY
  },
  [UIPhase.TRANSCRIBING]: {
    [UIEvent.TRANSCRIBE_DONE]: UIPhase.READY,
    [UIEvent.TRANSCRIBE_ERROR]: UIPhase.READY,
    [UIEvent.CANCEL]: UIPhase.READY
  }
})

function nextUIPhase(from, event) {
  return UI_TRANSITIONS[from]?.[event] || null
}

function nextId() {
  msgCounter += 1
  return `msg_${msgCounter}`
}

function makeThreadId() {
  return globalThis.crypto?.randomUUID?.() || "thread_default"
}

function reseedCounter(messages) {
  let max = msgCounter
  for (const msg of messages || []) {
    const match = /^msg_(\d+)$/.exec(String(msg?.id || ""))
    if (match) {
      const n = Number(match[1])
      if (Number.isFinite(n)) max = Math.max(max, n)
    }
  }
  msgCounter = max
}

function appendTextMessage(messages, { role = "assistant", text = "" }) {
  const content = String(text || "").trim()
  if (!content) return messages

  return [
    ...messages,
    {
      id: nextId(),
      role: role === "system" ? "system" : "assistant",
      content: [{ type: "text", text: content }]
    }
  ]
}

function getWindowSlice(messages, visibleStart) {
  const safeStart = Math.max(0, Math.min(visibleStart, messages.length))
  return {
    visibleMessages: messages.slice(safeStart),
    visibleStart: safeStart,
    hasOlderMessages: safeStart > 0
  }
}

function getLatestWindow(messages) {
  const visibleStart = Math.max(0, messages.length - INITIAL_WINDOW_SIZE)
  return getWindowSlice(messages, visibleStart)
}

function loadOlderWindow(messages, visibleStart) {
  const nextStart = Math.max(0, visibleStart - LOAD_OLDER_CHUNK_SIZE)
  return getWindowSlice(messages, nextStart)
}

function updateAllMessages(set, updater, { keepWindow = false } = {}) {
  set((state) => {
    const nextMessages = updater(state.messages)

    const windowState = keepWindow
      ? getWindowSlice(nextMessages, state.visibleStart)
      : getLatestWindow(nextMessages)

    return {
      messages: nextMessages,
      visibleMessages: windowState.visibleMessages,
      visibleStart: windowState.visibleStart,
      hasOlderMessages: windowState.hasOlderMessages
    }
  })
}

export const useChatRuntimeStore = create((set, get) => {
  function transitionUI(event) {
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
      if (querySubscribed) return
      window.api.on("query", (event) => {
        if (!event || !event.type) return
        if (event.type === "message") {
          const role = event.role === "system" ? "system" : "assistant"
          updateAllMessages(set, (messages) =>
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
      const init = await window.api.invoke("query", { type: "init" })
      const messages = Array.isArray(init?.messages) ? init.messages : []
      const windowState = getLatestWindow(messages)
      reseedCounter(messages)

      set({
        currentThreadId: get().currentThreadId || makeThreadId(),
        messages,
        visibleMessages: windowState.visibleMessages,
        visibleStart: windowState.visibleStart,
        hasOlderMessages: windowState.hasOlderMessages,
        uiPhase: UIPhase.READY,
        isHydrated: true
      })
    },

    loadOlderMessages: () => {
      set((state) => {
        if (!state.hasOlderMessages) return {}
        const windowState = loadOlderWindow(state.messages, state.visibleStart)
        return {
          visibleMessages: windowState.visibleMessages,
          visibleStart: windowState.visibleStart,
          hasOlderMessages: windowState.hasOlderMessages
        }
      })
    },

    sendMessage: async (text, options = {}) => {
      const query = String(text || "").trim()
      if (!query) return

      if (!transitionUI(UIEvent.SUBMIT_TEXT)) return

      const currentThreadId = get().currentThreadId || makeThreadId()
      if (!get().currentThreadId) {
        set({ currentThreadId })
      }

      updateAllMessages(set, (messages) => [
        ...messages,
        {
          id: nextId(),
          role: "user",
          content: [{ type: "text", text: query }]
        }
      ])

      try {
        const result = await window.api.invoke("query", {
          type: "start",
          query,
          threadId: currentThreadId
        })
        if (!result?.success) {
          updateAllMessages(set, (messages) =>
            appendTextMessage(messages, {
              role: "system",
              text: String(result?.error || "Failed to start query")
            })
          )
          transitionUI(UIEvent.REQUEST_ERROR)
        }
      } catch (error) {
        updateAllMessages(set, (messages) =>
          appendTextMessage(messages, {
            role: "system",
            text: `Error: ${String(error.message || error)}`
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
      const event = success ? UIEvent.TRANSCRIBE_DONE : UIEvent.TRANSCRIBE_ERROR
      transitionUI(event)
    },

    cancelUIPhase: () => {
      transitionUI(UIEvent.CANCEL)
    }
  }
})

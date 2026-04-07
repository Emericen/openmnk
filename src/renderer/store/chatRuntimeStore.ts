import { create } from "zustand"
import type {
  ChatMessage,
  SkillsListResult,
  QueryEvent,
  RunCommandMessageMeta,
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
  respondToRunCommand: (messageId: string, approved: boolean) => Promise<void>
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
    detail,
    queryId,
    runCommand,
  }: {
    role?: Extract<QueryEvent, { type: "message" }>["role"]
    text?: string
    detail?: string
    queryId?: string
    runCommand?: RunCommandMessageMeta
  }
): ChatMessage[] {
  const content = String(text || "").trim()
  if (!content) return messages

  const part: ChatMessage["content"][number] = { type: "text", text: content }
  if (detail) {
    ;(part as { type: "text"; text: string; detail?: string }).detail = detail
  }

  return [
    ...messages,
    {
      id: nextId(),
      role: role === "system" ? "system" : "assistant",
      content: [part],
      queryId,
      runCommand,
    },
  ]
}

function appendDetailToLastSystem(
  messages: ChatMessage[],
  detail: string,
  queryId?: string
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role !== "system") continue
    if (queryId && msg?.queryId !== queryId) continue
    const parts = Array.isArray(msg.content) ? msg.content : []
    const textPart = parts.find((p) => p.type === "text") as
      | { type: "text"; text: string; detail?: string }
      | undefined
    if (!textPart) continue

    const existingDetail = textPart.detail || ""
    const newDetail = existingDetail
      ? `${existingDetail}\n${detail}`
      : detail
    const updatedPart = { ...textPart, detail: newDetail }
    const updatedContent = parts.map((p) =>
      p === textPart ? updatedPart : p
    )
    const updated = [...messages]
    updated[i] = { ...msg, content: updatedContent as ChatMessage["content"] }
    return updated
  }
  return messages
}

function updateRunCommandMessage(
  messages: ChatMessage[],
  messageId: string,
  updater: (
    runCommand: RunCommandMessageMeta
  ) => RunCommandMessageMeta
): ChatMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId || !message.runCommand) return message
    return {
      ...message,
      runCommand: updater(message.runCommand),
    }
  })
}

function attachRunCommandToLastSystemMessage(
  messages: ChatMessage[],
  queryId: string,
  runCommand: RunCommandMessageMeta
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role !== "system") continue
    if (message?.queryId !== queryId) continue
    if (message.runCommand) return messages

    const updated = [...messages]
    updated[i] = {
      ...message,
      runCommand,
    }
    return updated
  }
  return messages
}

function markRunCommandsForQuery(
  messages: ChatMessage[],
  queryId: string,
  status: RunCommandMessageMeta["status"],
  allowedStatuses: RunCommandMessageMeta["status"][] = ["pending", "resolving"]
): ChatMessage[] {
  return messages.map((message) => {
    if (message.queryId !== queryId || !message.runCommand) return message
    if (!allowedStatuses.includes(message.runCommand.status)) return message
    return {
      ...message,
      runCommand: { ...message.runCommand, status },
    }
  })
}

export const useChatRuntimeStore = create<ChatRuntimeStoreState>((set, get) => {
  const pendingRunCommands = new Map<string, RunCommandMessageMeta>()

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
      pendingRunCommands.clear()

      if (!querySubscribed) {
        window.openmnk.query.onEvent((event) => {
          if (!event?.type) return

          if (event.type === "tool_call") {
            if (event.toolName === "run_command") {
              const runCommand: RunCommandMessageMeta = {
                callId: event.callId,
                cmd: String(event.args?.cmd || ""),
                description: String(event.args?.description || ""),
                status: "pending",
              }
              pendingRunCommands.set(event.queryId, runCommand)
              updateAllMessages((messages) =>
                attachRunCommandToLastSystemMessage(
                  messages,
                  event.queryId,
                  runCommand
                )
              )
            }
            return
          }

          if (event.type === "message") {
            const role = event.role === "system" ? "system" : "assistant"
            const text = event.text || ""
            const detail = event.detail
            const pendingRunCommand =
              role === "system" && event.queryId
                ? pendingRunCommands.get(event.queryId)
                : undefined

            if (!text.trim() && detail && role === "system") {
              updateAllMessages((messages) => {
                const next = appendDetailToLastSystem(
                  messages,
                  detail,
                  event.queryId
                )
                return event.queryId
                  ? markRunCommandsForQuery(next, event.queryId, "approved")
                  : next
              })
            } else {
              updateAllMessages((messages) => {
                const next = appendTextMessage(messages, {
                  role,
                  text,
                  detail,
                  queryId: event.queryId,
                  runCommand: pendingRunCommand
                    ? pendingRunCommand
                    : undefined,
                })
                return next
              })
            }
            if (pendingRunCommand && event.queryId) {
              pendingRunCommands.delete(event.queryId)
            }
            transitionUI(UIEvent.MESSAGE_RECEIVED)
            return
          }

          if (event.type === "error") {
            transitionUI(UIEvent.REQUEST_ERROR)
            return
          }

          if (event.type === "done") {
            updateAllMessages((messages) =>
              markRunCommandsForQuery(messages, event.queryId, "approved")
            )
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

    respondToRunCommand: async (messageId, approved) => {
      updateAllMessages((messages) =>
        updateRunCommandMessage(messages, messageId, (runCommand) => ({
          ...runCommand,
          status: "resolving",
        }))
      )

      try {
        const result = await window.openmnk.query.respondToPendingAction({
          approved,
        })

        if (!result.success) {
          updateAllMessages((messages) =>
            updateRunCommandMessage(messages, messageId, (runCommand) => ({
              ...runCommand,
              status: "pending",
            }))
          )
          updateAllMessages((messages) =>
            appendTextMessage(messages, {
              role: "system",
              text: `Error: ${result.error || "Failed to resolve action"}`,
            })
          )
          return
        }

        updateAllMessages((messages) =>
          updateRunCommandMessage(messages, messageId, (runCommand) => ({
            ...runCommand,
            status: approved ? "approved" : "rejected",
          }))
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error || "Unknown error")

        updateAllMessages((messages) =>
          updateRunCommandMessage(messages, messageId, (runCommand) => ({
            ...runCommand,
            status: "pending",
          }))
        )
        updateAllMessages((messages) =>
          appendTextMessage(messages, {
            role: "system",
            text: `Error: ${message}`,
          })
        )
      }
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

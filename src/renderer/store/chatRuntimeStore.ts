import { create } from "zustand"
import type { ChatMessage, SessionEvent, SkillSummary } from "../../shared/ipc-contract"
import { getLatestWindow, getWindowSlice, loadOlderWindow } from "./chatWindowing"

let msgCounter = 0
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

      window.bridge.on("session", (raw) => {
        const event = raw as SessionEvent

        // Remove "Thinking..." placeholder before adding new content
        const removeThinking = (msgs: ChatMessage[]) => {
          const last = msgs[msgs.length - 1]
          if (last?.role === "system" && last.content[0]?.type === "text" && last.content[0].text === "Thinking...") {
            return msgs.slice(0, -1)
          }
          return msgs
        }

        if (event.type === "thought") {
          updateMessages((msgs) => appendMsg(removeThinking(msgs), "system", event.text))
        }
        if (event.type === "command") {
          updateMessages((msgs) => {
            const cleaned = removeThinking(msgs)
            // If output is present, update the last matching command message
            if (event.output !== undefined) {
              for (let i = cleaned.length - 1; i >= 0; i--) {
                const part = cleaned[i]?.content[0]
                if (
                  part?.type === "command" &&
                  part.cmd === event.cmd &&
                  part.output === undefined
                ) {
                  const updated = [...cleaned]
                  updated[i] = {
                    ...cleaned[i],
                    content: [{
                      type: "command" as const,
                      description: event.description,
                      cmd: event.cmd,
                      output: event.output,
                    }],
                  }
                  return updated
                }
              }
            }
            // No output yet (loading) or no match found — create new
            return [
              ...cleaned,
              {
                id: nextId(),
                role: "system" as const,
                content: [{
                  type: "command" as const,
                  description: event.description,
                  cmd: event.cmd,
                  output: event.output,
                }],
              },
            ]
          })
        }
        if (event.type === "response") {
          updateMessages((msgs) => appendMsg(removeThinking(msgs), "assistant", event.text))
        }
        if (event.type === "error") {
          updateMessages((msgs) => appendMsg(removeThinking(msgs), "system", `Error: ${event.message}`))
          transitionUI(UIEvent.REQUEST_ERROR)
        }
        if (event.type === "done") {
          if (stopRequested) {
            stopRequested = false
            updateMessages((msgs) =>
              appendMsg(removeThinking(msgs), "system", "Conversation interrupted.")
            )
            transitionUI(UIEvent.CANCEL)
          } else {
            updateMessages(removeThinking)
            transitionUI(UIEvent.REQUEST_DONE)
          }
        }
      })

      window.bridge.send("ready")
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

      // Detect /skill-name pattern
      const skillMatch = /^\/(\S+)(.*)$/.exec(trimmed)
      if (skillMatch) {
        const skill = skillMatch[1]
        const rest = (skillMatch[2] || "").trim()
        window.bridge.send("session", {
          type: "start",
          text: rest || `Run the ${skill} skill`,
          skill,
        })
      } else {
        window.bridge.send("session", { type: "start", text: trimmed })
      }
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

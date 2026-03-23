import type { QueryEventValue, QueryStateValue } from "./queryState"

export type QueryEmitPayload =
  | {
      type: "message"
      role: "assistant" | "system"
      queryId: string
      text: string
    }
  | {
      type: "tool_call"
      queryId: string
      callId: string
      toolName: string
      args: Record<string, unknown>
    }
  | { type: "done"; queryId: string; outcome: "completed" | "failed" }
  | { type: "error"; queryId: string; code: string; message: string }
  | {
      type: "text"
      role: "assistant" | "system"
      queryId?: string
      text?: string
    }

export type QueryEmit = (payload: QueryEmitPayload) => void
export type ForwardableQueryEvent = Exclude<QueryEmitPayload, { type: "text" }>

export type HistoryEntry = {
  role: "user" | "assistant"
  content: string
}

export type HistoryChangeHandler = (payload: {
  history: HistoryEntry[]
}) => void

export type ToolArgs = Record<string, unknown>

export type ToolCallRecord = {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type AssistantMessage = {
  role: "assistant"
  content: string
  tool_calls?: ToolCallRecord[]
}

export type ToolMessage = {
  role: "tool"
  tool_call_id: string
  content: string
}

export type UserMessage =
  | { role: "user"; content: string }
  | { role: "user"; content: MessageContentPart[] }

export type QueryMessage =
  | { role: "system"; content: string }
  | AssistantMessage
  | ToolMessage
  | UserMessage

export type QueryInferenceResult = {
  text: string
  toolCalls: ToolCallRecord[]
  promptTokens: number
}

export type ToolResultStatus = "ok" | "rejected" | "error"

export type QueryClientStartInput = {
  queryId: string
  threadId?: string | null
  query: string
}

export type QueryClientToolResultInput = {
  queryId: string
  status: ToolResultStatus
  output?: Record<string, unknown> | null
}

export type QueryRunState = {
  queryId: string | null
  isRunning: boolean
  pendingCallId: string | null
  history: HistoryEntry[]
}

export type MockToolResultEvent = {
  status: ToolResultStatus
  output?: Record<string, unknown> | null
}

export type MockRun = {
  queryId: string
  threadId: string
  query: string
  stage: number
  pendingToolCalls: Array<{ callId: string }>
}

export type MockStageHandler = (input: {
  run: MockRun
  event?: MockToolResultEvent | null
}) => boolean

export type QueryRunnerKind = "real" | "mock"

export type QueryProcessActiveQuery = {
  queryId: string
  threadId: string
  source: string
  runnerKind: QueryRunnerKind
}

export type PendingAction = {
  query: QueryProcessActiveQuery
  callId: string
  toolName: string
  args: ToolArgs
}

export type QueryProcessPayload = {
  query?: QueryProcessActiveQuery | null
  prompt?: string
  queryPayload?: ForwardableQueryEvent
  outcome?: "completed" | "failed"
  message?: string
  reason?: string
  notifyCancelledText?: boolean
  queryId?: string
  errorText?: string
}

export type QueryProcessController = {
  execute: (
    toolName: string,
    args: ToolArgs
  ) => Promise<Record<string, unknown>>
  getConfirmationPrompt: (
    toolName: string,
    args: ToolArgs
  ) => Promise<string> | string
  preview: (toolName: string, args: ToolArgs) => Promise<unknown>
  requiresApproval: (toolName: string) => boolean
}

export type QueryProcessUi = {
  overlay: {
    showLoading: (text?: string) => void
    showActionPrompt: (promptText: string) => void
    showFailure: (text: string) => void
    hide: () => void
    hideAfter: (ms?: number) => void
  }
  chat: {
    hide: () => void
    show: () => void
    send: (payload: ForwardableQueryEvent) => void
    addSystemText: (
      text: string,
      extra?: Partial<ForwardableQueryEvent>
    ) => void
    addAssistantText: (
      text: string,
      extra?: Partial<ForwardableQueryEvent>
    ) => void
  }
}

export type QueryProcessState = {
  queryState: QueryStateValue
  activeQuery: QueryProcessActiveQuery | null
  pendingAction: PendingAction | null
  interruptionReason: string | null
  loadingTipShownAt: number | null
}

export type RunEffectsInput = {
  event: QueryEventValue
  payload?: QueryProcessPayload
}

export type QueryRunner = {
  start: (input: QueryClientStartInput) => Promise<boolean>
  submitToolResult: (
    input: QueryClientToolResultInput
  ) => Promise<boolean> | boolean
  isRunning: () => boolean
  cancel: (input: { queryId?: string }) => Promise<boolean> | boolean
  clear: () => boolean
  loadHistory: (_history: unknown) => boolean
  getHistory: () => HistoryEntry[]
}

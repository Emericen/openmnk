export type Unsubscribe = () => void

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: ChatMessagePart[]
}

export type QueryEvent =
  | {
      type: "message"
      role: "assistant" | "system"
      text: string
      queryId?: string
    }
  | {
      type: "tool_call"
      queryId: string
      callId: string
      toolName: string
      args: Record<string, unknown>
    }
  | { type: "done"; queryId: string; outcome: "completed" | "failed" }
  | { type: "error"; queryId?: string; code: string; message: string }

export type QueryInitResult =
  | { success: true; messages: ChatMessage[] }
  | { success: false; error: string }

export type QueryStartResult =
  | { success: true; queryId: string }
  | { success: false; error: string }

export type BasicResult = { success: true } | { success: false; error: string }

export type DictationCommand = { type: "start" } | { type: "stop" }

export type DictationTranscribeInput = {
  audio: string
  filename?: string
}

export type DictationTranscribeResult =
  | { success: true; text: string }
  | { success: false; error: string }

export type SkillsListResult = {
  success: true
  skills: Array<{
    id: string
    title: string
    search_text?: string
  }>
}

export type LauncherEvent = { type: "focus" }

export type OverlayState =
  | {
      type: "loading"
      text: string
      stopHintText?: string
    }
  | {
      type: "action"
      text: string
      acceptHintText?: string
      stopHintText?: string
    }
  | { type: "message"; text: string }
  | { type: "failure"; text: string }

export type CaptureCommand =
  | { type: "source-id"; sourceId: string }
  | {
      type: "request-frame"
      highlightPosition?: { x: number; y: number }
      highlightType?: "spotlight" | "crosshair"
    }
  | { type: "stop-capture" }

export type OpenmnkApi = {
  query: {
    init: () => Promise<QueryInitResult>
    start: (input: {
      query: string
      threadId?: string | null
    }) => Promise<QueryStartResult>
    cancel: () => Promise<BasicResult>
    onEvent: (listener: (event: QueryEvent) => void) => Unsubscribe
  }
  dictation: {
    transcribe: (
      input: DictationTranscribeInput
    ) => Promise<DictationTranscribeResult>
    onCommand: (listener: (command: DictationCommand) => void) => Unsubscribe
  }
  skills: {
    list: () => Promise<SkillsListResult>
  }
  launcher: {
    resize: (input: { height: number }) => void
    submit: (input: { query: string }) => void
    dismiss: () => void
    onEvent: (listener: (event: LauncherEvent) => void) => Unsubscribe
  }
  overlay: {
    resize: (input: { height: number }) => void
    onState: (listener: (state: OverlayState) => void) => Unsubscribe
  }
  capture: {
    onCommand: (listener: (command: CaptureCommand) => void) => Unsubscribe
    sendFrame: (input: { data: string | null }) => void
    sendRecording: (input: { data: number[] }) => void
    sendReady: () => void
  }
}

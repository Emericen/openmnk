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
  | { type: "thought"; queryId: string; text: string }
  | {
      type: "command"
      queryId: string
      description: string
      cmd: string
      output?: string
    }
  | { type: "response"; queryId: string; text: string }
  | { type: "done"; queryId: string }
  | { type: "error"; queryId?: string; message: string }

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
}

export type Unsubscribe = () => void

// --- Session events (bidirectional on "session" channel) ---

// Main → Renderer
export type SessionEvent =
  | { type: "thought"; sessionId: string; text: string }
  | {
      type: "command"
      sessionId: string
      description: string
      cmd: string
      output?: string
    }
  | { type: "response"; sessionId: string; text: string }
  | { type: "done"; sessionId: string }
  | { type: "error"; sessionId: string; message: string }

// Renderer → Main
export type SessionCommand =
  | { type: "start"; text: string; skill?: string }
  | { type: "cancel" }

// --- Chat messages (renderer display model) ---

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: ChatMessagePart[]
}

// --- Dictation ---

export type DictationCommand = { type: "start" } | { type: "stop" }

export type DictationTranscribeInput = {
  audio: string
  filename?: string
}

export type DictationTranscribeResult =
  | { success: true; text: string }
  | { success: false; error: string }

// --- Skills ---

export type SkillSummary = {
  id: string
  name: string
  description: string
}

// --- Bridge API exposed to renderer ---

export type OpenmnkApi = {
  ready: () => void
  session: {
    send: (command: SessionCommand) => void
    onEvent: (listener: (event: SessionEvent) => void) => Unsubscribe
  }
  dictation: {
    transcribe: (input: DictationTranscribeInput) => Promise<DictationTranscribeResult>
    onCommand: (listener: (command: DictationCommand) => void) => Unsubscribe
  }
  skills: {
    list: () => Promise<SkillSummary[]>
  }
}

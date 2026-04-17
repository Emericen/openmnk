// --- Bridge ---

export type Bridge = {
  send: (channel: string, payload?: unknown) => void
  on: (channel: string, callback: (payload: unknown) => void) => () => void
  invoke: (channel: string, payload?: unknown) => Promise<unknown>
}

// --- Chat messages (shared between main and renderer) ---

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "command"; description: string; cmd: string; output?: string }

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: ChatMessagePart[]
}

// --- Session channel (main → renderer) ---

export type SessionEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "done" }
  | { type: "error"; text: string }
  | { type: "history"; messages: ChatMessage[] }
  | { type: "stop-requested" }

// --- Session command (renderer → main) ---

export type SessionCommand =
  | { type: "start"; text: string }
  | { type: "cancel" }

// --- Dictation ---

export type DictationTranscribeResult =
  | { success: true; text: string }
  | { success: false; error: string }

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

export type SessionEmit = (event: SessionEvent) => void

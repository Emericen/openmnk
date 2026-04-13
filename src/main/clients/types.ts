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

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

export type ToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

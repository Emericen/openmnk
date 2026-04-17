import type { ChatMessage } from "../../types/ipc"

const MAX_MESSAGES = 500
const THINKING_ID = "__thinking__"
const THINKING_MSG: ChatMessage = {
  id: THINKING_ID,
  role: "system",
  content: [{ type: "text", text: "Thinking..." }],
}

export class MessageList {
  private messages: ChatMessage[] = []
  private thinking = false

  getMessages(): ChatMessage[] {
    return this.messages
  }

  /** Replace entire list (for history restore). */
  set(messages: ChatMessage[]): void {
    this.messages = messages
    this.trim()
  }

  /** Upsert a message. While thinking, keeps "Thinking..." at the tail. */
  upsert(message: ChatMessage): void {
    this.removeThinking()
    const idx = this.messages.findIndex((m) => m.id === message.id)
    if (idx >= 0) {
      const updated = [...this.messages]
      updated[idx] = message
      this.messages = updated
    } else {
      this.messages = [...this.messages, message]
      this.trim()
    }
    if (this.thinking) this.appendThinking()
  }

  /** Start showing "Thinking..." at the tail. */
  startThinking(): void {
    this.thinking = true
    this.removeThinking()
    this.appendThinking()
  }

  /** Stop showing "Thinking..." — called on done. */
  stopThinking(): void {
    this.thinking = false
    this.removeThinking()
  }

  private appendThinking(): void {
    this.messages = [...this.messages, THINKING_MSG]
  }

  private removeThinking(): void {
    const last = this.messages[this.messages.length - 1]
    if (last?.id === THINKING_ID) {
      this.messages = this.messages.slice(0, -1)
    }
  }

  private trim(): void {
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-MAX_MESSAGES)
    }
  }
}

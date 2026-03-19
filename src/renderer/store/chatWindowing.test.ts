import { describe, expect, it } from "vitest"
import type { ChatMessage } from "../../shared/ipc-contract"
import {
  getLatestWindow,
  getWindowSlice,
  loadOlderWindow,
} from "./chatWindowing"

describe("chatWindowing", () => {
  const messages: ChatMessage[] = Array.from({ length: 140 }, (_, index) => ({
    id: `msg_${index + 1}`,
    role: "assistant",
    content: [{ type: "text", text: `message ${index + 1}` }],
  }))

  it("returns the latest message window", () => {
    const result = getLatestWindow(messages)

    expect(result.visibleMessages).toHaveLength(100)
    expect(result.visibleStart).toBe(40)
    expect(result.hasOlderMessages).toBe(true)
  })

  it("loads an older chunk while preserving the window contract", () => {
    const result = loadOlderWindow(messages, 60)

    expect(result.visibleStart).toBe(10)
    expect(result.visibleMessages).toHaveLength(130)
    expect(result.hasOlderMessages).toBe(true)
  })

  it("clamps invalid visible starts safely", () => {
    const result = getWindowSlice(messages, -5)

    expect(result.visibleStart).toBe(0)
    expect(result.visibleMessages).toHaveLength(140)
    expect(result.hasOlderMessages).toBe(false)
  })
})

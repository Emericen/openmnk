import { describe, expect, it, vi } from "vitest"
import { createTriggerInterpreter, normalizeTriggerKey } from "./trigger"

describe("normalizeTriggerKey", () => {
  it("maps ctrl aliases to control", () => {
    expect(normalizeTriggerKey("ctrl")).toBe("control")
    expect(normalizeTriggerKey("ctrl_left")).toBe("control_left")
    expect(normalizeTriggerKey("ctrl_right")).toBe("control_right")
  })

  it("maps cmd and win aliases to command", () => {
    expect(normalizeTriggerKey("cmd")).toBe("command")
    expect(normalizeTriggerKey("win")).toBe("command")
    expect(normalizeTriggerKey("windows")).toBe("command")
  })

  it("maps option aliases to alt", () => {
    expect(normalizeTriggerKey("option")).toBe("alt")
    expect(normalizeTriggerKey("opt")).toBe("alt")
  })
})

describe("createTriggerInterpreter", () => {
  it("emits a tap when the trigger key is pressed and released quickly", () => {
    vi.useFakeTimers()
    const onTriggerTap = vi.fn()
    const interpreter = createTriggerInterpreter({
      triggerKey: "alt",
      holdThresholdMs: 200,
      onTriggerTap,
    })

    interpreter.handleInput({ type: "key_down", key: "alt" })
    vi.advanceTimersByTime(100)
    interpreter.handleInput({ type: "key_up", key: "alt" })

    expect(onTriggerTap).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it("suppresses the tap if other activity happens while the trigger is pressed", () => {
    vi.useFakeTimers()
    const onTriggerTap = vi.fn()
    const interpreter = createTriggerInterpreter({
      triggerKey: "alt",
      onTriggerTap,
    })

    interpreter.handleInput({ type: "key_down", key: "alt" })
    interpreter.handleInput({ type: "pointer_down" })
    interpreter.handleInput({ type: "key_up", key: "alt" })

    expect(onTriggerTap).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("emits hold start and hold end around a long press", () => {
    vi.useFakeTimers()
    const onTriggerHoldStart = vi.fn()
    const onTriggerHoldEnd = vi.fn()
    const interpreter = createTriggerInterpreter({
      triggerKey: "alt",
      holdThresholdMs: 200,
      onTriggerHoldStart,
      onTriggerHoldEnd,
    })

    interpreter.handleInput({ type: "key_down", key: "alt" })
    vi.advanceTimersByTime(220)
    interpreter.handleInput({ type: "key_up", key: "alt" })

    expect(onTriggerHoldStart).toHaveBeenCalledOnce()
    expect(onTriggerHoldEnd).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})

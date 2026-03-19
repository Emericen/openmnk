import { createProvider } from "./providers/index.js"

export const TRIGGER_CONFIG = {
  triggerKey: String(
    process.env.TRIGGER_KEY || process.env.HOTKEY_TRIGGER_KEY || "alt"
  )
    .trim()
    .toLowerCase(),
  typingGuardWindowMs: Number(
    process.env.TRIGGER_TYPING_GUARD_WINDOW_MS ||
      process.env.HOTKEY_TRIGGER_TYPING_GUARD_WINDOW_MS ||
      120
  ),
  holdThresholdMs: Number(
    process.env.TRIGGER_HOLD_THRESHOLD_MS ||
      process.env.HOTKEY_TRIGGER_HOLD_THRESHOLD_MS ||
      220
  ),
  debugActivity: String(
    process.env.TRIGGER_DEBUG_ACTIVITY ||
      process.env.HOTKEY_DEBUG_ACTIVITY ||
      ""
  )
    .trim()
    .toLowerCase()
    .match(/^(1|true|yes|on)$/),
  disableProvider: String(
    process.env.TRIGGER_DISABLE_PROVIDER ||
      process.env.HOTKEY_DISABLE_IOHOOK ||
      ""
  )
    .trim()
    .toLowerCase()
    .match(/^(1|true|yes|on)$/)
}

function capitalize(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function normalizeDisplayKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
  switch (key) {
    case "control":
    case "control_left":
    case "control_right":
      return process.platform === "darwin" ? "Control" : "Ctrl"
    case "alt":
      return process.platform === "darwin" ? "Option" : "Alt"
    case "command":
      return "Command"
    case "shift":
      return "Shift"
    case "escape":
      return "Escape"
    default:
      return capitalize(key.replace(/_(left|right)$/i, ""))
  }
}

function buildBindings(triggerKey) {
  const label = normalizeDisplayKey(triggerKey)
  return {
    tap: `${label} Tap`,
    hold: `Hold ${label}`
  }
}

export function getOverlayShortcutHints(mode = "action") {
  const acceptKeyLabel = normalizeDisplayKey(TRIGGER_CONFIG.triggerKey)
  const denyKeyLabel = normalizeDisplayKey("escape")

  if (mode === "loading") {
    return {
      denyKeyLabel,
      denyHintText: `Deny (${denyKeyLabel})`
    }
  }

  return {
    acceptKeyLabel,
    denyKeyLabel,
    acceptHintText: `Accept (${acceptKeyLabel})`,
    denyHintText: `Deny (${denyKeyLabel})`
  }
}

function createInterpreter({
  triggerKey = "alt",
  typingGuardWindowMs = 120,
  holdThresholdMs = 220,
  onTriggerHoldStart = () => {},
  onTriggerHoldEnd = () => {},
  onTriggerTap = () => {},
  onEscape = () => {},
  onActivity = () => {}
} = {}) {
  let triggerPressed = false
  let triggerContaminated = false
  let triggerPressedAt = 0
  let lastActivityAt = 0
  let holdTimer = null
  let holdStarted = false

  function clearHoldTimer() {
    if (!holdTimer) return
    clearTimeout(holdTimer)
    holdTimer = null
  }

  function handleTriggerDown() {
    if (triggerPressed) return

    const now = Date.now()
    triggerPressed = true
    triggerContaminated =
      now - lastActivityAt <= Math.max(0, Number(typingGuardWindowMs || 0))
    triggerPressedAt = now
    holdStarted = false
    clearHoldTimer()
    holdTimer = setTimeout(
      () => {
        holdTimer = null
        if (!triggerPressed || triggerContaminated || holdStarted) return
        holdStarted = true
        onTriggerHoldStart({
          triggerKey,
          timestamp: Date.now(),
          pressDurationMs: triggerPressedAt ? Date.now() - triggerPressedAt : 0
        })
      },
      Math.max(0, Number(holdThresholdMs || 0))
    )
  }

  function handleTriggerUp() {
    if (!triggerPressed) return

    const now = Date.now()
    const wasContaminated = triggerContaminated
    const pressedAt = triggerPressedAt
    const wasHold = holdStarted
    triggerPressed = false
    triggerContaminated = false
    triggerPressedAt = 0
    holdStarted = false
    clearHoldTimer()

    if (wasHold) {
      onTriggerHoldEnd({
        triggerKey,
        timestamp: now,
        pressDurationMs: pressedAt ? now - pressedAt : 0
      })
    }

    if (wasContaminated || wasHold) return
    onTriggerTap({
      triggerKey,
      timestamp: now,
      pressDurationMs: pressedAt ? now - pressedAt : 0
    })
  }

  function handleActivity(kind, inputEvent) {
    lastActivityAt = Date.now()
    if (triggerPressed) {
      triggerContaminated = true
    }
    onActivity({
      kind,
      whileTriggerPressed: triggerPressed,
      inputEvent
    })
  }

  function handleInput(inputEvent) {
    if (!inputEvent?.type) return

    if (inputEvent.type === "key_down") {
      if (inputEvent.key === triggerKey) {
        handleTriggerDown()
        return
      }
      if (inputEvent.key === "escape") {
        onEscape({
          timestamp: Date.now(),
          inputEvent
        })
        return
      }
      handleActivity("keyboard", inputEvent)
      return
    }

    if (inputEvent.type === "key_up") {
      if (inputEvent.key === triggerKey) {
        handleTriggerUp()
      }
      return
    }

    if (inputEvent.type === "pointer_down") {
      handleActivity("mouse", inputEvent)
      return
    }

    if (inputEvent.type === "scroll") {
      handleActivity("scroll", inputEvent)
    }
  }

  return {
    handleInput,
    stop() {
      clearHoldTimer()
    }
  }
}

export async function createTriggerListener({
  onTriggerHoldStart,
  onTriggerHoldEnd,
  onTriggerTap,
  onEscape,
  onActivity
} = {}) {
  try {
    if (TRIGGER_CONFIG.disableProvider) {
      throw new Error("Disabled by TRIGGER_DISABLE_PROVIDER")
    }

    const interpreter = createInterpreter({
      triggerKey: TRIGGER_CONFIG.triggerKey,
      typingGuardWindowMs: TRIGGER_CONFIG.typingGuardWindowMs,
      holdThresholdMs: TRIGGER_CONFIG.holdThresholdMs,
      onTriggerHoldStart,
      onTriggerHoldEnd,
      onTriggerTap,
      onEscape,
      onActivity
    })

    const provider = await createProvider({
      onInput(inputEvent) {
        if (TRIGGER_CONFIG.debugActivity) {
          console.log("[trigger] input", {
            type: inputEvent?.type,
            key: inputEvent?.key,
            platform: inputEvent?.platform
          })
        }
        interpreter.handleInput(inputEvent)
      }
    })

    const bindings = buildBindings(TRIGGER_CONFIG.triggerKey)
    console.log(
      `[trigger] using ${provider.name} (${bindings.tap}, ${bindings.hold})`
    )

    return {
      mode: provider.name,
      bindings,
      stop() {
        interpreter.stop()
        provider.stop()
      }
    }
  } catch (error) {
    console.warn(
      `[trigger] provider unavailable: ${String(error?.message || error)}`
    )
    return {
      mode: "disabled",
      bindings: {
        tap: "Unavailable",
        hold: "Unavailable"
      },
      stop() {}
    }
  }
}

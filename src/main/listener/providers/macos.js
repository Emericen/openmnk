function normalizeModifiers(event) {
  const modifiers = event?.modifiers || {}
  return {
    shift: Boolean(modifiers.shift),
    control: Boolean(modifiers.control),
    alt: Boolean(modifiers.option),
    command: Boolean(modifiers.command)
  }
}

function subscribe(emitter, eventName, handler) {
  emitter.on(eventName, handler)
  return () => {
    if (typeof emitter.removeListener === "function") {
      emitter.removeListener(eventName, handler)
    }
  }
}

function emitModifierDiffs(previous, next, rawEvent, emit) {
  for (const key of Object.keys(next)) {
    if (previous[key] === next[key]) continue
    emit({
      type: next[key] ? "key_down" : "key_up",
      key,
      rawEvent
    })
  }
}

function isKnownModifierKey(event) {
  const keyCode = Number(event?.keyCode)
  return (
    keyCode === 54 ||
    keyCode === 55 ||
    keyCode === 56 ||
    keyCode === 58 ||
    keyCode === 59 ||
    keyCode === 60 ||
    keyCode === 61 ||
    keyCode === 62
  )
}

function resolveMacosKey(event) {
  const keyCode = Number(event?.keyCode)
  if (keyCode === 53) return "escape"
  return "unknown"
}

export async function createMacosIohookProvider({ onInput } = {}) {
  let iohookModule
  try {
    iohookModule = await import("iohook-macos")
  } catch (error) {
    throw new Error(
      `Failed to load iohook-macos. Install the optional dependency first. ${String(
        error?.message || error
      )}`
    )
  }

  const iohook = iohookModule.default || iohookModule
  if (!iohook || typeof iohook.on !== "function") {
    throw new Error("Invalid macOS iohook module")
  }

  if (typeof iohook.setVerboseLogging === "function") {
    iohook.setVerboseLogging(false)
  }
  if (typeof iohook.enablePerformanceMode === "function") {
    iohook.enablePerformanceMode()
  }

  if (typeof iohook.checkAccessibilityPermissions === "function") {
    const permissions = iohook.checkAccessibilityPermissions()
    if (!permissions?.hasPermissions) {
      iohook.requestAccessibilityPermissions?.()
    }
  }

  const subscriptions = []
  let previousModifiers = {
    shift: false,
    control: false,
    alt: false,
    command: false
  }

  const emit = (payload) => {
    onInput?.({
      ...payload,
      platform: "darwin"
    })
  }

  subscriptions.push(
    subscribe(iohook, "flagsChanged", (event) => {
      const nextModifiers = normalizeModifiers(event)
      emitModifierDiffs(previousModifiers, nextModifiers, event, emit)
      previousModifiers = nextModifiers
    })
  )

  subscriptions.push(
    subscribe(iohook, "keyDown", (event) => {
      if (isKnownModifierKey(event)) return
      emit({
        type: "key_down",
        key: resolveMacosKey(event),
        rawEvent: event
      })
    })
  )

  subscriptions.push(
    subscribe(iohook, "keyUp", (event) => {
      if (isKnownModifierKey(event)) return
      emit({
        type: "key_up",
        key: resolveMacosKey(event),
        rawEvent: event
      })
    })
  )

  for (const eventName of [
    "leftMouseDown",
    "rightMouseDown",
    "otherMouseDown"
  ]) {
    subscriptions.push(
      subscribe(iohook, eventName, (event) => {
        emit({
          type: "pointer_down",
          button: Number(event?.button || 0),
          rawEvent: event
        })
      })
    )
  }

  subscriptions.push(
    subscribe(iohook, "scrollWheel", (event) => {
      emit({
        type: "scroll",
        rawEvent: event
      })
    })
  )

  if (typeof iohook.startMonitoring === "function") {
    iohook.startMonitoring()
  } else if (typeof iohook.start === "function") {
    iohook.start()
  }

  return {
    name: "macos-iohook-provider",
    stop() {
      while (subscriptions.length) {
        const unsubscribe = subscriptions.pop()
        unsubscribe?.()
      }
      if (typeof iohook.stopMonitoring === "function") {
        iohook.stopMonitoring()
      } else if (typeof iohook.stop === "function") {
        iohook.stop()
      }
    }
  }
}

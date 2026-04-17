type MacosInputEvent = {
  modifiers?: {
    shift?: boolean
    control?: boolean
    option?: boolean
    command?: boolean
  }
  keyCode?: number
  button?: number
}

type ModifierState = {
  shift: boolean
  control: boolean
  alt: boolean
  command: boolean
}

type ProviderInputPayload =
  | {
      type: "key_down" | "key_up"
      key: string
      rawEvent: MacosInputEvent
      platform?: string
    }
  | {
      type: "pointer_down"
      button: number
      rawEvent: MacosInputEvent
      platform?: string
    }
  | { type: "scroll"; rawEvent: MacosInputEvent; platform?: string }

type ProviderOptions = {
  onInput?: (payload: ProviderInputPayload) => void
}

type SubscribableEmitter = {
  on: (eventName: string, handler: (event: MacosInputEvent) => void) => void
  removeListener?: (
    eventName: string,
    handler: (event: MacosInputEvent) => void
  ) => void
}

type MacosIohookModule = {
  default?: MacosIohook
}

type MacosIohook = SubscribableEmitter & {
  setVerboseLogging?: (enabled: boolean) => void
  enablePerformanceMode?: () => void
  checkAccessibilityPermissions?: () => { hasPermissions?: boolean }
  requestAccessibilityPermissions?: () => void
  startMonitoring?: () => void
  start?: () => void
  stopMonitoring?: () => void
  stop?: () => void
}

function normalizeModifiers(event: MacosInputEvent): ModifierState {
  const modifiers = event?.modifiers || {}
  return {
    shift: Boolean(modifiers.shift),
    control: Boolean(modifiers.control),
    alt: Boolean(modifiers.option),
    command: Boolean(modifiers.command),
  }
}

function subscribe(
  emitter: SubscribableEmitter,
  eventName: string,
  handler: (event: MacosInputEvent) => void
): () => void {
  emitter.on(eventName, handler)
  return () => {
    if (typeof emitter.removeListener === "function") {
      emitter.removeListener(eventName, handler)
    }
  }
}

function emitModifierDiffs(
  previous: ModifierState,
  next: ModifierState,
  rawEvent: MacosInputEvent,
  emit: (payload: ProviderInputPayload) => void
): void {
  for (const key of Object.keys(next) as Array<keyof ModifierState>) {
    if (previous[key] === next[key]) continue
    emit({
      type: next[key] ? "key_down" : "key_up",
      key,
      rawEvent,
    })
  }
}

function isKnownModifierKey(event: MacosInputEvent): boolean {
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

function resolveMacosKey(event: MacosInputEvent): string {
  const keyCode = Number(event?.keyCode)
  if (keyCode === 53) return "escape"
  return "unknown"
}

export async function createMacosIohookProvider({
  onInput,
}: ProviderOptions = {}) {
  let iohookModule: MacosIohookModule
  try {
    iohookModule = await import("iohook-macos")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load iohook-macos. Install the optional dependency first. ${message}`
    )
  }

  const iohook = (iohookModule.default || iohookModule) as MacosIohook
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

  const subscriptions: Array<() => void> = []
  let previousModifiers: ModifierState = {
    shift: false,
    control: false,
    alt: false,
    command: false,
  }

  const emit = (payload: ProviderInputPayload): void => {
    onInput?.({
      ...payload,
      platform: "darwin",
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
        rawEvent: event,
      })
    })
  )

  subscriptions.push(
    subscribe(iohook, "keyUp", (event) => {
      if (isKnownModifierKey(event)) return
      emit({
        type: "key_up",
        key: resolveMacosKey(event),
        rawEvent: event,
      })
    })
  )

  for (const eventName of [
    "leftMouseDown",
    "rightMouseDown",
    "otherMouseDown",
  ]) {
    subscriptions.push(
      subscribe(iohook, eventName, (event) => {
        emit({
          type: "pointer_down",
          button: Number(event?.button || 0),
          rawEvent: event,
        })
      })
    )
  }

  subscriptions.push(
    subscribe(iohook, "scrollWheel", (event) => {
      emit({
        type: "scroll",
        rawEvent: event,
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
    },
  }
}

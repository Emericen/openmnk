import { createRequire } from "module"

const nodeRequire = createRequire(import.meta.url)

const WINDOWS_RAW_CODES = {
  27: "escape",
  16: "shift",
  17: "control",
  18: "alt",
  91: "command",
  92: "command",
  160: "shift",
  161: "shift",
  162: "control_left",
  163: "control_right",
  164: "alt",
  165: "alt"
}

const WINDOWS_KEY_CODES = {
  27: "escape",
  16: "shift",
  17: "control",
  18: "alt",
  91: "command",
  92: "command"
}

function modifierFlagMatches(key, event) {
  if (key === "control_left" || key === "control_right") {
    return Boolean(event?.ctrlKey)
  }
  if (key === "alt") return Boolean(event?.altKey)
  if (key === "control") return Boolean(event?.ctrlKey)
  if (key === "shift") return Boolean(event?.shiftKey)
  if (key === "command") return Boolean(event?.metaKey)
  return false
}

export function resolveWindowsKey(event) {
  const rawcode = Number(event?.rawcode)
  if (WINDOWS_RAW_CODES[rawcode]) return WINDOWS_RAW_CODES[rawcode]

  const keycode = Number(event?.keycode)
  const key = WINDOWS_KEY_CODES[keycode]
  if (key && modifierFlagMatches(key, event)) {
    return key
  }

  return "unknown"
}

function subscribe(emitter, eventName, handler) {
  emitter.on(eventName, handler)
  return () => {
    if (typeof emitter.removeListener === "function") {
      emitter.removeListener(eventName, handler)
    }
  }
}

export async function createWindowsIohookProvider({ onInput } = {}) {
  const iohookModule = nodeRequire("@tkomde/iohook")
  const iohook = iohookModule.default || iohookModule

  if (!iohook || typeof iohook.on !== "function") {
    throw new Error("Invalid Windows iohook module")
  }

  if (typeof iohook.useRawcode === "function") {
    iohook.useRawcode(true)
  }

  const subscriptions = []
  const emit = (payload) => {
    onInput?.({
      ...payload,
      platform: "win32"
    })
  }

  subscriptions.push(
    subscribe(iohook, "keydown", (event) => {
      emit({
        type: "key_down",
        key: resolveWindowsKey(event),
        rawEvent: event
      })
    })
  )

  subscriptions.push(
    subscribe(iohook, "keyup", (event) => {
      emit({
        type: "key_up",
        key: resolveWindowsKey(event),
        rawEvent: event
      })
    })
  )

  subscriptions.push(
    subscribe(iohook, "mousedown", (event) => {
      emit({
        type: "pointer_down",
        button: Number(event?.button || 0),
        rawEvent: event
      })
    })
  )

  subscriptions.push(
    subscribe(iohook, "mousewheel", (event) => {
      emit({
        type: "scroll",
        rawEvent: event
      })
    })
  )

  iohook.start()

  return {
    name: "windows-iohook-provider",
    stop() {
      while (subscriptions.length) {
        const unsubscribe = subscriptions.pop()
        unsubscribe?.()
      }
      if (typeof iohook.stop === "function") {
        iohook.stop()
      }
    }
  }
}

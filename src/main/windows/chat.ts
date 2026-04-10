import { app, BrowserWindow, nativeImage, screen, shell } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"
import type { DictationCommand, QueryEvent } from "../../shared/ipc-contract"

type PendingEvent = {
  channel: "query:event" | "dictation:command"
  payload: QueryEvent | DictationCommand
}

let window: BrowserWindow | null = null
let ready = false
let pending: PendingEvent[] = []

const IS_E2E_HIDDEN =
  process.env.E2E_TEST === "1" && process.env.E2E_HIDE_WINDOW === "1"

const icon = nativeImage.createFromBuffer(
  Buffer.alloc(16 * 16 * 4, 255),
  { width: 16, height: 16 }
)

export function createChatWindow(): BrowserWindow {
  if (window) {
    show()
    return window
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  window = new BrowserWindow({
    width: 540,
    height: 720,
    x: screenWidth - 540,
    y: process.platform === "darwin" ? 0 : screen.getPrimaryDisplay().workAreaSize.height - 720,
    show: false,
    autoHideMenuBar: true,
    icon,
    title: "OpenMNK",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (e, url) => {
    if (url !== window!.webContents.getURL()) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  window.on("ready-to-show", () => {
    if (!IS_E2E_HIDDEN) show()
  })

  window.on("close", () => app.quit())

  window.on("closed", () => {
    window = null
    ready = false
    pending = []
  })

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"))
  }

  return window
}

export function show(): void {
  if (IS_E2E_HIDDEN || !window) return
  window.show()
  window.restore()
  window.focus()
}

export function hide(): void {
  if (IS_E2E_HIDDEN || !window) return
  if (process.platform === "win32") window.minimize()
  window.blur()
  window.hide()
  if (process.platform === "darwin") app.hide()
}

export function toggle(): void {
  if (!window) return
  if (window.isMinimized() || !window.isFocused()) {
    window.restore()
    window.focus()
  } else {
    window.minimize()
  }
}

export function isVisible(): boolean {
  return Boolean(window?.isVisible())
}

export function markReady(): void {
  ready = true
  if (!window || window.webContents.isDestroyed()) return
  for (const e of pending) {
    window.webContents.send(e.channel, e.payload)
  }
  pending = []
}

export function sendEvent(payload: QueryEvent): void {
  send("query:event", payload)
}

export function sendDictation(payload: DictationCommand): void {
  send("dictation:command", payload)
}

function send(channel: PendingEvent["channel"], payload: PendingEvent["payload"]): void {
  if (window && !window.webContents.isDestroyed() && ready) {
    window.webContents.send(channel, payload)
    return
  }
  pending.push({ channel, payload })
}

import {
  app,
  BrowserWindow,
  nativeImage,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
  type WebContents,
} from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"
import type { DictationCommand, QueryEvent } from "../../shared/ipc-contract"

// ========== CHAT WINDOW STATE ==========
export type ChatWindowMode = "overlay" | "windowed"

type PendingRendererEvent = {
  channel: "query:event" | "dictation:command"
  payload: QueryEvent | DictationCommand
}

let chatWindow: BrowserWindow | null = null
let chatWebContents: WebContents | null = null
let previouslyFocusedWindow: BrowserWindow | null = null
let isChatRendererReady = false
let pendingRendererEvents: PendingRendererEvent[] = []
let chatWindowMode: ChatWindowMode = "windowed"
let isRecreating = false
const IS_E2E_HIDDEN =
  process.env.E2E_TEST === "1" && process.env.E2E_HIDE_WINDOW === "1"

// Reusable white square icon (16x16)
const WHITE_ICON_SIZE = 16
const whiteBuf = Buffer.alloc(WHITE_ICON_SIZE * WHITE_ICON_SIZE * 4, 255)
const whiteIcon = nativeImage.createFromBuffer(whiteBuf, {
  width: WHITE_ICON_SIZE,
  height: WHITE_ICON_SIZE,
})

export function createChatWindow(): BrowserWindow {
  if (chatWindow) {
    showChatWindow()
    return chatWindow
  }

  // Get screen dimensions
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize

  const windowWidth = 540
  const windowHeight = 720

  // Position near system tray based on platform
  let x: number
  let y: number
  if (process.platform === "darwin") {
    // macOS: top right (system tray at top)
    x = screenWidth - windowWidth
    y = 0 // Can add small offset like y = 25 for menu bar
  } else {
    // Windows/Linux: bottom right (system tray at bottom)
    x = screenWidth - windowWidth
    y = screenHeight - windowHeight
  }

  const isOverlay = chatWindowMode === "overlay"

  // Create the browser window.
  const windowOptions: BrowserWindowConstructorOptions = {
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    show: false,
    resizable: !isOverlay,
    autoHideMenuBar: true,
    icon: whiteIcon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
    frame: !isOverlay,
    title: "OpenMNK",
  }

  chatWindow = new BrowserWindow(windowOptions)
  const window = chatWindow
  chatWebContents = window.webContents
  isChatRendererReady = false

  if (isOverlay) {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setAlwaysOnTop(true, "screen-saver", 1)
  }

  // Open external links in the user's default browser instead of new Electron windows
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (e, url) => {
    if (url !== window.webContents.getURL()) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  window.setContentProtection(false)

  window.on("ready-to-show", () => {
    if (IS_E2E_HIDDEN) return
    showChatWindow()
  })

  if (isOverlay) {
    window.on("blur", () => {
      if (chatWindow?.isVisible()) {
        hideChatWindow()
      }
    })
  }

  if (!isOverlay) {
    // Windowed mode: closing the window quits the app (unless recreating)
    window.on("close", () => {
      if (!isRecreating) {
        app.quit()
      }
    })
  }

  window.on("closed", () => {
    chatWebContents = null
    chatWindow = null
    isChatRendererReady = false
    pendingRendererEvents = []
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"))
  }

  return window
}

export function toggleChatWindow() {
  if (!chatWindow) return

  if (chatWindowMode === "windowed") {
    // Windowed: minimize/restore
    if (chatWindow.isMinimized() || !chatWindow.isFocused()) {
      chatWindow.restore()
      chatWindow.focus()
    } else {
      chatWindow.minimize()
    }
  } else {
    // Overlay: hide/show
    if (chatWindow.isVisible()) {
      hideChatWindow()
    } else {
      showChatWindow()
    }
  }
}

export function isChatWindowVisible(): boolean {
  return Boolean(chatWindow?.isVisible())
}

export function showChatWindow(): void {
  if (IS_E2E_HIDDEN) return
  if (chatWindow) {
    // Store the currently focused window before showing chat
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow && focusedWindow !== chatWindow) {
      previouslyFocusedWindow = focusedWindow
    }

    chatWindow.show()
    chatWindow.restore() // Ensure window is unminimized on Windows
    chatWindow.focus()
  }
}

export function hideChatWindow(): void {
  if (IS_E2E_HIDDEN) return
  if (chatWindow) {
    if (process.platform === "win32") {
      chatWindow.minimize() // Required on Windows to give focus back
    }
    chatWindow.blur()
    chatWindow.hide()

    // Keep messages persistent across window hide/show cycles

    // In real world, restore focus to the previously active window
    if (previouslyFocusedWindow && !previouslyFocusedWindow.isDestroyed()) {
      previouslyFocusedWindow.focus()
      previouslyFocusedWindow = null
    } else {
      // Fallback: hide app on macOS to return focus to system
      if (process.platform === "darwin") {
        app.hide()
      }
    }
  }
}

function sendRendererEvent(
  channel: PendingRendererEvent["channel"],
  payload: PendingRendererEvent["payload"]
): void {
  if (
    chatWebContents &&
    !chatWebContents.isDestroyed() &&
    isChatRendererReady
  ) {
    chatWebContents.send(channel, payload)
    return
  }
  pendingRendererEvents.push({ channel, payload })
}

export function sendChatEvent(payload: QueryEvent): void {
  sendRendererEvent("query:event", payload)
}

export function sendDictationEvent(payload: DictationCommand): void {
  sendRendererEvent("dictation:command", payload)
}

export function markChatWindowReady(): void {
  isChatRendererReady = true
  if (!chatWebContents || chatWebContents.isDestroyed()) return
  for (const event of pendingRendererEvents) {
    chatWebContents.send(event.channel, event.payload)
  }
  pendingRendererEvents = []
}

export function addSystemText(
  text: string,
  extra: Partial<QueryEvent> = {}
): void {
  sendChatEvent({
    ...extra,
    type: "message",
    role: "system",
    text: String(text || ""),
  })
}

export function addAssistantText(
  text: string,
  extra: Partial<QueryEvent> = {}
): void {
  sendChatEvent({
    ...extra,
    type: "message",
    role: "assistant",
    text: String(text || ""),
  })
}

export function setChatWindowContentProtection(enabled: boolean): void {
  if (chatWindow) {
    chatWindow.setContentProtection(enabled)
  }
}

export function setChatWindowMode(mode: ChatWindowMode): void {
  chatWindowMode = mode
}

export function getChatWindowMode(): ChatWindowMode {
  return chatWindowMode
}

export function recreateChatWindow(): BrowserWindow {
  isRecreating = true
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.destroy()
  }
  chatWindow = null
  chatWebContents = null
  isChatRendererReady = false
  pendingRendererEvents = []
  isRecreating = false
  return createChatWindow()
}

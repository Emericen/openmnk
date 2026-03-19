import { BrowserWindow, screen } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"

// ========== CHAT WINDOW STATE ==========
let chatWindow = null
let chatWebContents = null
let previouslyFocusedWindow = null
let isChatRendererReady = false
let pendingRendererEvents = []
const IS_E2E_HIDDEN =
  process.env.E2E_TEST === "1" && process.env.E2E_HIDE_WINDOW === "1"

// Reusable white square icon (16x16) for Linux where BrowserWindow expects an icon
const WHITE_ICON_SIZE = 16
const whiteBuf = Buffer.alloc(WHITE_ICON_SIZE * WHITE_ICON_SIZE * 4, 255)
import { nativeImage } from "electron"
const whiteIcon = nativeImage.createFromBuffer(whiteBuf, {
  width: WHITE_ICON_SIZE,
  height: WHITE_ICON_SIZE
})

export function createChatWindow() {
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
  let x, y
  if (process.platform === "darwin") {
    // macOS: top right (system tray at top)
    x = screenWidth - windowWidth
    y = 0 // Can add small offset like y = 25 for menu bar
  } else {
    // Windows/Linux: bottom right (system tray at bottom)
    x = screenWidth - windowWidth
    y = screenHeight - windowHeight
  }

  // Create the browser window.
  chatWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    show: false,
    resizable: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon: whiteIcon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false
    },
    frame: false,
    visibleOnAllWorkspaces: true
  })
  chatWebContents = chatWindow.webContents
  isChatRendererReady = false

  chatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Open external links in the user's default browser instead of new Electron windows
  const { shell } = require("electron")
  chatWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })
  chatWindow.webContents.on("will-navigate", (e, url) => {
    if (url !== chatWindow.webContents.getURL()) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  chatWindow.setAlwaysOnTop(true, "screen-saver", 1)
  chatWindow.setContentProtection(false)

  chatWindow.on("ready-to-show", () => {
    if (IS_E2E_HIDDEN) return
    showChatWindow()
  })

  chatWindow.on("blur", () => {
    if (chatWindow?.isVisible()) {
      hideChatWindow()
    }
  })
  chatWindow.on("destroyed", () => {
    chatWebContents = null
    chatWindow = null
    isChatRendererReady = false
    pendingRendererEvents = []
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    chatWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    chatWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }

  return chatWindow
}

export function toggleChatWindow() {
  if (chatWindow) {
    chatWindow.isVisible() ? hideChatWindow() : showChatWindow()
  }
}

export function isChatWindowVisible() {
  return Boolean(chatWindow?.isVisible())
}

export function showChatWindow() {
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

export function hideChatWindow() {
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
        const { app } = require("electron")
        app.hide()
      }
    }
  }
}

function sendRendererEvent(channel, payload) {
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

export function sendChatEvent(payload) {
  sendRendererEvent("query", payload)
}

export function sendDictationEvent(payload) {
  sendRendererEvent("dictation", payload)
}

export function markChatWindowReady() {
  isChatRendererReady = true
  if (!chatWebContents || chatWebContents.isDestroyed()) return
  for (const event of pendingRendererEvents) {
    chatWebContents.send(event.channel, event.payload)
  }
  pendingRendererEvents = []
}

export function addSystemText(text, extra = {}) {
  sendChatEvent({
    ...extra,
    type: "message",
    role: "system",
    text: String(text || "")
  })
}

export function addAssistantText(text, extra = {}) {
  sendChatEvent({
    ...extra,
    type: "message",
    role: "assistant",
    text: String(text || "")
  })
}

export function setChatWindowContentProtection(enabled) {
  if (chatWindow) {
    chatWindow.setContentProtection(enabled)
  }
}

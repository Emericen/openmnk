import { BrowserWindow, ipcMain, nativeTheme, screen } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"

let overlayWindow = null
let overlayHeight = 72
let resizeListenerBound = false

const PANEL_WIDTH = 760
const PANEL_MIN_HEIGHT = 72
const PANEL_MAX_HEIGHT = 420
const PANEL_BOTTOM_MARGIN = 36

function getBounds(height) {
  const { width, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize
  return {
    width: PANEL_WIDTH,
    height,
    x: Math.round((width - PANEL_WIDTH) / 2),
    y: Math.max(0, screenHeight - height - PANEL_BOTTOM_MARGIN)
  }
}

function normalizeHeight(height) {
  return Math.max(
    PANEL_MIN_HEIGHT,
    Math.min(PANEL_MAX_HEIGHT, Math.round(Number(height) || PANEL_MIN_HEIGHT))
  )
}

function getRendererUrl() {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/overlay.html`
  }
  return null
}

export function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  overlayWindow = new BrowserWindow({
    ...getBounds(overlayHeight),
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#101113" : "#ffffff",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false
    }
  })
  overlayWindow.setAlwaysOnTop(true, "screen-saver")
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.on("focus", () => {
    overlayWindow?.blur()
  })
  const rendererUrl = getRendererUrl()
  if (rendererUrl) {
    overlayWindow.loadURL(rendererUrl)
  } else {
    overlayWindow.loadFile(join(__dirname, "../renderer/overlay.html"))
  }
  overlayWindow.on("closed", () => {
    overlayWindow = null
  })
  if (!resizeListenerBound) {
    resizeListenerBound = true
    ipcMain.on("panel", (_event, payload = {}) => {
      if (payload.type !== "resize" || payload.windowType !== "overlay") return
      setOverlayHeight(payload.height)
    })
  }
  return overlayWindow
}

export function showOverlayWindow(data = {}) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.webContents.send("panel", data)
  overlayWindow.setFocusable(false)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.showInactive()
  if (overlayWindow.isFocused()) overlayWindow.blur()
}

export function hideOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setFocusable(false)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.hide()
}

export function setOverlayHeight(height) {
  const nextHeight = normalizeHeight(height)
  overlayHeight = nextHeight
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setBounds(getBounds(overlayHeight))
}

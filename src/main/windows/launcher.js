import { app, BrowserWindow, ipcMain, nativeTheme, screen } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"

let launcherWindow = null
let launcherHeight = 72
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
    return `${process.env.ELECTRON_RENDERER_URL}/launcher.html`
  }
  return null
}

export function createLauncherWindow() {
  if (launcherWindow && !launcherWindow.isDestroyed()) return launcherWindow

  launcherWindow = new BrowserWindow({
    ...getBounds(launcherHeight),
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#101113" : "#ffffff",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false
    }
  })
  launcherWindow.setAlwaysOnTop(true, "screen-saver")
  launcherWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  launcherWindow.on("blur", () => {
    if (launcherWindow?.isVisible()) hideLauncherWindow()
  })
  const rendererUrl = getRendererUrl()
  if (rendererUrl) {
    launcherWindow.loadURL(rendererUrl)
  } else {
    launcherWindow.loadFile(join(__dirname, "../renderer/launcher.html"))
  }
  launcherWindow.on("closed", () => {
    launcherWindow = null
  })
  if (!resizeListenerBound) {
    resizeListenerBound = true
    ipcMain.on("panel", (_event, payload = {}) => {
      if (payload.type !== "resize" || payload.windowType !== "launcher") return
      setLauncherHeight(payload.height)
    })
  }

  return launcherWindow
}

export function showLauncherWindow() {
  if (!launcherWindow || launcherWindow.isDestroyed()) return
  launcherWindow.webContents.send("panel", { type: "launcher" })
  launcherWindow.setFocusable(true)
  launcherWindow.setIgnoreMouseEvents(false)
  launcherWindow.show()
  launcherWindow.restore()
  launcherWindow.focus()
  launcherWindow.webContents.send("launcher", { type: "focus" })
}

export function hideLauncherWindow() {
  if (!launcherWindow || launcherWindow.isDestroyed()) return
  if (process.platform === "win32") {
    launcherWindow.minimize()
    launcherWindow.hide()
  } else {
    launcherWindow.blur()
    launcherWindow.hide()
  }

  if (process.platform === "darwin") app.hide()
}

export function isLauncherWindowVisible() {
  if (!launcherWindow || launcherWindow.isDestroyed()) return false
  return launcherWindow.isVisible()
}

export function setLauncherHeight(height) {
  launcherHeight = normalizeHeight(height)
  if (!launcherWindow || launcherWindow.isDestroyed()) return
  launcherWindow.setBounds(getBounds(launcherHeight))
}

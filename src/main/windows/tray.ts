import {
  Tray,
  Menu,
  nativeImage,
  app,
  type MenuItemConstructorOptions,
} from "electron"

type AppearanceMode = "light" | "dark" | "system"
type ChatWindowMode = "overlay" | "windowed"
type TrayCallbacks = {
  onQuit?: () => void
  onShowWindow?: () => void
  onAppearanceChange?: (mode: AppearanceMode) => void
  onChatWindowModeChange?: (mode: ChatWindowMode) => void
}

let tray: Tray | null = null
let trayCallbacks: TrayCallbacks = {}
let trayState = {
  appearance: "system" as AppearanceMode,
  chatWindowMode: "windowed" as ChatWindowMode,
}

function buildTrayMenu() {
  const { onQuit, onShowWindow, onAppearanceChange } = trayCallbacks || {}
  const { appearance } = trayState || {}

  const items: MenuItemConstructorOptions[] = [
    {
      label: "Show Window",
      click: () => onShowWindow?.(),
    },
    { type: "separator" },
    { label: "Appearance", enabled: false },
    {
      label: "Light Mode",
      type: "radio",
      checked: appearance === "light",
      click: () => {
        onAppearanceChange?.("light")
      },
    },
    {
      label: "Dark Mode",
      type: "radio",
      checked: appearance === "dark",
      click: () => {
        onAppearanceChange?.("dark")
      },
    },
    {
      label: "System",
      type: "radio",
      checked: appearance === "system",
      click: () => {
        onAppearanceChange?.("system")
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        if (onQuit) {
          onQuit()
        } else {
          app.quit()
        }
      },
    },
  ]

  return Menu.buildFromTemplate(items)
}

export function createSystemTray(callbacks = {}) {
  trayCallbacks = callbacks

  const size = 18
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i += 1) {
    const offset = i * 4
    rgba[offset] = 255
    rgba[offset + 1] = 255
    rgba[offset + 2] = 255
    rgba[offset + 3] = 255
  }
  let trayIcon = nativeImage.createFromBitmap(rgba, {
    width: size,
    height: size,
    scaleFactor: 1,
  })
  if (!trayIcon || trayIcon.isEmpty()) {
    trayIcon = nativeImage.createEmpty()
  }
  const resizedIcon = trayIcon.resize({ width: 22, height: 22 })

  tray = new Tray(resizedIcon)
  tray.setContextMenu(buildTrayMenu())
  tray.setToolTip("OpenMNK")
  return tray
}

export function setTrayAppearance(appearance: AppearanceMode): void {
  trayState = { ...trayState, appearance: appearance || "system" }
  if (tray) {
    try {
      tray.setContextMenu(buildTrayMenu())
    } catch {
      // no-op
    }
  }
}

export function setTrayChatWindowMode(mode: ChatWindowMode): void {
  trayState = { ...trayState, chatWindowMode: mode || "windowed" }
  if (tray) {
    try {
      tray.setContextMenu(buildTrayMenu())
    } catch {
      // no-op
    }
  }
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
  trayCallbacks = {}
  trayState = { appearance: "system", chatWindowMode: "windowed" }
}

export function getTray(): Tray | null {
  return tray
}

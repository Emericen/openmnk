import "dotenv/config"
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron"
import fs from "fs/promises"
import path from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import {
  createSystemTray,
  destroyTray,
  setTrayAppearance,
} from "./windows/tray"
import * as chat from "./windows/chat"
import { Session } from "./clients/session"
import { transcribe } from "./clients/transcribe"
import type { SessionCommand } from "../types/ipc"

type AppearanceMode = "light" | "dark" | "system"

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.openmnk")
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ------------------------- Settings -------------------------

  const cacheDir = path.join(
    is.dev ? app.getAppPath() : app.getPath("userData"),
    ".cache"
  )
  const settingsPath = path.join(cacheDir, "settings.json")
  let appearance: AppearanceMode = "system"

  async function saveSettings() {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ appearance }, null, 2),
      "utf-8"
    )
  }

  async function loadSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf-8")
      appearance =
        (JSON.parse(raw) as { appearance?: AppearanceMode }).appearance ||
        "system"
    } catch {
      appearance = "system"
    }
    nativeTheme.themeSource =
      appearance === "light" || appearance === "dark" ? appearance : "system"
    setTrayAppearance(appearance)
  }

  // ------------------------- Session -------------------------

  const session = new Session((event) => chat.send("session", event))
  await session.loadFromDisk()

  ipcMain.on("ready", () => {
    chat.markReady()
    chat.send("session", { type: "history", messages: session.getHistory() })
  })

  ipcMain.on("session", (_event, command: SessionCommand) => {
    if (command.type === "start") {
      if (session.running) return
      void session.start(command.text)
    }
    if (command.type === "cancel") session.cancel()
  })

  ipcMain.handle("transcribe", (_event, input) => transcribe(input))

  // ------------------------- Startup -------------------------

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) chat.createChatWindow()
  })

  await loadSettings()
  chat.createChatWindow()

  createSystemTray({
    onShowWindow: () => chat.show(),
    onAppearanceChange: async (mode: AppearanceMode) => {
      appearance = mode
      nativeTheme.themeSource =
        mode === "light" || mode === "dark" ? mode : "system"
      setTrayAppearance(mode)
      await saveSettings()
    },
    onQuit: () => app.quit(),
  })

  app.on("will-quit", () => {
    destroyTray()
  })
})

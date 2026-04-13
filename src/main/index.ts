import "dotenv/config"
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron"
import { randomUUID } from "node:crypto"
import fs from "fs/promises"
import path from "path"
import { electronApp, optimizer } from "@electron-toolkit/utils"
import { createSystemTray, destroyTray, setTrayAppearance } from "./windows/tray"
import * as chat from "./windows/chat"
import { createTriggerListener } from "./listener/trigger"
import { Session } from "./clients/session"
import { load as loadNotion } from "./clients/notion"
import { transcribe } from "./clients/transcribe"
import type { SessionCommand, SessionEvent } from "../shared/ipc-contract"

type AppearanceMode = "light" | "dark" | "system"

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.openmnk")
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- Settings ---

  const settingsPath = path.join(app.getPath("userData"), "settings.json")
  let appearance: AppearanceMode = "system"

  async function loadSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf-8")
      appearance = (JSON.parse(raw) as { appearance?: AppearanceMode }).appearance || "system"
    } catch {
      appearance = "system"
    }
    nativeTheme.themeSource = appearance === "light" || appearance === "dark" ? appearance : "system"
    setTrayAppearance(appearance)
  }

  async function saveSettings() {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(settingsPath, JSON.stringify({ appearance }, null, 2), "utf-8")
  }

  // --- Session ---

  let session: Session | null = null

  function emit(event: SessionEvent) {
    chat.send("session", event)
  }

  // --- IPC ---

  ipcMain.on("ready", () => chat.markReady())

  // Create one session, reuse across turns to preserve conversation history
  session = new Session(emit)

  ipcMain.on("session", (_event, command: SessionCommand) => {
    if (command.type === "start") {
      if (session!.running) return
      void session!.start(randomUUID(), command.text, command.skill)
    }
    if (command.type === "cancel") {
      session!.cancel()
    }
  })

  ipcMain.handle("transcribe", (_event, input) => transcribe(input))

  ipcMain.handle("skills:list", async () => {
    const notion = await loadNotion()
    return notion.skills.map((s) => ({
      id: s.title.toLowerCase().replace(/\s+/g, "-"),
      name: s.title,
      description: "",
    }))
  })

  // --- Trigger ---

  const trigger = await createTriggerListener({
    onTriggerHoldStart: () => {
      if (session?.running || !chat.isVisible()) return
      chat.send("dictation", { type: "start" })
    },
    onTriggerHoldEnd: () => {
      if (session?.running || !chat.isVisible()) return
      chat.send("dictation", { type: "stop" })
    },
    onTriggerTap: () => {
      if (session?.running) return
      chat.toggle()
    },
    onEscape: () => {
      session?.cancel()
      session = null
    },
  })

  // --- Startup ---

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) chat.createChatWindow()
  })

  await loadSettings()
  chat.createChatWindow()

  createSystemTray({
    onShowWindow: () => chat.show(),
    onAppearanceChange: async (mode: AppearanceMode) => {
      appearance = mode
      nativeTheme.themeSource = mode === "light" || mode === "dark" ? mode : "system"
      setTrayAppearance(mode)
      await saveSettings()
    },
    onQuit: () => app.quit(),
  })

  app.on("will-quit", () => {
    trigger.stop()
    destroyTray()
  })
})

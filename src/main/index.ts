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
import { getSkillCatalog, getSkillContent } from "./clients/skills"
import { transcribeAudio, isTranscriptionConfigured } from "./clients/transcribe"
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
    if (event.type === "done" || event.type === "error") {
      session = null
    }
  }

  // Mark renderer ready (flushes pending events)
  ipcMain.on("ready", () => chat.markReady())

  // Session channel: bidirectional
  ipcMain.on("session", (_event, command: SessionCommand) => {
    if (command.type === "start") {
      if (session?.running) return
      session = new Session(emit)
      // TODO: if command.skill, load skill content and prepend to system message
      void session.start(randomUUID(), command.text)
    }
    if (command.type === "cancel") {
      session?.cancel()
      session = null
    }
  })

  // --- Request/response handlers ---

  ipcMain.handle("dictation:transcribe", async (_event, payload = {}) => {
    if (!isTranscriptionConfigured()) {
      return { success: false, error: "Voice transcription not configured." }
    }
    try {
      const result = await transcribeAudio({
        audio: String(payload.audio || ""),
        filename: payload.filename || "recording.webm",
      })
      return { success: true, text: String(result?.text || "") }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle("skills:list", async () => {
    return getSkillCatalog().map((s) => ({
      id: s.name,
      name: s.name,
      description: s.description,
    }))
  })

  // --- Trigger ---

  const trigger = await createTriggerListener({
    onTriggerHoldStart: () => {
      if (session?.running || !chat.isVisible()) return
      chat.send("dictation:command", { type: "start" })
    },
    onTriggerHoldEnd: () => {
      if (session?.running || !chat.isVisible()) return
      chat.send("dictation:command", { type: "stop" })
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

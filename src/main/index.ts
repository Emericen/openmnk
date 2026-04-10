import "dotenv/config"
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron"
import { randomUUID } from "node:crypto"
import fs from "fs/promises"
import path from "path"
import { electronApp, optimizer } from "@electron-toolkit/utils"
import {
  createSystemTray,
  destroyTray,
  setTrayAppearance,
} from "./windows/tray"
import * as chat from "./windows/chat"
import { createTriggerListener } from "./listener/trigger"
import { QueryClient } from "./query/client"
import { getSkillCatalog } from "./query/skills"
import {
  transcribeAudio,
  isTranscriptionConfigured,
} from "./processes/transcribe"
import type {
  DictationTranscribeInput,
  DictationTranscribeResult,
  QueryInitResult,
  QueryEvent,
} from "../shared/ipc-contract"

type AppearanceMode = "light" | "dark" | "system"

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.openmnk")
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const settingsPath = path.join(app.getPath("userData"), "settings.json")
  let appearance: AppearanceMode = "system"

  // Query client: emits events to the chat window
  let queryRunning = false
  const queryClient = new QueryClient((payload: QueryEvent) => {
    chat.sendEvent(payload)
    if (payload.type === "done") {
      queryRunning = false
    }
  })

  async function loadSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf-8")
      const parsed = JSON.parse(raw) as { appearance?: AppearanceMode }
      appearance = parsed?.appearance || "system"
    } catch {
      appearance = "system"
    }
    applyAppearance()
  }

  function applyAppearance() {
    nativeTheme.themeSource =
      appearance === "light" || appearance === "dark" ? appearance : "system"
    setTrayAppearance(appearance)
  }

  async function saveSettings() {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ appearance: appearance || "system" }, null, 2),
      "utf-8"
    )
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length !== 0) return
    chat.createChatWindow()
  })

  async function transcribeDictation(
    payload: Partial<DictationTranscribeInput> = {}
  ): Promise<DictationTranscribeResult> {
    if (!isTranscriptionConfigured()) {
      return {
        success: false,
        error: "Voice transcription not configured. Set TRANSCRIBE_BASE_URL and TRANSCRIBE_API_KEY in .env",
      }
    }
    try {
      const result = await transcribeAudio({
        audio: String(payload.audio || ""),
        filename: payload.filename || "recording.webm",
      })
      return { success: true, text: String(result?.text || "") }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  // IPC handlers
  ipcMain.handle("query:init", async (): Promise<QueryInitResult> => {
    chat.markReady()
    return { success: true, messages: [] }
  })

  ipcMain.handle(
    "query:start",
    async (_event, payload: { query?: string } = {}) => {
      const query = String(payload.query || "").trim()
      if (!query) return { success: false, error: "Empty query" }
      if (queryRunning) return { success: false, error: "Query already running" }

      const queryId = randomUUID()
      queryRunning = true
      void queryClient.start(queryId, query)
      return { success: true, queryId }
    }
  )

  ipcMain.handle("query:cancel", async () => {
    queryClient.cancel()
    return { success: true }
  })

  ipcMain.handle("dictation:transcribe", async (_event, payload = {}) =>
    transcribeDictation(payload)
  )

  ipcMain.handle("skills:list", async () => {
    const skills = getSkillCatalog().map((s) => ({
      id: s.name,
      title: s.name,
      search_text: s.description,
    }))
    return { success: true, skills }
  })

  const triggerListener = await createTriggerListener({
    onTriggerHoldStart: () => {
      if (queryRunning || !chat.isVisible()) return
      chat.sendDictation({ type: "start" })
    },
    onTriggerHoldEnd: () => {
      if (queryRunning || !chat.isVisible()) return
      chat.sendDictation({ type: "stop" })
    },
    onTriggerTap: async () => {
      if (queryRunning) return
      chat.toggle()
    },
    onEscape: async () => {
      if (!queryRunning) return
      queryClient.cancel()
    },
  })

  try {
    await loadSettings()
  } catch {
    // defaults already set
  }

  chat.createChatWindow()

  createSystemTray({
    onShowWindow: () => chat.show(),
    onAppearanceChange: async (mode: AppearanceMode) => {
      appearance = mode
      applyAppearance()
      await saveSettings()
    },
    onQuit: () => app.quit(),
  })

  app.on("will-quit", () => {
    triggerListener.stop()
    destroyTray()
  })
})

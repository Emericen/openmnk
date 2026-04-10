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
  setTrayChatWindowMode,
} from "./windows/tray"
import { createWindowsSurface } from "./windows/index"
import {
  setChatWindowMode,
  setChatWindowContentProtection,
  recreateChatWindow,
  type ChatWindowMode,
} from "./windows/chat"
import { createTriggerListener } from "./listener/trigger"
import { QueryClient } from "./query"
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
type SettingsData = {
  appearance?: AppearanceMode
  chatWindowMode?: ChatWindowMode
}

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
  let chatMode: ChatWindowMode = "windowed"

  const ui = createWindowsSurface()

  // Query client: emits events to the chat window
  let queryRunning = false
  const queryClient = new QueryClient((payload: QueryEvent) => {
    ui.chat.send(payload)
    if (payload.type === "done") {
      queryRunning = false
    }
  })

  async function loadSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf-8")
      const parsed = JSON.parse(raw) as SettingsData
      appearance = parsed?.appearance || "system"
      chatMode = parsed?.chatWindowMode || "windowed"
    } catch {
      appearance = "system"
      chatMode = "windowed"
    }
    applyAppearance()
    applyChatWindowMode()
  }

  function applyAppearance() {
    nativeTheme.themeSource =
      appearance === "light" || appearance === "dark" ? appearance : "system"
    setTrayAppearance(appearance)
  }

  function applyChatWindowMode() {
    setChatWindowMode(chatMode)
    setTrayChatWindowMode(chatMode)
  }

  async function saveSettings() {
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          appearance: appearance || "system",
          chatWindowMode: chatMode || "windowed",
        },
        null,
        2
      ),
      "utf-8"
    )
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length !== 0) return
    ui.initWindows()
  })

  async function transcribeDictation(
    payload: Partial<DictationTranscribeInput> = {}
  ): Promise<DictationTranscribeResult> {
    if (!isTranscriptionConfigured()) {
      return {
        success: false,
        error:
          "Voice transcription not configured. Set TRANSCRIBE_BASE_URL and TRANSCRIBE_API_KEY in .env",
      }
    }
    try {
      console.log("[dictation] transcribing audio...")
      const result = await transcribeAudio({
        audio: String(payload.audio || ""),
        filename: payload.filename || "recording.webm",
      })
      console.log("[dictation] result:", {
        success: true,
        textLength: result?.text?.length,
      })
      return { success: true, text: String(result?.text || "") }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[dictation] error:", message)
      return { success: false, error: message }
    }
  }

  // IPC handlers
  ipcMain.handle("query:init", async (): Promise<QueryInitResult> => {
    ui.chat.markReady()
    return { success: true, messages: [] }
  })

  ipcMain.handle(
    "query:start",
    async (
      _event,
      payload: { query?: string; threadId?: string | null } = {}
    ) => {
      const query = String(payload.query || "").trim()
      if (!query) return { success: false, error: "Empty query" }
      if (queryRunning) {
        return { success: false, error: "Query already running" }
      }

      const queryId = randomUUID()
      queryRunning = true
      // Run in background, don't await
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
      if (queryRunning) return
      if (!ui.chat.isVisible()) return
      ui.chat.sendDictation({ type: "start" })
    },
    onTriggerHoldEnd: () => {
      if (queryRunning) return
      if (!ui.chat.isVisible()) return
      ui.chat.sendDictation({ type: "stop" })
    },
    onTriggerTap: async () => {
      if (queryRunning) return
      ui.chat.toggle()
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

  await ui.initWindows()

  createSystemTray({
    onShowWindow: () => {
      ui.chat.show()
    },
    onAppearanceChange: async (mode: AppearanceMode) => {
      appearance = mode
      applyAppearance()
      await saveSettings()
    },
    onChatWindowModeChange: async (mode: ChatWindowMode) => {
      chatMode = mode
      setChatWindowMode(mode)
      setTrayChatWindowMode(mode)
      recreateChatWindow()
      ui.chat.show()
      await saveSettings()
    },
    onQuit: () => app.quit(),
  })

  app.on("will-quit", () => {
    triggerListener.stop()
    destroyTray()
  })
})

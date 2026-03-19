import "dotenv/config"
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron"
import fs from "fs/promises"
import path from "path"
import { electronApp, optimizer } from "@electron-toolkit/utils"
import {
  createSystemTray,
  destroyTray,
  setTrayAppearance,
} from "./windows/tray"
import { hideLauncherWindow } from "./windows/launcher"
import { createWindowsSurface } from "./windows/index"
import { createTriggerListener } from "./listener/trigger"
import { createController } from "./controller/index"
import { createQueryProcess } from "./query"
import {
  transcribeAudio,
  isTranscriptionConfigured,
} from "./processes/transcribe"
import type {
  DictationTranscribeInput,
  DictationTranscribeResult,
  QueryInitResult,
} from "../shared/ipc-contract"

// Dev toggle: force every query to run through the mock query runner.
const FORCE_MOCK_QUERY_RUNNER = false
type AppearanceMode = "light" | "dark" | "system"

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron")
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const controller = createController()
  const settingsPath = path.join(app.getPath("userData"), "settings.json")
  let appearance: AppearanceMode = "system"

  const ui = createWindowsSurface()

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
    ui.initWindows()
  })

  const queryProcess = createQueryProcess({
    forceMockQuery: FORCE_MOCK_QUERY_RUNNER,
    controller,
    ui,
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

  ipcMain.handle("query:init", async (): Promise<QueryInitResult> => {
    ui.chat.markReady()
    return { success: true, messages: [] }
  })

  ipcMain.handle(
    "query:start",
    async (
      _event,
      payload: { query?: string; threadId?: string | null } = {}
    ) =>
      queryProcess.start({
        source: "chat",
        query: String(payload.query || ""),
        threadId: payload.threadId,
      } as never)
  )

  ipcMain.handle("query:cancel", async () => queryProcess.cancel())

  ipcMain.handle("dictation:transcribe", async (_event, payload = {}) =>
    transcribeDictation(payload)
  )

  ipcMain.handle("skills:list", async () => {
    return { success: true, skills: [] }
  })

  ipcMain.on(
    "launcher:submit",
    async (_event, payload: { query?: string } = {}) => {
      const query = String(payload.query || "").trim()
      if (!query) return
      hideLauncherWindow()
      await queryProcess.start({ source: "query", query, threadId: null })
    }
  )

  ipcMain.on("launcher:dismiss", () => {
    hideLauncherWindow()
  })

  const triggerListener = await createTriggerListener({
    onTriggerHoldStart: () => {
      if (queryProcess.getInteractionState() !== "idle") return
      if (!ui.chat.isVisible()) return
      ui.chat.sendDictation({ type: "start" })
    },
    onTriggerHoldEnd: () => {
      if (queryProcess.getInteractionState() !== "idle") return
      if (!ui.chat.isVisible()) return
      ui.chat.sendDictation({ type: "stop" })
    },
    onTriggerTap: async () => {
      if (queryProcess.hasPendingAction()) {
        await queryProcess.resolvePendingActionDecision(true)
        return
      }
      if (queryProcess.getInteractionState() !== "idle") return
      ui.chat.toggle()
    },
    onEscape: async () => {
      const state = queryProcess.getInteractionState()
      if (state !== "active_query" && state !== "pending_action") return
      await queryProcess.cancel({ reason: "user_interrupt" })
    },
  })
  ui.initWindows()
  createSystemTray({
    onAppearanceChange: async (mode: AppearanceMode) => {
      appearance = mode
      applyAppearance()
      await saveSettings()
    },
    onQuit: () => app.quit(),
  })

  try {
    await loadSettings()
    await controller.runFirstTimeOnboarding()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn("First time onboarding failed:", message)
  }

  app.on("will-quit", () => {
    controller.cleanup()
    triggerListener.stop()
    destroyTray()
  })
})

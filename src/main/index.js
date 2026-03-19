import "dotenv/config"
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron"
import fs from "fs/promises"
import path from "path"
import { electronApp, optimizer } from "@electron-toolkit/utils"
import {
  createSystemTray,
  destroyTray,
  setTrayAppearance
} from "./windows/tray.js"
import { createWindowsSurface } from "./windows/index.js"
import { createTriggerListener } from "./listener/trigger.js"
import { createController } from "./controller/index.js"
import { createQueryProcess } from "./processes/query.js"
import { createRecordingProcess } from "./processes/recording.js"
import { transcribeAudio, isTranscriptionConfigured } from "./processes/transcribe.js"

// Dev toggle: force every query to run through the mock query runner.
const FORCE_MOCK_QUERY_RUNNER = false

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
  let appearance = "system"

  const ui = createWindowsSurface()

  async function loadSettings() {
    try {
      const raw = await fs.readFile(settingsPath, "utf-8")
      const parsed = JSON.parse(raw)
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
    ui
  })
  const recordingProcess = createRecordingProcess({ ui })

  async function transcribeDictation(payload = {}) {
    if (payload.type !== "transcribe") {
      return { success: false, error: "Unknown dictation action" }
    }

    if (!isTranscriptionConfigured()) {
      return {
        success: false,
        error: "Voice transcription not configured. Set TRANSCRIBE_BASE_URL and TRANSCRIBE_API_KEY in .env"
      }
    }

    try {
      const result = await transcribeAudio({
        audio: payload.audio,
        filename: payload.filename || "recording.webm"
      })
      return { success: true, text: String(result?.text || "") }
    } catch (error) {
      return { success: false, error: String(error?.message || error) }
    }
  }

  ipcMain.handle("query", async (_event, payload = {}) => {
    if (payload.type === "init") {
      ui.chat.markReady()
      return { success: true, messages: [] }
    }

    if (payload.type === "start") {
      return queryProcess.start({
        source: "chat",
        query: payload.query,
        threadId: payload.threadId || null
      })
    }

    if (payload.type === "cancel") {
      return queryProcess.cancel()
    }

    return { success: false, error: "Unknown query action" }
  })

  ipcMain.handle("dictation", async (_event, payload = {}) =>
    transcribeDictation(payload)
  )

  ipcMain.handle("skills", async (_event, _payload = {}) => {
    return { success: true, skills: [] }
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
    }
  })
  ui.initWindows()
  createSystemTray({
    onAppearanceChange: async (mode) => {
      appearance = mode
      applyAppearance()
      await saveSettings()
    },
    onQuit: () => app.quit()
  })

  try {
    await loadSettings()
    await controller.runFirstTimeOnboarding()
  } catch (error) {
    console.warn("First time onboarding failed:", error.message)
  }

  app.on("will-quit", () => {
    controller.cleanup()
    triggerListener.stop()
    destroyTray()
  })
})

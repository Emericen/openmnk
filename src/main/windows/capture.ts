import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
  shell,
} from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"
import type { CaptureCommand } from "../../shared/ipc-contract"

type CaptureFrameMessage = { data: string | null }
type CaptureRecordingMessage = { data: number[] }
type CapturePayload = {
  type: "request-frame"
  highlightPosition?: { x: number; y: number }
  highlightType?: "spotlight" | "crosshair"
}

let captureWindow: BrowserWindow | null = null

function getCaptureUrl(): string | null {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}/capture/capture.html`
  }
  return null
}

export async function createCaptureWindow() {
  captureWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  })

  // Auto-approve screen capture requests so getUserMedia works without a dialog
  captureWindow.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const source = sources[0]
          if (source) {
            callback({ video: source })
          } else {
            callback({})
          }
        })
        .catch(() => callback({}))
    }
  )

  captureWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  const captureUrl = getCaptureUrl()
  if (captureUrl) {
    captureWindow.loadURL(captureUrl)
  } else {
    captureWindow.loadFile(join(__dirname, "../renderer/capture/capture.html"))
  }

  const captureScreenshot = async (
    x?: number,
    y?: number,
    highlightType: "spotlight" | "crosshair" = "spotlight"
  ): Promise<string | null> => {
    try {
      if (!captureWindow || captureWindow.isDestroyed()) return null
      const window = captureWindow

      return await new Promise<string | null>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Capture frame timeout")),
          5000
        )

        const handler = (
          _event: Electron.IpcMainEvent,
          message: CaptureFrameMessage
        ) => {
          clearTimeout(timeout)
          ipcMain.removeListener("capture:frame", handler)
          resolve(message.data)
        }

        ipcMain.on("capture:frame", handler)

        const payload: CapturePayload = { type: "request-frame" }
        if (x !== undefined && y !== undefined) {
          payload.highlightPosition = { x, y }
          payload.highlightType = highlightType
        }
        window.webContents.send("capture:command", payload)
      })
    } catch (error) {
      console.error("Failed to capture frame:", error)
      return null
    }
  }

  const stopRecording = () =>
    new Promise<Buffer | null>((resolve) => {
      if (!captureWindow || captureWindow.isDestroyed()) {
        resolve(null)
        return
      }
      const window = captureWindow

      const timeout = setTimeout(() => {
        ipcMain.removeListener("capture:recording", handler)
        resolve(null)
      }, 30000)

      const handler = (
        _event: Electron.IpcMainEvent,
        message: CaptureRecordingMessage
      ) => {
        clearTimeout(timeout)
        ipcMain.removeListener("capture:recording", handler)
        resolve(Buffer.from(message.data || []))
      }

      ipcMain.on("capture:recording", handler)
      window.webContents.send("capture:command", {
        type: "stop-capture",
      })
    })

  // Wait for the renderer JS to load and register its IPC listeners,
  // then send the screen source ID to start the MediaStream.
  await new Promise<void>((resolve) => {
    const window = captureWindow
    if (!window) {
      resolve()
      return
    }

    const onReady = async () => {
      ipcMain.removeListener("capture:ready", readyHandler)
      console.log("[capture] renderer ready, sending source-id")
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 },
        })
        const sourceId = sources[0]?.id
        if (sourceId) {
          window.webContents.send("capture:command", {
            type: "source-id",
            sourceId,
          })
        } else {
          console.warn("[capture] No screen sources found")
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn("[capture] Failed to get screen sources:", msg)
      }
      resolve()
    }

    // The renderer sends "capture:ready" once its onCommand listener is set up
    const readyHandler = () => {
      void onReady()
    }
    ipcMain.once("capture:ready", readyHandler)

    // Fallback: if ready signal doesn't arrive in 5s, try anyway
    setTimeout(() => {
      ipcMain.removeListener("capture:ready", readyHandler)
      console.warn("[capture] ready signal timeout, attempting anyway")
      void onReady()
    }, 5000)
  })

  return {
    window: captureWindow,
    captureScreenshot,
    stopRecording,
    destroy() {
      if (captureWindow && !captureWindow.isDestroyed()) {
        captureWindow.close()
      }
      captureWindow = null
    },
  }
}

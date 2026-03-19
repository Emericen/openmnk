import { BrowserWindow, desktopCapturer, ipcMain, shell } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"
import type { CaptureCommand } from "../../shared/ipc-contract"

type CaptureFrameMessage = { type: "frame"; data: string | null }
type CaptureRecordingMessage = { type: "recording"; data: number[] }
type CapturePayload =
  | Extract<CaptureCommand, { type: "request-frame" }>
  | {
      type: "source-id"
      sourceId: string
    }
  | { type: "stop-capture" }

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
          if (message.type !== "frame") return
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
        if (message.type !== "recording") return
        clearTimeout(timeout)
        ipcMain.removeListener("capture:recording", handler)
        resolve(Buffer.from(message.data || []))
      }

      ipcMain.on("capture:recording", handler)
      window.webContents.send("capture:command", {
        type: "stop-capture",
      })
    })

  await new Promise<void>((resolve) => {
    const window = captureWindow
    if (!window) {
      resolve()
      return
    }

    window.once("ready-to-show", async () => {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 },
      })
      window.webContents.send("capture:command", {
        type: "source-id",
        sourceId: sources[0]?.id,
      })
      resolve()
    })
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

import { BrowserWindow, desktopCapturer, ipcMain, shell } from "electron"
import { join } from "path"
import { is } from "@electron-toolkit/utils"

let captureWindow = null

function getCaptureUrl() {
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
      sandbox: false
    }
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

  const captureScreenshot = async (x, y, highlightType = "spotlight") => {
    try {
      if (!captureWindow || captureWindow.isDestroyed()) return null

      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Capture frame timeout")),
          5000
        )

        const handler = (_event, message) => {
          if (message.type !== "frame") return
          clearTimeout(timeout)
          ipcMain.removeListener("vision", handler)
          resolve(message.data)
        }

        ipcMain.on("vision", handler)

        const payload = { type: "request-frame" }
        if (x !== undefined && y !== undefined) {
          payload.highlightPosition = { x, y }
          payload.highlightType = highlightType
        }
        captureWindow.webContents.send("vision", payload)
      })
    } catch (error) {
      console.error("Failed to capture frame:", error)
      return null
    }
  }

  const stopRecording = () =>
    new Promise((resolve) => {
      if (!captureWindow || captureWindow.isDestroyed()) {
        resolve(null)
        return
      }

      const timeout = setTimeout(() => {
        ipcMain.removeListener("vision", handler)
        resolve(null)
      }, 30000)

      const handler = (_event, message) => {
        if (message.type !== "recording") return
        clearTimeout(timeout)
        ipcMain.removeListener("vision", handler)
        resolve(Buffer.from(message.data || []))
      }

      ipcMain.on("vision", handler)
      captureWindow.webContents.send("vision", { type: "stop-capture" })
    })

  await new Promise((resolve) => {
    captureWindow.once("ready-to-show", async () => {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 0, height: 0 }
      })
      captureWindow.webContents.send("vision", {
        type: "source-id",
        sourceId: sources[0]?.id
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
    }
  }
}

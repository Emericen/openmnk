import { app } from "electron"
import { mkdir, writeFile } from "fs/promises"
import { join } from "path"

import { createCaptureWindow } from "../windows/capture.js"

export function createRecordingProcess({ ui }) {
  let capture = null

  async function start() {
    if (capture) {
      return { success: false, error: "Recording already in progress" }
    }
    capture = await createCaptureWindow()
    return { success: true }
  }

  async function stop() {
    if (!capture) {
      return { success: false, error: "No active recording" }
    }

    const current = capture
    capture = null

    let videoBuffer = null
    try {
      videoBuffer = await current.stopRecording()
    } finally {
      current.destroy()
    }

    if (!videoBuffer?.length) {
      return { success: false, error: "No video recorded" }
    }

    // Save locally
    const recDir = join(
      app.getPath("userData"),
      "recordings",
      `rec-${Date.now()}`
    )
    await mkdir(recDir, { recursive: true })
    await writeFile(join(recDir, "recording.webm"), videoBuffer)
    console.log(`[recording] saved to ${recDir}`)

    return { success: true }
  }

  return {
    isRecording() {
      return Boolean(capture)
    },
    start,
    stop
  }
}

import os from "os"
import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import sharp from "sharp"
import { desktopCapturer, screen } from "electron"

const execFileAsync = promisify(execFile)

export function createScreenListener() {
  let scaleX = 1
  let scaleY = 1
  let lastScreenshotWidth = 1280
  let lastScreenshotHeight = 720

  function toScreenshotPixels(x, y) {
    const nx = Number(x)
    const ny = Number(y)
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return { x: 0, y: 0 }

    const width = Math.max(1, lastScreenshotWidth || 1)
    const height = Math.max(1, lastScreenshotHeight || 1)

    if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
      return {
        x: Math.round(nx * width),
        y: Math.round(ny * height)
      }
    }

    if (nx >= 0 && nx <= 1000 && ny >= 0 && ny <= 1000) {
      return {
        x: Math.round((nx / 1000) * width),
        y: Math.round((ny / 1000) * height)
      }
    }

    return { x: Math.round(nx), y: Math.round(ny) }
  }

  function toScreenPoint(x, y) {
    const screenshotPoint = toScreenshotPixels(x, y)

    let nextScaleX = scaleX
    let nextScaleY = scaleY
    if (process.platform === "darwin") {
      const displayScale = screen.getPrimaryDisplay()?.scaleFactor || 1
      nextScaleX = scaleX / displayScale
      nextScaleY = scaleY / displayScale
    }

    return {
      x: Math.round(screenshotPoint.x * nextScaleX),
      y: Math.round(screenshotPoint.y * nextScaleY)
    }
  }

  async function takeScreenshot() {
    if (process.platform === "darwin") {
      try {
        const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`)
        await execFileAsync("screencapture", ["-x", "-t", "jpg", tempPath])

        const imageBuffer = await fs.promises.readFile(tempPath)
        await fs.promises.unlink(tempPath)
        const originalMeta = await sharp(imageBuffer).metadata()

        const resizedBuffer = await sharp(imageBuffer)
          .resize({ height: 720 })
          .jpeg({ quality: 80 })
          .toBuffer()

        const base64 = resizedBuffer.toString("base64")
        const resizedMeta = await sharp(resizedBuffer).metadata()
        scaleX = originalMeta.width / resizedMeta.width
        scaleY = originalMeta.height / resizedMeta.height
        lastScreenshotWidth = resizedMeta.width
        lastScreenshotHeight = resizedMeta.height

        return {
          success: true,
          base64,
          width: resizedMeta.width,
          height: resizedMeta.height
        }
      } catch (error) {
        console.error("Failed to capture and resize screenshot:", error)
        return { success: false, error: error.message }
      }
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      if (sources.length === 0) throw new Error("No screen sources available")

      const source = sources[0]
      const originalSize = source.thumbnail.getSize()
      const resizedBuffer = await sharp(source.thumbnail.toPNG())
        .resize({ height: 720 })
        .jpeg({ quality: 80 })
        .toBuffer()

      const resizedMeta = await sharp(resizedBuffer).metadata()
      const base64 = resizedBuffer.toString("base64")
      scaleX = originalSize.width / resizedMeta.width
      scaleY = originalSize.height / resizedMeta.height
      lastScreenshotWidth = resizedMeta.width
      lastScreenshotHeight = resizedMeta.height

      return {
        success: true,
        base64,
        width: resizedMeta.width,
        height: resizedMeta.height
      }
    } catch (error) {
      console.error(
        "Failed to capture screenshot using desktopCapturer:",
        error
      )
      return { success: false, error: error.message }
    }
  }

  async function takeScreenshotWithAnnotation(dots) {
    const screenshot = await takeScreenshot()
    if (!screenshot.success) return screenshot

    try {
      const normalizedDots = dots.map((dot) => {
        const pixel = toScreenshotPixels(dot.x, dot.y)
        return { ...dot, x: pixel.x, y: pixel.y }
      })

      const overlays = normalizedDots.map((dot) => ({
        input: Buffer.from(`
          <svg width="140" height="140">
            <circle cx="70" cy="70" r="60" fill="yellow" opacity="0.3" stroke="yellow" stroke-width="3" stroke-opacity="0.6"/>
            <circle cx="70" cy="70" r="5" fill="red" opacity="0.9"/>
            <text x="88" y="78" text-anchor="start" fill="red" font-size="30">${
              dot.label || ""
            }</text>
          </svg>
        `),
        top: Math.max(0, dot.y - 70),
        left: Math.max(0, dot.x - 70)
      }))

      const annotated = await sharp(Buffer.from(screenshot.base64, "base64"))
        .composite(overlays)
        .jpeg({ quality: 80 })
        .toBuffer()

      return {
        success: true,
        base64: annotated.toString("base64"),
        width: screenshot.width,
        height: screenshot.height
      }
    } catch (error) {
      console.error("Failed to annotate screenshot:", error)
      return { success: false, error: error.message }
    }
  }

  return {
    toScreenPoint,
    takeScreenshot,
    takeScreenshotWithAnnotation
  }
}

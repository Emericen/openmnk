import os from "os"
import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import sharp from "sharp"
import { desktopCapturer, screen } from "electron"

const execFileAsync = promisify(execFile)

type ScreenPoint = { x: number; y: number }
type AnnotationDot = ScreenPoint & { label?: string }
type ScreenshotResult =
  | { success: true; base64: string; width: number; height: number }
  | { success: false; error: string }

export type ExternalCaptureFn = () => Promise<string | null>
export type ContentProtectionFn = (enabled: boolean) => void

export function createScreenListener() {
  let scaleX = 1
  let scaleY = 1
  let lastScreenshotWidth = 1280
  let lastScreenshotHeight = 720
  let externalCapture: ExternalCaptureFn | null = null
  let contentProtectionFn: ContentProtectionFn | null = null

  function setContentProtection(fn: ContentProtectionFn) {
    contentProtectionFn = fn
  }

  function setExternalCapture(fn: ExternalCaptureFn) {
    externalCapture = fn
  }

  function toScreenshotPixels(x: unknown, y: unknown): ScreenPoint {
    const nx = Number(x)
    const ny = Number(y)
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return { x: 0, y: 0 }

    const width = Math.max(1, lastScreenshotWidth || 1)
    const height = Math.max(1, lastScreenshotHeight || 1)

    // All coordinates use the 0-1000 scale (0 = left/top edge, 1000 = right/bottom edge)
    return {
      x: Math.round((Math.max(0, Math.min(1000, nx)) / 1000) * width),
      y: Math.round((Math.max(0, Math.min(1000, ny)) / 1000) * height),
    }
  }

  function toScreenPoint(x: unknown, y: unknown): ScreenPoint {
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
      y: Math.round(screenshotPoint.y * nextScaleY),
    }
  }

  async function takeScreenshot(): Promise<ScreenshotResult> {
    contentProtectionFn?.(true)
    try {
      return await takeScreenshotInner()
    } finally {
      contentProtectionFn?.(false)
    }
  }

  async function takeScreenshotInner(): Promise<ScreenshotResult> {
    if (externalCapture) {
      try {
        const dataUrl = await externalCapture()
        if (dataUrl) {
          const base64Match = dataUrl.match(
            /^data:image\/[^;]+;base64,(.+)$/
          )
          const rawBase64 = base64Match?.[1] ?? dataUrl
          const originalBuffer = Buffer.from(rawBase64, "base64")
          const originalMeta = await sharp(originalBuffer).metadata()
          const origW = originalMeta.width ?? 1920
          const origH = originalMeta.height ?? 1080

          const resizedBuffer = await sharp(originalBuffer)
            .resize({ height: 720 })
            .jpeg({ quality: 80 })
            .toBuffer()

          const resizedMeta = await sharp(resizedBuffer).metadata()
          const resW = resizedMeta.width ?? Math.round(origW * (720 / origH))
          const resH = resizedMeta.height ?? 720

          scaleX = origW / resW
          scaleY = origH / resH
          lastScreenshotWidth = resW
          lastScreenshotHeight = resH

          return {
            success: true,
            base64: resizedBuffer.toString("base64"),
            width: resW,
            height: resH,
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn("External capture failed, falling back:", message)
      }
    }

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
          height: resizedMeta.height,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("Failed to capture and resize screenshot:", error)
        return { success: false, error: message }
      }
    }

    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1920, height: 1080 },
      })
      const source = sources[0]
      if (!source) throw new Error("No screen sources available")
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
        height: resizedMeta.height,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        "Failed to capture screenshot using desktopCapturer:",
        error
      )
      return { success: false, error: message }
    }
  }

  async function takeScreenshotWithAnnotation(
    dots: AnnotationDot[]
  ): Promise<ScreenshotResult> {
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
        left: Math.max(0, dot.x - 70),
      }))

      const annotated = await sharp(Buffer.from(screenshot.base64, "base64"))
        .composite(overlays)
        .jpeg({ quality: 80 })
        .toBuffer()

      return {
        success: true,
        base64: annotated.toString("base64"),
        width: screenshot.width,
        height: screenshot.height,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("Failed to annotate screenshot:", error)
      return { success: false, error: message }
    }
  }

  return {
    toScreenPoint,
    takeScreenshot,
    takeScreenshotWithAnnotation,
    setExternalCapture,
    setContentProtection,
  }
}

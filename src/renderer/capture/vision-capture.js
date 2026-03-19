class ScreenCapture {
  constructor(screenWidth, screenHeight) {
    this.stream = null
    this.isCapturing = false
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight
    this.videoElement = null
    this.canvas = null
    this.canvasContext = null
    this.mediaRecorder = null
    this.recordedChunks = []
  }

  async startCapture(sourceId) {
    if (this.isCapturing) return true

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            minWidth: this.screenWidth,
            maxWidth: this.screenWidth,
            minHeight: this.screenHeight,
            maxHeight: this.screenHeight
          }
        }
      })

      const videoTrack = this.stream.getVideoTracks()[0]
      if (!videoTrack) {
        console.error("Failed to start capture: no video track")
        return false
      }

      this.videoElement = document.createElement("video")
      this.videoElement.srcObject = this.stream
      this.videoElement.style.position = "absolute"
      this.videoElement.style.top = "-9999px"
      this.videoElement.style.left = "-9999px"
      this.videoElement.style.pointerEvents = "none"
      this.videoElement.width = this.screenWidth
      this.videoElement.height = this.screenHeight
      this.videoElement.autoplay = true
      this.videoElement.muted = true
      document.body.appendChild(this.videoElement)

      this.canvas = document.createElement("canvas")
      this.canvas.width = this.screenWidth
      this.canvas.height = this.screenHeight
      this.canvasContext = this.canvas.getContext("2d")

      await new Promise((resolve) => {
        if (this.videoElement.readyState >= 2) {
          resolve()
          return
        }
        this.videoElement.onloadeddata = resolve
      })

      this.recordedChunks = []
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: "video/webm"
      })
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.recordedChunks.push(event.data)
      }
      this.mediaRecorder.start()

      this.isCapturing = true
      return true
    } catch (error) {
      console.error("Failed to start capture:", error)
      return false
    }
  }

  async stopCapture() {
    if (!this.isCapturing) return null

    let videoBuffer = null
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      videoBuffer = await new Promise((resolve) => {
        this.mediaRecorder.onstop = async () => {
          const blob = new Blob(this.recordedChunks, { type: "video/webm" })
          resolve(await blob.arrayBuffer())
        }
        this.mediaRecorder.stop()
      })
    }
    this.mediaRecorder = null
    this.recordedChunks = []

    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null

    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement.remove()
      this.videoElement = null
    }

    this.canvas = null
    this.canvasContext = null
    this.isCapturing = false
    return videoBuffer
  }

  async captureFrame(options = {}) {
    if (!this.videoElement || !this.canvas || !this.canvasContext) {
      return null
    }
    if (this.videoElement.readyState < 2) return null

    this.canvasContext.drawImage(
      this.videoElement,
      0,
      0,
      this.screenWidth,
      this.screenHeight
    )

    if (options.highlightPosition) {
      const { x, y } = options.highlightPosition
      const pixelX = x * this.screenWidth
      const pixelY = y * this.screenHeight
      const highlightType = options.highlightType || "spotlight"

      if (highlightType === "crosshair") {
        this.drawCrosshair(pixelX, pixelY)
      } else {
        this.drawSpotlight(pixelX, pixelY)
      }
    }

    return this.canvas.toDataURL("image/jpeg", 0.9)
  }

  drawSpotlight(x, y, radius = 90, alpha = 0.35) {
    this.canvasContext.beginPath()
    this.canvasContext.arc(x, y, radius, 0, 2 * Math.PI)
    this.canvasContext.fillStyle = `rgba(255, 235, 0, ${alpha})`
    this.canvasContext.fill()
  }

  drawCrosshair(x, y) {
    const ctx = this.canvasContext
    const width = this.screenWidth
    const height = this.screenHeight
    ctx.save()
    ctx.setLineDash([8, 6])
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)"
    ctx.lineWidth = 2

    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, 2 * Math.PI)
    ctx.fillStyle = "rgba(255, 0, 0, 0.9)"
    ctx.fill()
    ctx.restore()
  }
}

let screenCapture = null
let isRecording = false

if (!window.api) {
  console.error("window.api is not available")
} else {
  window.api.on("vision", async (message) => {
    if (message.type === "source-id") {
      const { width, height } = window.screen
      const capture = new ScreenCapture(width, height)
      const started = await capture.startCapture(message.sourceId)
      if (started) {
        screenCapture = capture
        isRecording = true
      }
      return
    }

    if (message.type === "request-frame") {
      if (!screenCapture || !isRecording) {
        window.api.send("vision", { type: "frame", data: null })
        return
      }

      const frame = await screenCapture.captureFrame({
        highlightPosition: message.highlightPosition,
        highlightType: message.highlightType
      })
      window.api.send("vision", { type: "frame", data: frame })
      return
    }

    if (message.type === "stop-capture") {
      if (!screenCapture) {
        window.api.send("vision", { type: "recording", data: [] })
        return
      }

      const arrayBuffer = await screenCapture.stopCapture()
      screenCapture = null
      isRecording = false
      window.api.send("vision", {
        type: "recording",
        data: arrayBuffer ? Array.from(new Uint8Array(arrayBuffer)) : []
      })
    }
  })
}

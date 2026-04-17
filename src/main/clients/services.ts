/**
 * Connection to the OpenMNK API server.
 * WebSocket for agent sessions. HTTP for dictation.
 * Tool execution (run_command, view) stays local.
 */

import { randomUUID } from "node:crypto"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { app } from "electron"
import WebSocket from "ws"
import { run as runCommand } from "./terminal"
import { readFile } from "node:fs/promises"
import type { SessionEvent } from "../../types/ipc"

import { is } from "@electron-toolkit/utils"

const SERVER_URL = is.dev ? "http://localhost:8080" : "https://api.openmnk.com"

function getDeviceId(): string {
  const path = join(app.getPath("userData"), "device.json")
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"))
    if (data.id) return data.id
  } catch {}
  const id = randomUUID()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ id }), "utf-8")
  return id
}

type EventCallback = (event: SessionEvent) => void

export class ServerConnection {
  private ws: WebSocket | null = null
  private onEvent: EventCallback
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private deviceId: string

  constructor(onEvent: EventCallback) {
    this.onEvent = onEvent
    this.deviceId = getDeviceId()
  }

  connect(): void {
    if (this.ws) return

    const wsBase = SERVER_URL.replace(/^http/, "ws")
    const url = `${wsBase}/ws/${this.deviceId}`
    console.log(`[services] connecting to ${url}`)
    this.ws = new WebSocket(url)

    this.ws.on("open", () => console.log("[services] connected"))

    this.ws.on("message", async (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.type === "execute") {
        await this.handleExecute(msg)
        return
      }
      this.onEvent(msg as SessionEvent)
    })

    this.ws.on("close", () => {
      console.log("[services] disconnected")
      this.ws = null
      this.scheduleReconnect()
    })

    this.ws.on("error", (err) => {
      console.error("[services] error:", err.message)
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  private async handleExecute(msg: {
    id: string
    name: string
    args: Record<string, string>
  }): Promise<void> {
    try {
      let result: Record<string, string>

      if (msg.name === "run_command") {
        const output = await runCommand(String(msg.args.cmd || ""))
        result = {
          type: "text",
          content: output.slice(0, 10000),
          description: String(msg.args.description || "Running command..."),
        }
      } else if (msg.name === "view") {
        const filePath = String(msg.args.path || "")
        const buffer = await readFile(filePath)
        const isJpeg = filePath.toLowerCase().endsWith(".jpg") || filePath.toLowerCase().endsWith(".jpeg")
        const mime = isJpeg ? "image/jpeg" : "image/png"
        const base64 = buffer.toString("base64")
        result = {
          type: "image",
          content: `Image loaded (${Math.round(buffer.length / 1024)}KB)`,
          url: `data:${mime};base64,${base64}`,
          description: `Viewing image: ${filePath}`,
        }
      } else {
        result = {
          type: "text",
          content: `Unknown tool: ${msg.name}`,
          description: msg.name,
        }
      }

      this.send({ type: "tool-result", id: msg.id, result })
    } catch (error) {
      this.send({
        type: "tool-result",
        id: msg.id,
        result: {
          type: "text",
          content: `Tool error: ${error instanceof Error ? error.message : String(error)}`,
          description: msg.name,
        },
      })
    }
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  startSession(text: string): void {
    this.send({ type: "start", text })
  }

  cancel(): void {
    this.send({ type: "cancel" })
  }

  /** Transcribe audio via HTTP (not WebSocket). */
  async transcribe(input: { audio: string; filename?: string }): Promise<{
    success: boolean
    text?: string
    error?: string
  }> {
    try {
      const resp = await fetch(`${SERVER_URL}/dictation/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return await resp.json()
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }
}

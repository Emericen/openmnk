/**
 * WebSocket client for connecting to the OpenMNK API server.
 * Replaces the local LLM session — all LLM logic runs on the server.
 * Tool execution (run_command, view) still happens locally.
 */

import WebSocket from "ws"
import * as tools from "./tools"
import type { SessionEvent } from "../../types/ipc"

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:8080/ws"

type EventCallback = (event: SessionEvent) => void

export class ServerConnection {
  private ws: WebSocket | null = null
  private onEvent: EventCallback
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(onEvent: EventCallback) {
    this.onEvent = onEvent
  }

  connect(): void {
    if (this.ws) return

    console.log(`[ws] connecting to ${SERVER_URL}`)
    this.ws = new WebSocket(SERVER_URL)

    this.ws.on("open", () => {
      console.log("[ws] connected")
    })

    this.ws.on("message", async (data) => {
      const msg = JSON.parse(data.toString())

      if (msg.type === "execute") {
        // Server wants us to run a tool locally
        await this.handleExecute(msg)
        return
      }

      // Forward all other events to the renderer
      this.onEvent(msg as SessionEvent)
    })

    this.ws.on("close", () => {
      console.log("[ws] disconnected")
      this.ws = null
      this.scheduleReconnect()
    })

    this.ws.on("error", (err) => {
      console.error("[ws] error:", err.message)
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
      const result = await tools.execute(msg.name, msg.args)
      this.send({
        type: "tool-result",
        id: msg.id,
        result,
      })
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

  send(msg: Record<string, unknown>): void {
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

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }
}

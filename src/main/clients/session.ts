import OpenAI from "openai"
import { randomUUID } from "node:crypto"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import * as tools from "./tools"
import type {
  ChatCompletionMessageParam,
  ChatCompletionAssistantMessageParam,
} from "openai/resources/chat"
import type { ChatMessage, SessionEvent } from "../../types/ipc"

// Cloud mode: SERVER_URL set → proxy through our server
// OSS mode: SERVER_URL not set → user provides their own key
const SERVER_URL = process.env.SERVER_URL || ""
const LLM_BASE_URL = SERVER_URL
  ? `${SERVER_URL}/v1`
  : process.env.LLM_BASE_URL || ""
const LLM_API_KEY = SERVER_URL
  ? "openmnk" // server handles real key
  : process.env.LLM_API_KEY || ""
const LLM_MODEL = process.env.LLM_MODEL || "claude-sonnet-4-6"
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.0")
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "2048", 10)

// Unified data directory: ~/.openmnk/
const OPENMNK_HOME = join(homedir(), ".openmnk")

const HISTORY_PATH = SERVER_URL
  ? "" // cloud: server handles persistence
  : join(OPENMNK_HOME, "history.json")

const KNOWLEDGE_DIR = join(OPENMNK_HOME, "knowledge")

const DEFAULT_SYSTEM_MESSAGE = `You are a pragmatic desktop assistant that controls the user's computer via shell commands. Rules:
- Between tool calls, keep text to one short plain-text sentence. No markdown.
- All markdown and detailed responses go in your final message only.`

async function buildSystemMessage(): Promise<string> {
  if (SERVER_URL) {
    try {
      const resp = await fetch(`${SERVER_URL}/knowledge`)
      if (resp.ok) return await resp.text()
    } catch {}
    return DEFAULT_SYSTEM_MESSAGE
  }

  // OSS: load base.md + inject knowledge path
  try {
    const base = await readFile(join(KNOWLEDGE_DIR, "base.md"), "utf-8")
    return base + `\n\nYour knowledge directory is: ${KNOWLEDGE_DIR}`
  } catch {
    return (
      DEFAULT_SYSTEM_MESSAGE +
      `\n\nYour knowledge directory is: ${KNOWLEDGE_DIR}`
    )
  }
}

function formatError(error: unknown): string {
  if (!error) return "Unknown error"
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  return String(error)
}

function msg(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: randomUUID(), role, content: [{ type: "text", text }] }
}

function cmdMsg(
  description: string,
  cmd: string,
  output?: string
): ChatMessage {
  return {
    id: randomUUID(),
    role: "system",
    content: [{ type: "command", description, cmd, output }],
  }
}

export type SessionEmit = (event: SessionEvent) => void

export class Session {
  private emit: SessionEmit
  private openai: OpenAI
  private messages: ChatCompletionMessageParam[] = []
  private abortController: AbortController | null = null
  running = false

  constructor(emit: SessionEmit) {
    this.emit = emit
    if (!LLM_BASE_URL || !LLM_API_KEY) {
      console.warn("[session] LLM_BASE_URL or LLM_API_KEY not set.")
    }
    this.openai = new OpenAI({
      baseURL: LLM_BASE_URL || "https://api.openai.com/v1",
      apiKey: LLM_API_KEY || "not-set",
    })
  }

  get messageCount(): number {
    return this.messages.length
  }

  getHistory(): ChatMessage[] {
    return this.openaiToChat(this.messages)
  }

  async loadFromDisk(): Promise<void> {
    if (!HISTORY_PATH) return // cloud: server handles persistence
    try {
      const raw = await readFile(HISTORY_PATH, "utf-8")
      const parsed = JSON.parse(raw) as ChatCompletionMessageParam[]
      if (Array.isArray(parsed)) {
        this.messages = parsed
        console.log(`[session] loaded ${parsed.length} messages from disk`)
      }
    } catch {
      // No history file or parse error — start fresh
    }
  }

  async saveToDisk(): Promise<void> {
    if (!HISTORY_PATH) return // cloud: server handles persistence
    try {
      await mkdir(dirname(HISTORY_PATH), { recursive: true })
      await writeFile(HISTORY_PATH, JSON.stringify(this.messages), "utf-8")
    } catch (error) {
      console.warn("[session] failed to save history:", error)
    }
  }

  async start(text: string): Promise<void> {
    if (this.running) return
    this.running = true
    this.abortController = new AbortController()

    const trimmed = text.trim()
    this.messages.push({ role: "user", content: trimmed || "Hello" })

    // Show user message in renderer (skip for auto-greeting's hidden "Hello")
    if (trimmed) {
      this.emit({ type: "message", message: msg("user", trimmed) })
    }

    try {
      await this.loop()
    } catch (error) {
      if (this.abortController?.signal.aborted) return
      this.emit({ type: "error", text: formatError(error) })
    } finally {
      this.running = false
      this.abortController = null
      this.emit({ type: "done" })
      void this.saveToDisk()
    }
  }

  cancel(): void {
    this.abortController?.abort()
    this.running = false
  }

  private async loop(): Promise<void> {
    while (true) {
      if (this.abortController?.signal.aborted) return

      const systemMessage = await buildSystemMessage()
      const fullMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemMessage },
        ...this.compressMessagesForAPI(this.messages),
      ]

      const response = await this.openai.chat.completions.create(
        {
          model: LLM_MODEL,
          messages: fullMessages as never,
          tools: tools.definitions as never,
          tool_choice: "auto",
          temperature: LLM_TEMPERATURE,
          max_completion_tokens: LLM_MAX_TOKENS,
        },
        { signal: this.abortController?.signal }
      )

      const choice = response.choices[0]
      if (!choice) throw new Error("No response from LLM")

      const respMsg = choice.message
      const text = respMsg.content || ""
      const toolCalls = (respMsg.tool_calls || []).filter(
        (
          tc
        ): tc is typeof tc & {
          type: "function"
          function: { name: string; arguments: string }
        } => tc.type === "function"
      )

      const assistantMsg: ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      }
      this.messages.push(assistantMsg)

      // No tool calls — final response
      if (toolCalls.length === 0) {
        if (text) {
          this.emit({ type: "message", message: msg("assistant", text) })
          return
        }
        // Empty response — nudge the model to continue
        this.messages.push({ role: "user", content: "continue" })
        continue
      }

      // Has tool calls — show thought text if any
      if (text) this.emit({ type: "message", message: msg("system", text) })

      for (const tc of toolCalls) {
        if (this.abortController?.signal.aborted) return

        let args: Record<string, string>
        try {
          args = JSON.parse(tc.function.arguments)
        } catch {
          args = {}
        }

        const cmd = String(args.cmd || args.path || tc.function.name)

        try {
          // Emit loading command (no output yet)
          const loadingMsg = cmdMsg(
            String(args.description || tc.function.name),
            cmd
          )
          this.emit({ type: "message", message: loadingMsg })

          const result = await tools.execute(
            tc.function.name,
            args,
            this.abortController?.signal
          )

          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result.content,
          })

          if (result.type === "image") {
            this.messages.push({
              role: "user",
              content: [
                { type: "image_url", image_url: { url: result.url } },
              ] as unknown as string,
            })
          }

          // Update command with output (same id = replace)
          loadingMsg.content = [
            {
              type: "command",
              description: result.description,
              cmd,
              output: result.content,
            },
          ]
          this.emit({ type: "message", message: loadingMsg })
        } catch (error) {
          const errMsg = `Tool error: ${formatError(error)}`
          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: errMsg,
          })
          this.emit({ type: "message", message: msg("system", errMsg) })
        }
      }
    }
  }

  /**
   * Compress old tool results to reduce token usage before sending to LLM.
   * Keeps the last N messages intact; replaces older tool results with stubs.
   */
  private compressMessagesForAPI(
    messages: ChatCompletionMessageParam[],
    keepLast = 3
  ): ChatCompletionMessageParam[] {
    if (messages.length <= keepLast) return messages
    return messages.map((m, i) => {
      const isRecent = i >= messages.length - keepLast
      if (!isRecent && m.role === "tool") {
        return {
          ...m,
          content: `[tool_call_id: ${m.tool_call_id}] result completed, content truncated`,
        }
      }
      return m
    })
  }

  /** Convert OpenAI messages to ChatMessages for history */
  private openaiToChat(messages: ChatCompletionMessageParam[]): ChatMessage[] {
    const result: ChatMessage[] = []

    // Collect tool outputs for pairing with tool_calls
    const toolOutputs = new Map<string, string>()
    for (const m of messages) {
      if (m.role === "tool") {
        toolOutputs.set(m.tool_call_id, String(m.content))
      }
    }

    let seenAssistant = false
    for (const m of messages) {
      if (
        m.role === "system" ||
        m.role === "tool" ||
        m.role === "developer" ||
        m.role === "function"
      )
        continue

      if (m.role === "user") {
        if (typeof m.content !== "string") continue
        // Skip the hidden "Hello" used to trigger auto-greeting
        if (!seenAssistant && m.content === "Hello") continue
        result.push(msg("user", m.content))
        continue
      }

      seenAssistant = true

      if (m.role === "assistant") {
        const am = m as ChatCompletionAssistantMessageParam
        const text = typeof am.content === "string" ? am.content : ""
        const calls = am.tool_calls ?? []

        if (text && calls.length === 0) {
          result.push(msg("assistant", text))
          continue
        }

        if (text) result.push(msg("system", text))

        for (const tc of calls) {
          if (tc.type !== "function") continue
          let args: Record<string, string> = {}
          try {
            args = JSON.parse(tc.function.arguments)
          } catch {}
          result.push(
            cmdMsg(
              String(args.description || tc.function.name),
              String(args.cmd || args.path || tc.function.name),
              toolOutputs.get(tc.id)
            )
          )
        }
      }
    }

    return result
  }
}

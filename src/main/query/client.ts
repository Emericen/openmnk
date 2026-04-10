import { execSync } from "child_process"
import OpenAI from "openai"
import {
  getPlatformHint,
  LLM_API_KEY,
  LLM_BASE_URL,
  LLM_MAX_TOKENS,
  LLM_MODEL,
  LLM_TEMPERATURE,
  MAX_STEPS,
  SYSTEM_MESSAGE,
} from "./config"
import { TOOLS } from "./tools"
import type { QueryEmit, QueryRunner } from "./types"

type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

type ToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

function truncateBase64(text: string): string {
  return text.replace(
    /data:[^;]+;base64,[A-Za-z0-9+/=]{100,}/g,
    "[base64 truncated]"
  )
}

function formatError(error: unknown): string {
  if (!error) return "Unknown error"
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  return String(error)
}

export class QueryClient implements QueryRunner {
  private emit: QueryEmit
  private openai: OpenAI
  private messages: Message[] = []
  private abortController: AbortController | null = null
  private running = false

  constructor(emit: QueryEmit) {
    this.emit = emit
    if (!LLM_BASE_URL || !LLM_API_KEY) {
      console.warn("[query] LLM_BASE_URL or LLM_API_KEY not set.")
    }
    this.openai = new OpenAI({
      baseURL: LLM_BASE_URL || "https://api.openai.com/v1",
      apiKey: LLM_API_KEY || "not-set",
    })
  }

  async start(queryId: string, query: string): Promise<void> {
    if (this.running) return
    this.running = true
    this.abortController = new AbortController()

    this.messages.push({ role: "user", content: query.trim() })

    try {
      await this.loop(queryId)
    } catch (error) {
      if (this.abortController?.signal.aborted) return
      this.emit({
        type: "error",
        queryId,
        message: formatError(error),
      })
    } finally {
      this.running = false
      this.abortController = null
      this.emit({ type: "done", queryId })
    }
  }

  cancel(): void {
    this.abortController?.abort()
    this.running = false
  }

  clear(): void {
    if (this.running) return
    this.messages = []
  }

  private async loop(queryId: string): Promise<void> {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.abortController?.signal.aborted) return

      const systemMessage = SYSTEM_MESSAGE + getPlatformHint()
      const fullMessages: Message[] = [
        { role: "system", content: systemMessage },
        ...this.messages,
      ]

      // Log context (truncate base64 for readability)
      console.log(
        "[query] LLM call, messages:",
        truncateBase64(JSON.stringify(fullMessages, null, 2)).slice(0, 2000)
      )

      const response = await this.openai.chat.completions.create(
        {
          model: LLM_MODEL,
          messages: fullMessages as never,
          tools: TOOLS as never,
          tool_choice: "auto",
          temperature: LLM_TEMPERATURE,
          max_completion_tokens: LLM_MAX_TOKENS,
        },
        { signal: this.abortController?.signal }
      )

      const choice = response.choices[0]
      if (!choice) throw new Error("No response from LLM")

      const msg = choice.message
      const text = msg.content || ""
      const toolCalls = (msg.tool_calls || []) as ToolCall[]

      // Add assistant message to context
      const assistantMsg: Message = {
        role: "assistant",
        content: text || null,
      }
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls
      }
      this.messages.push(assistantMsg)

      if (toolCalls.length === 0) {
        // Final text response
        if (text) {
          this.emit({ type: "response", queryId, text })
        }
        return
      }

      // Emit thinking text if present alongside tool calls
      if (text) {
        this.emit({ type: "thought", queryId, text })
      }

      // Execute each tool call
      for (const tc of toolCalls) {
        if (this.abortController?.signal.aborted) return

        let args: { description?: string; cmd?: string }
        try {
          args = JSON.parse(tc.function.arguments)
        } catch {
          args = {}
        }

        const description = String(args.description || "Running command")
        const cmd = String(args.cmd || "")

        this.emit({ type: "command", queryId, description, cmd })

        let output: string
        try {
          output = execSync(cmd, {
            encoding: "utf-8",
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          })
        } catch (err) {
          const execErr = err as { stderr?: string; message?: string }
          output = `Error: ${execErr.stderr || execErr.message || "Command failed"}`
        }

        // Emit command with output
        this.emit({ type: "command", queryId, description, cmd, output })

        this.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: output.slice(0, 10000), // cap tool output
        })
      }
    }

    // Reached max steps
    this.emit({
      type: "response",
      queryId,
      text: "Reached maximum steps. Stopping.",
    })
  }
}

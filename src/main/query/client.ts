import { execSync } from "child_process"
import OpenAI from "openai"
import type { QueryEmit, QueryRunner } from "./types"

// --- Config ---

const LLM_BASE_URL = process.env.LLM_BASE_URL || ""
const LLM_API_KEY = process.env.LLM_API_KEY || ""
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4.1-mini"
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.0")
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "2048", 10)
const MAX_STEPS = parseInt(process.env.MAX_STEPS || "100", 10)

const SYSTEM_MESSAGE = `You are a pragmatic desktop assistant that controls the user's computer via shell commands.

You have one tool: run_command. Use it to execute any shell command. For GUI automation on macOS, use osascript/JXA. For screenshots, use screencapture. For file operations, use standard shell commands.

Rules:
- Between tool calls, keep text to one short plain-text sentence. No markdown.
- All markdown and detailed responses go in your final message only.
- Always check the screen state before acting when the user refers to something visual.
- If a command fails, try a different approach.
- Use run_command for everything: file ops, app control, screenshots, mouse/keyboard via osascript.`

function getPlatformHint(): string {
  if (process.platform === "darwin") {
    return "\nThe user is on macOS. Use osascript for GUI automation. Use 'cmd' for Mac shortcuts."
  }
  if (process.platform === "win32") {
    return "\nThe user is on Windows. Use PowerShell for automation. Use 'ctrl' for shortcuts."
  }
  if (process.platform === "linux") {
    return "\nThe user is on Linux. Use xdotool for GUI automation. Use 'ctrl' for shortcuts."
  }
  return ""
}

// --- Tool definition ---

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description:
        "Execute a shell command. Use for file operations, running scripts, osascript/JXA for GUI control, screenshots via screencapture, etc.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "What this command does (shown to user)",
          },
          cmd: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["description", "cmd"],
      },
    },
  },
]

// --- Helpers ---

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

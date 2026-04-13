import OpenAI from "openai"
import { run as runCommand } from "./terminal"
import { load as loadNotion } from "./notion"
import type { SessionEmit, Message, ToolCall } from "./types"

const LLM_BASE_URL = process.env.LLM_BASE_URL || ""
const LLM_API_KEY = process.env.LLM_API_KEY || ""
const LLM_MODEL = process.env.LLM_MODEL || ""
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.0")
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "2048", 10)

const DEFAULT_SYSTEM_MESSAGE = `You are a pragmatic desktop assistant that controls the user's computer via shell commands.Rules:
- Between tool calls, keep text to one short plain-text sentence. No markdown.
- All markdown and detailed responses go in your final message only.`

async function buildSystemMessage(skill?: string): Promise<string> {
  const notion = await loadNotion()
  let system = notion.system || DEFAULT_SYSTEM_MESSAGE

  if (skill) {
    const match = notion.skills.find(
      (s) => s.title.toLowerCase().replace(/\s+/g, "-") === skill
    )
    if (match) system += `\n\n${match.content}`
  }

  return system
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "execSync",
      description: `Node's built-in 'run a shell command and wait.' It spawns a new shell process for every call, runs the command, blocks until done, returns stdout as a string. No persistent session, no state between calls. cd /tmp in one call doesn't affect the next call. Note user's operating system is ${process.platform}.`,
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

function formatError(error: unknown): string {
  if (!error) return "Unknown error"
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  return String(error)
}

export class Session {
  private emit: SessionEmit
  private openai: OpenAI
  private messages: Message[] = []
  private abortController: AbortController | null = null
  private skill?: string
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

  async start(sessionId: string, text: string, skill?: string): Promise<void> {
    if (this.running) return
    this.running = true
    this.abortController = new AbortController()
    this.skill = skill

    this.messages.push({ role: "user", content: text.trim() })

    try {
      await this.loop(sessionId)
    } catch (error) {
      if (this.abortController?.signal.aborted) return
      this.emit({ type: "error", sessionId, message: formatError(error) })
    } finally {
      this.running = false
      this.abortController = null
      this.emit({ type: "done", sessionId })
    }
  }

  cancel(): void {
    this.abortController?.abort()
    this.running = false
  }

  private async loop(sessionId: string): Promise<void> {
    while (true) {
      if (this.abortController?.signal.aborted) return

      this.emit({ type: "thought", sessionId, text: "Thinking..." })

      const systemMessage = await buildSystemMessage(this.skill)
      const fullMessages: Message[] = [
        { role: "system", content: systemMessage },
        ...this.messages,
      ]

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

      const assistantMsg: Message = { role: "assistant", content: text || null }
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls
      this.messages.push(assistantMsg)

      if (toolCalls.length === 0) {
        if (text) this.emit({ type: "response", sessionId, text })
        return
      }

      if (text) this.emit({ type: "thought", sessionId, text })

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

        // Emit before execution (no output yet — shows loading in UI)
        this.emit({ type: "command", sessionId, description, cmd })

        const output = await runCommand(cmd, this.abortController?.signal)

        // Emit after execution (with output — updates the UI)
        this.emit({ type: "command", sessionId, description, cmd, output })

        this.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: output.slice(0, 10000),
        })
      }
    }
  }
}

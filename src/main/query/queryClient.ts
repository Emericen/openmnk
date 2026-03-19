import OpenAI from "openai"
import {
  getPlatformHint,
  LLM_API_KEY,
  LLM_BASE_URL,
  LLM_MAX_TOKENS,
  LLM_MODEL,
  LLM_TEMPERATURE,
  MAX_SCREENSHOT_MESSAGES,
  MAX_STEPS,
  SCREENSHOT_OMITTED_TEXT,
  SYSTEM_MESSAGE,
} from "./queryConfig"
import { TOOLS } from "./queryTools"
import {
  type AssistantMessage,
  type HistoryChangeHandler,
  type MessageContentPart,
  type QueryClientStartInput,
  type QueryClientToolResultInput,
  type QueryEmit,
  type QueryInferenceResult,
  type QueryMessage,
  type QueryRunState,
  type QueryRunner,
  type ToolArgs,
  type ToolCallRecord,
} from "./queryTypes"
import { clone, formatError } from "./queryUtils"

export class QueryClient implements QueryRunner {
  emit: QueryEmit
  onHistoryChange?: HistoryChangeHandler
  openai: OpenAI

  #state: QueryRunState = {
    queryId: null,
    isRunning: false,
    pendingCallId: null,
    history: [],
  }

  #messages: QueryMessage[] = []
  #pendingToolCalls: ToolCallRecord[] = []
  #runSteps = 0

  constructor({
    emit,
    onHistoryChange,
  }: {
    emit: QueryEmit
    onHistoryChange?: HistoryChangeHandler
  }) {
    this.emit = emit
    this.onHistoryChange = onHistoryChange

    if (!LLM_BASE_URL || !LLM_API_KEY) {
      console.warn(
        "[query] LLM_BASE_URL or LLM_API_KEY not set. Queries will fail."
      )
    }

    this.openai = new OpenAI({
      baseURL: LLM_BASE_URL || "https://api.openai.com/v1",
      apiKey: LLM_API_KEY || "not-set",
    })
  }

  isRunning() {
    return this.#state.isRunning
  }

  getHistory() {
    return clone(this.#state.history)
  }

  loadHistory(_history: unknown) {
    return false
  }

  clear() {
    if (this.#state.isRunning) return false
    this.#state.history = []
    this.#messages = []
    this.#pendingToolCalls = []
    this.#runSteps = 0
    this.#notifyHistory()
    return true
  }

  async start({ queryId, threadId: _threadId, query }: QueryClientStartInput) {
    if (!queryId || !query || !String(query).trim()) return false
    if (this.#state.isRunning) return false

    this.#state.queryId = queryId
    this.#state.isRunning = true
    this.#state.pendingCallId = null
    this.#runSteps = 0

    if (this.#pendingToolCalls.length > 0) {
      for (const orphaned of this.#pendingToolCalls) {
        this.#messages.push({
          role: "tool",
          tool_call_id: orphaned.id,
          content: JSON.stringify({
            status: "rejected",
            reason: "User interrupted. Ask what they would like to do instead.",
          }),
        })
      }
      this.#pendingToolCalls = []
    }

    const text = String(query).trim()
    this.#state.history.push({ role: "user", content: text })
    this.#notifyHistory()
    this.#messages.push({ role: "user", content: text })

    try {
      await this.#nextStep(queryId)
      return true
    } catch (error) {
      if (!this.#state.isRunning || this.#state.queryId !== queryId) return true
      this.emit({
        type: "error",
        queryId,
        code: "llm_error",
        message: formatError(error),
      })
      this.#finish(queryId, "failed")
      return false
    }
  }

  async submitToolResult({
    queryId,
    status,
    output,
  }: QueryClientToolResultInput) {
    if (!this.#state.isRunning || this.#state.queryId !== queryId) return false

    const normalizedStatus =
      status === "ok" || status === "rejected" || status === "error"
        ? status
        : "error"

    const currentCall = this.#pendingToolCalls.shift()
    if (!currentCall) return false

    const resultOutput: Record<string, unknown> = { ...(output || {}) }
    const screenshotImage = resultOutput.image
    delete resultOutput.image

    this.#messages.push({
      role: "tool",
      tool_call_id: currentCall.id,
      content: JSON.stringify({ status: normalizedStatus, ...resultOutput }),
    })

    if (typeof screenshotImage === "string" && screenshotImage) {
      this.#messages.push({
        role: "user",
        content: [
          { type: "text", text: "Here is the screenshot result." },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${screenshotImage}` },
          },
        ],
      })
    }

    this.#pruneScreenshots()
    this.#state.pendingCallId = null

    try {
      await this.#nextStep(queryId)
      return true
    } catch (error) {
      if (!this.#state.isRunning || this.#state.queryId !== queryId) return true
      this.emit({
        type: "error",
        queryId,
        code: "llm_error",
        message: formatError(error),
      })
      this.#finish(queryId, "failed")
      return false
    }
  }

  async cancel({ queryId }: { queryId?: string }) {
    if (!this.#state.isRunning) return false
    if (queryId && this.#state.queryId !== queryId) return false
    this.#resetActiveQuery()
    return true
  }

  #resetActiveQuery() {
    this.#state.queryId = null
    this.#state.isRunning = false
    this.#state.pendingCallId = null
    this.#pendingToolCalls = []
  }

  async #nextStep(queryId: string) {
    if (!this.#state.isRunning || this.#state.queryId !== queryId) return

    if (this.#pendingToolCalls.length > 0) {
      const next = this.#pendingToolCalls[0]
      this.#state.pendingCallId = next.id
      this.emit({
        type: "tool_call",
        queryId,
        callId: next.id,
        toolName: next.function.name,
        args: this.#parseArgs(next.function.arguments),
      })
      return
    }

    if (this.#runSteps >= MAX_STEPS) {
      this.#runSteps = 0
      this.#state.history.push({
        role: "assistant",
        content: "Reached max steps. Stopping.",
      })
      this.#notifyHistory()
      this.emit({
        type: "message",
        role: "assistant",
        queryId,
        text: "Reached max steps. Stopping.",
      })
      this.#finish(queryId, "completed")
      return
    }

    const result = await this.#inference()
    this.#runSteps += 1

    if (!this.#state.isRunning || this.#state.queryId !== queryId) return

    const text = String(result.text || "").trim()
    const toolCalls = result.toolCalls || []

    const assistantMessage: AssistantMessage = {
      role: "assistant",
      content: text,
    }
    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }))
    }
    this.#messages.push(assistantMessage)

    if (toolCalls.length > 0) {
      if (text) {
        this.#state.history.push({ role: "assistant", content: text })
        this.#notifyHistory()
        this.emit({ type: "message", role: "system", queryId, text })
      }

      this.#pendingToolCalls = toolCalls
      const first = this.#pendingToolCalls[0]
      this.#state.pendingCallId = first.id
      this.emit({
        type: "tool_call",
        queryId,
        callId: first.id,
        toolName: first.function.name,
        args: this.#parseArgs(first.function.arguments),
      })
      return
    }

    this.#runSteps = 0
    if (text) {
      this.#state.history.push({ role: "assistant", content: text })
      this.#notifyHistory()
      this.emit({ type: "message", role: "assistant", queryId, text })
    }
    this.#finish(queryId, "completed")
  }

  #inference(): Promise<QueryInferenceResult> {
    const systemMessage = SYSTEM_MESSAGE + getPlatformHint()
    const messages = [
      { role: "system", content: systemMessage },
      ...this.#messages,
    ]

    return this.openai.chat.completions
      .create({
        model: LLM_MODEL,
        messages: messages as never,
        tools: TOOLS as never,
        tool_choice: "auto",
        max_tokens: LLM_MAX_TOKENS,
        temperature: LLM_TEMPERATURE,
      })
      .then((response) => {
        const choice = response.choices[0].message
        return {
          text: choice.content || "",
          toolCalls: (choice.tool_calls || []) as ToolCallRecord[],
          promptTokens: response.usage?.prompt_tokens || 0,
        }
      })
  }

  #parseArgs(argsString: unknown): ToolArgs {
    if (
      argsString &&
      typeof argsString === "object" &&
      !Array.isArray(argsString)
    ) {
      return argsString as ToolArgs
    }

    try {
      return JSON.parse(String(argsString || "{}")) as ToolArgs
    } catch {
      return {}
    }
  }

  #pruneScreenshots() {
    const screenshotIndexes: number[] = []

    for (let i = 0; i < this.#messages.length; i += 1) {
      const msg = this.#messages[i]
      if (!Array.isArray(msg.content)) continue
      const hasImage = msg.content.some(
        (part: MessageContentPart) =>
          part.type === "image_url" &&
          typeof part.image_url.url === "string" &&
          part.image_url.url.startsWith("data:image/")
      )
      if (hasImage) screenshotIndexes.push(i)
    }

    if (screenshotIndexes.length <= MAX_SCREENSHOT_MESSAGES) return

    const toPrune = screenshotIndexes.slice(
      0,
      screenshotIndexes.length - MAX_SCREENSHOT_MESSAGES
    )

    for (const index of toPrune) {
      const msg = this.#messages[index]
      if (!Array.isArray(msg.content)) continue

      const kept = msg.content.filter(
        (part: MessageContentPart) => part.type !== "image_url"
      )
      const hasMarker = kept.some(
        (part: MessageContentPart) =>
          part.type === "text" && part.text.includes(SCREENSHOT_OMITTED_TEXT)
      )

      if (!hasMarker) {
        kept.push({ type: "text", text: SCREENSHOT_OMITTED_TEXT })
      }

      msg.content = kept
    }
  }

  #finish(queryId: string, outcome: "completed" | "failed") {
    if (!this.#state.isRunning || this.#state.queryId !== queryId) return
    this.#resetActiveQuery()
    this.emit({ type: "done", queryId, outcome })
  }

  #notifyHistory() {
    if (!this.onHistoryChange) return
    this.onHistoryChange({ history: this.getHistory() })
  }
}

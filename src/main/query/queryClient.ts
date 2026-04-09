import { generateText, stepCountIs, type ModelMessage, type ToolApprovalResponse } from "ai"
import {
  createLLMModel,
  getPlatformHint,
  LLM_MAX_TOKENS,
  LLM_TEMPERATURE,
  MAX_STEPS,
  MAX_SCREENSHOT_MESSAGES,
  SCREENSHOT_OMITTED_TEXT,
  SYSTEM_MESSAGE,
} from "./queryConfig"
import { createTools } from "./queryTools"
import {
  type HistoryChangeHandler,
  type QueryClientStartInput,
  type QueryClientToolResultInput,
  type QueryEmit,
  type QueryRunState,
  type QueryRunner,
  type ToolArgs,
} from "./queryTypes"
import { clone, formatError } from "./queryUtils"

type ToolExecutor = {
  execute: (
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

export class QueryClient implements QueryRunner {
  emit: QueryEmit
  onHistoryChange?: HistoryChangeHandler

  #controller: ToolExecutor
  #abortController: AbortController | null = null

  #state: QueryRunState = {
    queryId: null,
    isRunning: false,
    pendingCallId: null,
    history: [],
  }

  #messages: ModelMessage[] = []
  #approvalResolver: ((input: QueryClientToolResultInput) => void) | null = null

  constructor({
    emit,
    onHistoryChange,
    controller,
  }: {
    emit: QueryEmit
    onHistoryChange?: HistoryChangeHandler
    controller: ToolExecutor
  }) {
    this.emit = emit
    this.onHistoryChange = onHistoryChange
    this.#controller = controller
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
    this.#notifyHistory()
    return true
  }

  async start({ queryId, threadId: _threadId, query }: QueryClientStartInput) {
    if (!queryId || !query || !String(query).trim()) return false
    if (this.#state.isRunning) return false

    this.#state.queryId = queryId
    this.#state.isRunning = true
    this.#state.pendingCallId = null
    this.#abortController = new AbortController()

    const text = String(query).trim()
    this.#state.history.push({ role: "user", content: text })
    this.#notifyHistory()
    this.#messages.push({ role: "user", content: text })

    try {
      await this.#runLoop(queryId)
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

  async submitToolResult(input: QueryClientToolResultInput) {
    if (!this.#state.isRunning || this.#state.queryId !== input.queryId)
      return false
    if (this.#approvalResolver) {
      this.#approvalResolver(input)
      this.#approvalResolver = null
      return true
    }
    return false
  }

  async cancel({ queryId }: { queryId?: string }) {
    if (!this.#state.isRunning) return false
    if (queryId && this.#state.queryId !== queryId) return false
    this.#abortController?.abort()
    this.#approvalResolver = null
    this.#resetActiveQuery()
    return true
  }

  async #runLoop(queryId: string) {
    const model = createLLMModel()
    const tools = createTools(this.#controller)
    const systemMessage = SYSTEM_MESSAGE + getPlatformHint()

    while (this.#state.isRunning && this.#state.queryId === queryId) {
      // Prune old screenshots before each call
      this.#pruneScreenshots()

      // Log context size
      console.log(
        `[queryClient] generating, ${this.#messages.length} messages`
      )

      const result = await generateText({
        model,
        system: systemMessage,
        messages: this.#messages,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        temperature: LLM_TEMPERATURE,
        maxOutputTokens: LLM_MAX_TOKENS,
        abortSignal: this.#abortController?.signal,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        onStepFinish: ({ text, toolCalls }) => {
          // Emit transparency for each tool call as it happens
          for (const tc of toolCalls) {
            const toolName = tc.toolName
            const input = ("input" in tc ? tc.input : {}) as Record<string, unknown>

            // Emit tool_call event for UI transparency (but NOT for approval tools,
            // those will be handled via the approval request flow below)
            if (
              toolName === "screenshot" ||
              toolName === "run_command" ||
              toolName === "view_images"
            ) {
              this.emit({
                type: "tool_call",
                queryId,
                callId: tc.toolCallId,
                toolName,
                args: input,
              })
            }
          }

          // Emit intermediate text
          if (text && toolCalls.length > 0) {
            this.emit({
              type: "message",
              role: "system",
              queryId,
              text,
            })
          }
        },
      })

      // Check if cancelled during generation
      if (!this.#state.isRunning || this.#state.queryId !== queryId) return

      // Check for approval requests
      const approvalRequest = result.content.find(
        (p) => p.type === "tool-approval-request"
      )

      if (approvalRequest && approvalRequest.type === "tool-approval-request") {
        // This is a mouse/keyboard tool that needs user approval
        const toolCall = approvalRequest.toolCall
        this.#state.pendingCallId = approvalRequest.approvalId

        // Emit tool_call for the process layer to show approval overlay
        this.emit({
          type: "tool_call",
          queryId,
          callId: approvalRequest.approvalId,
          toolName: toolCall.toolName,
          args: (toolCall.input ?? {}) as Record<string, unknown>,
        })

        // Wait for user decision
        const decision = await new Promise<QueryClientToolResultInput>(
          (resolve) => {
            this.#approvalResolver = resolve
          }
        )

        if (!this.#state.isRunning || this.#state.queryId !== queryId) return

        const approved = decision.status === "ok"

        // Push the conversation forward with approval response
        this.#messages.push(...(result.response.messages as ModelMessage[]))

        const approvalResponse: ToolApprovalResponse = {
          type: "tool-approval-response",
          approvalId: approvalRequest.approvalId,
          approved,
          reason: approved
            ? undefined
            : "User declined. Ask what they would like to do instead.",
        }
        this.#messages.push({
          role: "tool",
          content: [approvalResponse],
        } as ModelMessage)

        this.#state.pendingCallId = null
        continue // Loop back to generateText
      }

      // No approval needed — generation complete
      const finalText = String(result.text || "").trim()
      if (finalText) {
        this.#state.history.push({ role: "assistant", content: finalText })
        this.#notifyHistory()
        this.emit({
          type: "message",
          role: "assistant",
          queryId,
          text: finalText,
        })
      }

      // Save full response messages for context continuity
      this.#messages.push(...(result.response.messages as ModelMessage[]))

      if (result.usage) {
        console.log(
          `[queryClient] tokens — input: ${result.usage.inputTokens}, output: ${result.usage.outputTokens}`
        )
      }

      this.#finish(queryId, "completed")
      return
    }
  }

  #pruneScreenshots() {
    const imageIndexes: number[] = []

    for (let i = 0; i < this.#messages.length; i++) {
      const msg = this.#messages[i]
      if (!msg || !Array.isArray(msg.content)) continue
      const hasImage = (msg.content as Array<{ type: string }>).some(
        (part) => part.type === "image"
      )
      if (hasImage) imageIndexes.push(i)
    }

    if (imageIndexes.length <= MAX_SCREENSHOT_MESSAGES) return

    const toPrune = imageIndexes.slice(
      0,
      imageIndexes.length - MAX_SCREENSHOT_MESSAGES
    )

    for (const index of toPrune) {
      this.#messages[index] = {
        role: "user",
        content: SCREENSHOT_OMITTED_TEXT,
      }
    }
  }

  #finish(queryId: string, outcome: "completed" | "failed") {
    if (!this.#state.isRunning || this.#state.queryId !== queryId) return
    this.#resetActiveQuery()
    this.emit({ type: "done", queryId, outcome })
  }

  #resetActiveQuery() {
    this.#state.queryId = null
    this.#state.isRunning = false
    this.#state.pendingCallId = null
    this.#abortController = null
    this.#approvalResolver = null
  }

  #notifyHistory() {
    if (!this.onHistoryChange) return
    this.onHistoryChange({ history: this.getHistory() })
  }
}

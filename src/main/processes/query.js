import { randomUUID } from "node:crypto"
import OpenAI from "openai"

function formatError(error) {
  if (!error) return "Unknown error"
  if (typeof error === "string") return error
  if (error.message) return error.message
  return String(error)
}

function clone(value) {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value || null))
  }
}

// ---------------------------------------------------------------------------
// LLM configuration (from environment)
// ---------------------------------------------------------------------------

const LLM_BASE_URL = process.env.LLM_BASE_URL || ""
const LLM_API_KEY = process.env.LLM_API_KEY || ""
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4.1-mini"
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.0")
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "2048", 10)
const MAX_STEPS = parseInt(process.env.MAX_STEPS || "100", 10)
const MAX_SCREENSHOT_MESSAGES = parseInt(process.env.MAX_SCREENSHOT_MESSAGES || "5", 10)
const SCREENSHOT_OMITTED_TEXT = "[Older screenshot omitted from context to reduce payload size.]"

// ---------------------------------------------------------------------------
// System message & tools (ported from services session.py)
// ---------------------------------------------------------------------------

const SYSTEM_MESSAGE = `You are a pragmatic desktop assistant that controls the user's computer. You are sharing user's screen and helping them navigate and accomplish tasks they don't know how to do.

The user is talking to you in a desktop chat window that sits on top of their screen UI like a overlay bubble. When the user talk to you, they can often be referring to what they are seeing on their screen. If it seems like they are using vague references, you should first take a look at their screen by using the screenshot tool.

IMPORTANT: Between tool calls, you MUST keep text to one short plain-text sentence. Do NOT use any markdown formatting (no bold, no lists, no headers, no code blocks) between tool calls. All markdown and detailed responses go in your final message only.
Use tools whenever they help complete the task.
If a tool call is rejected, you will receive a tool result indicating the rejection followed by the user's next message. Follow their lead.

Use the provided structured tool calls when needed.
If no tool is needed, provide a direct final response.`

const TOOLS = [
  {
    type: "function",
    function: {
      name: "screenshot",
      description: "Take a screenshot of the user's screen. Use this to see the current state before taking any action. The screenshot is resized to 720px height for processing. Screenshots do not require user approval.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "left_click",
      description: "Perform a left mouse click at the specified coordinates on the latest screenshot. Use values 0-1000 where 0 is left/top edge and 1000 is right/bottom edge. Examples: 500,500 is center; 0,0 is top-left; 1000,1000 is bottom-right. Use for buttons, links, text fields (to focus), and UI elements. The mouse will smoothly move to the location before clicking.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", minimum: 0, maximum: 1000, description: "X coordinate from 0 (left edge) to 1000 (right edge)" },
          y: { type: "integer", minimum: 0, maximum: 1000, description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)" }
        },
        required: ["x", "y"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "right_click",
      description: "Perform a right mouse click at the specified coordinates on the latest screenshot. Use values 0-1000 where 0 is left/top edge and 1000 is right/bottom edge. Used to open context menus and access secondary options.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", minimum: 0, maximum: 1000, description: "X coordinate from 0 (left edge) to 1000 (right edge)" },
          y: { type: "integer", minimum: 0, maximum: 1000, description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)" }
        },
        required: ["x", "y"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "double_click",
      description: "Perform a double left-click at the specified coordinates on the latest screenshot. Use values 0-1000 where 0 is left/top edge and 1000 is right/bottom edge. Used to open files/folders or select words in text.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", minimum: 0, maximum: 1000, description: "X coordinate from 0 (left edge) to 1000 (right edge)" },
          y: { type: "integer", minimum: 0, maximum: 1000, description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)" }
        },
        required: ["x", "y"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "Type text at the current cursor location. Ensure focus is set by clicking the target field first - this tool types but does not click. Supports letters, numbers, symbols, and unicode. Text is typed character-by-character.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type at current cursor location. Ensure the field is focused by clicking it first." }
        },
        required: ["text"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "keyboard_hotkey",
      description: "Press multiple keys simultaneously as a keyboard shortcut. All keys are pressed together and released together. Examples: ['ctrl', 'c'] for copy, ['alt', 'tab'] to switch windows, ['cmd', 'v'] for paste on Mac. Platform shortcuts: 'cmd' maps to Cmd on Mac and Ctrl on Windows. Use 'win' to press the Windows key (e.g. ['win'] to open Start menu). Valid keys: cmd, ctrl, alt, shift, win, tab, enter, escape, arrows, page_up, page_down, home, end, f1-f12, a-z, 0-9.",
      parameters: {
        type: "object",
        properties: {
          keys: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "cmd", "ctrl", "alt", "shift", "win", "tab", "enter", "return", "space",
                "backspace", "delete", "escape", "esc", "up", "down", "left", "right",
                "arrowup", "arrowdown", "arrowleft", "arrowright", "page_up", "page_down",
                "home", "end", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9",
                "f10", "f11", "f12", "a", "b", "c", "d", "e", "f", "g", "h", "i",
                "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v",
                "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"
              ]
            },
            description: "Array of keys to press simultaneously."
          }
        },
        required: ["keys"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "Scroll a scrollable area to reveal more content. Positive values reveal content BELOW (scroll down the page), negative values reveal content ABOVE (scroll up the page). Each unit is one scroll wheel step (~3 lines of text). Must position mouse in scrollable area first (use x, y coordinates).",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer", minimum: 0, maximum: 1000, description: "X coordinate (0-1000) within the scrollable area to position the mouse" },
          y: { type: "integer", minimum: 0, maximum: 1000, description: "Y coordinate (0-1000) within the scrollable area to position the mouse" },
          pixels: { type: "integer", minimum: -10, maximum: 10, description: "Number of scroll wheel steps. Positive = reveal content below (1 to 10), Negative = reveal content above (-1 to -10)." }
        },
        required: ["x", "y", "pixels"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "drag",
      description: "Drag from one point to another on the latest screenshot. Used for moving files, selecting text, dragging sliders, or repositioning UI elements. All coordinates use 0-1000 scale. x1,y1 is the starting point (grab), x2,y2 is the ending point (drop).",
      parameters: {
        type: "object",
        properties: {
          x1: { type: "integer", minimum: 0, maximum: 1000, description: "Starting X coordinate (0-1000)" },
          y1: { type: "integer", minimum: 0, maximum: 1000, description: "Starting Y coordinate (0-1000)" },
          x2: { type: "integer", minimum: 0, maximum: 1000, description: "Ending X coordinate (0-1000)" },
          y2: { type: "integer", minimum: 0, maximum: 1000, description: "Ending Y coordinate (0-1000)" }
        },
        required: ["x1", "y1", "x2", "y2"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "page_down",
      description: "Press the Page Down key to scroll down by one full page/screen.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "page_up",
      description: "Press the Page Up key to scroll up by one full page/screen.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  }
]

// ---------------------------------------------------------------------------
// QueryClient — calls LLM directly (no backend)
// ---------------------------------------------------------------------------

class QueryClient {
  #state = {
    queryId: null,
    isRunning: false,
    pendingCallId: null,
    history: []
  }

  // Full OpenAI conversation history (system + user + assistant + tool messages)
  #messages = []
  #pendingToolCalls = []
  #runSteps = 0

  constructor({ emit, onHistoryChange }) {
    this.emit = emit
    this.onHistoryChange = onHistoryChange

    if (!LLM_BASE_URL || !LLM_API_KEY) {
      console.warn("[query] LLM_BASE_URL or LLM_API_KEY not set. Queries will fail.")
    }

    this.openai = new OpenAI({
      baseURL: LLM_BASE_URL || "https://api.openai.com/v1",
      apiKey: LLM_API_KEY || "not-set"
    })
  }

  isRunning() {
    return this.#state.isRunning
  }

  getHistory() {
    return clone(this.#state.history)
  }

  loadHistory(_history) {
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

  #resetActiveQuery() {
    this.#state.queryId = null
    this.#state.isRunning = false
    this.#state.pendingCallId = null
    this.#pendingToolCalls = []
  }

  async start({ queryId, threadId, query }) {
    if (!queryId || !query || !String(query).trim()) return false
    if (this.#state.isRunning) return false

    this.#state.queryId = queryId
    this.#state.isRunning = true
    this.#state.pendingCallId = null
    this.#runSteps = 0

    // Auto-resolve any orphaned tool calls from a previous cancelled run
    if (this.#pendingToolCalls.length > 0) {
      for (const orphaned of this.#pendingToolCalls) {
        this.#messages.push({
          role: "tool",
          tool_call_id: orphaned.id,
          content: JSON.stringify({ status: "rejected", reason: "User interrupted. Ask what they would like to do instead." })
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
        message: formatError(error)
      })
      this.#finish(queryId, "failed")
      return false
    }
  }

  async submitToolResult({ queryId, status, output }) {
    if (!this.#state.isRunning || this.#state.queryId !== queryId) return false

    const normalizedStatus =
      status === "ok" || status === "rejected" || status === "error"
        ? status
        : "error"

    // Pop the first pending tool call
    const currentCall = this.#pendingToolCalls.shift()
    if (!currentCall) return false

    const resultOutput = { ...(output || {}) }
    const screenshotImage = resultOutput.image
    delete resultOutput.image

    this.#messages.push({
      role: "tool",
      tool_call_id: currentCall.id,
      content: JSON.stringify({ status: normalizedStatus, ...resultOutput })
    })

    // Append screenshot as a separate user message with image (same as session.py)
    if (typeof screenshotImage === "string" && screenshotImage) {
      this.#messages.push({
        role: "user",
        content: [
          { type: "text", text: "Here is the screenshot result." },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${screenshotImage}` }
          }
        ]
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
        message: formatError(error)
      })
      this.#finish(queryId, "failed")
      return false
    }
  }

  async cancel({ queryId }) {
    if (!this.#state.isRunning) return false
    if (queryId && this.#state.queryId !== queryId) return false
    // Just reset local state — no backend to notify
    this.#resetActiveQuery()
    return true
  }

  async #nextStep(queryId) {
    if (!this.#state.isRunning || this.#state.queryId !== queryId) return

    // If there are remaining pending tool calls from a batched response, emit the next one
    if (this.#pendingToolCalls.length > 0) {
      const next = this.#pendingToolCalls[0]
      this.#state.pendingCallId = next.id
      this.emit({
        type: "tool_call",
        queryId,
        callId: next.id,
        toolName: next.function.name,
        args: this.#parseArgs(next.function.arguments)
      })
      return
    }

    if (this.#runSteps >= MAX_STEPS) {
      this.#runSteps = 0
      this.#state.history.push({ role: "assistant", content: "Reached max steps. Stopping." })
      this.#notifyHistory()
      this.emit({ type: "message", role: "assistant", queryId, text: "Reached max steps. Stopping." })
      this.#finish(queryId, "completed")
      return
    }

    // Call the LLM
    const result = await this.#inference()
    this.#runSteps += 1

    if (!this.#state.isRunning || this.#state.queryId !== queryId) return

    const text = String(result.text || "").trim()
    const toolCalls = result.toolCalls || []

    // Append assistant message to conversation history
    const assistantMessage = { role: "assistant", content: text }
    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments }
      }))
    }
    this.#messages.push(assistantMessage)

    if (toolCalls.length > 0) {
      // Emit progress text as system message
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
        args: this.#parseArgs(first.function.arguments)
      })
      return
    }

    // No tool calls — final response
    this.#runSteps = 0
    if (text) {
      this.#state.history.push({ role: "assistant", content: text })
      this.#notifyHistory()
      this.emit({ type: "message", role: "assistant", queryId, text })
    }
    this.#finish(queryId, "completed")
  }

  #inference() {
    let platformHint = ""
    if (process.platform === "darwin") {
      platformHint = "\nThe user is on macOS. Use 'cmd' for Mac shortcuts (e.g. cmd+c for copy)."
    } else if (process.platform === "win32") {
      platformHint = "\nThe user is on Windows. Use 'ctrl' for shortcuts (e.g. ctrl+c for copy). Use 'win' to press the Windows key (e.g. open Start menu)."
    } else if (process.platform === "linux") {
      platformHint = "\nThe user is on Linux. Use 'ctrl' for shortcuts. Use 'super'/'win' for the Super key."
    }

    const systemMessage = SYSTEM_MESSAGE + platformHint
    const messages = [{ role: "system", content: systemMessage }, ...this.#messages]

    return this.openai.chat.completions
      .create({
        model: LLM_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: LLM_MAX_TOKENS,
        temperature: LLM_TEMPERATURE
      })
      .then((response) => {
        const choice = response.choices[0].message
        return {
          text: choice.content || "",
          toolCalls: choice.tool_calls || [],
          promptTokens: response.usage?.prompt_tokens || 0
        }
      })
  }

  #parseArgs(argsString) {
    if (typeof argsString === "object") return argsString || {}
    try {
      return JSON.parse(argsString || "{}")
    } catch {
      return {}
    }
  }

  #pruneScreenshots() {
    const screenshotIndexes = []
    for (let i = 0; i < this.#messages.length; i++) {
      const msg = this.#messages[i]
      if (!Array.isArray(msg.content)) continue
      const hasImage = msg.content.some(
        (part) =>
          part?.type === "image_url" &&
          typeof part?.image_url?.url === "string" &&
          part.image_url.url.startsWith("data:image/")
      )
      if (hasImage) screenshotIndexes.push(i)
    }

    if (screenshotIndexes.length <= MAX_SCREENSHOT_MESSAGES) return

    const toPrune = screenshotIndexes.slice(0, screenshotIndexes.length - MAX_SCREENSHOT_MESSAGES)
    for (const index of toPrune) {
      const msg = this.#messages[index]
      if (!Array.isArray(msg.content)) continue
      const kept = msg.content.filter((part) => part?.type !== "image_url")
      const hasMarker = kept.some(
        (part) => part?.type === "text" && String(part?.text || "").includes(SCREENSHOT_OMITTED_TEXT)
      )
      if (!hasMarker) {
        kept.push({ type: "text", text: SCREENSHOT_OMITTED_TEXT })
      }
      msg.content = kept
    }
  }

  #finish(queryId, outcome) {
    if (!this.#state.isRunning || this.#state.queryId !== queryId) return
    this.#resetActiveQuery()
    this.emit({ type: "done", queryId, outcome })
  }

  #notifyHistory() {
    if (!this.onHistoryChange) return
    this.onHistoryChange({ history: this.getHistory() })
  }
}

/*
Main/mock-query contract (single-query protocol)

Main -> mock-query:
- { type: "start", queryId, query, context? }
- { type: "tool_result", queryId, status: "ok" | "rejected" | "error", output }

mock-query -> Main (emit):
- { type: "message", role: "system" | "assistant", queryId, text }
- { type: "tool_call", queryId, callId, toolName, args }
- { type: "error", queryId, code, message }
- { type: "done", queryId, outcome: "completed" | "failed" }

tool_call shape:
- toolName: string
- args: object (tool-specific JSON payload)
- callId: required correlation id for tool_result

mock-query tool_call variants (same real tool surface as services query):
- screenshot / page_up / page_down: {}
- left_click / right_click / double_click: { x: number, y: number } // normalized 0..1000
- type_text: { text: string }
- keyboard_hotkey: { keys: string[] }
- scroll: { x: number, y: number, pixels: number } // normalized x,y
- drag: { x1: number, y1: number, x2: number, y2: number } // normalized 0..1000

Protocol rules:
- Every tool_call must be answered with exactly one tool_result (queue order).
- status:"rejected" is the expected path for user-denied actions.
- "final" text is the terminal assistant response before done:completed.
- Cancel resets local state only.
- "system" text is injected by index (or renderer) for UX status messages.
- The real query runner and mock query runner should emit assistant text only.
*/

function createMockQueryClient({ emit }) {
  let activeRun = null
  const mockLatencyMs = Math.max(
    0,
    Number(process.env.MOCK_QUERY_LATENCY_MS || 650)
  )

  function runStageWithLatency(run, stage, event) {
    setTimeout(() => {
      if (!activeRun) return
      if (activeRun.queryId !== run.queryId) return
      const done = stageHandlers[stage]?.({ run: activeRun, event })
      if (done) activeRun = null
    }, mockLatencyMs)
  }

  const stageHandlers = {
    0: ({ run }) => {
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "I'll show you the scaffolding flow step by step. Let me first take a look at your screen."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "1",
        toolName: "screenshot",
        args: {}
      })
      run.pendingToolCalls = [{ callId: "1" }]
      run.stage = 1
      return false
    },
    1: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "I saw your screen. I'll now do a right click."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "2",
        toolName: "right_click",
        args: { x: 500, y: 500 }
      })
      run.pendingToolCalls = [{ callId: "2" }]
      run.stage = 2
      return false
    },
    2: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "Done. Let me take another look before opening Terminal."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "3",
        toolName: "screenshot",
        args: {}
      })
      run.pendingToolCalls = [{ callId: "3" }]
      run.stage = 3
      return false
    },
    3: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "I'll open the system launcher."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "4",
        toolName: "keyboard_hotkey",
        args: {
          keys: [process.platform === "darwin" ? "command" : "control", "space"]
        }
      })
      run.pendingToolCalls = [{ callId: "4" }]
      run.stage = 4
      return false
    },
    4: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "Now I'll type Terminal."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "5",
        toolName: "type_text",
        args: { text: "Terminal" }
      })
      run.pendingToolCalls = [{ callId: "5" }]
      run.stage = 5
      return false
    },
    5: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "Then I'll press Enter."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "6",
        toolName: "keyboard_hotkey",
        args: { keys: ["enter"] }
      })
      run.pendingToolCalls = [{ callId: "6" }]
      run.stage = 6
      return false
    },
    6: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "I launched it. I'll take one more look."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "7",
        toolName: "screenshot",
        args: {}
      })
      run.pendingToolCalls = [{ callId: "7" }]
      run.stage = 7
      return false
    },
    7: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "Now I'll scroll a bit."
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "8",
        toolName: "scroll",
        args: { x: 500, y: 500, pixels: 420 }
      })
      run.pendingToolCalls = [{ callId: "8" }]
      run.stage = 8
      return false
    },
    8: ({ run }) => {
      run.pendingToolCalls.shift()
      emit({
        type: "message",
        role: "assistant",
        queryId: run.queryId,
        text: "Done. I completed the scaffolded actions: right click, launcher open, Terminal search, Enter, and scroll."
      })
      emit({ type: "done", queryId: run.queryId, outcome: "completed" })
      return true
    }
  }

  async function start({ queryId, threadId, query }) {
    if (!queryId || !query || isRunning()) return false
    activeRun = {
      queryId,
      threadId: threadId || queryId,
      query: String(query),
      stage: 0,
      pendingToolCalls: []
    }
    runStageWithLatency(activeRun, 0, null)
    return true
  }

  function submitToolResult({ queryId, status, output }) {
    if (!activeRun) return false
    if (activeRun.queryId !== queryId) return false
    if (!activeRun.pendingToolCalls?.length) return false

    if (status === "rejected") {
      emit({ type: "done", queryId: activeRun.queryId, outcome: "completed" })
      activeRun = null
      return true
    }

    if (status === "error") {
      emit({
        type: "error",
        queryId: activeRun.queryId,
        code: "tool_error",
        message: String(output?.error || "Action failed")
      })
      emit({ type: "done", queryId: activeRun.queryId, outcome: "failed" })
      activeRun = null
      return true
    }
    runStageWithLatency(activeRun, activeRun.stage, { status, output })
    return true
  }

  function isRunning() {
    return Boolean(activeRun)
  }

  function cancel({ queryId }) {
    if (!activeRun) return false
    if (queryId && activeRun.queryId !== queryId) return false
    activeRun = null
    return true
  }

  function clear() {
    return true
  }

  function loadHistory() {
    return true
  }

  function getHistory() {
    return []
  }

  return {
    start,
    submitToolResult,
    isRunning,
    cancel,
    clear,
    loadHistory,
    getHistory
  }
}

export function createQueryProcess({
  forceMockQuery,
  controller,
  ui
}) {
  const MIN_LOADING_VISIBLE_MS = Math.max(
    0,
    Number(process.env.TIP_LOADING_MIN_VISIBLE_MS || 280)
  )

  let queryClient = null
  let mockQueryClient = null
  let activeQuery = null
  let pendingAction = null
  let interruptionReason = null
  let loadingTipShownAt = null
  let queryState = QueryState.IDLE

  function makeQueryId() {
    return randomUUID()
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function isLoadingTipVisible() {
    return Number.isFinite(loadingTipShownAt)
  }

  function hasPendingAction() {
    return Boolean(pendingAction?.callId)
  }

  function hasActiveQuery() {
    return Boolean(activeQuery)
  }

  function isQueryCurrent(queryId) {
    return Boolean(activeQuery?.queryId && activeQuery.queryId === queryId)
  }

  function isExecutingAction() {
    return queryState === QueryState.WAITING_CONTROLLER && hasActiveQuery()
  }

  function getInteractionState() {
    if (queryState === QueryState.WAITING_USER && hasPendingAction()) {
      return "pending_action"
    }
    if (isExecutingAction()) {
      return "executing_action"
    }
    if (queryState === QueryState.WAITING_SERVICES && hasActiveQuery()) {
      return "active_query"
    }
    return "idle"
  }

  function getRunnerForKind(kind) {
    return kind === "mock" ? mockQueryClient : queryClient
  }

  function initializeRunners() {
    const emit = (payload) => {
      void handleQueryEvent(payload)
    }
    queryClient = new QueryClient({ emit })
    mockQueryClient = createMockQueryClient({ emit })
  }

  function showLoadingTip(text = "Working...") {
    ui.overlay.showLoading(text)
    loadingTipShownAt = Date.now()
  }

  function formatTextPreview(value, maxLength = 80) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
    if (!text) return ""
    if (text.length <= maxLength) return text
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`
  }

  function getToolTransparencyText(toolName, args = {}) {
    switch (toolName) {
      case "screenshot":
        return "taking a look..."
      case "left_click":
        return "left clicking..."
      case "right_click":
        return "right clicking..."
      case "double_click":
        return "double clicking..."
      case "type_text": {
        const preview = formatTextPreview(args.text)
        return preview
          ? `typing ${JSON.stringify(preview)}...`
          : "typing..."
      }
      case "keyboard_hotkey": {
        const keys = Array.isArray(args.keys)
          ? args.keys.map((key) => String(key || "").trim()).filter(Boolean)
          : []
        return keys.length
          ? `pressing ${keys.join(" + ")}...`
          : "pressing keyboard shortcut..."
      }
      case "scroll": {
        const steps = Math.round(Number(args.pixels || 0))
        const direction = steps > 0 ? "down" : steps < 0 ? "up" : ""
        const absSteps = Math.abs(steps)
        return `scrolling ${direction} ${absSteps} step${absSteps !== 1 ? "s" : ""}...`
      }
      case "drag":
        return "dragging..."
      case "page_down":
        return "pressing page down..."
      case "page_up":
        return "pressing page up..."
      default:
        return `running ${toolName}...`
    }
  }

  async function settleLoadingTip() {
    if (!isLoadingTipVisible()) return
    const elapsed = Date.now() - loadingTipShownAt
    if (elapsed < MIN_LOADING_VISIBLE_MS) {
      await wait(MIN_LOADING_VISIBLE_MS - elapsed)
    }
  }

  function clearLoadingTipTracking() {
    loadingTipShownAt = null
  }

  async function executePendingAction(pending) {
    ui.overlay.hide()
    return controller.execute(pending.toolName, pending.args || {})
  }

  async function buildActionPrompt(pending) {
    return controller.getConfirmationPrompt(
      pending.toolName,
      pending.args || {}
    )
  }

  async function previewPendingAction(pending) {
    try {
      await controller.preview(pending.toolName, pending.args || {})
    } catch (error) {
      console.warn(
        "Failed to render tool preview:",
        String(error?.message || error)
      )
    }
  }

  async function runEffects({ event, payload }) {
    switch (event) {
      case QueryEvent.QUERY_STARTED:
        interruptionReason = null
        break
      case QueryEvent.SERVICES_REQUESTED_AUTO_TOOL:
        if (payload?.query?.source === "chat") ui.chat.hide()
        showLoadingTip()
        break
      case QueryEvent.SERVICES_REQUESTED_APPROVAL:
        clearLoadingTipTracking()
        if (payload?.query?.source === "chat") ui.chat.hide()
        if (payload?.prompt) ui.overlay.showActionPrompt(payload.prompt)
        if (payload?.queryPayload) ui.chat.send(payload.queryPayload)
        break
      case QueryEvent.USER_APPROVED_ACTION:
        showLoadingTip()
        break
      case QueryEvent.USER_REJECTED_ACTION:
        showLoadingTip("Thinking...")
        break
      case QueryEvent.TOOL_FINISHED:
        showLoadingTip()
        break
      case QueryEvent.TOOL_FAILED:
        ui.overlay.showFailure(payload?.errorText || "Action failed.")
        if (payload?.query?.source === "chat") ui.chat.show()
        break
      case QueryEvent.QUERY_FINISHED:
        await settleLoadingTip()
        if (payload?.query?.source === "chat" && !interruptionReason) {
          ui.chat.show()
        }
        ui.overlay.hideAfter(payload?.outcome === "completed" ? 120 : 800)
        clearLoadingTipTracking()
        interruptionReason = null
        pendingAction = null
        activeQuery = null
        break
      case QueryEvent.QUERY_FAILED:
        await settleLoadingTip()
        clearLoadingTipTracking()
        ui.overlay.hide()
        {
          const msg = String(payload?.message || "")
          const isProviderError = /unavailable|overloaded|429|502/i.test(msg)
          if (isProviderError) {
            ui.chat.addSystemText(
              "LLM provider unavailable. Try again shortly."
            )
          } else {
            ui.chat.addSystemText(msg || "Something went wrong.")
          }
        }
        if (payload?.query?.source === "chat" || !payload?.query) {
          ui.chat.show()
        }
        interruptionReason = null
        pendingAction = null
        activeQuery = null
        break
      case QueryEvent.QUERY_CANCELLED:
        clearLoadingTipTracking()
        ui.overlay.hide()
        if (payload?.reason === "user_interrupt") {
          interruptionReason = "user_interrupt"
          ui.chat.addSystemText("Conversation interrupted.")
        } else if (payload?.notifyCancelledText && payload?.queryId) {
          ui.chat.addSystemText("Cancelled.", { queryId: payload.queryId })
        }
        if (payload?.query?.source === "chat" || !payload?.query) {
          ui.chat.show()
        }
        pendingAction = null
        activeQuery = null
        break
      default:
        break
    }
  }

  async function dispatch(event, payload = {}) {
    const nextState = QUERY_TRANSITIONS[queryState]?.[event]
    if (!nextState) {
      console.warn(
        `[queryProcess] Ignoring invalid transition: ${queryState} --${event}--> ?`
      )
      return false
    }

    queryState = nextState
    await runEffects({ event, payload })
    return true
  }

  async function resolvePendingActionDecision(approved) {
    if (!pendingAction?.callId) {
      return { success: false, error: "No pending action" }
    }

    const pending = pendingAction
    pendingAction = null

    const runner = getRunnerForKind(pending.query.runnerKind)

    if (!approved) {
      await dispatch(QueryEvent.USER_REJECTED_ACTION)
      const runner = getRunnerForKind(pending.query.runnerKind)
      await runner.submitToolResult({
        queryId: pending.query.queryId,
        status: "rejected",
        output: {
          reason:
            "User declined this action. Ask what they would like to do instead."
        }
      })
      return { success: true, approved: false }
    }

    await dispatch(QueryEvent.USER_APPROVED_ACTION)

    try {
      const result = await executePendingAction(pending)
      if (!isQueryCurrent(pending.query.queryId)) {
        return { success: false, cancelled: true }
      }
      await dispatch(QueryEvent.TOOL_FINISHED)
      await runner.submitToolResult({
        queryId: pending.query.queryId,
        status: "ok",
        output: result || { done: true }
      })
      return { success: true, approved: true }
    } catch (error) {
      const errorText = String(error?.message || "Unknown error")
      await dispatch(QueryEvent.TOOL_FAILED, {
        query: pending.query,
        errorText
      })
      await runner.submitToolResult({
        queryId: pending.query.queryId,
        status: "error",
        output: { error: errorText }
      })
      return { success: false, error: errorText }
    }
  }

  async function handleQueryEvent(payload) {
    if (!payload?.type) return

    const hasQueryId = Boolean(payload.queryId)
    const active =
      activeQuery && hasQueryId && payload.queryId === activeQuery.queryId
        ? activeQuery
        : null

    // Drop stale events from cancelled/old runs so renderer state does not desync.
    if (hasQueryId && !active) return

    if (payload.type === "tool_call" && active) {
      await settleLoadingTip()
      const pending = {
        query: active,
        callId: payload.callId,
        toolName: payload.toolName,
        args: payload.args || {}
      }
      const transparencyText = getToolTransparencyText(
        pending.toolName,
        pending.args
      )
      if (transparencyText) {
        ui.chat.addSystemText(transparencyText, { queryId: active.queryId })
      }

      if (!controller.requiresApproval(payload.toolName)) {
        await dispatch(QueryEvent.SERVICES_REQUESTED_AUTO_TOOL, {
          query: active
        })
        try {
          const result = await executePendingAction(pending)
          if (!isQueryCurrent(active.queryId)) {
            return
          }
          await dispatch(QueryEvent.TOOL_FINISHED)
          await getRunnerForKind(active.runnerKind).submitToolResult({
            queryId: active.queryId,
            status: "ok",
            output: result || { done: true }
          })
        } catch (error) {
          const errorText = String(error?.message || "Unknown error")
          await dispatch(QueryEvent.TOOL_FAILED, { query: active, errorText })
          await getRunnerForKind(active.runnerKind).submitToolResult({
            queryId: active.queryId,
            status: "error",
            output: { error: errorText }
          })
        }
        return
      }

      pendingAction = pending
      await previewPendingAction(pending)
      const prompt = await buildActionPrompt(pending)
      await dispatch(QueryEvent.SERVICES_REQUESTED_APPROVAL, {
        query: active,
        prompt,
        queryPayload: payload
      })
      return
    }

    if (payload.type === "done" && active) {
      await dispatch(QueryEvent.QUERY_FINISHED, {
        query: active,
        outcome: payload.outcome
      })
    }

    if (payload.type === "error") {
      await dispatch(QueryEvent.QUERY_FAILED, {
        query: active,
        message: payload.message
      })
    }

    if (payload.type === "text") {
      if (payload.role === "system") {
        ui.chat.addSystemText(payload.text || "", { queryId: payload.queryId })
      } else {
        ui.chat.addAssistantText(payload.text || "", {
          queryId: payload.queryId
        })
      }
      return
    }

    ui.chat.send(payload)
  }

  async function start({ source, query, threadId = null }) {
    const text = String(query || "").trim()
    if (!text) return { success: false, error: "Empty query" }
    if (activeQuery || pendingAction) {
      return { success: false, error: "Another query is already in progress" }
    }

    const queryId = makeQueryId()
    const useMock = forceMockQuery || source === "query" || text.startsWith("/")
    const runnerKind = useMock ? "mock" : "real"

    const runner = getRunnerForKind(runnerKind)

    const finalThreadId = String(threadId || queryId)
    activeQuery = { queryId, threadId: finalThreadId, source, runnerKind }
    await dispatch(QueryEvent.QUERY_STARTED)

    const started = await runner.start({
      queryId,
      threadId: finalThreadId,
      query: text
    })
    if (!started) {
      await dispatch(QueryEvent.QUERY_CANCELLED, {
        reason: "start_failed",
        notifyCancelledText: false,
        queryId
      })
      return { success: false, error: "Failed to start query" }
    }

    return { success: true, queryId }
  }

  async function cancel({ reason } = {}) {
    const targetQuery = pendingAction?.query || activeQuery
    if (!targetQuery) return { success: false, error: "No active query" }

    const queryId = targetQuery.queryId
    const runner = getRunnerForKind(targetQuery.runnerKind)
    const cancelled = await runner.cancel({ queryId })
    if (cancelled) {
      await dispatch(QueryEvent.QUERY_CANCELLED, {
        reason,
        notifyCancelledText: reason !== "user_interrupt",
        queryId,
        query: targetQuery
      })
    }
    return { success: cancelled }
  }

  initializeRunners()

  return {
    hasPendingAction,
    hasActiveQuery,
    isExecutingAction,
    getInteractionState,
    resolvePendingActionDecision,
    start,
    cancel
  }
}

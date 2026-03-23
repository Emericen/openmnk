import {
  type MockRun,
  type MockStageHandler,
  type MockToolResultEvent,
  type QueryClientStartInput,
  type QueryClientToolResultInput,
  type QueryEmit,
  type QueryRunner,
} from "./queryTypes"

export function createMockQueryClient({
  emit,
}: {
  emit: QueryEmit
}): QueryRunner {
  let activeRun: MockRun | null = null
  const mockLatencyMs = Math.max(
    0,
    Number(process.env.MOCK_QUERY_LATENCY_MS || 650)
  )

  function runStageWithLatency(
    run: MockRun,
    stage: number,
    event: MockToolResultEvent | null
  ) {
    setTimeout(() => {
      if (!activeRun) return
      if (activeRun.queryId !== run.queryId) return
      const done = stageHandlers[stage]?.({ run: activeRun, event })
      if (done) activeRun = null
    }, mockLatencyMs)
  }

  const stageHandlers: Record<number, MockStageHandler> = {
    0: ({ run }) => {
      emit({
        type: "message",
        role: "system",
        queryId: run.queryId,
        text: "I'll show you the scaffolding flow step by step. Let me first take a look at your screen.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "1",
        toolName: "screenshot",
        args: {},
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
        text: "I saw your screen. I'll now do a right click.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "2",
        toolName: "right_click",
        args: { x: 500, y: 500 },
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
        text: "Done. Let me take another look before opening Terminal.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "3",
        toolName: "screenshot",
        args: {},
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
        text: "I'll open the system launcher.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "4",
        toolName: "keyboard_hotkey",
        args: {
          keys: [
            process.platform === "darwin" ? "command" : "control",
            "space",
          ],
        },
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
        text: "Now I'll type Terminal.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "5",
        toolName: "type_text",
        args: { text: "Terminal" },
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
        text: "Then I'll press Enter.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "6",
        toolName: "keyboard_hotkey",
        args: { keys: ["enter"] },
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
        text: "I launched it. I'll take one more look.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "7",
        toolName: "screenshot",
        args: {},
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
        text: "Now I'll scroll a bit.",
      })
      emit({
        type: "tool_call",
        queryId: run.queryId,
        callId: "8",
        toolName: "scroll_down",
        args: { x: 500, y: 500, amount: 420 },
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
        text: "Done. I completed the scaffolded actions: right click, launcher open, Terminal search, Enter, and scroll.",
      })
      emit({ type: "done", queryId: run.queryId, outcome: "completed" })
      return true
    },
  }

  async function start({ queryId, threadId, query }: QueryClientStartInput) {
    if (!queryId || !query || isRunning()) return false
    activeRun = {
      queryId,
      threadId: threadId || queryId,
      query: String(query),
      stage: 0,
      pendingToolCalls: [],
    }
    runStageWithLatency(activeRun, 0, null)
    return true
  }

  function submitToolResult({
    queryId,
    status,
    output,
  }: QueryClientToolResultInput) {
    if (!activeRun) return false
    if (activeRun.queryId !== queryId) return false
    if (!activeRun.pendingToolCalls.length) return false

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
        message: String(output?.error || "Action failed"),
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

  function cancel({ queryId }: { queryId?: string }) {
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
    getHistory,
  }
}

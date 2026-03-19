import { randomUUID } from "node:crypto"
import { QueryClient } from "./queryClient"
import { createQueryEffects } from "./queryEffects"
import { createMockQueryClient } from "./mockQueryClient"
import {
  QueryEvent,
  QueryState,
  getNextQueryState,
  type QueryEventValue,
  type QueryStateValue,
} from "./queryState"
import { getToolTransparencyText } from "./queryUiText"
import type {
  PendingAction,
  QueryEmit,
  QueryEmitPayload,
  QueryProcessActiveQuery,
  QueryProcessController,
  QueryProcessPayload,
  QueryProcessUi,
  QueryRunner,
  QueryRunnerKind,
} from "./queryTypes"

export function createQueryProcess({
  forceMockQuery,
  controller,
  ui,
}: {
  forceMockQuery: boolean
  controller: QueryProcessController
  ui: QueryProcessUi
}) {
  const MIN_LOADING_VISIBLE_MS = Math.max(
    0,
    Number(process.env.TIP_LOADING_MIN_VISIBLE_MS || 280)
  )

  let queryClient: QueryRunner | null = null
  let mockQueryClient: QueryRunner | null = null
  let activeQuery: QueryProcessActiveQuery | null = null
  let pendingAction: PendingAction | null = null
  let queryState: QueryStateValue = QueryState.IDLE

  function makeQueryId() {
    return randomUUID()
  }

  function hasPendingAction() {
    return Boolean(pendingAction?.callId)
  }

  function hasActiveQuery() {
    return Boolean(activeQuery)
  }

  function isQueryCurrent(queryId: string) {
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

  function getRunnerForKind(kind: QueryRunnerKind) {
    return kind === "mock" ? mockQueryClient : queryClient
  }

  function initializeRunners() {
    const emit: QueryEmit = (payload) => {
      void handleQueryEvent(payload)
    }
    queryClient = new QueryClient({ emit })
    mockQueryClient = createMockQueryClient({ emit })
  }

  const effects = createQueryEffects({
    ui,
    minLoadingVisibleMs: MIN_LOADING_VISIBLE_MS,
    clearQueryContext: () => {
      pendingAction = null
      activeQuery = null
    },
  })

  async function executePendingAction(pending: PendingAction) {
    ui.overlay.hide()
    return controller.execute(pending.toolName, pending.args || {})
  }

  async function buildActionPrompt(pending: PendingAction) {
    return controller.getConfirmationPrompt(
      pending.toolName,
      pending.args || {}
    )
  }

  async function previewPendingAction(pending: PendingAction) {
    try {
      await controller.preview(pending.toolName, pending.args || {})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn("Failed to render tool preview:", message)
    }
  }

  async function dispatch(
    event: QueryEventValue,
    payload: QueryProcessPayload = {}
  ) {
    const nextState = getNextQueryState(queryState, event)
    if (!nextState) {
      console.warn(
        `[queryProcess] Ignoring invalid transition: ${queryState} --${event}--> ?`
      )
      return false
    }

    queryState = nextState
    await effects.run({ event, payload })
    return true
  }

  async function resolvePendingActionDecision(approved: boolean) {
    if (!pendingAction?.callId) {
      return { success: false, error: "No pending action" }
    }

    const pending = pendingAction
    pendingAction = null

    const runner = getRunnerForKind(pending.query.runnerKind)
    if (!runner) {
      return { success: false, error: "No query runner available" }
    }

    if (!approved) {
      await dispatch(QueryEvent.USER_REJECTED_ACTION)
      await runner.submitToolResult({
        queryId: pending.query.queryId,
        status: "rejected",
        output: {
          reason:
            "User declined this action. Ask what they would like to do instead.",
        },
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
        output: result || { done: true },
      })
      return { success: true, approved: true }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unknown error"
      await dispatch(QueryEvent.TOOL_FAILED, {
        query: pending.query,
        errorText,
      })
      await runner.submitToolResult({
        queryId: pending.query.queryId,
        status: "error",
        output: { error: errorText },
      })
      return { success: false, error: errorText }
    }
  }

  async function handleQueryEvent(payload: QueryEmitPayload) {
    if (!payload.type) return

    const hasQueryId = Boolean(payload.queryId)
    const active =
      activeQuery && hasQueryId && payload.queryId === activeQuery.queryId
        ? activeQuery
        : null

    if (hasQueryId && !active) return

    if (payload.type === "tool_call" && active) {
      await effects.settleLoadingTip()
      const pending: PendingAction = {
        query: active,
        callId: payload.callId,
        toolName: payload.toolName,
        args: payload.args || {},
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
          query: active,
        })
        try {
          const result = await executePendingAction(pending)
          if (!isQueryCurrent(active.queryId)) return

          await dispatch(QueryEvent.TOOL_FINISHED)
          const runner = getRunnerForKind(active.runnerKind)
          if (!runner) return
          await runner.submitToolResult({
            queryId: active.queryId,
            status: "ok",
            output: result || { done: true },
          })
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : "Unknown error"
          await dispatch(QueryEvent.TOOL_FAILED, { query: active, errorText })
          const runner = getRunnerForKind(active.runnerKind)
          if (!runner) return
          await runner.submitToolResult({
            queryId: active.queryId,
            status: "error",
            output: { error: errorText },
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
        queryPayload: payload,
      })
      return
    }

    if (payload.type === "done" && active) {
      await dispatch(QueryEvent.QUERY_FINISHED, {
        query: active,
        outcome: payload.outcome,
      })
      return
    }

    if (payload.type === "error") {
      await dispatch(QueryEvent.QUERY_FAILED, {
        query: active,
        message: payload.message,
      })
      return
    }

    if (payload.type === "text") {
      if (payload.role === "system") {
        ui.chat.addSystemText(payload.text || "", { queryId: payload.queryId })
      } else {
        ui.chat.addAssistantText(payload.text || "", {
          queryId: payload.queryId,
        })
      }
      return
    }

    ui.chat.send(payload)
  }

  async function start({
    source,
    query,
    threadId = null,
  }: {
    source: string
    query: string
    threadId?: string | null
  }) {
    const text = String(query || "").trim()
    if (!text) return { success: false, error: "Empty query" }
    if (activeQuery || pendingAction) {
      return { success: false, error: "Another query is already in progress" }
    }

    const queryId = makeQueryId()
    const useMock = forceMockQuery || source === "query" || text.startsWith("/")
    const runnerKind: QueryRunnerKind = useMock ? "mock" : "real"
    const runner = getRunnerForKind(runnerKind)

    if (!runner) {
      await dispatch(QueryEvent.QUERY_CANCELLED, {
        reason: "start_failed",
        notifyCancelledText: false,
        queryId,
      })
      return { success: false, error: "No query runner available" }
    }

    const finalThreadId = String(threadId || queryId)
    activeQuery = { queryId, threadId: finalThreadId, source, runnerKind }
    await dispatch(QueryEvent.QUERY_STARTED)

    const started = await runner.start({
      queryId,
      threadId: finalThreadId,
      query: text,
    })

    if (!started) {
      await dispatch(QueryEvent.QUERY_CANCELLED, {
        reason: "start_failed",
        notifyCancelledText: false,
        queryId,
      })
      return { success: false, error: "Failed to start query" }
    }

    return { success: true, queryId }
  }

  async function cancel({ reason }: { reason?: string } = {}) {
    const targetQuery = pendingAction?.query || activeQuery
    if (!targetQuery) return { success: false, error: "No active query" }

    const queryId = targetQuery.queryId
    const runner = getRunnerForKind(targetQuery.runnerKind)
    if (!runner) return { success: false, error: "No query runner available" }

    const cancelled = await runner.cancel({ queryId })
    if (cancelled) {
      await dispatch(QueryEvent.QUERY_CANCELLED, {
        reason,
        notifyCancelledText: reason !== "user_interrupt",
        queryId,
        query: targetQuery,
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
    cancel,
  }
}

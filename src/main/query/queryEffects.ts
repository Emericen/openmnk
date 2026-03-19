import { QueryEvent, type QueryEventValue } from "./queryState"
import type { QueryProcessPayload, QueryProcessUi } from "./queryTypes"

export function createQueryEffects({
  ui,
  minLoadingVisibleMs,
  clearQueryContext,
}: {
  ui: QueryProcessUi
  minLoadingVisibleMs: number
  clearQueryContext: () => void
}) {
  let interruptionReason: string | null = null
  let loadingTipShownAt: number | null = null

  function showLoadingTip(text = "Working...") {
    ui.overlay.showLoading(text)
    loadingTipShownAt = Date.now()
  }

  async function settleLoadingTip() {
    if (!Number.isFinite(loadingTipShownAt)) return
    const visibleSince = loadingTipShownAt
    if (visibleSince == null) return

    const elapsed = Date.now() - visibleSince
    if (elapsed >= minLoadingVisibleMs) return

    await new Promise((resolve) =>
      setTimeout(resolve, minLoadingVisibleMs - elapsed)
    )
  }

  function clearLoadingTipTracking() {
    loadingTipShownAt = null
  }

  async function run({
    event,
    payload,
  }: {
    event: QueryEventValue
    payload?: QueryProcessPayload
  }) {
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
        clearQueryContext()
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
        clearQueryContext()
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
        clearQueryContext()
        break
      default:
        break
    }
  }

  return {
    run,
    settleLoadingTip,
  }
}

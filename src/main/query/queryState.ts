export const QueryState = Object.freeze({
  IDLE: "idle",
  WAITING_SERVICES: "waiting_services",
  WAITING_USER: "waiting_user",
  WAITING_CONTROLLER: "waiting_controller",
} as const)

export const QueryEvent = Object.freeze({
  QUERY_STARTED: "query_started",
  SERVICES_REQUESTED_APPROVAL: "services_requested_approval",
  SERVICES_REQUESTED_AUTO_TOOL: "services_requested_auto_tool",
  USER_APPROVED_ACTION: "user_approved_action",
  USER_REJECTED_ACTION: "user_rejected_action",
  TOOL_FINISHED: "tool_finished",
  TOOL_FAILED: "tool_failed",
  QUERY_FINISHED: "query_finished",
  QUERY_FAILED: "query_failed",
  QUERY_CANCELLED: "query_cancelled",
} as const)

export type QueryStateValue = (typeof QueryState)[keyof typeof QueryState]
export type QueryEventValue = (typeof QueryEvent)[keyof typeof QueryEvent]

export const QUERY_TRANSITIONS: Record<
  QueryStateValue,
  Partial<Record<QueryEventValue, QueryStateValue>>
> = Object.freeze({
  [QueryState.IDLE]: {
    [QueryEvent.QUERY_STARTED]: QueryState.WAITING_SERVICES,
  },
  [QueryState.WAITING_SERVICES]: {
    [QueryEvent.SERVICES_REQUESTED_APPROVAL]: QueryState.WAITING_USER,
    [QueryEvent.SERVICES_REQUESTED_AUTO_TOOL]: QueryState.WAITING_CONTROLLER,
    [QueryEvent.QUERY_FINISHED]: QueryState.IDLE,
    [QueryEvent.QUERY_FAILED]: QueryState.IDLE,
    [QueryEvent.QUERY_CANCELLED]: QueryState.IDLE,
  },
  [QueryState.WAITING_USER]: {
    [QueryEvent.USER_APPROVED_ACTION]: QueryState.WAITING_CONTROLLER,
    [QueryEvent.USER_REJECTED_ACTION]: QueryState.WAITING_SERVICES,
    [QueryEvent.QUERY_CANCELLED]: QueryState.IDLE,
    [QueryEvent.QUERY_FAILED]: QueryState.IDLE,
    [QueryEvent.QUERY_FINISHED]: QueryState.IDLE,
  },
  [QueryState.WAITING_CONTROLLER]: {
    [QueryEvent.TOOL_FINISHED]: QueryState.WAITING_SERVICES,
    [QueryEvent.TOOL_FAILED]: QueryState.WAITING_SERVICES,
    [QueryEvent.QUERY_FAILED]: QueryState.IDLE,
    [QueryEvent.QUERY_CANCELLED]: QueryState.IDLE,
    [QueryEvent.QUERY_FINISHED]: QueryState.IDLE,
  },
})

export function getNextQueryState(
  from: QueryStateValue,
  event: QueryEventValue
): QueryStateValue | null {
  return QUERY_TRANSITIONS[from]?.[event] || null
}

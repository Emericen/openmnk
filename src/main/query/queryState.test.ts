import { describe, expect, it } from "vitest"
import { QueryEvent, QueryState, getNextQueryState } from "./queryState"

describe("getNextQueryState", () => {
  it("moves from idle to waiting_services when a query starts", () => {
    expect(getNextQueryState(QueryState.IDLE, QueryEvent.QUERY_STARTED)).toBe(
      QueryState.WAITING_SERVICES
    )
  })

  it("moves from waiting_services to waiting_user for approval requests", () => {
    expect(
      getNextQueryState(
        QueryState.WAITING_SERVICES,
        QueryEvent.SERVICES_REQUESTED_APPROVAL
      )
    ).toBe(QueryState.WAITING_USER)
  })

  it("returns null for invalid transitions", () => {
    expect(getNextQueryState(QueryState.IDLE, QueryEvent.TOOL_FINISHED)).toBe(
      null
    )
  })
})

export type QueryEmitPayload =
  | { type: "thought"; queryId: string; text: string }
  | {
      type: "command"
      queryId: string
      description: string
      cmd: string
      output?: string
    }
  | { type: "response"; queryId: string; text: string }
  | { type: "done"; queryId: string }
  | { type: "error"; queryId: string; message: string }

export type QueryEmit = (payload: QueryEmitPayload) => void

export type QueryRunner = {
  start: (queryId: string, query: string) => Promise<void>
  cancel: () => void
  clear: () => void
}

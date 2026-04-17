// --- Tools ---

export type Tool = {
  name: string
  parameters: Record<string, unknown>
  execute: (
    args: Record<string, string>,
    signal?: AbortSignal
  ) => Promise<ToolResult>
}

export type ToolResult =
  | { type: "text"; content: string; description: string }
  | { type: "image"; content: string; url: string; description: string }

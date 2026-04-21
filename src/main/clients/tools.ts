import { readFile } from "node:fs/promises"
import { run as runCommand } from "./terminal"
import type { Tool, ToolResult } from "./types"

// --- Tools ---

const runCommandTool: Tool = {
  name: "run_command",
  parameters: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description:
          "What this command does, in gerund form with trailing ellipsis (e.g. 'Listing desktop contents...')",
      },
      cmd: {
        type: "string",
        description: "The shell command to execute",
      },
    },
    required: ["description", "cmd"],
  },
  async execute(args, signal) {
    const cmd = String(args.cmd || "")
    const description = String(args.description || "Running command...")
    const output = await runCommand(cmd, signal)
    return { type: "text", content: output.slice(0, 10000), description }
  },
}

const viewTool: Tool = {
  name: "view",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the image file",
      },
    },
    required: ["path"],
  },
  async execute(args) {
    const filePath = String(args.path || "")
    const buffer = await readFile(filePath)
    const isJpeg =
      filePath.toLowerCase().endsWith(".jpg") ||
      filePath.toLowerCase().endsWith(".jpeg")
    const mime = isJpeg ? "image/jpeg" : "image/png"
    const base64 = buffer.toString("base64")
    const url = `data:${mime};base64,${base64}`
    const description = `Viewing image: ${filePath}`
    const content = `Image loaded (${Math.round(buffer.length / 1024)}KB)`
    return { type: "image", content, url, description }
  },
}

// --- Registry ---

const all: Tool[] = [runCommandTool, viewTool]
const byName = new Map(all.map((t) => [t.name, t]))

/** OpenAI-compatible tool definitions for the API request. */
export const definitions = all.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: "See system prompt for usage.",
    parameters: t.parameters,
  },
}))

/** Execute a tool by name. Throws if tool not found. */
export async function execute(
  name: string,
  args: Record<string, string>,
  signal?: AbortSignal
): Promise<ToolResult> {
  const tool = byName.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return tool.execute(args, signal)
}

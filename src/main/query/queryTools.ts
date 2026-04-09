import { z } from "zod"
import { tool } from "ai"

const CoordSchema = z.number().int().min(0).max(1000)

// Zod schemas (still used by controller for preview/confirmation)
export const ToolArgsSchemas = {
  screenshot: z.object({}),
  left_click: z.object({ x: CoordSchema, y: CoordSchema }),
  right_click: z.object({ x: CoordSchema, y: CoordSchema }),
  double_click: z.object({ x: CoordSchema, y: CoordSchema }),
  type_text: z.object({ text: z.string() }),
  keyboard_hotkey: z.object({ keys: z.array(z.string()) }),
  scroll_down: z.object({
    x: CoordSchema,
    y: CoordSchema,
    amount: z.number().int().min(1),
  }),
  scroll_up: z.object({
    x: CoordSchema,
    y: CoordSchema,
    amount: z.number().int().min(1),
  }),
  drag: z.object({
    x1: CoordSchema,
    y1: CoordSchema,
    x2: CoordSchema,
    y2: CoordSchema,
  }),
  page_down: z.object({}),
  page_up: z.object({}),
  run_command: z.object({
    description: z.string(),
    cmd: z.string(),
  }),
  view_images: z.object({
    description: z.string(),
    paths: z.array(z.string()),
  }),
} as const

export type ToolName = keyof typeof ToolArgsSchemas
export type PointArgs = z.infer<typeof ToolArgsSchemas.left_click>
export type TypeTextArgs = z.infer<typeof ToolArgsSchemas.type_text>
export type KeyboardHotkeyArgs = z.infer<typeof ToolArgsSchemas.keyboard_hotkey>
export type ScrollArgs = z.infer<typeof ToolArgsSchemas.scroll_down>
export type DragArgs = z.infer<typeof ToolArgsSchemas.drag>
export type RunCommandArgs = z.infer<typeof ToolArgsSchemas.run_command>
export type ViewImagesArgs = z.infer<typeof ToolArgsSchemas.view_images>

export function parseToolArgs<T extends ToolName>(
  toolName: T,
  args: Record<string, unknown>
): z.infer<(typeof ToolArgsSchemas)[T]> {
  return ToolArgsSchemas[toolName].parse(args)
}

type ToolExecutor = {
  execute: (
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

const SANDBOX_URL = process.env.SANDBOX_URL || "http://localhost:8082"

async function runSandboxCommand(cmd: string) {
  const res = await fetch(`${SANDBOX_URL}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd }),
  })
  return (await res.json()) as {
    stdout: string
    stderr: string
    exit_code: number
  }
}

async function viewImagesFromSandbox(paths: string[]) {
  const images: Array<{ path: string; base64: string }> = []
  for (const p of paths) {
    const res = await runSandboxCommand(`python3 -c "
from PIL import Image
import base64, io
img = Image.open('${p.replace(/'/g, "\\'")}')
w, h = img.size
longest = max(w, h)
if longest > 1080:
    scale = 1080 / longest
    img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
if img.mode in ('RGBA', 'P', 'LA'):
    img = img.convert('RGB')
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=75)
print(base64.b64encode(buf.getvalue()).decode())
"`)
    if (res.exit_code === 0 && res.stdout.trim()) {
      images.push({ path: p, base64: res.stdout.trim() })
    }
  }
  return images
}

/**
 * Create AI SDK tool definitions.
 * - screenshot, run_command, view_images: auto-execute (no approval)
 * - all mouse/keyboard tools: needsApproval
 */
export function createTools(controller: ToolExecutor) {
  return {
    screenshot: (tool as any)({
      description:
        "Take a screenshot of the user's screen. Use this to see the current state before taking any action. Screenshots do not require user approval.",
      inputSchema: ToolArgsSchemas.screenshot,
      execute: async () => {
        return await controller.execute("screenshot", {})
      },
      experimental_toToolResultContent: (result: unknown) => {
        const r = result as { image?: string; width?: number; height?: number }
        if (r.image) {
          return [
            { type: "text" as const, text: `Screenshot taken (${r.width}x${r.height})` },
            { type: "image" as const, data: r.image, mimeType: "image/jpeg" as const },
          ]
        }
        return [{ type: "text" as const, text: JSON.stringify(result) }]
      },
    }),

    left_click: (tool as any)({
      description:
        "Perform a left mouse click at the specified coordinates on the latest screenshot. Use values 0-1000 where 0 is left/top edge and 1000 is right/bottom edge.",
      inputSchema: ToolArgsSchemas.left_click,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.left_click>) => {
        return await controller.execute("left_click", args)
      },
    }),

    right_click: (tool as any)({
      description:
        "Perform a right mouse click at the specified coordinates. Use values 0-1000. Used to open context menus.",
      inputSchema: ToolArgsSchemas.right_click,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.right_click>) => {
        return await controller.execute("right_click", args)
      },
    }),

    double_click: (tool as any)({
      description:
        "Perform a double left-click at the specified coordinates. Use values 0-1000. Used to open files/folders or select words.",
      inputSchema: ToolArgsSchemas.double_click,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.double_click>) => {
        return await controller.execute("double_click", args)
      },
    }),

    type_text: (tool as any)({
      description:
        "Type text at the current cursor location. Ensure focus is set by clicking the target field first.",
      inputSchema: ToolArgsSchemas.type_text,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.type_text>) => {
        return await controller.execute("type_text", args)
      },
    }),

    keyboard_hotkey: (tool as any)({
      description:
        "Press multiple keys simultaneously as a keyboard shortcut. Examples: ['ctrl', 'c'] for copy, ['cmd', 'v'] for paste on Mac.",
      inputSchema: ToolArgsSchemas.keyboard_hotkey,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.keyboard_hotkey>) => {
        return await controller.execute("keyboard_hotkey", args)
      },
    }),

    scroll_down: (tool as any)({
      description:
        "Scroll down to reveal content below. Each unit is one scroll wheel step (~3 lines).",
      inputSchema: ToolArgsSchemas.scroll_down,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.scroll_down>) => {
        return await controller.execute("scroll_down", args)
      },
    }),

    scroll_up: (tool as any)({
      description:
        "Scroll up to reveal content above. Each unit is one scroll wheel step (~3 lines).",
      inputSchema: ToolArgsSchemas.scroll_up,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.scroll_up>) => {
        return await controller.execute("scroll_up", args)
      },
    }),

    drag: (tool as any)({
      description:
        "Click and drag from one point to another. Use for moving windows, selecting ranges, resizing panes. Coordinates 0-1000.",
      inputSchema: ToolArgsSchemas.drag,
      needsApproval: true,
      execute: async (args: z.infer<typeof ToolArgsSchemas.drag>) => {
        return await controller.execute("drag", args)
      },
    }),

    page_down: (tool as any)({
      description: "Press the Page Down key to scroll down by one full page.",
      inputSchema: ToolArgsSchemas.page_down,
      needsApproval: true,
      execute: async () => {
        return await controller.execute("page_down", {})
      },
    }),

    page_up: (tool as any)({
      description: "Press the Page Up key to scroll up by one full page.",
      inputSchema: ToolArgsSchemas.page_up,
      needsApproval: true,
      execute: async () => {
        return await controller.execute("page_up", {})
      },
    }),

    run_command: (tool as any)({
      description:
        "Execute a shell command in a sandboxed Docker container. Has python3, python-docx, pymupdf, openpyxl, Pillow, LibreOffice headless, and standard Unix tools. The user's home directory is mounted at /home/user. IMPORTANT: Use /home/user/ absolute paths, NOT ~/. Always provide a human-readable description.",
      inputSchema: ToolArgsSchemas.run_command,
      execute: async ({ cmd }: { description: string; cmd: string }) => {
        console.log(`[tool] run_command: ${cmd.slice(0, 200)}`)
        const t0 = Date.now()
        try {
          const result = await runSandboxCommand(cmd)
          console.log(`[tool] run_command done in ${Date.now() - t0}ms, exit=${result.exit_code}`)
          return {
            stdout: result.stdout.slice(0, 4000),
            stderr: result.stderr.slice(0, 2000),
            exit_code: result.exit_code,
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return { error: `Sandbox unreachable: ${message}` }
        }
      },
    }),

    view_images: (tool as any)({
      description:
        "View image files from the sandbox as base64. Images are auto-resized to 1080p JPEG. Use after converting documents to PNG.",
      inputSchema: ToolArgsSchemas.view_images,
      execute: async ({ paths }: { description: string; paths: string[] }) => {
        console.log(`[tool] view_images: ${paths.length} path(s)`)
        const images = await viewImagesFromSandbox(paths)
        return { loaded: images.length, images }
      },
      experimental_toToolResultContent: (result: unknown) => {
        const r = result as { images?: Array<{ path: string; base64: string }> }
        if (r.images && r.images.length > 0) {
          return [
            { type: "text" as const, text: `Loaded ${r.images.length} image(s): ${r.images.map((i) => i.path).join(", ")}` },
            ...r.images.map((img) => ({
              type: "image" as const,
              data: img.base64,
              mimeType: "image/jpeg" as const,
            })),
          ]
        }
        return [{ type: "text" as const, text: "No images loaded" }]
      },
    }),
  }
}

// Keep the old TOOLS export for the mock client
export const TOOLS = [
  { type: "function", function: { name: "screenshot", description: "Take a screenshot", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "left_click", description: "Left click", parameters: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x", "y"] } } },
  { type: "function", function: { name: "run_command", description: "Run command", parameters: { type: "object", properties: { description: { type: "string" }, cmd: { type: "string" } }, required: ["description", "cmd"] } } },
] as const

import { createMouseController } from "./mouse"
import { createKeyboardController } from "./keyboard"
import { createScreenListener } from "../listener/screen"

const ACTION_DELAY_MS = 100

type ToolArgs = Record<string, unknown>
type PreviewResult = Record<string, unknown>
type ExecuteResult =
  | { done: true }
  | { error: string }
  | { image: string; width: number; height: number }

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createController() {
  const screen = createScreenListener()
  const mouse = createMouseController()
  const keyboard = createKeyboardController()

  async function preview(
    toolName: string,
    args: ToolArgs
  ): Promise<PreviewResult> {
    switch (toolName) {
      case "left_click": {
        if (
          Number.isFinite(Number(args?.x)) &&
          Number.isFinite(Number(args?.y))
        ) {
          await mouse.previewPoint(screen.toScreenPoint(args.x, args.y))
        }
        const annotated = await screen.takeScreenshotWithAnnotation([
          { x: Number(args.x), y: Number(args.y), label: "1" },
        ])
        if (!annotated.success) return {}
        return { previewImage: `data:image/jpeg;base64,${annotated.base64}` }
      }
      case "right_click":
      case "double_click":
      case "scroll_down":
      case "scroll_up": {
        if (
          !Number.isFinite(Number(args?.x)) ||
          !Number.isFinite(Number(args?.y))
        ) {
          return {}
        }
        await mouse.previewPoint(screen.toScreenPoint(args.x, args.y))
        return {}
      }
      case "drag": {
        await mouse.previewDrag(
          screen.toScreenPoint(args.x1, args.y1),
          screen.toScreenPoint(args.x2, args.y2)
        )
        return {}
      }
      default:
        return {}
    }
  }

  function getConfirmationPrompt(toolName: string, args: ToolArgs): string {
    switch (toolName) {
      case "left_click":
        return "Left click here?"
      case "right_click":
        return "Right click here?"
      case "double_click":
        return "Double click here?"
      case "type_text":
        return `Type \"${String(args.text || "").slice(0, 120)}\"?`
      case "keyboard_hotkey":
        return `Execute keyboard shortcut: ${
          Array.isArray(args.keys)
            ? args.keys.map((key) => String(key || "")).join(" + ")
            : ""
        }?`
      case "scroll_down": {
        const steps = Math.abs(Number(args.amount || 0))
        return `Scroll down ${steps} step${steps !== 1 ? "s" : ""}?`
      }
      case "scroll_up": {
        const steps = Math.abs(Number(args.amount || 0))
        return `Scroll up ${steps} step${steps !== 1 ? "s" : ""}?`
      }
      case "drag":
        return "Drag and drop here?"
      case "page_down":
        return "Press Page Down?"
      case "page_up":
        return "Press Page Up?"
      default:
        return `Execute tool ${toolName}?`
    }
  }

  function requiresApproval(toolName: string): boolean {
    return toolName !== "screenshot"
  }

  async function execute(
    toolName: string,
    args: ToolArgs
  ): Promise<ExecuteResult> {
    switch (toolName) {
      case "screenshot": {
        const screenshot = await screen.takeScreenshot()
        if (!screenshot.success) {
          return { error: screenshot.error || "Screenshot failed" }
        }
        return {
          image: screenshot.base64,
          width: screenshot.width,
          height: screenshot.height,
        }
      }
      case "left_click":
        await mouse.leftClick(screen.toScreenPoint(args.x, args.y))
        break
      case "right_click":
        await mouse.rightClick(screen.toScreenPoint(args.x, args.y))
        break
      case "double_click":
        await mouse.doubleClick(screen.toScreenPoint(args.x, args.y))
        break
      case "drag":
        await mouse.leftClickDrag(
          screen.toScreenPoint(args.x1, args.y1),
          screen.toScreenPoint(args.x2, args.y2)
        )
        break
      case "scroll_down":
        await mouse.scroll(
          screen.toScreenPoint(args.x, args.y),
          Math.abs(Number(args.amount || 0))
        )
        break
      case "scroll_up":
        await mouse.scroll(
          screen.toScreenPoint(args.x, args.y),
          -Math.abs(Number(args.amount || 0))
        )
        break
      case "type_text":
        console.log(
          `[controller.execute] type_text args=${JSON.stringify(args || {})}`
        )
        await keyboard.typeText(args.text)
        break
      case "keyboard_hotkey":
        await keyboard.keyboardHotkey(Array.isArray(args.keys) ? args.keys : [])
        break
      case "page_down":
        await keyboard.pageDown()
        break
      case "page_up":
        await keyboard.pageUp()
        break
      default:
        return { error: `Unknown tool: ${toolName}` }
    }

    await wait(ACTION_DELAY_MS)
    return { done: true }
  }

  async function runFirstTimeOnboarding() {
    await screen.takeScreenshot()
    await mouse.nudgeMouse()
    await keyboard.tapShift()
  }

  function cleanup() {
    // no-op
  }

  return {
    preview,
    execute,
    getConfirmationPrompt,
    requiresApproval,
    runFirstTimeOnboarding,
    cleanup,
  }
}

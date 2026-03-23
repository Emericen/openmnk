import { createMouseController } from "./mouse"
import { createKeyboardController } from "./keyboard"
import { createScreenListener, type ExternalCaptureFn, type ContentProtectionFn } from "../listener/screen"
import { parseToolArgs } from "../query/queryTools"

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
        const parsed = parseToolArgs("left_click", args)
        await mouse.previewPoint(screen.toScreenPoint(parsed.x, parsed.y))
        const annotated = await screen.takeScreenshotWithAnnotation([
          { x: parsed.x, y: parsed.y, label: "1" },
        ])
        if (!annotated.success) return {}
        return { previewImage: `data:image/jpeg;base64,${annotated.base64}` }
      }
      case "right_click":
      case "double_click":
      case "scroll_down":
      case "scroll_up": {
        const parsed = parseToolArgs("left_click", args)
        await mouse.previewPoint(screen.toScreenPoint(parsed.x, parsed.y))
        return {}
      }
      case "drag": {
        const parsed = parseToolArgs("drag", args)
        await mouse.previewDrag(
          screen.toScreenPoint(parsed.x1, parsed.y1),
          screen.toScreenPoint(parsed.x2, parsed.y2)
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
      case "type_text": {
        const parsed = parseToolArgs("type_text", args)
        return `Type \"${parsed.text.slice(0, 120)}\"?`
      }
      case "keyboard_hotkey": {
        const parsed = parseToolArgs("keyboard_hotkey", args)
        return `Execute keyboard shortcut: ${parsed.keys.join(" + ")}?`
      }
      case "scroll_down": {
        const parsed = parseToolArgs("scroll_down", args)
        return `Scroll down ${parsed.amount} step${parsed.amount !== 1 ? "s" : ""}?`
      }
      case "scroll_up": {
        const parsed = parseToolArgs("scroll_up", args)
        return `Scroll up ${parsed.amount} step${parsed.amount !== 1 ? "s" : ""}?`
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
      case "left_click": {
        const parsed = parseToolArgs("left_click", args)
        await mouse.leftClick(screen.toScreenPoint(parsed.x, parsed.y))
        break
      }
      case "right_click": {
        const parsed = parseToolArgs("right_click", args)
        await mouse.rightClick(screen.toScreenPoint(parsed.x, parsed.y))
        break
      }
      case "double_click": {
        const parsed = parseToolArgs("double_click", args)
        await mouse.doubleClick(screen.toScreenPoint(parsed.x, parsed.y))
        break
      }
      case "drag": {
        const parsed = parseToolArgs("drag", args)
        await mouse.leftClickDrag(
          screen.toScreenPoint(parsed.x1, parsed.y1),
          screen.toScreenPoint(parsed.x2, parsed.y2)
        )
        break
      }
      case "scroll_down": {
        const parsed = parseToolArgs("scroll_down", args)
        await mouse.scroll(
          screen.toScreenPoint(parsed.x, parsed.y),
          Math.abs(parsed.amount)
        )
        break
      }
      case "scroll_up": {
        const parsed = parseToolArgs("scroll_up", args)
        await mouse.scroll(
          screen.toScreenPoint(parsed.x, parsed.y),
          -Math.abs(parsed.amount)
        )
        break
      }
      case "type_text": {
        const parsed = parseToolArgs("type_text", args)
        await keyboard.typeText(parsed.text)
        break
      }
      case "keyboard_hotkey": {
        const parsed = parseToolArgs("keyboard_hotkey", args)
        await keyboard.keyboardHotkey(parsed.keys)
        break
      }
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

  function setExternalCapture(fn: ExternalCaptureFn) {
    screen.setExternalCapture(fn)
  }

  function setContentProtection(fn: ContentProtectionFn) {
    screen.setContentProtection(fn)
  }

  return {
    preview,
    execute,
    getConfirmationPrompt,
    requiresApproval,
    runFirstTimeOnboarding,
    cleanup,
    setExternalCapture,
    setContentProtection,
  }
}

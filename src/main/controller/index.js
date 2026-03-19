import { createMouseController } from "./mouse.js"
import { createKeyboardController } from "./keyboard.js"
import { createScreenListener } from "../listener/screen.js"

const ACTION_DELAY_MS = 100

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createController() {
  const screen = createScreenListener()
  const mouse = createMouseController()
  const keyboard = createKeyboardController()

  async function preview(toolName, args) {
    switch (toolName) {
      case "left_click": {
        if (
          Number.isFinite(Number(args?.x)) &&
          Number.isFinite(Number(args?.y))
        ) {
          await mouse.previewPoint(screen.toScreenPoint(args.x, args.y))
        }
        const annotated = await screen.takeScreenshotWithAnnotation([
          { x: args.x, y: args.y, label: "1" }
        ])
        if (!annotated.success) return {}
        return { previewImage: `data:image/jpeg;base64,${annotated.base64}` }
      }
      case "right_click":
      case "double_click":
      case "scroll": {
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

  function getConfirmationPrompt(toolName, args) {
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
        return `Execute keyboard shortcut: ${(args.keys || []).join(" + ")}?`
      case "scroll": {
        const steps = Number(args.pixels || 0)
        const direction = steps > 0 ? "down" : "up"
        const absSteps = Math.abs(steps)
        return `Scroll ${direction} ${absSteps} step${absSteps !== 1 ? 's' : ''}?`
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

  function requiresApproval(toolName) {
    return toolName !== "screenshot"
  }

  async function execute(toolName, args) {
    switch (toolName) {
      case "screenshot": {
        const screenshot = await screen.takeScreenshot()
        if (!screenshot.success) {
          return { error: screenshot.error || "Screenshot failed" }
        }
        return {
          image: screenshot.base64,
          width: screenshot.width,
          height: screenshot.height
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
      case "scroll":
        await mouse.scroll(
          screen.toScreenPoint(args.x, args.y),
          Number(args.pixels || 0)
        )
        break
      case "type_text":
        console.log(
          `[controller.execute] type_text args=${JSON.stringify(args || {})}`
        )
        await keyboard.typeText(args.text)
        break
      case "keyboard_hotkey":
        await keyboard.keyboardHotkey(args.keys || [])
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
    cleanup
  }
}

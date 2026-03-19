type QueryUiArgs = {
  text?: string
  keys?: unknown[]
  pixels?: number
}

function formatTextPreview(value: unknown, maxLength = 80): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return ""
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

export function getToolTransparencyText(
  toolName: string,
  args: QueryUiArgs = {}
): string {
  switch (toolName) {
    case "screenshot":
      return "👀 taking a look..."
    case "left_click":
      return "👆 left clicking..."
    case "right_click":
      return "👉 right clicking..."
    case "double_click":
      return "👆 double clicking..."
    case "type_text": {
      const preview = formatTextPreview(args.text)
      return preview
        ? `💬 typing ${JSON.stringify(preview)}...`
        : "💬 typing..."
    }
    case "keyboard_hotkey": {
      const keys = Array.isArray(args.keys)
        ? args.keys.map((key) => String(key || "").trim()).filter(Boolean)
        : []
      return keys.length
        ? `⌨️ pressing ${keys.join(" + ")}...`
        : "⌨️ pressing keyboard shortcut..."
    }
    case "scroll": {
      const steps = Math.round(Number(args.pixels || 0))
      const direction = steps > 0 ? "down" : steps < 0 ? "up" : ""
      const absSteps = Math.abs(steps)
      return `↕️ scrolling ${direction} ${absSteps} step${
        absSteps !== 1 ? "s" : ""
      }...`
    }
    case "drag":
      return "🤏 dragging..."
    case "page_down":
      return "⌨️ pressing page down..."
    case "page_up":
      return "⌨️ pressing page up..."
    default:
      return `⚙️ running ${toolName}...`
  }
}

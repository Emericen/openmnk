type QueryUiArgs = {
  text?: string
  keys?: unknown[]
  amount?: number
  description?: string
  cmd?: string
  paths?: unknown[]
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
    case "scroll_down": {
      const steps = Math.abs(Math.round(Number(args.amount || 0)))
      return `⬇️ scrolling down ${steps} step${steps !== 1 ? "s" : ""}...`
    }
    case "scroll_up": {
      const steps = Math.abs(Math.round(Number(args.amount || 0)))
      return `⬆️ scrolling up ${steps} step${steps !== 1 ? "s" : ""}...`
    }
    case "drag":
      return "🤏 dragging..."
    case "page_down":
      return "⌨️ pressing page down..."
    case "page_up":
      return "⌨️ pressing page up..."
    case "run_command": {
      const desc = args.description || args.cmd
      return formatTextPreview(desc)
    }
    case "view_images": {
      const desc = args.description || "Viewing images"
      return formatTextPreview(desc)
    }
    default:
      return `⚙️ running ${toolName}...`
  }
}

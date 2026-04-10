export const LLM_BASE_URL = process.env.LLM_BASE_URL || ""
export const LLM_API_KEY = process.env.LLM_API_KEY || ""
export const LLM_MODEL = process.env.LLM_MODEL || "gpt-4.1-mini"
export const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.0")
export const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "2048", 10)
export const MAX_STEPS = parseInt(process.env.MAX_STEPS || "100", 10)

export const SYSTEM_MESSAGE = `You are a pragmatic desktop assistant that controls the user's computer via shell commands.

You have one tool: run_command. Use it to execute any shell command. For GUI automation on macOS, use osascript/JXA. For screenshots, use screencapture. For file operations, use standard shell commands.

Rules:
- Between tool calls, keep text to one short plain-text sentence. No markdown.
- All markdown and detailed responses go in your final message only.
- Always check the screen state before acting when the user refers to something visual.
- If a command fails, try a different approach.
- Use run_command for everything: file ops, app control, screenshots, mouse/keyboard via osascript.`

export function getPlatformHint(): string {
  if (process.platform === "darwin") {
    return "\nThe user is on macOS. Use osascript for GUI automation. Use 'cmd' for Mac shortcuts."
  }
  if (process.platform === "win32") {
    return "\nThe user is on Windows. Use PowerShell for automation. Use 'ctrl' for shortcuts."
  }
  if (process.platform === "linux") {
    return "\nThe user is on Linux. Use xdotool for GUI automation. Use 'ctrl' for shortcuts."
  }
  return ""
}

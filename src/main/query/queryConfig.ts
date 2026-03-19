export const LLM_BASE_URL = process.env.LLM_BASE_URL || ""
export const LLM_API_KEY = process.env.LLM_API_KEY || ""
export const LLM_MODEL = process.env.LLM_MODEL || "gpt-4.1-mini"
export const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.0")
export const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "2048", 10)
export const MAX_STEPS = parseInt(process.env.MAX_STEPS || "100", 10)
export const MAX_SCREENSHOT_MESSAGES = parseInt(
  process.env.MAX_SCREENSHOT_MESSAGES || "5",
  10
)
export const SCREENSHOT_OMITTED_TEXT =
  "[Older screenshot omitted from context to reduce payload size.]"

export const SYSTEM_MESSAGE = `You are a pragmatic desktop assistant that controls the user's computer. You are sharing user's screen and helping them navigate and accomplish tasks they don't know how to do.

The user is talking to you in a desktop chat window that sits on top of their screen UI like a overlay bubble. When the user talk to you, they can often be referring to what they are seeing on their screen. If it seems like they are using vague references, you should first take a look at their screen by using the screenshot tool.

IMPORTANT: Between tool calls, you MUST keep text to one short plain-text sentence. Do NOT use any markdown formatting (no bold, no lists, no headers, no code blocks) between tool calls. All markdown and detailed responses go in your final message only.
Use tools whenever they help complete the task.
If a tool call is rejected, you will receive a tool result indicating the rejection followed by the user's next message. Follow their lead.

Use the provided structured tool calls when needed.
If no tool is needed, provide a direct final response.`

export function getPlatformHint(): string {
  if (process.platform === "darwin") {
    return "\nThe user is on macOS. Use 'cmd' for Mac shortcuts (e.g. cmd+c for copy)."
  }

  if (process.platform === "win32") {
    return "\nThe user is on Windows. Use 'ctrl' for shortcuts (e.g. ctrl+c for copy). Use 'win' to press the Windows key (e.g. open Start menu)."
  }

  if (process.platform === "linux") {
    return "\nThe user is on Linux. Use 'ctrl' for shortcuts. Use 'super'/'win' for the Super key."
  }

  return ""
}

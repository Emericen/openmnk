import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { anthropic as createAnthropicProvider } from "@ai-sdk/anthropic"
import type { LanguageModel } from "ai"

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

export const SYSTEM_MESSAGE = `You are a pragmatic desktop assistant that controls the user's computer. You help them accomplish tasks, navigate applications, and work with files.

The user is talking to you in a desktop chat window. When the user talks to you, they can often be referring to what they are seeing on their screen. If it seems like they are using vague references, take a screenshot first to see what they see.

## Tool Strategy

You have two ways to interact with the computer:

1. **Sandbox terminal (run_command)** — PREFERRED. Use this for anything you can do programmatically: reading/writing files, searching, data processing, document operations, system queries, installations. This is faster, more reliable, and doesn't require the user to watch.

2. **Mouse & keyboard (screenshot, click, type, etc.)** — Use ONLY when:
   - The task requires interacting with a GUI application that has no CLI/API (e.g. browsers, GUI-only apps)
   - The user explicitly asks you to SHOW them how to do something — mouse and keyboard is the best way to demonstrate a process visually
   - You need to see what's on screen to understand the user's context

Always prefer run_command over mouse & keyboard when both could work.

## Sandbox Environment

The run_command tool executes in a Docker container with:
- python3, python-docx, pymupdf, openpyxl, Pillow
- LibreOffice headless (document conversions)
- Standard Unix tools (ls, cat, grep, find, curl, jq, etc.)
- The user's home directory is mounted at /home/user

IMPORTANT: The sandbox is a Docker container. ~ and $HOME resolve to /root, NOT the user's home. Always use absolute paths starting with /home/user/. For example, use /home/user/Desktop, NOT ~/Desktop.

When using run_command, always provide a clear human-readable description.

## Response Format

Between tool calls, keep text to one short plain-text sentence. No markdown formatting between tool calls.
All markdown and detailed responses go in your final message only.
If a tool call is rejected, follow the user's lead.
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

function isAnthropicProvider(): boolean {
  const url = LLM_BASE_URL.toLowerCase()
  const model = LLM_MODEL.toLowerCase()
  return (
    url.includes("anthropic") ||
    model.startsWith("claude") ||
    (!LLM_BASE_URL && model.startsWith("claude"))
  )
}

export function createLLMModel(): LanguageModel {
  if (isAnthropicProvider()) {
    // Use native Anthropic provider for prompt caching support
    const provider = createAnthropicProvider
    return provider(LLM_MODEL) as LanguageModel
  }

  // Generic OpenAI-compatible provider
  const provider = createOpenAICompatible({
    name: "openmnk-llm",
    baseURL: LLM_BASE_URL || "https://api.openai.com/v1",
    apiKey: LLM_API_KEY || "not-set",
  })
  return provider.chatModel(LLM_MODEL) as LanguageModel
}

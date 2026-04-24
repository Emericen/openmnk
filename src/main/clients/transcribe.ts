import OpenAI from "openai"
import { is } from "@electron-toolkit/utils"
import type { DictationTranscribeResult } from "../../types/ipc"

const SERVER_URL = process.env.SERVER_URL || ""

let client: OpenAI | null = null

function getClient(): OpenAI | null {
  if (client) return client
  const baseURL = process.env.TRANSCRIBE_BASE_URL || process.env.LLM_BASE_URL
  const apiKey = process.env.TRANSCRIBE_API_KEY || process.env.LLM_API_KEY
  if (!baseURL || !apiKey) return null
  client = new OpenAI({ baseURL, apiKey })
  return client
}

export async function transcribe(input: {
  audio?: string
  filename?: string
}): Promise<DictationTranscribeResult> {
  // Cloud: proxy through server
  if (SERVER_URL) {
    try {
      const resp = await fetch(`${SERVER_URL}/dictation/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      return await resp.json()
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  // OSS: direct call with user's key
  const openai = getClient()
  if (!openai) {
    return { success: false, error: "Voice transcription not configured. Set TRANSCRIBE_BASE_URL and TRANSCRIBE_API_KEY." }
  }

  try {
    const model = process.env.TRANSCRIBE_MODEL || "whisper-1"
    const buffer = Buffer.from(String(input.audio || ""), "base64")
    const file = new File([buffer], input.filename || "recording.webm", {
      type: "audio/webm",
    })

    const result = await openai.audio.transcriptions.create({ model, file })
    return { success: true, text: result.text || "" }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

import OpenAI from "openai"
import type { DictationTranscribeResult } from "../../shared/ipc-contract"

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
  const openai = getClient()
  if (!openai) {
    return { success: false, error: "Voice transcription not configured." }
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

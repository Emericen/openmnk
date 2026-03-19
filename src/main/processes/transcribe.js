import OpenAI from "openai"

let client = null

function getClient() {
  if (client) return client
  const baseURL = process.env.TRANSCRIBE_BASE_URL || process.env.LLM_BASE_URL
  const apiKey = process.env.TRANSCRIBE_API_KEY || process.env.LLM_API_KEY
  if (!baseURL || !apiKey) return null
  client = new OpenAI({ baseURL, apiKey })
  return client
}

export function isTranscriptionConfigured() {
  const baseURL = process.env.TRANSCRIBE_BASE_URL || process.env.LLM_BASE_URL
  const apiKey = process.env.TRANSCRIBE_API_KEY || process.env.LLM_API_KEY
  return Boolean(baseURL && apiKey)
}

export async function transcribeAudio({ audio, filename }) {
  const openai = getClient()
  if (!openai) {
    throw new Error("Transcription not configured. Set TRANSCRIBE_BASE_URL and TRANSCRIBE_API_KEY in .env")
  }

  const model = process.env.TRANSCRIBE_MODEL || "whisper-1"
  const buffer = Buffer.from(audio, "base64")
  const file = new File([buffer], filename || "recording.webm", { type: "audio/webm" })

  const result = await openai.audio.transcriptions.create({ model, file })
  return { text: result.text || "" }
}

import { useAui } from "@assistant-ui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useChatRuntimeStore } from "@/store/chatRuntimeStore"
import { UIPhase } from "@/store/chatRuntimeStore"

type UIPhaseValue = (typeof UIPhase)[keyof typeof UIPhase]
type SelectionRange = { start: number; end: number }

export function useQueryBarDictation({
  uiPhase,
  getComposerTextarea,
}: {
  uiPhase: UIPhaseValue
  getComposerTextarea: () => HTMLTextAreaElement | null
}) {
  const startDictationPhase = useChatRuntimeStore((s) => s.startDictationPhase)
  const startTranscribingPhase = useChatRuntimeStore(
    (s) => s.startTranscribingPhase
  )
  const finishTranscribingPhase = useChatRuntimeStore(
    (s) => s.finishTranscribingPhase
  )
  const cancelUIPhase = useChatRuntimeStore((s) => s.cancelUIPhase)
  const aui = useAui()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const selectionRef = useRef<SelectionRange | null>(null)

  const [transcriptionConfigured, setTranscriptionConfigured] = useState(false)

  useEffect(() => {
    window.bridge
      .invoke("transcribe-configured")
      .then((result: unknown) => {
        const r = result as { configured?: boolean }
        setTranscriptionConfigured(!!r.configured)
      })
      .catch(() => setTranscriptionConfigured(false))
  }, [])

  const formatInsertText = useCallback(
    (before: string, after: string, text: string) => {
      const needsLeadingSpace =
        before.length > 0 &&
        !/\s$/.test(before) &&
        !/^[\s,.;:!?)}\]]/.test(text)
      const needsTrailingSpace =
        after.length > 0 && !/^\s/.test(after) && !/[\s([{]$/.test(text)

      const prefix = needsLeadingSpace ? " " : ""
      const suffix = needsTrailingSpace ? " " : ""
      return `${prefix}${text}${suffix}`
    },
    []
  )

  const stopTracks = useCallback(() => {
    if (!streamRef.current) return
    streamRef.current.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const startDictation = useCallback(async () => {
    if (uiPhase !== UIPhase.READY) return
    if (!transcriptionConfigured) {
      console.warn("[dictation] transcription not configured, skipping")
      return
    }

    try {
      const textarea = getComposerTextarea()
      if (textarea) {
        selectionRef.current = {
          start: textarea.selectionStart ?? textarea.value.length,
          end: textarea.selectionEnd ?? textarea.value.length,
        }
      } else {
        selectionRef.current = null
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      recorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        let transcribeSucceeded = false

        try {
          startTranscribingPhase()
          if (!chunksRef.current.length) {
            console.warn("[dictation] no audio chunks captured")
            return
          }

          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
          const base64Audio = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const value =
                typeof reader.result === "string"
                  ? reader.result.split(",")[1] || ""
                  : ""
              resolve(value)
            }
            reader.readAsDataURL(audioBlob)
          })

          const result = (await window.bridge.invoke("transcribe", {
            audio: base64Audio,
            filename: "recording.webm",
          })) as { success: boolean; text?: string; error?: string }

          if (!result.success) {
            const errorText = "error" in result ? result.error : "Unknown error"
            console.error(
              "[dictation] transcription failed:",
              errorText || "Unknown error"
            )
            const composer = aui.composer()
            const currentText = composer.getState().text || ""
            composer.setText(
              currentText +
                (currentText ? " " : "") +
                `[Transcription failed: ${errorText}]`
            )
            return
          }

          const nextText = String(result.text || "").trim()
          if (!nextText) {
            console.warn("[dictation] empty transcript")
            return
          }

          const composer = aui.composer()
          const currentText = composer.getState().text || ""
          const fallbackPos = currentText.length
          const start = Math.max(
            0,
            Math.min(selectionRef.current?.start ?? fallbackPos, fallbackPos)
          )
          const end = Math.max(
            start,
            Math.min(selectionRef.current?.end ?? start, fallbackPos)
          )
          const before = currentText.slice(0, start)
          const after = currentText.slice(end)
          const inserted = formatInsertText(before, after, nextText)
          const merged = `${before}${inserted}${after}`
          const caretPos = before.length + inserted.length

          composer.setText(merged)
          requestAnimationFrame(() => {
            const input = getComposerTextarea()
            if (!input) return
            input.focus()
            input.setSelectionRange(caretPos, caretPos)
          })
          transcribeSucceeded = true
        } catch (error) {
          console.error("Dictation/transcription failed:", error)
        } finally {
          stopTracks()
          chunksRef.current = []
          recorderRef.current = null
          finishTranscribingPhase({ success: transcribeSucceeded })
        }
      }

      startDictationPhase()
      mediaRecorder.start()
    } catch (error) {
      console.error("Error accessing microphone:", error)
      selectionRef.current = null
      stopTracks()
      cancelUIPhase()
    }
  }, [
    aui,
    cancelUIPhase,
    finishTranscribingPhase,
    formatInsertText,
    getComposerTextarea,
    startDictationPhase,
    startTranscribingPhase,
    stopTracks,
    uiPhase,
    transcriptionConfigured,
  ])

  const stopDictation = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state === "recording") {
      recorder.stop()
    }
  }, [])

  const toggleDictation = useCallback(async () => {
    if (uiPhase === UIPhase.DICTATING) {
      stopDictation()
      return
    }
    if (uiPhase !== UIPhase.READY) return
    if (!transcriptionConfigured) {
      console.warn("[dictation] transcription not configured, skipping")
      return
    }
    await startDictation()
  }, [startDictation, stopDictation, uiPhase, transcriptionConfigured])

  // Hold Alt to dictate, release to stop
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat) return
      if (uiPhase !== UIPhase.READY) return
      if (!transcriptionConfigured) return
      e.preventDefault()
      void startDictation()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return
      if (uiPhase !== UIPhase.DICTATING) return
      e.preventDefault()
      stopDictation()
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [startDictation, stopDictation, uiPhase, transcriptionConfigured])

  useEffect(() => {
    return () => {
      try {
        stopDictation()
      } catch {
        // no-op
      }
      stopTracks()
    }
  }, [stopDictation, stopTracks])

  const dictationUnavailable = !transcriptionConfigured

  return {
    resetComposerText() {
      aui.composer().setText("")
    },
    toggleDictation,
    inputDisabled:
      uiPhase === UIPhase.SUBMITTING || uiPhase === UIPhase.TRANSCRIBING,
    dictationDisabled:
      uiPhase === UIPhase.SUBMITTING ||
      uiPhase === UIPhase.TRANSCRIBING ||
      dictationUnavailable,
    placeholder:
      uiPhase === UIPhase.DICTATING
        ? "Listening... Release Alt key to stop."
        : uiPhase === UIPhase.TRANSCRIBING
          ? "Converting speech to text..."
          : uiPhase === UIPhase.SUBMITTING
            ? "Thinking..."
            : "Type your request...",
    dictationTooltipText:
      uiPhase === UIPhase.DICTATING
        ? "Stop (Release Alt)"
        : uiPhase === UIPhase.TRANSCRIBING
          ? "Processing"
          : dictationUnavailable
            ? "Add API key to dictate"
            : "Dictate (Press Alt)",
  }
}

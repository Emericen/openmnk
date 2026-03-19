import { useAui } from "@assistant-ui/react"
import { useCallback, useEffect, useRef } from "react"
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

          const result = await window.openmnk.dictation.transcribe({
            audio: base64Audio,
            filename: "recording.webm",
          })

          if (!result.success) {
            const errorText = "error" in result ? result.error : "Unknown error"
            console.error(
              "[dictation] transcription failed:",
              errorText || "Unknown error"
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
    await startDictation()
  }, [startDictation, stopDictation, uiPhase])

  useEffect(() => {
    const unsubscribe = window.openmnk.dictation.onCommand((payload) => {
      if (payload?.type === "start") {
        void startDictation()
        return
      }
      if (payload?.type === "stop") {
        stopDictation()
      }
    })
    return () => unsubscribe?.()
  }, [startDictation, stopDictation])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.altKey && e.code === "Backslash")) return

      const blockedByChat = uiPhase === UIPhase.SUBMITTING
      if (uiPhase === UIPhase.DICTATING || !blockedByChat) {
        e.preventDefault()
        void toggleDictation()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggleDictation, uiPhase])

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

  return {
    resetComposerText() {
      aui.composer().setText("")
    },
    toggleDictation,
    inputDisabled:
      uiPhase === UIPhase.SUBMITTING || uiPhase === UIPhase.TRANSCRIBING,
    dictationDisabled:
      uiPhase === UIPhase.SUBMITTING || uiPhase === UIPhase.TRANSCRIBING,
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
        ? "Stop (Releaes Alt key)"
        : uiPhase === UIPhase.TRANSCRIBING
          ? "Processing"
          : "Dictate (Press Alt key)",
  }
}

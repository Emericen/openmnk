import "../index.css"
import "./panel.css"

import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { useLauncherStore } from "../store/launcherStore"

function LauncherApp() {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const resizeRafRef = useRef<number>(0)
  const queryRef = useRef("")

  const query = useLauncherStore((s) => s.query)
  const dictationState = useLauncherStore((s) => s.dictationState)
  const setQuery = useLauncherStore((s) => s.setQuery)
  const clearQuery = useLauncherStore((s) => s.clearQuery)
  const setDictationState = useLauncherStore((s) => s.setDictationState)

  const [expanded, setExpanded] = useState(false)
  const [inputHeight, setInputHeight] = useState(28)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    function apply() {
      document.documentElement.classList.toggle("dark", mq.matches)
    }
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    queryRef.current = query
  }, [query])

  function scheduleResize(nextExpanded = expanded): void {
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = requestAnimationFrame(() => {
        const panel = panelRef.current
        if (!panel) return
        const contentHeight = Math.max(
          panel.getBoundingClientRect().height,
          panel.scrollHeight,
          document.body.scrollHeight
        )
        const extraHeight = nextExpanded ? 6 : 2
        const nextHeight = Math.ceil(contentHeight + extraHeight)
        window.openmnk.launcher.resize({ height: nextHeight })
      })
    })
  }

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    const nextInputHeight = Math.min(textarea.scrollHeight, 140)
    textarea.style.height = `${nextInputHeight}px`
    setInputHeight(nextInputHeight)
    const lineHeight =
      Number.parseFloat(getComputedStyle(textarea).lineHeight) || 19.5
    const nextExpanded = nextInputHeight > Math.ceil(lineHeight * 1.6)
    setExpanded(nextExpanded)
    scheduleResize(nextExpanded)
  }, [query])

  useEffect(() => {
    const offLauncher = window.openmnk.launcher.onEvent((payload) => {
      if (!payload?.type) return
      if (payload.type === "focus") {
        requestAnimationFrame(() => textareaRef.current?.focus())
        scheduleResize(expanded)
      }
    })

    requestAnimationFrame(() => textareaRef.current?.focus())
    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
      offLauncher?.()
    }
  }, [expanded])

  const submitDisabled = dictationState === "transcribing"

  async function submitQuery(): Promise<void> {
    const text = String(query || "").trim()
    if (!text) return
    window.openmnk.launcher.submit({ query: text })
    clearQuery()
  }

  async function startDictation(): Promise<void> {
    if (dictationState !== "idle") return
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      recorderRef.current = new MediaRecorder(streamRef.current)
      chunksRef.current = []
      recorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorderRef.current.onstop = async () => {
        try {
          setDictationState("transcribing")
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" })
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const result =
                typeof reader.result === "string"
                  ? reader.result.split(",")[1] || ""
                  : ""
              resolve(result)
            }
            reader.readAsDataURL(audioBlob)
          })
          const result = await window.openmnk.dictation.transcribe({
            audio: base64,
            filename: "recording.webm",
          })
          if (result?.success && result?.text) {
            const nextQuery = queryRef.current
            const prefix = nextQuery && !/\s$/.test(nextQuery) ? " " : ""
            setQuery(`${nextQuery}${prefix}${result.text.trim()}`)
          }
        } finally {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop())
          }
          streamRef.current = null
          recorderRef.current = null
          chunksRef.current = []
          setDictationState("idle")
          requestAnimationFrame(() => textareaRef.current?.focus())
        }
      }
      recorderRef.current.start()
      setDictationState("listening")
    } catch {
      setDictationState("idle")
    }
  }

  function stopDictation(): void {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }

  function onDictateClick(): void {
    if (dictationState === "listening") stopDictation()
    else startDictation()
  }

  useEffect(
    () => () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop()
      }
    },
    []
  )

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submitQuery()
    }
    if (event.key === "Escape") {
      window.openmnk.launcher.dismiss()
    }
  }

  const dictateLabel =
    dictationState === "transcribing"
      ? "..."
      : dictationState === "listening"
        ? "Stop"
        : "Dictate"

  return (
    <div className="panel-root">
      <div ref={panelRef} className="panel">
        <div ref={layoutRef} className={`layout${expanded ? " expanded" : ""}`}>
          <div className="left-zone">
            <textarea
              ref={textareaRef}
              id="query"
              className="query-textarea"
              rows={1}
              style={{ height: `${inputHeight}px` }}
              placeholder="Type a command (try /help). Enter to run."
              value={query}
              disabled={submitDisabled}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="right-zone">
            <button
              id="dictate"
              className="btn"
              type="button"
              onClick={onDictateClick}
            >
              {dictateLabel}
            </button>
            <button
              id="submit"
              className="btn primary"
              type="button"
              onClick={submitQuery}
              disabled={submitDisabled}
            >
              {"Run"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Root element #root was not found")
}

createRoot(rootElement).render(
  <StrictMode>
    <LauncherApp />
  </StrictMode>
)

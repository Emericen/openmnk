import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAui,
  useMessage,
} from "@assistant-ui/react"
import { Send, Mic, MicOff, Loader2 } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useChatRuntimeStore } from "@/store/chatRuntimeStore"
import { UIPhase } from "@/store/chatRuntimeStore"

type UIPhaseValue = (typeof UIPhase)[keyof typeof UIPhase]
type MarkdownProps = { children?: ReactNode }
type MarkdownLinkProps = { href?: string; children?: ReactNode }
type SystemStatusTextPartProps = { text: string; isInterrupt: boolean }
type SelectionRange = { start: number; end: number }
type SkillSummary = ReturnType<
  typeof useChatRuntimeStore.getState
>["skills"][number]

const markdownComponents: Components = {
  p: ({ children }: MarkdownProps) => (
    <p className="text-base text-foreground leading-normal mb-4 last:mb-0">
      {children}
    </p>
  ),
  h1: ({ children }: MarkdownProps) => (
    <h1 className="text-xl font-bold text-foreground mb-3 mt-6 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: MarkdownProps) => (
    <h2 className="text-lg font-bold text-foreground mb-3 mt-5 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: MarkdownProps) => (
    <h3 className="text-base font-bold text-foreground mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  ),
  ul: ({ children }: MarkdownProps) => (
    <ul className="list-disc list-outside pl-6 mb-4 space-y-1">{children}</ul>
  ),
  ol: ({ children }: MarkdownProps) => (
    <ol className="list-decimal list-outside pl-6 mb-4 space-y-1">
      {children}
    </ol>
  ),
  li: ({ children }: MarkdownProps) => (
    <li className="text-base text-foreground leading-normal">{children}</li>
  ),
  code: ({ children }: MarkdownProps) => (
    <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono text-foreground">
      {children}
    </code>
  ),
  a: ({ href, children }: MarkdownLinkProps) => (
    <a
      href={href}
      className="text-blue-600 underline"
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.preventDefault()
        if (href) window.open(href, "_blank")
      }}
    >
      {children}
    </a>
  ),
  pre: ({ children }: MarkdownProps) => (
    <pre className="bg-muted p-3 rounded mb-4 overflow-x-auto text-foreground font-mono">
      {children}
    </pre>
  ),
}

const UserMessage = () => (
  <MessagePrimitive.Root className="flex w-full justify-end px-6 py-1">
    <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-3 text-base leading-normal">
      <MessagePrimitive.Content />
    </div>
  </MessagePrimitive.Root>
)

const AssistantMessage = () => (
  <MessagePrimitive.Root className="w-full px-6 py-1">
    <div className="text-base text-foreground leading-normal">
      <MessagePrimitive.Parts
        components={{
          Text: ({ text }) => (
            <ReactMarkdown components={markdownComponents}>
              {text}
            </ReactMarkdown>
          ),
          Image: ({ image }) => (
            <img
              src={image}
              alt="Desktop screenshot"
              className="rounded-lg w-full h-auto shadow-lg"
            />
          ),
        }}
      />
    </div>
  </MessagePrimitive.Root>
)

const SystemStatusTextPart = ({
  text,
  isInterrupt,
}: SystemStatusTextPartProps) => {
  const content = String(text || "")
  return (
    <p
      className={`m-0 text-sm leading-5 ${
        isInterrupt ? "text-red-400" : "text-muted-foreground"
      }`}
    >
      {content}
    </p>
  )
}

const SystemMessage = () => {
  const visibleMessages = useChatRuntimeStore((s) => s.visibleMessages)
  const messageIndex = useMessage((s) => s.index)

  const lastProgressIndex = useMemo(() => {
    let last = -1
    for (let i = 0; i < visibleMessages.length; i += 1) {
      if (visibleMessages[i]?.role === "system") last = i
    }
    return last
  }, [visibleMessages])

  const isLastProgress = messageIndex === lastProgressIndex
  const textContent = useMemo(() => {
    const message = visibleMessages[messageIndex]
    const parts = Array.isArray(message?.content) ? message.content : []
    return parts
      .filter((part) => part?.type === "text")
      .map((part) => String(part.text || ""))
      .join(" ")
      .trim()
  }, [visibleMessages, messageIndex])
  const isInterruptMessage = /interrupted|unavailable|provider.*error/i.test(
    textContent
  )

  return (
    <MessagePrimitive.Root className="w-full px-6 py-0">
      <div className="max-w-[90%] grid grid-cols-[16px_1fr] gap-3">
        <div className="relative flex justify-center">
          <div className="absolute top-0 h-2.5 w-px bg-muted-foreground/30" />
          {!isLastProgress ? (
            <div className="absolute top-2.5 bottom-0 w-px bg-muted-foreground/30" />
          ) : null}
          <div className="relative mt-1.5 h-2.5 w-2.5 rounded-full border border-muted-foreground/65 bg-background" />
        </div>
        <div className="pb-1.5 pt-1">
          <MessagePrimitive.Parts
            components={{
              Text: ({ text }) => (
                <SystemStatusTextPart
                  text={text}
                  isInterrupt={isInterruptMessage}
                />
              ),
              Image: ({ image }) => (
                <img
                  src={image}
                  alt="Desktop screenshot"
                  className="rounded-lg w-full h-auto shadow-lg"
                />
              ),
            }}
          />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function QueryBar() {
  const uiPhase = useChatRuntimeStore((s) => s.uiPhase)
  const skills = useChatRuntimeStore((s) => s.skills)
  const sendMessage = useChatRuntimeStore((s) => s.sendMessage)
  const startDictationPhase = useChatRuntimeStore((s) => s.startDictationPhase)
  const startTranscribingPhase = useChatRuntimeStore(
    (s) => s.startTranscribingPhase
  )
  const finishTranscribingPhase = useChatRuntimeStore(
    (s) => s.finishTranscribingPhase
  )
  const cancelUIPhase = useChatRuntimeStore((s) => s.cancelUIPhase)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const selectionRef = useRef<SelectionRange | null>(null)
  const aui = useAui()
  const lastPhaseRef = useRef<UIPhaseValue>(UIPhase.READY)
  const [inputText, setInputText] = useState("")

  const getComposerTextarea = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement) return active
    const found = document.querySelector("textarea")
    return found instanceof HTMLTextAreaElement ? found : null
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
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
  ])

  const stopDictation = useCallback((): void => {
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
        toggleDictation()
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

  const inputDisabled =
    uiPhase === UIPhase.SUBMITTING || uiPhase === UIPhase.TRANSCRIBING
  const dictationDisabled =
    uiPhase === UIPhase.SUBMITTING || uiPhase === UIPhase.TRANSCRIBING

  const placeholder =
    uiPhase === UIPhase.DICTATING
      ? "Listening... Release Alt key to stop."
      : uiPhase === UIPhase.TRANSCRIBING
        ? "Converting speech to text..."
        : uiPhase === UIPhase.SUBMITTING
          ? "Thinking..."
          : "Type your request..."

  const dictationTooltipText =
    uiPhase === UIPhase.DICTATING
      ? "Stop (Releaes Alt key)"
      : uiPhase === UIPhase.TRANSCRIBING
        ? "Processing"
        : "Dictate (Press Alt key)"

  const suggestions = useMemo(() => {
    const query = String(inputText || "")
      .trim()
      .toLowerCase()
    if (!query) return []
    return skills
      .filter((skill) =>
        String(skill?.search_text || skill?.title || "")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 5)
  }, [inputText, skills])

  const renderHighlightedTitle = useCallback((title: string, query: string) => {
    const text = String(title || "")
    const match = String(query || "").trim()
    if (!match) return text

    const lowerText = text.toLowerCase()
    const lowerQuery = match.toLowerCase()
    const index = lowerText.indexOf(lowerQuery)
    if (index < 0) return text

    return (
      <>
        {text.slice(0, index)}
        <span className="text-foreground font-semibold">
          {text.slice(index, index + match.length)}
        </span>
        {text.slice(index + match.length)}
      </>
    )
  }, [])

  const runSuggestedSkill = useCallback(
    async (skill: SkillSummary) => {
      const title = String(skill?.title || "").trim()
      if (!title || inputDisabled) return

      setInputText("")
      aui.composer().setText("")
      await sendMessage(title, { skillId: skill.id })
    },
    [aui, inputDisabled, sendMessage]
  )

  useEffect(() => {
    const prev = lastPhaseRef.current
    if (
      prev !== UIPhase.READY &&
      uiPhase === UIPhase.READY &&
      document.visibilityState === "visible"
    ) {
      requestAnimationFrame(() => {
        const input = getComposerTextarea()
        if (input) input.focus()
      })
    }
    lastPhaseRef.current = uiPhase
  }, [getComposerTextarea, uiPhase])

  useEffect(() => {
    const maybeFocus = () => {
      if (inputDisabled) return
      requestAnimationFrame(() => {
        const input = getComposerTextarea()
        if (input) input.focus()
      })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        maybeFocus()
      }
    }

    window.addEventListener("focus", maybeFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("focus", maybeFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [inputDisabled, getComposerTextarea])

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background p-4">
      <div className="max-w-4xl mx-auto w-full">
        {uiPhase === UIPhase.READY && suggestions.length > 0 ? (
          <div className="mb-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="max-h-56 overflow-y-auto">
              {suggestions.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b last:border-b-0 border-border"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runSuggestedSkill(skill)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">
                        {renderHighlightedTitle(skill.title, inputText)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <ComposerPrimitive.Root>
          <Card className="relative flex flex-col p-2 bg-card dark:bg-zinc-700/50 border border-border">
            <div className="px-2 pb-8">
              <ComposerPrimitive.Input
                placeholder={placeholder}
                disabled={inputDisabled}
                onChange={(event) => setInputText(event.target.value)}
                className={`w-full min-h-[24px] max-h-[150px] resize-none border-none outline-none bg-transparent text-left overflow-y-auto ${
                  uiPhase !== UIPhase.READY ? "text-muted-foreground" : ""
                }`}
                spellCheck="false"
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                rows={1}
                style={{
                  WebkitAppRegion: "no-drag",
                  scrollbarWidth: "thin",
                  scrollbarColor: "#cbd5e1 transparent",
                }}
              />
            </div>

            <div className="absolute bottom-2 left-2 right-2 flex items-center">
              <div className="flex-1" />

              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 w-7 p-0"
                      style={{ WebkitAppRegion: "no-drag" }}
                      variant={
                        uiPhase === UIPhase.DICTATING ? "destructive" : "ghost"
                      }
                      onClick={toggleDictation}
                      disabled={dictationDisabled}
                    >
                      {uiPhase === UIPhase.DICTATING ? (
                        <MicOff className="h-3.5 w-3.5" />
                      ) : uiPhase === UIPhase.TRANSCRIBING ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mic className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{dictationTooltipText}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <ComposerPrimitive.Send
                      disabled={inputDisabled}
                      className="inline-flex items-center justify-center h-7 w-7 p-0 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                      style={{ WebkitAppRegion: "no-drag" }}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </ComposerPrimitive.Send>
                  </TooltipTrigger>
                  <TooltipContent>Submit (Enter)</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {uiPhase === UIPhase.DICTATING && (
              <div className="absolute top-2 right-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-500 font-medium">
                  Recording
                </span>
              </div>
            )}
          </Card>
        </ComposerPrimitive.Root>
      </div>
    </div>
  )
}

export default function Thread() {
  const uiPhase = useChatRuntimeStore((s) => s.uiPhase)
  const hasOlderMessages = useChatRuntimeStore((s) => s.hasOlderMessages)
  const loadOlderMessages = useChatRuntimeStore((s) => s.loadOlderMessages)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const loadingOlderRef = useRef(false)

  const onViewportScroll = () => {
    const viewport = viewportRef.current
    if (!viewport || !hasOlderMessages || loadingOlderRef.current) return
    if (viewport.scrollTop > 60) return

    loadingOlderRef.current = true
    const prevHeight = viewport.scrollHeight
    const prevTop = viewport.scrollTop
    loadOlderMessages()

    requestAnimationFrame(() => {
      const nextHeight = viewport.scrollHeight
      viewport.scrollTop = nextHeight - prevHeight + prevTop
      loadingOlderRef.current = false
    })
  }

  return (
    <ThreadPrimitive.Root className="flex flex-col h-full min-h-0">
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        onScroll={onViewportScroll}
        className="flex-1 min-h-0 overflow-y-auto pt-12 pb-28"
      >
        <ThreadPrimitive.Empty>
          <div className="h-full flex items-start justify-center pt-6 text-muted-foreground text-3xl px-6">
            What can I do for you?
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
            SystemMessage,
          }}
        />
        {uiPhase === UIPhase.SUBMITTING && (
          <div className="px-6 py-2 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
      </ThreadPrimitive.Viewport>

      <QueryBar />
    </ThreadPrimitive.Root>
  )
}

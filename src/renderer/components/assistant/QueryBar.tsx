import { AuiIf, ComposerPrimitive } from "@assistant-ui/react"
import { Loader2, Mic, MicOff, Pause, Send } from "lucide-react"
import { useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { UIPhase, useChatRuntimeStore } from "@/store/chatRuntimeStore"
import { useQueryBarDictation } from "./useQueryBarDictation"

export function QueryBar() {
  const uiPhase = useChatRuntimeStore((s) => s.uiPhase)
  const stop = useChatRuntimeStore((s) => s.stop)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const lastPhaseRef = useRef(uiPhase)

  const getComposerTextarea = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement) return active
    const found = document.querySelector("textarea")
    return found instanceof HTMLTextAreaElement ? found : null
  }, [])

  const {
    toggleDictation,
    inputDisabled,
    dictationDisabled,
    placeholder,
    dictationTooltipText,
  } = useQueryBarDictation({ uiPhase, getComposerTextarea })

  // Escape key to stop running session
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && uiPhase === UIPhase.SUBMITTING) {
        e.preventDefault()
        stop()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [uiPhase, stop])

  // Re-focus input when session completes (phase returns to READY)
  useEffect(() => {
    const prev = lastPhaseRef.current
    lastPhaseRef.current = uiPhase
    if (prev !== UIPhase.READY && uiPhase === UIPhase.READY) {
      requestAnimationFrame(() => {
        const el = composerRef.current?.querySelector<HTMLElement>("textarea")
        el?.focus()
      })
    }
  }, [uiPhase])

  // Re-focus input when window regains focus
  const focusInput = useCallback(() => {
    if (inputDisabled) return
    requestAnimationFrame(() => {
      const el = composerRef.current?.querySelector<HTMLElement>("textarea")
      el?.focus()
    })
  }, [inputDisabled])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") focusInput()
    }
    window.addEventListener("focus", focusInput)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("focus", focusInput)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [focusInput])

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background p-4">
      <div className="max-w-4xl mx-auto w-full" ref={composerRef}>
        <ComposerPrimitive.Root>
          <Card className="relative flex flex-col p-2 bg-card dark:bg-zinc-700/50 border border-border">
            <div className="px-2 pb-8">
              <ComposerPrimitive.Input
                placeholder={placeholder}
                disabled={inputDisabled}
                className={`w-full min-h-[24px] max-h-[150px] resize-none border-none outline-none bg-transparent text-left overflow-y-auto [-webkit-app-region:no-drag] [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] ${
                  uiPhase !== UIPhase.READY ? "text-muted-foreground" : ""
                }`}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                rows={1}
              />
            </div>

            <div className="absolute bottom-2 left-2 right-2 flex items-center">
              <div className="flex-1" />

              <div className="flex gap-1">
                {/* Dictation button — managed by our UIPhase store */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 w-7 p-0"
                      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                      variant={
                        uiPhase === UIPhase.DICTATING ? "destructive" : "ghost"
                      }
                      onClick={() => void toggleDictation()}
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

                {uiPhase === UIPhase.SUBMITTING ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 w-7 p-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                        onClick={stop}
                      >
                        <Pause className="h-3.5 w-3.5 fill-current" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Stop (Escape)</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ComposerPrimitive.Send
                        className="inline-flex items-center justify-center h-7 w-7 p-0 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                        style={
                          { WebkitAppRegion: "no-drag" } as React.CSSProperties
                        }
                      >
                        <Send className="h-3.5 w-3.5" />
                      </ComposerPrimitive.Send>
                    </TooltipTrigger>
                    <TooltipContent>Submit (Enter)</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {uiPhase === UIPhase.DICTATING ? (
              <div className="absolute top-2 right-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-500 font-medium">
                  Recording
                </span>
              </div>
            ) : null}
          </Card>
        </ComposerPrimitive.Root>
      </div>
    </div>
  )
}

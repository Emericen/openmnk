import { ComposerPrimitive } from "@assistant-ui/react"
import { Loader2, Mic, MicOff, Send } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { UIPhase, useChatRuntimeStore } from "@/store/chatRuntimeStore"
import { SkillSuggestions } from "./SkillSuggestions"
import { useQueryBarDictation } from "./useQueryBarDictation"

type UIPhaseValue = (typeof UIPhase)[keyof typeof UIPhase]
type SkillSummary = ReturnType<
  typeof useChatRuntimeStore.getState
>["skills"][number]

export function QueryBar() {
  const uiPhase = useChatRuntimeStore((s) => s.uiPhase)
  const skills = useChatRuntimeStore((s) => s.skills)
  const sendMessage = useChatRuntimeStore((s) => s.sendMessage)
  const lastPhaseRef = useRef<UIPhaseValue>(UIPhase.READY)
  const [inputText, setInputText] = useState("")

  const getComposerTextarea = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement) return active
    const found = document.querySelector("textarea")
    return found instanceof HTMLTextAreaElement ? found : null
  }, [])

  const {
    resetComposerText,
    toggleDictation,
    inputDisabled,
    dictationDisabled,
    placeholder,
    dictationTooltipText,
  } = useQueryBarDictation({
    uiPhase,
    getComposerTextarea,
  })

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
      resetComposerText()
      await sendMessage(title, { skillId: skill.id })
    },
    [inputDisabled, resetComposerText, sendMessage]
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
  }, [getComposerTextarea, inputDisabled])

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background p-4">
      <div className="max-w-4xl mx-auto w-full">
        {uiPhase === UIPhase.READY ? (
          <SkillSuggestions
            inputText={inputText}
            suggestions={suggestions}
            onRun={runSuggestedSkill}
            renderHighlightedTitle={renderHighlightedTitle}
          />
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

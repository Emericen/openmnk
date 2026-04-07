import { useMemo, type ReactNode } from "react"
import { MessagePrimitive, useMessage } from "@assistant-ui/react"
import { Check, Loader2, Play, X } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import { Button } from "@/components/ui/button"
import { useChatRuntimeStore } from "@/store/chatRuntimeStore"
import type { RunCommandMessageMeta } from "../../../shared/ipc-contract"

type MarkdownProps = { children?: ReactNode }
type MarkdownLinkProps = { href?: string; children?: ReactNode }
type SystemStatusTextPartProps = {
  text: string
  isInterrupt: boolean
  detail?: string
  runCommand?: RunCommandMessageMeta
  onApprove?: () => void
  onReject?: () => void
}

function splitRunCommandDetail(detail?: string, fallbackCmd?: string) {
  const lines = String(detail || "").split("\n")
  const firstLine = lines[0] || ""
  const command = firstLine.startsWith("$ ")
    ? firstLine.slice(2)
    : fallbackCmd || firstLine
  const output = firstLine.startsWith("$ ")
    ? lines.slice(1).join("\n").trim()
    : String(detail || "").trim()

  return {
    command: command.trim(),
    output,
  }
}

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

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-end px-6 py-1">
      <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-3 text-base leading-normal">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

export function AssistantMessage() {
  return (
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
}

function SystemStatusTextPart({
  text,
  isInterrupt,
  detail,
  runCommand,
  onApprove,
  onReject,
}: SystemStatusTextPartProps) {
  const { command, output } = splitRunCommandDetail(detail, runCommand?.cmd)

  return (
    <div>
      <p
        className={`m-0 text-sm leading-5 ${
          isInterrupt ? "text-red-400" : "text-muted-foreground"
        }`}
      >
        {String(text || "")}
      </p>
      {runCommand ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-50 shadow-sm">
          <div className="border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            Sandbox Terminal
          </div>
          <div className="px-3 py-3">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm text-emerald-400">
              $ {command}
            </pre>
            {output ? (
              <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200">
                {output}
              </pre>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                {runCommand.status === "pending" ? (
                  <span>Awaiting your approval</span>
                ) : null}
                {runCommand.status === "resolving" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Running command...</span>
                  </>
                ) : null}
                {runCommand.status === "approved" ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Command executed</span>
                  </>
                ) : null}
                {runCommand.status === "rejected" ? (
                  <>
                    <X className="h-3.5 w-3.5 text-rose-400" />
                    <span>Command cancelled</span>
                  </>
                ) : null}
              </div>
              {runCommand.status === "pending" ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-900"
                    onClick={onReject}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                    onClick={onApprove}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Execute
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : detail ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground/70 hover:text-muted-foreground select-none">
            details
          </summary>
          <pre className="mt-1 text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap break-words bg-muted/50 rounded px-2 py-1.5 max-h-48 overflow-y-auto">
            {detail}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

export function SystemMessage() {
  const visibleMessages = useChatRuntimeStore((s) => s.visibleMessages)
  const respondToRunCommand = useChatRuntimeStore((s) => s.respondToRunCommand)
  const messageIndex = useMessage((s) => s.index)
  const message = visibleMessages[messageIndex]

  const lastProgressIndex = useMemo(() => {
    let last = -1
    for (let i = 0; i < visibleMessages.length; i += 1) {
      if (visibleMessages[i]?.role === "system") last = i
    }
    return last
  }, [visibleMessages])

  const isLastProgress = messageIndex === lastProgressIndex
  const textContent = useMemo(() => {
    const parts = Array.isArray(message?.content) ? message.content : []
    return parts
      .filter((part) => part?.type === "text")
      .map((part) => String(part.text || ""))
      .join(" ")
      .trim()
  }, [message])

  const isInterruptMessage = /interrupted|unavailable|provider.*error/i.test(
    textContent
  )

  const detailMap = useMemo(() => {
    const parts = Array.isArray(message?.content) ? message.content : []
    const map = new Map<number, string>()
    let textIdx = 0
    for (const part of parts) {
      if (part?.type === "text") {
        const d = (part as { detail?: string }).detail
        if (d) map.set(textIdx, d)
        textIdx += 1
      }
    }
    return map
  }, [message])

  let textPartIndex = 0

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
              Text: ({ text }) => {
                const idx = textPartIndex++
                return (
                  <SystemStatusTextPart
                    text={text}
                    isInterrupt={isInterruptMessage}
                    detail={detailMap.get(idx)}
                    runCommand={idx === 0 ? message?.runCommand : undefined}
                    onApprove={
                      idx === 0 && message?.id
                        ? () => void respondToRunCommand(message.id, true)
                        : undefined
                    }
                    onReject={
                      idx === 0 && message?.id
                        ? () => void respondToRunCommand(message.id, false)
                        : undefined
                    }
                  />
                )
              },
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

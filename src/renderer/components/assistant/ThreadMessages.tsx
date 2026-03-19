import { useMemo, type ReactNode } from "react"
import { MessagePrimitive, useMessage } from "@assistant-ui/react"
import ReactMarkdown, { type Components } from "react-markdown"
import { useChatRuntimeStore } from "@/store/chatRuntimeStore"

type MarkdownProps = { children?: ReactNode }
type MarkdownLinkProps = { href?: string; children?: ReactNode }
type SystemStatusTextPartProps = { text: string; isInterrupt: boolean }

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
}: SystemStatusTextPartProps) {
  return (
    <p
      className={`m-0 text-sm leading-5 ${
        isInterrupt ? "text-red-400" : "text-muted-foreground"
      }`}
    >
      {String(text || "")}
    </p>
  )
}

export function SystemMessage() {
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

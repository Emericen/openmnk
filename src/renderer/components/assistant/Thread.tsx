import { ThreadPrimitive } from "@assistant-ui/react"
import { useEffect, useRef } from "react"
import { useChatRuntimeStore } from "@/store/chatRuntimeStore"
import { QueryBar } from "./QueryBar"
import { AssistantMessage, SystemMessage, UserMessage } from "./ThreadMessages"

export default function Thread() {
  const messages = useChatRuntimeStore((s) => s.messages)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight
    })
  }, [messages])

  return (
    <ThreadPrimitive.Root className="flex flex-col h-full min-h-0">
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        className="flex-1 min-h-0 overflow-y-auto pt-12 pb-4"
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
      </ThreadPrimitive.Viewport>

      <QueryBar />
    </ThreadPrimitive.Root>
  )
}

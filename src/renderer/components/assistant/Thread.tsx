import { ThreadPrimitive } from "@assistant-ui/react"
import { useRef } from "react"
import { useChatRuntimeStore } from "@/store/chatRuntimeStore"
import { QueryBar } from "./query-bar/QueryBar"
import { AssistantMessage, SystemMessage, UserMessage } from "./ThreadMessages"

export default function Thread() {
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

        {/* Loading spinner is now part of the timeline via SystemMessage */}
      </ThreadPrimitive.Viewport>

      <QueryBar />
    </ThreadPrimitive.Root>
  )
}

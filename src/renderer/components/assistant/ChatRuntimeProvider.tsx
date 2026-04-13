import { useMemo, type ReactNode } from "react"
import {
  AssistantRuntimeProvider,
  type AppendMessage,
  useExternalStoreRuntime,
} from "@assistant-ui/react"
import { UIPhase, useChatRuntimeStore } from "@/store/chatRuntimeStore"
import type { ChatMessage } from "../../../shared/ipc-contract"

// Convert our ChatMessage to assistant-ui's format.
// Command parts become text parts so assistant-ui doesn't complain.
// The actual rendering of command parts is handled by our custom SystemMessage component
// which reads directly from visibleMessages.
function convertMessage(message: ChatMessage) {
  return {
    ...message,
    content: message.content.map((part) => {
      if (part.type === "command") {
        return { type: "text" as const, text: part.description }
      }
      return part
    }),
  }
}

export default function ChatRuntimeProvider({
  children,
}: {
  children: ReactNode
}) {
  const visibleMessages = useChatRuntimeStore((s) => s.visibleMessages)
  const uiPhase = useChatRuntimeStore((s) => s.uiPhase)
  const sendMessage = useChatRuntimeStore((s) => s.sendMessage)

  const runtime = useExternalStoreRuntime({
    isRunning: uiPhase === UIPhase.SUBMITTING,
    messages: visibleMessages,
    convertMessage: useMemo(() => convertMessage, []),
    onNew: async (message: AppendMessage) => {
      const textPart = message.content.find((part) => part.type === "text")
      if (!textPart || textPart.type !== "text") return
      sendMessage(textPart.text ?? "")
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}

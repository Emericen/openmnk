import { useMemo, type ReactNode } from "react"
import {
  AssistantRuntimeProvider,
  type AppendMessage,
  useExternalStoreRuntime,
} from "@assistant-ui/react"
import { UIPhase, useChatRuntimeStore } from "@/store/chatRuntimeStore"
import type { ChatMessage } from "../../../shared/ipc-contract"

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
    convertMessage: useMemo(() => (message: ChatMessage) => message, []),
    onNew: async (message: AppendMessage) => {
      const textPart = message.content.find((part) => part.type === "text")
      if (!textPart || textPart.type !== "text") return
      await sendMessage(textPart.text ?? "")
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}

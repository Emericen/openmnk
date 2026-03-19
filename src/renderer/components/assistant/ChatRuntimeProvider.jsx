import { useMemo } from "react"
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime
} from "@assistant-ui/react"
import { UIPhase, useChatRuntimeStore } from "@/store/chatRuntimeStore.js"

export default function ChatRuntimeProvider({ children }) {
  const visibleMessages = useChatRuntimeStore((s) => s.visibleMessages)
  const uiPhase = useChatRuntimeStore((s) => s.uiPhase)
  const sendMessage = useChatRuntimeStore((s) => s.sendMessage)

  const runtime = useExternalStoreRuntime({
    isRunning: uiPhase === UIPhase.SUBMITTING,
    messages: visibleMessages,
    convertMessage: useMemo(() => (message) => message, []),
    onNew: async (message) => {
      const textPart = message.content.find((part) => part.type === "text")
      if (!textPart || textPart.type !== "text") return
      await sendMessage(textPart.text)
    }
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}

import { useEffect } from "react"
import ChatRuntimeProvider from "@/components/assistant/ChatRuntimeProvider"
import Thread from "@/components/assistant/Thread"
import { useChatRuntimeStore } from "@/store/chatRuntimeStore"

export default function ChatWindow() {
  const initBridge = useChatRuntimeStore((s) => s.initBridge)

  useEffect(() => {
    initBridge()
  }, [initBridge])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    function apply() {
      document.documentElement.classList.toggle("dark", mq.matches)
    }
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  return (
    <ChatRuntimeProvider>
      <div className="h-screen bg-background flex flex-col">
        <div className="flex-1 min-h-0">
          <Thread />
        </div>
      </div>
    </ChatRuntimeProvider>
  )
}

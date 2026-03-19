import "./index.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import ChatWindow from "./windows/chat"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ChatWindow />
  </StrictMode>
)

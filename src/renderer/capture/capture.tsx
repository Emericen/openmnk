import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./vision-capture"

function CaptureApp() {
  return null
}

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Root element #root was not found")
}

createRoot(rootElement).render(
  <StrictMode>
    <CaptureApp />
  </StrictMode>
)

import "../index.css"
import "./panel.css"

import { StrictMode, useEffect, useRef } from "react"
import { createRoot } from "react-dom/client"
import { useOverlayStore } from "../store/overlayStore"

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function formatInlineMarkdown(value) {
  const escaped = escapeHtml(value)
  const withCode = escaped.replaceAll(/`([^`]+)`/g, "<code>$1</code>")
  const withStrong = withCode.replaceAll(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  return withStrong.replaceAll("\n", "<br/>")
}

function OverlayApp() {
  const panelRef = useRef(null)
  const resizeRafRef = useRef(0)

  const type = useOverlayStore((s) => s.type)
  const text = useOverlayStore((s) => s.text)
  const acceptHintText = useOverlayStore((s) => s.acceptHintText)
  const denyHintText = useOverlayStore((s) => s.denyHintText)
  const setPayload = useOverlayStore((s) => s.setPayload)

  const loading = type === "loading"
  const action = type === "action"
  const showShortcutHints = action || loading
  const expanded = action && text.includes("\n")

  function scheduleResize(nextExpanded = expanded) {
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = requestAnimationFrame(() => {
        const panel = panelRef.current
        if (!panel) return
        const contentHeight = Math.max(
          panel.getBoundingClientRect().height,
          panel.scrollHeight,
          document.body.scrollHeight
        )
        const extraHeight = nextExpanded ? 6 : 2
        const nextHeight = Math.ceil(contentHeight + extraHeight)
        window.api.send("panel", {
          type: "resize",
          height: nextHeight,
          windowType: "overlay"
        })
      })
    })
  }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    function apply() {
      document.documentElement.classList.toggle("dark", mq.matches)
    }
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.on("panel", (payload) => {
      if (!payload?.type) return
      setPayload(payload)
    })
    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current)
      unsubscribe?.()
    }
  }, [setPayload])

  useEffect(() => {
    scheduleResize(expanded)
  }, [expanded, text, type])

  return (
    <div className={`panel-root mode-popup`}>
      <div ref={panelRef} className="panel">
        <div className={`layout${expanded ? " expanded" : ""}`}>
          <div className={`left-zone${loading ? " has-spinner" : ""}`}>
            <div className={`spinner${loading ? " visible" : ""}`} />
            <div
              className="text"
              dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(text) }}
            />
          </div>
          <div className="right-zone">
            {showShortcutHints ? (
              <div className="accept-indicator">
                {[acceptHintText, denyHintText].filter(Boolean).join("  ")}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>
)

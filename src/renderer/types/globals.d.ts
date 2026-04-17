import "react"

declare module "iohook-macos"

declare module "react-dom/client"

declare module "@assistant-ui/react"

declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag"
  }
}

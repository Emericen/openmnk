We expose a tiny `bridge` object to the renderer.

Core ideas:

- **Channels** are strings like `"workflow:123"`, `"texts:update"`, `"screenshot"`.
- Each channel is a **sequential stream** of JSON messages.
- You **subscribe once per channel** at startup and route messages by `type`.

## Preload script

```jsx
// preload.js
import { contextBridge, ipcRenderer } from "electron"

/**
 * Minimal IPC bridge:
 * - send: fire-and-forget message on a channel
 * - on: subscribe to a channel; returns an unsubscribe fn
 */
const bridge = {
  send(channel, payload) {
    ipcRenderer.send(channel, payload)
  },

  on(channel, callback) {
    const listener = (_event, payload) => {
      callback(payload)
    }
    ipcRenderer.on(channel, listener)

    // Return cleanup so caller can unsubscribe if needed
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

contextBridge.exposeInMainWorld("bridge", bridge)

```

Renderer code now only ever talks to `window.bridge`, never `ipcRenderer` directly.

---

## Frontend usage

### Sending messages to backend

```jsx
// channel: string like "workflow:123", "texts:update", etc.
// payload: JSON-serializable object
window.bridge.send("workflow:123", {
  type: "execute",
  text: "do something"
})

```

### Listening for backend messages

You usually subscribe **once per channel** during app setup:

```jsx
// At renderer startup
window.bridge.on("workflow:123", (msg) => {
  if (msg.type === "tool-preview") {
    showPreview(msg.screenshot)
  } else if (msg.type === "result") {
    handleResult(msg)
  }
})
```

Each channel is ordered, so you can think in terms of “next message on this channel” instead of per-message IDs.

### Example: sequential workflow

```jsx
// 1) Ask backend to start a workflow
window.bridge.send("workflow:123", {
  type: "execute",
  text: "do something"
})

// 2) Handle messages on that workflow channel
window.bridge.on("workflow:123", (msg) => {
  if (msg.type === "tool-preview") {
    showPreview(msg.screenshot)

    // When user approves, send the next message
    window.bridge.send("workflow:123", {
      type: "approve",
      approved: true
    })
  } else if (msg.type === "result") {
    showFinalResult(msg)
  }
})

```

---

## Backend usage (main process)

### Sending messages to renderer

```jsx
// main.js
mainWindow.webContents.send("workflow:123", {
  type: "tool-preview",
  screenshot: "data:image/jpeg;base64,..."
})

```

### Listening for messages from renderer

```jsx
import { ipcMain } from "electron"

ipcMain.on("workflow:123", (event, msg) => {
  if (msg.type === "execute") {
    // Do some work, then send preview
    mainWindow.webContents.send("workflow:123", {
      type: "tool-preview",
      screenshot: "..."
    })
  } else if (msg.type === "approve" && msg.approved) {
    executeAction()

    mainWindow.webContents.send("workflow:123", {
      type: "result",
      success: true
    })
  }
})

```

Again, we rely on the fact that messages on a given channel arrive in order, so we don’t track message IDs. If you have multiple workflows/users, give each one its own channel (e.g. `"workflow:abc123"`).

# Example: Request - Response

say backend wants to request a screenshot from chromium media recorder. with this bridge setup we can just do

renderer (FE) code:

```jsx
// renderer startup
window.bridge.on("screenshot:request", async () => {
  const screenshot = await captureFrame() // your existing function
  if (!screenshot) return

  window.bridge.send("screenshot:response", {
    image: screenshot // dataURL / base64
  })
})
```

main (BE) code

```jsx
import { ipcMain } from "electron"

function requestScreenshotOnce(mainWindow) {
  return new Promise((resolve) => {
    // Listen only for the next response, then auto-unsubscribe
    ipcMain.once("screenshot:response", (_event, msg) => {
      resolve(msg.image) // base64 dataURL
    })

    // Ask renderer for a screenshot
    mainWindow.webContents.send("screenshot:request")
  })
}

// Example: iohook handler
iohook.on("mousedown", async (event) => {
  const image = await requestScreenshotOnce(mainWindow)
  // do something with image
})
```

---

## Notes / guidelines

- **Subscribe once per channel** during renderer startup; don’t call `.on` in hot paths repeatedly.
- Use the `type` field inside your payload to model state transitions (`"execute"`, `"tool-preview"`, `"approve"`, `"result"`, …).
- If you ever need one-shot patterns (request/response), use `ipcRenderer.once` on a dedicated channel, or add a separate helper. For most early-stage startup use cases, the simple `send` + `on` pattern per channel is enough and easy to reason about.
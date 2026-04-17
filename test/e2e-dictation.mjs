import { _electron as electron } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const screenshotDir = path.join(root, "test", "screenshots")

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log("Launching app...")
  const app = await electron.launch({
    args: ["."],
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    timeout: 30000,
  })

  const window = await app.firstWindow()
  console.log("Window opened:", await window.title())
  await sleep(3000)

  // Step 1: Initial state — mic button visible, no recording badge
  await window.screenshot({ path: path.join(screenshotDir, "dict-01-initial.png") })
  const micBefore = await window.locator("svg.lucide-mic").count()
  console.log(`Mic icon visible: ${micBefore > 0}`)
  const recordingBefore = await window.locator("text=Recording").count()
  console.log(`Recording badge before: ${recordingBefore === 0 ? "hidden (correct)" : "VISIBLE (wrong)"}`)

  // Step 2: Simulate bridge dictation start (like holding Alt)
  console.log("Simulating dictation start via bridge...")
  await window.evaluate(() => {
    // The preload exposes window.bridge which sends IPC,
    // but we need to simulate the main→renderer direction.
    // The bridge.on("dictation", cb) listeners fire when main sends.
    // We can trigger it by dispatching directly through the bridge's internal listener.
    window.bridge.send("test:dictation-start")
  }).catch(() => {})

  // Alternative: use Electron IPC directly to send dictation event to renderer
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send("dictation", { type: "start" })
    }
  })

  await sleep(1500)
  await window.screenshot({ path: path.join(screenshotDir, "dict-02-recording.png") })
  const recordingDuring = await window.locator("text=Recording").count()
  console.log(`Recording badge during: ${recordingDuring > 0 ? "visible (correct)" : "HIDDEN (wrong)"}`)
  const micOffBtn = await window.locator("svg.lucide-mic-off").count()
  console.log(`MicOff icon visible: ${micOffBtn > 0}`)

  // Step 3: Simulate bridge dictation stop (like releasing Alt)
  console.log("Simulating dictation stop via bridge...")
  await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send("dictation", { type: "stop" })
    }
  })

  await sleep(2000)
  await window.screenshot({ path: path.join(screenshotDir, "dict-03-after-stop.png") })
  const recordingAfter = await window.locator("text=Recording").count()
  console.log(`Recording badge after stop: ${recordingAfter === 0 ? "hidden (correct)" : "VISIBLE (wrong)"}`)

  // Step 4: Verify mic button is back (not stuck in recording state)
  const micAfter = await window.locator("svg.lucide-mic").count()
  console.log(`Mic icon restored: ${micAfter > 0}`)

  // Summary
  console.log("\n--- Results ---")
  const passed =
    micBefore > 0 &&
    recordingBefore === 0 &&
    recordingDuring > 0 &&
    micOffBtn > 0 &&
    recordingAfter === 0 &&
    micAfter > 0
  console.log(passed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED")

  await app.close()
  console.log("Done!")
  process.exit(passed ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

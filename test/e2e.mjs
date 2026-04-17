import { _electron as electron } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const screenshotDir = path.join(root, "test", "screenshots")

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForGreeting(window, timeoutMs = 30000) {
  console.log("Waiting for AI greeting...")
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // Greeting is done when we have an assistant message and no Thinking...
    const thinking = await window.locator("text=Thinking...").count()
    const messages = await window.locator("[class*='assistant'], [class*='text-left']").count()
    if (thinking === 0 && messages > 0) {
      console.log("Greeting received!")
      return true
    }
    await sleep(1000)
  }
  console.log("Greeting timeout — continuing anyway")
  return false
}

async function waitForDone(window, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // Definitive signal: textarea is enabled (not disabled)
    const textarea = window.getByRole("textbox")
    const disabled = await textarea.getAttribute("disabled")
    if (disabled === null) return true
    await sleep(2000)
  }
  return false
}

async function main() {
  console.log("Launching app...")
  const app = await electron.launch({
    args: ["."],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
    timeout: 30000,
  })

  const window = await app.firstWindow()
  console.log("Window opened:", await window.title())
  await sleep(2000)

  // Step 1: wait for greeting from server
  await window.screenshot({ path: path.join(screenshotDir, "01-initial.png") })
  await waitForGreeting(window)
  await window.screenshot({ path: path.join(screenshotDir, "02-greeting.png") })

  // Step 2: type first query and submit
  const textarea = window.getByRole("textbox")
  await textarea.fill(
    'run 2 cmds. first one sleeps for 10s and echos "done". 2nd one runs ls. go'
  )
  await sleep(500)
  await textarea.press("Enter")
  console.log("Submitted first query")
  await sleep(3000)
  await window.screenshot({ path: path.join(screenshotDir, "03-running.png") })

  // Step 3: wait 5s then stop via Escape key
  await sleep(2000)
  console.log("Stopping...")
  await window.keyboard.press("Escape")
  await sleep(1000)
  await window.screenshot({ path: path.join(screenshotDir, "04-stopped.png") })

  // Step 4: type second query
  await sleep(1000)
  await textarea.fill(
    "actually, have first cmd wait for 3s please. 10 is too long."
  )
  await sleep(500)
  await textarea.press("Enter")
  console.log("Submitted second query")

  // Wait for completion
  const done = await waitForDone(window)
  console.log(done ? "Query finished!" : "Query timed out")

  await window.screenshot({ path: path.join(screenshotDir, "05-final.png") })
  console.log("Screenshot: 05-final.png")

  console.log("Closing app...")
  await app.close()
  console.log("Done!")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

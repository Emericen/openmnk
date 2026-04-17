import { _electron as electron } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const screenshotDir = path.join(root, "test", "screenshots")

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
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

  // Step 1: take initial screenshot
  await window.screenshot({ path: path.join(screenshotDir, "01-initial.png") })
  console.log("Screenshot: 01-initial.png")

  // Step 2: type first query and submit
  const textarea = window.getByRole("textbox", { name: "Type your request..." })
  await textarea.fill(
    'run 2 cmds. first one sleeps for 10s and echos "done". 2nd one runs ls. go'
  )
  await sleep(500)
  await window.screenshot({ path: path.join(screenshotDir, "02-typed.png") })
  console.log("Screenshot: 02-typed.png")

  await textarea.press("Enter")
  console.log("Submitted first query")
  await sleep(3000)
  await window.screenshot({
    path: path.join(screenshotDir, "03-running.png"),
  })
  console.log("Screenshot: 03-running.png")

  // Step 3: wait 5s then stop
  await sleep(2000)
  console.log("Stopping...")
  // Find the stop button (Square icon button visible during SUBMITTING)
  const stopButton = window.locator("button:has(svg)")
  const buttons = await stopButton.all()
  // The stop button should be the last button with an svg
  if (buttons.length > 0) {
    await buttons[buttons.length - 1].click()
  }
  await sleep(1000)
  await window.screenshot({
    path: path.join(screenshotDir, "04-stopped.png"),
  })
  console.log("Screenshot: 04-stopped.png")

  // Step 4: type second query
  await sleep(1000)
  await textarea.fill(
    "actually, have first cmd wait for 3s please. 10 is too long."
  )
  await sleep(500)
  await textarea.press("Enter")
  console.log("Submitted second query")

  // Wait for it to finish (poll for textarea to be enabled)
  for (let i = 0; i < 60; i++) {
    await sleep(2000)
    await window.screenshot({
      path: path.join(screenshotDir, `05-progress-${i}.png`),
    })
    console.log(`Screenshot: 05-progress-${i}.png`)

    // Check if the send button is back (not the stop button)
    // We detect this by checking if "Thinking..." text is gone
    const thinking = await window.locator("text=Thinking...").count()
    if (thinking === 0) {
      // Also check no spinning loader
      const spinning = await window.locator(".animate-spin").count()
      if (spinning === 0) {
        console.log("Query finished!")
        break
      }
    }
  }

  await window.screenshot({ path: path.join(screenshotDir, "06-final.png") })
  console.log("Screenshot: 06-final.png")

  console.log("Closing app...")
  await app.close()
  console.log("Done!")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

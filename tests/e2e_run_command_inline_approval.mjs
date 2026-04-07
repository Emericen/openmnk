import path from "node:path"
import { fileURLToPath } from "node:url"
import { _electron as electron } from "playwright"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const failureScreenshotPath = "/tmp/openmnk-run-command-inline-approval.png"

async function getChatPage(app) {
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    const windows = app.windows()
    for (const candidate of windows) {
      await candidate.waitForLoadState("domcontentloaded").catch(() => {})
      const textareaCount = await candidate.locator("textarea").count()
      if (textareaCount > 0) return candidate
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const snapshot = await Promise.all(
    app.windows().map(async (candidate, index) => ({
      index,
      url: candidate.url(),
      title: await candidate.title().catch(() => ""),
      textareaCount: await candidate.locator("textarea").count().catch(() => 0),
    }))
  )
  throw new Error(`Unable to find chat window: ${JSON.stringify(snapshot)}`)
}

async function main() {
  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
    env: {
      ...process.env,
      E2E_TEST: "1",
      HOTKEY_DISABLE_IOHOOK: "1",
      SANDBOX_URL: process.env.SANDBOX_URL || "http://localhost:8082",
    },
    timeout: 30_000,
  })

  let page

  try {
    page = await getChatPage(app)

    const input = page.getByRole("textbox")
    await input.waitFor({ state: "visible", timeout: 15_000 })
    await input.fill("/sandbox")
    await input.press("Enter")

    await page.getByText("Sandbox Terminal", { exact: true }).waitFor({
      state: "visible",
      timeout: 15_000,
    })
    await page.getByRole("button", { name: "Execute" }).click()

    await page.getByText("Command executed").waitFor({
      state: "visible",
      timeout: 15_000,
    })
    await page.getByText("sandbox-ok", { exact: true }).waitFor({
      state: "visible",
      timeout: 15_000,
    })

    const hasTerminalCard = await page
      .getByText("Sandbox Terminal", { exact: true })
      .isVisible()
    const hasExecutedState = await page
      .getByText("Command executed", { exact: true })
      .isVisible()
    const hasOutput = await page
      .getByText("sandbox-ok", { exact: true })
      .isVisible()
    console.log(
      JSON.stringify(
        {
          success: true,
          checks: {
            hasTerminalCard,
            hasExecutedState,
            hasOutput,
          },
        },
        null,
        2
      )
    )
  } catch (error) {
    if (page) {
      await page.screenshot({
        path: failureScreenshotPath,
        fullPage: true,
      })
      console.error(`Failure screenshot: ${failureScreenshotPath}`)
    }
    throw error
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

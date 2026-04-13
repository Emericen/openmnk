import * as pty from "@lydell/node-pty"

const SHELL = process.platform === "win32" ? "powershell.exe" : "bash"
const TIMEOUT = 30_000

export function run(cmd: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    let output = ""
    let done = false

    const proc = pty.spawn(SHELL, ["-c", cmd], {
      name: "xterm",
      cols: 120,
      rows: 40,
      cwd: process.env.HOME,
    })

    const finish = (result: string) => {
      if (done) return
      done = true
      resolve(result)
    }

    proc.onData((data) => {
      output += data
    })

    proc.onExit(() => {
      finish(output)
    })

    // Abort: kill the process immediately
    signal?.addEventListener("abort", () => {
      proc.kill()
      finish(output + "\n[Cancelled]")
    })

    // Timeout fallback
    setTimeout(() => {
      if (!done) {
        proc.kill()
        finish(output + "\n[Timeout after 30s]")
      }
    }, TIMEOUT)
  })
}

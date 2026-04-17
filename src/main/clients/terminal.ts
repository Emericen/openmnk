import { spawn } from "child_process"

const SHELL = process.platform === "win32" ? "powershell.exe" : "bash"
const TIMEOUT = 180_000
const SIGKILL_DELAY = 3_000

export function run(cmd: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    let output = ""
    let done = false

    const proc = spawn(SHELL, ["-c", cmd], {
      cwd: process.env.HOME,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    })

    const finish = (result: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString()
    })

    proc.stderr.on("data", (data: Buffer) => {
      output += data.toString()
    })

    proc.on("exit", () => {
      finish(output)
    })

    proc.on("error", (err) => {
      finish(output + `\n[Error: ${err.message}]`)
    })

    // Abort: kill the process tree
    signal?.addEventListener("abort", () => {
      try {
        process.kill(-proc.pid!, "SIGTERM")
      } catch {}
      finish(output + "\n[Cancelled]")
    })

    // Timeout: SIGTERM → wait → SIGKILL
    const timer = setTimeout(() => {
      if (done) return
      output += "\n[Timeout after 180s]"
      try {
        process.kill(-proc.pid!, "SIGTERM")
      } catch {}

      setTimeout(() => {
        if (done) return
        try {
          process.kill(-proc.pid!, "SIGKILL")
        } catch {}
        finish(output)
      }, SIGKILL_DELAY)
    }, TIMEOUT)
  })
}

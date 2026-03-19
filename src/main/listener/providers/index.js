import { createMacosIohookProvider } from "./macos.js"
import { createWindowsIohookProvider } from "./windows.js"

export async function createProvider(options = {}) {
  if (process.platform === "darwin") {
    return createMacosIohookProvider(options)
  }

  if (process.platform === "win32") {
    return createWindowsIohookProvider(options)
  }

  throw new Error(`Unsupported platform for global input provider: ${process.platform}`)
}

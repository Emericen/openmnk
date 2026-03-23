import { clipboard } from "electron"
import { keyboard, Key } from "@nut-tree-fork/nut-js"

keyboard.config.autoDelayMs = 3

type KeyboardControllerOptions = {
  keyDelay?: number
}

type KeyboardKey = Key | string

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createKeyboardController({
  keyDelay = 200,
}: KeyboardControllerOptions = {}) {
  const CMD = process.platform === "darwin" ? Key.LeftMeta : Key.LeftControl
  const TYPE_TEXT_METHOD = String(
    process.env.TYPE_TEXT_METHOD || ""
  ).toLowerCase()
  const keyMap: Record<string, KeyboardKey> = {
    cmd: CMD,
    command: CMD,
    ctrl: Key.LeftControl,
    control: Key.LeftControl,
    alt: Key.LeftAlt,
    option: Key.LeftAlt,
    shift: Key.LeftShift,
    win: Key.LeftMeta,
    super: Key.LeftMeta,
    meta: Key.LeftMeta,
    tab: Key.Tab,
    enter: Key.Return,
    return: Key.Return,
    space: Key.Space,
    backspace: Key.Backspace,
    delete: Key.Delete,
    escape: Key.Escape,
    esc: Key.Escape,
    up: Key.Up,
    down: Key.Down,
    left: Key.Left,
    right: Key.Right,
    arrowup: Key.Up,
    arrowdown: Key.Down,
    arrowleft: Key.Left,
    arrowright: Key.Right,
    page_up: Key.PageUp,
    page_down: Key.PageDown,
    home: Key.Home,
    end: Key.End,
    f1: Key.F1,
    f2: Key.F2,
    f3: Key.F3,
    f4: Key.F4,
    f5: Key.F5,
    f6: Key.F6,
    f7: Key.F7,
    f8: Key.F8,
    f9: Key.F9,
    f10: Key.F10,
    f11: Key.F11,
    f12: Key.F12,
    a: Key.A,
    b: Key.B,
    c: Key.C,
    d: Key.D,
    e: Key.E,
    f: Key.F,
    g: Key.G,
    h: Key.H,
    i: Key.I,
    j: Key.J,
    k: Key.K,
    l: Key.L,
    m: Key.M,
    n: Key.N,
    o: Key.O,
    p: Key.P,
    q: Key.Q,
    r: Key.R,
    s: Key.S,
    t: Key.T,
    u: Key.U,
    v: Key.V,
    w: Key.W,
    x: Key.X,
    y: Key.Y,
    z: Key.Z,
    0: Key.Num0,
    1: Key.Num1,
    2: Key.Num2,
    3: Key.Num3,
    4: Key.Num4,
    5: Key.Num5,
    6: Key.Num6,
    7: Key.Num7,
    8: Key.Num8,
    9: Key.Num9,
  }

  async function keyboardHotkey(keys: unknown[]): Promise<void> {
    await wait(keyDelay)
    const keyObjects: KeyboardKey[] = (keys || []).map((keyName) => {
      const lowerKey = String(keyName).toLowerCase()
      if (keyMap[lowerKey]) return keyMap[lowerKey]
      console.warn(`Unknown key: ${keyName}, attempting to use directly`)
      return String(keyName)
    })
    await (
      keyboard.type as unknown as (...keys: KeyboardKey[]) => Promise<unknown>
    )(...keyObjects)
    await wait(keyDelay)
  }

  async function typeText(text: unknown): Promise<void> {
    const value = String(text || "")
    await wait(keyDelay)
    if (TYPE_TEXT_METHOD === "clipboard") {
      clipboard.writeText(value)
      await keyboard.pressKey(CMD)
      await keyboard.type(Key.V)
      await keyboard.releaseKey(CMD)
      clipboard.clear()
    } else {
      await keyboard.type(value)
    }
    await wait(keyDelay)
  }

  async function pageDown(): Promise<void> {
    await wait(keyDelay)
    if (process.platform === "darwin") await keyboard.type("fn", "down")
    else await keyboard.type("page_down")
    await wait(keyDelay)
  }

  async function pageUp(): Promise<void> {
    await wait(keyDelay)
    if (process.platform === "darwin") await keyboard.type("fn", "up")
    else await keyboard.type("page_up")
    await wait(keyDelay)
  }

  async function tapShift(): Promise<void> {
    await keyboard.pressKey(Key.LeftShift)
    await keyboard.releaseKey(Key.LeftShift)
  }

  return {
    keyboardHotkey,
    typeText,
    pageDown,
    pageUp,
    tapShift,
  }
}

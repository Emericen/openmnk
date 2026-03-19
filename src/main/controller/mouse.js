import { mouse, Button } from "@nut-tree-fork/nut-js"

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createMouseController({ mouseDelay = 200 } = {}) {
  async function moveSmoothTo(point, { steps = 12, stepDelayMs = 12 } = {}) {
    const targetX = Math.round(Number(point?.x) || 0)
    const targetY = Math.round(Number(point?.y) || 0)
    const current = await mouse.getPosition()
    const startX = Math.round(Number(current?.x) || 0)
    const startY = Math.round(Number(current?.y) || 0)
    const totalSteps = Math.max(1, Number(steps) || 1)

    for (let i = 1; i <= totalSteps; i += 1) {
      const t = i / totalSteps
      await mouse.move({
        x: Math.round(startX + (targetX - startX) * t),
        y: Math.round(startY + (targetY - startY) * t)
      })
      await wait(stepDelayMs)
    }
  }

  async function moveTo(point) {
    await wait(mouseDelay)
    await mouse.move(point)
    await wait(mouseDelay)
  }

  async function previewPoint(point) {
    await wait(Math.max(20, Math.floor(mouseDelay / 4)))
    await moveSmoothTo(point)
    await wait(Math.max(20, Math.floor(mouseDelay / 4)))
  }

  async function previewDrag(start, end) {
    await wait(Math.max(20, Math.floor(mouseDelay / 4)))
    await moveSmoothTo(start)
    await wait(40)
    await moveSmoothTo(end)
    await wait(Math.max(20, Math.floor(mouseDelay / 4)))
  }

  async function leftClick(point) {
    await wait(mouseDelay)
    await mouse.move(point)
    await wait(mouseDelay)
    await mouse.leftClick()
    await wait(mouseDelay)
  }

  async function rightClick(point) {
    await wait(mouseDelay)
    await mouse.move(point)
    await wait(mouseDelay)
    await mouse.rightClick()
    await wait(mouseDelay)
  }

  async function doubleClick(point) {
    await wait(mouseDelay)
    await mouse.move(point)
    await wait(mouseDelay)
    await mouse.doubleClick(Button.LEFT)
    await wait(mouseDelay)
  }

  async function leftClickDrag(start, end) {
    await wait(mouseDelay)
    await mouse.move(start)
    await wait(mouseDelay)
    await mouse.pressButton(0)
    await wait(mouseDelay)
    await mouse.move(end)
    await wait(mouseDelay)
    await mouse.releaseButton(0)
  }

  async function scroll(point, steps) {
    await wait(mouseDelay)
    await mouse.move(point)
    await wait(mouseDelay)
    
    // Semantic scrolling: positive = reveal content below, negative = reveal content above
    // Handle platform differences (macOS natural scrolling vs Windows/Linux)
    const isMacOS = process.platform === "darwin"
    // nut-js scroll ticks are very fine-grained on both platforms.
    // Multiply so each LLM "step" scrolls a meaningful amount (~3 lines).
    const multiplier = 100
    const normalizedSteps = Math.round(Number(steps) || 0) * multiplier
    
    // nut-js sends raw wheel events. On all platforms:
    // scrollDown() = wheel down = page moves down (reveals content below)
    // scrollUp() = wheel up = page moves up (reveals content above)
    // macOS natural scrolling is handled at the OS level, not by us.
    if (normalizedSteps > 0) {
      await mouse.scrollDown(normalizedSteps)
    } else if (normalizedSteps < 0) {
      await mouse.scrollUp(Math.abs(normalizedSteps))
    }
  }

  async function nudgeMouse() {
    const { x, y } = await mouse.getPosition()
    await mouse.move({ x: x + 1, y })
    await mouse.move({ x: x - 1, y })
  }

  return {
    previewPoint,
    previewDrag,
    leftClick,
    rightClick,
    doubleClick,
    leftClickDrag,
    scroll,
    nudgeMouse
  }
}

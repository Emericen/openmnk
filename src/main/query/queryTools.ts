import { z } from "zod"

const CoordSchema = z.number().int().min(0).max(1000)

export const ToolArgsSchemas = {
  screenshot: z.object({}),
  left_click: z.object({ x: CoordSchema, y: CoordSchema }),
  right_click: z.object({ x: CoordSchema, y: CoordSchema }),
  double_click: z.object({ x: CoordSchema, y: CoordSchema }),
  type_text: z.object({ text: z.string() }),
  keyboard_hotkey: z.object({ keys: z.array(z.string()) }),
  scroll_down: z.object({ x: CoordSchema, y: CoordSchema, amount: z.number().int().min(1) }),
  scroll_up: z.object({ x: CoordSchema, y: CoordSchema, amount: z.number().int().min(1) }),
  drag: z.object({
    x1: CoordSchema,
    y1: CoordSchema,
    x2: CoordSchema,
    y2: CoordSchema,
  }),
  page_down: z.object({}),
  page_up: z.object({}),
} as const

export type ToolName = keyof typeof ToolArgsSchemas
export type PointArgs = z.infer<typeof ToolArgsSchemas.left_click>
export type TypeTextArgs = z.infer<typeof ToolArgsSchemas.type_text>
export type KeyboardHotkeyArgs = z.infer<typeof ToolArgsSchemas.keyboard_hotkey>
export type ScrollArgs = z.infer<typeof ToolArgsSchemas.scroll_down>
export type DragArgs = z.infer<typeof ToolArgsSchemas.drag>

export function parseToolArgs<T extends ToolName>(
  toolName: T,
  args: Record<string, unknown>
): z.infer<(typeof ToolArgsSchemas)[T]> {
  return ToolArgsSchemas[toolName].parse(args)
}

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "screenshot",
      description:
        "Take a screenshot of the user's screen. Use this to see the current state before taking any action. The screenshot is resized to 720px height for processing. Screenshots do not require user approval.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "left_click",
      description:
        "Perform a left mouse click at the specified coordinates on the latest screenshot. Use values 0-1000 where 0 is left/top edge and 1000 is right/bottom edge. Examples: 500,500 is center; 0,0 is top-left; 1000,1000 is bottom-right. Use for buttons, links, text fields (to focus), and UI elements. The mouse will smoothly move to the location before clicking.",
      parameters: {
        type: "object",
        properties: {
          x: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "X coordinate from 0 (left edge) to 1000 (right edge)",
          },
          y: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)",
          },
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "right_click",
      description:
        "Perform a right mouse click at the specified coordinates on the latest screenshot. Use values 0-1000 where 0 is left/top edge and 1000 is right/bottom edge. Used to open context menus and access secondary options.",
      parameters: {
        type: "object",
        properties: {
          x: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "X coordinate from 0 (left edge) to 1000 (right edge)",
          },
          y: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)",
          },
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "double_click",
      description:
        "Perform a double left-click at the specified coordinates on the latest screenshot. Use values 0-1000 where 0 is left/top edge and 1000 is right/bottom edge. Used to open files/folders or select words in text.",
      parameters: {
        type: "object",
        properties: {
          x: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "X coordinate from 0 (left edge) to 1000 (right edge)",
          },
          y: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)",
          },
        },
        required: ["x", "y"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description:
        "Type text at the current cursor location. Ensure focus is set by clicking the target field first - this tool types but does not click. Supports letters, numbers, symbols, and unicode. Text is typed character-by-character.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description:
              "Text to type at current cursor location. Ensure the field is focused by clicking it first.",
          },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "keyboard_hotkey",
      description:
        "Press multiple keys simultaneously as a keyboard shortcut. All keys are pressed together and released together. Examples: ['ctrl', 'c'] for copy, ['alt', 'tab'] to switch windows, ['cmd', 'v'] for paste on Mac. Platform shortcuts: 'cmd' maps to Cmd on Mac and Ctrl on Windows. Use 'win' to press the Windows key (e.g. ['win'] to open Start menu). Valid keys: cmd, ctrl, alt, shift, win, tab, enter, escape, arrows, page_up, page_down, home, end, f1-f12, a-z, 0-9.",
      parameters: {
        type: "object",
        properties: {
          keys: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "cmd",
                "ctrl",
                "alt",
                "shift",
                "win",
                "tab",
                "enter",
                "return",
                "space",
                "backspace",
                "delete",
                "escape",
                "esc",
                "up",
                "down",
                "left",
                "right",
                "arrowup",
                "arrowdown",
                "arrowleft",
                "arrowright",
                "page_up",
                "page_down",
                "home",
                "end",
                "f1",
                "f2",
                "f3",
                "f4",
                "f5",
                "f6",
                "f7",
                "f8",
                "f9",
                "f10",
                "f11",
                "f12",
                "a",
                "b",
                "c",
                "d",
                "e",
                "f",
                "g",
                "h",
                "i",
                "j",
                "k",
                "l",
                "m",
                "n",
                "o",
                "p",
                "q",
                "r",
                "s",
                "t",
                "u",
                "v",
                "w",
                "x",
                "y",
                "z",
                "0",
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
              ],
            },
            description: "Array of keys to press simultaneously.",
          },
        },
        required: ["keys"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll_down",
      description:
        "Scroll down to reveal content BELOW the current view. This WILL scroll down regardless of operating system (macOS, Windows, Linux) — platform-specific scroll direction settings are handled automatically. Each unit is one scroll wheel step (~3 lines of text). Must position mouse in scrollable area first (use x, y coordinates). Use this when you want to see content further down the page.",
      parameters: {
        type: "object",
        properties: {
          x: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "X coordinate from 0 (left edge) to 1000 (right edge)",
          },
          y: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)",
          },
          amount: {
            type: "integer",
            minimum: 1,
            description:
              "Scroll amount in wheel steps (positive integer). Each step scrolls ~3 lines.",
          },
        },
        required: ["x", "y", "amount"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll_up",
      description:
        "Scroll up to reveal content ABOVE the current view. This WILL scroll up regardless of operating system (macOS, Windows, Linux) — platform-specific scroll direction settings are handled automatically. Each unit is one scroll wheel step (~3 lines of text). Must position mouse in scrollable area first (use x, y coordinates). Use this when you want to see content further up the page.",
      parameters: {
        type: "object",
        properties: {
          x: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "X coordinate from 0 (left edge) to 1000 (right edge)",
          },
          y: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description: "Y coordinate from 0 (top edge) to 1000 (bottom edge)",
          },
          amount: {
            type: "integer",
            minimum: 1,
            description:
              "Scroll amount in wheel steps (positive integer). Each step scrolls ~3 lines.",
          },
        },
        required: ["x", "y", "amount"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drag",
      description:
        "Click and drag from one point to another. Use for moving windows, selecting ranges, dragging files, resizing panes, or slider interactions. Coordinates are based on the latest screenshot, scaled 0-1000.",
      parameters: {
        type: "object",
        properties: {
          x1: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description:
              "Start X coordinate from 0 (left edge) to 1000 (right edge)",
          },
          y1: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description:
              "Start Y coordinate from 0 (top edge) to 1000 (bottom edge)",
          },
          x2: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description:
              "End X coordinate from 0 (left edge) to 1000 (right edge)",
          },
          y2: {
            type: "integer",
            minimum: 0,
            maximum: 1000,
            description:
              "End Y coordinate from 0 (top edge) to 1000 (bottom edge)",
          },
        },
        required: ["x1", "y1", "x2", "y2"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "page_down",
      description:
        "Press the Page Down key to scroll down by one full page/screen.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "page_up",
      description:
        "Press the Page Up key to scroll up by one full page/screen.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
] as const

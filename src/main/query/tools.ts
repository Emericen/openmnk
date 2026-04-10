export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description:
        "Execute a shell command. Use for file operations, running scripts, osascript/JXA for GUI control, screenshots via screencapture, etc.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "What this command does (shown to user)",
          },
          cmd: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["description", "cmd"],
      },
    },
  },
]

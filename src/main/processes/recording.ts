// Recording process — capture window removed in clean foundation refactor.
// This module is a stub until recording is rebuilt on top of run_command.
export function createRecordingProcess({ ui: _ui }: { ui?: unknown }) {
  return {
    isRecording() {
      return false
    },
    async start() {
      return { success: false as const, error: "Recording not available" }
    },
    async stop() {
      return { success: false as const, error: "Recording not available" }
    },
  }
}

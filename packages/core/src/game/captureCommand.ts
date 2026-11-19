export type CaptureCommandEntry = string | { readonly name: string; readonly input?: unknown };

/**
 * The input a capture command named by a bare string runs with: a neutral look, so a command that
 * reads an aim or heading gets one.
 */
export const CAPTURE_COMMAND_INPUT = { yaw: 0, pitch: 0, aim: { yaw: 0, pitch: 0 } } as const;

/**
 * The command name and input one capture entry runs with — what the dev runner's capture mode, the agent
 * bridge's `capture_run` and a headless start all dispatch, so a game starts the same way in each.
 */
export function captureCommand(entry: CaptureCommandEntry): { name: string; input: unknown } {
  if (typeof entry === "string") return { name: entry, input: CAPTURE_COMMAND_INPUT };
  return { name: entry.name, input: entry.input ?? CAPTURE_COMMAND_INPUT };
}

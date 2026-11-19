export const SHELL_MOVEMENT_ACTIONS = ["moveForward", "moveBack", "moveLeft", "moveRight", "jump"] as const;

/** @internal */
export function shellDrivesPlayerPose(input: Record<string, unknown> | undefined): boolean {
  const bound = input ?? {};
  return SHELL_MOVEMENT_ACTIONS.some((action) => action in bound);
}

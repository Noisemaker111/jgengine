/** Movement action names the shell drives via the walk controller. @internal */
export const SHELL_MOVEMENT_ACTIONS = ["moveForward", "moveBack", "moveLeft", "moveRight", "jump"] as const;

/**
 * True when the game's input map binds any walk-controller action — the shell owns pose
 * for those games. Games that omit all five drive pose themselves.
 * @internal
 */
export function shellDrivesPlayerPose(input: Record<string, unknown> | undefined): boolean {
  const bound = input ?? {};
  return SHELL_MOVEMENT_ACTIONS.some((action) => action in bound);
}
